"use client";

import { useCallback, useEffect, useState } from "react";

type CertificateOverview = {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  total: number;
  finished: number;
  pending: number;
  eligible: boolean;
  status: "NOT_SENT" | "SENDING" | "ERROR" | "SENT";
  sentAt: string | null;
  lastError: string | null;
  attempts: number;
};
function todayGermany() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function statusText(item: CertificateOverview) {
  if(item.status==="SENT") return "Versendet";
  if(item.status==="ERROR") return "Versandfehler";
  if(item.status==="SENDING") return "Versand läuft / Status prüfen";
  if(!item.eligible) return `${item.pending} Fläche(n) noch offen`;
  if(!item.ownerEmail) return "Landwirt ohne E-Mail";
  return "Bereit (Versand ausstehend)";
}

export default function FlightCertificatesClient() {
  const [date,setDate]=useState(todayGermany);
  const [rows,setRows]=useState<CertificateOverview[]>([]);
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [info,setInfo]=useState<string|null>(null);
  const load=useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res=await fetch(`/api/admin/flight-certificates?date=${encodeURIComponent(date)}`,{cache:"no-store"});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error || `Serverfehler ${res.status}`);
      setRows(Array.isArray(data.items)?data.items:[]);
    } catch(e) {
      setError(e instanceof Error?e.message:"Daten nicht abrufbar.");
      setRows([]);
    } finally {setLoading(false);}
  },[date]);
  useEffect(()=>{void load();},[load]);

  async function sendOne(row:CertificateOverview) {
    if(sending || row.status==="SENT") return;
    let force=false;
    if(row.status==="SENDING") {
      const answer=window.confirm("Der Versandstatus ist unklar. Möglicherweise wurde die E-Mail bereits zugestellt! Nur dann erneut senden, wenn du das geprüft hast. Wirklich erneut senden?");
      if(!answer) return;
      force=true;
    } else if (row.status==="ERROR") {
      if(!window.confirm(`Versand erneut versuchen für ${row.ownerName}?`)) return;
    } else if (!window.confirm(`Befliegungsnachweis jetzt an ${row.ownerEmail} senden?`)) return;
    setSending(row.ownerId);setError(null);setInfo(null);
    try {
      const res=await fetch("/api/admin/flight-certificates",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"send",ownerId:row.ownerId,date,force}),
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data?.error || `Fehler ${res.status}`);
      if(data.status==="SENT") setInfo(data.alreadySent?"Nachweis war bereits versendet.":"Nachweis vom Mailserver angenommen.");
      else setInfo("Versand ist noch als laufend markiert. Bitte zuerst den Status prüfen.");
      await load();
    } catch(e) {await load();setError(e instanceof Error?e.message:"Versand fehlgeschlagen.");}
    finally {setSending(null);}
  }

  return <main className="min-h-screen bg-gray-50 p-3 pb-24 md:p-6">
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="page-card p-5">
        <h1 className="text-2xl font-bold text-gray-900">Befliegungsnachweise</h1>
        <p className="mt-2 text-sm text-gray-700">Für jeden Landwirt und Einsatztag wird nach Abschluss aller zugehörigen Flächen ein PDF erzeugt und automatisch per E-Mail versendet. Hier kannst du den Status prüfen, das PDF anzeigen, ausdrucken und einen fehlgeschlagenen Versand erneut starten.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold text-gray-900">Einsatztag
            <input className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base" type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </label>
          <button type="button" onClick={()=>void load()} disabled={loading} className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 disabled:opacity-50">↻ Aktualisieren</button>
          <a href="/api/admin/flight-certificates/sample" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white">📄 Muster anzeigen / drucken</a>
          <a href="/api/admin/flight-certificates/sample?download=1" className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900">⬇ Muster-PDF herunterladen</a>
        </div>
      </section>
      {error && <section role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900">{error}</section>}
      {info && <section role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-semibold text-green-900">{info}</section>}
      {loading && <section className="page-card p-4 text-gray-700">Nachweise werden geladen ...</section>}
      {!loading && rows.length===0 && <section className="page-card p-5 text-sm text-gray-600">Für dieses Datum sind keine regulären Aufträge mit zugeordneten Landwirten vorhanden.</section>}
      {rows.map(row=>{
        const pdfUrl=`/api/admin/flight-certificates/pdf?date=${encodeURIComponent(date)}&ownerId=${encodeURIComponent(row.ownerId)}`;
        const ready=row.eligible || row.status==="SENT";
        const canSend=row.eligible && !!row.ownerEmail && row.status!=="SENT";
        const statusClass=row.status==="SENT"?"border-green-300 bg-green-50 text-green-900":row.status==="ERROR"?"border-red-300 bg-red-50 text-red-900":ready?"border-yellow-300 bg-yellow-50 text-yellow-900":"border-gray-300 bg-gray-100 text-gray-800";
        return <section key={row.ownerId} className="page-card space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="text-lg font-bold text-gray-900">{row.ownerName}</h2><p className="mt-1 break-all text-sm text-gray-600">{row.ownerEmail || "Keine E-Mail-Adresse hinterlegt"}</p></div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>{statusText(row)}</span>
          </div>
          <p className="text-sm text-gray-700">{row.finished} von {row.total} Flächen erledigt</p>
          {row.sentAt && <p className="text-sm text-green-800">Versendet am {new Date(row.sentAt).toLocaleString("de-DE")}</p>}
          {row.lastError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Letzter Fehler: {row.lastError}</p>}
          <div className="flex flex-wrap gap-2">
            {ready ? <>
              <a target="_blank" rel="noopener noreferrer" href={pdfUrl} className="inline-flex min-h-11 items-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white">📄 PDF ansehen / drucken</a>
              <a href={`${pdfUrl}&download=1`} className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900">⬇ PDF herunterladen</a>
            </> : <span className="text-sm text-gray-600">PDF erst verfügbar, wenn alle Flächen abgeschlossen sind.</span>}
            {canSend && <button type="button" disabled={!!sending} onClick={()=>void sendOne(row)} className="min-h-11 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-900 disabled:opacity-50">
              {sending===row.ownerId?"Sende ...":row.status==="ERROR"?"✉ Erneut senden":row.status==="SENDING"?"⚠ Status prüfen / ggf. erneut senden":"✉ Jetzt senden"}
            </button>}
          </div>
        </section>;
      })}
      <p className="text-xs leading-relaxed text-gray-600">Wichtig: Der Nachweis dokumentiert die tatsächlichen Meldungen und ist keine Wildfreiheitsbescheinigung. Bei einem bereits versendeten Nachweis zeigt der PDF-Aufruf weiterhin den damals versendeten Datenstand. Automatische Wiederholungsversuche finden aus Sicherheitsgründen nicht statt.</p>
    </div>
  </main>;
}
