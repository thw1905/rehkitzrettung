"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REV_OWNER_MAIL_BODY, DEFAULT_REV_OWNER_MAIL_SUBJECT,
  EXAMPLE_REV_OWNER_MAIL_VALUES, REV_OWNER_MAIL_PLACEHOLDERS,
  renderRevierMailText, validateRevierMailTemplate,
} from "@/lib/revier-owner-mail-template";

type TemplateResponse = { subject: string; body: string; updatedAt: string | null; error?: string };

export default function RevierEmailTemplateClient() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState({ subject: "", body: "" });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhase, setTestPhase] = useState("");
  const [testNotice, setTestNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const dirty = subject !== saved.subject || body !== saved.body;
  const issue = useMemo(() => validateRevierMailTemplate(subject, body), [subject, body]);
  const previewSubject = useMemo(() => renderRevierMailText(subject, EXAMPLE_REV_OWNER_MAIL_VALUES), [subject]);
  const previewBody = useMemo(() => renderRevierMailText(body, EXAMPLE_REV_OWNER_MAIL_VALUES), [body]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch("/api/admin/revier-email-template", { cache: "no-store" });
        const json: TemplateResponse = await response.json();
        if (!response.ok) throw new Error(json.error || "Vorlage nicht lesbar.");
        if (cancelled) return;
        setSubject(json.subject); setBody(json.body);
        setSaved({ subject: json.subject, body: json.body });
        setUpdatedAt(json.updatedAt);
      } catch (error) {
        if (!cancelled) setNotice({ type: "error", text: error instanceof Error ? error.message : "Fehler beim Laden." });
      } finally { if (!cancelled) setLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (issue) { setNotice({ type: "error", text: issue }); return; }
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/revier-email-template", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Speichern fehlgeschlagen.");
      setSubject(json.subject); setBody(json.body);
      setSaved({ subject: json.subject, body: json.body });
      setUpdatedAt(json.updatedAt);
      setNotice({ type: "success", text: "Vorlage gespeichert. Sie wird ab der nächsten Revierpächter-Benachrichtigung verwendet." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Fehler beim Speichern." });
    } finally { setSaving(false); }
  }

  // API-Fehler bleiben sichtbar, auch wenn der Server einmal HTML statt JSON liefert.
  async function readApiResult(response: Response): Promise<Record<string, any>> {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        `Der Server hat keine gültige JSON-Antwort geliefert (HTTP ${response.status}). Bitte Serverlog prüfen.`
      );
    }
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== "object") {
      throw new Error(`Ungültige Serverantwort (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(
        typeof result.error === "string" && result.error.trim()
          ? `${result.error} (HTTP ${response.status})`
          : `Die Anfrage ist fehlgeschlagen (HTTP ${response.status}).`
      );
    }
    return result;
  }

  async function sendTest() {
    if (loading || saving || sending) return;

    const email = recipient.trim();
    if (!email || email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
      setTestNotice({ type: "error", text: "Bitte eine gültige E-Mail-Adresse eingeben." });
      return;
    }
    if (issue) {
      setTestNotice({ type: "error", text: `Die Vorlage enthält einen Fehler: ${issue}` });
      return;
    }

    setSending(true);
    setTestNotice(null);

    try {
      // War die Vorlage geändert, wird sie zuerst gespeichert.
      // Der anschließende Testversand nutzt exakt die gespeicherte Version.
      if (dirty) {
        setTestPhase("Änderungen werden zuerst gespeichert ...");
        const saveResponse = await fetch("/api/admin/revier-email-template", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ subject, body }),
        });
        const savedTemplate = await readApiResult(saveResponse);
        const nextSubject = String(savedTemplate.subject ?? subject);
        const nextBody = String(savedTemplate.body ?? body);
        setSubject(nextSubject);
        setBody(nextBody);
        setSaved({ subject: nextSubject, body: nextBody });
        setUpdatedAt(typeof savedTemplate.updatedAt === "string" ? savedTemplate.updatedAt : null);
      }

      setTestPhase("Testmail wird gesendet ...");
      const response = await fetch("/api/admin/revier-email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "test", email }),
      });
      const result = await readApiResult(response);
      setTestNotice({
        type: "success",
        text: typeof result.message === "string" ? result.message : `Testmail an ${email} vom Mailserver angenommen.`,
      });
    } catch (error) {
      setTestNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Testmail konnte nicht verschickt werden.",
      });
    } finally {
      setSending(false);
      setTestPhase("");
    }
  }

  const busy = loading || saving || sending;
  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="page-card p-4 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">E-Mail-Vorlage für Revierpächter</h1>
          <p className="mt-2 text-sm text-gray-700">Hier bestimmst du Betreff und Text der E-Mail, die Revierpächter erhalten, wenn Einsätze in ihren Revieren geplant werden. Änderungen gelten für zukünftige Benachrichtigungen.</p>
          {updatedAt && <p className="mt-2 text-xs text-gray-600">Zuletzt gespeichert: {new Date(updatedAt).toLocaleString("de-DE")}</p>}
        </section>

        {notice && (
          <div role="status" className={`rounded-xl border p-3 text-sm font-semibold ${notice.type === "error" ? "border-red-300 bg-red-50 text-red-900" : notice.type === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            {notice.text}
          </div>
        )}

        <section className="page-card space-y-4 p-4 md:p-6">
          <div>
            <label htmlFor="rev-mail-subject" className="mb-2 block text-sm font-bold text-gray-900">Betreff</label>
            <input id="rev-mail-subject" type="text" maxLength={200} disabled={busy} value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-950" />
          </div>
          <div>
            <label htmlFor="rev-mail-body" className="mb-2 block text-sm font-bold text-gray-900">Nachrichtentext</label>
            <textarea id="rev-mail-body" rows={15} maxLength={10000} disabled={busy} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 font-mono text-sm leading-6 text-gray-950" />
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <h2 className="mb-2 text-sm font-bold text-blue-950">Verfügbare Platzhalter</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {REV_OWNER_MAIL_PLACEHOLDERS.map((item) => (
                <div key={item.key} className="text-sm text-blue-950"><code className="rounded bg-white px-1 py-0.5 font-bold">{`{{${item.key}}}`}</code><span className="ml-2">{item.label}</span></div>
              ))}
            </div>
          </div>
          {issue && !loading && <p className="text-sm font-semibold text-red-700">{issue}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || Boolean(issue) || !dirty} onClick={() => void save()} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Speichere ..." : "Vorlage speichern"}</button>
            <button type="button" disabled={busy} onClick={() => { setSubject(DEFAULT_REV_OWNER_MAIL_SUBJECT); setBody(DEFAULT_REV_OWNER_MAIL_BODY); setNotice({ type: "info", text: "Standardtext geladen. Zum Übernehmen bitte speichern." }); }} className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50">Standardtext laden</button>
            {dirty && <span className="text-sm font-semibold text-amber-700">Ungespeicherte Änderungen</span>}
          </div>
        </section>

        <section className="page-card p-4 md:p-6">
          <button type="button" aria-expanded={showPreview} onClick={() => setShowPreview(!showPreview)} className="flex w-full items-center justify-between text-left text-base font-bold text-gray-900">Vorschau mit Beispieldaten <span>{showPreview ? "−" : "+"}</span></button>
          {showPreview && (
            <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm"><strong>Betreff:</strong> {previewSubject}</div>
              <hr className="border-gray-200"/>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-gray-900">{previewBody}</pre>
              <p className="text-xs text-gray-500">Nur Beispieldaten, keine tatsächlichen Revierdaten.</p>
            </div>
          )}
        </section>

        <section className="page-card space-y-3 p-4 md:p-6">
          <h2 className="text-lg font-bold text-gray-900">Gespeicherte Vorlage als Testmail senden</h2>
          <p className="text-sm text-gray-700">Die Testmail wird mit Beispieldaten verschickt und beginnt im Betreff mit [TEST]. Echte Revierpächter werden dabei nicht kontaktiert.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="email" aria-label="Empfängeradresse für Testmail" value={recipient} onChange={(event) => { setRecipient(event.target.value); setTestNotice(null); }} placeholder="deine-adresse@beispiel.de" disabled={busy} className="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:opacity-60" />
            <button type="button" disabled={busy} onClick={() => void sendTest()} className="min-h-12 shrink-0 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{sending ? "Bitte warten ..." : dirty ? "Speichern & Testmail senden" : "Testmail senden"}</button>
          </div>
          {dirty && !sending && (
            <p className="text-sm text-amber-800">Die Vorlage wurde geändert. Beim Testversand wird sie automatisch gespeichert.</p>
          )}
          {testPhase && (
            <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">{testPhase}</div>
          )}
          {testNotice && (
            <div role="status" aria-live="polite" className={`rounded-xl border p-3 text-sm font-semibold ${testNotice.type === "error" ? "border-red-300 bg-red-50 text-red-900" : testNotice.type === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
              {testNotice.text}
            </div>
          )}
          <p className="text-xs text-gray-500">Erfolg bedeutet: Der SMTP-Server hat die Nachricht angenommen. Sie kann danach noch im Spamordner landen.</p>
        </section>
      </div>
    </main>
  );
}
