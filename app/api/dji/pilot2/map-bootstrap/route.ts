import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { checkDjiSession } from "@/lib/dji/token";

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
  if (!workspaceId || !groupId) {
    return NextResponse.json({ error: "DJI-Kartenebene/Workspace noch nicht eingerichtet." }, { status: 503, headers });
  }
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const session = await checkDjiSession(token, workspaceId);
  if (!session || session.pilotUserId !== user.id) {
    return NextResponse.json({ error: "DJI-Pilotensitzung fehlt oder ist abgelaufen." }, { status: 403, headers });
  }
  if (process.env.DJI_IMPORT_ENABLED === "true") {
    return NextResponse.json({ error: "Für die Diagnose bitte DJI_IMPORT_ENABLED deaktivieren." }, { status: 409, headers });
  }
  return NextResponse.json({ workspaceId, groupId, autoImportEnabled: false }, { headers });
}
