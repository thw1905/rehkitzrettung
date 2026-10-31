export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { generateOwnerFieldMapPdf } from "@/lib/owner-field-map-pdf";
import { sendMail } from "@/lib/mail";

const lastSent = new Map<string, number>();
const inflight = new Set<string>();

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host); }
  catch { return false; }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Nur Administratoren dürfen Flächenkarten per E-Mail versenden." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Ungültiger Aufrufursprung." }, { status: 403 });
  let body: { ownerId?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 }); }
  const ownerId = typeof body.ownerId === "string" ? body.ownerId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!ownerId || ownerId.length > 128) return NextResponse.json({ error: "Landwirt fehlt." }, { status: 400 });
  if (email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) {
    return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  }
  if (inflight.has(user.id) || Date.now() - (lastSent.get(user.id) || 0) < 15000) {
    return NextResponse.json({ error: "Bitte vor einem erneuten Versand kurz warten." }, { status: 429 });
  }
  inflight.add(user.id);
  try {
    const result = await generateOwnerFieldMapPdf(ownerId);
    await sendMail({
      to: email,
      subject: `Rehkitzrettung Hegering Hittfeld - Flächenkarte ${result.name}`,
      text: `Hallo,\n\nanbei erhältst du die aktuelle Flächenkarte mit den FL-Nummern deiner Flächen und den Treffpunkten als PDF.\n\nViele Grüße\nRehkitzrettung Hegering Hittfeld`,
      attachments: [{ filename: result.filename, content: Buffer.from(result.bytes), contentType: "application/pdf" }],
    });
    lastSent.set(user.id, Date.now());
    return NextResponse.json({ ok: true, message: `E-Mail an ${email} vom Mailserver angenommen.` });
  } catch (error) {
    console.error("Landwirt-Karten-Versand:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "E-Mail konnte nicht gesendet werden." }, { status: 500 });
  } finally { inflight.delete(user.id); }
}
