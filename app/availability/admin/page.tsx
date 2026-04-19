import { redirect } from "next/navigation";
import AvailabilityAdminPageClient from "@/components/availability/availability-admin-page-client";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export default async function AvailabilityAdminPage() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.isAdmin) {
    redirect("/dashboard");
  }

  return <AvailabilityAdminPageClient days={21} />;
}