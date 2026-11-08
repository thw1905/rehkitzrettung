// REHKITZ_DJI_FLUGPLANUNG_V3_4
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polygon,Polyline, CircleMarker,Tooltip,useMap,useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { FlightPlan,LonLat } from "@/lib/flight-missions/planner";
import type {HazardV32} from "@/lib/flight-missions/hazards-v32";
import "leaflet/dist/leaflet.css";
type Props={area:unknown;plan:FlightPlan|null;startPoint?:LonLat|null;hazards?:HazardV32[];onStartPointChange?:(p:LonLat)=>void};
const toLatLng=(p:LonLat):[number,number]=>[p[1],p[0]];
function polygonRings(input:unknown): [number,number][][][]{
 const value=input as {type?:unknown;geometry?:{type?:unknown;coordinates?:unknown};coordinates?:unknown}|null;
 const geo=value?.type==='Feature'?value.geometry:value;
 if(!geo || !['Polygon','MultiPolygon'].includes(String(geo.type)))return [];
 const raw=geo.type==='Polygon'?[geo.coordinates]:geo.coordinates;
 if(!Array.isArray(raw))return [];
 return raw.map(p=>Array.isArray(p)?p.map(r=>Array.isArray(r)?r.filter(c=>Array.isArray(c)&&typeof c[0]==='number'&&typeof c[1]==='number').map(c=>[c[1],c[0]] as [number,number]):[]):[]);
}
function Fitter({rings}:{rings:[number,number][][][]}){
 const map=useMap();
 useEffect(()=>{
  const bounds=L.latLngBounds([]);for(const poly of rings)for(const ring of poly)for(const point of ring)bounds.extend(point);
  if(bounds.isValid())map.fitBounds(bounds,{padding:[25,25],maxZoom:18});
  const t=window.setTimeout(()=>map.invalidateSize(),100);return ()=>window.clearTimeout(t);
 },[map,rings]);return null;
}
function StartSelector({pick}:{pick?:(p:LonLat)=>void}){
 useMapEvents({click:(evt)=>{if(pick)pick([evt.latlng.lng,evt.latlng.lat]);}});
 return null;
}
export default function FlightMissionMap({area,plan,startPoint,hazards=[],onStartPointChange}:Props){
 const rings=useMemo(()=>polygonRings(area),[area]);
 const main=useMemo(()=>rings.map(p=>p.filter(r=>r.length>2)),[rings]);
 return <div className="relative z-0 h-[330px] overflow-hidden rounded-xl border border-gray-300 sm:h-[460px] xl:h-[620px]">
  <MapContainer center={[53.37,9.98]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
   <TileLayer attribution='Tiles &copy; Esri; Source: Esri, Maxar, Earthstar Geographics' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19}/>
   <Fitter rings={rings}/>
   <StartSelector pick={onStartPointChange}/>
   {startPoint&&<CircleMarker center={toLatLng(startPoint)} radius={9} pathOptions={{color:'#1d4ed8',fillColor:'#93c5fd',fillOpacity:.9,weight:3}}><Tooltip permanent={false}>Drohnen-Startpunkt (Gelände-Referenz)</Tooltip></CircleMarker>}
   {main.map((p,i)=><Polygon key={i} positions={p} pathOptions={{color:'#f97316',weight:3,fillColor:'#f97316',fillOpacity:.12}}/>)}
   {startPoint&&plan?.waypoints.length&&<>
    <Polyline positions={[toLatLng(startPoint),toLatLng(plan.waypoints[0])]} pathOptions={{color:'#0891b2',weight:2,dashArray:'8 5'}}/>
    <Polyline positions={[toLatLng(plan.waypoints[plan.waypoints.length-1]),toLatLng(startPoint)]} pathOptions={{color:'#0891b2',weight:2,dashArray:'8 5'}}/>
   </>}
   {hazards.map(h=><CircleMarker key={h.key} center={toLatLng(h.point)} radius={h.kind==='wind'?8:6} pathOptions={{color:'#991b1b',weight:3,fillColor:h.kind==='wind'?'#fb923c':'#fca5a5',fillOpacity:.75}}><Tooltip>{h.label} – ca. {h.distanceM} m zur Route; nur OSM-Hinweis</Tooltip></CircleMarker>)}
   {plan?.lines.map((s,i)=><Polyline key={'line'+i} positions={[toLatLng(s.start),toLatLng(s.end)]} pathOptions={{color:'#16a34a',weight:3}}/>)}
   {plan?.transfers.map((s,i)=><Polyline key={'trans'+i} positions={[toLatLng(s.start),toLatLng(s.end)]} pathOptions={{color:'#dc2626',weight:2,dashArray:'7 5'}}/>)}
   {plan?.waypoints.map((p,i)=>i===0||i===plan.waypoints.length-1?<CircleMarker key={i} center={toLatLng(p)} radius={7} pathOptions={{color:i===0?'#0f172a':'#1d4ed8',fillOpacity:1,fillColor:'#fff',weight:3}}><Tooltip>{i===0?'Start der Suchroute':'Ende der Suchroute'}</Tooltip></CircleMarker>:null)}
  </MapContainer>
  <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/95 px-2 py-2 text-[11px] font-medium text-gray-800 shadow sm:bottom-3 sm:left-3 sm:right-auto">
   <span>🟠 Feld</span><span>🟢 Suche</span><span>🔴 Transfer</span><span>🔵 Start</span><span>➖ An-/Rückflug</span>{hazards.length>0&&<span>⚠ Gefahren</span>}
  </div>
 </div>;
}
