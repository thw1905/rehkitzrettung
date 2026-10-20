"use client";

import { useState } from "react";
import Link from "next/link";

type TestResponse = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  smtpCode?: number;
  message?: string;
  email?: string;
  durationMs?: number;
};

export default function EmailTestClient() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; data: TestResponse } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        cache: "no-store",
      });
      const data: TestResponse = await response.json().catch(() => ({ error: "Der Server lieferte keine gueltige JSON-Antwort." }));
      setResult({ success: response.ok && data.ok === true, data });
    } catch {
      setResult({ success: false, data: { error: "Der Server ist nicht erreichbar oder die Verbindung wurde unterbrochen." } });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="page-card p-4 md:p-6">
          <div className="mb-2 text-sm text-gray-600">Hilfe / System · Administrator</div>
          <h1 className="text-2xl font-bold text-gray-950">✉️ E-Mail-Test</h1>
          <p className="mt-2 text-sm text-gray-700">
            Pruefe die E-Mail-Einstellungen deiner Rehkitzrettungs-App.
            Es wird eine echte Testmail ueber den konfigurierten SMTP-Server verschickt.
          </p>
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="test-email" className="mb-2 block text-sm font-semibold text-gray-900">
                Empfaengeradresse
              </label>
              <input
                id="test-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => { setEmail(event.target.value); setResult(null); }}
                placeholder="name@beispiel.de"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={sending || email.trim().length === 0}
              className="w-full rounded-xl bg-blue-700 px-5 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-gray-400"
            >
              {sending ? "Testmail wird gesendet ..." : "✉️ Testmail senden"}
            </button>
          </form>
        </section>

        {result && (
          <section role="status" aria-live="polite" className={`rounded-2xl border p-4 shadow-sm ${result.success ? "border-green-300 bg-green-50 text-green-950" : "border-red-300 bg-red-50 text-red-950"}`}>
            <h2 className="text-lg font-bold">{result.success ? "✓ Mailversand erfolgreich" : "✕ Mailversand fehlgeschlagen"}</h2>
            <p className="mt-2 text-sm">{result.success ? result.data.message : result.data.error}</p>
            {result.success && result.data.email && <p className="mt-2 text-sm font-semibold">An: {result.data.email}</p>}
            {!result.success && (result.data.errorCode || result.data.smtpCode) && (
              <p className="mt-2 text-xs text-red-800">Fehlerkennung: {result.data.errorCode || "SMTP"}{result.data.smtpCode ? ` · SMTP ${result.data.smtpCode}` : ""}</p>
            )}
          </section>
        )}

        <section className="page-card p-4 text-sm text-gray-700">
          <p><strong>Hinweis:</strong> Eine erfolgreiche Antwort bedeutet, dass die Mail an den SMTP-Server uebergeben wurde. Ob sie zugestellt wurde, pruefst du im Posteingang und im Spamordner.</p>
          <p className="mt-2">Bei Fehlermeldungen die SMTP-Einstellungen auf dem jeweiligen Server pruefen: <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> und <code>SMTP_FROM</code>.</p>
          <Link href="/hilfe" className="mt-4 inline-block font-semibold text-blue-700 underline">Zurueck zur Hilfe</Link>
        </section>
      </div>
    </main>
  );
}
