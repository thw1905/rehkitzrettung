// DJI_AKKU_V4: Piloten sehen nur Fluggeraet-Bezeichnung und empfohlene Akkunummer.
// Keine Seriennummern, Zyklen, Temperaturen oder Bestandsverwaltung fuer Piloten.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user || !user.isApproved || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }
  const aircraftId = req.nextUrl.searchParams.get("aircraftId") || "";
  const drones = await db.djiAircraft.findMany({
    where: { isActive: true }, orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
  if (!aircraftId) return NextResponse.json({ aircraft: drones, recommendation: null }, { headers });
  if (!drones.some((drone) => drone.id === aircraftId)) {
    return NextResponse.json({ error: "Drohne ist nicht verfuegbar." }, { status: 404, headers });
  }
  // Keine Einsatz- oder Pilotendauerzuordnung: Der Pilot waehlt das HEUTE verwendete Geraet.
  // Ladezustand ist nur eine Momentaufnahme; vor dem Start immer physisch pruefen.
  const batteries = await db.djiBattery.findMany({
    where: {
      aircraftId, status: "ACTIVE", labelNumber: { not: null },
      capacityPercent: { gte: 85 }, cycles: { not: null }, serialNumber: { not: null },
      lastSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { labelNumber: true, cycles: true, lastSeenAt: true },
  });
  batteries.sort((a, b) => (a.cycles ?? Infinity) - (b.cycles ?? Infinity) ||
    (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));
  const number = batteries[0]?.labelNumber ?? null;
  return NextResponse.json({
    aircraft: drones,
    recommendation: number == null
      ? { number: null, note: "Kein ausreichend aktueller Akku-Ladestand bekannt. Akkus vor Ort pruefen." }
      : { number, note: "Vorschlag anhand gemeldeter Ladezyklen und letztem Ladestand. Akku vor Gebrauch pruefen." },
  }, { headers });
}
