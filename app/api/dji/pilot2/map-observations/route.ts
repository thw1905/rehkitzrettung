import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { checkDjiSession } from "@/lib/dji/token";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export async function POST(request: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }
  const workspaceId = process.env.DJI_WORKSPACE_ID || "";
  const groupId = process.env.DJI_MAP_GROUP_ID || "";
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const session = await checkDjiSession(token, workspaceId);
  if (!session || session.pilotUserId !== user.id) {
    return NextResponse.json({ error: "DJI-Pilotensitzung fehlt oder ist abgelaufen." }, { status: 403, headers });
  }
  const filter = {
    workspaceId, groupId, pilotUserId: user.id, orderId: session.orderId,
    receivedAt: { gte: session.createdAt },
  };
  const [count, found] = await Promise.all([
    db.djiMapElement.count({ where: filter }),
    db.djiMapElement.findMany({
      where: filter, orderBy: { receivedAt: "desc" }, take: 15,
      select: { elementId: true, name: true, latitude: true, longitude: true, receivedAt: true },
    }),
  ]);
  return NextResponse.json({
    count, points: found.map((item) => ({
      id: item.elementId, name: item.name, latitude: item.latitude, longitude: item.longitude,
      receivedAt: item.receivedAt.toISOString(),
    })),
  }, { headers });
}
