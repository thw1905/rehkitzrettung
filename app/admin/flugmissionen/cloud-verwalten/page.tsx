// REHKITZ_DJI_CLOUD_ARCHIVE_V2_5
import { notFound } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import CloudMissionManager from "@/components/admin/dji-cloud-mission-manager";

export const dynamic = "force-dynamic";
export default async function CloudMissionenVerwalten(){
 const user=await getCurrentUserWithTeams();
 if(!user?.isApproved||!user.isAdmin)notFound();
 return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
  <h1 className="mb-2 text-2xl font-bold">DJI-Cloud-Flugmissionen verwalten</h1>
  <p className="mb-6 text-sm opacity-80">Nur Administratoren können veröffentlichte Missionen aus der Cloud-Bibliothek entfernen. Bereits lokal auf einer DJI-Fernsteuerung gespeicherte Missionen bleiben erhalten.</p>
  <CloudMissionManager />
 </main>;
}
