import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDjiMapPoint } from "@/lib/dji/normalize";

type ReceiveOptions = {
  workspaceId: string;
  groupId: string;
  pilotUserId: string;
  orderId: string;
  element: unknown;
  allowImport: boolean;
};

const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const MAX_RETRIES = 5;

/**
 * DJI_PENDING_RETRY_V3
 * Store-first, eindeutige DJI-Element-ID pro Workspace.
 * Ein PENDING-Punkt darf beim erneuten Empfang importiert werden.
 * Eine gespeicherte Zuordnung wird niemals stillschweigend geaendert.
 */
export async function receiveDjiMapElement(options: ReceiveOptions) {
  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport } = options;
  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {
    throw new Error("Ungueltige DJI-Zuordnung.");
  }

  const parsed = parseDjiMapPoint(element);
  if (!parsed) throw new Error("Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).");

  const payload = element as { resource: unknown };
  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;
  const where = {
    workspaceId_elementId: { workspaceId, elementId: parsed.elementId },
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const previous = await tx.djiMapElement.findUnique({ where });
        const duplicate = previous !== null;

        const record = previous ?? await tx.djiMapElement.create({
          data: {
            workspaceId,
            groupId,
            elementId: parsed.elementId,
            pilotUserId,
            orderId,
            name: parsed.name,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            resource,
            status: "PENDING",
          },
        });

        // Nie zu einem anderen Auftrag, Piloten oder Map-Element-Gruppe umhaengen.
        if (record.groupId !== groupId ||
            record.pilotUserId !== pilotUserId ||
            record.orderId !== orderId) {
          return {
            duplicate: true,
            status: record.status,
            pinpointId: record.pinpointId,
            elementId: record.elementId,
          };
        }

        if (!allowImport || record.status !== "PENDING" || record.pinpointId) {
          return {
            duplicate,
            status: record.status,
            pinpointId: record.pinpointId,
            elementId: record.elementId,
          };
        }

        const order = await tx.order.findUnique({
          where: { id: record.orderId },
          select: {
            id: true,
            status: true,
            operationDayTeam: { select: { pilotId: true } },
          },
        });
        const pilot = await tx.user.findUnique({
          where: { id: record.pilotUserId },
          select: { isAdmin: true },
        });

        // Kein Raten: nur aktiver Auftrag und berechtigter Pilot/Admin.
        if (!order || order.status === "ERLEDIGT" ||
            (!pilot?.isAdmin && order.operationDayTeam?.pilotId !== record.pilotUserId)) {
          return {
            duplicate,
            status: "PENDING",
            pinpointId: null,
            elementId: record.elementId,
          };
        }

        const last = await tx.orderPinpoint.findFirst({
          where: { orderId: record.orderId },
          orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
          select: { sequenceNumber: true },
        });
        const pinpoint = await tx.orderPinpoint.create({
          data: {
            orderId: record.orderId,
            latitude: record.latitude,
            longitude: record.longitude,
            rawQrText: `DJI:${record.workspaceId}:${record.elementId}`,
            sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
            status: "OFFEN",
          },
        });
        await tx.djiMapElement.update({
          where: { id: record.id },
          data: { pinpointId: pinpoint.id, status: "IMPORTED" },
        });

        return {
          duplicate,
          status: "IMPORTED",
          pinpointId: pinpoint.id,
          elementId: record.elementId,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // Parallele DJI-Nachrichten koennen um dieselbe Element-ID oder
      // die naechste laufende PinPoint-Nummer konkurrieren.
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034");
      if (retryable && attempt + 1 < MAX_RETRIES) continue;
      throw error;
    }
  }
  throw new Error("DJI-Import konnte nach mehreren Versuchen nicht abgeschlossen werden.");
}
