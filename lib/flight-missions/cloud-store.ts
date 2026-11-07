// REHKITZ_WAYLINE_CLOUD_V1: persistente Pilot2 Routenbibliothek ohne DB-Migration.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export type StoredMission = {
  id:string; name:string; fieldId:string; aircraft:"M3T"|"M4T";
  camera:"THERMAL"|"RGB_WIDE"; size:number; sign:string;
  createdAt:number; workspaceId:string;
};
function baseDir(){return process.env.DJI_WAYLINE_STORAGE_DIR || path.join(process.cwd(),".data","dji-waylines");}
function validId(id:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);}
function indexPath(){return path.join(baseDir(),"index.json");}
export function configuredWorkspace(){return (process.env.DJI_WORKSPACE_ID || process.env.DJI_CLOUD_WORKSPACE_ID || "").trim();}
export function publicOrigin(requestUrl:string){
 const raw=process.env.DJI_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || new URL(requestUrl).origin;
 const url=new URL(raw);
 if(url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname))throw new Error("Fuer DJI-Dateien ist eine oeffentliche HTTPS-Adresse erforderlich (DJI_PUBLIC_BASE_URL).");
 return url.origin;
}
async function listRaw():Promise<StoredMission[]>{
 try{const json=JSON.parse(await fs.readFile(indexPath(),"utf8"));return Array.isArray(json)?json.filter(x=>validId(x?.id)):[];}
 catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}
}
// REHKITZ_DJI_CLOUD_ARCHIVE_V2_5
// Cloud-Missionen werden per separater Archiv-Markierung ausgeblendet.
// index.json und die KMZ-Dateien bleiben erhalten (kein Datenverlust).
function archiveDir(){return path.join(baseDir(),".archivierte-cloud-missionen");}
async function archivedWaylineIds():Promise<Set<string>>{
 try{
  const entries=await fs.readdir(archiveDir());
  return new Set(entries.filter(name=>name.endsWith(".json")).map(name=>name.slice(0,-5)).filter(validId));
 }catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return new Set<string>();throw e;}
}
export async function archiveCloudWayline(id:string,workspaceId?:string):Promise<boolean>{
 if(!validId(id))return false;
 const mission=(await listRaw()).find(m=>m.id===id&&(!workspaceId||!m.workspaceId||m.workspaceId===workspaceId));
 if(!mission)return false;
 await fs.mkdir(archiveDir(),{recursive:true,mode:0o700});
 const marker=path.join(archiveDir(),id+".json");
 try{
  await fs.writeFile(marker,JSON.stringify({id:mission.id,name:mission.name,workspaceId:mission.workspaceId,archivedAt:Date.now()},null,2),{flag:"wx",mode:0o600});
  return true;
 }catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")return false;throw e;}
}

export async function listWaylines(workspaceId?:string){const [all,hidden]=await Promise.all([listRaw(),archivedWaylineIds()]);return all.filter(x=>!hidden.has(x.id)&&(!workspaceId||!x.workspaceId||x.workspaceId===workspaceId)).sort((a,b)=>b.createdAt-a.createdAt);}
export async function findWayline(id:string,workspaceId?:string){if(!validId(id))return null;return (await listWaylines(workspaceId)).find(x=>x.id===id)||null;}
export async function storeWayline(meta:Omit<StoredMission,"id"|"size"|"sign"|"createdAt">,file:Uint8Array){
 if(file.byteLength<500||file.byteLength>6_000_000)throw new Error("KMZ-Groesse ausserhalb des Testlimits.");
 await fs.mkdir(baseDir(),{recursive:true,mode:0o700});
 const id=randomUUID();
 const entry:StoredMission={...meta,id,size:file.byteLength,sign:createHash("md5").update(file).digest("hex"),createdAt:Date.now()};
 const all=await listRaw();
 if(all.length>=150)throw new Error("150 Missionen gespeichert. Bitte vorher aufraeumen.");
 // Eindeutige Datei, atomarer Indexwechsel; nur ein Admin-Schreibvorgang gleichzeitig vorgesehen.
 await fs.writeFile(path.join(baseDir(),id+".kmz"),file,{flag:"wx",mode:0o600});
 try{
  const tmp=indexPath()+"."+id+".tmp";
  await fs.writeFile(tmp,JSON.stringify([entry,...all],null,2),{flag:"wx",mode:0o600});
  await fs.rename(tmp,indexPath());
 }catch(e){await fs.rm(path.join(baseDir(),id+".kmz"),{force:true});throw e;}
 return entry;
}
export async function readWaylineKmz(id:string){if(!validId(id))throw new Error("Ungueltige Mission-ID.");return fs.readFile(path.join(baseDir(),id+".kmz"));}
function secret(){const key=process.env.DJI_WAYLINE_DOWNLOAD_SECRET || (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET);
 if(!key || key.length<24)throw new Error("NEXTAUTH_SECRET oder DJI_WAYLINE_DOWNLOAD_SECRET fehlt/ist zu kurz.");return key;}
function signature(id:string,exp:number){return createHmac("sha256",secret()).update(id+"."+exp).digest("hex");}
export function signedUrl(id:string,origin:string){
 const exp=Math.floor(Date.now()/1000)+900;
 return `${origin}/api/dji-wayline-file/${id}?exp=${exp}&sig=${signature(id,exp)}`;
}
export function validSignature(id:string,expValue:string|null,sig:string|null){
 if(!validId(id)||!expValue||!/^[0-9]{10,11}$/.test(expValue)||!sig||!/^[a-f0-9]{64}$/.test(sig))return false;
 const exp=Number(expValue),now=Math.floor(Date.now()/1000);
 if(exp<now||exp>now+901)return false;
 const expected=Buffer.from(signature(id,exp),"hex"),actual=Buffer.from(sig,"hex");
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
