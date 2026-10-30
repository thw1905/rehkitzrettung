"use strict";
// DJI_MENU_V11_2: vorhandene DJI-Menueeintraege verschieben, fehlende ergaenzen.
// Aendert nur AppHeader, niemals DJI-Prozesse/Telemetrie/DB/PinPoints.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const marker = "DJI_MENU_V11_2";
const choices = ["components/layout/app-header.tsx", "components/app-header.tsx"];
const entries = [
  ["/admin/dji", "DJI-Verbindung"],
  ["/admin/dji-akkus", "Drohnen und Akkus"],
  ["/admin/dji-akku-historie", "Akkuhistorie"],
  ["/admin/dji-flugzeiten", "GPS-Flugzeiten je Fläche"],
  ["/admin/gps-test", "DJI-GPS-Test"],
];
function stop(msg) { throw new Error("ABBRUCH: " + msg + " (keine Dateien veraendert)"); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function insertBeforeOnce(input, anchor, addition, name) {
  const parts = input.split(anchor);
  if (parts.length !== 2) stop("Menueanker fehlt oder mehrfach: " + name);
  return parts[0] + addition + anchor + parts[1];
}
function inspect() {
  if (!fs.existsSync(path.join(root, "package.json"))) stop("Bitte im Rehkitzrettung-Projektordner starten.");
  const paths = choices.filter(p => fs.existsSync(path.join(root, p)) &&
    read(p).includes("export default function AppHeader") &&
    read(p).includes("const managementNavSections = ["));
  if(paths.length !== 1) stop("AppHeader nicht eindeutig gefunden (components/layout/app-header.tsx oder components/app-header.tsx).");
  const rel = paths[0], source = read(rel);
  if(source.includes(marker)) return { already: true, rel };
  if(source.includes("DJI_MENU_V11_1")) stop("V11.1 wurde schon ganz/teilweise installiert. Keine Doppelanpassung.");
  for(const anchor of ["const personalNavSections = [", "const managementNavSections = [", "const operationsNavSections = [", "const managementNavItems =", "{managementNavSections.map("])
    if(!source.includes(anchor)) stop("Menuestruktur abweichend: " + anchor);
  const start = source.indexOf("const managementNavSections = ["), end = source.indexOf("const managementNavItems =", start);
  if(start < 0 || end <= start) stop("Verwaltungsmenue nicht klar abgegrenzt.");
  const management = source.slice(start, end);
  if(!/(\r?\n)  \];(\r?\n\s*)$/.test(management)) stop("Verwaltungsmenue hat unbekannten Abschluss.");
  const absent = entries.filter(([href]) => !fs.existsSync(path.join(root, "app", href.slice(1), "page.tsx")));
  if(absent.length) stop("DJI-Seite(n) fehlen: " + absent.map(([href]) => href).join(", "));
  return { already:false, rel, source, management };
}
function prepare(state) {
  const nl = state.source.includes("\r\n") ? "\r\n" : "\n";
  let management = state.management;
  const moved = [];
  // Nur einfache, alleinstehende NavItem-Objekte verarbeiten; unbekannte Struktur wird NICHT veraendert.
  for(const [href] of entries) {
    const lines = management.split(/(?<=\n)/);
    const target = new RegExp('^[ \\t]*\\{[ \\t]*href:[ \\t]*(["\\\'])' + href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\1[ \\t]*,[ \\t]*label:[ \\t]*(["\\\'])[^"\\\']*\\2[ \\t]*\\}[ \\t]*,?[ \\t]*(?:\\/\\/[^\\r\\n]*)?\\r?\\n?$');
    let found = 0;
    const result = [];
    for(const line of lines){
      if(target.test(line)) { found++; continue; }
      result.push(line);
    }
    // Falls Eintraege vorhanden, aber nicht als einfaches Element erkennbar sind: sicher abbrechen.
    const references = (management.match(new RegExp('href[ \\t]*:[ \\t]*["\\\']' + href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\\\']', 'g')) || []).length;
    if(found !== references) stop("DJI-Eintrag mit abweichendem Format: " + href + ". Bitte die betreffende Menuezeile zeigen.");
    if(found > 1) stop("DJI-Eintrag mehrfach vorhanden: " + href + ". Bitte Menue pruefen.");
    if(found) moved.push(href);
    management = result.join("");
  }
  const section = [
    '    // ' + marker + ': alle DJI-Adminseiten zentral unter Verwaltung.',
    '    {',
    '      title: "DJI / Drohnen",',
    '      color: "border-sky-200 bg-sky-50 text-sky-950",',
    '      items: [',
    ...entries.map(([href,label]) => `        { href: "${href}", label: "${label}" },`),
    '      ],',
    '    },',
  ].join(nl) + nl;
  const close = management.match(/(\r?\n)  \];(\r?\n\s*)$/);
  if(!close) stop("Verwaltungsmenue hat unbekannten Abschluss nach Bereinigung.");
  management = management.slice(0, -close[0].length) + nl + section + close[0];
  let source = state.source.replace(state.management, management);
  const hasMobile = /<nav\b[^>]*md:hidden/.test(source) ||
    /(?:MobileMenu|MobileNavigation|MobileNav)/.test(source) ||
    /<summary\b[^>]*>[^<]*Men(?:ü|ue)\s*(?:öffnen|oeffnen)/.test(source);
  if(!hasMobile) {
    const mobile = [
      '          {/* ' + marker + ': mobil dieselben Bereiche wie am PC. */}',
      '          <div className="mt-2 md:hidden">',
      '            <details className="rounded-xl border border-gray-200 bg-white">',
      '              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">☰ Menü öffnen</summary>',
      '              <div className="max-h-[65vh] space-y-2 overflow-y-auto border-t border-gray-200 p-2">',
      '                {[',
      '                  { label: "Persönlicher Bereich", sections: personalNavSections },',
      '                  ...(isAdmin ? [',
      '                    { label: "⚙ Verwaltung", sections: managementNavSections },',
      '                    { label: "📊 Einsatzleitung", sections: operationsNavSections },',
      '                  ] : []),',
      '                ].map((group) => (',
      '                  <details key={group.label} className="rounded-lg border border-gray-200">',
      '                    <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-gray-900">{group.label}</summary>',
      '                    <div className="space-y-2 px-2 pb-2">',
      '                      {group.sections.map((part) => (',
      '                        <div key={part.title} className={`rounded-lg border p-2 ${part.color}`}>',
      '                          <div className="px-2 py-1 text-xs font-bold">{part.title}</div>',
      '                          <div className="space-y-1">',
      '                            {part.items.map((item) => (',
      '                              <Link key={item.href} href={item.href} className="block rounded-md bg-white/85 px-3 py-2 text-sm text-gray-900">',
      '                                {item.label}',
      '                              </Link>',
      '                            ))}',
      '                          </div>',
      '                        </div>',
      '                      ))}',
      '                    </div>',
      '                  </details>',
      '                ))}',
      '              </div>',
      '            </details>',
      '          </div>',
      '',
    ].join(nl) + nl;
    source = insertBeforeOnce(source, '          <nav className="mt-3 hidden flex-wrap gap-2 md:flex">', mobile, "Desktop-Navigation");
  }
  for(const [href] of entries) {
    const portion = source.slice(source.indexOf("const managementNavSections = ["), source.indexOf("const managementNavItems ="));
    const count = (portion.match(new RegExp('href: "' + href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'g')) || []).length;
    if(count !== 1) stop("DJI-Link nach Anpassung nicht eindeutig: " + href + " (" + count + ")");
  }
  if(source === state.source || !source.includes(marker)) stop("Keine gueltige Menueanpassung erstellt.");
  return { source, moved, mobileInserted: !hasMobile };
}
try {
  const state = inspect();
  if(state.already){ console.log("DJI-Menue V11.2 bereits installiert. Keine Aenderung."); process.exit(0); }
  const next = prepare(state);
  if(checkOnly){
    console.log("VORPRUEFUNG OK:", state.rel);
    console.log("Bereits vorhandene DJI-Eintraege werden verschoben:", next.moved.join(", ") || "keine");
    console.log("5 DJI-Links zentral unter Verwaltung, ohne Duplikate.");
    console.log(next.mobileInserted ? "Mobiles Menue wird ergaenzt." : "Bestehendes mobiles Menue bleibt.");
    console.log("Keine Datenbank-, MQTT-, DJI-API-, PinPoint- oder Timer-Aenderungen.");
    process.exit(0);
  }
  const backup = path.join(root,".backups", "dji-menu-v11-2-"+new Date().toISOString().replace(/[:.]/g,"-"));
  const dest = path.join(backup, state.rel);
  fs.mkdirSync(path.dirname(dest), { recursive:true });
  fs.copyFileSync(path.join(root,state.rel), dest, fs.constants.COPYFILE_EXCL);
  try{ fs.writeFileSync(path.join(root,state.rel),next.source,"utf8"); }
  catch(e){ fs.copyFileSync(dest,path.join(root,state.rel)); throw e; }
  console.log("DJI-Menue V11.2 installiert:",state.rel);
  console.log("Sicherung:",backup);
  console.log("Danach npm.cmd run build.");
} catch(e){ console.error(e.message); process.exitCode=1; }
