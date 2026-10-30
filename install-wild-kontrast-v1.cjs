#!/usr/bin/env node
"use strict";
// Rehkitzrettung – kontraststarke Darstellung der Wild-Sicherungsorte.
// Ausschliesslich vier neue TSX-Ansichten; keine Datenbank-/API-Aenderung.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const check = process.argv.includes('--check');
const marker = 'REHKITZ_WILD_KONTRAST_V1';
const edits = {
  'components/orders/SecuredWildCaptureModal.tsx': [
    ['max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4', 'max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-950 shadow-2xl space-y-4'],
    ['<h2 className="text-xl font-bold">Wild-Sicherungsort erfassen?</h2>', '<h2 className="text-xl font-bold text-slate-950">Wild-Sicherungsort erfassen?</h2>'],
    ['<p>Du hast gesichertes Wild erfasst.', '<p className="text-base leading-relaxed text-slate-900">Du hast gesichertes Wild erfasst.'],
    ['className="w-full rounded-xl bg-green-700 p-3 font-semibold text-white disabled:opacity-50"', 'className="w-full rounded-xl bg-green-800 p-3 font-semibold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800 disabled:opacity-50"'],
    ['className="w-full rounded-xl border p-3"', 'className="w-full rounded-xl border border-slate-500 bg-white p-3 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"'],
    ['className="text-xs text-gray-600"', 'className="text-sm leading-relaxed text-slate-700"'],
    ['className="font-semibold text-green-800"', 'className="font-semibold text-green-900"'],
    ['className="text-sm">GPS-Genauigkeit', 'className="text-sm text-slate-900">GPS-Genauigkeit'],
    ['className="text-sm text-red-700"', 'className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-900"'],
  ],
  'components/orders/WildSiteShare.tsx': [
    ['className="space-y-3 rounded-xl border p-3"', 'className="space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3 text-slate-950"'],
    ['className="font-semibold text-red-700"', 'className="font-semibold text-red-900"'],
    ['className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white"', 'className="rounded-xl bg-green-800 px-4 py-2 font-semibold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800"'],
    ['className="rounded-xl border px-4 py-2"', 'className="rounded-xl border border-slate-500 bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"'],
    ['className="block text-xs">Freigabelink', 'className="block text-sm font-semibold text-slate-900">Freigabelink'],
    ['className="mt-1 w-full rounded-lg border p-2 text-xs"', 'className="mt-1 w-full rounded-lg border border-slate-500 bg-white p-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-800"'],
    ['className="inline-block rounded-xl bg-white p-3"', 'className="inline-block rounded-xl bg-white p-3 ring-1 ring-slate-300"'],
    ['className="text-xs text-gray-600"', 'className="text-sm leading-relaxed text-slate-700"'],
    ['className="text-sm text-red-700"', 'className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-900"'],
  ],
  'components/orders/WildSitesList.tsx': [
    ['className="mx-auto max-w-3xl space-y-4 p-4 md:p-6"', 'className="mx-auto max-w-3xl space-y-4 rounded-xl bg-white p-4 text-slate-950 md:p-6"'],
    ['className="text-sm underline"', 'className="text-sm font-semibold text-green-900 underline"'],
    ['className="text-2xl font-bold"', 'className="text-2xl font-bold text-slate-950"'],
    ['className="text-sm text-gray-600"', 'className="text-sm leading-relaxed text-slate-700"'],
    ['className="rounded-lg border p-2 text-sm"', 'className="rounded-lg border border-slate-500 bg-white p-2 text-sm font-semibold text-slate-950 hover:bg-slate-100"'],
    ['className="text-red-700"', 'className="rounded-lg bg-red-50 p-2 font-semibold text-red-900"'],
    ['className="rounded-xl border bg-white p-4 space-y-2"', 'className="rounded-xl border border-slate-300 bg-white p-4 text-slate-950 shadow-sm space-y-2"'],
    ['className="font-semibold">{s.rehkitzeGesichert}', 'className="font-semibold text-slate-950">{s.rehkitzeGesichert}'],
    ['className="text-xs text-gray-600"', 'className="text-sm text-slate-700"'],
    ['className="flex gap-3"', 'className="flex flex-wrap gap-3"'],
    ['className="rounded-lg bg-green-700 px-4 py-2 text-white"', 'className="rounded-lg bg-green-800 px-4 py-2 font-semibold text-white hover:bg-green-900"'],
    ['className="rounded-lg border px-4 py-2"', 'className="rounded-lg border border-slate-500 bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-100"'],
  ],
  'app/sicherungsort/[token]/page.tsx': [
    ['className="mx-auto max-w-lg space-y-5 p-6"', 'className="mx-auto max-w-lg space-y-5 rounded-xl bg-white p-6 text-slate-950"'],
    ['className="text-2xl font-bold"', 'className="text-2xl font-bold text-slate-950"'],
    ['<p>Dieser GPS-Punkt', '<p className="text-base leading-relaxed text-slate-900">Dieser GPS-Punkt'],
    ['className="rounded-xl border p-4 space-y-2"', 'className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-950 space-y-2"'],
    ['className="font-semibold">Standort:', 'className="font-semibold text-slate-950">Standort:'],
    ['className="text-sm">Gültig bis heute', 'className="text-sm text-slate-700">Gültig bis heute'],
    ['className="block rounded-xl bg-green-700 p-4 text-center font-bold text-white"', 'className="block rounded-xl bg-green-800 p-4 text-center font-bold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800"'],
    ['className="text-sm text-gray-600"', 'className="text-sm leading-relaxed text-slate-700"'],
  ],
};
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function fail(message) { console.error('ABBRUCH: ' + message + ' (Keine Programmdateien veraendert.)'); process.exit(1); }
if (!fs.existsSync(path.join(root, 'prisma/schema.prisma')) || !fs.existsSync(path.join(root,'package.json'))) {
  fail('Bitte im Projektordner C:\\Projekte\\rehkitzrettung starten.');
}
const work = [];
for (const [relative, replacements] of Object.entries(edits)) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail('Datei fehlt: ' + relative);
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes(marker)) fail('Kontrastkorrektur bereits installiert: ' + relative);
  let result = original;
  for (const [before, after] of replacements) {
    const n = count(result, before);
    // Genau zweimal bei den beiden identischen Sekundaerbuttons im Standortdialog.
    const expected = relative.endsWith('SecuredWildCaptureModal.tsx') && before === 'className="w-full rounded-xl border p-3"' ? 2 : 1;
    if (n !== expected) fail('Oberflaeche stimmt nicht mit V1.1 ueberein: ' + relative + ' (Anker: ' + before + ', gefunden: ' + n + ', erwartet: ' + expected + ')');
    result = result.split(before).join(after);
  }
  const note = '// ' + marker + ' – explizit dunkle Schrift auf hellem Untergrund.';
  if (result.startsWith('"use client";')) result = result.replace('"use client";', '"use client";\n' + note);
  else result = note + '\n' + result;
  work.push({ relative, file, original, result });
}
try {
  const ts = require(path.join(root, 'node_modules/typescript'));
  for (const f of work) {
    const ast = ts.createSourceFile(f.relative, f.result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    if (ast.parseDiagnostics.length) fail('TypeScript-Syntaxpruefung fehlgeschlagen: ' + f.relative);
  }
} catch (e) {
  if (String(e).includes('Keine Programmdateien veraendert')) throw e;
  fail('TypeScript zur Syntaxpruefung nicht verfuegbar: ' + String(e.message || e));
}
if (check) {
  console.log('VORPRUEFUNG OK: Vier neue Ansichten koennen kontraststark gestaltet werden.');
  for (const f of work) console.log('  ' + f.relative);
  console.log('Keine Aenderung erfolgt. Kein Eingriff in DJI, Wildzahlen, Datenbank oder API.');
  process.exit(0);
}
const backupRoot = path.join(root, '.backups', 'wild-kontrast-v1-' + new Date().toISOString().replace(/[:.]/g,'-'));
const changed = [];
try {
  for (const f of work) {
    const dest = path.join(backupRoot, f.relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.original, {flag:'wx'});
  }
  for (const f of work) {
    fs.writeFileSync(f.file, f.result);
    changed.push(f);
  }
  console.log('ERFOLG: Kontrast der vier Wild-Sicherungsort-Ansichten verbessert.');
  console.log('Sicherung: ' + path.relative(root, backupRoot));
  console.log('Bitte npx.cmd tsc --noEmit und npm.cmd run build ausfuehren.');
} catch (e) {
  for (const f of changed) {
    try { fs.writeFileSync(f.file, f.original); } catch (_) {}
  }
  console.error('ABBRUCH beim Schreiben; bereits geaenderte Dateien wurden zurueckgesetzt.');
  console.error(String(e));
  process.exit(1);
}
