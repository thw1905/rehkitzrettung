"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const target=path.join(process.cwd(),"components","dji","Pilot2BridgeSetup.tsx");
if(!fs.existsSync(target)){ console.error("ABBRUCH: DJI-Komponente nicht gefunden.");process.exit(1); }
let src=fs.readFileSync(target,"utf8");
const oldType='  platformIsVerified?: () => boolean | string;';
const newType=oldType+'\n  platformGetVersion?: () => string;\n  platformIsComponentLoaded?: (name: string) => string | boolean;';
const oldThrow='    throw new Error(`${step}: DJI antwortet mit Fehlercode ${result.code ?? "unbekannt"}.`);';
const newThrow='    const msg = safeDjiMessage(result.message);\n    throw new Error(`${step}: DJI-Fehlercode ${result.code ?? "unbekannt"}${msg ? " – " + msg : ""}.`);';
const oldCatch='      setError(reason instanceof Error ? reason.message : "Unbekannter DJI-Fehler.");';
const newCatch='      setError((reason instanceof Error ? reason.message : "Unbekannter DJI-Fehler.") + bridgeDiagnostics(window.djiBridge));';
const oldAnchor='function assertSuccess(raw: unknown, step: string) {';
const helper=`function safeDjiMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 300)
    .replace(/https?:\\/\\/\\S+/gi, "[URL verdeckt]")
    .replace(/(token|authorization|password|secret|license|appkey|apikey)\\s*[:=]\\s*[^\\s,;]+/gi, "$1=[verdeckt]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[Wert verdeckt]")
    .slice(0, 180);
}

function bridgeDiagnostics(bridge?: Bridge): string {
  if (!bridge) return "";
  const info: string[] = [];
  try {
    const raw = bridge.platformGetVersion?.();
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const v = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : obj;
        for (const k of ["appVersion", "modelVersion"]) {
          if (typeof v[k] === "string" && /^[a-zA-Z0-9._-]{1,32}$/.test(v[k] as string)) {
            info.push(k + ": " + v[k]);
          }
        }
      }
    }
  } catch { /* optional */ }
  try {
    const raw = bridge.platformIsComponentLoaded?.("api");
    if (typeof raw === "boolean") info.push("API-Modul geladen: " + (raw ? "ja" : "nein"));
    if (typeof raw === "string") {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === "object" && typeof (obj as {data?:unknown}).data === "boolean") {
        info.push("API-Modul geladen: " + ((obj as {data:boolean}).data ? "ja" : "nein"));
      }
    }
  } catch { /* optional */ }
  return info.length ? " | DJI-Diagnose: " + info.join(", ") : "";
}

`;
if(src.includes('function safeDjiMessage(') && src.includes('bridgeDiagnostics(window.djiBridge)')){
 console.log("DJI-Diagnose bereits installiert.");process.exit(0);
}
for(const [name,text] of [["Schnittstelle",oldType],["Fehlerbehandlung",oldThrow],["Fehleranzeige",oldCatch],["API-Anker",oldAnchor]]){
 if(src.split(text).length!==2){ console.error("ABBRUCH: Unerwartete Quelldatei bei "+name+". Nichts geaendert.");process.exit(1); }
}
if(!src.includes('host: window.location.origin + "/",')){
 console.error("ABBRUCH: Vorherige API-Host-Korrektur fehlt.");process.exit(1);
}
if(process.argv.includes("--check")) {console.log("Pruefung OK. Diagnose-Patch passt; nichts veraendert.");process.exit(0);}
src=src.replace(oldType,newType).replace(oldThrow,newThrow).replace(oldCatch,newCatch).replace(oldAnchor,helper+oldAnchor);
const backupDir=path.join(process.cwd(),"dji-backups");fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,"Pilot2BridgeSetup.before-diagnose."+new Date().toISOString().replace(/[:.]/g,"-")+".bak");
fs.copyFileSync(target,backup,fs.constants.COPYFILE_EXCL);
const tmp=target+"."+crypto.randomBytes(5).toString("hex")+".tmp";
fs.writeFileSync(tmp,src,{flag:"wx"});fs.renameSync(tmp,target);
console.log("DJI-Diagnose installiert. Sicherung:",backup);
console.log("Keine Datenbank-, MQTT- oder Lizenzwerte geaendert.");
