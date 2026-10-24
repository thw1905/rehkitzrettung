import { db } from "@/lib/db";

export type OperationDayMeetingPoint = {
  mode: "AUTO" | "MANUELL";
  text: string;
  autoText: string;
  manualText: string;
  sourceOrder: string | null;
};

/**
 * Gemeinsame Treffpunkt-Ermittlung für Planung, Push und Revierpächter-Mail.
 * Die automatisch maßgebliche Fläche ist der erste zugeteilte Auftrag nach
 * Teamsortierung, Auftragssortierung und stabiler Auftragsnummer.
 * Der erste Auftrag wird NICHT übersprungen, wenn dessen Treffpunkt fehlt.
 */
export async function getOperationDayMeetingPoint(
  operationDayId: string,
): Promise<OperationDayMeetingPoint> {
  const day = await db.operationDay.findUnique({
    where: { id: operationDayId },
    select: {
      meetingPointText: true,
      teams: {
        select: {
          team: { select: { sortOrder: true, name: true } },
          orders: {
            select: {
              id: true,
              sortOrder: true,
              orderCode: true,
              title: true,
              field: {
                select: {
                  name: true,
                  displayName: true,
                  locationLatitude: true,
                  locationLongitude: true,
                  locationNote: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!day) throw new Error("Einsatztag nicht gefunden.");

  const manualText = day.meetingPointText?.trim() || "";
  const orderedTeams = [...day.teams].sort((a, b) =>
    a.team.sortOrder - b.team.sortOrder || a.team.name.localeCompare(b.team.name, "de"),
  );
  const allOrders = orderedTeams.flatMap((team, index) =>
    team.orders.map((order) => ({ order, teamIndex: index })),
  );
  allOrders.sort((a, b) =>
    a.teamIndex - b.teamIndex ||
    a.order.sortOrder - b.order.sortOrder ||
    (a.order.orderCode || a.order.title).localeCompare(b.order.orderCode || b.order.title, "de") ||
    a.order.id.localeCompare(b.order.id),
  );

  const first = allOrders[0]?.order;
  const sourceOrder = first ? first.orderCode || first.title : null;
  let autoText = "";
  if (first?.field) {
    const field = first.field;
    const lat = field.locationLatitude;
    const lon = field.locationLongitude;
    const note = field.locationNote?.trim() || "";
    const label = field.displayName?.trim() || field.name.trim();
    if (typeof lat === "number" && typeof lon === "number" &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const latitude = lat.toFixed(6);
      const longitude = lon.toFixed(6);
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${latitude}%2C${longitude}`;
      autoText = `${note || `Treffpunkt der Fläche ${label}`}\nGPS: ${latitude}, ${longitude}\nKarte: ${mapLink}`;
    } else if (note) {
      autoText = `${note} (Fläche ${label})`;
    }
  }

  return {
    mode: manualText ? "MANUELL" : "AUTO",
    text: manualText || autoText,
    manualText,
    autoText,
    sourceOrder,
  };
}
