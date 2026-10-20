// Speichern als: app/api/team-locations/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const MAX_LOCATION_AGE_MS = 60_000;
const STALE_AFTER_MS = 10_000;

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

function todayInGermany() {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input
    ? null
    : date;
}

const MARKER_COLORS: Record<string, string[]> = {
  P: ["#7c3aed", "#db2777", "#4f46e5", "#be185d", "#6d28d9"],
  S: ["#16a34a", "#ea580c", "#0891b2", "#b45309", "#0d9488", "#ca8a04", "#0284c7", "#65a30d", "#c2410c", "#15803d"],
};

function markerColor(code: string) {
  const prefix = code.startsWith("P") ? "P" : "S";
  const colors = MARKER_COLORS[prefix];
  const number = Number(code.slice(1));
  return colors[((Number.isFinite(number) ? number : 1) - 1) % colors.length];
}

let lastCleanupAt = 0;
async function clearPreviousDays() {
  if (Date.now() - lastCleanupAt < 15 * 60_000) return;
  // Ohne Hintergrundjob: Sobald die API an einem neuen Tag aufgerufen wird,
  // werden Standortkoordinaten vergangener Tage entfernt; Kennungen bleiben erhalten.
  await db.dailyTeamLocation.updateMany({
    where: {
      date: { lt: new Date(`${todayInGermany()}T00:00:00.000Z`) },
      OR: [
        { sharingEnabled: true },
        { latitude: { not: null } },
      ],
    },
    data: {
      sharingEnabled: false,
      latitude: null,
      longitude: null,
      accuracy: null,
      positionAt: null,
    },
  });
  lastCleanupAt = Date.now();
}

async function loadAuthorizedTeam(teamId: string, date: Date, userId: string) {
  const team = await db.operationDayTeam.findFirst({
    where: { id: teamId, operationDay: { date } },
    include: {
      operationDay: { select: { status: true } },
      pilot: { select: USER_SELECT },
      members: { include: { user: { select: USER_SELECT } } },
    },
  });

  if (!team) return null;
  const ids = [team.pilotId, ...team.members.map((m) => m.userId)];
  if (!ids.includes(userId)) return null;
  return team;
}

