// REHKITZ_WAYLINE_CLOUD_V1 - M4T und Pilot2-Cloud-Routenbibliothek.
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import FlightMissionPlanner from "@/components/admin/flight-mission-planner";
export const dynamic = "force-dynamic";
export const metadata = { title: "DJI Flugmissionen planen – Rehkitzrettung" };
export default async function FlugmissionenPage() {
 const user=await getCurrentUserWithTeams();
 if(!user) redirect('/login');
 if(!user.isApproved || !user.isAdmin) redirect('/dashboard');
 return <main className="mx-auto max-w-7xl space-y-4 px-3 py-5 pb-28 md:px-6 md:pb-12">
  <div><Link href="/fields" className="text-sm text-blue-700 underline">← Flächenverwaltung</Link>
  <h1 className="mt-2 text-2xl font-bold text-gray-950">DJI Flugmissionen planen</h1>
  <p className="mt-2 text-sm text-gray-700">Testversion: vorhandene FL-Flächen als Suchbahnen planen, auf der Karte kontrollieren und für M3T oder M4T als KMZ exportieren bzw. in Pilot 2 bereitstellen.</p></div>
  <FlightMissionPlanner />
 </main>;
}
