/*
 * Installation im Projektverzeichnis: node .\install-teamrouten.cjs
 * Macht vor Änderungen Sicherheitskopien. Bei unerwarteten Abweichungen: Abbruch.
 * Aktualisiert bestehende Dateien per Git-Patch (mit Kontextprüfung)
 * statt einer vollständigen, potenziell älteren Austauschdatei.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const source = __dirname;
const patch = path.join(source, 'update-bestand.patch');
const updates = [
  'prisma/schema.prisma',
  'components/day-assignments/day-assignments-page-client.tsx',
  'app/api/web-push/notify-operation-day/route.ts'
];
const additions = [
  'lib/team-meeting-points.ts',
  'lib/team-route-optimization.ts',
  'app/api/day-assignments/optimize-route/route.ts',
  'app/api/operation-day-teams/meeting-points/route.ts'
];
function runGit(args) {
  return spawnSync('git', args, {cwd:root,encoding:'utf8'});
}
function panic(message) {
  console.error('\nINSTALLATION ABGEBROCHEN: '+message);
  console.error('Falls schon Änderungen vorgenommen wurden: siehe Backups und README.');
  process.exit(1);
}
try {
  if (!fs.existsSync(patch)) panic('update-bestand.patch fehlt. Bitte ZIP komplett in den Projektordner entpacken.');
  if (!fs.existsSync(path.join(root,'package.json')) || !fs.existsSync(path.join(root,'prisma','schema.prisma')))
    panic('Bitte im Projektordner C:\\Projekte\\rehkitzrettung starten.');
  for (const rel of updates) if(!fs.existsSync(path.join(root,rel))) panic('Datei fehlt: '+rel);
  for (const rel of additions) {
    const from=path.join(source,rel), to=path.join(root,rel);
    if(!fs.existsSync(from)) panic('Erweiterungsdatei fehlt: '+rel);
    if(fs.existsSync(to) && fs.readFileSync(to,'utf8')!==fs.readFileSync(from,'utf8')) panic('Datei existiert bereits mit anderem Inhalt: '+rel);
  }
  const currentSchema = fs.readFileSync(path.join(root,'prisma/schema.prisma'),'utf8');
  if (/model OperationDayTeam\s*\{\s*meetingPointText\s+String\?/.test(currentSchema)) {
    const allAdditions = additions.every(rel => fs.existsSync(path.join(root,rel)) && fs.readFileSync(path.join(root,rel),'utf8')===fs.readFileSync(path.join(source,rel),'utf8'));
    if(allAdditions) {console.log('Bereits installiert. Keine Änderung nötig.');process.exit(0);}
    panic('Schema enthält die Teamerweiterung, aber nicht alle Dateien passen. Bitte erst prüfen.');
  }
  const check=runGit(['apply','--check','--whitespace=nowarn',patch]);
  if(check.status!==0) panic('Die vorhandenen Programmdateien weichen von der erwarteten Version ab. Nichts geändert.\n'+(check.stderr||check.stdout||'git apply --check fehlgeschlagen'));
  const suffix=new Date().toISOString().replace(/[-:.TZ]/g,'');
  for(const rel of updates) {
    fs.copyFileSync(path.join(root,rel),path.join(root,rel)+'.backup-teamrouten-'+suffix);
  }
  const actual=runGit(['apply','--whitespace=nowarn',patch]);
  if(actual.status!==0) panic('Git-Patch konnte trotz Vorprüfung nicht angewendet werden: '+(actual.stderr||actual.stdout));
  for(const rel of additions) {
    const from=path.join(source,rel),to=path.join(root,rel);
    fs.mkdirSync(path.dirname(to),{recursive:true});
    if(!fs.existsSync(to)) fs.copyFileSync(from,to);
  }
  console.log('\nInstallation erfolgreich. Änderungen:');
  for (const rel of [...updates,...additions]) console.log(' - '+rel);
  console.log('\nSicherungen: *.backup-teamrouten-'+suffix);
  console.log('Danach: npx prisma validate, npx prisma db push, npx prisma generate, npm run build');
} catch(error) {panic(error instanceof Error ? error.message:String(error));}
