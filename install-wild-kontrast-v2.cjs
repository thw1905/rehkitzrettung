#!/usr/bin/env node
'use strict';
// Rehkitzrettung - gezielte Kontrastkorrektur V2.
// Nur die zwei neuen Wild-Sicherungsort-Komponenten und ein CSS-Modul.
// Keine API, DB, DJI, allgemeine CSS- oder package.json-Aenderung.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const check = process.argv.includes('--check');
const dir = 'components/orders';
const cssPath = path.join(root, dir, 'WildSiteContrast.module.css');
const targets = [
  {
    name: `${dir}/SecuredWildCaptureModal.tsx`,
    steps: [
      ['import WildSiteShare from "@/components/orders/WildSiteShare";',
       'import WildSiteShare from "@/components/orders/WildSiteShare";\nimport styles from "./WildSiteContrast.module.css";'],
      ['className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-950 shadow-2xl space-y-4"',
       'className={`max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-950 shadow-2xl space-y-4 ${styles.modalSurface}`}'],
      ['<h2 className="text-xl font-bold text-slate-950">',
       '<h2 className={`text-xl font-bold text-slate-950 ${styles.dialogTitle}`}>'],
      ['<p className="text-sm text-slate-900">GPS-Genauigkeit',
       '<p className={`text-sm text-slate-900 ${styles.accuracyText}`}>GPS-Genauigkeit'],
      ['className="w-full rounded-xl border border-slate-500 bg-white p-3 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"',
       'className={`w-full rounded-xl border border-slate-500 bg-white p-3 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 ${styles.secondaryButton}`}', 2]
    ]
  },
  {
    name: `${dir}/WildSiteShare.tsx`,
    steps: [
      ['import QRCode from "qrcode";',
       'import QRCode from "qrcode";\nimport styles from "./WildSiteContrast.module.css";'],
      ['className="space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3 text-slate-950"',
       'className={`space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3 text-slate-950 ${styles.sharePanel}`}'],
      ['className="rounded-xl border border-slate-500 bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"',
       'className={`rounded-xl border border-slate-500 bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 ${styles.copyButton}`}'],
      ['className="block text-sm font-semibold text-slate-900">Freigabelink',
       'className={`block text-sm font-semibold text-slate-900 ${styles.linkLabel}`}>Freigabelink'],
      ['className="mt-1 w-full rounded-lg border border-slate-500 bg-white p-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-800"',
       'className={`mt-1 w-full rounded-lg border border-slate-500 bg-white p-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-800 ${styles.linkInput}`}'],
      ['className="text-sm leading-relaxed text-slate-700">Der QR-Code',
       'className={`text-sm leading-relaxed text-slate-700 ${styles.shareHint}`}>Der QR-Code']
    ]
  }
];
const css = `/* REHKITZ_WILD_KONTRAST_V2 - CSS gilt nur in den neuen Wild-Sicherungsort-Fenstern. */
.modalSurface.modalSurface {
  background-color: #ffffff !important;
  color: #111827 !important;
  color-scheme: light;
}
.modalSurface .dialogTitle.dialogTitle {
  color: #111827 !important;
}
.modalSurface .accuracyText.accuracyText {
  color: #334155 !important;
  opacity: 1 !important;
}
.modalSurface .secondaryButton.secondaryButton {
  background-color: #e2e8f0 !important;
  color: #111827 !important;
  -webkit-text-fill-color: #111827 !important;
  border: 1px solid #64748b !important;
  opacity: 1 !important;
}
.modalSurface .secondaryButton.secondaryButton:hover {
  background-color: #cbd5e1 !important;
}
.sharePanel.sharePanel {
  background-color: #f8fafc !important;
  color: #111827 !important;
  color-scheme: light;
}
.sharePanel .copyButton.copyButton {
  background-color: #e2e8f0 !important;
  color: #111827 !important;
  -webkit-text-fill-color: #111827 !important;
  border: 1px solid #64748b !important;
  opacity: 1 !important;
}
.sharePanel .copyButton.copyButton:hover {
  background-color: #cbd5e1 !important;
}
.sharePanel .linkLabel.linkLabel {
  color: #111827 !important;
  opacity: 1 !important;
}
.sharePanel .linkInput.linkInput {
  background-color: #ffffff !important;
  color: #111827 !important;
  -webkit-text-fill-color: #111827 !important;
  opacity: 1 !important;
  border: 1px solid #94a3b8 !important;
}
.sharePanel .shareHint.shareHint {
  color: #334155 !important;
  opacity: 1 !important;
}
`;
function fail(msg) {
  console.error('ABBRUCH: ' + msg + ' (Keine Programmdateien veraendert.)');
  process.exit(1);
}
function count(text, substr) { return text.split(substr).length - 1; }
if (!fs.existsSync(path.join(root, 'prisma/schema.prisma')) || !fs.existsSync(path.join(root, 'package.json'))) {
  fail('Bitte im Projektordner C:\\Projekte\\rehkitzrettung starten.');
}
if (fs.existsSync(cssPath)) fail('CSS-Modul existiert bereits, zum Schutz kein Ueberschreiben: ' + path.relative(root, cssPath));
const planned = [];
for (const target of targets) {
  const absolute = path.join(root, target.name);
  if (!fs.existsSync(absolute)) fail('Datei fehlt: ' + target.name);
  const original = fs.readFileSync(absolute, 'utf8');
  if (!original.includes('REHKITZ_WILD_KONTRAST_V1')) fail('Bitte zuerst V1 installiert haben: ' + target.name);
  if (original.includes('WildSiteContrast.module.css')) fail('V2 bereits eingebaut: ' + target.name);
  let updated = original;
  for (const [before, after, n = 1] of target.steps) {
    const found = count(updated, before);
    if (found !== n) fail('Code stimmt nicht mit der erwarteten Version ueberein: ' + target.name + '\n  Anker: ' + before.slice(0, 95) + '\n  Erwartet: ' + n + ', gefunden: ' + found);
    updated = updated.split(before).join(after);
  }
  planned.push({ ...target, absolute, original, updated });
}
let ts;
try { ts = require(path.join(root, 'node_modules/typescript')); }
catch { try { ts = require('typescript'); } catch { fail('TypeScript zur Syntaxpruefung nicht vorhanden.'); } }
for (const f of planned) {
  const ast = ts.createSourceFile(f.name, f.updated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) fail('TSX-Syntaxfehler: ' + f.name + ': ' + ast.parseDiagnostics[0].messageText);
}
if (check) {
  console.log('VORPRUEFUNG OK: V2 kann die Kontraste in zwei Fenstern gezielt korrigieren.');
  for (const f of planned) console.log('  ' + f.name);
  console.log('  ' + path.relative(root, cssPath) + ' (neu)');
  console.log('Keine Dateien veraendert. Keine Datenbank-/DJI-Aenderung.');
  process.exit(0);
}
const backup = path.join(root, '.backups', 'wild-kontrast-v2-' + new Date().toISOString().replace(/[:.]/g, '-'));
let applied = [];
try {
  for (const f of planned) {
    const dest = path.join(backup, f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.original, {flag:'wx'});
  }
  for (const f of planned) { fs.writeFileSync(f.absolute, f.updated); applied.push(f); }
  fs.writeFileSync(cssPath, css, {flag:'wx'});
  console.log('ERFOLG: Beide neuen Wild-Sicherungsort-Fenster haben jetzt eigene, staerkere Kontrastregeln.');
  console.log('Sicherung: ' + path.relative(root, backup));
  console.log('Als Naechstes: npx.cmd tsc --noEmit und npm.cmd run build');
} catch (e) {
  for (const f of applied) { try { fs.writeFileSync(f.absolute, f.original); } catch (_) {} }
  try { fs.rmSync(cssPath); } catch (_) {}
  console.error('ABBRUCH: ' + (e && e.message || e) + '. Veraenderte Quelldateien wurden zurueckgesetzt.');
  process.exit(1);
}
