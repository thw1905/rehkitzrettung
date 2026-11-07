"use client";
// REHKITZ_DJI_CLOUD_ARCHIVE_V2_5
import { useCallback, useEffect, useState } from "react";

type Mission={id:string;name:string;aircraft:"M3T"|"M4T";camera:"THERMAL"|"RGB_WIDE";createdAt:number;size:number};
const endpoint="/api/admin/flugmissionen/cloud-verwalten";
export default function CloudMissionManager(){
 const [missions,setMissions]=useState<Mission[]>([]);
 const [loading,setLoading]=useState(true);
 const [removing,setRemoving]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch(endpoint,{cache:"no-store",credentials:"same-origin"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Laden fehlgeschlagen.");
   setMissions(Array.isArray(data.missions)?data.missions:[]);
  }catch(e){setError(e instanceof Error?e.message:"Laden fehlgeschlagen.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function remove(m:Mission){
  if(removing)return;
  const ok=window.confirm(`Mission „${m.name}“ aus der DJI-Cloud-Bibliothek entfernen?\n\nDie KMZ-Datei bleibt als Sicherung erhalten. Bereits auf Fernsteuerungen heruntergeladene Kopien werden NICHT geloescht.`);
  if(!ok)return;
  setRemoving(m.id);setError("");setNotice("");
  try{
   const r=await fetch(endpoint,{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:m.id})});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Entfernen fehlgeschlagen.");
   setMissions(prev=>prev.filter(x=>x.id!==m.id));
   setNotice(`„${m.name}“ wurde aus der Cloud-Bibliothek entfernt.`);
  }catch(e){setError(e instanceof Error?e.message:"Entfernen fehlgeschlagen.");}
  finally{setRemoving(null);}
 }
 return <section className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <p className="text-sm">Veröffentlichte Cloud-Missionen: <strong>{missions.length}</strong></p>
   <button type="button" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50" onClick={()=>{setNotice("");void load();}} disabled={loading||removing!==null}>Liste aktualisieren</button>
  </div>
  {error && <p role="alert" className="rounded-lg border border-red-500 px-3 py-2 text-sm">{error}</p>}
  {notice && <p role="status" className="rounded-lg border border-green-500 px-3 py-2 text-sm">{notice}</p>}
  {loading?<p>Flugmissionen werden geladen …</p>:
   missions.length===0?<p className="rounded-lg border p-4">Keine veröffentlichten Cloud-Missionen vorhanden.</p>:
   <ul className="space-y-3">{missions.map(m=><li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
    <div className="min-w-0 flex-1">
     <p className="break-words font-semibold">{m.name}</p>
     <p className="text-xs opacity-75">{m.aircraft} · {m.camera==="THERMAL"?"Wärmebild":"RGB"} · {new Date(m.createdAt).toLocaleString("de-DE")} · {m.size} Bytes</p>
     <p className="break-all text-xs opacity-60">ID: {m.id}</p>
    </div>
    <button type="button" disabled={removing!==null} onClick={()=>void remove(m)} className="rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950">
     {removing===m.id?"Entferne …":"Aus Cloud entfernen"}
    </button>
   </li>)}</ul>}
  <p className="text-xs opacity-70">Entfernen blendet die Mission aus der Cloudrouten-Liste aus. Es werden keine KMZ-Dateien vernichtet. Bereits lokal gespeicherte DJI-Routen müssen bei Bedarf direkt an der Fernsteuerung entfernt werden.</p>
 </section>;
}
