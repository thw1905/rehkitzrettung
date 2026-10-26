// DJI_AKKU_V4: automatische, einsatzunabhaengige Cloud-Modul-Konfiguration.
// Nur freigegebene Piloten/Admins. Zugangsdaten niemals im Repository oder in Logs speichern.
import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function GET() {
  const user = await getCurrentUserWithTeams();
  if (!user || !user.isApproved || (!user.isAdmin && user.role !== "PILOT")) {
    return fail("Nicht berechtigt.", 403);
  }
  if (process.env.DJI_MQTT_AUTOCONNECT !== "true") {
    return NextResponse.json({ enabled: false, reason: "Akku-Telemetrie am Server noch nicht aktiviert." }, { headers });
  }
  const host = (process.env.DJI_MQTT_PILOT_HOST || "").trim();
  const username = process.env.DJI_MQTT_PILOT_USER || "";
  const password = process.env.DJI_MQTT_PILOT_PASSWORD || "";
  // Nur eindeutig spezifizierte Transporte, URL ohne eingebettete Zugangsdaten.
  const match = /^(tcp|ws|ssl|wss):\/\/([a-z0-9.-]+):(\d{2,5})(?:\/([a-z0-9/_-]*))?$/i.exec(host);
  if (!match || !username || !password || username.length > 128 || password.length > 256) {
    return fail("MQTT-Zugang oder Host unvollstaendig.", 503);
  }
  const scheme = match[1].toLowerCase();
  // Keine unverschluesselten Fernverbindungen: Nur Loopback/Privat-IP, nicht oeffentliche DNS-Namen.
  if (scheme === "tcp" || scheme === "ws") {
    const h = match[2].toLowerCase();
    const isPrivate = h === "localhost" || h === "127.0.0.1" ||
      h.startsWith("10.") || h.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h);
    if (!isPrivate || process.env.DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT !== "true") {
      return fail("Unverschluesseltes MQTT ins Internet ist gesperrt. Bitte TLS-faehigen Transport oder gesicherten privaten Tunnel verwenden.", 503);
    }
  }
  // DJI Pilot 2 muss das ausgewaehlte Schema selbst unterstuetzen; die Web-App kann TLS nicht erzwingen.
  return NextResponse.json({ enabled: true, host, username, password }, { headers });
}
