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
const FlightMissionMap=dynamic(()=>import("@/components/admin/flight-mission-map"),{ssr:false,loading:()=> <div className="flex h-[420px] items-center justify-center rounded-xl bg-gray-100 text-gray-700">Satellitenkarte wird geladen ...</div>});
type Field={id:string;name:string;displayName:string|null;areaGeoJson:unknown};
const initial:MissionOptions={altitude:50,speed:5,spacing:25,direction:0,margin:5};
const defaultTerrain:TerrainSettingsV31={startPoint:null,altitudeMode:"constant",rthHeight:70};
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
 const [overlapPercent,setOverlapPercent]=useState(40);
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
     else{setOptions(initial);setOverlapPercent(40);setManualSpacing(false);setTerrain(defaultTerrain);}
     setDirty(false);
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
  try{return {plan:createFlightPlan(field.areaGeoJson,effectiveOptions),reason:''};}
  catch(e){return {plan:null,reason:e instanceof Error?e.message:'Flugroute konnte nicht berechnet werden.'};}
 },[field,effectiveOptions,coverage.error,mission,dirty]);
 const terrainKey=useMemo(()=>JSON.stringify({fieldId,options:effectiveOptions,start:terrain.startPoint,aircraft,camera,overlapPercent,manualSpacing,orderId}),
  [fieldId,effectiveOptions,terrain.startPoint,aircraft,camera,overlapPercent,manualSpacing,orderId]);
 const terrainReport=terrainResult?.key===terrainKey?terrainResult.report:null;
 const hazards=terrainResult?.key===terrainKey?terrainResult.hazards:null;
 const minAgl=terrainReport?(terrain.altitudeMode==='terrain'?terrainReport.adjustedMinGroundClearanceM:terrainReport.constantMinGroundClearanceM):null;
 const minCoverage=useMemo(()=>{
  if(minAgl===null||minAgl<10||minAgl>120)return null;
  try{return cameraCoverage(aircraft,camera,minAgl,overlapPercent);}catch{return null;}
 },[minAgl,aircraft,camera,overlapPercent]);
 const suggestedSpacing=minCoverage?.suggestedSpacingM??null;
 async function analyzeTerrain(){
  if(!field||!result.plan||!terrain.startPoint||analysing)return;
  setError("");setAnalysing(true);
  try {
   const res=await fetch("/api/flugmissionen/gelaende",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fieldId,orderId,options,aircraft,camera,overlapPercent,manualSpacing,startPoint:terrain.startPoint})});
   const json=await res.json();if(!res.ok)throw new Error(json?.error||"Geländedaten nicht verfuegbar.");
   setTerrainResult({key:terrainKey,report:json.report,hazards:json.hazards??null});
  }catch(e){setError(e instanceof Error?e.message:"Geländeprüfung fehlgeschlagen.");}
  finally{setAnalysing(false);}
 }
 const visible=useMemo(()=>fields.filter(f=>`${f.displayName||''} ${f.name}`.toLowerCase().includes(search.toLowerCase())).slice(0,400),[fields,search]);
 const setNumber=(key:keyof MissionOptions,value:string)=>{setDirty(true);setOptions(o=>({...o,[key]:Number(value)}));};
 async function publishToPilot2(){
  if(!field||!result.plan||publishing||checking||loadedError||loading)return;
  if(!window.confirm(`${mission?"Vorhandene Cloud-Mission ersetzen":"Neue Cloud-Mission anlegen"} für ${field.displayName||field.name} (${aircraft})? Die vorherige Cloud-Mission wird dauerhaft ersetzt. Keine Flugfreigabe.`))return;
  setError("");setPublishMessage("");setPublishing(true);
  try{
   const res=await fetch("/api/flugmissionen/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fieldId,orderId,options,aircraft,camera,overlapPercent,manualSpacing,terrain,expectedMissionId:mission?.id||null,reuseExisting:Boolean(mission&&!dirty)})});
   const json=await res.json();if(!res.ok)throw new Error(json?.error||"Veröffentlichung fehlgeschlagen.");
   setPublishMessage(`Aktuelle Cloud-Version gespeichert: ${json.mission?.name}. In DJI Pilot 2 die Mission erneut herunterladen.`);setRefreshMission(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:"Fehler beim Veröffentlichen.");}
  finally{setPublishing(false);}
 }
 async function download(){
  if(!field||!result.plan||busy)return;
  setError('');setBusy(true);
  try{
   const res=await fetch('/api/admin/flugmissionen/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fieldId,options,aircraft,camera,overlapPercent,manualSpacing,terrain})});
   if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'KMZ-Export fehlgeschlagen.');}
   const blob=await res.blob();const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`${(field.displayName||field.name).replace(/[^A-Za-z0-9_-]/g,'_')}-${aircraft}.kmz`;document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(e){setError(e instanceof Error?e.message:'Unbekannter Fehler');}
  finally{setBusy(false);}
 }
 return <div className="space-y-4">
  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Wichtig – Testversion:</strong> Die Route ist ein Entwurf, keine freigegebene Flugmission. Vor einem Flug muss der verantwortliche Pilot in DJI Pilot 2 die gesamte Route, Höhe relativ zum Startpunkt, Hindernisse, Luftraum, Abdeckung und Rückkehr-Einstellungen prüfen. Niemals unbesehen starten.</div>
  {checking?<div className="rounded-lg border bg-blue-50 p-3 text-sm text-blue-950">Pruefe die vorhandene Cloud-Flugmission ...</div>:mission?<div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Vorhandene Cloud-Mission geladen: {mission.name}</strong> · {new Date(mission.createdAt).toLocaleString("de-DE")}<div>{dirty?"Geaenderte Einstellungen: die Flugroute wird neu berechnet.":"Gespeicherte Flugroute wird angezeigt. Ohne Aenderung wird dieselbe KMZ neu veroeffentlicht."}</div>{!mission.hasExactSettings&&<div className="mt-2 font-semibold">Aeltere Mission: Nicht alle Ursprungsparameter sind gespeichert. Hoehe und Tempo wurden soweit moeglich aus der KMZ gelesen. Bei Aenderungen bitte Flugrichtung, Bahnabstand und Randabstand neu pruefen.</div>}</div>:field?<div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950">Fuer diese Flaeche ist noch keine aktive Mission vorhanden. Neue Flugroute planen.</div>:null}
  <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
   <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    {locked?<div className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm font-bold text-gray-950">Auftragsflaeche (fest): {field?.displayName||field?.name||"Wird geladen ..."}</div>:<div><label className="mb-2 block text-sm font-bold text-gray-900">FL-Fläche auswählen</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="FL-Nummer oder Name suchen" className="mb-2 w-full rounded-lg border border-gray-400 p-3 text-gray-950"/>
      <select value={fieldId} onChange={e=>{setPublishMessage("");setFieldId(e.target.value);}} className="w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950" disabled={loading}>
       {visible.length===0 && <option value="">Keine Flächen gefunden</option>}
       {field && !visible.some(x=>x.id===field.id) && <option value={field.id}>{field.displayName||'Ohne FL-Nr.'} · {field.name}</option>}
       {visible.map(f=><option key={f.id} value={f.id}>{f.displayName||'Ohne FL-Nr.'} · {f.name}</option>)}
      </select>
    </div>}
    <div><label className="mb-2 block text-sm font-bold text-gray-900">Drohne</label><select value={aircraft} onChange={e=>{setDirty(true);setAircraft(e.target.value as 'M3T'|'M4T');}} className="w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950"><option value="M3T">DJI Mavic 3 Thermal (M3T)</option><option value="M4T">DJI Matrice 4 Thermal (M4T)</option></select>
     {aircraft==='M4T' && <p className="mt-2 text-xs text-amber-900">M4T-WPML-Kennung aus einer Pilot-2-erprobten Referenz. Der Import unserer Mission muss dennoch am Controller getestet werden.</p>}
    </div>
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="text-sm font-bold text-indigo-950">Kameraabhängiger Flugbahnabstand</div>
      <label className="block text-sm font-semibold text-gray-950">Kamera
        <select value={camera} onChange={e=>{setDirty(true);setCamera(e.target.value as MissionCamera);}} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950">
          <option value="THERMAL">Wärmebildkamera (empfohlen für Rehkitzsuche)</option>
          <option value="RGB_WIDE">RGB-Weitwinkelkamera (Näherung)</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-gray-950">Seitliche Überlappung (%)
        <input type="number" min="10" max="70" step="5" value={overlapPercent} onChange={e=>{setDirty(true);setOverlapPercent(Number(e.target.value));}} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-3 text-gray-950"/>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-950"><input type="checkbox" checked={manualSpacing} onChange={e=>{setDirty(true);setManualSpacing(e.target.checked);}} className="h-4 w-4"/> Bahnabstand manuell überschreiben</label>
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
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-gray-950">
      <div className="font-bold">Startplatz, Geländehöhe, RTH und Gefahren (V3.2 Test)</div>
      <p>Startplatz auf Satellitenkarte anklicken (blau). Der Teamtreffpunkt ist nicht zwingend der Startplatz.</p>
      <div className="text-xs">Startpunkt: {terrain.startPoint?`${terrain.startPoint[1].toFixed(6)}, ${terrain.startPoint[0].toFixed(6)}`:"Noch nicht markiert"}</div>
      <label className="block text-xs font-semibold">Höhenmodus<select value={terrain.altitudeMode} onChange={e=>{setDirty(true);setTerrain(v=>({...v,altitudeMode:e.target.value as TerrainSettingsV31["altitudeMode"]}));}} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-2.5 text-gray-950"><option value="constant">Konstant relativ zum Startpunkt</option><option value="terrain">Geländeangepasste Wegpunkthöhen (Geländemodell-Test)</option></select></label>
      <label className="block text-xs font-semibold">Rückkehrhöhe RTH (m über Startpunkt)<input type="number" min="20" max="150" step="1" value={terrain.rthHeight} onChange={e=>{setDirty(true);setTerrain(v=>({...v,rthHeight:Number(e.target.value)}));}} className="mt-1 block w-full rounded-lg border border-gray-400 bg-white p-2.5 text-gray-950"/></label>
      <button type="button" disabled={!terrain.startPoint||!result.plan||analysing||checking} onClick={()=>void analyzeTerrain()} className="w-full rounded-lg border border-indigo-600 bg-indigo-700 px-3 py-2 font-semibold text-white disabled:bg-gray-400">{analysing?"Gelände wird abgefragt ...":"Gelände, Rückkehr und Gefahren prüfen"}</button>
      {terrainReport&&<div className="space-y-1 rounded bg-white p-3 text-xs text-gray-900">
       <div><strong>{terrainReport.dataset==='dgm1'?'DGM1 über eigenen Höhendienst':'EU-DEM 25 m'}:</strong> {terrainReport.sampledPoints} Messpunkte mit max. {terrainReport.sampleSpacingM} m Abstand, Startgelände {terrainReport.startElevationM.toFixed(1)} m</div>
       <div>Min. Abstand konstant (Modell): <strong>{terrainReport.constantMinGroundClearanceM.toFixed(1)} m</strong></div>
       <div>Min. Abstand angepasst (Modell): <strong>{terrainReport.adjustedMinGroundClearanceM.toFixed(1)} m</strong></div>
       <div>Höchste geplante Wegpunkthöhe: <strong>{terrainReport.maxRelativeHeightM.toFixed(1)} m</strong></div>
       <div>RTH-Geländerichtwert (kein Hindernisnachweis): <strong>{terrainReport.recommendedRthM.toFixed(0)} m</strong></div>
       {terrain.rthHeight<terrainReport.recommendedRthM&&<div className="rounded border border-orange-300 bg-orange-50 p-2"><strong>Hinweis:</strong> Eingestellte RTH-Höhe {terrain.rthHeight} m unterschreitet den Geländerichtwert.
        <button type="button" className="mt-1 block rounded bg-orange-800 px-3 py-2 font-semibold text-white" onClick={()=>{setDirty(true);setTerrain(v=>({...v,rthHeight:Math.min(150,Math.ceil(terrainReport.recommendedRthM))}));}}>RTH-Richtwert übernehmen (max. 150 m)</button>
       </div>}
       {terrainReport.recommendedRthM>150&&<div className="font-bold text-red-900">RTH-Geländerichtwert über 150 m. Fläche oder Startplatz neu beurteilen.</div>}
       {minCoverage&&suggestedSpacing!==null&&<div className="rounded border border-indigo-200 bg-indigo-50 p-2 text-indigo-950">
        <strong>Kameraberechnung am kleinsten modellierten Bodenabstand:</strong> {minAgl?.toFixed(1)} m über Grund, Bildbreite {minCoverage.theoreticalWidthM.toFixed(1)} m; Bahnabstand für {overlapPercent}% Überlappung höchstens {suggestedSpacing.toFixed(1)} m.
        {effectiveOptions&&effectiveOptions.spacing>suggestedSpacing&&<div className="mt-2"><button type="button" onClick={()=>{setDirty(true);setManualSpacing(true);setOptions(v=>({...v,spacing:suggestedSpacing}));}} className="rounded bg-indigo-700 px-3 py-2 font-semibold text-white">Kleineren Bahnabstand übernehmen – danach neu prüfen</button></div>}
        <p className="mt-1">Nur geometrische Abschätzung; Vegetation und Rehkitz-Erkennbarkeit sind nicht berücksichtigt.</p>
       </div>}
       <FlightTerrainProfile report={terrainReport}/>
       {terrainReport.warnings.map((w,i)=><div key={i} className="text-amber-950">⚠ {w}</div>)}
      </div>}
      {hazards&&<div className="rounded-lg border border-orange-300 bg-white p-3 text-xs text-gray-950">
       <strong>OSM-Gefahrenhinweise – 300 m um Suchroute, Anflug und Rückflug</strong>
       <p>{hazards.checked?`${hazards.found.length} Hinweise im erfassten OSM-Datensatz.`:'Gefahrenabfrage nicht abgeschlossen.'}</p>
       {hazards.found.slice(0,12).map(h=><div key={h.key} className="mt-1 flex flex-wrap justify-between gap-2 border-t border-gray-200 py-1"><span>{h.kind==='wind'?'Windenergieanlage':'Stromleitung / Mast'} – ca. {h.distanceM} m zur Route</span><a href={h.osmUrl} target="_blank" rel="noopener noreferrer" className="text-blue-800 underline">OSM</a></div>)}
       {hazards.found.length>12&&<p>Weitere {hazards.found.length-12} Hinweise auf der Karte.</p>}
       {hazards.warnings.map((w,i)=><p key={i} className="mt-1 text-amber-900">⚠ {w}</p>)}
      </div>}
      <p className="text-xs font-semibold text-red-900">Keine Flugfreigabe: DGM/EU-DEM zeigen keine Baumkronen oder sicheren Hindernisabstände. Bei EU-DEM werden GPS-Koordinaten an OpenTopoData gesendet; bei der Gefahrenprüfung an Overpass. Nur ein ausdrücklich konfigurierter eigener Höhendienst verwendet DGM1.</p>
    </div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-gray-900">
     <strong>Flugplan:</strong> {result.plan?`${result.plan.lines.length} Suchbahnen · ${result.plan.waypoints.length} Wegpunkte`:"Keine Route"}
     {result.plan && <div className="mt-1">Bahnabstand: {effectiveOptions?.spacing.toFixed(1)} m {manualSpacing?"(manuell)":"(automatisch)"}</div>}
     {result.plan && <div className="mt-1">Suchstrecke: {(result.plan.searchMeters/1000).toFixed(2)} km · Gesamtroute: {(result.plan.totalMeters/1000).toFixed(2)} km · rechnerische reine Flugzeit: {result.plan.estimatedMinutes.toFixed(1)} Min. (ohne Start, Landung und Pausen)</div>}
     {result.reason && <p className="mt-2 font-semibold text-red-800">{result.reason}</p>}
    </div>
    {!locked&&<button type="button" onClick={()=>void download()} disabled={!result.plan||busy||publishing||checking||(terrain.altitudeMode==="terrain"&&!terrainReport)} className="w-full rounded-xl bg-gray-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400">{busy?'Export läuft ...':`${aircraft}-Mission als KMZ herunterladen`}</button>}
    <button type="button" onClick={()=>void publishToPilot2()} disabled={!result.plan||publishing||busy||checking||loading||loadedError||analysing||(terrain.altitudeMode==="terrain"&&!terrainReport)||(terrainReport!==null && terrain.altitudeMode==="terrain" && terrain.rthHeight<terrainReport.recommendedRthM)} className="w-full rounded-xl border border-blue-700 bg-blue-800 px-4 py-3 font-bold text-white disabled:bg-gray-400">{publishing?"Speichere ...":mission?"Aktuelle Mission in Cloud ersetzen":"Neue Mission in DJI-Cloud speichern"}</button>
    {publishMessage&&<p role="status" className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm font-semibold text-green-900">{publishMessage}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
    <p className="text-xs text-gray-700">Cloud-Übertragung über den bestehenden DJI-Workspace: Die Mission wird in Pilot 2 als Cloud-Datei angeboten; Download, Import und Flugeinstellungen müssen am Controller geprüft werden. Es gibt keinen automatischen Start.</p>
   </section>
   <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <h2 className="text-lg font-bold text-gray-950">Satellitenkarte und geplante Suchbahnen</h2>
    {field?<FlightMissionMap key={field.id} area={field.areaGeoJson} plan={result.plan} startPoint={terrain.startPoint} hazards={hazards?.found||[]} onStartPointChange={p=>{setDirty(true);setTerrain(v=>({...v,startPoint:p}));}}/>:<p className="text-sm text-gray-700">{loading?'Flächen werden geladen ...':'Bitte Fläche auswählen.'}</p>}
    {result.plan&&<div className="space-y-1 text-xs text-amber-950">{result.plan.warnings.map((w,i)=><p key={i} className="rounded-lg bg-amber-50 px-3 py-2">⚠ {w}</p>)}</div>}
   </section>
  </div>
 </div>;
}
