import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUserWithTeams();
  if (!user || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Pilot-Anmeldung erforderlich." }, { status: 403 });
  }
  return NextResponse.json({
    stage: "2A",
    workspaceConfigured: Boolean(process.env.DJI_WORKSPACE_ID),
    licenseTestConfigured: process.env.DJI_LICENSE_TEST_ENABLED === "true" &&
      Boolean(process.env.DJI_APP_ID && process.env.DJI_APP_KEY && process.env.DJI_APP_LICENSE),
    cloudConnectionEnabled: false,
    autoImportEnabled: false,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
