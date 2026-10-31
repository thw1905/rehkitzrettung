export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { generateOwnerFieldMapPdf } from "@/lib/owner-field-map-pdf";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("ownerId") || "";
  if (!id || id.length > 128) return NextResponse.json({ error: "Landwirt fehlt." }, { status: 400 });
  try {
    const result = await generateOwnerFieldMapPdf(id);
    const body = new Uint8Array(result.bytes.length);
    body.set(result.bytes);
    return new NextResponse(body.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Landwirt-Karten-PDF:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF konnte nicht erstellt werden." }, { status: 500 });
  }
}
