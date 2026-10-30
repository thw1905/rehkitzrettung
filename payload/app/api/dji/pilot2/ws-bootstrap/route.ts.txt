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

/** Stufe 3A: nur die WebSocket-Adresse, niemals MQTT-Passwörter oder DJI-App-Schlüssel. */
export async function POST(request: NextRequest) {
  if (process.env.DJI_WS_ENABLED !== "true") {
    return NextResponse.json({ error: "DJI-WebSocket-Test ist noch deaktiviert." }, { status: 503, headers });
  }
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }
  const workspaceId = process.env.DJI_WORKSPACE_ID || "";
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const session = await checkDjiSession(token, workspaceId);
  if (!session || session.pilotUserId !== user.id) {
    return NextResponse.json({ error: "DJI-Sitzung fehlt, ist abgelaufen oder widerrufen." }, { status: 403, headers });
  }
  const rawUrl = process.env.DJI_WS_PUBLIC_URL || "";
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { return NextResponse.json({ error: "DJI_WS_PUBLIC_URL ist nicht eingerichtet." }, { status: 503, headers }); }
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash || url.pathname !== "/dji-ws") {
    return NextResponse.json({ error: "DJI_WS_PUBLIC_URL muss eine reine wss://-Adresse mit Pfad /dji-ws sein." }, { status: 503, headers });
  }
  // DJI haengt das Sitzungs-Token in der JSBridge selbst an die WebSocket-URL an.
  return NextResponse.json({ wsUrl: url.toString() }, { headers });
}
