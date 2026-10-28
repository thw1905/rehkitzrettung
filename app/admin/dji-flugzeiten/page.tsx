// DJI_FLIGHT_AREA_V11: aggregierte GPS-Flugzeiten je Feld/Auftrag (nur Admin).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJI Flugzeiten je Flaeche – Rehkitzrettung" };
const berlin = new Intl.DateTimeFormat("de-DE", {timeZone:"Europe/Berlin",dateStyle:"short",timeStyle:"short"});
function duration(s: number) { return `${Math.floor(s/60)} Min. ${String(s%60).padStart(2,"0")} Sek.`; }
function label(bucket: string) {
  return bucket === "OUTSIDE" ? "Außerhalb der Flächen" :
    bucket === "AMBIGUOUS" ? "Mehrere Flächen – ungeklärt" :
    bucket === "UNKNOWN" ? "GPS fehlt / nicht zuordenbar" : "Fläche";
}
export default async function DjiFlightAreaPage() {
  const user = await getCurrentUserWithTeams();
  if (!user?.isApproved || !user.isAdmin) redirect("/");
  const entries = await db.djiFlightAreaTime.findMany({orderBy:{createdAt:"desc"},take:500});
  const flightIds = [...new Set(entries.map(e => e.flightUsageId))];
  const orderIds = [...new Set(entries.map(e => e.orderId).filter((id):id is string=>!!id))];
  const [flights,orders] = await Promise.all([
    db.djiBatteryUsage.findMany({where:{id:{in:flightIds}},select:{id:true,aircraftId:true,batteryId:true,startedAt:true,flightSeconds:true}}),
    db.order.findMany({where:{id:{in:orderIds}},select:{id:true,orderCode:true,title:true}}),
  ]);
  const aircraftIds = [...new Set(flights.map(f=>f.aircraftId))];
  const aircraft = await db.djiAircraft.findMany({where:{id:{in:aircraftIds}},select:{id:true,label:true}});
  const byFlight = new Map(flights.map(f=>[f.id,f]));
  const byOrder = new Map(orders.map(o=>[o.id,o]));
  const byAircraft = new Map(aircraft.map(a=>[a.id,a.label]));
  const totals = new Map<string,{name:string,seconds:number}>();
  for(const e of entries) {
    const o=e.orderId ? byOrder.get(e.orderId) : null;
    const name=o ? `${o.orderCode || o.title || "Auftrag"}` : label(e.bucket);
    const key=e.orderId || `BUCKET:${e.bucket}`;
    const old=totals.get(key);
    totals.set(key,{name,seconds:(old?.seconds||0)+e.seconds});
  }
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="rounded-xl bg-slate-900 px-5 py-4 text-white">
        <h1 className="text-2xl font-bold">DJI-Flugzeiten je Fläche</h1>
        <p className="mt-2 text-sm text-slate-200">GPS-basierte Näherungswerte. Unklare Positionen bleiben ungeklärt, nicht einem Auftrag zugeschlagen.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/dji-akku-historie" className="rounded border border-slate-300 px-3 py-1.5 text-sm">Akkuhistorie</Link>
          <Link href="/admin/dji-akkus" className="rounded border border-slate-300 px-3 py-1.5 text-sm">Akkuverwaltung</Link>
        </div>
      </header>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Summen aus den letzten {flightIds.length} Flügen</h2>
        {totals.size===0 ? <p className="text-slate-600">Noch keine GPS-Flugzeiten erfasst. Erst Flüge nach Aktivierung von V11 erscheinen hier.</p> :
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Fläche / Zuordnung</th><th className="py-2 text-right">Flugzeit</th></tr></thead>
          <tbody>{[...totals.values()].sort((a,b)=>b.seconds-a.seconds).map((t,i)=><tr key={i} className="border-b last:border-b-0"><td className="py-2">{t.name}</td><td className="py-2 text-right tabular-nums">{duration(t.seconds)}</td></tr>)}</tbody></table>
        }
      </section>
      {entries.length>0 && <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Einzelzuordnungen</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2 pr-3">Flugbeginn</th><th className="pr-3">Drohne</th><th className="pr-3">Auftrag / Bereich</th><th className="text-right">Zeit</th></tr></thead>
        <tbody>{entries.map(e=>{
          const f=byFlight.get(e.flightUsageId);
          const o=e.orderId?byOrder.get(e.orderId):null;
          return <tr key={e.id} className="border-b last:border-b-0"><td className="py-2 pr-3 whitespace-nowrap">{f?berlin.format(f.startedAt):"Unbekannt"}</td><td className="pr-3">{f?(byAircraft.get(f.aircraftId)||"Drohne"):"–"}</td><td className="pr-3">{o?(o.orderCode||o.title||"Auftrag"):label(e.bucket)}</td><td className="text-right whitespace-nowrap tabular-nums">{duration(e.seconds)}</td></tr>;
        })}</tbody></table></div>
      </section>}
      <p className="text-xs text-slate-500">Nur administrativ sichtbar. Die Auftrags- und Tages-Timer werden nicht geändert. Bei fehlendem GPS, ungewöhnlichen Positionssprüngen und mehrdeutigen Flächen bleibt die Zeit ungeklärt.</p>
    </main>
  );
}
