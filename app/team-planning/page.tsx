import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import TeamPlanningPageClient from "@/components/team-planning/team-planning-page-client";

export default async function TeamPlanningPage() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.isAdmin) {
    redirect("/dashboard");
  }

  return <TeamPlanningPageClient />;
}