import { db } from "@/lib/db";

export type TeamMeetingPoint = {
  operationDayTeamId: string;
  teamName: string;
  sourceOrder: string | null;
  mode: "AUTO" | "MANUELL";
  text: string;
  autoText: string;
  manualText: string;
};

export function formatFieldMeetingPoint(field: {
  name: string;
  displayName?: string | null;
  locationNote?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}): string {
  const note = field.locationNote?.trim() || "";
  const label = field.displayName?.trim() || field.name;
  const lat = field.locationLatitude;
  const lon = field.locationLongitude;
  if (typeof lat === "number" && typeof lon === "number" &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    const coords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    const link = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
    return `${note || `Treffpunkt der Fläche ${label}`}\nGPS: ${coords}\nKarte: ${link}`;
  }
  return note ? `${note} (Fläche ${label})` : "";
}

/** Pro Tages-Team genau ein Treffpunkt. Erstauftrag ist der nach sortOrder erste. */
export async function getTeamMeetingPointsByDay(operationDayId: string): Promise<TeamMeetingPoint[]> {
  const teams = await db.operationDayTeam.findMany({
    where: { operationDayId },
    include: {
      team: { select: { name: true, sortOrder: true } },
      orders: {
        select: {
          id: true, sortOrder: true, orderCode: true, title: true,
          field: { select: {
            name: true, displayName: true, locationNote: true,
            locationLatitude: true, locationLongitude: true,
          } },
        },
      },
    },
  });
  return teams.sort((a,b) => a.team.sortOrder - b.team.sortOrder || a.team.name.localeCompare(b.team.name,"de"))
    .map(team => {
      const first = [...team.orders].sort((a,b) =>
        a.sortOrder - b.sortOrder ||
        (a.orderCode || a.title).localeCompare(b.orderCode || b.title,"de") ||
        a.id.localeCompare(b.id))[0];
      const manualText = team.meetingPointText?.trim() || "";
      const autoText = first ? formatFieldMeetingPoint(first.field) : "";
      return {
        operationDayTeamId: team.id,
        teamName: team.team.name,
        sourceOrder: first ? (first.orderCode || first.title) : null,
        mode: manualText ? "MANUELL" as const : "AUTO" as const,
        text: manualText || autoText,
        autoText,
        manualText,
      };
    });
}
