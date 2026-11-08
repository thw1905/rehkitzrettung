// REHKITZ_DJI_TERRAIN_V3_1 – graphical model preview, NOT terrain clearance.
"use client";
import {useMemo} from "react";
import type {TerrainReportV31} from "@/lib/flight-missions/terrain-v31";
export default function FlightTerrainProfile({report}:{report:TerrainReportV31}){
 const lines=useMemo(()=>{
  const rows=report.profile;
  if(!rows.length)return null;
  const maxX=Math.max(1,rows[rows.length-1].distanceM);
  const ys=rows.flatMap(p=>[p.groundRelativeM,p.constantHeightM,p.adjustedHeightM]);
  const minY=Math.min(0,...ys)-5,maxY=Math.max(0,...ys)+5,span=Math.max(1,maxY-minY);
  const point=(x:number,y:number)=>`${(30+x/maxX*670).toFixed(2)},${(162-(y-minY)/span*145).toFixed(2)}`;
  return {
   ground:rows.map(p=>point(p.distanceM,p.groundRelativeM)).join(" "),
   constant:rows.map(p=>point(p.distanceM,p.constantHeightM)).join(" "),
   adjusted:rows.map(p=>point(p.distanceM,p.adjustedHeightM)).join(" "),
   km:(maxX/1000).toFixed(2),minY:Math.round(minY),maxY:Math.round(maxY)
  };
 },[report]);
 if(!lines)return null;
 return <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-900">
  <div className="mb-1 font-semibold">Höhenprofil (Modellwerte relativ zum Startpunkt)</div>
  <svg viewBox="0 0 730 190" className="w-full" role="img" aria-label="Geländeprofil grün, konstante Flughöhe blau, angepasste Wegpunkthöhe orange">
   <path d="M30 5 V162 H702" fill="none" stroke="#64748b" strokeWidth="1.5"/>
   <polyline fill="none" stroke="#15803d" strokeWidth="2" points={lines.ground}/>
   <polyline fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="7 5" points={lines.constant}/>
   <polyline fill="none" stroke="#c2410c" strokeWidth="2.2" points={lines.adjusted}/>
   <text x="0" y="12" fontSize="11" fill="#334155">{lines.maxY} m</text>
   <text x="0" y="162" fontSize="11" fill="#334155">{lines.minY} m</text>
   <text x="590" y="180" fontSize="11" fill="#334155">{lines.km} km Strecke</text>
  </svg>
  <div className="mt-1 flex flex-wrap gap-3"><span>🟢 Gelände</span><span>🔵 Konstant</span><span>🟠 Angepasst</span></div>
  <p className="mt-1 text-red-900">Ohne Hindernisprofil. Keine Freigabe für reale Flüge.</p>
 </div>;
}
