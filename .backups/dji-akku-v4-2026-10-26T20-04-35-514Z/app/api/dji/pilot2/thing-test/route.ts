// DJI_AKKU_THING_TEST_V3: Admin-only optional Cloud-Modul-Test.
// Fuehrt weder einen DJI-Map-Neustart noch Datenbankzugriffe aus.
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

function responseError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user?.isAdmin || !user.isApproved) return responseError("Nur fuer Administratoren.", 403);
  const workspaceId = process.env.DJI_WORKSPACE_ID || "";
  if (!workspaceId) return responseError("DJI-Workspace nicht eingerichtet.", 503);
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const active = await checkDjiSession(token, workspaceId);
  if (!active || active.pilotUserId !== user.id) return responseError("DJI-Sitzung nicht aktiv.", 403);

  // Kein Default fuer Geheimnisse! Einmalig nur auf dem Server in .env.production.local konfigurieren.
  const host = process.env.DJI_MQTT_PILOT_HOST || "";
  const username = process.env.DJI_MQTT_PILOT_USER || "";
  const password = process.env.DJI_MQTT_PILOT_PASSWORD || "";
  if (!/^(?:tcp|ssl):\/\/[a-z0-9.-]+:\d{2,5}$/i.test(host) || !username || !password) {
    return responseError("MQTT-Testkonfiguration fehlt oder ist ungueltig.", 503);
  }
  // Keine Speicherung, keine Protokollierung der Zugangsdaten.
  return NextResponse.json({ host, username, password }, { headers });
}
