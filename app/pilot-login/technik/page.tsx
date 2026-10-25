// DJI_TECH_PIN_V2: Technik nur für angemeldete Admins mit gültiger Demo/GPS-Test-PIN.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import PilotLoginClient from "@/components/dji/PilotLoginClient";
import GpsTestPinGate from "@/components/admin/gps-test-pin-gate";
import { gpsTestPrincipal, GPS_TEST_COOKIE_NAME, isValidGpsTestToken } from "@/lib/gps-test-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DJI-Technik – Rehkitzrettung Hegering Hittfeld",
  robots: { index: false, follow: false },
};
export default async function PilotTechnicalPage() {
  const admin = await gpsTestPrincipal();
  if (!admin) notFound();
  const jar = await cookies();
  if (!isValidGpsTestToken(jar.get(GPS_TEST_COOKIE_NAME)?.value, admin.id)) {
    return <GpsTestPinGate />;
  }
  return <PilotLoginClient />;
}
