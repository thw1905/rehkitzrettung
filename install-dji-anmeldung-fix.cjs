"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const file = path.join(root, "components", "dji", "PilotSimpleClient.tsx");
const projectOk = fs.existsSync(path.join(root, "package.json"));
if (!projectOk || !fs.existsSync(file)) {
  console.error("ABBRUCH: Bitte im Rehkitzrettung-Projektordner starten. Datei PilotSimpleClient.tsx fehlt.");
  process.exit(1);
}
const existing = fs.readFileSync(file, "utf8");
if (!existing.includes('Für diese Seite wird die Rolle Pilot benötigt.')) {
  if (existing.includes('Abmelden und als Pilot anmelden')) {
    console.log("Bereits installiert. Keine Änderungen.");
    process.exit(0);
  }
  console.error("ABBRUCH: Unbekannte Version der DJI-Anmeldeseite. Nichts verändert.");
  process.exit(1);
}
if (!existing.includes('signOut') || !existing.includes('auth === "unauthenticated"')) {
  console.error("ABBRUCH: Anmeldung weicht von der erwarteten Version ab. Nichts verändert.");
  process.exit(1);
}
const original = /(\)\s*:\s*!allowed\s*\?\s*\(\s*\r?\n\s*)<section className="rounded-2xl border bg-white p-5">Für diese Seite wird die Rolle Pilot benötigt\.<\/section>(\s*\r?\n\s*\)\s*:\s*\()/g;
const matches = [...existing.matchAll(original)];
if (matches.length !== 1) {
  console.error(`ABBRUCH: Berechtigungsansicht wurde ${matches.length} statt genau einmal gefunden. Keine Datei verändert.`);
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log("OK: Zielstelle erkannt. Berechtigungsprüfung bleibt bestehen; die Abmelden-Schaltfläche kann sicher ergänzt werden.");
  process.exit(0);
}
const replacement = `<section className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Als Pilot anmelden</h2>
          <p>Auf dieser Fernsteuerung ist bereits ein Benutzer angemeldet, der derzeit nicht als Pilot oder Administrator erkannt wird.</p>
          <p className="text-sm">{session?.user?.email || session?.user?.name || "Angemeldetes Konto"}</p>
          <p>Bitte melde dieses Konto ab. Danach kannst du dich mit deinem Piloten-Konto anmelden.</p>
          <button type="button" className="w-full rounded-xl bg-slate-900 p-4 font-semibold text-white" onClick={() => void signOut({ callbackUrl: "/pilot-login" })}>
            Abmelden und als Pilot anmelden
          </button>
        </section>`;
const updated = existing.replace(original, (_match, before, after) => before + replacement + after);
if (updated === existing) { console.error("ABBRUCH: Kein passender Ersatz erstellt."); process.exit(1); }
const backupDir = path.join(path.dirname(root), "rehkitzrettung-dji-sicherungen");
fs.mkdirSync(backupDir, { recursive: true });
const backupName = `PilotSimpleClient-${new Date().toISOString().replace(/[:.]/g,"-")}.tsx`;
const backup = path.join(backupDir, backupName);
fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
fs.writeFileSync(file, updated, "utf8");
console.log("OK: DJI-Anmeldung mit Abmelden-Schaltfläche ergänzt.");
console.log("Berechtigungsprüfung, DJI-Bridge und Server-APIs wurden NICHT verändert.");
console.log("Sicherheitskopie außerhalb des Projektordners: " + backup);
