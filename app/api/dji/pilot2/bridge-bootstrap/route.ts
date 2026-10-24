import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { checkDjiSession } from "@/lib/dji/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

/** Read-only workspace bootstrap for an authenticated pilot with valid DJI session. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const workspaceId = process.env.DJI_WORKSPACE_ID || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return NextResponse.json({ error: "DJI_WORKSPACE_ID ist noch nicht eingerichtet." }, { status: 503, headers });
  }

  const session = await checkDjiSession(token, workspaceId);
  if (!session || session.pilotUserId !== user.id) {
    return NextResponse.json({ error: "Bitte eine gültige Testsitzung für diesen Piloten vorbereiten." }, { status: 403, headers });
  }

  return NextResponse.json({
    workspaceId,
    platformName: "Rehkitzrettung",
    workspaceName: "Hegering Hittfeld",
    description: "DJI Pilot 2 – Testsitzung",
  }, { headers });
}
