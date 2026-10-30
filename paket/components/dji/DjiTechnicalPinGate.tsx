"use client";

import { useState, type FormEvent } from "react";

/** Uses the EXISTING Demo/GPS-Test PIN endpoint and its HttpOnly cookie. */
export default function DjiTechnicalPinGate() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !pin) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/gps-test/unlock", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "PIN wurde nicht akzeptiert.");
      setPin("");
      window.location.reload();
    } catch (cause) {
      setPin("");
      setError(cause instanceof Error ? cause.message : "PIN-Prüfung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 570, margin: "26px auto", padding: 14, fontFamily: "Arial, sans-serif", color: "#173049" }}>
      <section style={{ background: "#fff", padding: 24, border: "1px solid #cad8e2", borderRadius: 14 }}>
        <h1 style={{ textAlign: "center", fontSize: 26, margin: "0 0 12px" }}>Technik &amp; Fehlersuche</h1>
        <p>Dieser Bereich ist nur für Administratoren nach Eingabe der Demo-/GPS-Test-PIN zugänglich.</p>
        <form onSubmit={(event) => { void unlock(event); }}>
          <label htmlFor="dji-tech-pin" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Demo-PIN</label>
          <input id="dji-tech-pin" type="password" autoComplete="off" required value={pin}
            onChange={(event) => setPin(event.target.value)}
            style={{ display: "block", width: "100%", minHeight: 54, padding: 12, borderRadius: 9, border: "1px solid #9eacbb", fontSize: 20, boxSizing: "border-box" }} />
          {error && <p role="alert" style={{ color: "#973500" }}>{error}</p>}
          <button type="submit" disabled={busy || !pin}
            style={{ display: "block", width: "100%", minHeight: 54, marginTop: 16, background: "#16653d", color: "white", fontSize: 18, fontWeight: 700, border: 0, borderRadius: 9 }}>
            {busy ? "PIN wird geprüft …" : "Technik freischalten"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 14 }}>Die Freigabe gilt wie beim GPS-Test für zwei Stunden auf diesem Gerät.</p>
        <a href="/pilot-login" style={{ color: "#135f98" }}>Zurück zur Pilotenansicht</a>
      </section>
    </main>
  );
}
