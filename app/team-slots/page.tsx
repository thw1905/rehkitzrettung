import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import TeamSlotsPageClient from "@/components/team-slots/team-slots-page-client";

export default async function TeamSlotsPage() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.isAdmin) {
    redirect("/dashboard");
  }

  return <TeamSlotsPageClient />;
}