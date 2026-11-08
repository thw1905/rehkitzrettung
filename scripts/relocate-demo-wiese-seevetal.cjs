#!/usr/bin/env node
"use strict";
// Einmaliger, optionaler Umzug ausschliesslich der automatisch erzeugten alten Demo-Flaechen.
// Datenbank wird nur mit --apply veraendert. Keine anderen Auftraege oder Flaechen anpassen.
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const NEW_LAT = 53.3774;
const NEW_LON = 10.0348;
const polygon = {
  type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
    [10.0343,53.3769], [10.0353,53.3769], [10.0353,53.3779], [10.0343,53.3779], [10.0343,53.3769]
  ]] }
};
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  for (const file of ['.env.production.local','.env.local','.env.production','.env']) {
    const fn = path.join(root, file);
    if (!fs.existsSync(fn)) continue;
    for (const line of fs.readFileSync(fn,'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[1];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val=val.slice(1,-1);
      else val=val.replace(/\s+#.*$/, '').trim();
      if (val) {process.env.DATABASE_URL=val;return;}
    }
  }
}
function isOldPolygon(obj) {
  const pts = obj?.geometry?.coordinates?.[0];
  const expected = [[8,52],[8.001,52],[8.001,52.001],[8,52.001],[8,52]];
  return obj?.type==='Feature' && obj?.geometry?.type==='Polygon' && Array.isArray(pts)
    && pts.length===5 && pts.every((p,i)=>Array.isArray(p) && p.length>=2
      && Math.abs(p[0]-expected[i][0])<1e-9 && Math.abs(p[1]-expected[i][1])<1e-9);
}
function eligible(f) {
  return f && f.name==='Demo-Wiese' && f.displayName==='TEST / ÜBUNG – Demo-Wiese'
    && f.locationLatitude===52 && f.locationLongitude===8
    && isOldPolygon(f.areaGeoJson)
    && f.orders?.length>0 && f.orders.every(o=>o.isDemo===true);
}
async function run() {
  const apply=process.argv.includes('--apply');
  if (process.argv.slice(2).some(a=>a!=='--apply'&&a!=='--check')) throw new Error('Nur --check oder --apply erlaubt.');
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL nicht gefunden. Nichts geaendert.');
  const db = new PrismaClient();
  try {
    const demos=await db.order.findMany({where:{isDemo:true},select:{id:true,fieldId:true,field:{
      select:{id:true,name:true,displayName:true,notes:true,locationLatitude:true,locationLongitude:true,locationNote:true,areaGeoJson:true,
        orders:{select:{id:true,isDemo:true}}}
    }}});
    const all=new Map();
    for (const item of demos) if(item.field) all.set(item.field.id,item.field);
    const eligibleFields=[...all.values()].filter(eligible);
    console.log('Gefundene Demo-Flaechen:',all.size);
    console.log('Davon unveraenderte alte Standard-Demo-Wiesen:',eligibleFields.length);
    if (!eligibleFields.length) {console.log('Keine bestehende alte Demo-Wiese zum Umstellen.');return;}
    for(const f of eligibleFields) console.log('  ',f.id, '52.0/8.0 ->',NEW_LAT,NEW_LON);
    if (!apply) {console.log('VORPRUEFUNG: Es wurde nichts an der Datenbank geaendert. Fuer die Anpassung --apply verwenden.');return;}
    const backupDir=path.join(root,'.backups');fs.mkdirSync(backupDir,{recursive:true});
    const backupPath=path.join(backupDir,'demo-wiese-seevetal-db-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
    fs.writeFileSync(backupPath,JSON.stringify({createdAt:new Date().toISOString(),fields:eligibleFields},null,2),{flag:'wx',mode:0o600});
    let changed=0;
    await db.$transaction(async tx=>{
      for(const f of eligibleFields) {
        const res=await tx.field.updateMany({
          where:{id:f.id,name:'Demo-Wiese',locationLatitude:52,locationLongitude:8},
          data:{areaGeoJson:polygon,locationLatitude:NEW_LAT,locationLongitude:NEW_LON,
            locationNote:'Demo-Startpunkt Seevetal-Maschen (nur Test)',
            notes:'Demo-Flaeche in Seevetal-Maschen zur Einweisung. Kein realer Flug.'}
        });
        if(res.count!==1) throw new Error('Demo-Flaeche wurde zwischenzeitlich geaendert. Abbruch.');
        changed+=res.count;
      }
    });
    console.log('ERFOLG:',changed,'bestehende Demo-Flaeche(n) umgestellt. Sicherung:',backupPath);
    console.log('Achtung: Bereits gespeicherte DJI-Cloud-Missionen behalten ihre bisherigen Wegpunkte. Vor erneutem Test neu planen.');
  } finally {await db.$disconnect();}
}
run().catch(e=>{console.error('ABBRUCH: '+(e?.message||e));process.exitCode=1;});
