export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { gpsTestPrincipal, gpsTestIsConfigured, isValidGpsTestToken, GPS_TEST_COOKIE_NAME } from "@/lib/gps-test-access";

// Nur für die bedingte Anzeige des Menülinks; gibt niemals die PIN preis.
export async function GET(req: NextRequest) {
  const user = await gpsTestPrincipal();
  const allowed = Boolean(user && gpsTestIsConfigured());
  const unlocked = Boolean(allowed && user &&
    isValidGpsTestToken(req.cookies.get(GPS_TEST_COOKIE_NAME)?.value, user.id));
  return NextResponse.json({ allowed, unlocked }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
