import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createDjiSession, hashDjiToken } from "@/lib/dji/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

/** Tagesplanung speichert ein deutsches Kalenderdatum als 00:00 UTC. */
function getGermanOperationDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (part: "year" | "month" | "day") =>
    parts.find((item) => item.type === part)?.value ?? "";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  return { dateKey, date: new Date(`${dateKey}T00:00:00.000Z`) };
}

export async function GET() {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }

  const today = getGermanOperationDay();
  const orders = await db.order.findMany({
    where: {
      status: { in: ["OFFEN", "IN_ARBEIT"] },
      // Das Datum des Team-Einsatztags ist ausschlaggebend, nicht mowingDate.
      // Ohne Tages-Team ist ein Auftrag hier bewusst nicht auswählbar.
      operationDayTeam: {
        is: {
          operationDay: { is: { date: today.date } },
          ...(user.isAdmin ? {} : { pilotId: user.id }),
        },
      },
    },
    select: { id: true, orderCode: true, title: true, operationDayTeamId: true },
    orderBy: [{ sortOrder: "asc" }, { orderCode: "asc" }, { id: "asc" }],
    take: 200,
  });

  return NextResponse.json({
    orders, date: today.dateKey, adminView: user.isAdmin,
  }, { headers: noStore });
}

// Vorbereitung einer DJI-Testsitzung – keine Live-Cloud-Verbindung.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }
  const workspaceId = process.env.DJI_WORKSPACE_ID;
  if (!workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return NextResponse.json({ error: "DJI_WORKSPACE_ID fehlt oder ist keine UUID." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const order = orderId ? await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      operationDayTeam: {
        select: { pilotId: true, operationDay: { select: { date: true } } },
      },
    },
  }) : null;
  const team = order?.operationDayTeam;
  const today = getGermanOperationDay();
  if (!order || !team || !["OFFEN", "IN_ARBEIT"].includes(order.status) ||
      team.operationDay.date.getTime() !== today.date.getTime() ||
      (!user.isAdmin && team.pilotId !== user.id)) {
    return NextResponse.json({
      error: "Dieser Auftrag gehört nicht zum heutigen Einsatztag oder wurde dir nicht zugeteilt.",
    }, { status: 403 });
  }

  const token = await createDjiSession(user.id, orderId, workspaceId);
  return NextResponse.json({ token, expiresInSeconds: 28800 }, { headers: noStore });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ error: "Ungueltiger Token." }, { status: 400 });
  const session = await db.djiPilotSession.findUnique({ where: { tokenHash: hashDjiToken(token) } });
  if (!session || (session.pilotUserId !== user.id && !user.isAdmin)) return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  await db.djiPilotSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ success: true }, { headers: noStore });
}
