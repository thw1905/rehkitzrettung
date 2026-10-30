import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DJI's official JSBridge license verification runs inside the Pilot 2 WebView.
 * Limit this response to logged-in, approved pilots and an explicit test flag.
 * Never add app keys to logs, pages, public env variables, or screenshots.
 */
export async function GET() {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }
  if (process.env.DJI_LICENSE_TEST_ENABLED !== "true") {
    return NextResponse.json({ error: "Lizenztest ist deaktiviert." }, { status: 503 });
  }
  const appId = process.env.DJI_APP_ID;
  const appKey = process.env.DJI_APP_KEY;
  const license = process.env.DJI_APP_LICENSE;
  if (!appId || !appKey || !license) {
    return NextResponse.json({ error: "DJI-Lizenzdaten sind unvollstaendig." }, { status: 503 });
  }
  // These values are passed only to DJI Pilot 2's native JSBridge, as prescribed by DJI.
  return NextResponse.json({ appId, appKey, license }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
