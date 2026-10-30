"use strict";
// REHKITZ_WILD_DIALOG_MENUE_V1
// Nur Sicherungsort-Dialog und Navigation. Keine DB/API/DJI/Timer-Aenderungen.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const dryRun = process.argv.includes('--check');
const marker = 'REHKITZ_WILD_DIALOG_MENUE_V1';
const MODAL = 'components/orders/SecuredWildCaptureModal.tsx';
const HEADERS = ['components/layout/app-header.tsx', 'components/app-header.tsx'];
const MOBILE = 'components/layout/mobile-bottom-nav.tsx';
const TARGET = '/sicherungsorte';
function stop(msg) { throw new Error('ABBRUCH: ' + msg + ' (keine Dateien veraendert)'); }
function read(rel) { if(!fs.existsSync(path.join(root,rel))) stop('Datei fehlt: ' + rel); return fs.readFileSync(path.join(root,rel),'utf8'); }
function occurrences(s,needle) { return s.split(needle).length - 1; }
function onlyOnce(s,needle,where) { if(occurrences(s,needle)!==1) stop(where+' fehlt oder mehrfach: '+needle); }
function tsParse(ts,rel,s) {
  const sf=ts.createSourceFile(rel,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if(sf.parseDiagnostics.length) stop('TSX-Syntaxfehler in '+rel+': '+ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText,' '));
  return sf;
}
function modalPatch(src) {
  if(src.includes(marker)) return {result:src,already:true};
  onlyOnce(src,'Wild-Sicherungsort erfassen?','Dialog-Ueberschrift');
  const oldPrompt = 'Du hast gesichertes Wild erfasst. Soll dein jetziger Handy-Standort als Sicherungsort gespeichert werden?';
  onlyOnce(src,oldPrompt,'Bisheriger Hinweis zur GPS-Erfassung');
  const skipButton = /^[ \t]*<button\b[^\r\n]*>Ohne Sicherungsort fortfahren<\/button>[ \t]*\r?\n/mg;
  const skipMatches=src.match(skipButton) || [];
  if(skipMatches.length!==1) stop('Button "Ohne Sicherungsort fortfahren" nicht eindeutig gefunden.');
  // Die aktuelle V1.1 hat die Umlaute in diesen Texten, daher bewusst wortwoertlich ersetzen.
  const actualNote = /^[ \t]*<p\b[^\r\n]*>Das Wildzahlergebnis ist bereits gespeichert\. Der Sicherungsort wird um Mitternacht gelöscht\. Keine Freilass-Bestätigung erforderlich\.<\/p>[ \t]*\r?\n/gm;
  if((src.match(actualNote)||[]).length!==1) stop('Erklaertext unter dem Button nicht eindeutig gefunden.');
  const result = src.replace('Wild-Sicherungsort erfassen?','Wild-Sicherungsort erfassen')
    .replace(oldPrompt,'Du hast gesichertes Wild erfasst. Übernimm jetzt den aktuellen GPS-Standort direkt am gesicherten Tier.')
    .replace(skipButton,'')
    .replace(actualNote,'');
  if(result.includes('Ohne Sicherungsort fortfahren') || result.includes('Wild-Sicherungsort erfassen?')) stop('Dialog-Bereinigung unvollstaendig.');
  const nl=src.includes('\r\n')?'\r\n':'\n';
  return {result:'// '+marker+' – vereinfachter Sicherungsort-Dialog.'+nl+result};
}
function headerPatch(src) {
  if(src.includes(marker)) return {result:src,already:true};
  if(src.includes('href: "'+TARGET+'"') || src.includes("href: '"+TARGET+"'")) stop('Menuepunkt Sicherungsorte bereits vorhanden; bitte keine Doppelung.');
  const begin1 = src.indexOf('const personalNavSections = [');
  const begin2 = src.indexOf('const personalNavItems = [');
  let begin = begin1!==-1 ? begin1 : begin2;
  if(begin<0) stop('Persoenliches Menue im App-Header nicht gefunden.');
  let end;
  if(begin1!==-1) end=src.indexOf('const personalNavItems =',begin1);
  else end=src.indexOf('const managementNavItems =',begin2);
  if(end<0 || end<=begin) stop('Persoenliche Navigation nicht eindeutig abgegrenzt.');
  const chunk=src.slice(begin,end);
  const anchor=/^([ \t]*)\{ href: (["'])\/my-orders\2, label: (["'])Meine Aufträge\3 \},(\r?\n)/m;
  const found=[...chunk.matchAll(new RegExp(anchor.source,'gm'))];
  if(found.length!==1) stop('Eintrag "Meine Auftraege" im persoenlichen Menue nicht eindeutig gefunden.');
  const indent=found[0][1], nl=found[0][4];
  // ^\\s* darf keine Zeilenumbrueche schlucken.
  if(indent.includes('\n')||indent.includes('\r')) stop('Menueeintrag hat unerwartete Einrueckung.');
  const inserted=chunk.replace(anchor, all => all + indent+'{ href: "'+TARGET+'", label: "Wild-Sicherungsorte" },'+nl);
  if(inserted===chunk) stop('Konnte Menuepunkt nicht einsetzen.');
  const bol=src.lastIndexOf('\n',begin-1)+1;
  const existingIndent=src.slice(bol,begin);
  const lineEnd=src.includes('\r\n')?'\r\n':'\n';
  if(!/^[ \t]*$/.test(existingIndent)) stop('Menueabschnitt steht nicht alleine in einer Zeile.');
  return {result:src.slice(0,bol)+existingIndent+'// '+marker+' – Sicherungsorte fuer alle Rollen im persoenlichen Menue.'+lineEnd+existingIndent+inserted+src.slice(end)};
}
function mobilePatch(ts,src) {
  if(!src) return {result:null,mode:'keine separate mobile Navigation'};
  if(src.includes(marker)) return {result:src,already:true,mode:'bereits installiert'};
  if(src.includes('"'+TARGET+'"') || src.includes("'"+TARGET+"'")) return {result:src,mode:'Menuepunkt bereits vorhanden'};
  const sf=tsParse(ts,MOBILE,src);
  const candidates=[];
  function getProp(node,n) {
    return node.properties.find(p=>ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)) && p.name.text===n);
  }
  function visit(node){
    if(ts.isObjectLiteralExpression(node)) {
      const h=getProp(node,'href');
      const name=getProp(node,'label')||getProp(node,'title')||getProp(node,'text');
      if(h && ts.isStringLiteral(h.initializer) && h.initializer.text==='/my-orders' && name && ts.isStringLiteral(name.initializer)) {
        candidates.push({type:'object',node,href:h.initializer.text,label:name.initializer.text});
      }
    }
    if(ts.isJsxElement(node) && node.openingElement.tagName.getText(sf)==='Link') {
      const h=node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.text==='href');
      if(h && h.initializer && ts.isStringLiteral(h.initializer) && h.initializer.text==='/my-orders') {
        const inner=src.slice(node.openingElement.getEnd(),node.closingElement.getStart(sf));
        if(/Meine Aufträge/.test(inner)) candidates.push({type:'jsx',node});
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  if(candidates.length!==1) {
    // Kein riskanter Eingriff in unbekannte Smartphone-Navigation.
    return {result:src,mode:'nicht sicher erkannt – bitte mobile-bottom-nav.tsx gesondert pruefen'};
  }
  const {type,node}=candidates[0];
  const start=node.getStart(sf), end=node.getEnd();
  const old=src.slice(start,end);
  let clone;
  if(type==='object') {
    if(!old.includes('"/my-orders"')&&!old.includes("'/my-orders'")) return {result:src,mode:'unbekannte mobile Menuestruktur'};
    clone=old.replace(/(["'])\/my-orders\1/,'"'+TARGET+'"').replace(/(["'])Meine Aufträge\1/,'"Wild-Sicherungsorte"');
  } else {
    clone=old.replace(/(["'])\/my-orders\1/,'"'+TARGET+'"').replace('Meine Aufträge','Wild-Sicherungsorte');
  }
  if(clone===old||!clone.includes(TARGET)) stop('Mobile Navigation konnte nicht geklont werden.');
  const bol=src.lastIndexOf('\n',start-1)+1;
  const indent=src.slice(bol,start);
  if(!/^[\t ]*$/.test(indent)) return {result:src,mode:'mobiler Menueeintrag nicht zeilenweise gesetzt'};
  const nl=src.includes('\r\n')?'\r\n':'\n';
  if(type==='object') {
    const after=src.slice(end,src.indexOf('\n',end)<0?src.length:src.indexOf('\n',end));
    if(!/^\s*,?\s*\r?$/.test(after)) return {result:src,mode:'mobiles Menueobjekt nicht zeilenweise gesetzt'};
    if(!after.includes(',')) return {result:src,mode:'mobiler Menueeintrag ohne Komma – nicht sicher einsetzbar'};
    const at=src.indexOf('\n',end);
    if(at<0) return {result:src,mode:'mobile Menuezeile ohne Zeilenumbruch'};
    const result=src.slice(0,at+1)+indent+clone+','+nl+src.slice(at+1);
    tsParse(ts,MOBILE,result);
    return {result:'// '+marker+' – Wild-Sicherungsorte im mobilen Menue.\n'+result,mode:'mobiles Menue-Array'};
  }
  const tail=src.slice(end,src.indexOf('\n',end)<0?src.length:src.indexOf('\n',end));
  if(!/^\s*\r?$/.test(tail)) return {result:src,mode:'mobiler JSX-Eintrag nicht zeilenweise gesetzt'};
  const at=src.indexOf('\n',end); if(at<0) return {result:src,mode:'mobile JSX-Zeile nicht eindeutig'};
  const result=src.slice(0,at+1)+indent+clone+nl+src.slice(at+1);
  tsParse(ts,MOBILE,result);
  return {result:'// '+marker+' – Wild-Sicherungsorte im mobilen Menue.\n'+result,mode:'mobiles Link-Element'};
}
function main(){
  if(!fs.existsSync(path.join(root,'package.json'))) stop('Bitte im Projektverzeichnis starten.');
  if(!fs.existsSync(path.join(root,'app/sicherungsorte/page.tsx'))) stop('Seite app/sicherungsorte/page.tsx fehlt.');
  const headerCandidates=HEADERS.filter(p=>fs.existsSync(path.join(root,p))&&read(p).includes('const personalNav'));
  if(headerCandidates.length!==1) stop('App-Header nicht eindeutig gefunden; bitte Pfad pruefen.');
  const HEADER=headerCandidates[0];
  let ts; try{ts=require('typescript');}catch{stop('TypeScript-Paket fehlt (npm install).');}
  const originals={[MODAL]:read(MODAL),[HEADER]:read(HEADER)};
  if(fs.existsSync(path.join(root,MOBILE))) originals[MOBILE]=read(MOBILE);
  const modal=modalPatch(originals[MODAL]), header=headerPatch(originals[HEADER]);
  const mobile=mobilePatch(ts,originals[MOBILE]||null);
  if(MOBILE in originals && mobile.mode && !['mobiles Menue-Array','mobiles Link-Element','bereits installiert','Menuepunkt bereits vorhanden'].includes(mobile.mode))
    stop('Handy-Menue nicht eindeutig gefunden: '+mobile.mode+'. Bitte aktuelle '+MOBILE+' zeigen.');
  const patches={[MODAL]:modal.result,[HEADER]:header.result};
  if(mobile.result!==null && MOBILE in originals) patches[MOBILE]=mobile.result;
  for(const [rel,code] of Object.entries(patches)) tsParse(ts,rel,code);
  const changed=Object.keys(patches).filter(p=>patches[p]!==originals[p]);
  console.log('Pruefung OK. Änderungen:',changed.join(', ')||'keine');
  console.log('Handy-Navigation:',mobile.mode||'bereits installiert');
  if(dryRun) { console.log('VORPRUEFUNG OK – keine Dateien veraendert.'); return; }
  if(changed.length===0) {console.log('Bereits eingerichtet.');return;}
  const backup=path.join(root,'.backups','wild-dialog-menue-v1-'+new Date().toISOString().replace(/[:.]/g,'-'));
  for(const rel of changed){const out=path.join(backup,rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,rel),out,fs.constants.COPYFILE_EXCL);}
  const written=[];
  try{
    for(const rel of changed){fs.writeFileSync(path.join(root,rel),patches[rel],'utf8');written.push(rel);}
  }catch(e){for(const rel of written)fs.copyFileSync(path.join(backup,rel),path.join(root,rel));throw e;}
  console.log('Fertig. Sicherung:',backup);
  if(mobile.mode?.startsWith('nicht sicher')||mobile.mode?.startsWith('mobiler')&&mobile.mode.includes('nicht'))
    console.log('HINWEIS: Die separate mobile Navigation wurde nicht angepasst. Bitte deren Quellcode zeigen, falls dort der Link fehlt.');
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
