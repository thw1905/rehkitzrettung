import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import DayAssignmentsPageClient from "@/components/day-assignments/day-assignments-page-client";

export default async function DayAssignmentsPage() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.isAdmin) {
    redirect("/dashboard");
  }

  return <DayAssignmentsPageClient />;
}