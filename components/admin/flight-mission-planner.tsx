// REHKITZ_WAYLINE_CLOUD_V1 - M4T und Pilot2-Cloud-Routenbibliothek.
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { createFlightPlan, type MissionOptions, type FlightPlan } from "@/lib/flight-missions/planner";
import { cameraCoverage, optionsForCamera, type MissionCamera, type Coverage } from "@/lib/flight-missions/coverage";
const FlightMissionMap=dynamic(()=>import("@/components/admin/flight-mission-map"),{ssr:false,loading:()=> <div className="flex h-[420px] items-center justify-center rounded-xl bg-gray-100 text-gray-700">Satellitenkarte wird geladen ...</div>});
type Field={id:string;name:string;displayName:string|null;areaGeoJson:unknown};
const initial:MissionOptions={altitude:50,speed:5,spacing:25,direction:0,margin:5};
export default function FlightMissionPlanner(){
 const [fields,setFields]=useState<Field[]>([]);
 const [fieldId,setFieldId]=useState("");
 const [aircraft,setAircraft]=useState<"M3T"|"M4T">("M3T");
 const [camera,setCamera]=useState<MissionCamera>("THERMAL");
 const [overlapPercent,setOverlapPercent]=useState(40);
 const [manualSpacing,setManualSpacing]=useState(false);
 const [options,setOptions]=useState<MissionOptions>(initial);
 const [search,setSearch]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [publishing,setPublishing]=useState(false);
 const [publishMessage,setPublishMessage]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  fetch('/api/admin/flugmissionen/felder',{cache:'no-store'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data?.error||'Flächen konnten nicht geladen werden');if(active){setFields(data.fields||[]);setFieldId((data.fields||[])[0]?.id||'');}})
  .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 const field=useMemo(()=>fields.find(f=>f.id===fieldId)||null,[fields,fieldId]);
 const coverage=useMemo<{info:Coverage|null;error:string}>(()=>{
  try{return {info:cameraCoverage(aircraft,camera,options.altitude,overlapPercent),error:""};}
  catch(e){return {info:null,error:e instanceof Error?e.message:String(e)};}
 },[aircraft,camera,options.altitude,overlapPercent]);
 const effectiveOptions=useMemo(()=>{
  if(!coverage.info)return null;
  return optionsForCamera(options,aircraft,camera,overlapPercent,manualSpacing);
 },[options,aircraft,camera,overlapPercent,manualSpacing,coverage.info]);
 const result=useMemo<{plan:FlightPlan|null;reason:string}>(()=>{
  if(!field)return {plan:null,reason:''};
  if(!effectiveOptions)return {plan:null,reason:coverage.error};
  try{return {plan:createFlightPlan(field.areaGeoJson,effectiveOptions),reason:''};}
  catch(e){return {plan:null,reason:e instanceof Error?e.message:'Flugroute konnte nicht berechnet werden.'};}
 },[field,effectiveOptions,coverage.error]);
 const visible=useMemo(()=>fields.filter(f=>`${f.displayName||''} ${f.name}`.toLowerCase().includes(search.toLowerCase())).slice(0,400),[fields,search]);
 const setNumber=(key:keyof MissionOptions,value:string)=>setOptions(o=>({...o,[key]:Number(value)}));
 async function publishToPilot2(){
  if(!field||!result.plan||publishing)return;
  if(!window.confirm(`Mission für ${field.displayName||field.name} (${aircraft}) auf dem Server veröffentlichen? Das ist noch keine Flugfreigabe.`))return;
  setError("");setPublishMessage("");setPublishing(true);
  try{
   const res=await fetch("/api/admin/flugmissionen/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fieldId,options,aircraft,camera,overlapPercent,manualSpacing})});
   const json=await res.json();if(!res.ok)throw new Error(json?.error||"Veröffentlichung fehlgeschlagen.");
   setPublishMessage(`In Cloud-Bibliothek gespeichert: ${json.mission?.name}. Jetzt DJI Pilot 2 am Controller öffnen und die Mission dort laden.`);
  }catch(e){setError(e instanceof Error?e.message:"Fehler beim Veröffentlichen.");}
  finally{setPublishing(false);}
 }
 async function download(){
  if(!field||!result.plan||busy)return;
  setError('');setBusy(true);
  try{
   const res=await fetch('/api/admin/flugmissionen/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldId,options,aircraft,camera,overlapPercent,manualSpacing})});
   if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'KMZ-Export fehlgeschlagen.');}
   const blob=await res.blob();const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`${(field.displayName||field.name).replace(/[^A-Za-z0-9_-]/g,'_')}-${aircraft}.kmz`;document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(e){setError(e instanceof Error?e.message:'Unbekannter Fehler');}
  finally{setBusy(false);}
 }
 return <div className="space-y-4">
  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Wichtig – Testversion:</strong> Die Route ist ein Entwurf, keine freigegebene Flugmission. Vor einem Flug muss der verantwortliche Pilot in DJI Pilot 2 die gesamte Route, Höhe relativ zum Startpunkt, Hindernisse, Luftraum, Abdeckung und Rückkehr-Einstellungen prüfen. Niemals unbesehen starten.</div>
  <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
   <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div><label className="mb-2 block text-sm font-bold text-gray-900">FL-Fläche auswählen</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="FL-Nummer oder Name suchen" className="mb-2 w-full rounded-lg border border-gray-400 p-3 text-gray-950"/>
      <select value={fieldId} onChange={e=>setFieldId(e.target.value)} className="w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950" disabled={loading}>
       {visible.length===0 && <option value="">Keine Flächen gefunden</option>}
       {field && !visible.some(x=>x.id===field.id) && <option value={field.id}>{field.displayName||'Ohne FL-Nr.'} · {field.name}</option>}
       {visible.map(f=><option key={f.id} value={f.id}>{f.displayName||'Ohne FL-Nr.'} · {f.name}</option>)}
      </select>
    </div>
    <div><label className="mb-2 block text-sm font-bold text-gray-900">Drohne</label><select value={aircraft} onChange={e=>setAircraft(e.target.value as 'M3T'|'M4T')} className="w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950"><option value="M3T">DJI Mavic 3 Thermal (M3T)</option><option value="M4T">DJI Matrice 4 Thermal (M4T)</option></select>
     {aircraft==='M4T' && <p className="mt-2 text-xs text-amber-900">M4T-WPML-Kennung aus einer Pilot-2-erprobten Referenz. Der Import unserer Mission muss dennoch am Controller getestet werden.</p>}
    </div>
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="text-sm font-bold text-indigo-950">Kameraabhängiger Flugbahnabstand</div>
      <label className="block text-sm font-semibold text-gray-950">Kamera
        <select value={camera} onChange={e=>setCamera(e.target.value as MissionCamera)} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950">
          <option value="THERMAL">Wärmebildkamera (empfohlen für Rehkitzsuche)</option>
          <option value="RGB_WIDE">RGB-Weitwinkelkamera (Näherung)</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-gray-950">Seitliche Überlappung (%)
        <input type="number" min="10" max="70" step="5" value={overlapPercent} onChange={e=>setOverlapPercent(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950"/>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-950"><input type="checkbox" checked={manualSpacing} onChange={e=>setManualSpacing(e.target.checked)} className="h-4 w-4"/> Bahnabstand manuell überschreiben</label>
      {coverage.info && <div className="text-sm text-indigo-950">DJI-Bildwinkel diagonal: {coverage.info.diagonalDeg}° · horizontal ca. {coverage.info.horizontalDeg.toFixed(1)}°<div>Rechnerische Bildbreite am Boden: <strong>{coverage.info.theoreticalWidthM.toFixed(1)} m</strong></div><div>Automatischer Bahnabstand bei {overlapPercent}% Überlappung: <strong>{coverage.info.suggestedSpacingM.toFixed(1)} m</strong></div></div>}
      {coverage.error && <p role="alert" className="text-sm font-semibold text-red-800">{coverage.error}</p>}
      <p className="text-xs text-indigo-950">Geometrische Näherung, kein Nachweis für Rehkitz-Erkennung oder vollständige Absuche. Gimbal muss senkrecht nach unten (-90°) ausgerichtet sein; kein digitaler Zoom. Geländehöhe, Sensorauflösung, Vegetation und Geschwindigkeit sind zusätzlich zu prüfen. Bei der M4T wird eine Gimbal-Ausrichtung auf -90° im KMZ angefordert. Die tatsächliche Ausführung muss in Pilot 2 kontrolliert werden.</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
     {([
      ['altitude','Flughöhe (m)','10','120','1'],['speed','Tempo (m/s)','1','12','0.5'],['direction','Flugrichtung (°)','0','359','1'],['margin','Randabstand (m)','0','50','1']
     ] as const).map(([key,label,min,max,step])=><label key={key} className="text-xs font-semibold text-gray-900">{label}<input type="number" min={min} max={max} step={step} value={options[key]} onChange={e=>setNumber(key,e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-400 p-2.5 text-base text-gray-950"/></label>)}
    </div>
    {manualSpacing && <label className="block text-xs font-semibold text-gray-900">Manueller Bahnabstand (m)<input type="number" min="1.5" max="220" step="0.5" value={options.spacing} onChange={e=>setNumber('spacing',e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950"/></label>}
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-gray-900">
     <strong>Flugplan:</strong> {result.plan?`${result.plan.lines.length} Suchbahnen · ${result.plan.waypoints.length} Wegpunkte`:"Keine Route"}
     {result.plan && <div className="mt-1">Bahnabstand: {effectiveOptions?.spacing.toFixed(1)} m {manualSpacing?"(manuell)":"(automatisch)"}</div>}
     {result.plan && <div className="mt-1">Suchstrecke: {(result.plan.searchMeters/1000).toFixed(2)} km · Gesamtroute: {(result.plan.totalMeters/1000).toFixed(2)} km · rechnerische reine Flugzeit: {result.plan.estimatedMinutes.toFixed(1)} Min. (ohne Start, Landung und Pausen)</div>}
     {result.reason && <p className="mt-2 font-semibold text-red-800">{result.reason}</p>}
    </div>
    <button type="button" onClick={()=>void download()} disabled={!result.plan||busy||publishing} className="w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400">{busy?'Export läuft ...':`${aircraft}-Mission als KMZ herunterladen`}</button>
    <button type="button" onClick={()=>void publishToPilot2()} disabled={!result.plan||publishing||busy} className="w-full rounded-xl border border-blue-700 bg-blue-800 px-4 py-3 font-bold text-white disabled:bg-gray-400">{publishing?"Veröffentliche ...":"Mission für DJI Pilot 2 in Cloud bereitstellen"}</button>
    {publishMessage&&<p role="status" className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm font-semibold text-green-900">{publishMessage}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
    <p className="text-xs text-gray-700">Cloud-Übertragung über den bestehenden DJI-Workspace: Die Mission wird in Pilot 2 als Cloud-Datei angeboten; Download, Import und Flugeinstellungen müssen am Controller geprüft werden. Es gibt keinen automatischen Start.</p>
   </section>
   <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <h2 className="text-lg font-bold text-gray-950">Satellitenkarte und geplante Suchbahnen</h2>
    {field?<FlightMissionMap key={field.id} area={field.areaGeoJson} plan={result.plan}/>:<p className="text-sm text-gray-700">{loading?'Flächen werden geladen ...':'Bitte Fläche auswählen.'}</p>}
    {result.plan&&<div className="space-y-1 text-xs text-amber-950">{result.plan.warnings.map((w,i)=><p key={i} className="rounded-lg bg-amber-50 px-3 py-2">⚠ {w}</p>)}</div>}
   </section>
  </div>
 </div>;
}
