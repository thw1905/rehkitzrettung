import { NextRequest, NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { receiveDjiMapElement } from "@/lib/dji/import-element";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ workspaceId: string; groupId: string }> }) {
  const { workspaceId, groupId } = await context.params;
  const session = await checkDjiSession(req.headers.get("x-auth-token"), workspaceId);
  if (!session) return NextResponse.json({ code: 401, message: "Unauthorized" }, { status: 401 });
  if (groupId !== process.env.DJI_MAP_GROUP_ID) {
    return NextResponse.json({ code: 403, message: "Invalid map group" }, { status: 403 });
  }
  const raw = await req.text();
  if (raw.length > 16_384) return NextResponse.json({ code: 413, message: "Payload too large" }, { status: 413 });
  let element: unknown;
  try { element = JSON.parse(raw); } catch { return NextResponse.json({ code: 400, message: "Invalid JSON" }, { status: 400 }); }
  try {
    const received = await receiveDjiMapElement({
      workspaceId, groupId, pilotUserId: session.pilotUserId,
      orderId: session.orderId, element,
      allowImport: process.env.DJI_IMPORT_ENABLED === "true",
    });
    return NextResponse.json({ code: 0, message: "success", data: { id: received.elementId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /Kein gueltiger DJI-Karten/.test(error.message)) {
      return NextResponse.json({ code: 400, message: error.message }, { status: 400 });
    }
    console.error("DJI map element import error", error);
    return NextResponse.json({ code: 500, message: "Import failed" }, { status: 500 });
  }
}
