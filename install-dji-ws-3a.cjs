"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const payload = path.join(__dirname,"payload");
const fail = (msg) => { console.error("ABBRUCH: " + msg + "\nKeine Dateien verändert."); process.exit(1); };
if (!fs.existsSync(path.join(root,"package.json"))) fail("Bitte aus C:\\Projekte\\rehkitzrettung starten.");
const pkg = JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
if (pkg.name !== "rehkitzrettung") fail("Nicht das Rehkitzrettung-Projekt.");
if (!pkg.dependencies?.ws) fail("Paket ws fehlt. Zuerst npm.cmd install ws mqtt ausführen.");

const loginRel="components/dji/PilotLoginClient.tsx";
const login=path.join(root,loginRel);
if (!fs.existsSync(login)) fail(loginRel+" fehlt.");
const source = fs.readFileSync(login,"utf8");
const importAnchor='import Pilot2BridgeSetup from "@/components/dji/Pilot2BridgeSetup";';
const jsxAnchor='<Pilot2BridgeSetup token={pilotToken} />';
const importNew='import Pilot2WsTest from "@/components/dji/Pilot2WsTest";';
const jsxNew='<Pilot2WsTest token={pilotToken} />';
const oldImport=source.includes(importNew), oldRender=source.includes(jsxNew);
if (oldImport!==oldRender) fail("PilotLoginClient.tsx ist nur teilweise aktualisiert.");
if (!oldImport && (!source.includes(importAnchor)||!source.includes(jsxAnchor))) fail("PilotLoginClient.tsx ist nicht die erwartete Stufe-2B-Version. Bitte melden.");
let next=source;
if (!oldImport) next=source.replace(importAnchor, importAnchor+'\n'+importNew)
  .replace(jsxAnchor, jsxAnchor+'}\n      {authStatus === "authenticated" && hasRole && <Pilot2WsTest token={pilotToken} />');
// Above replacement is intentionally specific to the JSX conditional structure.
if (!oldImport && !next.includes('{authStatus === "authenticated" && hasRole && <Pilot2WsTest token={pilotToken} />}')) {
  fail("PilotLoginClient JSX konnte nicht eindeutig angepasst werden.");
}

const files=[
 ["payload/components/dji/Pilot2WsTest.tsx.txt", "components/dji/Pilot2WsTest.tsx"],
 ["payload/app/api/dji/pilot2/ws-bootstrap/route.ts.txt", "app/api/dji/pilot2/ws-bootstrap/route.ts"],
 ["payload/dji-services/ws-server.cjs.txt", "dji-services/ws-server.cjs"],
];
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const writes=[];
for(const [relSrc,relDst] of files){
 const from=path.join(__dirname,relSrc), dst=path.join(root,relDst);
 if(!fs.existsSync(from)) fail("Paketdatei fehlt: "+relSrc);
 const incoming=fs.readFileSync(from);
 if(fs.existsSync(dst)) {
  if(hash(fs.readFileSync(dst))!==hash(incoming)) fail("Bestehende Datei mit anderem Inhalt: "+relDst);
 } else writes.push({dst,data:incoming,relDst});
}
if(!oldImport)writes.push({dst:login,data:Buffer.from(next,"utf8"),relDst:loginRel,backup:true});
if(process.argv.includes("--check")){console.log("Prüfung erfolgreich. Zu ändern:",writes.map(x=>x.relDst));process.exit(0);}
if(!writes.length) {console.log("Stufe 3A bereits installiert. Keine Änderungen.");process.exit(0);}
const backupDir=path.join(path.dirname(root),"rehkitzrettung-backups","dji-ws-3a-"+new Date().toISOString().replace(/[:.]/g,"-"));
try{
 fs.mkdirSync(backupDir,{recursive:true});
 for(const item of writes)if(item.backup){
  const backup=path.join(backupDir,item.relDst);
  fs.mkdirSync(path.dirname(backup),{recursive:true}); fs.copyFileSync(item.dst,backup,fs.constants.COPYFILE_EXCL);
 }
 for(const item of writes){
  fs.mkdirSync(path.dirname(item.dst),{recursive:true});
  fs.writeFileSync(item.dst,item.data);
  console.log("Installiert: "+item.relDst);
 }
 console.log("Sicherungen außerhalb des Projektordners: "+backupDir);
 console.log("Keine .env-Datei, Datenbank, Nginx-Konfiguration oder MQTT-Einstellungen verändert.");
}catch(e){console.error("Fehler beim Schreiben. Sicherungen und Zielstand prüfen:",e.message);process.exit(1);}
