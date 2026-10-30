"use strict";
// DJI_MENU_V11_1 – ausschließlich Navigations-Oberfläche.
// Kein Datenbank-, DJI-Telemetrie-, PinPoint-, API- oder Timer-Eingriff.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dry = process.argv.includes("--check");
const marker = "DJI_MENU_V11_1";
const choices = [
  "components/layout/app-header.tsx",
  "components/app-header.tsx",
];
const paths = [
  ["/admin/dji", "DJI-Verbindung"],
  ["/admin/dji-akkus", "Drohnen und Akkus"],
  ["/admin/dji-akku-historie", "Akkuhistorie"],
  ["/admin/dji-flugzeiten", "GPS-Flugzeiten je Fläche"],
  ["/admin/gps-test", "DJI-GPS-Test"],
];
function fail(message) { throw Error("ABBRUCH: " + message + " (keine Dateien verändert)"); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function uniqueReplacement(input, anchor, addition, where) {
  const parts = input.split(anchor);
  if (parts.length !== 2) fail("Menüanker fehlt oder mehrfach: " + where);
  return parts[0] + addition + anchor + parts[1];
}
function inspect() {
  if (!fs.existsSync(path.join(root, "package.json"))) fail("Bitte im Projektordner C:\\Projekte\\rehkitzrettung ausführen.");
  const available = choices.filter((p) => fs.existsSync(path.join(root,p)) &&
    read(p).includes("export default function AppHeader") &&
    read(p).includes("const managementNavSections = ["));
  if (available.length !== 1) fail("Aktuelle AppHeader-Datei nicht eindeutig gefunden. Bitte die Datei components/layout/app-header.tsx zeigen.");
  const rel = available[0];
  const source = read(rel);
  if (source.includes(marker)) {
    if (paths.every(([href]) => source.includes(`href: "${href}"`))) return {already:true,rel};
    fail("Menü teilweise angepasst. Bitte AppHeader prüfen.");
  }
  if (!source.includes("const personalNavSections = [") ||
      !source.includes("const managementNavSections = [") ||
      !source.includes("const operationsNavSections = [") ||
      !source.includes("const managementNavItems =") ||
      !source.includes("{managementNavSections.map(")) fail("Unbekannte Menüstruktur. Bitte nicht automatisch ändern.");
  const begin = source.indexOf("const managementNavSections = [");
  const end = source.indexOf("const managementNavItems =",begin);
  if (end <= begin) fail("Verwaltungsmenü nicht abgegrenzt.");
  const management = source.slice(begin,end);
  const exists = paths.filter(([href]) => management.includes(`href: "${href}"`));
  if (exists.length) fail("Einige DJI-Links sind schon im Verwaltungsmenü: " + exists.map(([href])=>href).join(", "));
  for(const [href] of paths) {
    if (!fs.existsSync(path.join(root,"app",href.substring(1),"page.tsx"))) {
      fail("DJI-Zielseite fehlt: " + href + ". Bitte zuerst prüfen.");
    }
  }
  return {already:false,rel,source,management};
}
function prepare(o) {
  const newline = o.source.includes("\r\n") ? "\r\n" : "\n";
  const norm = s => s.replace(/\n/g,newline);
  const section = norm(`    // ${marker}: Admin-DJI-Seiten im vorhandenen Verwaltungsmenü.\n    {\n      title: "DJI / Drohnen",\n      color: "border-sky-200 bg-sky-50 text-sky-950",\n      items: [\n        { href: "/admin/dji", label: "DJI-Verbindung" },\n        { href: "/admin/dji-akkus", label: "Drohnen und Akkus" },\n        { href: "/admin/dji-akku-historie", label: "Akkuhistorie" },\n        { href: "/admin/dji-flugzeiten", label: "GPS-Flugzeiten je Fläche" },\n        { href: "/admin/gps-test", label: "DJI-GPS-Test" },\n      ],\n    },\n`);
  const closeMatch = o.management.match(/(\r?\n)  \];(\r?\n\s*)$/);
  if (!closeMatch) fail("Verwaltungsmenü hat einen unbekannten Abschluss.");
  const oldClose = closeMatch[0];
  const newManagement = o.management.slice(0,-oldClose.length) + newline + section + oldClose;
  let source = o.source.replace(o.management,newManagement);
  // Desktop hat schon seine Navigation. Fehlt eine eigene mobile Navigation,
  // werden dieselben NavSections auf kleinen Bildschirmen erreichbar gemacht.
  const hasMobileMenu = /<nav\b[^>]*md:hidden/.test(source) ||
    /(?:MobileMenu|MobileNavigation|MobileNav)/.test(source);
  if (!hasMobileMenu) {
    const mobile = norm(`          {/* ${marker}: mobil dieselben Menüpunkte; keine zusätzlichen Rechte. */}\n          <div className="mt-2 md:hidden">\n            <details className="rounded-xl border border-gray-200 bg-white">\n              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">☰ Menü öffnen</summary>\n              <div className="max-h-[65vh] space-y-2 overflow-y-auto border-t border-gray-200 p-2">\n                {[\n                  { label: "Persönlicher Bereich", sections: personalNavSections },\n                  ...(isAdmin ? [\n                    { label: "⚙ Verwaltung", sections: managementNavSections },\n                    { label: "📊 Einsatzleitung", sections: operationsNavSections },\n                  ] : []),\n                ].map((group) => (\n                  <details key={group.label} className="rounded-lg border border-gray-200">\n                    <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-gray-900">{group.label}</summary>\n                    <div className="space-y-2 px-2 pb-2">\n                      {group.sections.map((section) => (\n                        <div key={section.title} className={\`rounded-lg border p-2 \${section.color}\`}>\n                          <div className="px-2 py-1 text-xs font-bold">{section.title}</div>\n                          <div className="space-y-1">\n                            {section.items.map((item) => (\n                              <Link key={item.href} href={item.href} className="block rounded-md bg-white/85 px-3 py-2 text-sm text-gray-900">\n                                {item.label}\n                              </Link>\n                            ))}\n                          </div>\n                        </div>\n                      ))}\n                    </div>\n                  </details>\n                ))}\n              </div>\n            </details>\n          </div>\n\n`);
    source = uniqueReplacement(source,
       norm('          <nav className="mt-3 hidden flex-wrap gap-2 md:flex">'),
       mobile,
       "Desktop-Navigation (Mobile-Menü davor)");
  }
  if (!source.includes(`// ${marker}`) || source === o.source) fail("Die Änderung wurde nicht korrekt vorbereitet.");
  return {source,mobileInserted:!hasMobileMenu};
}
try {
  const state = inspect();
  if(state.already) {console.log("DJI-Menü V11.1 ist bereits installiert. Keine Änderung.");process.exit(0);}
  const change = prepare(state);
  if(dry) {
    console.log("VORPRÜFUNG OK:",state.rel);
    console.log("DJI-Gruppe unter Verwaltung: fünf vorhandene Adminseiten.");
    console.log(change.mobileInserted ? "Mobiles Aufklappmenü wird ergänzt." : "Vorhandene mobile Navigation bleibt erhalten.");
    console.log("Keine Datenbank, API, Telemetrie, PinPoints oder Timer betroffen.");
    process.exit(0);
  }
  const backupDir = path.join(root,".backups","dji-menu-v11-1-" + new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(path.dirname(path.join(backupDir,state.rel)),{recursive:true});
  fs.copyFileSync(path.join(root,state.rel),path.join(backupDir,state.rel),fs.constants.COPYFILE_EXCL);
  try { fs.writeFileSync(path.join(root,state.rel), change.source, "utf8"); }
  catch(e) { fs.copyFileSync(path.join(backupDir,state.rel),path.join(root,state.rel));throw e; }
  console.log("DJI-Menü V11.1 installiert:",state.rel);
  console.log("Sicherung:",backupDir);
  console.log("Danach: npm.cmd run build");
} catch(e) {console.error(e.message);process.exitCode=1;}
