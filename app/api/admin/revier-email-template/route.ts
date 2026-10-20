export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { getRevierOwnerMailTemplate } from "@/lib/revier-owner-mail-template-store";
import { EXAMPLE_REV_OWNER_MAIL_VALUES, renderRevierMailText, validateRevierMailTemplate } from "@/lib/revier-owner-mail-template";

const lastTestMailAt = new Map<string, number>();
const sendingUsers = new Set<string>();

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
  } catch { return false; }
}

export async function GET() {
  const { error } = await authorized();
  if (error) return error;
  try {
    const template = await getRevierOwnerMailTemplate();
    return NextResponse.json({ ...template }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Reviermail-Vorlage lesen:", cause);
    return NextResponse.json({ error: "Vorlage konnte nicht geladen werden. Wurde npx prisma db push und prisma generate ausgeführt?" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await authorized();
  if (error) return error;
  if (!checkOrigin(req)) return NextResponse.json({ error: "Ungültiger Aufrufursprung." }, { status: 403 });
  try {
    const input = await req.json();
    const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
    const body = typeof input?.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
    const problem = validateRevierMailTemplate(subject, body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const item = await db.revierOwnerEmailTemplate.upsert({
      where: { key: "default" },
      create: { key: "default", subject, body },
      update: { subject, body },
    });
    return NextResponse.json({ ok: true, subject: item.subject, body: item.body, updatedAt: item.updatedAt.toISOString() });
  } catch (cause) {
    console.error("Reviermail-Vorlage speichern:", cause);
    return NextResponse.json({ error: "Vorlage konnte nicht gespeichert werden. Serverlog prüfen." }, { status: 500 });
  }
}

// Sendet die GESPEICHERTE Vorlage mit reinen Beispieldaten.
// Es werden keine echten Revierpaechter benachrichtigt.
export async function POST(req: NextRequest) {
  const { user, error } = await authorized();
  if (error || !user) return error!;
  if (!checkOrigin(req)) return NextResponse.json({ error: "Ungültiger Aufrufursprung." }, { status: 403 });
  let input: { email?: unknown; action?: unknown };
  try { input = await req.json(); } catch { return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 }); }
  if (input?.action !== "test") return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
    return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, { status: 400 });
  }
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].filter((key) => !process.env[key]?.trim());
  if (missing.length) return NextResponse.json({ error: `SMTP-Konfiguration fehlt: ${missing.join(", ")}.` }, { status: 503 });
  if (sendingUsers.has(user.id)) return NextResponse.json({ error: "Ein Testversand läuft bereits." }, { status: 429 });
  const remaining = Math.ceil((30000 - (Date.now() - (lastTestMailAt.get(user.id) ?? 0))) / 1000);
  if (remaining > 0) return NextResponse.json({ error: `Bitte vor der nächsten Testmail noch ${remaining} Sekunden warten.` }, { status: 429 });
  sendingUsers.add(user.id);
  try {
    const saved = await getRevierOwnerMailTemplate();
    const subject = `[TEST] ${renderRevierMailText(saved.subject, EXAMPLE_REV_OWNER_MAIL_VALUES)}`;
    const body = renderRevierMailText(saved.body, EXAMPLE_REV_OWNER_MAIL_VALUES);
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
  } finally { sendingUsers.delete(user.id); }
}
