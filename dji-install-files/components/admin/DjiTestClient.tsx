"use client";

import { useEffect, useState } from "react";

type DemoOrder = { id: string; title: string; orderCode: string | null };

export default function DjiTestClient() {
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [latitude, setLatitude] = useState("53.35");
  const [longitude, setLongitude] = useState("9.99");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/dji/test-import", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw Error("Zugriff verweigert"); return r.json(); })
      .then((data) => setOrders(data.orders || []))
      .catch(() => setFeedback("Demo-Auftraege konnten nicht geladen werden."));
  }, []);

  async function send() {
    if (!orderId || busy) return;
    if (!window.confirm("Wirklich einen DJI-Testpunkt in diesem DEMO-Auftrag anlegen?")) return;
    setBusy(true);
    setFeedback("");
    try {
      const res = await fetch("/api/admin/dji/test-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, latitude: Number(latitude), longitude: Number(longitude) }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Fehler beim Testimport");
      setFeedback(`Testpunkt gespeichert: ${data.status}, PinPoint-ID: ${data.pinpointId || "keine"}. Der Auftrag kann nun in der normalen Einsatzansicht geprueft werden.`);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Testimport fehlgeschlagen");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-5">
      <h1 className="text-2xl font-bold">DJI PinPoint – Testimport</h1>
      <p className="rounded-lg border border-amber-300 p-3 text-sm">
        Testphase 1: Diese Seite prueft die Aufnahme von DJI-Kartenpunkten in unser bestehendes PinPoint-System. Die DJI-Fernsteuerung ist damit noch NICHT verbunden. Der Test schreibt ausschliesslich in Demo-Auftraege.
      </p>
      <div className="space-y-3 rounded-xl border p-4">
        <label className="block text-sm font-semibold" htmlFor="dji-order">Demo-Auftrag</label>
        <select id="dji-order" className="w-full rounded border p-3" value={orderId} onChange={e => setOrderId(e.target.value)}>
          <option value="">Bitte waehlen</option>
          {orders.map(order => <option key={order.id} value={order.id}>{order.orderCode || order.title}</option>)}
        </select>
        {!orders.length && <p className="text-sm">Keine offenen Demo-Auftraege vorhanden. Lege zuerst einen Demo-Auftrag an.</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Breitengrad
            <input className="mt-1 w-full rounded border p-2" value={latitude} onChange={e => setLatitude(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">Laengengrad
            <input className="mt-1 w-full rounded border p-2" value={longitude} onChange={e => setLongitude(e.target.value)} inputMode="decimal" />
          </label>
        </div>
        <button type="button" disabled={!orderId || busy} onClick={send} className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">
          {busy ? "Importiere …" : "DJI-Testpunkt anlegen"}
        </button>
        {feedback && <p role="status" className="text-sm">{feedback}</p>}
      </div>
    </main>
  );
}
