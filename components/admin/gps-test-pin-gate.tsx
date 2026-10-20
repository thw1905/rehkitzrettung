"use client";

import { useState } from "react";

export default function GpsTestPinGate() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/gps-test/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ pin }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "PIN-Freigabe fehlgeschlagen.");
      window.location.reload();
    } catch (caught) {
      setPin("");
      setError(caught instanceof Error ? caught.message : "PIN-Freigabe fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-gray-950">🔒 GPS-Testmodus freischalten</h1>
        <p className="mt-2 text-sm text-gray-700">
          Der GPS-Testmodus ist für angemeldete Administratoren mit Demo-PIN zugänglich.
          Verwende dieselbe PIN wie beim Anlegen eines Demoauftrags.
        </p>
        <form onSubmit={(event) => { void unlock(event); }} className="mt-5 space-y-4">
          <div>
            <label htmlFor="gps-test-pin" className="mb-1 block text-sm font-semibold text-gray-900">Demo-PIN</label>
            <input id="gps-test-pin" type="password" autoComplete="off" required value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-lg" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={busy || !pin}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? "Prüfe PIN ..." : "GPS-Testmodus öffnen"}
          </button>
        </form>
        <p className="mt-4 text-xs text-gray-500">Die Freigabe gilt 2 Stunden auf diesem Gerät. Danach wird die PIN erneut verlangt.</p>
      </div>
    </main>
  );
}
