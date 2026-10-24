import { NextRequest, NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  const session = await checkDjiSession(req.headers.get("x-auth-token"), workspaceId);
  if (!session) return NextResponse.json({ code: 401, message: "Unauthorized" }, { status: 401 });
  const groupId = process.env.DJI_MAP_GROUP_ID;
  if (!groupId) return NextResponse.json({ code: 503, message: "DJI_MAP_GROUP_ID missing" }, { status: 503 });
  const points = await db.djiMapElement.findMany({
    where: { workspaceId, groupId, pilotUserId: session.pilotUserId },
    orderBy: { receivedAt: "desc" }, take: 500,
  });
  return NextResponse.json({
    code: 0, message: "success", data: [{
      id: groupId, name: "Rehkitzrettung", type: 2, is_lock: false,
      is_distributed: true,
      elements: points.map((point) => ({
        id: point.elementId, name: point.name, resource: point.resource,
        create_time: point.receivedAt.getTime(), update_time: point.updatedAt.getTime(),
      })),
    }],
  }, { headers: { "Cache-Control": "no-store" } });
}
