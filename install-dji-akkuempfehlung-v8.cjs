"use strict";
// DJI_BATTERY_GLOBAL_V8: narrow, guarded, reversible integration.
// Does not touch Prisma schema, migrations, map, WebSocket, MQTT credentials or DJI APIs.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const FILES = {"app/api/dji/pilot2/battery-overlay/route.ts":"// DJI_BATTERY_GLOBAL_V8: cycle-based pilot recommendation on all pages.\n// No battery serial numbers or administrative fields are returned to pilots.\nimport { NextRequest, NextResponse } from \"next/server\";\nimport { db } from \"@/lib/db\";\nimport { getCurrentUserWithTeams } from \"@/lib/current-user\";\n\nexport const runtime = \"nodejs\";\nexport const dynamic = \"force-dynamic\";\nconst headers = { \"Cache-Control\": \"private, no-store\", \"X-Content-Type-Options\": \"nosniff\" };\n\nfunction germanDay(value: Date): string {\n  const parts = new Intl.DateTimeFormat(\"en-GB\", {\n    timeZone: \"Europe/Berlin\", year: \"numeric\", month: \"2-digit\", day: \"2-digit\",\n  }).formatToParts(value);\n  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? \"\";\n  return `${part(\"year\")}-${part(\"month\")}-${part(\"day\")}`;\n}\n\nexport async function GET(req: NextRequest) {\n  const user = await getCurrentUserWithTeams();\n  if (!user?.isApproved || (!user.isAdmin && user.role !== \"PILOT\")) {\n    return NextResponse.json({ error: \"Nicht berechtigt.\" }, { status: 403, headers });\n  }\n  try {\n    const aircraft = await db.djiAircraft.findMany({\n      where: { isActive: true }, orderBy: { label: \"asc\" },\n      select: {\n        id: true, label: true,\n        batteries: {\n          where: { status: \"ACTIVE\", labelNumber: { not: null } },\n          select: { id: true, labelNumber: true, cycles: true, lastSeenAt: true },\n        },\n      },\n    });\n    // Auto-created DJI labels may contain serial-number fragments. Mask them for pilots.\n    const drones = aircraft.map(({ id, label }, index) => ({\n      id,\n      label: /^DJI(?: [A-Za-z0-9-]+)? \\([A-Za-z0-9_-]{8,}\\)$/.test(label)\n        ? `Drohne ${index + 1} (${label.replace(/ \\(.+\\)$/, \"\")})` : label,\n    }));\n    const requested = req.nextUrl.searchParams.get(\"aircraftId\") ?? \"\";\n    const selected = aircraft.find((a) => a.id === requested) ??\n      (!requested && aircraft.length === 1 ? aircraft[0] : null);\n    if (!selected) {\n      return NextResponse.json({\n        drones, aircraftId: null, aircraftLabel: null, currentNumber: null,\n        nextNumber: null, phase: \"SELECT_AIRCRAFT\", remaining: 0,\n      }, { headers });\n    }\n\n    const now = new Date();\n    const today = germanDay(now);\n    // Two days comfortably cover a complete Europe/Berlin calendar day, including DST changes.\n    const records = await db.djiBatteryUsage.findMany({\n      where: { aircraftId: selected.id, startedAt: { gte: new Date(now.getTime() - 48 * 3600_000) } },\n      select: { batteryId: true, startedAt: true },\n    });\n    const usedToday = new Set(records.filter((r) => germanDay(r.startedAt) === today).map((r) => r.batteryId));\n    const current = selected.batteries\n      .filter((b) => b.lastSeenAt !== null && now.getTime() - b.lastSeenAt.getTime() >= 0 && now.getTime() - b.lastSeenAt.getTime() < 4 * 60_000)\n      .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];\n\n    const eligible = selected.batteries\n      .filter((b) => b.cycles !== null && b.cycles >= 0 && !usedToday.has(b.id) && b.id !== current?.id)\n      .sort((a, b) => (a.cycles ?? 0) - (b.cycles ?? 0)\n        || (a.lastSeenAt?.getTime() ?? 0) - (b.lastSeenAt?.getTime() ?? 0)\n        || (a.labelNumber ?? 0) - (b.labelNumber ?? 0));\n    const next = eligible[0];\n    const phase = usedToday.size > 0 || current ? \"NEXT_CHANGE\" : \"FIRST_START\";\n    const missingData = selected.batteries.some((b) => b.cycles === null);\n    const hasBatteries = selected.batteries.length > 0;\n    return NextResponse.json({\n      drones, aircraftId: selected.id, aircraftLabel: drones.find((d) => d.id === selected.id)?.label ?? \"Drohne\",\n      currentNumber: current?.labelNumber ?? null,\n      nextNumber: next?.labelNumber ?? null,\n      phase, remaining: eligible.length,\n      reason: !next ? (!hasBatteries ? \"Keine nummerierten Akkus erfasst.\"\n        : missingData ? \"Bei vorhandenen Akkus fehlen noch Ladezyklen.\"\n        : \"Kein weiterer heute unbenutzter Akku bekannt.\") : null,\n    }, { headers });\n  } catch (error) {\n    console.error(\"DJI Akkuempfehlung V8: Datenbankabfrage fehlgeschlagen\", error instanceof Error ? error.message : \"Fehler\");\n    return NextResponse.json({ error: \"Akkuempfehlung momentan nicht verfuegbar.\" }, { status: 503, headers });\n  }\n}\n","components/dji/DjiGlobalBatteryRecommendation.tsx":"\"use client\";\n// DJI_BATTERY_GLOBAL_V8: unobtrusive global pilot overlay, including DJI Pilot 2 webview.\nimport { useCallback, useEffect, useRef, useState } from \"react\";\nimport { usePathname } from \"next/navigation\";\n\ntype Drone = { id: string; label: string };\ntype Recommendation = {\n  drones: Drone[];\n  aircraftId: string | null;\n  aircraftLabel: string | null;\n  currentNumber: number | null;\n  nextNumber: number | null;\n  remaining: number;\n  phase: \"FIRST_START\" | \"NEXT_CHANGE\" | \"SELECT_AIRCRAFT\";\n  reason?: string | null;\n};\nconst STORAGE_KEY = \"rk-dji-preferred-aircraft\";\nconst UPDATE_EVENT = \"rk-dji-aircraft-change\";\n\nexport default function DjiGlobalBatteryRecommendation() {\n  const pathname = usePathname();\n  const [choice, setChoice] = useState(\"\");\n  const [data, setData] = useState<Recommendation | null>(null);\n  const [minimized, setMinimized] = useState(false);\n  const [refreshKey, setRefreshKey] = useState(0);\n  const prevRecommendation = useRef(\"\");\n\n  // Bridge detection in PilotSimpleClient writes the same key and signals this event.\n  useEffect(() => {\n    const sync = () => setChoice(window.localStorage.getItem(STORAGE_KEY) || \"\");\n    sync();\n    window.addEventListener(UPDATE_EVENT, sync);\n    window.addEventListener(\"storage\", sync);\n    return () => {\n      window.removeEventListener(UPDATE_EVENT, sync);\n      window.removeEventListener(\"storage\", sync);\n    };\n  }, []);\n\n  const load = useCallback(async (alive: () => boolean) => {\n    try {\n      const query = choice ? `?aircraftId=${encodeURIComponent(choice)}` : \"\";\n      const response = await fetch(`/api/dji/pilot2/battery-overlay${query}`, { cache: \"no-store\", credentials: \"same-origin\" });\n      if (!response.ok) {\n        if (alive()) setData(null);\n        return;\n      }\n      const result = await response.json() as Recommendation;\n      if (!alive()) return;\n      setData(result);\n      const nextKey = result.aircraftId && result.nextNumber !== null\n        ? `${result.aircraftId}:${result.phase}:${result.nextNumber}` : \"\";\n      if (nextKey && prevRecommendation.current && nextKey !== prevRecommendation.current) setMinimized(false);\n      prevRecommendation.current = nextKey;\n    } catch {\n      if (alive()) setData(null);\n    }\n  }, [choice]);\n\n  useEffect(() => {\n    let active = true;\n    const alive = () => active;\n    const update = () => void load(alive);\n    update();\n    const timer = window.setInterval(update, 15_000);\n    window.addEventListener(\"focus\", update);\n    document.addEventListener(\"visibilitychange\", update);\n    return () => {\n      active = false;\n      window.clearInterval(timer);\n      window.removeEventListener(\"focus\", update);\n      document.removeEventListener(\"visibilitychange\", update);\n    };\n  }, [pathname, load, refreshKey]);\n\n  function changeAircraft(id: string) {\n    setChoice(id);\n    window.localStorage.setItem(STORAGE_KEY, id);\n    window.dispatchEvent(new Event(UPDATE_EVENT));\n    setMinimized(false);\n  }\n\n  // No overlay for unauthenticated, unapproved or non-pilot users (API returns 403).\n  if (!data || data.drones.length === 0) return null;\n  const chosen = Boolean(data.aircraftId);\n  const mainText = data.nextNumber !== null ? `Akku ${data.nextNumber}` : \"Keine Empfehlung\";\n  return (\n    <aside aria-label=\"DJI Akkuempfehlung\" className=\"pointer-events-none fixed bottom-3 right-3 z-[9999] w-[min(350px,calc(100vw-24px))] text-slate-900\">\n      <section className=\"pointer-events-auto overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl\">\n        <div className=\"flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-sm font-semibold text-white\">\n          <span>🔋 DJI-Akkuempfehlung</span>\n          <button type=\"button\" onClick={() => setMinimized((value) => !value)}\n            aria-label={minimized ? \"Akkuempfehlung aufklappen\" : \"Akkuempfehlung minimieren\"}\n            className=\"rounded px-2 py-1 text-white hover:bg-slate-700\">\n            {minimized ? \"Öffnen\" : \"Minimieren\"}\n          </button>\n        </div>\n        {minimized ? (\n          <button type=\"button\" className=\"block w-full px-3 py-3 text-left text-sm font-semibold\"\n            onClick={() => setMinimized(false)}>\n            {chosen ? `${data.aircraftLabel}: ${mainText}` : \"Drohne für Akkuempfehlung wählen\"}\n          </button>\n        ) : (\n          <div className=\"space-y-3 px-3 py-3 text-sm\" aria-live=\"polite\">\n            <label className=\"block text-xs font-medium text-slate-600\">\n              Drohne\n              <select className=\"mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900\"\n                value={data.aircraftId || \"\"} onChange={(event) => changeAircraft(event.target.value)}>\n                <option value=\"\">Drohne auswählen</option>\n                {data.drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.label}</option>)}\n              </select>\n            </label>\n            {chosen ? (\n              <>\n                <p className=\"text-xs text-slate-600\">\n                  {data.phase === \"FIRST_START\" ? \"Vor dem ersten Start verwenden\" : \"Beim nächsten Akkuwechsel verwenden\"}\n                </p>\n                <div className=\"text-2xl font-bold\">{mainText}</div>\n                {data.currentNumber !== null && <p className=\"text-xs text-slate-700\">Aktuell eingesetzt: Akku {data.currentNumber}</p>}\n                {data.nextNumber === null && <p className=\"text-xs text-amber-800\">{data.reason || \"Kein weiterer geeigneter Akku bekannt.\"}</p>}\n              </>\n            ) : <p className=\"text-xs text-slate-600\">Vor dem ersten Start die Drohne auswählen. Die letzte Auswahl wird auf diesem Gerät gespeichert.</p>}\n            <div className=\"flex justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500\">\n              <span>Reihenfolge nach Ladezyklen</span>\n              <button type=\"button\" className=\"font-semibold text-slate-700 underline\" onClick={() => setRefreshKey((v) => v + 1)}>\n                Aktualisieren\n              </button>\n            </div>\n          </div>\n        )}\n      </section>\n    </aside>\n  );\n}\n"};
const workerHelper = "// DJI_BATTERY_GLOBAL_V8: \"today used\" means detected in the aircraft today, not proven in-flight.\n// The day boundary is Europe/Berlin. Detection alone must not count as a flown mission.\nconst v8Recorded = new Set();\nfunction v8GermanDay(date) {\n  const parts = new Intl.DateTimeFormat(\"en-GB\", {\n    timeZone: \"Europe/Berlin\", year: \"numeric\", month: \"2-digit\", day: \"2-digit\",\n  }).formatToParts(date);\n  const part = (name) => parts.find((p) => p.type === name)?.value || \"\";\n  return `${part(\"year\")}-${part(\"month\")}-${part(\"day\")}`;\n}\nasync function v8MarkDetectedToday(db, aircraftId, batteryId, now) {\n  const day = v8GermanDay(now);\n  const key = `${batteryId}:${day}`;\n  if (v8Recorded.has(key)) return;\n  const existing = await db.djiBatteryUsage.findMany({\n    where: { batteryId, startedAt: { gte: new Date(now.getTime() - 48 * 3600_000) } },\n    select: { startedAt: true },\n  });\n  if (!existing.some((item) => v8GermanDay(item.startedAt) === day)) {\n    await db.djiBatteryUsage.create({\n      data: { aircraftId, batteryId, startedAt: now, source: \"DJI_DETECTED\" },\n    });\n    console.log(\"AKKU HEUTE ERKANNT: Einsatzwechsel-Empfehlung wird aktualisiert.\");\n  }\n  v8Recorded.add(key);\n}\n\n";
const marker = "DJI_BATTERY_GLOBAL_V8";
const workerPath = "scripts/dji-akku-mqtt-v2.cjs";
const pilotPath = "components/dji/PilotSimpleClient.tsx";
const layoutPath = "app/layout.tsx";
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function once(input, before, after, rel) {
  if (input.split(before).length !== 2) throw Error("Erwarteter Codeabschnitt fehlt/mehrfach: " + rel + " / " + before.slice(0, 65));
  return input.replace(before, after);
}
function validate() {
  for (const f of ["package.json", "prisma/schema.prisma", workerPath, pilotPath, layoutPath]) {
    if (!exists(f)) throw Error("Datei fehlt: " + f);
  }
  const schema = read("prisma/schema.prisma");
  if (!["DjiAircraft", "DjiBattery", "DjiBatteryUsage"].every((model) => schema.includes("model " + model + " {"))) {
    throw Error("Die drei DJI-Akkumodelle fehlen.");
  }
  const worker = read(workerPath), pilot = read(pilotPath), layout = read(layoutPath);
  const already = layout.includes(marker) && worker.includes(marker) && pilot.includes(marker)
    && Object.keys(FILES).every(exists);
  if (already) return { already: true };
  if ([worker, pilot, layout].some((s) => s.includes(marker)) || Object.keys(FILES).some(exists)) {
    throw Error("Teilinstallation oder bereits vorhandene V8-Dateien. Keine Änderung.");
  }
  if (!worker.includes("DJI_AUTOERKENNUNG_V5") || !pilot.includes("DJI_AIRCRAFT_JSBRIDGE_V7")) {
    throw Error("V5-MQTT-Worker oder V7-Drohnenerkennung fehlt.");
  }
  if (!layout.includes("</body>") || layout.split("</body>").length !== 2) {
    throw Error("Root-Layout hat keine eindeutige </body>-Stelle.");
  }
  const needed = [
    [worker, "function selfTest() {", "Worker Hilfsfunktion"],
    [worker, "  await db.djiBattery.update({ where: { id: battery.id }, data });", "Worker Datenbankupdate"],
    [pilot, "setSelectedAircraft(detected.aircraft.id);", "V7 Drohnenerkennung"],
    [pilot, "{selectedAircraft && batteryRecommendation && (", "Alte Akkuanzeige"],
  ];
  for (const [content, anchor, description] of needed) {
    if (content.split(anchor).length !== 2) throw Error("Datei weicht ab: " + description + ". Keine Änderung.");
  }
  return { already: false, worker, pilot, layout };
}
function transform(current) {
  const next = { ...FILES };
  let worker = once(current.worker, "function selfTest() {", workerHelper + "function selfTest() {", workerPath);
  worker = once(worker,
    "  await db.djiBattery.update({ where: { id: battery.id }, data });",
    "  await db.djiBattery.update({ where: { id: battery.id }, data });\n" +
    "  // DJI_BATTERY_GLOBAL_V8: sichtbarer, aktiver Akku gilt als heute eingesetzt.\n" +
    "  if (battery.status === \"ACTIVE\" && battery.labelNumber != null) {\n" +
    "    await v8MarkDetectedToday(db, drone.id, battery.id, new Date(now));\n" +
    "  }", workerPath);
  next[workerPath] = worker;
  let pilot = once(current.pilot,
    "setSelectedAircraft(detected.aircraft.id);",
    "setSelectedAircraft(detected.aircraft.id);\n" +
    "        // DJI_BATTERY_GLOBAL_V8: mit dem seitenweiten Overlay synchronisieren.\n" +
    "        window.localStorage.setItem(\"rk-dji-preferred-aircraft\", detected.aircraft.id);\n" +
    "        window.dispatchEvent(new Event(\"rk-dji-aircraft-change\"));", pilotPath);
  pilot = once(pilot,
    "{selectedAircraft && batteryRecommendation && (",
    "{/* DJI_BATTERY_GLOBAL_V8: die bisherige, ladestandsabhaengige Empfehlung ausblenden. */}\n              {false && selectedAircraft && batteryRecommendation && (", pilotPath);
  next[pilotPath] = pilot;
  let layout = current.layout;
  const importLine = 'import DjiGlobalBatteryRecommendation from "@/components/dji/DjiGlobalBatteryRecommendation";\n';
  // Preserve possible directives at top of root layout.
  if (/^\s*["']use client["'];/.test(layout)) {
    layout = layout.replace(/^(\s*["']use client["'];\s*\n)/, "$1" + importLine);
  } else {
    layout = importLine + layout;
  }
  layout = once(layout, "</body>",
    "  {/* DJI_BATTERY_GLOBAL_V8: always available to authenticated pilots. */}\n" +
    "  <DjiGlobalBatteryRecommendation />\n</body>", layoutPath);
  next[layoutPath] = layout;
  return next;
}
try {
  const current = validate();
  if (current.already) {
    console.log("DJI Akkuempfehlung V8 ist bereits installiert. Keine Aenderung.");
    process.exit(0);
  }
  const next = transform(current);
  if (checkOnly) {
    console.log("VORPRUEFUNG OK: zwei neue Dateien, App-Layout, DJI-Oberflaeche, V5-Akkuempfaenger.");
    console.log("Empfehlung vor Start nach Ladezyklen; bei Wechsel heute erkannte Akkus ausschliessen.");
    console.log("Keine Schema-Migration, keine Aenderung an DJI-Karten-/PinPoint-APIs oder Mosquitto.");
    process.exit(0);
  }
  const backup = path.join(root, ".backups", "dji-akkuempfehlung-v8-" + new Date().toISOString().replace(/[:.]/g, "-"));
  const processed = [];
  for (const [rel, content] of Object.entries(next)) {
    const target = path.join(root, rel);
    const saved = path.join(backup, rel);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.copyFileSync(target, saved, fs.constants.COPYFILE_EXCL);
      }
      fs.writeFileSync(target, content, { flag: fs.existsSync(target) ? "w" : "wx", encoding: "utf8" });
      processed.push(rel);
    } catch (err) {
      for (const rel2 of processed.reverse()) {
        const saved2 = path.join(backup, rel2);
        const target2 = path.join(root, rel2);
        try { if (fs.existsSync(saved2)) fs.copyFileSync(saved2, target2); else fs.unlinkSync(target2); }
        catch (e) { console.error("MANUELLE RUECKSICHERUNG ERFORDERLICH:", rel2); }
      }
      throw err;
    }
  }
  console.log("V8 installiert. Sicherungen: " + backup);
  console.log("Noch nicht deployed. Bitte npm run build und danach erst git commit/push.");
  console.log("HINWEIS: Eine heute erkannte Batterie wird als eingesetzt markiert, NICHT als geflogen.");
} catch (err) {
  console.error("ABBRUCH: " + (err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
}
