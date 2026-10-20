export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { requireAdminApi } from "@/lib/admin";
import {
  renderFlightPdf,
  type FlightCertificateData,
} from "@/lib/flight-certificates";

// Reine Musterdaten; keine DB-Abfrage, kein E-Mail-Versand.
// Die PDF-Erzeugung entspricht exakt der Erzeugung echter Nachweise.
function exampleData(): FlightCertificateData {
  return {
    version: 1,
    ownerId: "MUSTER-LANDWIRT",
    ownerName: "Max Mustermann",
    ownerAddress: "Musterweg 12, 21218 Musterort",
    ownerEmail: null,
    date: "2026-05-20",
    createdAt: "2026-05-20T12:00:00.000Z",
    areas: [
      {
        orderId: "MUSTER-AUFTRAG-1",
        orderCode: "2026-0018",
        field: "Nordwiese · Fläche 017",
        hectares: 3.42,
        started: "05:40",
        ended: "06:03",
        pilot: "Peter Beispiel",
        counts: {
          rehkitzeGesichert: 0,
          rehkitzeAbgesprungen: 0,
          sonstigesWildGesichert: 0,
          sonstigesWildAbgesprungen: 0,
          maulwurfhuegelFehlstelle: 0,
        },
      },
      {
        orderId: "MUSTER-AUFTRAG-2",
        orderCode: "2026-0019",
        field: "Hofwiese · Fläche 018",
        hectares: 2.15,
        started: "06:15",
        ended: "06:32",
        pilot: "Peter Beispiel",
        counts: {
          rehkitzeGesichert: 1,
          rehkitzeAbgesprungen: 0,
          sonstigesWildGesichert: 0,
          sonstigesWildAbgesprungen: 0,
          maulwurfhuegelFehlstelle: 0,
        },
      },
    ],
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const data = exampleData();
    const bytes = await renderFlightPdf(data);
    const document = await PDFDocument.load(bytes);
    const font = await document.embedFont(StandardFonts.HelveticaBold);

    for (const page of document.getPages()) {
      const { width, height } = page.getSize();
      // Sichtbares Musterkennzeichen; ohne echten Landwirt / Einsatzdaten.
      page.drawText("MUSTER", {
        x: width * 0.21,
        y: height * 0.38,
        size: 78,
        font,
        rotate: degrees(34),
        color: rgb(0.75, 0.12, 0.12),
        opacity: 0.13,
      });
      page.drawText("MUSTER - keine echte Flaechenabsuche", {
        x: 46,
        y: 14,
        size: 8,
        font,
        color: rgb(0.68, 0.12, 0.12),
      });
    }

    const disposition = new URL(req.url).searchParams.get("download") === "1"
      ? "attachment"
      : "inline";
    return new NextResponse(new Uint8Array(await document.save()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="Befliegungsnachweis_MUSTER.pdf"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Befliegungsnachweis-Muster:", error);
    return NextResponse.json(
      { error: "Der Muster-Nachweis konnte nicht erzeugt werden." },
      { status: 500 },
    );
  }
}
