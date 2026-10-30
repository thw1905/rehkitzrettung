/* Rehkitzrettung DJI-Import Testphase 1 - safe additive installer */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const project = __dirname;
const source = path.join(project, 'dji-install-files');
const schemaPath = path.join(project, 'prisma', 'schema.prisma');
const modelPath = path.join(project, 'dji-modelle.txt');

function die(message) { console.error('FEHLER:', message); process.exit(1); }
function walk(root, start = '') {
  return fs.readdirSync(path.join(root, start), { withFileTypes: true }).flatMap(item => {
    const rel = path.join(start, item.name);
    return item.isDirectory() ? walk(root, rel) : [rel];
  });
}
function same(a, b) {
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return hash(a) === hash(b);
}
if (!fs.existsSync(schemaPath) || !fs.existsSync(path.join(project, 'package.json'))) {
  die('Installer muss im Hauptordner C:\\Projekte\\rehkitzrettung liegen.');
}
if (!fs.existsSync(source) || !fs.existsSync(modelPath)) die('Installationsdateien fehlen. ZIP komplett entpacken.');
const packageData = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
if (packageData.name !== 'rehkitzrettung') die('Falsches Next.js-Projekt.');
const schema = fs.readFileSync(schemaPath, 'utf8');
if (!schema.includes('model OrderPinpoint') || !schema.includes('model Order')) die('Unerwartetes Prisma-Schema.');
const startMark = '// DJI_STAGE1_BEGIN';
const endMark = '// DJI_STAGE1_END';
const alreadySchema = schema.includes(startMark) && schema.includes(endMark);
if (schema.includes(startMark) !== schema.includes(endMark)) die('DJI Schema nur teilweise vorhanden. Bitte manuell pruefen.');
if (!alreadySchema && (schema.includes('model DjiPilotSession') || schema.includes('model DjiMapElement'))) {
  die('DJI-Datenmodelle existieren bereits in anderer Form. Keine automatische Aenderung.');
}
const files = walk(source);
const collisions = files.filter(rel => {
  const dest = path.join(project, rel);
  return fs.existsSync(dest) && !same(path.join(source, rel), dest);
});
if (collisions.length) die('Vorhandene Dateien weichen ab; nichts veraendert:\n' + collisions.join('\n'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (!alreadySchema) {
  fs.copyFileSync(schemaPath, schemaPath + `.bak-dji-${stamp}`);
  fs.appendFileSync(schemaPath, '\n\n' + fs.readFileSync(modelPath, 'utf8') + '\n', 'utf8');
  console.log('Prisma-Datenmodelle ergänzt (mit Sicherheitskopie).');
} else {
  console.log('Prisma-Datenmodelle bereits vorhanden, uebersprungen.');
}
let added = 0;
for (const rel of files) {
  const dest = path.join(project, rel);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(source, rel), dest);
  added++;
}
console.log(`DJI-Testmodul installiert: ${added} neue Dateien.`);
console.log('Naechste Schritte: Datenbank sichern, npx prisma migrate deploy, npx prisma generate, npx tsc --noEmit, npm run build.');
console.log('Neue Admin-Testseite nach dem Start: /admin/dji');
console.log('Live-Verbindung und produktiver Autoimport sind NICHT aktiviert.');
