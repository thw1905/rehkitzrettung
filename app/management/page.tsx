import Link from "next/link";

const sections = [
  {
    title: "Verwaltung",
    items: [
      { href: "/orders", title: "Aufträge", icon: "📋" },
      { href: "/helpers", title: "Helfer", icon: "👥" },
      { href: "/fields", title: "Flächen", icon: "🌾" },
      { href: "/owners", title: "Ansprechpartner", icon: "☎️" },
    ],
  },
];

export default function ManagementPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow">
          <h1 className="text-2xl font-bold">Verwaltung</h1>
          <p className="mt-2 text-sm text-slate-100">
            Aufträge, Helfer, Flächen und Ansprechpartner
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