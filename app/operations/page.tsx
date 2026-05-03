import { icon } from "leaflet";
import Link from "next/link";
import { title } from "process";

const sections = [
  {
    title: "Übersicht",
    items: [
      { href: "/dashboard", title: "Dashboard", icon: "🏠" },
    ],
  },
  {
    title: "Einsatz",
    items: [
      { href: "/day-assignments", title: "Auftragszuordnung", icon: "🧭" },
      { href: "/team-planning", title: "Teamplanung", icon: "👥" },
    ],
  },
  {
    title: "Auswertung",
    items: [
      { href: "/statistics", title: "Statistik", icon: "📊" },
    ],
  },
  {
    title: "Einstellungen",
    items: [
      { href: "/notifications", title: "Benachrichtigungen", icon: "🔔"},
      { href: "/availability/admin", title: "Verfügbarkeit Admin", icon: "📅" },
      { href: "/team-slots", title: "Team-Slots", icon: "🧩" },
      { href: "/admin/field-import", title: "KML-Import", icon: "🗺️" },
    ],
  },
];

export default function OperationsPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow">
          <h1 className="text-2xl font-bold">Einsatzleitung</h1>
          <p className="mt-2 text-sm text-slate-100">
            Planung, Zuordnung und Auswertung
          </p>
        </div>

        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {section.title}
            </div>

            <div className="grid gap-4">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border bg-white p-5 shadow transition hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{item.icon}</div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {item.title}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}