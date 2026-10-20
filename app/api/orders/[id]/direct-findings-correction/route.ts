export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, OperationDayStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

type RouteContext = { params: Promise<{ id: string }> };

const COUNT_KEYS = [
  "rehkitzeGesichert",
  "rehkitzeAbgesprungen",
  "sonstigesWildGesichert",
  "sonstigesWildAbgesprungen",
  "maulwurfhuegelFehlstelle",
] as const;

type CountKey = (typeof COUNT_KEYS)[number];
type Counts = Record<CountKey, number>;

function getCounts(data: Counts): Counts {
  return {
    rehkitzeGesichert: data.rehkitzeGesichert,
    rehkitzeAbgesprungen: data.rehkitzeAbgesprungen,
    sonstigesWildGesichert: data.sonstigesWildGesichert,
    sonstigesWildAbgesprungen: data.sonstigesWildAbgesprungen,
    maulwurfhuegelFehlstelle: data.maulwurfhuegelFehlstelle,
  };
}

function parseCounts(input: unknown): Counts {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Wildzahlen fehlen.");
  }
  const raw = input as Record<string, unknown>;
  const result = {} as Counts;
  for (const key of COUNT_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 6) {
      throw new Error(`${key}: nur ganze Zahlen zwischen 0 und 6 erlaubt.`);
    }
    result[key] = value;
  }
  return result;
}

async function getAuthorizedOrder(orderId: string) {
  const user = await getCurrentUserWithTeams();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      title: true,
      orderCode: true,
      status: true,
      updatedAt: true,
      rehkitzeGesichert: true,
      rehkitzeAbgesprungen: true,
      sonstigesWildGesichert: true,
      sonstigesWildAbgesprungen: true,
      maulwurfhuegelFehlstelle: true,
      operationDay: { select: { status: true } },
      operationDayTeam: {
        select: {
          pilotId: true,
          operationDay: { select: { status: true } },
        },
      },
    },
  });

  if (!order) {
    return { ok: false as const, response: NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 }) };
  }

  const isPilotOfOrder = order.operationDayTeam?.pilotId === user.id;
  if (!user.isAdmin && !isPilotOfOrder) {
    return { ok: false as const, response: NextResponse.json({ error: "Nur der eingeteilte Pilot oder ein Admin darf Direktfunde korrigieren." }, { status: 403 }) };
  }

  const dayStatus = order.operationDay?.status ?? order.operationDayTeam?.operationDay.status ?? null;
  const dayClosed = order.operationDay?.status === OperationDayStatus.ABGESCHLOSSEN ||
    order.operationDayTeam?.operationDay.status === OperationDayStatus.ABGESCHLOSSEN;
  const canCorrect = user.isAdmin || (isPilotOfOrder && dayStatus !== null && !dayClosed);

  return { ok: true as const, user, order, canCorrect, dayClosed, dayStatus };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await getAuthorizedOrder(id);
    if (!result.ok) return result.response;

    const { order, canCorrect, dayClosed } = result;
    const changes = await db.directFindingsCorrection.findMany({
      where: { orderId: id },
      take: 50,
      orderBy: { correctedAt: "desc" },
      include: {
        correctedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({
      orderId: order.id,
      orderLabel: order.orderCode || order.title,
      status: order.status,
      canCorrect: canCorrect && order.status === OrderStatus.ERLEDIGT,
      dayClosed,
      revision: order.updatedAt.toISOString(),
      counts: getCounts(order),
      corrections: changes.map((change) => ({
        id: change.id,
        correctedAt: change.correctedAt,
        correctedByName: `${change.correctedBy.firstName} ${change.correctedBy.lastName}`.trim(),
        reason: change.reason,
        beforeData: change.beforeData,
        afterData: change.afterData,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Direktfunde Korrektur laden:", error);
    return NextResponse.json({ error: "Direktfunde konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await getAuthorizedOrder(id);
    if (!auth.ok) return auth.response;

    const { order, user, canCorrect } = auth;
    if (!canCorrect) {
      return NextResponse.json({ error: "Der Einsatztag ist abgeschlossen (oder nicht zugeordnet). Jetzt darf nur noch ein Admin korrigieren." }, { status: 403 });
    }
    if (order.status !== OrderStatus.ERLEDIGT) {
      return NextResponse.json({ error: "Eine protokollierte Korrektur ist erst nach dem Auftragsabschluss möglich." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) {
      return NextResponse.json({ error: "Bitte einen Korrekturgrund mit 5 bis 500 Zeichen eingeben." }, { status: 400 });
    }
    if (typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
      return NextResponse.json({ error: "Ungültiger Änderungsstand. Bitte die Daten neu laden." }, { status: 400 });
    }

    const newCounts = parseCounts(body.counts);
    const before = getCounts(order);
    if (COUNT_KEYS.every((key) => newCounts[key] === before[key])) {
      return NextResponse.json({ error: "Es wurden keine Wildzahlen geändert." }, { status: 400 });
    }

    // Gleichzeitige Korrekturen abfangen: nur exakt den zuletzt gelesenen
    // Datenstand überschreiben. Aktualisierung und Audit laufen in einer Transaktion.
    const expectedRevision = new Date(body.expectedUpdatedAt);
    const nextRevision = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
    const outcome = await db.$transaction(async (tx) => {
      // Die Tagesfreigabe wird auch innerhalb der Transaktion erneut geprüft.
      if (!user.isAdmin) {
        const currentDayState = await tx.order.findUnique({
          where: { id },
          select: {
            operationDay: { select: { status: true } },
            operationDayTeam: {
              select: {
                pilotId: true,
                operationDay: { select: { status: true } },
              },
            },
          },
        });
        if (!currentDayState || currentDayState.operationDayTeam?.pilotId !== user.id ||
          currentDayState.operationDay?.status === OperationDayStatus.ABGESCHLOSSEN ||
          currentDayState.operationDayTeam?.operationDay.status === OperationDayStatus.ABGESCHLOSSEN) {
          return "forbidden" as const;
        }
      }
      const updated = await tx.order.updateMany({
        where: {
          id,
          status: OrderStatus.ERLEDIGT,
          updatedAt: expectedRevision,
        },
        data: { ...newCounts, updatedAt: nextRevision },
      });
      if (updated.count !== 1) return false;

      await tx.directFindingsCorrection.create({
        data: {
          orderId: id,
          correctedByUserId: user.id,
          reason,
          beforeData: before,
          afterData: newCounts,
        },
      });
      return true;
    });

    if (outcome === "forbidden") {
      return NextResponse.json({ error: "Der Einsatztag ist abgeschlossen oder der Pilot ist nicht mehr zugeordnet. Nur ein Admin darf korrigieren." }, { status: 403 });
    }
    if (!outcome) {
      return NextResponse.json({ error: "Die Wildzahlen wurden zwischenzeitlich geändert. Bitte das Fenster schließen und neu öffnen." }, { status: 409 });
    }

    return NextResponse.json({ success: true, counts: newCounts, revision: nextRevision.toISOString() });
  } catch (error: unknown) {
    console.error("Direktfunde korrigieren:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Korrektur fehlgeschlagen." }, { status: 400 });
  }
}
