// DJI_PUT_MOVE_V6: verschobene DJI-Punkte aktualisieren und PENDING erneut zuordnen.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDjiMapPoint } from "@/lib/dji/normalize";
import { receiveDjiMapElement } from "@/lib/dji/import-element";

const validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export class DjiElementUpdateError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
  }
}

type Options = {
  workspaceId: string;
  elementId: string;
  pilotUserId: string;
  sessionOrderId: string;
  update: unknown;
};

/** DJI sends { name?, content? } when an existing map element is moved. */
export async function updateDjiMapElement(options: Options) {
  const { workspaceId, elementId, pilotUserId, sessionOrderId } = options;
  if (![workspaceId, elementId, pilotUserId, sessionOrderId].every(validId)) {
    throw new DjiElementUpdateError("Ungültige DJI-Kennung.", 400);
  }

  const patch = object(options.update);
  if (!patch || (patch.name !== undefined && typeof patch.name !== "string") ||
      (patch.content !== undefined && !object(patch.content))) {
    throw new DjiElementUpdateError("Ungültige DJI-Aktualisierung.", 400);
  }
  if (patch.name === undefined && patch.content === undefined) {
    throw new DjiElementUpdateError("Keine Änderung übermittelt.", 400);
  }

  const where = { workspaceId_elementId: { workspaceId, elementId } };
  // Prüft die Sitzung und das ursprüngliche Team vor der Änderung.
  const sessionOrder = await db.order.findUnique({
    where: { id: sessionOrderId },
    select: { operationDayTeamId: true, operationDayTeam: { select: { pilotId: true } } },
  });
  if (!sessionOrder?.operationDayTeamId || sessionOrder.operationDayTeam?.pilotId !== pilotUserId) {
    throw new DjiElementUpdateError("DJI-Teamsitzung ist nicht mehr gültig.", 409);
  }

  const result = await db.$transaction(async (tx) => {
    const previous = await tx.djiMapElement.findUnique({ where });
    if (!previous) throw new DjiElementUpdateError("DJI-Punkt nicht gefunden.", 404);
    if (previous.pilotUserId !== pilotUserId || previous.groupId !== process.env.DJI_MAP_GROUP_ID) {
      throw new DjiElementUpdateError("DJI-Punkt gehört nicht zu dieser Sitzung.", 403);
    }
    const anchor = await tx.order.findUnique({
      where: { id: previous.orderId },
      select: { operationDayTeamId: true, operationDayTeam: { select: { pilotId: true } } },
    });
    // Alter, gelöschter Teamanker: nicht automatisch einem fremden Auftrag zuordnen.
    if (!anchor?.operationDayTeamId ||
        anchor.operationDayTeamId !== sessionOrder.operationDayTeamId ||
        anchor.operationDayTeam?.pilotId !== pilotUserId) {
      throw new DjiElementUpdateError("Ursprünglicher DJI-Teamauftrag ist nicht mehr gültig.", 409);
    }

    const storedResource = object(previous.resource);
    if (!storedResource || storedResource.type !== 0) {
      throw new DjiElementUpdateError("Kein unterstützter DJI-Punkt.", 400);
    }
    const oldContent = object(storedResource.content) || {};
    const newContent = object(patch.content) || {};
    const oldGeometry = object(oldContent.geometry) || {};
    const newGeometry = patch.content !== undefined && "geometry" in newContent
      ? object(newContent.geometry) : null;
    if (patch.content !== undefined && "geometry" in newContent && !newGeometry) {
      throw new DjiElementUpdateError("Ungültige Punktgeometrie.", 400);
    }
    const content = {
      ...oldContent,
      ...newContent,
      geometry: newGeometry ? { ...oldGeometry, ...newGeometry } : oldGeometry,
    };
    const resource = { ...storedResource, content };
    const name = typeof patch.name === "string" && patch.name.trim()
      ? patch.name.trim().slice(0, 120) : previous.name;
    // Vor dem Schreiben prüfen, ob WGS84 Point und [longitude, latitude] gültig sind.
    const parsed = parseDjiMapPoint({ id: elementId, name, resource });
    if (!parsed) throw new DjiElementUpdateError("Keine gültigen WGS84-Punktkoordinaten.", 400);

    await tx.djiMapElement.update({
      where: { id: previous.id },
      data: {
        name: parsed.name,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        resource: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
      },
    });

    // Schon importierte Punkte anpassen, solange die Wildmeldung noch OFFEN ist.
    // ERREICHT/ERLEDIGT nicht nachträglich durch DJI verschieben.
    if (previous.status === "IMPORTED" && previous.pinpointId) {
      await tx.orderPinpoint.updateMany({
        where: { id: previous.pinpointId, status: "OFFEN" },
        data: { latitude: parsed.latitude, longitude: parsed.longitude },
      });
    }
    return {
      groupId: previous.groupId,
      status: previous.status,
      element: { id: elementId, name: parsed.name, resource },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  // Kein weiterer Import, wenn bereits verknüpft; nur ggf. Koordinaten aktualisiert.
  if (result.status !== "PENDING") {
    return { elementId, status: result.status };
  }

  // PENDING nach Verschieben automatisch erneut mit den Teamflächen abgleichen.
  // Der bestehende V5-Importer verhindert doppelte PinPoints anhand der DJI-ID.
  const received = await receiveDjiMapElement({
    workspaceId,
    groupId: result.groupId,
    pilotUserId,
    orderId: sessionOrderId,
    element: result.element,
    allowImport: true,
    matchByTeam: true,
  });
  return { elementId, status: received.status };
}
