import AvailabilityPageClient from "@/components/availability/availability-page-client";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { redirect } from "next/navigation";

export default async function AvailabilityPage() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    redirect("/login");
  }

  if (!currentUser.isApproved) {
    redirect("/dashboard");
  }

  return <AvailabilityPageClient days={21} />;
}