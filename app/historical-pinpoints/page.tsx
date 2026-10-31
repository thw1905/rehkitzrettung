import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import HistoricalPinpointsPageClient from "@/components/historical-pinpoints/overview-page-client";

export default async function HistoricalPinpointsPage() {
  const user = await getCurrentUserWithTeams();
  if (!user) redirect("/login");
  if (!user.isAdmin && (!user.isApproved || !["PILOT", "SUCHER"].includes(user.role))) {
    redirect("/dashboard");
  }
  return <HistoricalPinpointsPageClient />;
}
