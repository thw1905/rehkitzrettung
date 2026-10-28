// DJI_AIRCRAFT_JSBRIDGE_V7: native DJI Pilot 2 SN recognition, without MQTT.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
function result(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers });
}
export async function POST(req: NextRequest) {
  // DJI_AIRCRAFT_ORIGIN_FIX_V7_2:
  // In production NextRequest.nextUrl.origin may resolve to an internal reverse-proxy
  // address, not the origin seen by DJI Pilot 2. Do not trust incoming forwarded
  // host headers here; only accept the explicitly configured public site origin.
  const origin = req.headers.get("origin");
  const expectedOrigin = process.env.NODE_ENV === "production"
    ? (process.env.DJI_AIRCRAFT_ALLOWED_ORIGIN || "https://kitzrettung-hegering-hittfeld.de").replace(/\/+$/, "")
    : req.nextUrl.origin;
  if (origin && origin !== expectedOrigin) {
    return result("Ungueltiger Ursprung.", 403);
  }
  const user = await getCurrentUserWithTeams();
  if (!user?.isApproved || (!user.isAdmin && user.role !== "PILOT")) {
    return result("Nicht berechtigt.", 403);
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return result("Ungueltiges JSON."); }
  const raw = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { serialNumber?: unknown }).serialNumber : null;
  const sn = typeof raw === "string" ? raw.trim() : "";
  if (!/^[A-Za-z0-9_-]{5,80}$/.test(sn)) return result("DJI-Seriennummer ungueltig.");

  let aircraft = await db.djiAircraft.findUnique({ where: { serialNumber: sn } });
  if (!aircraft) {
    // Identifikation per echter DJI-SN, Modell erst durch Topologie/OSD ermitteln.
    for (const label of [`DJI (${sn.slice(-8)})`, `DJI (${sn})`]) {
      try {
        aircraft = await db.djiAircraft.create({
          data: { label, model: "Noch nicht ermittelt", serialNumber: sn },
        });
        break;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) {
          console.error("DJI-SN-Erkennung: Datenbankfehler");
          return result("Drohne konnte nicht registriert werden.", 500);
        }
        // Gleichzeitige Anmeldung oder zufaellige identische Label-Endung.
        aircraft = await db.djiAircraft.findUnique({ where: { serialNumber: sn } });
        if (aircraft) break;
      }
    }
  }
  if (!aircraft) return result("Drohne konnte nicht registriert werden.", 409);
  if (!aircraft.isActive) return result("Diese Drohne ist in der Verwaltung deaktiviert.", 409);
  // Niemals Akku-SNs, Admin-Felder oder interne Geraetewerte an Piloten zurueckgeben.
  return NextResponse.json({ aircraft: { id: aircraft.id, label: aircraft.label } }, { headers });
}
