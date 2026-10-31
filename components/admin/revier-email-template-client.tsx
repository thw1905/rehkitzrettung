"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REV_OWNER_MAIL_BODY,
  DEFAULT_REV_OWNER_MAIL_SUBJECT,
  EXAMPLE_REV_OWNER_MAIL_VALUES,
  REV_OWNER_MAIL_PLACEHOLDERS,
  renderRevierMailText,
  ensureRevierMailMeetingPoint,
  validateRevierMailTemplate,
} from "@/lib/revier-owner-mail-template";
import {
  DEFAULT_REVIER_SEARCH_REPORT_BODY,
  DEFAULT_REVIER_SEARCH_REPORT_SUBJECT,
  EXAMPLE_REVIER_SEARCH_REPORT_VALUES,
  REVIER_SEARCH_REPORT_PLACEHOLDERS,
  renderRevierSearchReportText,
  validateRevierSearchReportTemplate,
} from "@/lib/revier-search-report-template";

type TemplateKind = "before" | "report";
type TemplateResponse = { subject: string; body: string; updatedAt: string | null; error?: string };
type Notice = { type: "success" | "error" | "info"; text: string };
type TemplateState = {
  subject: string;
  body: string;
  savedSubject: string;
  savedBody: string;
  updatedAt: string | null;
};

type TemplateStates = Record<TemplateKind, TemplateState>;

const initialTemplates: TemplateStates = {
  before: {
    subject: DEFAULT_REV_OWNER_MAIL_SUBJECT,
    body: DEFAULT_REV_OWNER_MAIL_BODY,
    savedSubject: DEFAULT_REV_OWNER_MAIL_SUBJECT,
    savedBody: DEFAULT_REV_OWNER_MAIL_BODY,
    updatedAt: null,
  },
  report: {
    subject: DEFAULT_REVIER_SEARCH_REPORT_SUBJECT,
    body: DEFAULT_REVIER_SEARCH_REPORT_BODY,
    savedSubject: DEFAULT_REVIER_SEARCH_REPORT_SUBJECT,
    savedBody: DEFAULT_REVIER_SEARCH_REPORT_BODY,
    updatedAt: null,
  },
};

