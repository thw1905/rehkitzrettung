export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getFlightDayOverview, parseFlightDate, sendFlightCertificate } from "@/lib/flight-certificates";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({error:auth.message},{status:auth.status});
  try {
    const date = new URL(req.url).searchParams.get("date") || "";
    parseFlightDate(date);
    return NextResponse.json({date,items:await getFlightDayOverview(date)});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Abfrage fehlgeschlagen."},{status:400});
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return NextResponse.json({error:auth.message},{status:auth.status});
  try {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
      if (new URL(origin).host !== host) return NextResponse.json({error:"Ungültiger Aufrufursprung."},{status:403});
    }
    const body = await req.json();
    const ownerId = typeof body?.ownerId==="string"?body.ownerId:"";
    const date = typeof body?.date==="string"?body.date:"";
    if (!ownerId || ownerId.length>100) throw new Error("Landwirt fehlt.");
    parseFlightDate(date);
    if (body?.action!=="send") throw new Error("Unbekannte Aktion.");
    const result = await sendFlightCertificate(ownerId,date,true,body?.force===true);
    if (result.status === "ERROR") return NextResponse.json({error:result.error||"Versand fehlgeschlagen.",result},{status:502});
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Versand fehlgeschlagen."},{status:400});
  }
}
