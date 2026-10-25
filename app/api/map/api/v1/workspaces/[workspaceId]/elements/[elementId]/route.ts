// DJI_PUT_MOVE_V6: offizielle DJI Cloud API fuer verschobene Karten-Punkte.
import { NextRequest, NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { DjiElementUpdateError, updateDjiMapElement } from "@/lib/dji/update-element";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "no-store" };

type Context = { params: Promise<{ workspaceId: string; elementId: string }> };
export async function PUT(req: NextRequest, context: Context) {
  const { workspaceId, elementId } = await context.params;
  const session = await checkDjiSession(req.headers.get("x-auth-token"), workspaceId);
  if (!session) {
    return NextResponse.json({ code: 401, message: "Unauthorized" },
      { status: 401, headers: responseHeaders });
  }
  const raw = await req.text();
  if (raw.length > 16_384) {
    return NextResponse.json({ code: 413, message: "Payload too large" },
      { status: 413, headers: responseHeaders });
  }
  let update: unknown;
  try { update = JSON.parse(raw); }
  catch {
    return NextResponse.json({ code: 400, message: "Invalid JSON" },
      { status: 400, headers: responseHeaders });
  }
  try {
    const received = await updateDjiMapElement({
      workspaceId, elementId,
      pilotUserId: session.pilotUserId,
      sessionOrderId: session.orderId,
      update,
    });
    return NextResponse.json({ code: 0, message: "success", data: { id: received.elementId } },
      { headers: responseHeaders });
  } catch (error) {
    if (error instanceof DjiElementUpdateError) {
      return NextResponse.json({ code: error.httpStatus, message: error.message },
        { status: error.httpStatus, headers: responseHeaders });
    }
    console.error("DJI point update error", error);
    return NextResponse.json({ code: 500, message: "Point update failed" },
      { status: 500, headers: responseHeaders });
  }
}
