import { notFound } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import GpsTestAdminPageClient from "@/components/admin/gps-test-admin-page-client";

export const dynamic = "force-dynamic";

export default async function GpsTestAdminPage() {
  const currentUser = await getCurrentUserWithTeams();
  if (!currentUser?.isAdmin) notFound();

  return <GpsTestAdminPageClient />;
}
