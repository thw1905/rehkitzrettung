import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import DjiBatteryInventoryClient from "@/components/admin/dji-battery-inventory-client";

export const metadata = {
  title: "DJI Drohnen und Akkus – Rehkitzrettung",
};

export default async function DjiBatteryInventoryPage() {
  const user = await getCurrentUserWithTeams();
  if (!user?.isAdmin || !user.isApproved) redirect("/");
  return <DjiBatteryInventoryClient />;
}
