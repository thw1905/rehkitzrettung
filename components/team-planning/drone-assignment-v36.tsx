'use client';
// REHKITZ_DJI_V36 – kompakte Drohnenauswahl je Tages-Team, auch auf Mobilgeraeten.
import {useEffect,useState} from 'react';
type Drone='M3T'|'M4T';
export default function DroneAssignmentV36({teamId}:{teamId:string}){
 const [aircraft,setAircraft]=useState<Drone|null>(null);
 const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setMessage('');
  fetch('/api/flugmissionen/team-aircraft?operationDayTeamId='+encodeURIComponent(teamId),{cache:'no-store'})
   .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Drohne nicht geladen');if(active)setAircraft(j.aircraft||null);})
   .catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Fehler');})
   .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[teamId]);
 async function change(next:Drone){
  if(next===aircraft||saving)return;
  if(aircraft&&!window.confirm(`Teamdrohne von ${aircraft} auf ${next} wechseln? Offene Flugmissionen werden neu vorbereitet. Bereits veröffentlichte Missionen bleiben bis zur Pilotenfreigabe bestehen.`))return;
  setSaving(true);setMessage('');
  try{const r=await fetch('/api/flugmissionen/team-aircraft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationDayTeamId:teamId,aircraft:next})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Speichern fehlgeschlagen');setAircraft(next);setMessage(`${next} gespeichert · ${data.preparation?.prepared??0} Flugpläne vorbereitet`);
  }catch(e){setMessage(e instanceof Error?e.message:'Fehler');}finally{setSaving(false);}
 }
 return <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
  <label className="block text-sm font-semibold text-indigo-950" htmlFor={'dji-v36-'+teamId}>Drohne des Teams</label>
  <select id={'dji-v36-'+teamId} value={aircraft||''} disabled={loading||saving} onChange={e=>void change(e.target.value as Drone)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-base text-gray-950">
   <option value="" disabled>Drohne zuweisen</option><option value="M3T">DJI M3T · 50 m · 4 m/s</option><option value="M4T">DJI M4T · 70 m · 6 m/s</option>
  </select>
  {message&&<p role="status" className="mt-1 text-xs text-indigo-900">{message}</p>}
 </div>;
}
