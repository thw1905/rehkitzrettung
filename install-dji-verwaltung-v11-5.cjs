"use strict";
// DJI_ADMIN_UI_V11_5: nur Admin-Oberflaeche, geschuetzte Admin-API und zwei Menues.
// Keine DB-Migration. Die Drohnen-Seriennummer (technische Identitaet) bleibt bestehen.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dry = process.argv.includes("--check");
const MARK = "DJI_ADMIN_UI_V11_5";
const UI = "components/admin/dji-battery-inventory-client.tsx";
const API = "app/api/admin/dji-akkus/route.ts";
const HEADER = "components/layout/app-header.tsx";
const MOBILE = "components/layout/mobile-bottom-nav.tsx";
const TARGETS = [API,UI,HEADER,MOBILE];
function fail(s) { throw new Error("ABBRUCH: " + s + " (keine Programmdateien veraendert)"); }
function read(rel) { const p=path.join(root,rel); if(!fs.existsSync(p))fail("Datei fehlt: " + rel);return fs.readFileSync(p,"utf8"); }
function once(s,needle,replace,rel) {
  if(s.split(needle).length!==2) fail("Codeabschnitt nicht eindeutig in "+rel+": "+needle.slice(0,72));
  return s.replace(needle,replace);
}
function tsParser() { try {return require("typescript");}catch{fail("TypeScript nicht installiert (npm install). ");} }
function syntax(ts,rel,s){
  const sf=ts.createSourceFile(rel,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(sf.parseDiagnostics.length) fail("Syntaxfehler in "+rel+": "+ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText," "));
  return sf;
}
function lineBounds(text, node, sf){
  const start=node.getStart(sf), end=node.getEnd();
  const line=text.lastIndexOf("\n",start-1)+1;
  const finish=text.indexOf("\n",end);
  const after=text.slice(end,finish<0?text.length:finish);
  if(!/^[ \t]*$/.test(text.slice(line,start))|| !/^[ \t]*,?[ \t]*\r?$/.test(after))fail("Menue-Link ist nicht eindeutig abgrenzbar; bitte Datei zeigen.");
  return {from:line,to:finish<0?text.length:finish+1};
}
function menuPatch(ts,rel,s){
  if(!s.includes("DJI_MENU_V11_4")||!s.includes("DJI / Drohnen"))fail("V11.4 fehlt oder Menues wurden anders aufgebaut: "+rel);
  const sf=syntax(ts,rel,s);
  const hits=[];
  function visit(node){
    if(rel===HEADER && ts.isObjectLiteralExpression(node)){
      const p=node.properties.find(x=>ts.isPropertyAssignment(x)&&x.name.getText(sf)==="href");
      if(p && ts.isStringLiteral(p.initializer) && p.initializer.text==="/admin/dji")hits.push(node);
    }
    if(rel===MOBILE && ts.isJsxElement(node) && node.openingElement.tagName.getText(sf)==="Link"){
      const att=node.openingElement.attributes.properties.find(x=>ts.isJsxAttribute(x)&&x.name.text==="href");
      if(att && att.initializer && ts.isStringLiteral(att.initializer) && att.initializer.text==="/admin/dji")hits.push(node);
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  if(hits.length!==1)fail("DJI-Verbindung ist nicht genau einmal im Menue: "+rel+" (gefunden: "+hits.length+")");
  const b=lineBounds(s,hits[0],sf);
  const nearby=s.slice(Math.max(0,b.from-650),b.to+800);
  if(!nearby.includes('DJI / Drohnen') && rel===MOBILE)fail("Mobil-Link liegt nicht in der DJI-Gruppe.");
  if(!hits[0].getText(sf).includes("DJI-Verbindung"))fail("DJI-Verbindung hat einen anderen Anzeigenamen: "+rel);
  const updated=s.slice(0,b.from)+s.slice(b.to);
  syntax(ts,rel,updated);
  if(updated.includes('href: "/admin/dji"') || /href="\/admin\/dji"/.test(updated))fail("DJI-Verbindung noch im Menue: "+rel);
  for(const href of ["/admin/dji-akkus","/admin/dji-akku-historie","/admin/dji-flugzeiten","/admin/gps-test"])if(!updated.includes(href))fail("Geschuetzter DJI-Link verschwunden: "+href);
  if(rel===HEADER && !updated.includes("canOpenGpsTest"))fail("GPS-Test-Freigabebedingung verschwunden.");
  return updated;
}
function apiPatch(s){
  if(!s.includes('const action = field(input, "action", 40);')||!s.includes('if (action === "set-label")'))fail("DJI-Akku-Admin-API hat einen unbekannten Stand.");
  if(!s.includes('if (!(await adminAllowed()))'))fail("Admin-Zugriffsschutz fehlt in DJI-Akku-API.");
  const anchor='    if (action === "create-aircraft") {';
  const handler=`    // ${MARK}: Eindeutige Aufklebernummer der Drohne als Anzeigename. Seriennummer bleibt unveraendert.\n    if (action === "set-aircraft-number") {\n      const aircraftId = field(input, "aircraftId");\n      const raw = input.number;\n      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 99) {\n        return fail("Drohnennummer muss eine ganze Zahl von 1 bis 99 sein.");\n      }\n      const aircraft = await db.djiAircraft.findUnique({ where: { id: aircraftId } });\n      if (!aircraft) return fail("Drohne nicht gefunden.", 404);\n      const label = \`Drohne \${raw}\`;\n      const existing = await db.djiAircraft.findUnique({ where: { label }, select: { id: true } });\n      if (existing && existing.id !== aircraftId) return fail("Diese Drohnennummer ist bereits vergeben.", 409);\n      await db.djiAircraft.update({ where: { id: aircraftId }, data: { label } });\n      return NextResponse.json({ success: true }, { headers: noCache });\n    }\n`;
  const out=once(s,anchor,handler+anchor,API);
  syntax(tsParser(),API,out);
  return out;
}
function uiPatch(ts,s){
  if(!s.includes("DjiBatteryInventoryClient") || !s.includes('"create-aircraft"') || !s.includes('"register-battery"'))fail("Unbekannte Akkuverwaltungs-Oberflaeche.");
  const stateAnchor='  const [serialInputs, setSerialInputs] = useState<Record<string, string>>({});';
  let out=once(s,stateAnchor,stateAnchor+"\n  const [aircraftNumberInputs, setAircraftNumberInputs] = useState<Record<string, string>>({}); // "+MARK,UI);
  // Neue Nummernvergabe erscheint dauerhaft im Bestand, nicht im Notfallformular.
  const recAnchor='            {recommendation && <p className=';
  const card=`            {/* ${MARK}: die Drohne wird weiterhin allein per DJI-Seriennummer erkannt. */}\n            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">\n              <label className="block text-sm font-medium text-slate-800" htmlFor={\`dji-aircraft-number-\${aircraft.id}\`}>Nummer auf der Drohne</label>\n              <div className="mt-2 flex flex-wrap items-center gap-2">\n                <input\n                  id={\`dji-aircraft-number-\${aircraft.id}\`}\n                  type="number" min={1} max={99} step={1}\n                  className="w-24 rounded-lg border bg-white p-2 text-sm"\n                  placeholder="1–99"\n                  value={aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\\d?)$/.exec(aircraft.label)?.[1] ?? "")}\n                  onChange={(event) => setAircraftNumberInputs(old => ({ ...old, [aircraft.id]: event.target.value }))}\n                />\n                <button\n                  type="button"\n                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"\n                  disabled={busy || loading || !/^(?:[1-9]|[1-9]\\d)$/.test(aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\\d?)$/.exec(aircraft.label)?.[1] ?? ""))}\n                  onClick={() => void save("set-aircraft-number", { aircraftId: aircraft.id, number: Number(aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\\d?)$/.exec(aircraft.label)?.[1] ?? "")) }, "Drohnennummer gespeichert.")}\n                >Nummer speichern</button>\n                <span className="text-xs text-slate-600">Die DJI-Seriennummer und automatische Erkennung bleiben bestehen.</span>\n              </div>\n            </div>\n`;
  out=once(out,recAnchor,card+recAnchor,UI);
  // Das gesamte bereits vorhandene Formularduo in ein standardmaessig geschlossenes details-Element packen.
  const sf=syntax(ts,UI,out);let candidates=[];
  function visit(n){
    if(ts.isJsxElement(n) && n.openingElement.tagName.getText(sf)==="div" &&
       n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.text==="className"&&a.initializer&&ts.isStringLiteral(a.initializer)&&a.initializer.text==="grid gap-4 md:grid-cols-2")){
      const content=n.getText(sf);
      if(content.includes('save("create-aircraft"') && content.includes('save("register-battery"'))candidates.push(n);
    }
    ts.forEachChild(n,visit);
  }
  visit(sf);
  if(candidates.length!==1)fail("Die beiden manuellen Formulare wurden nicht eindeutig gefunden ("+candidates.length+").");
  const n=candidates[0]; const start=n.getStart(sf),end=n.getEnd();
  const bol=out.lastIndexOf("\n",start-1)+1;
  const indent=out.slice(bol,start);
  if(!/^[ \t]*$/.test(indent))fail("Manuelle Formulargruppe steht nicht am Zeilenanfang.");
  const nl=out.includes("\r\n")?"\r\n":"\n";
  const original=out.slice(start,end);
  const wrapper=[
    `<details className="rounded-2xl border border-slate-300 bg-slate-50 p-4">`,
    `  <summary className="cursor-pointer text-base font-semibold text-slate-900">Manuelle Erfassung (nur Notfall) – aufklappen</summary>`,
    `  <p className="my-3 text-sm text-slate-600">Normalerweise werden Drohnen und Akkus automatisch über DJI erkannt. Nur bei Bedarf manuell hinzufügen.</p>`,
    "  "+original.replace(/\r?\n/g,nl+"  "),
    `</details>`,
  ].join(nl+indent);
  out=out.slice(0,start)+wrapper+out.slice(end);
  // Historisch ausserhalb der Formulare stehender Hinweis ist nun im Notfallbereich enthalten.
  const oldHint='      <p className="text-sm text-slate-600">Die folgenden manuellen Formulare sind nur als Ausnahmefall gedacht; für die automatische Erkennung musst du nichts anlegen.</p>';
  if(out.includes(oldHint))out=out.replace(oldHint+(nl),"");
  syntax(ts,UI,out);
  if(!out.includes("<details")||!out.includes('set-aircraft-number'))fail("DJI-UI-Pruefung fehlgeschlagen.");
  return out;
}
function main(){
  read("package.json");read("prisma/schema.prisma");
  const schema=read("prisma/schema.prisma");
  if(!/model\s+DjiAircraft\s*\{[\s\S]*?label\s+String\s+@unique/.test(schema))fail("DjiAircraft.label ist nicht als eindeutige Bezeichnung vorhanden.");
  if(!/model\s+DjiBattery\s*\{/.test(schema))fail("Akku-Tabelle fehlt.");
  const current=Object.fromEntries(TARGETS.map(rel=>[rel,read(rel)]));
  if(TARGETS.every(rel=>current[rel].includes(MARK))){console.log("V11.5 ist bereits installiert. Keine Aenderung.");return;}
  if(TARGETS.some(rel=>current[rel].includes(MARK)))fail("V11.5 ist nur teilweise installiert. Bitte Dateien und Sicherung pruefen.");
  const ts=tsParser();
  const changes={
    [API]:apiPatch(current[API]),
    [UI]:uiPatch(ts,current[UI]),
    [HEADER]:menuPatch(ts,HEADER,current[HEADER]),
    [MOBILE]:menuPatch(ts,MOBILE,current[MOBILE]),
  };
  // Die Menue-Dateien erhalten ebenfalls einen eindeutigen Marker fuer wiederholte Aufrufe.
  for(const rel of [HEADER,MOBILE])changes[rel] = "// "+MARK+": DJI-Verbindung nur aus Navigation ausgeblendet.\n"+changes[rel];
  for(const rel of TARGETS)syntax(ts,rel,changes[rel]);
  if(dry){
    console.log("VORPRUEFUNG OK: DJI-Verbindung aus PC/Handy-Menues entfernen; Drohnennummer 1-99 zuweisen; manuelle Formulare standardmaessig einklappen.");
    console.log("Nur 4 Dateien: "+TARGETS.join(", "));
    console.log("Keine Migration, keine MQTT-/DJI-Bridge-/PinPoint-/Flug-/Timer-Aenderungen.");
    return;
  }
  const backup=path.join(root,".backups","dji-verwaltung-v11-5-"+new Date().toISOString().replace(/[:.]/g,"-"));
  for(const rel of TARGETS){const dest=path.join(backup,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,rel),dest,fs.constants.COPYFILE_EXCL);}
  const written=[];
  try{
    for(const rel of TARGETS){fs.writeFileSync(path.join(root,rel),changes[rel],"utf8");written.push(rel);}
  }catch(e){for(const rel of written.reverse()){try{fs.copyFileSync(path.join(backup,rel),path.join(root,rel));}catch(error){console.error("Ruecksicherung erforderlich: "+rel+": "+error.message);}}throw e;}
  console.log("DJI-Verwaltung V11.5 installiert. Sicherung:",backup);
  console.log("Als naechstes npm.cmd run build ausfuehren.");
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
