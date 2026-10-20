export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus, PinpointStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

// Eine Bearbeitung ist maximal zwei Minuten ohne Lebenszeichen reserviert.
const LEASE_MS = 120_000;

type RouteContext = { params: Promise<{ id: string; pid: string }> };

type PinpointRecord = {
  id: string;
  status: PinpointStatus;
  claimedByUserId: string | null;
  claimExpiresAt: Date | null;
};

async function authorize(context: RouteContext) {
  const user = await getCurrentUserWithTeams();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  }

  const { id, pid } = await context.params;
  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      operationDayTeam: {
        select: {
          pilotId: true,
          members: { select: { userId: true } },
        },
      },
    },
  });
  if (!order) {
    return { ok: false as const, response: NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 }) };
  }

  const allowed = Boolean(
    user.isAdmin ||
    order.operationDayTeam?.pilotId === user.id ||
    order.operationDayTeam?.members.some((member) => member.userId === user.id)
  );
  if (!allowed) {
    return { ok: false as const, response: NextResponse.json({ error: "Keine Berechtigung für diesen PinPoint." }, { status: 403 }) };
  }

  const pinpoint = await db.orderPinpoint.findFirst({
    where: { id: pid, orderId: id },
    select: { id: true, status: true, claimedByUserId: true, claimExpiresAt: true },
  });
  if (!pinpoint) {
    return { ok: false as const, response: NextResponse.json({ error: "PinPoint nicht gefunden." }, { status: 404 }) };
  }

  return {
    ok: true as const,
    value: { userId: user.id, order, pinpoint: pinpoint as PinpointRecord, canCorrect: Boolean(user.isAdmin || order.operationDayTeam?.pilotId === user.id) },
  };
}

async function getState(orderId: string, pinpointId: string, myUserId: string) {
  const pinpoint = await db.orderPinpoint.findFirst({
    where: { id: pinpointId, orderId },
    select: {
      status: true,
      claimedByUserId: true,
      claimExpiresAt: true,
      note: true,
      updatedAt: true,
      rehkitzeGesichert: true,
      rehkitzeAbgesprungen: true,
      sonstigesWildGesichert: true,
      sonstigesWildAbgesprungen: true,
      maulwurfhuegelFehlstelle: true,
    },
  });
  if (!pinpoint) return null;

  const active = Boolean(
    pinpoint.status !== PinpointStatus.ERLEDIGT &&
    pinpoint.claimedByUserId &&
    pinpoint.claimExpiresAt &&
    pinpoint.claimExpiresAt > new Date()
  );
  const lockOwnerId = active ? pinpoint.claimedByUserId : null;
  const editor = lockOwnerId
    ? await db.user.findUnique({
        where: { id: lockOwnerId },
        select: { firstName: true, lastName: true },
      })
    : null;

  return {
    status: pinpoint.status,
    revision: pinpoint.updatedAt.toISOString(),
    note: pinpoint.note,
    locked: active,
    claimedByMe: active && lockOwnerId === myUserId,
    claimedByName: active ? (editor ? `${editor.firstName} ${editor.lastName}`.trim() : "Ein Teammitglied") : null,
    claimExpiresAt: active ? pinpoint.claimExpiresAt : null,
    totals: pinpoint.status === PinpointStatus.ERLEDIGT ? {
      rehkitzeGesichert: pinpoint.rehkitzeGesichert,
      rehkitzeAbgesprungen: pinpoint.rehkitzeAbgesprungen,
      sonstigesWildGesichert: pinpoint.sonstigesWildGesichert,
      sonstigesWildAbgesprungen: pinpoint.sonstigesWildAbgesprungen,
      maulwurfhuegelFehlstelle: pinpoint.maulwurfhuegelFehlstelle,
    } : null,
  };
}