async function readApiResult(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Der Server hat keine gültige JSON-Antwort geliefert (HTTP ${response.status}). Bitte Serverlog prüfen.`);
  }
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== "object") {
    throw new Error(`Ungültige Serverantwort (HTTP ${response.status}).`);
  }
  const record = result as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof record.error === "string" && record.error.trim()
      ? record.error
      : "Die Anfrage ist fehlgeschlagen.";
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  return record;
}

export default function RevierEmailTemplateClient() {
  const [kind, setKind] = useState<TemplateKind>("before");
  const [templates, setTemplates] = useState<TemplateStates>(initialTemplates);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhase, setTestPhase] = useState("");
  const [testNotice, setTestNotice] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const selected = templates[kind];
  const subject = selected.subject;
  const body = selected.body;
  const dirty = subject !== selected.savedSubject || body !== selected.savedBody;

  const issue = useMemo(() => (
    kind === "report"
      ? validateRevierSearchReportTemplate(subject, body)
      : validateRevierMailTemplate(subject, body)
  ), [kind, subject, body]);

  const previewSubject = useMemo(() => (
    kind === "report"
      ? renderRevierSearchReportText(subject, EXAMPLE_REVIER_SEARCH_REPORT_VALUES)
      : renderRevierMailText(subject, EXAMPLE_REV_OWNER_MAIL_VALUES)
  ), [kind, subject]);

  const previewBody = useMemo(() => (
    kind === "report"
      ? renderRevierSearchReportText(body, EXAMPLE_REVIER_SEARCH_REPORT_VALUES)
      : renderRevierMailText(ensureRevierMailMeetingPoint(body), EXAMPLE_REV_OWNER_MAIL_VALUES)
  ), [kind, body]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [beforeResponse, reportResponse] = await Promise.all([
          fetch("/api/admin/revier-email-template?kind=before", { cache: "no-store" }),
          fetch("/api/admin/revier-email-template?kind=report", { cache: "no-store" }),
        ]);
        const [before, report] = await Promise.all([
          readApiResult(beforeResponse),
          readApiResult(reportResponse),
        ]);
        if (cancelled) return;
        const fromApi = (json: Record<string, unknown>): TemplateState => {
          const s = String(json.subject ?? "");
          const b = String(json.body ?? "");
          return {
            subject: s,
            body: b,
            savedSubject: s,
            savedBody: b,
            updatedAt: typeof json.updatedAt === "string" ? json.updatedAt : null,
          };
        };
        setTemplates({ before: fromApi(before), report: fromApi(report) });
      } catch (error) {
        if (!cancelled) setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Fehler beim Laden der Vorlagen.",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  function changeField(field: "subject" | "body", value: string) {
    setTemplates((previous) => ({
      ...previous,
      [kind]: { ...previous[kind], [field]: value },
    }));
    setNotice(null);
  }

  function changeKind(nextKind: TemplateKind) {
    if (saving || sending) return;
    setKind(nextKind);
    setNotice(null);
    setTestNotice(null);
  }

  async function persistTemplate(target: TemplateKind, values: TemplateState) {
    const response = await fetch("/api/admin/revier-email-template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ kind: target, subject: values.subject, body: values.body }),
    });
    const json = await readApiResult(response);
    const nextSubject = String(json.subject ?? values.subject);
    const nextBody = String(json.body ?? values.body);
    setTemplates((previous) => ({
      ...previous,
      [target]: {
        subject: nextSubject,
        body: nextBody,
        savedSubject: nextSubject,
        savedBody: nextBody,
        updatedAt: typeof json.updatedAt === "string" ? json.updatedAt : null,
      },
    }));
  }

  async function save() {
    if (issue) { setNotice({ type: "error", text: issue }); return; }
    setSaving(true);
    setNotice(null);
    try {
      await persistTemplate(kind, selected);
      setNotice({
        type: "success",
        text: kind === "report"
          ? "Suchbericht-Vorlage gespeichert. Sie wird beim späteren automatischen Ergebnisversand verwendet."
          : "Vorlage gespeichert. Sie wird ab der nächsten Revierpächter-Benachrichtigung verwendet.",
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
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
    const target = kind;
    try {
      if (dirty) {
        setTestPhase("Änderungen werden zuerst gespeichert ...");
        await persistTemplate(target, selected);
      }
      setTestPhase("Testmail wird gesendet ...");
      const response = await fetch("/api/admin/revier-email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ kind: target, action: "test", email }),
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
  const placeholders = kind === "report" ? REVIER_SEARCH_REPORT_PLACEHOLDERS : REV_OWNER_MAIL_PLACEHOLDERS;
  const defaultSubject = kind === "report" ? DEFAULT_REVIER_SEARCH_REPORT_SUBJECT : DEFAULT_REV_OWNER_MAIL_SUBJECT;
  const defaultBody = kind === "report" ? DEFAULT_REVIER_SEARCH_REPORT_BODY : DEFAULT_REV_OWNER_MAIL_BODY;

  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="page-card p-4 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">E-Mail-Vorlagen für Revierpächter</h1>
          <p className="mt-2 text-sm text-gray-700">
            Hier bearbeitest du die E-Mail vor der Suche und den Suchbericht nach Abschluss eines Reviers getrennt voneinander.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="E-Mail-Vorlage auswählen">
            <button
              type="button"
              disabled={saving || sending}
              aria-pressed={kind === "before"}
              onClick={() => changeKind("before")}
              className={`rounded-xl px-4 py-3 text-sm font-bold ${kind === "before" ? "bg-blue-700 text-white" : "border border-gray-300 bg-white text-gray-900"}`}
            >
              Vor der Suche {templates.before.subject !== templates.before.savedSubject || templates.before.body !== templates.before.savedBody ? "•" : ""}
            </button>
            <button
              type="button"
              disabled={saving || sending}
              aria-pressed={kind === "report"}
              onClick={() => changeKind("report")}
              className={`rounded-xl px-4 py-3 text-sm font-bold ${kind === "report" ? "bg-blue-700 text-white" : "border border-gray-300 bg-white text-gray-900"}`}
            >
              Suchbericht nach der Suche {templates.report.subject !== templates.report.savedSubject || templates.report.body !== templates.report.savedBody ? "•" : ""}
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-700">
            {kind === "before"
              ? "Diese Vorlage wird für die Benachrichtigung vor geplanten Suchen verwendet."
              : "Diese Vorlage ist für den Ergebnisbericht vorgesehen, sobald alle Aufträge eines Reviers für einen Einsatztag abgeschlossen sind. Die automatische Auslösung wird separat angebunden."}
          </p>
          {selected.updatedAt && (
            <p className="mt-2 text-xs text-gray-600">Zuletzt gespeichert: {new Date(selected.updatedAt).toLocaleString("de-DE")}</p>
          )}
        </section>

        {notice && (
          <div role="status" className={`rounded-xl border p-3 text-sm font-semibold ${notice.type === "error" ? "border-red-300 bg-red-50 text-red-900" : notice.type === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            {notice.text}
          </div>
        )}

        <section className="page-card space-y-4 p-4 md:p-6">
          <div>
            <label htmlFor="rev-mail-subject" className="mb-2 block text-sm font-bold text-gray-900">Betreff</label>
            <input
              id="rev-mail-subject" type="text" maxLength={200}
              disabled={busy} value={subject}
              onChange={(event) => changeField("subject", event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-950"
            />
          </div>
          <div>
            <label htmlFor="rev-mail-body" className="mb-2 block text-sm font-bold text-gray-900">Nachrichtentext</label>
            <textarea
              id="rev-mail-body" rows={16} maxLength={10000}
              disabled={busy} value={body}
              onChange={(event) => changeField("body", event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 font-mono text-sm leading-6 text-gray-950"
            />
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <h2 className="mb-2 text-sm font-bold text-blue-950">Verfügbare Platzhalter</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {placeholders.map((item) => (
                <div key={item.key} className="text-sm text-blue-950">
                  <code className="rounded bg-white px-1 py-0.5 font-bold">{`{{${item.key}}}`}</code>
                  <span className="ml-2">{item.label}</span>
                </div>
              ))}
            </div>
            {kind === "report" && (
              <p className="mt-2 text-xs text-blue-950">
                Die Platzhalter für Flächen, Wildzahlen und Fundstellen müssen enthalten bleiben, damit der Ergebnisbericht vollständig ist.
              </p>
            )}
          </div>
          {issue && !loading && <p className="text-sm font-semibold text-red-700">{issue}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button" disabled={busy || Boolean(issue) || !dirty}
              onClick={() => void save()}
              className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "Speichere ..." : "Vorlage speichern"}
            </button>
            <button
              type="button" disabled={busy}
              onClick={() => {
                setTemplates((previous) => ({
                  ...previous,
                  [kind]: { ...previous[kind], subject: defaultSubject, body: defaultBody },
                }));
                setNotice({ type: "info", text: "Standardtext geladen. Zum Übernehmen bitte speichern." });
              }}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              Standardtext laden
            </button>
            {dirty && <span className="text-sm font-semibold text-amber-700">Ungespeicherte Änderungen</span>}
          </div>
        </section>

        <section className="page-card p-4 md:p-6">
          <button
            type="button" aria-expanded={showPreview}
            onClick={() => setShowPreview(!showPreview)}
            className="flex w-full items-center justify-between text-left text-base font-bold text-gray-900"
          >
            Vorschau mit Beispieldaten <span>{showPreview ? "−" : "+"}</span>
          </button>
          {showPreview && (
            <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm"><strong>Betreff:</strong> {previewSubject}</div>
              <hr className="border-gray-200" />
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-gray-900">{previewBody}</pre>
              <p className="text-xs text-gray-500">Nur Beispieldaten, keine tatsächlichen Revierdaten.</p>
            </div>
          )}
        </section>

        <section className="page-card space-y-3 p-4 md:p-6">
          <h2 className="text-lg font-bold text-gray-900">Gespeicherte Vorlage als Testmail senden</h2>
          <p className="text-sm text-gray-700">
            Die Testmail enthält ausschließlich Beispieldaten und beginnt im Betreff mit [TEST]. Echte Revierpächter werden dabei nicht automatisch kontaktiert.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email" aria-label="Empfängeradresse für Testmail"
              value={recipient}
              onChange={(event) => { setRecipient(event.target.value); setTestNotice(null); }}
              placeholder="deine-adresse@beispiel.de" disabled={busy}
              className="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:opacity-60"
            />
            <button
              type="button" disabled={busy} onClick={() => void sendTest()}
              className="min-h-12 shrink-0 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? "Bitte warten ..." : dirty ? "Speichern & Testmail senden" : "Testmail senden"}
            </button>
          </div>
          {dirty && !sending && (
            <p className="text-sm text-amber-800">Die Vorlage wurde geändert. Beim Testversand wird sie zuerst gespeichert.</p>
          )}
          {testPhase && (
            <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">{testPhase}</div>
          )}
          {testNotice && (
            <div role="status" aria-live="polite" className={`rounded-xl border p-3 text-sm font-semibold ${testNotice.type === "error" ? "border-red-300 bg-red-50 text-red-900" : testNotice.type === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
              {testNotice.text}
            </div>
          )}
          <p className="text-xs text-gray-500">Erfolg bedeutet, dass der SMTP-Server die Nachricht angenommen hat. Sie kann trotzdem im Spamordner landen.</p>
        </section>
      </div>
    </main>
  );
}
