import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDjiMapPoint } from "@/lib/dji/normalize";
import { pointInArea } from "@/lib/dji/point-matching";

type ReceiveOptions = {
  workspaceId: string;
  groupId: string;
  pilotUserId: string;
  /** Technischer Team-Anker, keine automatische Auftragszuordnung. */
  orderId: string;
  element: unknown;
  allowImport: boolean;
  /** Nur der echte DJI-Empfang nutzt die GPS-Zuordnung zu Teamauftraegen. */
  matchByTeam?: boolean;
};

const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const MAX_RETRIES = 5;

/** DJI_AUTO_TEAM_MATCH_V5: Element eindeutig speichern, Zielauftrag anhand seiner Flaeche ermitteln. */
export async function receiveDjiMapElement(options: ReceiveOptions) {
  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport, matchByTeam = false } = options;
  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {
    throw new Error("Ungueltige DJI-Zuordnung.");
  }
  const parsed = parseDjiMapPoint(element);
  if (!parsed) throw new Error("Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).");
  const payload = element as { resource: unknown };
  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;
  const where = { workspaceId_elementId: { workspaceId, elementId: parsed.elementId } };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const previous = await tx.djiMapElement.findUnique({ where });
        const duplicate = previous !== null;
        const record = previous ?? await tx.djiMapElement.create({
          data: {
            workspaceId, groupId, elementId: parsed.elementId,
            pilotUserId, orderId, name: parsed.name,
            latitude: parsed.latitude, longitude: parsed.longitude,
            resource, status: "PENDING",
          },
        });
        // Bekannte DJI-ID nicht stillschweigend einem anderen Piloten/Layer zuweisen.
        if (record.groupId !== groupId || record.pilotUserId !== pilotUserId ||
            (!matchByTeam && record.orderId !== orderId)) {
          return { duplicate: true, status: record.status, pinpointId: record.pinpointId, elementId: record.elementId };
        }
        if (!allowImport || record.status !== "PENDING" || record.pinpointId) {
          return { duplicate, status: record.status, pinpointId: record.pinpointId, elementId: record.elementId };
        }

        // Vorhandene PENDING-Punkte koennen nach erneuter Zustellung importiert werden.
        // Der in der DJI-Sitzung gespeicherte Auftrag dient NUR als Team-Anker.
        const anchor = await tx.order.findUnique({
          where: { id: record.orderId },
          select: { id: true, status: true, operationDayTeamId: true,
            operationDayTeam: { select: { pilotId: true } } },
        });
        if (!anchor) {
          return { duplicate, status: "PENDING", pinpointId: null, elementId: record.elementId };
        }

        let targetOrderId: string | null = null;
        if (matchByTeam) {
          // Verhindert, dass alte DJI-Punkte nach Teamwechsel fremden Teams zugeordnet werden.
          const activeAnchor = await tx.order.findUnique({
            where: { id: orderId },
            select: { operationDayTeamId: true,
              operationDayTeam: { select: { pilotId: true } } },
          });
          if (!anchor.operationDayTeamId ||
              anchor.operationDayTeam?.pilotId !== pilotUserId ||
              !activeAnchor ||
              activeAnchor.operationDayTeamId !== anchor.operationDayTeamId ||
              activeAnchor.operationDayTeam?.pilotId !== pilotUserId) {
            return { duplicate, status: "PENDING", pinpointId: null, elementId: record.elementId };
          }
          const teamOrders = await tx.order.findMany({
            where: {
              operationDayTeamId: anchor.operationDayTeamId,
              status: { in: ["OFFEN", "IN_ARBEIT"] },
            },
            select: { id: true, field: { select: { areaGeoJson: true } } },
          });
          const matches = teamOrders.filter((candidate) =>
            candidate.field && pointInArea(record.longitude, record.latitude, candidate.field.areaGeoJson)
          );
          // Ein Punkt kann auch ausserhalb oder in mehreren Flaechen liegen: dann NICHT raten.
          if (matches.length === 1) targetOrderId = matches[0].id;
        } else {
          // Bestehendes Verhalten fuer den gesonderten Admin-Testimport beibehalten.
          const pilot = await tx.user.findUnique({
            where: { id: pilotUserId }, select: { isAdmin: true },
          });
          if (anchor.status !== "ERLEDIGT" &&
              (pilot?.isAdmin || anchor.operationDayTeam?.pilotId === pilotUserId)) {
            targetOrderId = anchor.id;
          }
        }
        if (!targetOrderId) {
          return { duplicate, status: "PENDING", pinpointId: null, elementId: record.elementId };
        }

        const last = await tx.orderPinpoint.findFirst({
          where: { orderId: targetOrderId },
          orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
          select: { sequenceNumber: true },
        });
        const pinpoint = await tx.orderPinpoint.create({
          data: {
            orderId: targetOrderId,
            latitude: record.latitude, longitude: record.longitude,
            rawQrText: `DJI:${record.workspaceId}:${record.elementId}`,
            sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
            status: "OFFEN",
          },
        });
        await tx.djiMapElement.update({
          where: { id: record.id },
          data: { pinpointId: pinpoint.id, status: "IMPORTED" },
        });
        return { duplicate, status: "IMPORTED", pinpointId: pinpoint.id, elementId: record.elementId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // Gleichzeitige DJI-Nachrichten und konkurrierende laufende Nummern.
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");
      if (retryable && attempt + 1 < MAX_RETRIES) continue;
      throw error;
    }
  }
  throw new Error("DJI-Import konnte nach mehreren Versuchen nicht abgeschlossen werden.");
}