function validateCount(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 6) {
    throw new Error(`${name}: Nur ganze Zahlen von 0 bis 6 sind erlaubt.`);
  }
  return value;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authorize(context);
    if (!auth.ok) return auth.response;
    const { userId, order, pinpoint } = auth.value;
    const state = await getState(order.id, pinpoint.id, userId);
    if (req.nextUrl.searchParams.get("history") === "1") {
      const canCorrect = auth.value.canCorrect;
      if (!canCorrect) {
        return NextResponse.json({ error: "Korrekturverlauf nur fuer Pilot und Admin." }, { status: 403 });
      }
      const corrections = await db.pinpointCorrection.findMany({
        where: { pinpointId: pinpoint.id },
        orderBy: { correctedAt: "desc" },
        take: 20,
        include: { correctedBy: { select: { firstName: true, lastName: true } } },
      });
      return NextResponse.json({
        ...state,
        corrections: corrections.map((item) => ({
          id: item.id,
          correctedAt: item.correctedAt,
          correctedByName: `${item.correctedBy.firstName} ${item.correctedBy.lastName}`.trim(),
          reason: item.reason,
          beforeData: item.beforeData,
          afterData: item.afterData,
        })),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pinpointstatus laden:", error);
    return NextResponse.json({ error: "PinPoint-Status konnte nicht geladen werden." }, { status: 500 });
  }
}

// Aktion claim = Bearbeitung übernehmen, heartbeat = verlängern,
// release = eigene Bearbeitung abbrechen.
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authorize(context);
    if (!auth.ok) return auth.response;
    const { userId, order, pinpoint } = auth.value;
    const payload = await req.json().catch(() => ({}));
    const action: unknown = payload?.action;
    const now = new Date();

    if (action === "claim") {
      if (order.status === OrderStatus.ERLEDIGT) {
        return NextResponse.json({ error: "Dieser Auftrag ist erledigt." }, { status: 409 });
      }
      // Das bedingte UPDATE ist atomar. Eine einzige Person gewinnt den Anspruch.
      const result = await db.orderPinpoint.updateMany({
        where: {
          id: pinpoint.id,
          orderId: order.id,
          status: { not: PinpointStatus.ERLEDIGT },
          OR: [
            { claimedByUserId: null },
            { claimExpiresAt: null },
            { claimExpiresAt: { lte: now } },
            { claimedByUserId: userId },
          ],
        },
        data: {
          claimedByUserId: userId,
          claimExpiresAt: new Date(now.getTime() + LEASE_MS),
          status: PinpointStatus.ERREICHT,
        },
      });
      if (result.count !== 1) {
        const state = await getState(order.id, pinpoint.id, userId);
        return NextResponse.json({
          error: state?.status === PinpointStatus.ERLEDIGT
            ? "PinPoint wurde bereits erledigt. Die Wildzahlen sind gespeichert."
            : `${state?.claimedByName || "Ein anderes Teammitglied"} bearbeitet diesen PinPoint bereits.`,
          ...state,
        }, { status: 409 });
      }
      // Das Erreichensdatum beim erneuten Claim nicht verändern.
      await db.orderPinpoint.updateMany({
        where: { id: pinpoint.id, orderId: order.id, reachedAt: null, claimedByUserId: userId },
        data: { reachedAt: now },
      });
      return NextResponse.json({ success: true, ...(await getState(order.id, pinpoint.id, userId)) });
    }

    if (action === "heartbeat") {
      const result = await db.orderPinpoint.updateMany({
        where: {
          id: pinpoint.id,
          orderId: order.id,
          status: { not: PinpointStatus.ERLEDIGT },
          claimedByUserId: userId,
          claimExpiresAt: { gt: now },
        },
        data: { claimExpiresAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (result.count !== 1) {
        return NextResponse.json({ error: "Bearbeitung abgelaufen. Bitte PinPoint erneut übernehmen.", ...(await getState(order.id, pinpoint.id, userId)) }, { status: 409 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "release") {
      await db.orderPinpoint.updateMany({
        where: { id: pinpoint.id, orderId: order.id, claimedByUserId: userId, status: { not: PinpointStatus.ERLEDIGT } },
        data: { claimedByUserId: null, claimExpiresAt: null },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (error) {
    console.error("PinPoint sperren:", error);
    return NextResponse.json({ error: "Bearbeitung konnte nicht gestartet werden." }, { status: 500 });
  }
}

// Wilddaten werden nur ein einziges Mal verbindlich gespeichert. Atomare WHERE-
// Bedingung verhindert gleichzeitig eintreffende oder wiederholte Speicherungen.
// Nur der eingeteilte Pilot oder ein Admin darf eine erledigte Meldung korrigieren.
// Korrekturen werden mit altem und neuem Stand protokolliert.
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authorize(context);
    if (!auth.ok) return auth.response;
    const { userId, order, pinpoint, canCorrect } = auth.value;
    const body = await req.json().catch(() => ({}));
    if (body?.status !== PinpointStatus.ERLEDIGT) {
      return NextResponse.json({ error: "Wildmeldungen koennen nur mit Status ERLEDIGT gespeichert werden." }, { status: 400 });
    }

    const counts = {
      rehkitzeGesichert: validateCount(body.rehkitzeGesichert, "Rehkitze gesichert"),
      rehkitzeAbgesprungen: validateCount(body.rehkitzeAbgesprungen, "Rehkitze abgesprungen"),
      sonstigesWildGesichert: validateCount(body.sonstigesWildGesichert, "Sonstiges Wild gesichert"),
      sonstigesWildAbgesprungen: validateCount(body.sonstigesWildAbgesprungen, "Sonstiges Wild abgesprungen"),
      maulwurfhuegelFehlstelle: validateCount(body.maulwurfhuegelFehlstelle, "Maulwurfhuegel/Fehlstelle"),
    };
    const note = body.note == null ? null : String(body.note).trim().slice(0, 10000);

    if (body?.action === "correct") {
      if (!canCorrect) {
        return NextResponse.json({ error: "Nur der eingeteilte Pilot oder ein Administrator darf Meldungen korrigieren." }, { status: 403 });
      }
      const reason = String(body.reason || "").trim();
      if (reason.length < 5 || reason.length > 1000) {
        return NextResponse.json({ error: "Bitte den Grund der Korrektur angeben (5 bis 1000 Zeichen)." }, { status: 400 });
      }
      const expectedUpdatedAt = String(body.expectedUpdatedAt || "");
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        return NextResponse.json({ error: "Aktuellen Datenstand erneut laden, bevor du korrigierst." }, { status: 400 });
      }

      // In einer Transaktion mit Versionsvergleich: Eine zwischenzeitlich
      // veraenderte Meldung kann nicht unbemerkt ueberschrieben werden.
      const corrected = await db.$transaction(async (tx) => {
        const before = await tx.orderPinpoint.findFirst({
          where: { id: pinpoint.id, orderId: order.id },
        });
        if (!before || before.status !== PinpointStatus.ERLEDIGT) {
          throw new Error("CONFLICT: Diese Meldung ist nicht mehr abgeschlossen.");
        }
        if (before.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new Error("CONFLICT: Die Meldung wurde zwischenzeitlich veraendert. Bitte neu laden.");
        }
        const previous = {
          rehkitzeGesichert: before.rehkitzeGesichert,
          rehkitzeAbgesprungen: before.rehkitzeAbgesprungen,
          sonstigesWildGesichert: before.sonstigesWildGesichert,
          sonstigesWildAbgesprungen: before.sonstigesWildAbgesprungen,
          maulwurfhuegelFehlstelle: before.maulwurfhuegelFehlstelle,
          note: before.note,
        };
        const next = { ...counts, note };
        if (JSON.stringify(previous) === JSON.stringify(next)) {
          throw new Error("UNCHANGED: Es wurden keine Werte veraendert.");
        }
        const changed = await tx.orderPinpoint.updateMany({
          where: {
            id: pinpoint.id,
            orderId: order.id,
            status: PinpointStatus.ERLEDIGT,
            updatedAt: before.updatedAt,
          },
          data: { ...counts, note },
        });
        if (changed.count !== 1) {
          throw new Error("CONFLICT: Die Meldung wurde bereits von jemand anderem korrigiert.");
        }
        await tx.pinpointCorrection.create({
          data: {
            pinpointId: pinpoint.id,
            correctedByUserId: userId,
            reason,
            beforeData: previous,
            afterData: next,
          },
        });
        return tx.orderPinpoint.findUniqueOrThrow({ where: { id: pinpoint.id } });
      });
      return NextResponse.json({ success: true, corrected: true, pinpoint: corrected });
    }

    // Erst-Erfassung: nur der exklusive Bearbeiter kann abschliessen.
    if (order.status === OrderStatus.ERLEDIGT) {
      return NextResponse.json({ error: "Auftrag bereits erledigt." }, { status: 409 });
    }
    const now = new Date();
    const result = await db.orderPinpoint.updateMany({
      where: {
        id: pinpoint.id,
        orderId: order.id,
        status: { not: PinpointStatus.ERLEDIGT },
        claimedByUserId: userId,
        claimExpiresAt: { gt: now },
      },
      data: {
        ...counts,
        note,
        status: PinpointStatus.ERLEDIGT,
        claimedByUserId: null,
        claimExpiresAt: null,
        finalizedAt: now,
        finalizedByUserId: userId,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json({
        error: "PinPoint ist bereits erledigt oder die Bearbeitung ist abgelaufen. Es wurde nichts doppelt gespeichert.",
        ...(await getState(order.id, pinpoint.id, userId)),
      }, { status: 409 });
    }
    const updated = await db.orderPinpoint.findUnique({ where: { id: pinpoint.id } });
    return NextResponse.json(updated);
  } catch (error: any) {
    const message = error?.message || "PinPoint konnte nicht gespeichert werden.";
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9).trim() }, { status: 409 });
    }
    if (message.startsWith("UNCHANGED:")) {
      return NextResponse.json({ error: message.slice(10).trim() }, { status: 400 });
    }
    console.error("PinPoint speichern/korrigieren:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
