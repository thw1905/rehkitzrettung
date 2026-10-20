import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import GpsTestAdminPageClient from "@/components/admin/gps-test-admin-page-client";
import GpsTestPinGate from "@/components/admin/gps-test-pin-gate";
import {
  gpsTestPrincipal, GPS_TEST_COOKIE_NAME, isValidGpsTestToken,
} from "@/lib/gps-test-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GpsTestAdminPage() {
  const user = await gpsTestPrincipal();
  // Ohne Admin-Rechte bleibt die Seite gesperrt. Fuer Testdaten ist zusaetzlich die PIN notwendig.
  if (!user) notFound();
  const cookieJar = await cookies();
  if (!isValidGpsTestToken(cookieJar.get(GPS_TEST_COOKIE_NAME)?.value, user.id)) {
    return <GpsTestPinGate />;
  }
  return <GpsTestAdminPageClient />;
}
