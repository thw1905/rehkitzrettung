// REHKITZ_DJI_AUFTRAGSFLUGPLANUNG_V3
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { orderFlightField } from "@/lib/flight-missions/mission-v3";
import FlightMissionPlanner from "@/components/admin/flight-mission-planner";
export const dynamic="force-dynamic";
export const metadata={title:"DJI Flugmission fuer Auftrag planen – Rehkitzrettung"};
type Ctx={params:Promise<{orderId:string}>};
export default async function PilotFlightMissionPage({params}:Ctx){
 const user=await getCurrentUserWithTeams();
 if(!user)redirect("/login");
 const {orderId}=await params;
 const field=await orderFlightField(user,orderId);
 if(!field)redirect("/my-orders");
 return <main className="mx-auto max-w-7xl space-y-4 px-3 py-5 pb-28 md:px-6 md:pb-12">
  <Link href="/my-orders" className="text-sm text-blue-700 underline">← Zurueck zu meinen Auftraegen</Link>
  <h1 className="text-2xl font-bold text-gray-950">Flugmission: {field.displayName||field.name}</h1>
  <p className="text-sm text-gray-700">Die Flaeche ist durch deinen Auftrag fest vorgegeben. Bereits veroeffentlichte Flugmissionen werden automatisch geladen.</p>
  <FlightMissionPlanner orderId={orderId}/>
 </main>;
}
