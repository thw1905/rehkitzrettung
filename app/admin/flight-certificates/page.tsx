import FlightCertificatesClient from "@/components/admin/flight-certificates-client";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { redirect } from "next/navigation";

export default async function FlightCertificatesPage() {
  const user=await getCurrentUserWithTeams();
  if (!user?.isAdmin) redirect("/dashboard");
  return <FlightCertificatesClient />;
}
