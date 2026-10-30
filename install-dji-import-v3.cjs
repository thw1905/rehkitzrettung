"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dryRun = process.argv.includes("--check");
const input = [
  "lib/dji/import-element.ts",
  "app/api/map/api/v1/workspaces/[workspaceId]/element-groups/[groupId]/elements/route.ts",
];
const expectedOriginal = "import { Prisma } from \"@prisma/client\";\nimport { db } from \"@/lib/db\";\nimport { parseDjiMapPoint } from \"@/lib/dji/normalize\";\n\ntype ReceiveOptions = {\n  workspaceId: string;\n  groupId: string;\n  pilotUserId: string;\n  orderId: string;\n  element: unknown;\n  allowImport: boolean;\n};\n\nconst safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);\n\n/** Store-first, unique DJI element reference. Never assign to a guessed order. */\nexport async function receiveDjiMapElement(options: ReceiveOptions) {\n  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport } = options;\n  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {\n    throw new Error(\"Ungueltige DJI-Zuordnung.\");\n  }\n  const parsed = parseDjiMapPoint(element);\n  if (!parsed) throw new Error(\"Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).\");\n\n  const payload = element as { resource: unknown };\n  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;\n  const where = { workspaceId_elementId: { workspaceId, elementId: parsed.elementId } };\n  const previous = await db.djiMapElement.findUnique({ where });\n  if (previous) {\n    return { duplicate: true, status: previous.status, pinpointId: previous.pinpointId, elementId: parsed.elementId };\n  }\n\n  try {\n    return await db.$transaction(async (tx) => {\n      const record = await tx.djiMapElement.create({\n        data: {\n          workspaceId, groupId, elementId: parsed.elementId,\n          pilotUserId, orderId, name: parsed.name,\n          latitude: parsed.latitude, longitude: parsed.longitude,\n          resource, status: \"PENDING\",\n        },\n      });\n      if (!allowImport) {\n        return { duplicate: false, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n      }\n      const order = await tx.order.findUnique({\n        where: { id: orderId },\n        select: {\n          id: true, status: true,\n          operationDayTeam: { select: { pilotId: true } },\n        },\n      });\n      // For real DJI sessions the selected order must still belong to the same pilot.\n      // Admin test requests may use an administrator as the actor on a demo order.\n      const pilot = await tx.user.findUnique({ where: { id: pilotUserId }, select: { isAdmin: true } });\n      if (!order || order.status === \"ERLEDIGT\" ||\n          (!pilot?.isAdmin && order.operationDayTeam?.pilotId !== pilotUserId)) {\n        return { duplicate: false, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n      }\n      const last = await tx.orderPinpoint.findFirst({\n        where: { orderId }, orderBy: [{ sequenceNumber: \"desc\" }, { createdAt: \"desc\" }],\n        select: { sequenceNumber: true },\n      });\n      const pinpoint = await tx.orderPinpoint.create({\n        data: {\n          orderId, latitude: parsed.latitude, longitude: parsed.longitude,\n          rawQrText: `DJI:${workspaceId}:${parsed.elementId}`,\n          sequenceNumber: (last?.sequenceNumber ?? 0) + 1,\n          status: \"OFFEN\",\n        },\n      });\n      await tx.djiMapElement.update({\n        where: { id: record.id }, data: { pinpointId: pinpoint.id, status: \"IMPORTED\" },\n      });\n      return { duplicate: false, status: \"IMPORTED\", pinpointId: pinpoint.id, elementId: record.elementId };\n    });\n  } catch (error) {\n    // Concurrent retries for an identical DJI element must never create two PinPoints.\n    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === \"P2002\") {\n      const existing = await db.djiMapElement.findUnique({ where });\n      if (existing) {\n        return { duplicate: true, status: existing.status, pinpointId: existing.pinpointId, elementId: parsed.elementId };\n      }\n    }\n    throw error;\n  }\n}\n";
const replacement = "import { Prisma } from \"@prisma/client\";\nimport { db } from \"@/lib/db\";\nimport { parseDjiMapPoint } from \"@/lib/dji/normalize\";\n\ntype ReceiveOptions = {\n  workspaceId: string;\n  groupId: string;\n  pilotUserId: string;\n  orderId: string;\n  element: unknown;\n  allowImport: boolean;\n};\n\nconst safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);\nconst MAX_RETRIES = 5;\n\n/**\n * DJI_PENDING_RETRY_V3\n * Store-first, eindeutige DJI-Element-ID pro Workspace.\n * Ein PENDING-Punkt darf beim erneuten Empfang importiert werden.\n * Eine gespeicherte Zuordnung wird niemals stillschweigend geaendert.\n */\nexport async function receiveDjiMapElement(options: ReceiveOptions) {\n  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport } = options;\n  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {\n    throw new Error(\"Ungueltige DJI-Zuordnung.\");\n  }\n\n  const parsed = parseDjiMapPoint(element);\n  if (!parsed) throw new Error(\"Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).\");\n\n  const payload = element as { resource: unknown };\n  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;\n  const where = {\n    workspaceId_elementId: { workspaceId, elementId: parsed.elementId },\n  };\n\n  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {\n    try {\n      return await db.$transaction(async (tx) => {\n        const previous = await tx.djiMapElement.findUnique({ where });\n        const duplicate = previous !== null;\n\n        const record = previous ?? await tx.djiMapElement.create({\n          data: {\n            workspaceId,\n            groupId,\n            elementId: parsed.elementId,\n            pilotUserId,\n            orderId,\n            name: parsed.name,\n            latitude: parsed.latitude,\n            longitude: parsed.longitude,\n            resource,\n            status: \"PENDING\",\n          },\n        });\n\n        // Nie zu einem anderen Auftrag, Piloten oder Map-Element-Gruppe umhaengen.\n        if (record.groupId !== groupId ||\n            record.pilotUserId !== pilotUserId ||\n            record.orderId !== orderId) {\n          return {\n            duplicate: true,\n            status: record.status,\n            pinpointId: record.pinpointId,\n            elementId: record.elementId,\n          };\n        }\n\n        if (!allowImport || record.status !== \"PENDING\" || record.pinpointId) {\n          return {\n            duplicate,\n            status: record.status,\n            pinpointId: record.pinpointId,\n            elementId: record.elementId,\n          };\n        }\n\n        const order = await tx.order.findUnique({\n          where: { id: record.orderId },\n          select: {\n            id: true,\n            status: true,\n            operationDayTeam: { select: { pilotId: true } },\n          },\n        });\n        const pilot = await tx.user.findUnique({\n          where: { id: record.pilotUserId },\n          select: { isAdmin: true },\n        });\n\n        // Kein Raten: nur aktiver Auftrag und berechtigter Pilot/Admin.\n        if (!order || order.status === \"ERLEDIGT\" ||\n            (!pilot?.isAdmin && order.operationDayTeam?.pilotId !== record.pilotUserId)) {\n          return {\n            duplicate,\n            status: \"PENDING\",\n            pinpointId: null,\n            elementId: record.elementId,\n          };\n        }\n\n        const last = await tx.orderPinpoint.findFirst({\n          where: { orderId: record.orderId },\n          orderBy: [{ sequenceNumber: \"desc\" }, { createdAt: \"desc\" }],\n          select: { sequenceNumber: true },\n        });\n        const pinpoint = await tx.orderPinpoint.create({\n          data: {\n            orderId: record.orderId,\n            latitude: record.latitude,\n            longitude: record.longitude,\n            rawQrText: `DJI:${record.workspaceId}:${record.elementId}`,\n            sequenceNumber: (last?.sequenceNumber ?? 0) + 1,\n            status: \"OFFEN\",\n          },\n        });\n        await tx.djiMapElement.update({\n          where: { id: record.id },\n          data: { pinpointId: pinpoint.id, status: \"IMPORTED\" },\n        });\n\n        return {\n          duplicate,\n          status: \"IMPORTED\",\n          pinpointId: pinpoint.id,\n          elementId: record.elementId,\n        };\n      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });\n    } catch (error) {\n      // Parallele DJI-Nachrichten koennen um dieselbe Element-ID oder\n      // die naechste laufende PinPoint-Nummer konkurrieren.\n      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&\n        (error.code === \"P2002\" || error.code === \"P2034\");\n      if (retryable && attempt + 1 < MAX_RETRIES) continue;\n      throw error;\n    }\n  }\n  throw new Error(\"DJI-Import konnte nach mehreren Versuchen nicht abgeschlossen werden.\");\n}\n";
function fail(message) {
  throw new Error(message + " (keine Programmdateien veraendert, falls Vorpruefung)");
}
function patchImporter(src) {
  if (src.includes("DJI_PENDING_RETRY_V3")) return src;
  if (src.trim() !== expectedOriginal.trim()) {
    fail("DJI-Importer ist nicht identisch mit der geprueften Version; kein automatisches Ueberschreiben");
  }
  return replacement;
}
function patchRoute(src) {
  if (/allowImport:\s*true\s*,/.test(src)) return src;
  const matches = [...src.matchAll(/allowImport:\s*false\s*,[^\r\n]*/g)];
  if (matches.length !== 1) fail("DJI-Route: allowImport:false nicht eindeutig gefunden");
  return src.replace(matches[0][0], "allowImport: true, // Neue DJI-Punkte automatisch in den verbundenen Auftrag importieren.");
}
function main() {
  const changes = [];
  const patchers = [patchImporter, patchRoute];
  for (let i = 0; i < input.length; i++) {
    const full = path.join(root, input[i]);
    if (!fs.existsSync(full)) fail("Datei fehlt: " + input[i] + "; Installer bitte im Projektverzeichnis starten");
    const original = fs.readFileSync(full, "utf8");
    const crlf = original.includes("\r\n");
    const normalized = original.replace(/\r\n/g, "\n");
    let updated = patchers[i](normalized);
    if (crlf) updated = updated.replace(/\n/g, "\r\n");
    if (updated !== original) changes.push({ full, relative: input[i], original, updated });
  }
  if (!changes.length) {
    console.log("DJI-Import V3 bereits installiert. Keine Aenderung.");
    return;
  }
  if (dryRun) {
    console.log("VORPRUEFUNG OK. Wuerde aendern:");
    changes.forEach(c => console.log("  " + c.relative));
    console.log("Keine Dateien veraendert.");
    return;
  }
  const parent = path.join(root, "..", "rehkitzrettung-dji-backups");
  const dir = path.join(parent, "import-v3-" + new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  for (const c of changes) {
    const backup = path.join(dir, c.relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, c.original, { flag: "wx" });
  }
  const done = [];
  try {
    for (const c of changes) {
      fs.writeFileSync(c.full, c.updated, "utf8");
      done.push(c);
    }
  } catch (err) {
    for (const c of done.reverse()) fs.writeFileSync(c.full, c.original, "utf8");
    throw err;
  }
  console.log("Erfolgreich angepasst:");
  changes.forEach(c => console.log("  " + c.relative));
  console.log("Backups ausserhalb des Projekts: " + dir);
  console.log("Keine Datenbank, Prisma-Schemata, Zugangsdaten, DJI-Anmeldung oder MQTT geaendert.");
  console.log("Als Naechstes: npx.cmd tsc --noEmit && npm.cmd run build");
}
try { main(); }
catch (err) { console.error("ABBRUCH: " + err.message); process.exitCode = 1; }
