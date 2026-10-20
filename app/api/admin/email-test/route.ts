export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { sendMail } from "@/lib/mail";

// Kleiner Schutz gegen versehentlich mehrfaches Absenden.
// Gilt pro laufendem Node-Prozess. Admin-Rechte werden bei JEDEM Aufruf geprueft.
const lastSuccessfulSend = new Map<string, number>();
const sending = new Set<string>();
const COOLDOWN_MS = 20_000;

function mailErrorMessage(error: unknown): { message: string; code: string; smtpCode?: number } {
  const issue = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof issue?.code === "string" ? issue.code : "SMTP_ERROR";
  const smtpCode = typeof issue?.responseCode === "number" ? issue.responseCode : undefined;

  if (code === "EAUTH" || smtpCode === 535 || smtpCode === 534) {
    return { message: "SMTP-Anmeldung fehlgeschlagen. Bitte SMTP_USER und SMTP_PASS pruefen.", code, smtpCode };
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return { message: "Keine Verbindung zum Mailserver. Bitte SMTP_HOST, SMTP_PORT, TLS und die Firewall pruefen.", code, smtpCode };
  }
  if (code === "EENVELOPE" || smtpCode === 550 || smtpCode === 553 || smtpCode === 554) {
    return { message: "Der Mailserver hat Empfaenger oder Absender abgelehnt. Bitte E-Mail-Adresse und SMTP_FROM pruefen.", code, smtpCode };
  }
  if (smtpCode && smtpCode >= 400) {
    return { message: `Der Mailserver hat die Nachricht mit SMTP-Status ${smtpCode} abgelehnt. Weitere Details stehen im Serverlog.`, code, smtpCode };
  }
  return { message: "E-Mail konnte nicht versendet werden. Bitte das Serverlog fuer die genaue Ursache pruefen.", code, smtpCode };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Bitte anmelden." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });

  // Der Browser muss von derselben Website aus senden (Schutz vor fremden Webseiten).
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
      if (new URL(origin).host !== requestHost) {
        return NextResponse.json({ error: "Ungueltiger Aufrufursprung." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Ungueltiger Aufrufursprung." }, { status: 403 });
    }
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bitte eine E-Mail-Adresse eingeben." }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
    return NextResponse.json({ error: "Bitte eine gueltige einzelne E-Mail-Adresse eingeben." }, { status: 400 });
  }

  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    return NextResponse.json({ error: `Der E-Mail-Versand ist nicht vollstaendig eingerichtet. Fehlend: ${missing.join(", ")}.` }, { status: 503 });
  }

  if (sending.has(user.id)) {
    return NextResponse.json({ error: "Eine Testmail wird gerade versendet. Bitte kurz warten." }, { status: 429 });
  }
  const lastSentAt = lastSuccessfulSend.get(user.id) || 0;
  const remainingSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);
  if (remainingSeconds > 0) {
    return NextResponse.json({ error: `Bitte noch ${remainingSeconds} Sekunden bis zur naechsten Testmail warten.` }, { status: 429 });
  }

  sending.add(user.id);
  const startedAt = Date.now();
  try {
    const at = new Date();
    const timestamp = at.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "medium" });
    await sendMail({
      to: email,
      subject: "Rehkitzrettung - E-Mail-Versandtest",
      text: `Dies ist eine Test-E-Mail aus der Rehkitzrettung-Anwendung.\n\nTestzeitpunkt: ${timestamp} (Deutschland)\nEmpfaenger: ${email}\n\nWenn du diese Nachricht erhalten hast, funktioniert der E-Mail-Versand.`,
    });
    lastSuccessfulSend.set(user.id, Date.now());
    return NextResponse.json({
      ok: true,
      message: "Der Mailserver hat die Testmail angenommen. Bitte Posteingang und Spamordner pruefen.",
      email,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    // Detaillierte technische Fehlermeldung nur im Serverlog.
    console.error("Admin E-Mail-Test fehlgeschlagen:", error);
    const details = mailErrorMessage(error);
    return NextResponse.json({ error: details.message, errorCode: details.code, smtpCode: details.smtpCode }, { status: 502 });
  } finally {
    sending.delete(user.id);
  }
}
