export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import {
  parseFlightDate, makeFlightPayload, isFlightCertificateData,
  renderFlightPdf, flightFilename,
} from "@/lib/flight-certificates";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({error:auth.message},{status:auth.status});
  try {
    const query=new URL(req.url).searchParams;
    const ownerId=query.get("ownerId") || "";
    const date=query.get("date") || "";
    if (!ownerId || ownerId.length>100) throw new Error("Landwirt fehlt.");
    const dateObject=parseFlightDate(date);
    const dispatched=await db.flightCertificateDispatch.findUnique({where:{ownerId_date:{ownerId,date:dateObject}}});
    // Nach einem Versand wird der versendete Stand und nicht eine spaetere
    // Korrektur der Einsatzdaten fuer den Ausdruck benutzt.
    const payload=dispatched?.status==="SENT" && isFlightCertificateData(dispatched.payload)
      ? dispatched.payload
      : await makeFlightPayload(ownerId,date);
    const bytes=await renderFlightPdf(payload);
    const disposition=query.get("download")==="1"?"attachment":"inline";
    return new NextResponse(new Uint8Array(bytes),{
      headers:{
        "Content-Type":"application/pdf",
        "Content-Disposition":`${disposition}; filename="${flightFilename(payload)}"`,
        "Cache-Control":"no-store, private",
        "X-Content-Type-Options":"nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"PDF konnte nicht erstellt werden."},{status:400});
  }
}
