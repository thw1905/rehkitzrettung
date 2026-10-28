// DJI_BATTERY_HISTORY_V9
// Read-only administrator view of automatic daily battery detections.
// An OSD battery detection is NOT proof of a flight.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "DJI Akkuhistorie – Rehkitzrettung" };

function berlinDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}
function berlinTime(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
function eventName(source: string): string {
  switch (source) {
    case "DJI_DETECTED": return "In Drohne erkannt";
    case "DJI_FLIGHT": return "Flug per DJI-Telemetrie";
    case "DJI_MQTT": return "DJI-Telemetrie";
    default: return `Gespeicherter Eintrag (${source})`;
  }
}

export default async function DjiBatteryHistoryPage() {
  const user = await getCurrentUserWithTeams();
  if (!user?.isApproved || !user.isAdmin) redirect("/");

  const records = await db.djiBatteryUsage.findMany({
    orderBy: { startedAt: "desc" },
    take: 250,
    include: {
      aircraft: { select: { label: true, model: true } },
      battery: { select: { labelNumber: true, lastLabelNumber: true, serialNumber: true } },
    },
  });
  const detected = records.filter((entry) => entry.source === "DJI_DETECTED").length;
  const flights = records.filter((entry) => entry.source === "DJI_FLIGHT").length;
  const batteries = new Set(records.map((entry) => entry.batteryId)).size;
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 text-slate-900">
      <header className="rounded-2xl bg-slate-900 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">DJI-Akkuhistorie</h1>
          <Link href="/admin/dji-akkus" className="rounded-lg border border-white/50 px-3 py-2 text-sm hover:bg-white/10">
            Zur Akkuverwaltung
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-200">
          Automatisch erfasste Akkukontakte mit Datum, Drohne und Akkunummer. Nur für Administratoren.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Zusammenfassung der angezeigten Einträge">
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Erkannte Akku-Tage</div><div className="text-2xl font-bold">{detected}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Unterschiedliche Akkus</div><div className="text-2xl font-bold">{batteries}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-slate-500">Erfasste Flüge</div><div className="text-2xl font-bold">{flights}</div></div>
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Wichtig: „In Drohne erkannt“ bedeutet nur, dass der Akku an diesem Tag in einer eingeschalteten
        Drohne gemeldet wurde. Es beweist keinen Start oder Flug. V8 erfasst denselben Akku
        höchstens einmal pro Kalendertag als erkannt. Die Zahl der Flüge wird erst aussagekräftig,
        wenn eine gesonderte Flugerkennung eingerichtet ist.
      </p>

      <section className="overflow-hidden rounded-2xl border bg-white" aria-label="Akkuhistorie">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Letzte Einträge</h2>
          <p className="text-sm text-slate-500">Bis zu 250 neueste Einträge, Zeiten in Deutschland (Europe/Berlin).</p>
        </div>
        {records.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">Noch keine Akkukontakte gespeichert. Sie werden bei eingehender DJI-Telemetrie automatisch erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th scope="col" className="px-4 py-3">Datum / Uhrzeit</th><th scope="col" className="px-4 py-3">Drohne</th><th scope="col" className="px-4 py-3">Akku</th><th scope="col" className="px-4 py-3">Ereignis</th><th scope="col" className="px-4 py-3">Details</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((entry) => {
                  const num = entry.battery.labelNumber ?? entry.battery.lastLabelNumber;
                  return (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-4 py-3">{berlinDate(entry.startedAt)} <span className="text-slate-500">{berlinTime(entry.startedAt)}</span></td>
                      <td className="px-4 py-3">{entry.aircraft.label} <span className="block text-xs text-slate-500">{entry.aircraft.model}</span></td>
                      <td className="whitespace-nowrap px-4 py-3">{num == null ? "Noch ohne Nummer" : `Akku ${num}`}</td>
                      <td className="px-4 py-3">{eventName(entry.source)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.source === "DJI_FLIGHT" ? (
                          <span>{entry.endedAt ? `Ende ${berlinTime(entry.endedAt)}` : "Ende noch nicht bestätigt"}
                            {entry.flightSeconds != null ? ` · ${Math.round(entry.flightSeconds / 60)} Min.` : ""}
                          </span>
                        ) : "Tageserkennung"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
