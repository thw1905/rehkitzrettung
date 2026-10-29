"use client";
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
  return <div className="space-y-3 rounded-xl border p-3">
    {expired ? <p className="font-semibold text-red-700">Dieser Punkt ist abgelaufen.</p> : <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void share()} className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white">Teilen</button>
        <button type="button" onClick={() => void copy()} className="rounded-xl border px-4 py-2">{copied ? "Link kopiert" : "Link kopieren"}</button>
      </div>
      <label className="block text-xs">Freigabelink
        <input readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-1 w-full rounded-lg border p-2 text-xs" />
      </label>
      {qr && <div className="inline-block rounded-xl bg-white p-3"><img src={qr} alt="QR-Code zum Wild-Sicherungsort" width={240} height={240} /></div>}
      <p className="text-xs text-gray-600">Der QR-Code enthält denselben Link. Empfänger benötigen keine Anmeldung. Gültig bis 24:00 Uhr.</p>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
