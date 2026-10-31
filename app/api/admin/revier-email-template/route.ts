export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { getRevierOwnerMailTemplate } from "@/lib/revier-owner-mail-template-store";
import {
  EXAMPLE_REV_OWNER_MAIL_VALUES,
  renderRevierMailText,
  ensureRevierMailMeetingPoint,
  validateRevierMailTemplate,
} from "@/lib/revier-owner-mail-template";
import {
  EXAMPLE_REVIER_SEARCH_REPORT_VALUES,
  renderRevierSearchReportText,
  validateRevierSearchReportTemplate,
} from "@/lib/revier-search-report-template";
import {
  getRevierSearchReportTemplate,
  REVIER_SEARCH_REPORT_TEMPLATE_KEY,
} from "@/lib/revier-search-report-template-store";

type TemplateKind = "before" | "report";
const lastTestMailAt = new Map<string, number>();
const sendingUsers = new Set<string>();

function getKind(value: unknown): TemplateKind | null {
  // Fehlender Parameter bleibt aus Kompatibilitätsgründen die bisherige Vorab-Mail.
  if (value === undefined || value === null || value === "") return "before";
  return value === "before" || value === "report" ? value : null;
}

async function authorized() {
  const user = await getCurrentUserWithTeams();
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }), user: null };
  if (!user.isAdmin) return { error: NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 }), user: null };
  return { user, error: null };
}

function checkOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { error } = await authorized();
  if (error) return error;
  const kind = getKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Unbekannte Vorlagenart." }, { status: 400 });
  try {
    const template = kind === "report"
      ? await getRevierSearchReportTemplate()
      : await getRevierOwnerMailTemplate();
    return NextResponse.json({ ...template }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Reviermail-Vorlage lesen:", cause);
    return NextResponse.json({ error: "Vorlage konnte nicht geladen werden. Bitte Serverlog prüfen." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await authorized();
  if (error) return error;
  if (!checkOrigin(req)) return NextResponse.json({ error: "Ungültiger Aufrufursprung." }, { status: 403 });
  try {
    const input = await req.json();
    const kind = getKind(input?.kind);
    if (!kind) return NextResponse.json({ error: "Unbekannte Vorlagenart." }, { status: 400 });
    const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
    const body = typeof input?.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
    const problem = kind === "report"
      ? validateRevierSearchReportTemplate(subject, body)
      : validateRevierMailTemplate(subject, body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const key = kind === "report" ? REVIER_SEARCH_REPORT_TEMPLATE_KEY : "default";
    const item = await db.revierOwnerEmailTemplate.upsert({
      where: { key },
      create: { key, subject, body },
      update: { subject, body },
    });
    return NextResponse.json({
      ok: true,
      subject: item.subject,
      body: item.body,
      updatedAt: item.updatedAt.toISOString(),
    });
  } catch (cause) {
    console.error("Reviermail-Vorlage speichern:", cause);
    return NextResponse.json({ error: "Vorlage konnte nicht gespeichert werden. Bitte Serverlog prüfen." }, { status: 500 });
  }
}

// Testmail nur an die vom Admin eingegebene Adresse, ausschließlich mit Beispieldaten.
export async function POST(req: NextRequest) {
  const { user, error } = await authorized();
  if (error || !user) return error!;
  if (!checkOrigin(req)) return NextResponse.json({ error: "Ungültiger Aufrufursprung." }, { status: 403 });

  let input: { email?: unknown; action?: unknown; kind?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }
  if (input?.action !== "test") return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  const kind = getKind(input?.kind);
  if (!kind) return NextResponse.json({ error: "Unbekannte Vorlagenart." }, { status: 400 });
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
    return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, { status: 400 });
  }
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]
    .filter((key) => !process.env[key]?.trim());
  if (missing.length) return NextResponse.json({ error: `SMTP-Konfiguration fehlt: ${missing.join(", ")}.` }, { status: 503 });
  if (sendingUsers.has(user.id)) return NextResponse.json({ error: "Ein Testversand läuft bereits." }, { status: 429 });
  const remaining = Math.ceil((30000 - (Date.now() - (lastTestMailAt.get(user.id) ?? 0))) / 1000);
  if (remaining > 0) return NextResponse.json({ error: `Bitte vor der nächsten Testmail noch ${remaining} Sekunden warten.` }, { status: 429 });

  sendingUsers.add(user.id);
  try {
    let subject: string;
    let body: string;
    if (kind === "report") {
      const saved = await getRevierSearchReportTemplate();
      subject = `[TEST] ${renderRevierSearchReportText(saved.subject, EXAMPLE_REVIER_SEARCH_REPORT_VALUES)}`;
      body = renderRevierSearchReportText(saved.body, EXAMPLE_REVIER_SEARCH_REPORT_VALUES);
    } else {
      const saved = await getRevierOwnerMailTemplate();
      subject = `[TEST] ${renderRevierMailText(saved.subject, EXAMPLE_REV_OWNER_MAIL_VALUES)}`;
      body = renderRevierMailText(ensureRevierMailMeetingPoint(saved.body), EXAMPLE_REV_OWNER_MAIL_VALUES);
    }
    await sendMail({ to: email, subject, text: body });
    lastTestMailAt.set(user.id, Date.now());
    return NextResponse.json({ ok: true, message: `Testmail an ${email} vom SMTP-Server angenommen. Bitte auch den Spamordner prüfen.` });
  } catch (cause: unknown) {
    console.error("Reviermail-Testversand:", cause);
    const issue = cause as { code?: string; responseCode?: number };
    let message = "Testmail konnte nicht versendet werden. Bitte Serverlog prüfen.";
    if (issue?.code === "EAUTH" || issue?.responseCode === 535) message = "SMTP-Anmeldung fehlgeschlagen. SMTP_USER und SMTP_PASS prüfen.";
    else if (["ECONNECTION", "ETIMEDOUT", "ENOTFOUND", "ESOCKET", "ECONNREFUSED"].includes(issue?.code || "")) message = "Mailserver nicht erreichbar. SMTP_HOST, SMTP_PORT und TLS prüfen.";
    else if (issue?.responseCode) message = `Mailserver hat mit SMTP-Status ${issue.responseCode} abgelehnt.`;
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    sendingUsers.delete(user.id);
  }
}
