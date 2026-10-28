// DJI_BATTERY_GLOBAL_V8: cycle-based pilot recommendation on all pages.
// No battery serial numbers or administrative fields are returned to pilots.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function germanDay(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user?.isApproved || (!user.isAdmin && user.role !== "PILOT")) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403, headers });
  }
  try {
    const aircraft = await db.djiAircraft.findMany({
      where: { isActive: true }, orderBy: { label: "asc" },
      select: {
        id: true, label: true,
        batteries: {
          where: { status: "ACTIVE", labelNumber: { not: null } },
          select: { id: true, labelNumber: true, cycles: true, lastSeenAt: true },
        },
      },
    });
    // Auto-created DJI labels may contain serial-number fragments. Mask them for pilots.
    const drones = aircraft.map(({ id, label }, index) => ({
      id,
      label: /^DJI(?: [A-Za-z0-9-]+)? \([A-Za-z0-9_-]{8,}\)$/.test(label)
        ? `Drohne ${index + 1} (${label.replace(/ \(.+\)$/, "")})` : label,
    }));
    const requested = req.nextUrl.searchParams.get("aircraftId") ?? "";
    const selected = aircraft.find((a) => a.id === requested) ??
      (!requested && aircraft.length === 1 ? aircraft[0] : null);
    if (!selected) {
      return NextResponse.json({
        drones, aircraftId: null, aircraftLabel: null, currentNumber: null,
        nextNumber: null, phase: "SELECT_AIRCRAFT", remaining: 0,
      }, { headers });
    }

    const now = new Date();
    const today = germanDay(now);
    // Two days comfortably cover a complete Europe/Berlin calendar day, including DST changes.
    const records = await db.djiBatteryUsage.findMany({
      where: { aircraftId: selected.id, startedAt: { gte: new Date(now.getTime() - 48 * 3600_000) } },
      select: { batteryId: true, startedAt: true },
    });
    const usedToday = new Set(records.filter((r) => germanDay(r.startedAt) === today).map((r) => r.batteryId));
    const current = selected.batteries
      .filter((b) => b.lastSeenAt !== null && now.getTime() - b.lastSeenAt.getTime() >= 0 && now.getTime() - b.lastSeenAt.getTime() < 4 * 60_000)
      .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];

    const eligible = selected.batteries
      .filter((b) => b.cycles !== null && b.cycles >= 0 && !usedToday.has(b.id) && b.id !== current?.id)
      .sort((a, b) => (a.cycles ?? 0) - (b.cycles ?? 0)
        || (a.lastSeenAt?.getTime() ?? 0) - (b.lastSeenAt?.getTime() ?? 0)
        || (a.labelNumber ?? 0) - (b.labelNumber ?? 0));
    const next = eligible[0];
    const phase = usedToday.size > 0 || current ? "NEXT_CHANGE" : "FIRST_START";
    const missingData = selected.batteries.some((b) => b.cycles === null);
    const hasBatteries = selected.batteries.length > 0;
    return NextResponse.json({
      drones, aircraftId: selected.id, aircraftLabel: drones.find((d) => d.id === selected.id)?.label ?? "Drohne",
      currentNumber: current?.labelNumber ?? null,
      nextNumber: next?.labelNumber ?? null,
      phase, remaining: eligible.length,
      reason: !next ? (!hasBatteries ? "Keine nummerierten Akkus erfasst."
        : missingData ? "Bei vorhandenen Akkus fehlen noch Ladezyklen."
        : "Kein weiterer heute unbenutzter Akku bekannt.") : null,
    }, { headers });
  } catch (error) {
    console.error("DJI Akkuempfehlung V8: Datenbankabfrage fehlgeschlagen", error instanceof Error ? error.message : "Fehler");
    return NextResponse.json({ error: "Akkuempfehlung momentan nicht verfuegbar." }, { status: 503, headers });
  }
}
