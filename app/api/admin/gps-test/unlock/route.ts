export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  gpsTestPrincipal, gpsTestIsConfigured, checkGpsTestPin, createGpsTestToken,
  GPS_TEST_COOKIE_NAME, GPS_TEST_SESSION_SECONDS,
} from "@/lib/gps-test-access";

// Zusätzliche Drossel für PIN-Fehlversuche. Bei mehreren Serverprozessen
// ggf. durch einen gemeinsamen Rate-Limiter (Redis/DB) ersetzen.
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await gpsTestPrincipal();
  if (!user) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  if (!gpsTestIsConfigured()) {
    return NextResponse.json({ error: "GPS-Test ist nicht vollständig konfiguriert." }, { status: 503 });
  }
  const prev = attempts.get(user.id);
  if (prev && prev.count >= MAX_ATTEMPTS && prev.lockedUntil > Date.now()) {
    return NextResponse.json({ error: "Zu viele PIN-Versuche. Bitte in 15 Minuten erneut versuchen." }, { status: 429 });
  }
  const input = await req.json().catch(() => ({}));
  const pin = typeof input.pin === "string" ? input.pin : "";
  if (!checkGpsTestPin(pin)) {
    const count = prev && prev.lockedUntil > Date.now() ? prev.count + 1 : 1;
    attempts.set(user.id, { count, lockedUntil: Date.now() + LOCK_MS });
    return NextResponse.json({ error: "Falsche PIN." }, { status: 403 });
  }
  attempts.delete(user.id);
  const token = createGpsTestToken(user.id);
  if (!token) return NextResponse.json({ error: "Sitzung konnte nicht eingerichtet werden." }, { status: 503 });
  const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(GPS_TEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: GPS_TEST_SESSION_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(GPS_TEST_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
