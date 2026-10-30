"use strict";
// DJI_MENU_V11_3 - menueeintraege anhand des TypeScript-Syntaxbaums verschieben.
// Nur AppHeader: keine API-/Datenbank-/MQTT-/PinPoint-Aenderungen.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const marker = 'DJI_MENU_V11_3';
const choices = ['components/layout/app-header.tsx','components/app-header.tsx'];
const entries = [
  ['/admin/dji','DJI-Verbindung'],
  ['/admin/dji-akkus','Drohnen und Akkus'],
  ['/admin/dji-akku-historie','Akkuhistorie'],
  ['/admin/dji-flugzeiten','GPS-Flugzeiten je Fläche'],
  ['/admin/gps-test','DJI-GPS-Test'],
];
function stop(message) { throw new Error('ABBRUCH: ' + message + ' (keine Dateien veraendert)'); }
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function findArray(ts, sf) {
  let array = null;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf)==='managementNavSections' && ts.isArrayLiteralExpression(node.initializer)) array = node.initializer;
    ts.forEachChild(node,visit);
  }
  visit(sf);
  return array;
}
function inspect() {
  if(!fs.existsSync(path.join(root,'package.json'))) stop('Bitte im Rehkitzrettung-Projektordner starten.');
  const files=choices.filter(p=>fs.existsSync(path.join(root,p)) && /export default function AppHeader/.test(fs.readFileSync(path.join(root,p),'utf8')) && fs.readFileSync(path.join(root,p),'utf8').includes('const managementNavSections = ['));
  if(files.length!==1) stop('AppHeader nicht eindeutig gefunden.');
  const rel=files[0], original=fs.readFileSync(path.join(root,rel),'utf8');
  if(original.includes(marker)) return {already:true,rel};
  if(original.includes('DJI_MENU_V11_1')||original.includes('DJI_MENU_V11_2')) stop('Eine vorherige Menueversion wurde bereits installiert; keine Doppelanpassung.');
  for(const x of ['const personalNavSections = [','const operationsNavSections = [','{managementNavSections.map(','<nav className="mt-3 hidden flex-wrap gap-2 md:flex">']) {
    if(!original.includes(x)) stop('Menueanker fehlt: '+x);
  }
  let ts;
  try { ts = require('typescript'); } catch { stop('TypeScript-Paket nicht gefunden. Bitte npm install im Projekt pruefen.'); }
  const sf=ts.createSourceFile(rel,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(sf.parseDiagnostics.length) stop('Menuekomponente enthaelt Syntaxfehler: '+ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText,' '));
  const array=findArray(ts,sf);
  if(!array) stop('managementNavSections konnte nicht als Array gelesen werden.');
  for(const [href] of entries) {
    const page=path.join(root,'app',href.slice(1),'page.tsx');
    if(!fs.existsSync(page)) stop('Zielseite fehlt: '+href);
  }
  return {already:false,rel,original,ts,sf,array};
}
function prepare(state) {
  const {original,ts,sf,array}=state;
  const nl=original.includes('\r\n')?'\r\n':'\n';
  const within=original.slice(array.getStart(sf),array.getEnd());
  const found=new Map(entries.map(([href])=>[href,[]]));
  // Ausschliesslich direkte Objekte in sections[].items[]. Nie beliebigen Programmcode loeschen.
  for(const section of array.elements) {
    if(!ts.isObjectLiteralExpression(section)) stop('Unerwartetes Element in managementNavSections.');
    for(const prop of section.properties) {
      if(!ts.isPropertyAssignment(prop)||prop.name.getText(sf)!=='items') continue;
      if(!ts.isArrayLiteralExpression(prop.initializer)) stop('Ein Verwaltungs-Abschnitt hat kein statisches items-Array.');
      for(const item of prop.initializer.elements) {
        if(!ts.isObjectLiteralExpression(item)) continue;
        for(const field of item.properties) {
          if(!ts.isPropertyAssignment(field)||field.name.getText(sf)!=='href') continue;
          if(!ts.isStringLiteral(field.initializer) && !ts.isNoSubstitutionTemplateLiteral(field.initializer)) continue;
          const href=field.initializer.text;
          if(found.has(href)) found.get(href).push(item);
        }
      }
    }
  }
  // Wenn ein Link zwar vorhanden, aber nicht als einfaches Navigationsobjekt erkannt ist,
  // brechen wir ab anstatt moeglicherweise Daten oder Menues zu beschaedigen.
  for(const [href] of entries) {
    const re=new RegExp('\\bhref\\s*:\\s*(["\\x27])'+esc(href)+'\\1','g');
    const literalReferences=Array.from(within.matchAll(re)).length;
    if(literalReferences!==found.get(href).length) stop('DJI-Link kann nicht sicher verschoben werden: '+href+'. Bitte Menuezeile zeigen.');
  }
  const edits=[]; const moved=[];
  for(const [href] of entries) {
    for(const item of found.get(href)) {
      moved.push(href);
      const from=item.getStart(sf);let to=item.getEnd();
      // Ggf. das Komma nach dem entfernten Navigationsobjekt mit entfernen.
      const next=original.slice(to).match(/^[ \t]*,/);
      if(next) to+=next[0].length;
      edits.push({from,to,replacement:''});
    }
  }
  const sectionText=[
    '    // '+marker+': DJI-Administration zentral im Verwaltungsmenue.',
    '    {',
    '      title: "DJI / Drohnen",',
    '      color: "border-sky-200 bg-sky-50 text-sky-950",',
    '      items: [',
    ...entries.map(([href,label])=>`        { href: "${href}", label: "${label}" },`),
    '      ],',
    '    },'
  ].join(nl);
  const last=array.elements[array.elements.length-1];
  const tail=last?original.slice(last.getEnd(),array.getEnd()-1):'';
  const separator=last && !/^[ \t]*,/.test(tail)?',':'';
  edits.push({from:array.getEnd()-1,to:array.getEnd()-1,replacement:separator+nl+sectionText+nl+'  '});
  edits.sort((a,b)=>b.from-a.from || b.to-a.to);
  for(let i=1;i<edits.length;i++) if(edits[i].to>edits[i-1].from) stop('Ueberlappende Aenderungsbereiche entdeckt.');
  let result=original;
  for(const {from,to,replacement} of edits) result=result.slice(0,from)+replacement+result.slice(to);

  const hasMobile=/<nav\b[^>]*md:hidden/.test(result) || /(?:MobileMenu|MobileNavigation|MobileNav)/.test(result) || /<summary\b[^>]*>[^<]*Men(?:ü|ue)\s*(?:öffnen|oeffnen)/.test(result);
  if(!hasMobile) {
    const mobile=[
      '          {/* '+marker+': dieselbe Navigation auch auf dem Smartphone. */}',
      '          <div className="mt-2 md:hidden">',
      '            <details className="rounded-xl border border-gray-200 bg-white">',
      '              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">☰ Menü öffnen</summary>',
      '              <div className="max-h-[65vh] space-y-2 overflow-y-auto border-t border-gray-200 p-2">',
      '                {[',
      '                  { label: "Persönlicher Bereich", sections: personalNavSections },',
      '                  ...(isAdmin ? [',
      '                    { label: "⚙ Verwaltung", sections: managementNavSections },',
      '                    { label: "📊 Einsatzleitung", sections: operationsNavSections },',
      '                  ] : []),',
      '                ].map((group) => (',
      '                  <details key={group.label} className="rounded-lg border border-gray-200">',
      '                    <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-gray-900">{group.label}</summary>',
      '                    <div className="space-y-2 px-2 pb-2">',
      '                      {group.sections.map((part) => (',
      '                        <div key={part.title} className={`rounded-lg border p-2 ${part.color}`}>',
      '                          <div className="px-2 py-1 text-xs font-bold">{part.title}</div>',
      '                          <div className="space-y-1">',
      '                            {part.items.map((item) => (',
      '                              <Link key={item.href} href={item.href} className="block rounded-md bg-white/85 px-3 py-2 text-sm text-gray-900">',
      '                                {item.label}',
      '                              </Link>',
      '                            ))}',
      '                          </div>',
      '                        </div>',
      '                      ))}',
      '                    </div>',
      '                  </details>',
      '                ))}',
      '              </div>',
      '            </details>',
      '          </div>',
      ''
    ].join(nl)+nl;
    const anchor='<nav className="mt-3 hidden flex-wrap gap-2 md:flex">';
    if(result.split(anchor).length!==2) stop('Desktop-Navigationsanker nicht eindeutig.');
    result=result.replace(anchor,mobile+'          '+anchor);
  }
  const checked=ts.createSourceFile(state.rel,result,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(checked.parseDiagnostics.length) stop('Nach Menueanpassung waere die TSX-Syntax fehlerhaft: '+ts.flattenDiagnosticMessageText(checked.parseDiagnostics[0].messageText,' '));
  const checkedArray=findArray(ts,checked);
  if(!checkedArray) stop('Verwaltungsmenue ist nach Anpassung nicht lesbar.');
  const block=result.slice(checkedArray.getStart(checked),checkedArray.getEnd());
  for(const [href] of entries) {
    const re=new RegExp('\\bhref\\s*:\\s*(["\\x27])'+esc(href)+'\\1','g');
    const count=Array.from(block.matchAll(re)).length;
    if(count!==1) stop('DJI-Link nach Anpassung nicht eindeutig: '+href+' ('+count+').');
  }
  return {result,moved,mobileInserted:!hasMobile};
}
try {
  const current=inspect();
  if(current.already) {console.log('DJI-Menues V11.3 bereits installiert. Keine Aenderung.');process.exit(0);}
  const next=prepare(current);
  if(checkOnly) {
    console.log('VORPRUEFUNG OK:',current.rel);
    console.log('Verschobene vorhandene DJI-Links:',next.moved.join(', ')||'keine');
    console.log('5 DJI-Links zentral unter Verwaltung, ohne Duplikate.');
    console.log(next.mobileInserted?'Mobiles Menue wird ergaenzt.':'Vorhandenes mobiles Menue bleibt.');
    console.log('Keine Aenderung an Datenbank, MQTT, DJI-API, PinPoints oder Timern.');
    process.exit(0);
  }
  const backup=path.join(root,'.backups','dji-menu-v11-3-'+new Date().toISOString().replace(/[:.]/g,'-'));
  const saved=path.join(backup,current.rel);
  fs.mkdirSync(path.dirname(saved),{recursive:true});
  fs.copyFileSync(path.join(root,current.rel),saved,fs.constants.COPYFILE_EXCL);
  try {fs.writeFileSync(path.join(root,current.rel),next.result,'utf8');}
  catch(e){fs.copyFileSync(saved,path.join(root,current.rel));throw e;}
  console.log('DJI-Menues V11.3 installiert:',current.rel);
  console.log('Sicherung:',backup);
  console.log('Danach npm.cmd run build.');
}catch(e){console.error(e.message);process.exitCode=1;}
