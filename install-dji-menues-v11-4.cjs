"use strict";
// DJI_MENU_V11_4: zwei vorhandene Menuekomponenten gezielt aendern.
// Geschuetzter GPS-Test bleibt per canOpenGpsTest bedingt sichtbar.
// Keine API-, DB-, DJI-, MQTT-, PinPoint- oder Timer-Aenderungen.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const check = process.argv.includes('--check');
const MARK = 'DJI_MENU_V11_4';
const HEADER = 'components/layout/app-header.tsx';
const MOBILE = 'components/layout/mobile-bottom-nav.tsx';
const DESTINATIONS = [
  ['/admin/dji', 'DJI-Verbindung'],
  ['/admin/dji-akkus', 'Drohnen und Akkus'],
  ['/admin/dji-akku-historie', 'Akkuhistorie'],
  ['/admin/dji-flugzeiten', 'GPS-Flugzeiten je Fläche'],
];
const GPS = '/admin/gps-test';
function fail(s) { throw Error('ABBRUCH: ' + s + ' (keine Dateien veraendert)'); }
function source(rel) { const p=path.join(root,rel); if(!fs.existsSync(p)) fail('Datei fehlt: '+rel); return fs.readFileSync(p,'utf8'); }
function count(s,needle) { return s.split(needle).length-1; }
function requireTs() { try { return require('typescript'); } catch { fail('TypeScript-Paket fehlt; zuerst npm install im Projekt.'); } }
function parse(ts,rel,s) {
  const sf=ts.createSourceFile(rel,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(sf.parseDiagnostics.length) fail('TSX-Syntaxfehler '+rel+': '+ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText,' '));
  return sf;
}
function property(ts,obj,name,sf) {
  return obj.properties.find(p=>ts.isPropertyAssignment(p) && p.name.getText(sf).replace(/['"]/g,'')===name);
}
function managementArray(ts,sf) {
  let result=null;
  function visit(node){
    if(ts.isVariableDeclaration(node) && node.name.getText(sf)==='managementNavSections' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) result=node.initializer;
    ts.forEachChild(node,visit);
  }
  visit(sf);
  if(!result) fail('managementNavSections nicht gefunden.');
  return result;
}
function rowBounds(src,node,sf) {
  const start=node.getStart(sf), end=node.getEnd();
  const bol=src.lastIndexOf('\n',start-1)+1;
  const nextNewline=src.indexOf('\n',end);
  const rest=src.slice(end,nextNewline<0?src.length:nextNewline);
  if(!/^[ \t]*$/.test(src.slice(bol,start)) || !/^[ \t]*,?[ \t]*\r?$/.test(rest))
    fail('Menueeintrag steht nicht alleine in einer Zeile. Bitte Datei zeigen.');
  return {from:bol,to:nextNewline<0?src.length:nextNewline+1};
}
function headerPatch(ts,src) {
  const sf=parse(ts,HEADER,src), arr=managementArray(ts,sf);
  const occurrences=new Map([...DESTINATIONS.map(([p])=>[p,[]]),[GPS,[]]]);
  let gpsSpread=null, gpsObject=null, systemSection=null;
  for(const section of arr.elements){
    if(!ts.isObjectLiteralExpression(section)) fail('Unerwartete Verwaltungssektion.');
    const title=property(ts,section,'title',sf);
    if(title && ts.isStringLiteral(title.initializer) && title.initializer.text==='System / Werkzeuge') systemSection=section;
    const items=property(ts,section,'items',sf);
    if(!items || !ts.isArrayLiteralExpression(items.initializer)) fail('Verwaltungssektion ohne items-Array.');
    for(const item of items.initializer.elements){
      if(ts.isObjectLiteralExpression(item)){
        const href=property(ts,item,'href',sf);
        if(href && ts.isStringLiteral(href.initializer) && occurrences.has(href.initializer.text)) {
          occurrences.get(href.initializer.text).push(item);
          if(href.initializer.text===GPS) gpsObject=item;
        }
      }
      if(ts.isSpreadElement(item) && item.getText(sf).includes(GPS)) {
        if(gpsSpread) fail('Mehr als ein bedingter GPS-Test-Eintrag.');
        gpsSpread=item;
      }
    }
  }
  if(!systemSection) fail('Verwaltungsbereich System / Werkzeuge fehlt.');
  if(!gpsSpread || gpsObject) fail('GPS-Test ist nicht wie erwartet als bedingter Menüpunkt vorhanden.');
  const protectedEntry=gpsSpread.getText(sf);
  if(!/canOpenGpsTest/.test(protectedEntry) || !protectedEntry.includes('href: "'+GPS+'"'))
    fail('GPS-Test-Zugriffsschutz konnte nicht eindeutig erkannt werden.');
  if(count(src.slice(arr.getStart(sf),arr.getEnd()),GPS)!==1) fail('GPS-Test mehrfach im Verwaltungsmenue.');
  const edits=[];
  const gpsBounds=rowBounds(src,gpsSpread,sf);
  edits.push({...gpsBounds,replacement:''});
  for(const [href] of DESTINATIONS){
    const nodes=occurrences.get(href);
    if(nodes.length>1) fail('Doppelter DJI-Menuepunkt: '+href);
    if(nodes.length===1) edits.push({...rowBounds(src,nodes[0],sf),replacement:''});
    else if(src.slice(arr.getStart(sf),arr.getEnd()).includes('href: "'+href+'"'))
      fail('Nicht eindeutig lesbarer DJI-Menuepunkt: '+href);
  }
  const nl=src.includes('\r\n')?'\r\n':'\n';
  const block=[
    '    // '+MARK+': geschuetzte DJI-Verwaltung (GPS-Test weiterhin freigabeabhaengig).',
    '    {',
    '      title: "DJI / Drohnen",',
    '      color: "border-sky-200 bg-sky-50 text-sky-950",',
    '      items: [',
    ...DESTINATIONS.map(([href,label])=>`        { href: "${href}", label: "${label}" },`),
    '        '+protectedEntry.replace(/\r?\n/g,' ')+',',
    '      ],',
    '    },',
  ].join(nl)+nl;
  const at=src.lastIndexOf('\n',systemSection.getStart(sf)-1)+1;
  if(!/^[ \t]*$/.test(src.slice(at,systemSection.getStart(sf)))) fail('System-Bereich kann nicht sicher eingefuegt werden.');
  edits.push({from:at,to:at,replacement:block});
  let result=src;
  edits.sort((a,b)=>b.from-a.from||b.to-a.to);
  for(let i=1;i<edits.length;i++) if(edits[i].to>edits[i-1].from) fail('Ueberlappende Codebereiche.');
  for(const e of edits) result=result.slice(0,e.from)+e.replacement+result.slice(e.to);
  const verified=parse(ts,HEADER,result);
  const nav=managementArray(ts,verified);
  const navText=result.slice(nav.getStart(verified),nav.getEnd());
  for(const [href] of DESTINATIONS) if(count(navText,'href: "'+href+'"')!==1) fail('Menuepunkt nach Aenderung ungueltig: '+href);
  if(count(navText,'href: "'+GPS+'"')!==1|| !navText.includes('canOpenGpsTest')) fail('GPS-Test-Zugriffsschutz ging verloren.');
  return result;
}
function mobilePatch(ts,src) {
  const sf=parse(ts,MOBILE,src);
  if(!src.includes('systemSectionOpen') || !src.includes('System / Werkzeuge') || !src.includes('setManagementMenuOpen'))
    fail('Mobiles Systemmenue unerwartet.');
  let found=[];
  function visit(node){
    if(ts.isJsxElement(node) && node.openingElement.tagName.getText(sf)==='Link'){
      const att=node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.text==='href');
      if(att && att.initializer && ts.isStringLiteral(att.initializer) && att.initializer.text===GPS) found.push(node);
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  if(found.length!==1) fail('Mobiler GPS-Test-Link nicht eindeutig.');
  for(const [href] of DESTINATIONS) {
    const re = new RegExp('href\\s*=\\s*["\\x27]'+href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\\x27]');
    if(re.test(src)) fail('Mobilmenue hat bereits DJI-Link '+href+'; bitte Datei zeigen.');
  }
  const node=found[0];
  const before=src.slice(0,node.getStart(sf));
  const offset=before.lastIndexOf('\n')+1;
  const indent=before.slice(offset);
  if(!/^[ \t]*$/.test(indent)) fail('Mobiler GPS-Test-Link steht nicht in eigener Zeile.');
  const nl=src.includes('\r\n')?'\r\n':'\n';
  const inner=indent+'    ';
  const linkStyle='block rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm font-semibold text-sky-950 hover:bg-sky-100';
  const prefix=[
    `{/* ${MARK}: DJI-Links im bestehenden mobilen Verwaltungsmenue. */}`,
    `<div className="rounded-xl border border-sky-200 bg-sky-50 p-2">`,
    `  <div className="mb-2 px-2 text-xs font-extrabold uppercase text-sky-950">DJI / Drohnen</div>`,
    `  <div className="space-y-2">`,
    ...DESTINATIONS.map(([href,label])=>`    <Link href="${href}" onClick={() => setManagementMenuOpen(false)} className="${linkStyle}">${label}</Link>`),
  ].map((t,i)=>indent+t).join(nl)+nl+inner;
  const suffix=nl+indent+'  </div>'+nl+indent+'</div>';
  let result=src.slice(0,node.getStart(sf))+prefix+src.slice(node.getStart(sf),node.getEnd())+suffix+src.slice(node.getEnd());
  parse(ts,MOBILE,result);
  if(count(result,MARK)!==1) fail('Mobiles Menue nicht eindeutig installiert.');
  return result;
}
function main(){
  if(!fs.existsSync(path.join(root,'package.json'))) fail('Bitte im Projektordner starten.');
  const h=source(HEADER), m=source(MOBILE);
  if(h.includes(MARK) && m.includes(MARK)) { console.log('V11.4 bereits installiert. Keine Aenderung.'); return; }
  if(h.includes(MARK)||m.includes(MARK)) fail('V11.4 nur teilweise installiert; bitte pruefen.');
  if(/DJI_MENU_V11_[123]/.test(h)) fail('Aelterer DJI-Menueinstaller scheint bereits installiert.');
  for(const [href] of DESTINATIONS) {
    if(!fs.existsSync(path.join(root,'app',href.slice(1),'page.tsx'))) fail('DJI-Zielseite fehlt: '+href);
  }
  if(!fs.existsSync(path.join(root,'app/admin/gps-test/page.tsx'))) fail('GPS-Testseite fehlt.');
  const ts=requireTs();
  const nextHeader=headerPatch(ts,h);
  const nextMobile=mobilePatch(ts,m);
  if(check){
    console.log('VORPRUEFUNG OK: Desktop- und Mobilmenue werden ergaenzt.');
    console.log('GPS-Test bleibt nur mit canOpenGpsTest sichtbar; mobiler PIN-Zugang bleibt unveraendert.');
    console.log('Nur diese Dateien: '+HEADER+'; '+MOBILE);
    console.log('Keine Aenderung an Datenbank, DJI, MQTT, PinPoints, Timern oder APIs.');
    return;
  }
  const back=path.join(root,'.backups','dji-menues-v11-4-'+new Date().toISOString().replace(/[:.]/g,'-'));
  for(const rel of [HEADER,MOBILE]) {
    const dest=path.join(back,rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(path.join(root,rel),dest,fs.constants.COPYFILE_EXCL);
  }
  const done=[];
  try{
    for(const [rel,newText] of [[HEADER,nextHeader],[MOBILE,nextMobile]]) {
      fs.writeFileSync(path.join(root,rel),newText,'utf8'); done.push(rel);
    }
  } catch(e){
    for(const rel of done) fs.copyFileSync(path.join(back,rel),path.join(root,rel));
    throw e;
  }
  console.log('DJI-Menues V11.4 installiert. Sicherung:',back);
  console.log('Jetzt npm.cmd run build ausfuehren.');
}
try { main(); } catch(e) {console.error(e.message); process.exitCode=1;}
