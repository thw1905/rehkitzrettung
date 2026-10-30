import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createDjiSession, hashDjiToken } from "@/lib/dji/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  const orders = await db.order.findMany({
    where: {
      status: { in: ["OFFEN", "IN_ARBEIT"] },
      ...(user.isAdmin ? {} : { operationDayTeam: { pilotId: user.id } }),
    },
    select: { id: true, orderCode: true, title: true, operationDayTeamId: true },
    orderBy: { sortOrder: "asc" }, take: 200,
  });
  return NextResponse.json({ orders }, { headers: noStore });
}

// Test/provisioning endpoint; by itself does NOT connect DJI Pilot 2.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  const workspaceId = process.env.DJI_WORKSPACE_ID;
  if (!workspaceId || !/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId)) {
    return NextResponse.json({ error: "DJI_WORKSPACE_ID fehlt." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const order = await db.order.findUnique({
    where: { id: orderId }, select: { status: true, operationDayTeam: { select: { pilotId: true } } },
  });
  if (!order || order.status === "ERLEDIGT" || (!user.isAdmin && order.operationDayTeam?.pilotId !== user.id)) {
    return NextResponse.json({ error: "Auftrag nicht zugeteilt oder abgeschlossen." }, { status: 403 });
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
  return NextResponse.json({ success: true });
}
