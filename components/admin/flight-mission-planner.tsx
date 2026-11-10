// REHKITZ_DJI_FLUGPLANUNG_V3_4
// REHKITZ_WAYLINE_CLOUD_V1 - M4T und Pilot2-Cloud-Routenbibliothek.
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { createFlightPlan, type MissionOptions, type FlightPlan } from "@/lib/flight-missions/planner";
import { cameraCoverage, optionsForCamera, type MissionCamera, type Coverage } from "@/lib/flight-missions/coverage";
import {type TerrainSettingsV31,type TerrainReportV31} from "@/lib/flight-missions/terrain-v31";
import type {HazardReportV32} from "@/lib/flight-missions/hazards-v32";
import FlightTerrainProfile from "@/components/admin/flight-terrain-profile-v31";
import {routeMetrics} from "@/lib/flight-missions/route-metrics-v34";
import {droneDefaults,type DroneV36} from "@/lib/flight-missions/profiles-v36";
const FlightMissionMap=dynamic(()=>import("@/components/admin/flight-mission-map"),{ssr:false,loading:()=> <div className="flex h-[330px] items-center justify-center rounded-xl bg-gray-100 text-gray-700">Satellitenkarte wird geladen ...</div>});
type Field={id:string;name:string;displayName:string|null;areaGeoJson:unknown};
const initial:MissionOptions={altitude:70,speed:6,spacing:25,direction:0,margin:0,autoDirection:true,autoStartAtFirst:true,smoothTurns:true};
const defaultTerrain:TerrainSettingsV31={startPoint:null,altitudeMode:"terrain",rthHeight:100};
type ExistingMission={
 id:string;name:string;aircraft:"M3T"|"M4T";camera:MissionCamera;createdAt:number;
 hasExactSettings:boolean;
 settings:{aircraft:"M3T"|"M4T";camera:MissionCamera;options:MissionOptions;overlapPercent:number;manualSpacing:boolean;terrain?:TerrainSettingsV31}|null;
 plan:FlightPlan|null;
};
export default function FlightMissionPlanner({orderId}:{orderId?:string}){
 const locked=Boolean(orderId);
 const [fields,setFields]=useState<Field[]>([]);
 const [fieldId,setFieldId]=useState("");
 const [aircraft,setAircraft]=useState<"M3T"|"M4T">("M4T");
 const [camera,setCamera]=useState<MissionCamera>("THERMAL");
 const [overlapPercent,setOverlapPercent]=useState(20);
 const [manualSpacing,setManualSpacing]=useState(false);
 const [options,setOptions]=useState<MissionOptions>(initial);
 const [terrain,setTerrain]=useState<TerrainSettingsV31>(defaultTerrain);
 const [terrainResult,setTerrainResult]=useState<{key:string;report:TerrainReportV31;hazards:HazardReportV32|null}|null>(null);
 const [analysing,setAnalysing]=useState(false);
 const [search,setSearch]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [publishing,setPublishing]=useState(false);
 const [publishMessage,setPublishMessage]=useState("");
 const [loading,setLoading]=useState(true);
 const [checking,setChecking]=useState(true);
 const [mission,setMission]=useState<ExistingMission|null>(null);
 const [dirty,setDirty]=useState(false);
 const [refreshMission,setRefreshMission]=useState(0);
 const [preparedPlan,setPreparedPlan]=useState<{fieldId:string;plan:FlightPlan;report:TerrainReportV31|null}|null>(null);
 const [staleMissionId,setStaleMissionId]=useState<string|null>(null);
 const [teamDayId,setTeamDayId]=useState<string|null>(null);
 const [teamDrone,setTeamDrone]=useState<DroneV36|null>(null);
 const [changingDrone,setChangingDrone]=useState(false);
 const [changeMessage,setChangeMessage]=useState("");
 const [loadedError,setLoadedError]=useState(false);
 useEffect(()=>{
  let active=true;
  fetch(orderId?`/api/flugmissionen/planung?orderId=${encodeURIComponent(orderId)}`:'/api/admin/flugmissionen/felder',{cache:'no-store'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data?.error||'Flächen konnten nicht geladen werden');if(active){const items:Field[]=orderId?(data.field?[data.field]:[]):(data.fields||[]);setFields(items);setFieldId(items[0]?.id||'');}})
  .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[orderId]);
 useEffect(()=>{
  if(!fieldId){setMission(null);setChecking(false);return;}
  const controller=new AbortController();
  setChecking(true);setLoadedError(false);setMission(null);setDirty(false);setError("");
  const qp=orderId?`orderId=${encodeURIComponent(orderId)}`:`fieldId=${encodeURIComponent(fieldId)}`;
  fetch(`/api/flugmissionen/planung?${qp}`,{cache:"no-store",signal:controller.signal})
   .then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data?.error||"Mission konnte nicht geladen werden.");if(!controller.signal.aborted){
     const current:ExistingMission|null=data.mission||null;
     setMission(current);
     if(current){setAircraft(current.aircraft);setCamera(current.camera);}
     else{setAircraft("M4T");setCamera("THERMAL");}
     if(current?.settings){setOptions({...current.settings.options});setOverlapPercent(current.settings.overlapPercent);setManualSpacing(current.settings.manualSpacing);setTerrain(current.settings.terrain??defaultTerrain);}
     else{setOptions(initial);setOverlapPercent(20);setManualSpacing(false);setTerrain(defaultTerrain);}
     setDirty(false);
     // Bei geaendertem Team oder Drohnentyp die vorhandene KMZ nicht als neue Planung anzeigen.
     const prepared=data?.preparation;
     const chosen:DroneV36|null=prepared?.assignment?.aircraft??null;
     setTeamDayId(prepared?.assignment?.team?.id??null);
     setTeamDrone(chosen);
     setStaleMissionId(prepared?.stale&&current?.id?current.id:null);
     setPreparedPlan(prepared?.draft?.plan ? {fieldId,plan:prepared.draft.plan,report:prepared.draft.terrainReport??null}:null);
     if(orderId && chosen && (prepared?.stale || !current || current.aircraft!==chosen)){
      const standard=droneDefaults(chosen);
      setMission(null);setAircraft(chosen);setCamera("THERMAL");
      // Gleicher Drohnentyp: bisherige manuelle Werte zur Pruefung erhalten.
      if(current?.aircraft===chosen && current.settings){
       setCamera(current.camera);setOptions(current.settings.options);setOverlapPercent(current.settings.overlapPercent);
       setManualSpacing(current.settings.manualSpacing);setTerrain({...standard.terrain,...(current.settings.terrain??{}),startPoint:null});
       setPreparedPlan(null);setDirty(true);
       setChangeMessage("Teamwechsel: bisherige manuelle Flugparameter wurden zur Kontrolle geladen. Startplatz und Gelaende neu pruefen.");
      }else{
       setOptions(standard.options);setOverlapPercent(standard.overlapPercent);
       setManualSpacing(false);setTerrain(standard.terrain);setDirty(!prepared?.draft?.plan);
       if(current)setChangeMessage("Die alte Cloud-Mission ist ueberholt. Neues Drohnenprofil und Suchbahnen bitte pruefen.");
      }
     } else if(orderId && !chosen){setChangeMessage("Diesem Team muss zuerst eine Drohne zugewiesen werden.");}
     else setChangeMessage("");
   }})
   .catch(e=>{if(!controller.signal.aborted){setLoadedError(true);setError(e instanceof Error?e.message:"Laden fehlgeschlagen.");}})
   .finally(()=>{if(!controller.signal.aborted)setChecking(false);});
  return ()=>controller.abort();
 },[fieldId,orderId,refreshMission]);
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
  if(mission?.plan && !dirty)return {plan:mission.plan,reason:''};
  if(!effectiveOptions)return {plan:null,reason:coverage.error};
  try{return {plan:createFlightPlan(field.areaGeoJson,effectiveOptions,terrain.startPoint),reason:''};}
  catch(e){return {plan:null,reason:e instanceof Error?e.message:'Flugroute konnte nicht berechnet werden.'};}
 },[field,effectiveOptions,coverage.error,mission,dirty,terrain.startPoint]);
 // Der erste Suchwegpunkt ist nur ein Vorschlag für die Startposition. Pilot kann umsetzen.
 const effectiveStart=options.autoStartAtFirst===true && result.plan?.waypoints.length?
  result.plan.waypoints[0]:(terrain.startPoint??null);
 const effectiveTerrain=useMemo<TerrainSettingsV31>(()=>({...terrain,startPoint:effectiveStart}),[terrain,effectiveStart]);
 const terrainKey=useMemo(()=>JSON.stringify({fieldId,options:effectiveOptions,start:effectiveStart,aircraft,camera,overlapPercent,manualSpacing,orderId}),
  [fieldId,effectiveOptions,effectiveStart,aircraft,camera,overlapPercent,manualSpacing,orderId]);
 const terrainReport=terrainResult?.key===terrainKey?terrainResult.report:null;
 const hazards=terrainResult?.key===terrainKey?terrainResult.hazards:null;
 const minAgl=terrainReport?(terrain.altitudeMode==='terrain'?terrainReport.adjustedMinGroundClearanceM:terrainReport.constantMinGroundClearanceM):null;
 const minCoverage=useMemo(()=>{
  if(minAgl===null||minAgl<10||minAgl>120)return null;
  try{return cameraCoverage(aircraft,camera,minAgl,overlapPercent);}catch{return null;}
 },[minAgl,aircraft,camera,overlapPercent]);
 const suggestedSpacing=minCoverage?.suggestedSpacingM??null;
 async function analyzeTerrain(){
  if(!field||!result.plan||!effectiveStart||analysing)return;
  setError("");setAnalysing(true);
  try {
   const res=await fetch("/api/flugmissionen/gelaende",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fieldId,orderId,options,aircraft,camera,overlapPercent,manualSpacing,startPoint:effectiveStart})});
   const json=await res.json();if(!res.ok)throw new Error(json?.error||"Geländedaten nicht verfuegbar.");
   setTerrainResult({key:terrainKey,report:json.report,hazards:json.hazards??null});
  }catch(e){setError(e instanceof Error?e.message:"Geländeprüfung fehlgeschlagen.");}
  finally{setAnalysing(false);}
 }
 const visible=useMemo(()=>fields.filter(f=>`${f.displayName||''} ${f.name}`.toLowerCase().includes(search.toLowerCase())).slice(0,400),[fields,search]);
 async function chooseDrone(next:DroneV36){
  if(changingDrone)return;
  if(dirty&&!window.confirm("Drohnenwechsel: die noch nicht gespeicherten Flugparameter werden durch die Werte der neuen Drohne ersetzt. Fortfahren?"))return;
  if(locked){
   if(!teamDayId){setError("Tages-Team nicht vorhanden.");return;}
   setChangingDrone(true);setError("");
   try{
    const res=await fetch("/api/flugmissionen/team-aircraft",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationDayTeamId:teamDayId,aircraft:next})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||"Drohnenwechsel fehlgeschlagen");
    setRefreshMission(v=>v+1);
   }catch(e){setError(e instanceof Error?e.message:"Drohnenwechsel fehlgeschlagen");}
   finally{setChangingDrone(false);}
  }else{
   const standard=droneDefaults(next);
   setDirty(true);setAircraft(next);setCamera("THERMAL");setOptions(standard.options);
   setOverlapPercent(standard.overlapPercent);setManualSpacing(false);setTerrain(standard.terrain);
  }
 }
 const setNumber=(key:'altitude'|'speed'|'spacing'|'direction'|'margin',value:string)=>{setDirty(true);setOptions(o=>({...o,[key]:Number(value),...(key==='direction'?{autoDirection:false}:{})}));};
 async function publishToPilot2(){
  if(!field||!result.plan||publishing||checking||loadedError||loading)return;
  if(!window.confirm(`${mission?"Vorhandene Cloud-Mission ersetzen":"Neue Cloud-Mission anlegen"} für ${field.displayName||field.name} (${aircraft})? Die vorherige Cloud-Mission wird dauerhaft ersetzt.`))return;
  setError("");setPublishMessage("");setPublishing(true);
  try{
   const res=await fetch("/api/flugmissionen/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fieldId,orderId,options,aircraft,camera,overlapPercent,manualSpacing,terrain:effectiveTerrain,expectedMissionId:mission?.id||null,reuseExisting:Boolean(mission&&!dirty)})});
   const json=await res.json();if(!res.ok)throw new Error(json?.error||"Veröffentlichung fehlgeschlagen.");
   setPublishMessage(`Aktuelle Cloud-Version gespeichert: ${json.mission?.name}. In DJI Pilot 2 die Mission erneut herunterladen.`);setRefreshMission(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:"Fehler beim Veröffentlichen.");}
  finally{setPublishing(false);}
 }
 async function download(){
  if(!field||!result.plan||busy)return;
  setError('');setBusy(true);
  try{
   const res=await fetch('/api/admin/flugmissionen/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldId,options,aircraft,camera,overlapPercent,manualSpacing,terrain:effectiveTerrain})});
   if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'KMZ-Export fehlgeschlagen.');}
   const blob=await res.blob();const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`${(field.displayName||field.name).replace(/[^A-Za-z0-9_-]/g,'_')}-${aircraft}.kmz`;document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(e){setError(e instanceof Error?e.message:'Unbekannter Fehler');}
  finally{setBusy(false);}
 }
 const metrics=useMemo(()=>result.plan?routeMetrics(result.plan,effectiveStart,effectiveOptions?.speed??options.speed):null,
  [result.plan,effectiveStart,effectiveOptions?.speed,options.speed]);
 const canPublish=Boolean((!locked||Boolean(teamDrone&&teamDrone===aircraft))&&result.plan&&!publishing&&!busy&&!checking&&!loading&&!loadedError&&!analysing&&
  !(terrain.altitudeMode==="terrain"&&!terrainReport)&&
  !(terrainReport&&terrain.altitudeMode==="terrain"&&terrain.rthHeight<terrainReport.recommendedRthM));
 return <div className="mx-auto max-w-[1560px] space-y-3 pb-16 text-gray-950 sm:space-y-4">
  <header className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:px-4">
   <div className="min-w-0">
    <h1 className="text-lg font-bold sm:text-xl">DJI-Flugmission planen</h1>
    <p className="text-xs text-gray-600 sm:text-sm">{field?.displayName||field?.name||"Flaeche laden..."} · {aircraft} · {camera==='THERMAL'?'Wärmebild':'RGB'}</p>
   </div>
   <div className="flex flex-wrap gap-1.5 text-xs">
    {terrainReport&&<span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">{terrainReport.dataset==='dgm1'?'DGM1':'EU-DEM'} ✓</span>}
    {hazards&&<span className={'rounded-full px-2.5 py-1 font-semibold '+(!hazards.checked?'bg-amber-100 text-amber-900':hazards.found.length?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-700')}>{hazards.checked?`${hazards.found.length} OSM-Hinweise`:'OSM nicht verfügbar'}</span>}
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Testplanung</span>
   </div>
  </header>
  {locked&&changeMessage&&<p role="status" className="rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">{changeMessage}</p>}
  {checking?<p className="rounded-lg bg-slate-50 p-2 text-sm text-gray-700">Vorhandene Mission wird geladen ...</p>:
   mission?<p className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-700">Cloud-Mission: <strong>{mission.name}</strong>{dirty?' · Änderungen noch nicht gespeichert':' · Gespeicherte Route'}{!mission.hasExactSettings&&' · Alte Mission: Parameter teilweise rekonstruiert'}</p>:
   field?<p className="text-xs text-gray-500">Für diese Fläche wird eine neue Mission angelegt.</p>:null}
  {result.plan&&metrics&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">Suchbahnen</div><div className="font-bold">{result.plan.lines.length}</div></div>
    <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">Bahnabstand</div><div className="font-bold">{effectiveOptions?.spacing.toFixed(1)} m</div></div>
    <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">Gesamtstrecke*</div><div className="font-bold">{(metrics.totalM/1000).toFixed(2)} km</div></div>
    <div className="rounded-xl border border-gray-200 bg-white p-3"><div className="text-xs text-gray-500">Flugzeit ca.*</div><div className="font-bold">{metrics.flightMinutes.toFixed(1)} min</div>{options.autoDirection===true&&<div className="text-[11px] text-indigo-700">Winkel {result.plan.direction}° optimiert</div>}</div>
   </div>}
  <div className="grid min-w-0 gap-3 xl:grid-cols-[370px_minmax(0,1fr)] xl:items-start">
   <section className="order-first min-w-0 space-y-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm sm:p-3 xl:order-last xl:sticky xl:top-3">
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
     <h2 className="font-bold">Karte und Suchroute</h2>
     <span className="text-xs text-gray-500">Startpunkt auf Karte anpassbar</span>
    </div>
    {field?<FlightMissionMap key={field.id} area={field.areaGeoJson} plan={result.plan} startPoint={effectiveStart} coverageWidthM={minCoverage?.theoreticalWidthM??coverage.info?.theoreticalWidthM} hazards={hazards?.found||[]} onStartPointChange={p=>{setDirty(true);setOptions(v=>({...v,autoStartAtFirst:false}));setTerrain(v=>({...v,startPoint:p}));}}/>:
     <p className="p-4 text-sm text-gray-700">{loading?'Flaechen werden geladen ...':'Bitte Fläche auswählen.'}</p>}
    {result.reason&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm font-medium text-rose-900">{result.reason}</p>}
   </section>
   <section className="order-last min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 xl:order-first">
    {locked?<div className="rounded-lg bg-slate-100 p-2 text-sm font-semibold">Auftragsfläche: {field?.displayName||field?.name||"Laden..."}</div>:<div className="space-y-2">
     <label className="block text-sm font-semibold" htmlFor="dji-v34-field">Fläche</label>
     <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="FL-Nummer oder Name suchen" className="w-full rounded-lg border border-gray-300 p-2.5 text-base"/>
     <select id="dji-v34-field" value={fieldId} onChange={e=>{setPublishMessage("");setFieldId(e.target.value);}} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-base" disabled={loading}>
      {visible.length===0&&<option value="">Keine Flächen gefunden</option>}
      {field&&!visible.some(x=>x.id===field.id)&&<option value={field.id}>{field.displayName||field.name}</option>}
      {visible.map(f=><option key={f.id} value={f.id}>{f.displayName||'Ohne FL-Nr.'} · {f.name}</option>)}
     </select>
    </div>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
     <label className="block text-sm font-semibold">Drohne<select value={aircraft} disabled={changingDrone} onChange={e=>void chooseDrone(e.target.value as DroneV36)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-base"><option value="M4T">DJI M4T</option><option value="M3T">DJI M3T</option></select></label>
     <label className="block text-sm font-semibold">Kamera<select value={camera} onChange={e=>{setDirty(true);setCamera(e.target.value as MissionCamera);}} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-base"><option value="THERMAL">Wärmebild</option><option value="RGB_WIDE">RGB-Weitwinkel</option></select></label>
     <label className="block text-sm font-semibold">Flughöhe (m)<input type="number" min="10" max="120" step="1" value={options.altitude} onChange={e=>setNumber('altitude',e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-base"/></label>
     <label className="block text-sm font-semibold">Geschwindigkeit (m/s)<input type="number" min="1" max="12" step="0.5" value={options.speed} onChange={e=>setNumber('speed',e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-base"/></label>
    </div>
    <details className="rounded-lg border border-gray-200 px-3 py-2">
     <summary className="cursor-pointer text-sm font-semibold">Weitere Flugbahn-Einstellungen</summary>
     <div className="mt-3 grid grid-cols-2 gap-3">
      <label className="block text-sm">Überlappung (%)<input type="number" min="10" max="70" step="5" value={overlapPercent} onChange={e=>{setDirty(true);setOverlapPercent(Number(e.target.value));}} className="mt-1 w-full rounded border p-2 text-base"/></label>
      <label className="col-span-2 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={options.autoDirection===true} onChange={e=>{setDirty(true);setOptions(o=>({...o,autoDirection:e.target.checked}));}}/> Flugwinkel automatisch auf kürzeste geschätzte Zeit optimieren</label>
      <label className="block text-sm">Flugrichtung (°) · manuell änderbar<input type="number" min="0" max="359" step="1" value={options.autoDirection===true?(result.plan?.direction??0):options.direction} onChange={e=>setNumber('direction',e.target.value)} className="mt-1 w-full rounded border p-2 text-base"/></label>
      <label className="col-span-2 block text-xs text-gray-600">Winkel manuell verstellen (schaltet Automatik aus)<input type="range" min="0" max="179" step="1" value={options.autoDirection===true?(result.plan?.direction??0):options.direction} onChange={e=>setNumber('direction',e.target.value)} className="mt-1 block w-full"/></label>
      {options.autoDirection===true&&<span className="self-end pb-2 text-xs text-indigo-800">{result.plan?.optimization?.anglesEvaluated??0} Winkel geprüft</span>}
      <label className="block text-sm">Randabstand (m)<input type="number" min="0" max="50" step="1" value={options.margin} onChange={e=>setNumber('margin',e.target.value)} className="mt-1 w-full rounded border p-2 text-base"/></label>
      <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={options.smoothTurns===true} disabled={aircraft!=="M4T"} onChange={e=>{setDirty(true);setOptions(o=>({...o,smoothTurns:e.target.checked}));}}/> Kontinuierliche Kurvenwenden (M4T, Test)</label>
      <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={manualSpacing} onChange={e=>{setDirty(true);setManualSpacing(e.target.checked);}}/> Bahnabstand manuell</label>
      {manualSpacing&&<label className="col-span-2 text-sm">Bahnabstand (m)<input type="number" min="1.5" max="220" step="0.5" value={options.spacing} onChange={e=>setNumber('spacing',e.target.value)} className="mt-1 w-full rounded border p-2 text-base"/></label>}
     </div>
     {coverage.info&&<p className="mt-2 text-xs text-gray-600">Bildbreite rechnerisch {coverage.info.theoreticalWidthM.toFixed(1)} m · Bahnabstand {coverage.info.suggestedSpacingM.toFixed(1)} m</p>}
    </details>
    {coverage.error&&<p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-800">{coverage.error}</p>}
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
     <h3 className="text-sm font-bold">Gelände und Rückkehr</h3>
     <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-600">{options.autoStartAtFirst===true?'Start vorgeschlagen':'Start manuell'}: {effectiveStart?`${effectiveStart[1].toFixed(6)}, ${effectiveStart[0].toFixed(6)}`:'Startpunkt fehlt'}</p>
     {options.autoStartAtFirst===false&&<button type="button" onClick={()=>{setDirty(true);setOptions(o=>({...o,autoStartAtFirst:true}));}} className="rounded-md border px-2.5 py-1.5 text-xs font-semibold">Ersten Suchwegpunkt vorschlagen</button>}</div>
     <label className="block text-sm font-semibold">Höhenmodus<select value={terrain.altitudeMode} onChange={e=>{setDirty(true);setTerrain(v=>({...v,altitudeMode:e.target.value as TerrainSettingsV31['altitudeMode']}));}} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-base"><option value="terrain">Geländeangepasst</option><option value="constant">Konstant zum Startplatz</option></select></label>
     <label className="block text-sm font-semibold">Rückkehrhöhe RTH (m)<input type="number" min="20" max="150" step="1" value={terrain.rthHeight} onChange={e=>{setDirty(true);setTerrain(v=>({...v,rthHeight:Number(e.target.value)}));}} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-base"/></label>
     <button type="button" disabled={!effectiveStart||!result.plan||analysing||checking} onClick={()=>void analyzeTerrain()} className="w-full rounded-lg bg-indigo-700 px-3 py-3 text-sm font-bold text-white disabled:bg-gray-400">{analysing?'Gelände wird geprüft ...':'Gelände und Gefahren prüfen'}</button>
     {terrainReport&&<div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-sm">
       <div><span className="block text-xs text-gray-500">Geländedaten</span><strong>{terrainReport.dataset==='dgm1'?'DGM1 · 1 m':'EU-DEM · 25 m'}</strong></div>
       <div><span className="block text-xs text-gray-500">Bodenabstand min.</span><strong>{minAgl?.toFixed(1)} m</strong></div>
       <div><span className="block text-xs text-gray-500">Höchster Wegpunkt</span><strong>{terrainReport.maxRelativeHeightM.toFixed(1)} m</strong></div>
       <div><span className="block text-xs text-gray-500">RTH-Richtwert (Gelände)</span><strong>{terrainReport.recommendedRthM.toFixed(0)} m</strong></div>
      </div>}
     {terrainReport&&terrain.rthHeight<terrainReport.recommendedRthM&&<div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">RTH niedriger als Gelände-Richtwert. <button type="button" disabled={terrainReport.recommendedRthM>150} onClick={()=>{setDirty(true);setTerrain(v=>({...v,rthHeight:Math.min(150,Math.ceil(terrainReport.recommendedRthM))}));}} className="mt-2 block rounded bg-amber-900 px-2 py-2 text-white disabled:opacity-50">RTH-Richtwert übernehmen</button></div>}
     {terrainReport&&terrainReport.maxRelativeHeightM>120&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-900">Wegpunkthöhe über 120 m – Export gesperrt.</p>}
     {terrainReport&&suggestedSpacing!==null&&effectiveOptions&&effectiveOptions.spacing>suggestedSpacing&&<div className="rounded-lg bg-indigo-50 p-2 text-sm">Für die modellierte Mindesthöhe ist ein kleinerer Bahnabstand sinnvoll. <button type="button" onClick={()=>{setDirty(true);setManualSpacing(true);setOptions(v=>({...v,spacing:suggestedSpacing}));}} className="mt-2 block rounded bg-indigo-700 px-3 py-2 font-semibold text-white">{suggestedSpacing.toFixed(1)} m übernehmen</button></div>}
     {hazards&&<div className="space-y-1 rounded-lg bg-slate-50 p-2 text-sm">
       <strong>OSM-Gefahren: {hazards.checked?`${hazards.found.length} Hinweise`:'Prüfung nicht verfügbar'}</strong>
       {hazards.found.slice(0,8).map(h=><div key={h.key} className="flex flex-wrap justify-between gap-2 border-t pt-1"><span>{h.kind==='wind'?'Windenergieanlage':'Stromleitung/Mast'} · {h.distanceM} m</span><a href={h.osmUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">OSM</a></div>)}
       {hazards.found.length>8&&<p>Weitere {hazards.found.length-8} auf der Karte</p>}
      </div>}
     {terrainReport&&<details className="rounded-lg border border-gray-200 p-2">
       <summary className="cursor-pointer text-sm font-semibold">Höhenprofil und Messwerte</summary>
       <div className="mt-2 space-y-2"><FlightTerrainProfile report={terrainReport}/><div className="grid grid-cols-2 gap-2 text-xs"><span>Startgelände: {terrainReport.startElevationM.toFixed(1)} m</span><span>{terrainReport.sampledPoints} Messpunkte</span><span>Abstand konstant min.: {terrainReport.constantMinGroundClearanceM.toFixed(1)} m</span><span>Abstand angepasst min.: {terrainReport.adjustedMinGroundClearanceM.toFixed(1)} m</span></div></div>
      </details>}
    </div>
    {result.plan&&metrics&&<details className="rounded-lg border border-gray-200 p-2 text-sm">
      <summary className="cursor-pointer font-semibold">Strecke und Zeit im Detail</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div>Suchstrecke: {(metrics.searchM/1000).toFixed(2)} km</div><div>Verbindungsflüge: {(metrics.transfersM/1000).toFixed(2)} km</div><div>Anflug: {(metrics.approachM/1000).toFixed(2)} km</div><div>Rückflug: {(metrics.returnM/1000).toFixed(2)} km</div><div>{metrics.turnCount} Bahnwechsel</div><div>Wendeaufschlag: {metrics.turnMinutes.toFixed(1)} min</div></div>
      <p className="mt-2 text-xs text-gray-500">*Schätzung inkl. An- und Rückweg und pauschal 3 Sekunden je Bahnwechsel; ohne Start, Landung, Wind und Pausen. Die automatische Richtung prüft viele Winkel, garantiert aber kein globales Minimum.</p>
     </details>}
    {!locked&&<button type="button" onClick={()=>void download()} disabled={!result.plan||busy||publishing||checking||(terrain.altitudeMode==='terrain'&&!terrainReport)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold disabled:opacity-50">{busy?'Export ...':`${aircraft}-Mission als KMZ herunterladen`}</button>}
    <button type="button" onClick={()=>void publishToPilot2()} disabled={!canPublish} className="w-full rounded-xl bg-blue-700 px-4 py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400">{publishing?'Speichert ...':mission?'Mission in DJI-Cloud ersetzen':'Mission in DJI-Cloud speichern'}</button>
    {publishMessage&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{publishMessage}</p>}
    {error&&<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{error}</p>}
    <details className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
     <summary className="cursor-pointer text-sm font-semibold text-gray-700">Hinweise und Datenquellen</summary>
     <div className="mt-2 space-y-2">
      <p>Testplanung: Vor einem späteren Flug Route, Hindernisse, Luftraum, Kameraposition und RTH in DJI Pilot 2 prüfen. Höhenmodelle und OSM sind keine vollständige Hinderniserfassung.</p>
      <p>Wärmebildabdeckung und Flugzeit sind Schätzwerte; Baumkronen und Wind fehlen im Geländemodell. Die blauen Streifen zeigen die geometrische Querabdeckung bei senkrechter Kamera und modellierter Mindesthöhe, keine garantierte Rehkitz-Erkennung.</p>
      <p>Der automatisch vorgeschlagene Startpunkt ist der erste Suchwegpunkt – nicht automatisch der tatsächliche Start- oder Home-Punkt der Drohne. Bei späteren Flügen muss er vor Gelände- und RTH-Berechnung auf den echten Startplatz gesetzt werden. Kurven können die Randabdeckung verkürzen; die WPML-Kurvenfahrt muss in Pilot 2 geprüft werden.</p>
      {terrainReport?.warnings.map((w,i)=><p key={i}>{w}</p>)}
      {hazards?.warnings.map((w,i)=><p key={'h'+i}>{w}</p>)}
      {result.plan?.warnings.map((w,i)=><p key={'p'+i}>{w}</p>)}
     </div>
    </details>
   </section>
  </div>
 </div>;
}
