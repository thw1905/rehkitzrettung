"use client";
// REHKITZ_WILD_KONTRAST_V1 – explizit dunkle Schrift auf hellem Untergrund.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = { url: string; expiresAt: string };
export default function WildSiteShare({ url, expiresAt }: Props) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then(data => { if (active) setQr(data); })
      .catch(() => { if (active) setError("QR-Code konnte nicht angezeigt werden."); });
    return () => { active = false; };
  }, [url]);
  const expired = Date.now() >= new Date(expiresAt).getTime();
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setError("Link konnte nicht kopiert werden. Bitte den Link markieren und manuell kopieren."); }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Wild-Sicherungsort", url });
      else await copy();
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setError("Teilen fehlgeschlagen.");
    }
  }
  return <div className="space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3 text-slate-950">
    {expired ? <p className="font-semibold text-red-900">Dieser Punkt ist abgelaufen.</p> : <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void share()} className="rounded-xl bg-green-800 px-4 py-2 font-semibold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800">Teilen</button>
        <button type="button" onClick={() => void copy()} className="rounded-xl border border-slate-500 bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">{copied ? "Link kopiert" : "Link kopieren"}</button>
      </div>
      <label className="block text-sm font-semibold text-slate-900">Freigabelink
        <input readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-slate-500 bg-white p-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-800" />
      </label>
      {qr && <div className="inline-block rounded-xl bg-white p-3 ring-1 ring-slate-300"><img src={qr} alt="QR-Code zum Wild-Sicherungsort" width={240} height={240} /></div>}
      <p className="text-sm leading-relaxed text-slate-700">Der QR-Code enthält denselben Link. Empfänger benötigen keine Anmeldung. Gültig bis 24:00 Uhr.</p>
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-900">{error}</p>}
  </div>;
}
