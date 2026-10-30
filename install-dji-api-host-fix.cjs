// Rehkitzrettung DJI Pilot 2: targeted API host trailing-slash fix.
// Run from the project root: node .\install-dji-api-host-fix.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = process.cwd();
const file = path.join(project, 'components', 'dji', 'Pilot2BridgeSetup.tsx');
const oldLine = 'host: window.location.origin,';
const newLine = 'host: window.location.origin + "/",';
if (!fs.existsSync(file)) {
  console.error('FEHLER: Datei nicht gefunden:', file);
  process.exit(1);
}
const source = fs.readFileSync(file, 'utf8');
const oldCount = source.split(oldLine).length - 1;
const newCount = source.split(newLine).length - 1;
if (oldCount === 0 && newCount === 1) {
  console.log('Bereits installiert: API-Host endet mit /; keine Änderung.');
  process.exit(0);
}
if (oldCount !== 1 || newCount !== 0) {
  console.error('ABBRUCH: Datei weicht von erwarteter Version ab. Keine Änderung vorgenommen.');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(project, 'dji-backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `Pilot2BridgeSetup.tsx.before-api-host-fix.${stamp}.bak`);
fs.copyFileSync(file, backupFile, fs.constants.COPYFILE_EXCL);
const updated = source.replace(oldLine, newLine);
const temp = `${file}.${crypto.randomBytes(5).toString('hex')}.tmp`;
fs.writeFileSync(temp, updated, { flag: 'wx' });
fs.renameSync(temp, file);
console.log('Korrektur installiert: DJI-API-Host endet jetzt mit /.');
console.log('Sicherung:', backupFile);
console.log('Keine anderen Programm- oder Datenbankdateien verändert.');
