"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const files = [
  "lib/dji/import-element.ts",
  "app/api/map/api/v1/workspaces/[workspaceId]/element-groups/[groupId]/elements/route.ts",
];
const expectedImporter = "import { Prisma } from \"@prisma/client\";\nimport { db } from \"@/lib/db\";\nimport { parseDjiMapPoint } from \"@/lib/dji/normalize\";\n\ntype ReceiveOptions = {\n  workspaceId: string;\n  groupId: string;\n  pilotUserId: string;\n  orderId: string;\n  element: unknown;\n  allowImport: boolean;\n};\n\nconst safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);\n\n/** Store-first, unique DJI element reference. Never assign to a guessed order. */\nexport async function receiveDjiMapElement(options: ReceiveOptions) {\n  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport } = options;\n  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {\n    throw new Error(\"Ungueltige DJI-Zuordnung.\");\n  }\n  const parsed = parseDjiMapPoint(element);\n  if (!parsed) throw new Error(\"Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).\");\n\n  const payload = element as { resource: unknown };\n  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;\n  const where = { workspaceId_elementId: { workspaceId, elementId: parsed.elementId } };\n  const previous = await db.djiMapElement.findUnique({ where });\n  if (previous) {\n    return { duplicate: true, status: previous.status, pinpointId: previous.pinpointId, elementId: parsed.elementId };\n  }\n\n  try {\n    return await db.$transaction(async (tx) => {\n      const record = await tx.djiMapElement.create({\n        data: {\n          workspaceId, groupId, elementId: parsed.elementId,\n          pilotUserId, orderId, name: parsed.name,\n          latitude: parsed.latitude, longitude: parsed.longitude,\n          resource, status: \"PENDING\",\n        },\n      });\n      if (!allowImport) {\n        return { duplicate: false, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n      }\n      const order = await tx.order.findUnique({\n        where: { id: orderId },\n        select: {\n          id: true, status: true,\n          operationDayTeam: { select: { pilotId: true } },\n        },\n      });\n      // For real DJI sessions the selected order must still belong to the same pilot.\n      // Admin test requests may use an administrator as the actor on a demo order.\n      const pilot = await tx.user.findUnique({ where: { id: pilotUserId }, select: { isAdmin: true } });\n      if (!order || order.status === \"ERLEDIGT\" ||\n          (!pilot?.isAdmin && order.operationDayTeam?.pilotId !== pilotUserId)) {\n        return { duplicate: false, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n      }\n      const last = await tx.orderPinpoint.findFirst({\n        where: { orderId }, orderBy: [{ sequenceNumber: \"desc\" }, { createdAt: \"desc\" }],\n        select: { sequenceNumber: true },\n      });\n      const pinpoint = await tx.orderPinpoint.create({\n        data: {\n          orderId, latitude: parsed.latitude, longitude: parsed.longitude,\n          rawQrText: `DJI:${workspaceId}:${parsed.elementId}`,\n          sequenceNumber: (last?.sequenceNumber ?? 0) + 1,\n          status: \"OFFEN\",\n        },\n      });\n      await tx.djiMapElement.update({\n        where: { id: record.id }, data: { pinpointId: pinpoint.id, status: \"IMPORTED\" },\n      });\n      return { duplicate: false, status: \"IMPORTED\", pinpointId: pinpoint.id, elementId: record.elementId };\n    });\n  } catch (error) {\n    // Concurrent retries for an identical DJI element must never create two PinPoints.\n    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === \"P2002\") {\n      const existing = await db.djiMapElement.findUnique({ where });\n      if (existing) {\n        return { duplicate: true, status: existing.status, pinpointId: existing.pinpointId, elementId: parsed.elementId };\n      }\n    }\n    throw error;\n  }\n}\n";
const replacementImporter = "import { Prisma } from \"@prisma/client\";\nimport { db } from \"@/lib/db\";\nimport { parseDjiMapPoint } from \"@/lib/dji/normalize\";\nimport { pointInArea } from \"@/lib/dji/point-matching\";\n\ntype ReceiveOptions = {\n  workspaceId: string;\n  groupId: string;\n  pilotUserId: string;\n  /** Technischer Team-Anker, keine automatische Auftragszuordnung. */\n  orderId: string;\n  element: unknown;\n  allowImport: boolean;\n  /** Nur der echte DJI-Empfang nutzt die GPS-Zuordnung zu Teamauftraegen. */\n  matchByTeam?: boolean;\n};\n\nconst safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);\nconst MAX_RETRIES = 5;\n\n/** DJI_TEAM_GPS_MATCH_V4: Element eindeutig speichern, Zielauftrag anhand seiner Flaeche ermitteln. */\nexport async function receiveDjiMapElement(options: ReceiveOptions) {\n  const { workspaceId, groupId, pilotUserId, orderId, element, allowImport, matchByTeam = false } = options;\n  if (![workspaceId, groupId, pilotUserId, orderId].every(safeId)) {\n    throw new Error(\"Ungueltige DJI-Zuordnung.\");\n  }\n  const parsed = parseDjiMapPoint(element);\n  if (!parsed) throw new Error(\"Kein gueltiger DJI-Karten-PinPoint (GeoJSON Point, WGS84).\");\n  const payload = element as { resource: unknown };\n  const resource = JSON.parse(JSON.stringify(payload.resource)) as Prisma.InputJsonValue;\n  const where = { workspaceId_elementId: { workspaceId, elementId: parsed.elementId } };\n\n  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {\n    try {\n      return await db.$transaction(async (tx) => {\n        const previous = await tx.djiMapElement.findUnique({ where });\n        const duplicate = previous !== null;\n        const record = previous ?? await tx.djiMapElement.create({\n          data: {\n            workspaceId, groupId, elementId: parsed.elementId,\n            pilotUserId, orderId, name: parsed.name,\n            latitude: parsed.latitude, longitude: parsed.longitude,\n            resource, status: \"PENDING\",\n          },\n        });\n        // Bekannte DJI-ID nicht stillschweigend einem anderen Piloten/Layer zuweisen.\n        if (record.groupId !== groupId || record.pilotUserId !== pilotUserId ||\n            (!matchByTeam && record.orderId !== orderId)) {\n          return { duplicate: true, status: record.status, pinpointId: record.pinpointId, elementId: record.elementId };\n        }\n        if (!allowImport || record.status !== \"PENDING\" || record.pinpointId) {\n          return { duplicate, status: record.status, pinpointId: record.pinpointId, elementId: record.elementId };\n        }\n\n        // Vorhandene PENDING-Punkte koennen nach erneuter Zustellung importiert werden.\n        // Der in der DJI-Sitzung gespeicherte Auftrag dient NUR als Team-Anker.\n        const anchor = await tx.order.findUnique({\n          where: { id: record.orderId },\n          select: { id: true, status: true, operationDayTeamId: true,\n            operationDayTeam: { select: { pilotId: true } } },\n        });\n        if (!anchor) {\n          return { duplicate, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n        }\n\n        let targetOrderId: string | null = null;\n        if (matchByTeam) {\n          // Verhindert, dass alte DJI-Punkte nach Teamwechsel fremden Teams zugeordnet werden.\n          const activeAnchor = await tx.order.findUnique({\n            where: { id: orderId },\n            select: { operationDayTeamId: true,\n              operationDayTeam: { select: { pilotId: true } } },\n          });\n          if (!anchor.operationDayTeamId ||\n              anchor.operationDayTeam?.pilotId !== pilotUserId ||\n              !activeAnchor ||\n              activeAnchor.operationDayTeamId !== anchor.operationDayTeamId ||\n              activeAnchor.operationDayTeam?.pilotId !== pilotUserId) {\n            return { duplicate, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n          }\n          const teamOrders = await tx.order.findMany({\n            where: {\n              operationDayTeamId: anchor.operationDayTeamId,\n              status: { in: [\"OFFEN\", \"IN_ARBEIT\"] },\n            },\n            select: { id: true, field: { select: { areaGeoJson: true } } },\n          });\n          const matches = teamOrders.filter((candidate) =>\n            candidate.field && pointInArea(record.longitude, record.latitude, candidate.field.areaGeoJson)\n          );\n          // Ein Punkt kann auch ausserhalb oder in mehreren Flaechen liegen: dann NICHT raten.\n          if (matches.length === 1) targetOrderId = matches[0].id;\n        } else {\n          // Bestehendes Verhalten fuer den gesonderten Admin-Testimport beibehalten.\n          const pilot = await tx.user.findUnique({\n            where: { id: pilotUserId }, select: { isAdmin: true },\n          });\n          if (anchor.status !== \"ERLEDIGT\" &&\n              (pilot?.isAdmin || anchor.operationDayTeam?.pilotId === pilotUserId)) {\n            targetOrderId = anchor.id;\n          }\n        }\n        if (!targetOrderId) {\n          return { duplicate, status: \"PENDING\", pinpointId: null, elementId: record.elementId };\n        }\n\n        const last = await tx.orderPinpoint.findFirst({\n          where: { orderId: targetOrderId },\n          orderBy: [{ sequenceNumber: \"desc\" }, { createdAt: \"desc\" }],\n          select: { sequenceNumber: true },\n        });\n        const pinpoint = await tx.orderPinpoint.create({\n          data: {\n            orderId: targetOrderId,\n            latitude: record.latitude, longitude: record.longitude,\n            rawQrText: `DJI:${record.workspaceId}:${record.elementId}`,\n            sequenceNumber: (last?.sequenceNumber ?? 0) + 1,\n            status: \"OFFEN\",\n          },\n        });\n        await tx.djiMapElement.update({\n          where: { id: record.id },\n          data: { pinpointId: pinpoint.id, status: \"IMPORTED\" },\n        });\n        return { duplicate, status: \"IMPORTED\", pinpointId: pinpoint.id, elementId: record.elementId };\n      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });\n    } catch (error) {\n      // Gleichzeitige DJI-Nachrichten und konkurrierende laufende Nummern.\n      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&\n        (error.code === \"P2002\" || error.code === \"P2034\");\n      if (retryable && attempt + 1 < MAX_RETRIES) continue;\n      throw error;\n    }\n  }\n  throw new Error(\"DJI-Import konnte nach mehreren Versuchen nicht abgeschlossen werden.\");\n}\n";
function fail(message) { throw new Error(message); }
function patchImporter(src) {
  if (src.includes("DJI_TEAM_GPS_MATCH_V4")) return src;
  if (src.trim() !== expectedImporter.trim()) {
    fail("Importer weicht vom geprueften Zustand ab. Bitte nicht ueberschreiben.");
  }
  return replacementImporter;
}
function patchRoute(src) {
  if (src.includes("DJI_TEAM_GPS_ROUTE_V4")) return src;
  const line = /allowImport: false, \/\/ Stufe 4A: keine echten Auftrags-PinPoints erzeugen\./;
  if (!line.test(src)) fail("Empfangsroute hat nicht den erwarteten Diagnosemodus.");
  if (src.includes("matchByTeam:")) fail("Unerwartete matchByTeam-Anpassung in Empfangsroute.");
  return src.replace(line,
    'allowImport: process.env.DJI_MATCHED_IMPORT_ENABLED === "true", // DJI_TEAM_GPS_ROUTE_V4: separater, sicherer Schalter\n      matchByTeam: true, // Punkt innerhalb genau einer Team-Auftragsflaeche importieren'
  );
}
function main() {
  const patchers = [patchImporter, patchRoute];
  const changes = [];
  for (let i = 0; i < files.length; i++) {
    const full = path.join(root, files[i]);
    if (!fs.existsSync(full)) fail("Datei fehlt: " + files[i]);
    const original = fs.readFileSync(full, "utf8");
    const updatedRaw = patchers[i](original.replace(/\r\n/g, "\n"));
    const updated = original.includes("\r\n") ? updatedRaw.replace(/\n/g, "\r\n") : updatedRaw;
    if (original !== updated) changes.push({full, relative: files[i], original, updated});
  }
  if (!changes.length) { console.log("V4 ist bereits installiert. Keine Aenderung."); return; }
  if (checkOnly) {
    console.log("VORPRUEFUNG OK. Wuerde aendern:");
    for (const c of changes) console.log("  " + c.relative);
    console.log("Keine Dateien veraendert.");
    return;
  }
  const backupDir = path.join(root, "..", "rehkitzrettung-dji-backups", "import-v4-" + new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(backupDir, {recursive:true});
  for (const c of changes) {
    const backup = path.join(backupDir, c.relative);
    fs.mkdirSync(path.dirname(backup), {recursive:true});
    fs.writeFileSync(backup, c.original, {flag:"wx"});
  }
  const written = [];
  try {
    for (const c of changes) {
      fs.writeFileSync(c.full, c.updated, "utf8");
      written.push(c);
    }
  } catch (error) {
    for (const c of written.reverse()) fs.writeFileSync(c.full, c.original, "utf8");
    throw error;
  }
  console.log("V4 erfolgreich geschrieben (Schalter bleibt standardmaessig AUS):");
  for (const c of changes) console.log("  " + c.relative);
  console.log("Backups: " + backupDir);
  console.log("Bestaetigen: npx.cmd tsc --noEmit && npm.cmd run build");
  console.log("Neue Map-API verwendet DJI_MATCHED_IMPORT_ENABLED=true (nicht DJI_IMPORT_ENABLED).");
}
try { main(); } catch (error) { console.error("ABBRUCH: " + error.message); process.exitCode = 1; }