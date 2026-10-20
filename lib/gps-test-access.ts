import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const GPS_TEST_COOKIE_NAME = "gps_test_access";
const SESSION_MINUTES = 120;
export const GPS_TEST_SESSION_SECONDS = SESSION_MINUTES * 60;

// Ein angemeldeter Administrator darf die PIN-Abfrage öffnen.
// Die eigentliche Freigabe erfolgt ausschließlich nach erfolgreicher Demo-PIN-Eingabe.
// Eine manuell konfigurierte Benutzer-ID ist NICHT erforderlich.
export function isGpsTestAdmin(user: { id: string; isAdmin: boolean | null } | null | undefined) {
  return Boolean(user?.isAdmin && user.id);
}

function sessionSecret() {
  const appSecret =
    process.env.GPS_TEST_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;
  const pin = process.env.DEMO_ORDER_PIN;
  if (!appSecret || appSecret.length < 24 || !pin) return null;
  // Änderungen an der Demo-PIN machen bestehende Freigaben ungültig.
  return createHash("sha256").update(`gps-test-v1\0${appSecret}\0${pin}`).digest();
}

export function gpsTestIsConfigured() {
  return Boolean(sessionSecret());
}

function mac(payload: string) {
  const secret = sessionSecret();
  return secret ? createHmac("sha256", secret).update(payload).digest("base64url") : null;
}

export function checkGpsTestPin(provided: string) {
  const expected = process.env.DEMO_ORDER_PIN;
  if (!expected || !provided) return false;
  const first = createHash("sha256").update(provided, "utf8").digest();
  const second = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(first, second);
}

export function createGpsTestToken(userId: string) {
  if (!sessionSecret()) return null;
  const body = Buffer.from(JSON.stringify({
    v: 1,
    userId,
    expires: Date.now() + GPS_TEST_SESSION_SECONDS * 1000,
  })).toString("base64url");
  const sig = mac(body);
  return sig ? `${body}.${sig}` : null;
}

export function isValidGpsTestToken(token: string | undefined, userId: string) {
  if (!token || !sessionSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length > 800) return false;
  const expected = mac(parts[0]);
  if (!expected) return false;
  const actualSig = Buffer.from(parts[1], "base64url");
  const expectedSig = Buffer.from(expected, "base64url");
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return data.v === 1 && data.userId === userId &&
      typeof data.expires === "number" && data.expires > Date.now() &&
      data.expires <= Date.now() + GPS_TEST_SESSION_SECONDS * 1000;
  } catch {
    return false;
  }
}

export async function gpsTestPrincipal() {
  const user = await getCurrentUserWithTeams();
  if (!user || !isGpsTestAdmin(user)) return null;
  return user;
}

// Jede API-Methode muss diese Prüfung verwenden, NICHT nur die Seite.
export async function authorizeGpsTestApi(req: NextRequest): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const user = await getCurrentUserWithTeams();
  if (!user) return { ok: false, status: 401, message: "Bitte anmelden." };
  if (!isGpsTestAdmin(user)) return { ok: false, status: 404, message: "Keine Berechtigung." };
  if (!gpsTestIsConfigured()) {
    return { ok: false, status: 503, message: "GPS-Test-PIN oder Sitzungs-Secret ist nicht konfiguriert." };
  }
  if (!isValidGpsTestToken(req.cookies.get(GPS_TEST_COOKIE_NAME)?.value, user.id)) {
    return { ok: false, status: 403, message: "Bitte den GPS-Test mit deiner PIN freischalten." };
  }
  return { ok: true, userId: user.id };
}
