import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { checkDjiSession, createDjiSession, hashDjiToken } from "@/lib/dji/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "rk_dji_pilot_session";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const cookieOptions = {
  path: "/api/dji", httpOnly: true,
  secure: process.env.NODE_ENV === "production", sameSite: "strict" as const,
  maxAge: 8 * 60 * 60,
};

function todayInGermany() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  // OperationDay.date uses UTC midnight as a calendar date, NOT Berlin midnight.
  return { date, dbDate: new Date(`${date}T00:00:00.000Z`) };
}

async function pilotTeam() {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) return { problem: "Nicht als Pilot angemeldet.", status: 403 } as const;
  const today = todayInGermany();
  // An admin without an explicit pilot assignment must never get another team's points.
  const teams = await db.operationDayTeam.findMany({
    where: {
      pilotId: user.id, operationDay: { is: { date: today.dbDate } },
      orders: { some: { status: { in: ["OFFEN", "IN_ARBEIT"] } } },
    },
    select: {
      id: true, team: { select: { name: true } },
      orders: { where: { status: { in: ["OFFEN", "IN_ARBEIT"] } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true } },
    },
    take: 2,
  });
  if (teams.length !== 1) return {
    problem: teams.length === 0
      ? "Für heute ist dir kein Pilotenteam mit offenen oder laufenden Aufträgen zugeteilt."
      : "Dir sind heute mehrere Pilotenteams zugeteilt. Bitte die Tagesplanung korrigieren.",
    status: 409,
  } as const;
  return { user, team: teams[0], date: today.date };
}

async function restoredToken(req: NextRequest, pilotId: string, teamId: string) {
  const token = req.cookies.get(COOKIE)?.value || "";
  const session = await checkDjiSession(token, process.env.DJI_WORKSPACE_ID || "");
  if (!session || session.pilotUserId !== pilotId) return null;
  // Historical DjiPilotSession.orderId is a technical anchor only, not an assignment!
  const anchor = await db.order.findUnique({
    where: { id: session.orderId }, select: { operationDayTeamId: true },
  });
  if (anchor?.operationDayTeamId !== teamId) return null;
  return { token, expiresAt: session.expiresAt.toISOString() };
}

function isAllowedDjiOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");

  // Bisheriges Verhalten für Aufrufe ohne Origin beibehalten.
  if (!origin) return true;

  const publicUrl =
    process.env.DJI_PUBLIC_ORIGIN ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    req.nextUrl.origin;

  try {
    const expected = new URL(publicUrl).origin;
    const received = new URL(origin).origin;

    if (received !== expected) {
      console.warn("DJI-Origin abgelehnt", {
        received,
        expected,
        internal: req.nextUrl.origin,
      });
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function allowed() {
  if (process.env.DJI_IMPORT_ENABLED === "true") return "Automatischer PinPoint-Import ist bereits aktiv. Diese Teststufe darf so nicht gestartet werden.";
  if (!process.env.DJI_WORKSPACE_ID || !process.env.DJI_MAP_GROUP_ID) return "DJI Workspace oder Kartenebene fehlt.";
  return null;
}

export async function GET(req: NextRequest) {
  const result = await pilotTeam();
  if ("problem" in result) return NextResponse.json({ error: result.problem }, { status: result.status, headers });
  const activeSession = await restoredToken(req, result.user.id, result.team.id);
  return NextResponse.json({
    date: result.date, team: result.team.team.name, teamId: result.team.id,
    ordersCount: result.team.orders.length, activeSession,
    disabledReason: await allowed(),
  }, { headers });
}

export async function POST(req: NextRequest) {
  if (!isAllowedDjiOrigin(req)) {
    return NextResponse.json({ error: "Ungültiger Aufruf." }, { status: 403, headers });
  }
  const result = await pilotTeam();
  if ("problem" in result) return NextResponse.json({ error: result.problem }, { status: result.status, headers });
  const disabled = await allowed();
  if (disabled) return NextResponse.json({ error: disabled }, { status: 409, headers });
  const current = await restoredToken(req, result.user.id, result.team.id);
  if (current) return NextResponse.json({ token: current.token, restored: true }, { headers });
  // For this migration-free stage choose a deterministic team order as a technical anchor.
  // Actual GPS-based order matching will be a separate, explicitly enabled step.
  const anchor = result.team.orders[0];
  if (!anchor) return NextResponse.json({ error: "Keine Aufträge vorhanden." }, { status: 409, headers });
  await db.djiPilotSession.updateMany({
    where: { pilotUserId: result.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });
  const token = await createDjiSession(result.user.id, anchor.id, process.env.DJI_WORKSPACE_ID!);
  const response = NextResponse.json({ token, restored: false }, { headers });
  response.cookies.set(COOKIE, token, cookieOptions);
  return response;
}

export async function DELETE(req: NextRequest) {
  if (!isAllowedDjiOrigin(req)) {
    return NextResponse.json({ error: "Ungültiger Aufruf." }, { status: 403, headers });
  }
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401, headers });
  const token = req.cookies.get(COOKIE)?.value || "";
  if (/^[a-f0-9]{64}$/i.test(token)) {
    await db.djiPilotSession.updateMany({
      where: { tokenHash: hashDjiToken(token), pilotUserId: user.id },
      data: { revokedAt: new Date() },
    });
  }
  const response = NextResponse.json({ success: true }, { headers });
  response.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
