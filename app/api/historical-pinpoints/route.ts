export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const MAX_POINTS = 5000;

function getCurrentSeasonYear(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return month >= 8 ? year + 1 : year;
}

function toStart(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}

// Der Termin eines Auftrags wird einmalig nach einer festen Prioritaet bestimmt.
// So verwenden die Saisonliste und die PinPoint-Abfrage dieselbe Jahreszuordnung.
function dateRange(start: Date | undefined, end: Date) {
  const range = (start ? { gte: start, lt: end } : { lt: end });
  return {
    OR: [
      { executionDate: range },
      { executionDate: null, endTime: range },
      { executionDate: null, endTime: null, mowingDate: range },
      { executionDate: null, endTime: null, mowingDate: null, startTime: range },
      { executionDate: null, endTime: null, mowingDate: null, startTime: null, createdAt: range },
    ],
  };
}

function chosenDate(order: {
  executionDate: Date | null;
  endTime: Date | null;
  mowingDate: Date | null;
  startTime: Date | null;
  createdAt: Date;
}) {
  return order.executionDate ?? order.endTime ?? order.mowingDate ?? order.startTime ?? order.createdAt;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  if (!user.isAdmin && (!user.isApproved || !["PILOT", "SUCHER"].includes(user.role))) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const url = new URL(req.url);
  const fieldId = url.searchParams.get("fieldId")?.trim() || null;
  if (fieldId && (fieldId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(fieldId))) {
    return NextResponse.json({ error: "Ungültige Flächen-ID." }, { status: 400 });
  }

  const currentSeason = getCurrentSeasonYear();
  const yearInput = url.searchParams.get("season") || "all";
  const requestedSeason = yearInput === "all" ? null : Number(yearInput);
  if (
    requestedSeason !== null &&
    (!/^\d{4}$/.test(yearInput) || !Number.isInteger(requestedSeason) || requestedSeason < 2000 || requestedSeason >= currentSeason)
  ) {
    return NextResponse.json({ error: "Ungültige historische Saison." }, { status: 400 });
  }

  const commonOrderWhere = {
    status: "ERLEDIGT" as const,
    isDemo: false,
    ...(fieldId ? { fieldId } : {}),
  };

  try {
    const cutoff = toStart(currentSeason);
    const historicRange = dateRange(undefined, cutoff);
    // Die Saisonliste enthaelt nur Saisons mit abgeschlossenen Auftraegen und PinPoints.
    const ordersForSeasons = await db.order.findMany({
      where: {
        ...commonOrderWhere,
        ...historicRange,
        pinpoints: { some: {} },
      },
      select: {
        executionDate: true,
        endTime: true,
        mowingDate: true,
        startTime: true,
        createdAt: true,
      },
      take: 20001,
      orderBy: { createdAt: "desc" },
    });

    const seasons = [...new Set(ordersForSeasons.map((o) => chosenDate(o).getUTCFullYear()))]
      .filter((y) => y < currentSeason)
      .sort((a, b) => b - a);

    const requestedRange = requestedSeason === null
      ? historicRange
      : dateRange(toStart(requestedSeason), toStart(requestedSeason + 1));

    const pinpoints = await db.orderPinpoint.findMany({
      where: {
        order: { ...commonOrderWhere, ...requestedRange },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        sequenceNumber: true,
        status: true,
        rehkitzeGesichert: true,
        rehkitzeAbgesprungen: true,
        sonstigesWildGesichert: true,
        sonstigesWildAbgesprungen: true,
        maulwurfhuegelFehlstelle: true,
        order: {
          select: {
            orderCode: true,
            title: true,
            executionDate: true,
            endTime: true,
            mowingDate: true,
            startTime: true,
            createdAt: true,
            field: { select: { displayName: true, name: true } },
          },
        },
      },
      orderBy: { scannedAt: "desc" },
      take: MAX_POINTS + 1,
    });

    const truncated = pinpoints.length > MAX_POINTS || ordersForSeasons.length > 20000;
    const items = pinpoints.slice(0, MAX_POINTS)
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
      .map((p) => {
        const date = chosenDate(p.order);
        return {
          id: p.id,
          latitude: p.latitude,
          longitude: p.longitude,
          sequenceNumber: p.sequenceNumber,
          status: p.status,
          date: date.toISOString().slice(0, 10),
          season: date.getUTCFullYear(),
          orderLabel: p.order.orderCode || p.order.title,
          fieldLabel: p.order.field.displayName || p.order.field.name,
          rehkitzeGesichert: p.rehkitzeGesichert,
          rehkitzeAbgesprungen: p.rehkitzeAbgesprungen,
          sonstigesWildGesichert: p.sonstigesWildGesichert,
          sonstigesWildAbgesprungen: p.sonstigesWildAbgesprungen,
          maulwurfhuegelFehlstelle: p.maulwurfhuegelFehlstelle,
        };
      });
    return NextResponse.json({ items, seasons, truncated, currentSeason }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("Historische PinPoints laden:", err);
    return NextResponse.json({ error: "Historische PinPoints konnten nicht geladen werden." }, { status: 500 });
  }
}
