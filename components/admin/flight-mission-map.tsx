// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polygon,Polyline, CircleMarker,Tooltip,useMap } from "react-leaflet";
import L from "leaflet";
import type { FlightPlan,LonLat } from "@/lib/flight-missions/planner";
import "leaflet/dist/leaflet.css";
type Props={area:unknown;plan:FlightPlan|null};
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
export default function FlightMissionMap({area,plan}:Props){
 const rings=useMemo(()=>polygonRings(area),[area]);
 const main=useMemo(()=>rings.map(p=>p.filter(r=>r.length>2)),[rings]);
 return <div className="relative z-0 h-[420px] overflow-hidden rounded-xl border border-gray-300 md:h-[530px]">
  <MapContainer center={[53.37,9.98]} zoom={13} className="h-full w-full" scrollWheelZoom={true}>
   <TileLayer attribution='Tiles &copy; Esri; Source: Esri, Maxar, Earthstar Geographics' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19}/>
   <Fitter rings={rings}/>
   {main.map((p,i)=><Polygon key={i} positions={p} pathOptions={{color:'#f97316',weight:3,fillColor:'#f97316',fillOpacity:.12}}/>)}
   {plan?.lines.map((s,i)=><Polyline key={'line'+i} positions={[toLatLng(s.start),toLatLng(s.end)]} pathOptions={{color:'#16a34a',weight:3}}/>)}
   {plan?.transfers.map((s,i)=><Polyline key={'trans'+i} positions={[toLatLng(s.start),toLatLng(s.end)]} pathOptions={{color:'#dc2626',weight:2,dashArray:'7 5'}}/>)}
   {plan?.waypoints.map((p,i)=>i===0||i===plan.waypoints.length-1?<CircleMarker key={i} center={toLatLng(p)} radius={7} pathOptions={{color:i===0?'#0f172a':'#1d4ed8',fillOpacity:1,fillColor:'#fff',weight:3}}><Tooltip>{i===0?'Start der Suchroute':'Ende der Suchroute'}</Tooltip></CircleMarker>:null)}
  </MapContainer>
  <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-gray-900 shadow">🟠 FL-Grenze · 🟢 Suchbahnen · 🔴 Verbindungsflüge</div>
 </div>;
}
