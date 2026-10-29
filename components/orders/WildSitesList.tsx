"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const WildSitesMap = dynamic(() => import("@/components/orders/WildSitesMap"), { ssr: false });
import WildSiteShare from "@/components/orders/WildSiteShare";

type Site = { id: string; orderId: string; pinpointId: string;
 latitude: number; longitude: number; rehkitzeGesichert: number; sonstigesWildGesichert: number;
 expiresAt: string; createdAt: string; url: string };
export default function WildSitesList() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/wild-sites", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as { sites?: Site[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Sicherungsorte konnten nicht geladen werden.");
      setSites(data.sites || []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Ladefehler"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
    <Link href="/my-orders" className="text-sm underline">Zurück zu meinen Aufträgen</Link>
    <h1 className="text-2xl font-bold">Wild-Sicherungsorte</h1>
    <p className="text-sm text-gray-600">Hier können Sucher, Piloten und Administratoren die Sicherungsorte ihrer Teams per Link oder QR-Code teilen. DJI-PinPoints sind davon nicht betroffen.</p>
    <button type="button" onClick={() => void load()} className="rounded-lg border p-2 text-sm">Aktualisieren</button>
    {busy && <p>Wird geladen …</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!busy && !sites.length && <p>Noch keine Sicherungsorte vorhanden.</p>}
    {sites.length > 0 && <WildSitesMap sites={sites} />}
    <div className="space-y-3">
      {sites.map(s => <section key={s.id} className="rounded-xl border bg-white p-4 space-y-2">
        <p className="font-semibold">{s.rehkitzeGesichert} Rehkitze · {s.sonstigesWildGesichert} sonstiges Wild gesichert</p>
        <p className="text-xs text-gray-600">Standort: {s.latitude.toFixed(6)}, {s.longitude.toFixed(6)} · Ablauf um 24 Uhr</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setSelected(selected === s.id ? null : s.id)} className="rounded-lg bg-green-700 px-4 py-2 text-white">{selected === s.id ? "Schließen" : "Teilen / QR-Code"}</button>
          <a className="rounded-lg border px-4 py-2" target="_blank" rel="noopener noreferrer"
             href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.latitude},${s.longitude}`)}`}>Google Maps</a>
        </div>
        {selected === s.id && <WildSiteShare url={s.url} expiresAt={s.expiresAt} />}
      </section>)}
    </div>
  </main>;
}
