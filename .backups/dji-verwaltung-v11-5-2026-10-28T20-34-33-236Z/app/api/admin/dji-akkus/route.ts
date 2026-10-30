import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

// DJI_AKKUVERWALTUNG_V1: unabhaengige Admin-Verwaltung des Geraetebestands.
type Payload = Record<string, unknown>;
function field(input: Payload, key: string, maxLength = 128): string {
  const value = input[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function optionalSerial(value: string): string | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{5,80}$/.test(value)) throw new Error("Seriennummer: 5 bis 80 Zeichen (Buchstaben, Ziffern, _ oder -).");
  return value;
}
function labelNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("Akkunummer muss zwischen 1 und 99 liegen.");
  return n;
}
async function adminAllowed() {
  const user = await getCurrentUserWithTeams();
  return Boolean(user?.isAdmin && user.isApproved);
}
const noCache = { "Cache-Control": "no-store" };
function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: noCache });
}

export async function GET() {
  if (!(await adminAllowed())) return fail("Nur fuer Administratoren.", 403);
  const aircraft = await db.djiAircraft.findMany({
    orderBy: { label: "asc" },
    include: {
      batteries: { orderBy: [{ labelNumber: "asc" }, { createdAt: "asc" }] },
    },
  });
  return NextResponse.json({ aircraft }, { headers: noCache });
}

export async function POST(req: NextRequest) {
  if (!(await adminAllowed())) return fail("Nur fuer Administratoren.", 403);
  let input: Payload;
  try {
    const data: unknown = await req.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail("Ungueltige Eingabe.");
    input = data as Payload;
  } catch { return fail("Ungueltiges JSON."); }

  try {
    const action = field(input, "action", 40);
    if (action === "create-aircraft") {
      const label = field(input, "label", 64);
      const model = field(input, "model", 64);
      const serialNumber = optionalSerial(field(input, "serialNumber", 80));
      const batteryCount = Number(input.batteryCount ?? 0);
      if (!Number.isInteger(batteryCount) || batteryCount < 0 || batteryCount > 20) return fail("Akkuanzahl muss zwischen 0 und 20 liegen.");
      if (!label || !model) return fail("Drohnenbezeichnung und Modell fehlen.");
      const created = await db.djiAircraft.create({
        data: {
          label, model, serialNumber,
          batteries: { create: Array.from({ length: batteryCount }, (_, i) => ({ labelNumber: i + 1, lastLabelNumber: i + 1 })) },
        },
      });
      return NextResponse.json({ success: true, id: created.id }, { headers: noCache });
    }
    if (action === "register-battery") {
      const aircraftId = field(input, "aircraftId");
      const number = labelNumber(input.labelNumber);
      const serialNumber = optionalSerial(field(input, "serialNumber", 80));
      const aircraft = await db.djiAircraft.findUnique({ where: { id: aircraftId }, select: { isActive: true } });
      if (!aircraft?.isActive) return fail("Drohne nicht vorhanden oder inaktiv.");
      const created = await db.djiBattery.create({
        data: { aircraftId, labelNumber: number, lastLabelNumber: number, serialNumber },
      });
      return NextResponse.json({ success: true, id: created.id }, { headers: noCache });
    }
    // DJI_AUTOERKENNUNG_V5: die physische Nummer eines automatisch gelesenen Akkus zuordnen.
    if (action === "set-label") {
      const batteryId = field(input, "batteryId");
      const number = labelNumber(input.labelNumber);
      const battery = await db.djiBattery.findUnique({ where: { id: batteryId } });
      if (!battery || battery.status === "RETIRED" || !battery.serialNumber) {
        return fail("Akku nicht gefunden, ausgemustert oder noch nicht automatisch erkannt.", 409);
      }
      if (battery.labelNumber != null) return fail("Akku ist bereits nummeriert.", 409);
      await db.djiBattery.update({ where: { id: battery.id }, data: { labelNumber: number, lastLabelNumber: number } });
      return NextResponse.json({ success: true }, { headers: noCache });
    }
    if (action === "assign-serial") {
      const batteryId = field(input, "batteryId");
      const serialNumber = optionalSerial(field(input, "serialNumber", 80));
      if (!serialNumber) return fail("Seriennummer fehlt.");
      const current = await db.djiBattery.findUnique({ where: { id: batteryId } });
      if (!current || current.status === "RETIRED") return fail("Akku nicht vorhanden oder ausgemustert.");
      if (current.serialNumber && current.serialNumber !== serialNumber) {
        return fail("Dieser Akku ist bereits mit einer anderen Seriennummer verknuepft. Bitte erst klaeren, ob ein Akkuwechsel stattgefunden hat.", 409);
      }
      await db.djiBattery.update({ where: { id: batteryId }, data: { serialNumber } });
      return NextResponse.json({ success: true }, { headers: noCache });
    }
    if (action === "set-blocked") {
      const batteryId = field(input, "batteryId");
      const blocked = input.blocked === true;
      const current = await db.djiBattery.findUnique({ where: { id: batteryId } });
      if (!current || current.status === "RETIRED") return fail("Akku nicht vorhanden oder ausgemustert.");
      await db.djiBattery.update({ where: { id: batteryId }, data: { status: blocked ? "BLOCKED" : "ACTIVE" } });
      return NextResponse.json({ success: true }, { headers: noCache });
    }
    if (action === "retire-battery") {
      const batteryId = field(input, "batteryId");
      const current = await db.djiBattery.findUnique({ where: { id: batteryId } });
      if (!current || current.status === "RETIRED") return fail("Akku nicht vorhanden oder bereits ausgemustert.");
      await db.djiBattery.update({
        where: { id: batteryId },
        data: { status: "RETIRED", retiredAt: new Date(), lastLabelNumber: current.labelNumber, labelNumber: null },
      });
      return NextResponse.json({ success: true }, { headers: noCache });
    }
    return fail("Unbekannte Aktion.");
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") return fail("Bezeichnung, Akkunummer oder Seriennummer ist bereits vergeben.", 409);
      if (code === "P2003") return fail("Verknuepfte Drohne oder Akku nicht vorhanden.", 409);
      if (code === "P2025") return fail("Eintrag wurde nicht gefunden.", 404);
    }
    if (error instanceof Error && /Seriennummer|Akkunummer/.test(error.message)) return fail(error.message);
    console.error("DJI battery inventory error:", error);
    return fail("Speichern fehlgeschlagen.", 500);
  }
}
