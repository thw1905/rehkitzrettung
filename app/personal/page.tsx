import { icon } from "leaflet";
import Link from "next/link";
import { title } from "process";

const items = [
  {
    href: "/my-orders",
    title: "Meine Aufträge",
    icon: "📋",
    description: "Eigene Einsätze und Aufträge ansehen",
  },
  {
     href: "/my-notifications", 
     title: "Meine Benachrichtigungen", 
     icon: "🔔" 
    },
  {
    href: "/team-members",
    title: "Mein Team",
    icon: "👥",
    description: "Team-Mitglieder und Zuordnungen",
  },
  {
    href: "/availability",
    title: "Meine Verfügbarkeit",
    icon: "📅",
    description: "Zu- und Absagen verwalten",
  },
  {
    href: "/profile",
    title: "Mein Profil",
    icon: "👤",
    description: "Persönliche Daten und Einstellungen",
  },
];

export default function PersonalPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl bg-blue-900 p-5 text-white shadow">
          <h1 className="text-2xl font-bold">
            Persönlicher Bereich
          </h1>
          <p className="mt-2 text-sm text-blue-100">
            Schnellzugriff auf deine persönlichen Bereiche
          </p>
        </div>

        <div className="grid gap-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border bg-white p-5 shadow transition hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="text-3xl">
                  {item.icon}
                </div>

                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {item.title}
                  </div>

                  <div className="text-sm text-gray-600">
                    {item.description}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}