export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { optimizeTeamRoadRoute } from "@/lib/team-routes/road-routing";

type OrderWithField = {
  field: { locationLatitude: number | null; locationLongitude: number | null } | null;
};

function hasValidGps(order: OrderWithField): boolean {
  const lat = order.field?.locationLatitude;
  const lon = order.field?.locationLongitude;
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180
  );
}

/**
 * Setzt die Reihenfolge eines einzelnen Tages-Teams neu.
 * Der erste Auftrag bleibt fest, alle GPS-verfügbaren Folgeaufträge
 * werden auf Basis der Straßen-Fahrzeiten sortiert. Fehlende GPS-Aufträge
 * kommen stabil ans Ende; sie werden NIE stillschweigend übersprungen.
 * Die Teammeldungen und Teamtreffpunkte werden bewusst nicht geändert.
 */
export async function POST(req: NextRequest) {
  const check = await requireAdminApi();
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: check.status });
  }

  try {
    const body = await req.json();
    const teamId = String(body?.operationDayTeamId || "");
    const firstId = body?.firstOrderId == null ? null : String(body.firstOrderId);
    if (!teamId) {
      return NextResponse.json({ error: "Tages-Team fehlt." }, { status: 400 });
    }

    const team = await db.operationDayTeam.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        orders: {
          select: {
            id: true, sortOrder: true, orderCode: true, title: true,
            field: { select: { locationLatitude: true, locationLongitude: true } },
          },
        },
      },
    });
    if (!team) {
      return NextResponse.json({ error: "Tages-Team nicht gefunden." }, { status: 404 });
    }

    const orders = [...team.orders].sort(
      (a, b) => a.sortOrder - b.sortOrder ||
        (a.orderCode || a.title).localeCompare(b.orderCode || b.title, "de") ||
        a.id.localeCompare(b.id)
    );
    if (firstId) {
      const idx = orders.findIndex((o) => o.id === firstId);
      if (idx < 0) {
        return NextResponse.json({ error: "Startauftrag gehört nicht zu diesem Team." }, { status: 400 });
      }
      orders.unshift(orders.splice(idx, 1)[0]);
    }

    if (orders.length > 1 && !hasValidGps(orders[0])) {
      return NextResponse.json({
        error: "Der erste Auftrag hat keine gültigen GPS-Koordinaten. Bitte zuerst den Flächentreffpunkt eintragen.",
      }, { status: 422 });
    }

    const validOrders = orders.filter(hasValidGps);
    const missingOrders = orders.filter((order) => !hasValidGps(order));
    const missingCoordinates = missingOrders.map((order) => order.id);
    const optimized = await optimizeTeamRoadRoute(validOrders.map((o) => ({
      id: o.id,
      latitude: o.field!.locationLatitude!,
      longitude: o.field!.locationLongitude!,
    })));
    const orderedIds = [...optimized.orderedIds, ...missingCoordinates];
    // Bei nur einem GPS-Auftrag wurde keine Straßenmatrix abgefragt.
    const routeMode = orders.length > 1 && validOrders.length < 2
      ? "luftlinie"
      : optimized.mode;

    // Nur Aufträge dieses Tages-Teams erhalten eine neue sortOrder.
    // Das Verhalten entspricht der bereits installierten Teamrouten-API.
    await db.$transaction(orderedIds.map((id, index) =>
      db.order.update({ where: { id }, data: { sortOrder: index + 1 } })
    ));

    const warnings: string[] = [];
    if (optimized.warning) warnings.push(optimized.warning);
    if (missingCoordinates.length) {
      warnings.push(`${missingCoordinates.length} Auftrag/Aufträge ohne gültige GPS-Koordinaten am Ende eingeordnet. Für diese Teilstrecke gibt es keine Straßenkilometer oder Fahrzeit.`);
    }

    return NextResponse.json({
      success: true,
      orderIds: orderedIds,
      routeMode,
      distanceKm: validOrders.length ? optimized.totalDistanceKm : null,
      durationMinutes: validOrders.length > 1 ? optimized.totalDurationMinutes : null,
      legs: optimized.legs,
      missingCoordinates,
      warning: warnings.length ? warnings.join(" ") : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Straßenroutenoptimierung:", error);
    return NextResponse.json({ error: "Auftragsroute konnte nicht optimiert werden." }, { status: 500 });
  }
}
