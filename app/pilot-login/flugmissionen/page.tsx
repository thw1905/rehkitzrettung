// REHKITZ_WAYLINE_CLOUD_V1: wird im DJI Pilot 2 WebView aufgerufen.
"use client";
import Link from "next/link";
import {useState} from "react";
type DjiBridge={platformLoadComponent?:(name:string,param:string)=>unknown};

export default function DjiMissionLibrary(){
 const [msg,setMsg]=useState("");
 function activate(){
  try{
   const bridge=(window as unknown as {djiBridge?:DjiBridge}).djiBridge;
   if(typeof bridge?.platformLoadComponent!=="function")throw new Error("DJI Bridge nicht gefunden: Diese Seite in DJI Pilot 2 auf der Fernbedienung oeffnen.");
   // DJI verlangt vorher die Workspace/API-Initialisierung: diese erfolgt ueber "Einsatz verbinden".
   const output=bridge.platformLoadComponent("mission","{}");
   setMsg(`DJI-Missionsmodul angefordert. In Pilot 2 die Cloud-Routenbibliothek oeffnen und aktualisieren.${output!==undefined?" Rueckgabe: "+String(output):""}`);
  }catch(e){setMsg(e instanceof Error?e.message:"Mission-Modul konnte nicht geladen werden.");}
 }
 return <main className="mx-auto max-w-xl space-y-4 p-4">
 <h1 className="text-xl font-bold">Rehkitzrettung – DJI Flugmissionen</h1>
 <p className="text-sm">Zuerst wie gewohnt unter „Einsatz verbinden“ die DJI-Verbindung herstellen. Anschliessend das DJI-Missionsmodul laden und in Pilot 2 die Cloud-Routenbibliothek oeffnen.</p>
 <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Nur Routen-Download und Vorschau. Die Mission wird nicht automatisch gestartet. Vor dem Flug alle Hoehen, Verbindungsetappen und Hindernisse pruefen.</div>
 <button onClick={activate} className="w-full rounded-xl bg-blue-800 p-4 font-bold text-white">Cloud-Flugmissionen in Pilot 2 laden</button>
 {msg&&<p role="status" className="rounded-lg border p-3 text-sm">{msg}</p>}
 <Link href="/pilot-login" className="block rounded-xl border border-gray-300 bg-white p-4 text-center font-semibold">Zurueck zu Einsatz verbinden</Link>
 </main>;
}
