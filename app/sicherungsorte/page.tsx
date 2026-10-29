import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { wildSiteRole } from "@/lib/wild-sites";
import WildSitesList from "@/components/orders/WildSitesList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wild-Sicherungsorte – Rehkitzrettung" };
export default async function WildSitesPage() {
  const user = await getCurrentUserWithTeams();
  if (!user) redirect("/login");
  if (!wildSiteRole(user)) redirect("/");
  return <WildSitesList />;
}
