export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeGpsTestApi } from "@/lib/gps-test-access";

// Kennzeichnungen verhindern, dass ein GPS-Test versehentlich normale
// Aufträge, Teams oder Einsatztage überschreibt bzw. löscht.
const TEST_TEAM_PREFIX = "GPS-TEST ";
const TEST_TEAM_NOTE = "[GPS_TEST_TEAM]";
const TEST_ORDER_NOTE = "[GPS_TEST_ORDER] Automatisch angelegter GPS-Testauftrag. Nicht für echte Einsätze verwenden.";
const TEST_ORDER_TITLE = "🧪 GPS-Test";
const TEST_DAY_NOTE = "[GPS_TEST_DAY] Automatisch für den GPS-Testmodus angelegt.";

function todayInGermany() {
  const pieces = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => pieces.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateOnlyUtc(dateText: string) {
  return new Date(`${dateText}T00:00:00.000Z`);
}

function personName(person: { firstName: string; lastName: string } | null | undefined) {
  return person ? `${person.firstName} ${person.lastName}`.trim() : "-";
}

function errorResponse(error: unknown, fallback: string) {
  console.error("GPS-Admin-Testmodus:", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

async function listTests() {
  const teams = await db.operationDayTeam.findMany({
    where: {
      note: TEST_TEAM_NOTE,
      team: { name: { startsWith: TEST_TEAM_PREFIX } },
    },
    include: {
      operationDay: { select: { date: true } },
      team: { select: { name: true } },
      pilot: { select: { firstName: true, lastName: true } },
      members: { include: { user: { select: { firstName: true, lastName: true } } } },
      orders: { select: { id: true, isDemo: true, notes: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return teams.map((team) => ({
    id: team.id,
    date: team.operationDay.date.toISOString().slice(0, 10),
    teamName: team.team.name,
    pilot: personName(team.pilot),
    searchers: team.members.map((member) => personName(member.user)),
    testOrders: team.orders.filter((order) => order.isDemo && order.title.startsWith(TEST_ORDER_TITLE)).length,
  }));
}

export async function GET(req: NextRequest) {
  const auth = await authorizeGpsTestApi(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const [users, demoOrders, tests] = await Promise.all([
      db.user.findMany({
        where: { isApproved: true },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      db.order.findMany({
        where: { isDemo: true },
        select: {
          id: true,
          title: true,
          orderCode: true,
          field: { select: { name: true, displayName: true } },
          pinpoints: { select: { latitude: true, longitude: true }, orderBy: { sequenceNumber: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      listTests(),
    ]);

    return NextResponse.json({
      today: todayInGermany(),
      pilots: users.filter((user) => user.role === "PILOT"),
      searchers: users.filter((user) => user.role === "SUCHER"),
      demoOrders: demoOrders.map((order) => ({
        id: order.id,
        label: [order.orderCode || order.title, order.field.displayName || order.field.name]
          .filter(Boolean)
          .join(" · "),
        pinpoint: order.pinpoints[0] || null,
      })),
      tests,
    });
  } catch (error) {
    return errorResponse(error, "Testdaten konnten nicht geladen werden.");
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeGpsTestApi(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const input = await req.json().catch(() => ({}));
    const pilotId = String(input.pilotId || "").trim();
    const demoOrderId = String(input.demoOrderId || "").trim();
    const searcherIds = Array.isArray(input.searcherIds)
      ? [...new Set<string>(input.searcherIds.filter((id: unknown): id is string => typeof id === "string" && !!id.trim()).map((id: string) => id.trim()))]
      : [];
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);

    if (!pilotId || !demoOrderId || searcherIds.length < 1 || searcherIds.length > 6) {
      return NextResponse.json(
        { error: "Bitte einen Piloten, einen Demoauftrag und 1 bis 6 Sucher auswählen." },
        { status: 400 }
      );
    }
    if (searcherIds.includes(pilotId)) {
      return NextResponse.json({ error: "Der Pilot darf nicht zugleich als Sucher ausgewählt sein." }, { status: 400 });
    }
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return NextResponse.json(
        { error: "Bitte gültige Koordinaten für den Test-Pinpoint eingeben oder per GPS übernehmen." },
        { status: 400 }
      );
    }

    const today = todayInGermany();
    const date = dateOnlyUtc(today);
    const userIds = [pilotId, ...searcherIds];
    const [testExists, users, template, day, conflictingTeams] = await Promise.all([
      db.operationDayTeam.findFirst({
        where: { operationDay: { date }, note: TEST_TEAM_NOTE },
        select: { id: true },
      }),
      db.user.findMany({
        where: { id: { in: userIds }, isApproved: true },
        select: { id: true, role: true },
      }),
      db.order.findFirst({
        where: { id: demoOrderId, isDemo: true },
        select: { id: true, ownerId: true, fieldId: true, title: true, orderCode: true },
      }),
      db.operationDay.findUnique({ where: { date }, select: { id: true, status: true } }),
      db.operationDayTeam.findMany({
        where: {
          operationDay: { date },
          OR: [
            { pilotId: { in: userIds } },
            { members: { some: { userId: { in: userIds } } } },
          ],
        },
        select: { id: true },
      }),
    ]);

    if (testExists) {
      return NextResponse.json(
        { error: "Für heute existiert bereits ein GPS-Test. Bitte den vorhandenen Test zuerst beenden." },
        { status: 409 }
      );
    }
    if (users.length !== userIds.length ||
        users.find((user) => user.id === pilotId)?.role !== "PILOT" ||
        searcherIds.some((id) => users.find((user) => user.id === id)?.role !== "SUCHER")) {
      return NextResponse.json({ error: "Mindestens ein ausgewählter Helfer ist nicht zugelassen oder hat die falsche Rolle." }, { status: 400 });
    }
    if (!template) {
      return NextResponse.json({ error: "Demoauftrag nicht gefunden. Bitte zuerst einen Demoauftrag anlegen." }, { status: 404 });
    }
    if (day?.status === "ABGESCHLOSSEN") {
      return NextResponse.json({ error: "Der heutige Einsatztag ist bereits abgeschlossen." }, { status: 409 });
    }
    if (conflictingTeams.length) {
      return NextResponse.json(
        { error: "Mindestens einer dieser Helfer ist heute bereits in einem Team eingeteilt. Bitte andere Testhelfer auswählen." },
        { status: 409 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      // Eigener Testtag nur falls noch keiner existiert. Echte Einsatztage werden nicht verändert.
      const operationDay = day
        ? { id: day.id }
        : await tx.operationDay.create({
            data: { date, status: "AKTIV", note: TEST_DAY_NOTE },
            select: { id: true },
          });

      // Mit inaktivem Stammdaten-Team taucht das Testteam nicht in der normalen
      // Auswahl aktiver Standardteams auf, bleibt aber für die GPS-API zugeordnet.
      const team = await tx.team.create({
        data: { name: `${TEST_TEAM_PREFIX}${today}`, isActive: false },
        select: { id: true },
      });
      const dayTeam = await tx.operationDayTeam.create({
        data: {
          operationDayId: operationDay.id,
          teamId: team.id,
          pilotId,
          note: TEST_TEAM_NOTE,
          members: { create: searcherIds.map((userId) => ({ userId })) },
        },
        select: { id: true },
      });

      const testOrder = await tx.order.create({
        data: {
          title: `${TEST_ORDER_TITLE} (${template.orderCode || template.title})`,
          status: "IN_ARBEIT",
          isDemo: true,
          notes: TEST_ORDER_NOTE,
          ownerId: template.ownerId,
          fieldId: template.fieldId,
          mowingDate: date,
          executionDate: date,
          operationDayId: operationDay.id,
          operationDayTeamId: dayTeam.id,
          pinpoints: {
            create: [{
              rawQrText: `GPS_TEST:${latitude.toFixed(7)},${longitude.toFixed(7)}`,
              latitude,
              longitude,
              sequenceNumber: 1,
              status: "OFFEN",
            }],
          },
        },
        select: { id: true },
      });

      return { operationDayTeamId: dayTeam.id, testOrderId: testOrder.id };
    });

    return NextResponse.json({
      success: true,
      ...result,
      date: today,
      message: "GPS-Testteam und Demoauftrag für heute angelegt. Es wurden keine Benachrichtigungen verschickt.",
    });
  } catch (error) {
    return errorResponse(error, "GPS-Test konnte nicht angelegt werden.");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeGpsTestApi(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const input = await req.json().catch(() => ({}));
    const id = String(input.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Testteam-ID fehlt." }, { status: 400 });
    }

    const test = await db.operationDayTeam.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        operationDay: { select: { id: true, date: true, note: true } },
        members: { select: { userId: true } },
        orders: { select: { id: true, isDemo: true, notes: true, title: true } },
      },
    });
    if (!test || test.note !== TEST_TEAM_NOTE || !test.team.name.startsWith(TEST_TEAM_PREFIX)) {
      return NextResponse.json({ error: "GPS-Testteam nicht gefunden." }, { status: 404 });
    }
    if (test.orders.some((order) => !order.isDemo || !order.title.startsWith(TEST_ORDER_TITLE))) {
      return NextResponse.json(
        { error: "Im Testteam befindet sich inzwischen ein fremder Auftrag. Bitte zuerst die Zuordnung prüfen; nichts wurde gelöscht." },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      const userIds = [test.pilotId, ...test.members.map((member) => member.userId)]
        .filter((userId): userId is string => !!userId);

      // Testaufträge samt Testpinpoints: nicht den ursprünglichen Demoauftrag löschen.
      await tx.order.deleteMany({
        where: { id: { in: test.orders.map((order) => order.id) }, isDemo: true },
      });
      await tx.operationDayTeam.delete({ where: { id: test.id } });
      await tx.team.delete({ where: { id: test.team.id } });

      // Die GPS-Tabelle ist bei einer noch nicht ausgeführten Migration
      // möglicherweise nicht vorhanden. Der Test muss sich trotzdem
      // vollständig und ohne Datenverlust entfernen lassen.
      // ACHTUNG: Für die Live-Ortung selbst ist die Migration weiterhin nötig.
      const gpsTables = await tx.$queryRaw<Array<{ name: string }>>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'DailyTeamLocation'
      `;

      if (gpsTables.length > 0) {
        // Freigaben nur zurücksetzen, wenn die betreffende Person am selben Tag
        // in keinem anderen Team mehr eingeteilt ist.
        for (const userId of userIds) {
          const otherTeam = await tx.operationDayTeam.findFirst({
            where: {
              operationDayId: test.operationDayId,
              OR: [
                { pilotId: userId },
                { members: { some: { userId } } },
              ],
            },
            select: { id: true },
          });

          if (!otherTeam) {
            await tx.dailyTeamLocation.updateMany({
              where: { date: test.operationDay.date, userId },
              data: {
                sharingEnabled: false,
                latitude: null,
                longitude: null,
                accuracy: null,
                positionAt: null,
              },
            });
          }
        }
      } else {
        console.warn(
          "GPS-Testmodus: DailyTeamLocation-Tabelle fehlt. Testdaten werden trotzdem entfernt. " +
            "Für Live-Standorte zuerst die Prisma-Datenbank aktualisieren."
        );
      }

      if (test.operationDay.note === TEST_DAY_NOTE) {
        const [otherTeams, otherOrders] = await Promise.all([
          tx.operationDayTeam.count({ where: { operationDayId: test.operationDayId } }),
          tx.order.count({ where: { operationDayId: test.operationDayId } }),
        ]);
        if (otherTeams === 0 && otherOrders === 0) {
          await tx.operationDay.delete({ where: { id: test.operationDayId } });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: "GPS-Testteam und zugehöriger Testauftrag wurden entfernt. Original-Demoauftrag und echte Einsatzdaten bleiben erhalten.",
    });
  } catch (error) {
    return errorResponse(error, "GPS-Test konnte nicht entfernt werden.");
  }
}
