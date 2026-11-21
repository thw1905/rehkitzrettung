import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import TestDaysAdminPageClient from "@/components/admin/test-days-admin-page-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TestDaysAdminPage() {
  const currentUser = await getCurrentUserWithTeams();
  if (!currentUser) redirect("/login");
  if (!currentUser.isAdmin || !currentUser.isApproved) redirect("/dashboard");
  return <TestDaysAdminPageClient />;
}