async function ensureDailyMarker(date: Date, userId: string, prefix: "P" | "S") {
  const existing = await db.dailyTeamLocation.findUnique({
    where: { date_userId: { date, userId } },
  });
  if (existing) return existing;

  // Das eindeutige Datenbank-Constraint sorgt auch bei gleichzeitigen
  // Registrierungen dafür, dass keine Tageskennung doppelt vergeben wird.
  for (let number = 1; number <= 9999; number += 1) {
    try {
      return await db.dailyTeamLocation.create({
        data: { date, userId, markerCode: `${prefix}${number}` },
      });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      const concurrent = await db.dailyTeamLocation.findUnique({
        where: { date_userId: { date, userId } },
      });
      if (concurrent) return concurrent;
      // Sonst war diese Tagesnummer bereits vergeben: nächste versuchen.
    }
  }
  throw new Error("Keine freie Tageskennung vorhanden.");
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();
    if (!currentUser) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const dateText = req.nextUrl.searchParams.get("date") || "";
    const teamId = req.nextUrl.searchParams.get("teamId") || "";
    const date = parseDate(dateText);
    if (!date || !teamId || dateText !== todayInGermany()) {
      return NextResponse.json({ error: "Nur der heutige Einsatztag ist für Live-Standorte verfügbar." }, { status: 400 });
    }

    const team = await loadAuthorizedTeam(teamId, date, currentUser.id);
    if (!team) {
      return NextResponse.json({ error: "Du gehörst nicht zu diesem Team." }, { status: 403 });
    }

    await clearPreviousDays();

    const people = [team.pilot, ...team.members.map((m) => m.user)]
      .filter((person): person is NonNullable<typeof person> => !!person);
    const byId = new Map(people.map((person) => [person.id, person]));
    const uniquePeople = [...byId.values()].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "de")
    );

    // Die Tageskennung wird nur beim ersten Kontakt vergeben und nie bei einem
    // Teamwechsel verändert. Auch noch nicht sendende Helfer erhalten eine Kennung.
    const existingEntries = await db.dailyTeamLocation.findMany({
      where: { date, userId: { in: uniquePeople.map((person) => person.id) } },
    });
    const existingByUser = new Map(existingEntries.map((entry) => [entry.userId, entry]));
    const missingEntries = await Promise.all(
      uniquePeople
        .filter((person) => !existingByUser.has(person.id))
        .map((person) =>
          ensureDailyMarker(date, person.id, person.role === "PILOT" ? "P" : "S")
        )
    );
    const locationByUser = new Map(
      [...existingEntries, ...missingEntries].map((entry) => [entry.userId, entry])
    );
    const now = Date.now();
    const teamIsFinished = team.operationDay.status === "ABGESCHLOSSEN" || !!team.actualEndTime;

    const members = uniquePeople.map((person) => {
      const record = locationByUser.get(person.id)!;
      const ageMs = record.positionAt ? now - record.positionAt.getTime() : null;
      const visible =
        !teamIsFinished &&
        record.sharingEnabled &&
        ageMs !== null &&
        ageMs >= 0 &&
        ageMs <= MAX_LOCATION_AGE_MS &&
        record.latitude !== null &&
        record.longitude !== null;

      return {
        userId: person.id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        role: person.role,
        markerCode: record.markerCode,
        markerColor: markerColor(record.markerCode),
        sharingEnabled: !teamIsFinished && record.sharingEnabled,
        latitude: visible ? record.latitude : null,
        longitude: visible ? record.longitude : null,
        accuracy: visible ? record.accuracy : null,
        positionAt: visible ? record.positionAt?.toISOString() : null,
        stale: visible && ageMs !== null && ageMs > STALE_AFTER_MS,
      };
    });

    return NextResponse.json({ myUserId: currentUser.id, members });
  } catch (error) {
    console.error("Live-Teamstandorte GET:", error);
    return NextResponse.json({ error: "Teamstandorte konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();
    if (!currentUser) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dateText = String(body.date || "");
    const date = parseDate(dateText);
    if (!date || dateText !== todayInGermany()) {
      return NextResponse.json({ error: "Standortfreigabe nur für heute möglich." }, { status: 400 });
    }
    await clearPreviousDays();

    if (body.action === "stop") {
      // Das Beenden der eigenen Freigabe ist unabhängig von einem Teamwechsel erlaubt.
      await db.dailyTeamLocation.updateMany({
        where: { date, userId: currentUser.id },
        data: { sharingEnabled: false, latitude: null, longitude: null, accuracy: null, positionAt: null },
      });
      return NextResponse.json({ success: true });
    }

    if (body.action !== "position") {
      return NextResponse.json({ error: "Ungültige Aktion." }, { status: 400 });
    }

    const teamId = String(body.teamId || "");
    const team = await loadAuthorizedTeam(teamId, date, currentUser.id);
    if (!team) {
      return NextResponse.json({ error: "Du gehörst nicht zu diesem Team." }, { status: 403 });
    }
    if (team.operationDay.status === "ABGESCHLOSSEN" || team.actualEndTime) {
      return NextResponse.json({ error: "Dieser Teameinsatz ist abgeschlossen." }, { status: 409 });
    }

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 150
    ) {
      return NextResponse.json({ error: "Ungültiger oder zu ungenauer GPS-Standort (über ±150 m)." }, { status: 400 });
    }

    const fixTimestamp = Number(body.fixTimestamp);
    if (!Number.isFinite(fixTimestamp) || Math.abs(Date.now() - fixTimestamp) > 15_000) {
      return NextResponse.json({ error: "Die GPS-Messung ist veraltet." }, { status: 400 });
    }

    const marker = await ensureDailyMarker(
      date, currentUser.id, currentUser.role === "PILOT" ? "P" : "S"
    );
    await db.dailyTeamLocation.update({
      where: { id: marker.id },
      data: {
        sharingEnabled: true,
        latitude,
        longitude,
        accuracy,
        positionAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, markerCode: marker.markerCode });
  } catch (error) {
    console.error("Live-Teamstandorte POST:", error);
    return NextResponse.json({ error: "Standort konnte nicht gespeichert werden." }, { status: 500 });
  }
}
