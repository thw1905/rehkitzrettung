"use strict";
// DJI_BATTERY_HISTORY_V9: read-only history page. NO schema/worker/Map/WS changes.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dry = process.argv.includes("--check");
const PAGE = "app/admin/dji-akku-historie/page.tsx";
const UI = "components/admin/dji-battery-inventory-client.tsx";
const MARK = "DJI_BATTERY_HISTORY_V9";
const page = "// DJI_BATTERY_HISTORY_V9\n// Read-only administrator view of automatic daily battery detections.\n// An OSD battery detection is NOT proof of a flight.\nimport Link from \"next/link\";\nimport { redirect } from \"next/navigation\";\nimport { getCurrentUserWithTeams } from \"@/lib/current-user\";\nimport { db } from \"@/lib/db\";\n\nexport const dynamic = \"force-dynamic\";\nexport const metadata = { title: \"DJI Akkuhistorie – Rehkitzrettung\" };\n\nfunction berlinDate(date: Date): string {\n  return new Intl.DateTimeFormat(\"de-DE\", {\n    timeZone: \"Europe/Berlin\", day: \"2-digit\", month: \"2-digit\", year: \"numeric\",\n  }).format(date);\n}\nfunction berlinTime(date: Date): string {\n  return new Intl.DateTimeFormat(\"de-DE\", {\n    timeZone: \"Europe/Berlin\", hour: \"2-digit\", minute: \"2-digit\",\n  }).format(date);\n}\nfunction eventName(source: string): string {\n  switch (source) {\n    case \"DJI_DETECTED\": return \"In Drohne erkannt\";\n    case \"DJI_FLIGHT\": return \"Flug per DJI-Telemetrie\";\n    case \"DJI_MQTT\": return \"DJI-Telemetrie\";\n    default: return `Gespeicherter Eintrag (${source})`;\n  }\n}\n\nexport default async function DjiBatteryHistoryPage() {\n  const user = await getCurrentUserWithTeams();\n  if (!user?.isApproved || !user.isAdmin) redirect(\"/\");\n\n  const records = await db.djiBatteryUsage.findMany({\n    orderBy: { startedAt: \"desc\" },\n    take: 250,\n    include: {\n      aircraft: { select: { label: true, model: true } },\n      battery: { select: { labelNumber: true, lastLabelNumber: true, serialNumber: true } },\n    },\n  });\n  const detected = records.filter((entry) => entry.source === \"DJI_DETECTED\").length;\n  const flights = records.filter((entry) => entry.source === \"DJI_FLIGHT\").length;\n  const batteries = new Set(records.map((entry) => entry.batteryId)).size;\n  return (\n    <main className=\"mx-auto max-w-5xl space-y-5 px-4 py-6 text-slate-900\">\n      <header className=\"rounded-2xl bg-slate-900 p-5 text-white\">\n        <div className=\"flex flex-wrap items-center justify-between gap-3\">\n          <h1 className=\"text-2xl font-bold\">DJI-Akkuhistorie</h1>\n          <Link href=\"/admin/dji-akkus\" className=\"rounded-lg border border-white/50 px-3 py-2 text-sm hover:bg-white/10\">\n            Zur Akkuverwaltung\n          </Link>\n        </div>\n        <p className=\"mt-2 text-sm text-slate-200\">\n          Automatisch erfasste Akkukontakte mit Datum, Drohne und Akkunummer. Nur für Administratoren.\n        </p>\n      </header>\n\n      <section className=\"grid grid-cols-1 gap-3 sm:grid-cols-3\" aria-label=\"Zusammenfassung der angezeigten Einträge\">\n        <div className=\"rounded-xl border bg-white p-4\"><div className=\"text-sm text-slate-500\">Erkannte Akku-Tage</div><div className=\"text-2xl font-bold\">{detected}</div></div>\n        <div className=\"rounded-xl border bg-white p-4\"><div className=\"text-sm text-slate-500\">Unterschiedliche Akkus</div><div className=\"text-2xl font-bold\">{batteries}</div></div>\n        <div className=\"rounded-xl border bg-white p-4\"><div className=\"text-sm text-slate-500\">Erfasste Flüge</div><div className=\"text-2xl font-bold\">{flights}</div></div>\n      </section>\n\n      <p className=\"rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950\">\n        Wichtig: „In Drohne erkannt“ bedeutet nur, dass der Akku an diesem Tag in einer eingeschalteten\n        Drohne gemeldet wurde. Es beweist keinen Start oder Flug. V8 erfasst denselben Akku\n        höchstens einmal pro Kalendertag als erkannt. Die Zahl der Flüge wird erst aussagekräftig,\n        wenn eine gesonderte Flugerkennung eingerichtet ist.\n      </p>\n\n      <section className=\"overflow-hidden rounded-2xl border bg-white\" aria-label=\"Akkuhistorie\">\n        <div className=\"border-b px-4 py-3\">\n          <h2 className=\"text-lg font-semibold\">Letzte Einträge</h2>\n          <p className=\"text-sm text-slate-500\">Bis zu 250 neueste Einträge, Zeiten in Deutschland (Europe/Berlin).</p>\n        </div>\n        {records.length === 0 ? (\n          <p className=\"px-4 py-6 text-sm text-slate-600\">Noch keine Akkukontakte gespeichert. Sie werden bei eingehender DJI-Telemetrie automatisch erfasst.</p>\n        ) : (\n          <div className=\"overflow-x-auto\">\n            <table className=\"w-full min-w-[640px] border-collapse text-left text-sm\">\n              <thead className=\"bg-slate-50 text-slate-600\">\n                <tr><th scope=\"col\" className=\"px-4 py-3\">Datum / Uhrzeit</th><th scope=\"col\" className=\"px-4 py-3\">Drohne</th><th scope=\"col\" className=\"px-4 py-3\">Akku</th><th scope=\"col\" className=\"px-4 py-3\">Ereignis</th><th scope=\"col\" className=\"px-4 py-3\">Details</th></tr>\n              </thead>\n              <tbody className=\"divide-y divide-slate-100\">\n                {records.map((entry) => {\n                  const num = entry.battery.labelNumber ?? entry.battery.lastLabelNumber;\n                  return (\n                    <tr key={entry.id}>\n                      <td className=\"whitespace-nowrap px-4 py-3\">{berlinDate(entry.startedAt)} <span className=\"text-slate-500\">{berlinTime(entry.startedAt)}</span></td>\n                      <td className=\"px-4 py-3\">{entry.aircraft.label} <span className=\"block text-xs text-slate-500\">{entry.aircraft.model}</span></td>\n                      <td className=\"whitespace-nowrap px-4 py-3\">{num == null ? \"Noch ohne Nummer\" : `Akku ${num}`}</td>\n                      <td className=\"px-4 py-3\">{eventName(entry.source)}</td>\n                      <td className=\"px-4 py-3 text-slate-600\">\n                        {entry.source === \"DJI_FLIGHT\" ? (\n                          <span>{entry.endedAt ? `Ende ${berlinTime(entry.endedAt)}` : \"Ende noch nicht bestätigt\"}\n                            {entry.flightSeconds != null ? ` · ${Math.round(entry.flightSeconds / 60)} Min.` : \"\"}\n                          </span>\n                        ) : \"Tageserkennung\"}\n                      </td>\n                    </tr>\n                  );\n                })}\n              </tbody>\n            </table>\n          </div>\n        )}\n      </section>\n    </main>\n  );\n}\n";
const anchor = '<h1 className="text-2xl font-bold">Drohnen- und Akkuverwaltung</h1>';
const link = `          {/* ${MARK}: read-only history; only administrator page grants access. */}
          <a href="/admin/dji-akku-historie" className="mt-3 inline-block rounded-lg border border-white/50 px-3 py-2 text-sm text-white hover:bg-white/10">Akkuhistorie ansehen</a>`;
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function fail(message) { throw new Error(message + " Keine Dateien geaendert."); }
function check() {
  for (const rel of ["package.json", "prisma/schema.prisma", UI, "app/admin/dji-akkus/page.tsx", "scripts/dji-akku-mqtt-v2.cjs"]) {
    if (!fs.existsSync(path.join(root, rel))) fail("Projektdatei fehlt: " + rel);
  }
  const schema = read("prisma/schema.prisma");
  if (!/model\s+DjiBatteryUsage\s*\{/.test(schema) || !/model\s+DjiBattery\s*\{/.test(schema)) fail("Prisma-Akkumodelle fehlen.");
  if (!read("scripts/dji-akku-mqtt-v2.cjs").includes('source: "DJI_DETECTED"')) fail("V8-Tageserkennung fehlt; zuerst bestehenden Telemetriecode pruefen.");
  const current = read(UI);
  const pageExists = fs.existsSync(path.join(root, PAGE));
  if (current.includes(MARK) && pageExists && read(PAGE) === page) return { already: true };
  if (current.includes(MARK) || pageExists) fail("Bereits vorhandene oder teilweise installierte Historie. Bitte Dateistand pruefen.");
  if (current.split(anchor).length !== 2) fail("Admin-Oberflaeche weicht ab; Ueberschrift nicht eindeutig.");
  return { already: false, next: current.replace(anchor, anchor + "\n" + link) };
}
try {
  const state = check();
  if (state.already) { console.log("V9 bereits installiert; keine Aenderungen."); process.exit(0); }
  if (dry) {
    console.log("VORPRUEFUNG OK: neue schreibgeschuetzte Admin-Akkuhistorie und Link zur Verwaltung.");
    console.log("Keine Datenbankmigration, keine Aenderung an Akkuerkennung, Empfehlungen, PinPoints, WS oder MQTT.");
    process.exit(0);
  }
  const backup = path.join(root, ".backups", "dji-akkuhistorie-v9-" + new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(path.join(backup, path.dirname(UI)), { recursive: true });
  fs.copyFileSync(path.join(root, UI), path.join(backup, UI), fs.constants.COPYFILE_EXCL);
  let created = false;
  try {
    fs.mkdirSync(path.dirname(path.join(root, PAGE)), { recursive: true });
    fs.writeFileSync(path.join(root, PAGE), page, { flag: "wx", encoding: "utf8" });
    created = true;
    fs.writeFileSync(path.join(root, UI), state.next, "utf8");
  } catch (error) {
    try { fs.copyFileSync(path.join(backup, UI), path.join(root, UI)); } catch (e) { console.error("Ruecksicherung der Admin-Oberflaeche fehlgeschlagen:", e.message); }
    if (created) try { fs.unlinkSync(path.join(root, PAGE)); } catch (e) { console.error("Ruecksicherung der Historienseite fehlgeschlagen:", e.message); }
    throw error;
  }
  console.log("V9 installiert. Sicherung: " + backup);
  console.log("Nur Leseansicht: Automatische Tageserkennungen, keine behaupteten Fluege.");
  console.log("Naechster Schritt: npm run build, dann git commit/push.");
} catch (error) {
  console.error("ABBRUCH:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
