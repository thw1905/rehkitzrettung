import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { checkDjiSession } from "@/lib/dji/token";
import { pointInArea } from "@/lib/dji/point-matching";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }
  const workspaceId = process.env.DJI_WORKSPACE_ID || "";
  const groupId = process.env.DJI_MAP_GROUP_ID || "";
  const token = req.cookies.get("rk_dji_pilot_session")?.value || "";
  const session = await checkDjiSession(token, workspaceId);
  if (!session || session.pilotUserId !== user.id) {
    return NextResponse.json({ error: "DJI-Teamsitzung fehlt oder ist abgelaufen." }, { status: 403, headers });
  }
  const anchor = await db.order.findUnique({
    where: { id: session.orderId },
    select: { operationDayTeamId: true, operationDayTeam: { select: { pilotId: true, operationDay: { select: { date: true } } } } },
  });
  if (!anchor?.operationDayTeamId || anchor.operationDayTeam?.pilotId !== user.id) {
    return NextResponse.json({ error: "Die Teamsitzung ist keinem gültigen Pilotenteam zugeteilt." }, { status: 403, headers });
  }
  const orderList = await db.order.findMany({
    where: { operationDayTeamId: anchor.operationDayTeamId, status: { in: ["OFFEN", "IN_ARBEIT"] } },
    select: { id: true, orderCode: true, title: true, field: { select: { areaGeoJson: true } } },
  });
  const filter = { workspaceId, groupId, pilotUserId: user.id, receivedAt: { gte: session.createdAt } };
  const [total, elements] = await Promise.all([
    db.djiMapElement.count({ where: filter }),
    db.djiMapElement.findMany({ where: filter, orderBy: { receivedAt: "desc" }, take: 50,
      select: { elementId: true, name: true, latitude: true, longitude: true, receivedAt: true } }),
  ]);
  const points = elements.map((element) => {
    const matches = orderList.filter((order) => pointInArea(element.longitude, element.latitude, order.field.areaGeoJson));
    const match = matches.length === 1 ? matches[0] : null;
    return {
      id: element.elementId, name: element.name, latitude: element.latitude, longitude: element.longitude,
      receivedAt: element.receivedAt.toISOString(),
      state: matches.length === 1 ? "MATCH" : matches.length > 1 ? "AMBIGUOUS" : "OUTSIDE",
      orderLabel: match ? (match.orderCode || match.title) : null,
      candidateCount: matches.length,
    };
  });
  return NextResponse.json({
    total, examined: points.length,
    matched: points.filter((p) => p.state === "MATCH").length,
    unclear: points.filter((p) => p.state === "AMBIGUOUS").length,
    outside: points.filter((p) => p.state === "OUTSIDE").length,
    points,
    note: "Nur Vorschau; kein Auftrags-PinPoint wurde angelegt. Maximal 50 neueste Punkte der Sitzung.",
  }, { headers });
}
