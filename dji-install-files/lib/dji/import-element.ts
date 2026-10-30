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

/** Store-first, unique DJI element reference. Never assign to a guessed order. */
export async function receiveDjiMapElement(options: ReceiveOptions) {
  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport } = options;
  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {
    throw new Error("Ungueltige DJI-Zuordnung.");
  }
  const parsed = parseDjiMapPoint(element);
  if (!parsed) throw new Error("Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).");

  const payload = element as { resource: unknown };
  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;
  const where = { workspaceId_elementId: { workspaceId, elementId: parsed.elementId } };
  const previous = await db.djiMapElement.findUnique({ where });
  if (previous) {
    return { duplicate: true, status: previous.status, pinpointId: previous.pinpointId, elementId: parsed.elementId };
  }

  try {
    return await db.$transaction(async (tx) => {
      const record = await tx.djiMapElement.create({
        data: {
          workspaceId, groupId, elementId: parsed.elementId,
          pilotUserId, orderId, name: parsed.name,
          latitude: parsed.latitude, longitude: parsed.longitude,
          resource, status: "PENDING",
        },
      });
      if (!allowImport) {
        return { duplicate: false, status: "PENDING", pinpointId: null, elementId: record.elementId };
      }
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true, status: true,
          operationDayTeam: { select: { pilotId: true } },
        },
      });
      // For real DJI sessions the selected order must still belong to the same pilot.
      // Admin test requests may use an administrator as the actor on a demo order.
      const pilot = await tx.user.findUnique({ where: { id: pilotUserId }, select: { isAdmin: true } });
      if (!order || order.status === "ERLEDIGT" ||
          (!pilot?.isAdmin && order.operationDayTeam?.pilotId !== pilotUserId)) {
        return { duplicate: false, status: "PENDING", pinpointId: null, elementId: record.elementId };
      }
      const last = await tx.orderPinpoint.findFirst({
        where: { orderId }, orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
        select: { sequenceNumber: true },
      });
      const pinpoint = await tx.orderPinpoint.create({
        data: {
          orderId, latitude: parsed.latitude, longitude: parsed.longitude,
          rawQrText: `DJI:${workspaceId}:${parsed.elementId}`,
          sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
          status: "OFFEN",
        },
      });
      await tx.djiMapElement.update({
        where: { id: record.id }, data: { pinpointId: pinpoint.id, status: "IMPORTED" },
      });
      return { duplicate: false, status: "IMPORTED", pinpointId: pinpoint.id, elementId: record.elementId };
    });
  } catch (error) {
    // Concurrent retries for an identical DJI element must never create two PinPoints.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.djiMapElement.findUnique({ where });
      if (existing) {
        return { duplicate: true, status: existing.status, pinpointId: existing.pinpointId, elementId: parsed.elementId };
      }
    }
    throw error;
  }
}
