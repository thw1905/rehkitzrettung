"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const files = {"lib/dji/update-element.ts": "// DJI_PUT_MOVE_V6: verschobene DJI-Punkte aktualisieren und PENDING erneut zuordnen.\nimport { Prisma } from \"@prisma/client\";\nimport { db } from \"@/lib/db\";\nimport { parseDjiMapPoint } from \"@/lib/dji/normalize\";\nimport { receiveDjiMapElement } from \"@/lib/dji/import-element\";\n\nconst validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);\nfunction object(value: unknown): Record<string, unknown> | null {\n  return value !== null && typeof value === \"object\" && !Array.isArray(value)\n    ? value as Record<string, unknown> : null;\n}\n\nexport class DjiElementUpdateError extends Error {\n  constructor(message: string, public readonly httpStatus: number) {\n    super(message);\n  }\n}\n\ntype Options = {\n  workspaceId: string;\n  elementId: string;\n  pilotUserId: string;\n  sessionOrderId: string;\n  update: unknown;\n};\n\n/** DJI sends { name?, content? } when an existing map element is moved. */\nexport async function updateDjiMapElement(options: Options) {\n  const { workspaceId, elementId, pilotUserId, sessionOrderId } = options;\n  if (![workspaceId, elementId, pilotUserId, sessionOrderId].every(validId)) {\n    throw new DjiElementUpdateError(\"Ungültige DJI-Kennung.\", 400);\n  }\n\n  const patch = object(options.update);\n  if (!patch || (patch.name !== undefined && typeof patch.name !== \"string\") ||\n      (patch.content !== undefined && !object(patch.content))) {\n    throw new DjiElementUpdateError(\"Ungültige DJI-Aktualisierung.\", 400);\n  }\n  if (patch.name === undefined && patch.content === undefined) {\n    throw new DjiElementUpdateError(\"Keine Änderung übermittelt.\", 400);\n  }\n\n  const where = { workspaceId_elementId: { workspaceId, elementId } };\n  // Prüft die Sitzung und das ursprüngliche Team vor der Änderung.\n  const sessionOrder = await db.order.findUnique({\n    where: { id: sessionOrderId },\n    select: { operationDayTeamId: true, operationDayTeam: { select: { pilotId: true } } },\n  });\n  if (!sessionOrder?.operationDayTeamId || sessionOrder.operationDayTeam?.pilotId !== pilotUserId) {\n    throw new DjiElementUpdateError(\"DJI-Teamsitzung ist nicht mehr gültig.\", 409);\n  }\n\n  const result = await db.$transaction(async (tx) => {\n    const previous = await tx.djiMapElement.findUnique({ where });\n    if (!previous) throw new DjiElementUpdateError(\"DJI-Punkt nicht gefunden.\", 404);\n    if (previous.pilotUserId !== pilotUserId || previous.groupId !== process.env.DJI_MAP_GROUP_ID) {\n      throw new DjiElementUpdateError(\"DJI-Punkt gehört nicht zu dieser Sitzung.\", 403);\n    }\n    const anchor = await tx.order.findUnique({\n      where: { id: previous.orderId },\n      select: { operationDayTeamId: true, operationDayTeam: { select: { pilotId: true } } },\n    });\n    // Alter, gelöschter Teamanker: nicht automatisch einem fremden Auftrag zuordnen.\n    if (!anchor?.operationDayTeamId ||\n        anchor.operationDayTeamId !== sessionOrder.operationDayTeamId ||\n        anchor.operationDayTeam?.pilotId !== pilotUserId) {\n      throw new DjiElementUpdateError(\"Ursprünglicher DJI-Teamauftrag ist nicht mehr gültig.\", 409);\n    }\n\n    const storedResource = object(previous.resource);\n    if (!storedResource || storedResource.type !== 0) {\n      throw new DjiElementUpdateError(\"Kein unterstützter DJI-Punkt.\", 400);\n    }\n    const oldContent = object(storedResource.content) || {};\n    const newContent = object(patch.content) || {};\n    const oldGeometry = object(oldContent.geometry) || {};\n    const newGeometry = patch.content !== undefined && \"geometry\" in newContent\n      ? object(newContent.geometry) : null;\n    if (patch.content !== undefined && \"geometry\" in newContent && !newGeometry) {\n      throw new DjiElementUpdateError(\"Ungültige Punktgeometrie.\", 400);\n    }\n    const content = {\n      ...oldContent,\n      ...newContent,\n      geometry: newGeometry ? { ...oldGeometry, ...newGeometry } : oldGeometry,\n    };\n    const resource = { ...storedResource, content };\n    const name = typeof patch.name === \"string\" && patch.name.trim()\n      ? patch.name.trim().slice(0, 120) : previous.name;\n    // Vor dem Schreiben prüfen, ob WGS84 Point und [longitude, latitude] gültig sind.\n    const parsed = parseDjiMapPoint({ id: elementId, name, resource });\n    if (!parsed) throw new DjiElementUpdateError(\"Keine gültigen WGS84-Punktkoordinaten.\", 400);\n\n    await tx.djiMapElement.update({\n      where: { id: previous.id },\n      data: {\n        name: parsed.name,\n        latitude: parsed.latitude,\n        longitude: parsed.longitude,\n        resource: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,\n      },\n    });\n\n    // Schon importierte Punkte anpassen, solange die Wildmeldung noch OFFEN ist.\n    // ERREICHT/ERLEDIGT nicht nachträglich durch DJI verschieben.\n    if (previous.status === \"IMPORTED\" && previous.pinpointId) {\n      await tx.orderPinpoint.updateMany({\n        where: { id: previous.pinpointId, status: \"OFFEN\" },\n        data: { latitude: parsed.latitude, longitude: parsed.longitude },\n      });\n    }\n    return {\n      groupId: previous.groupId,\n      status: previous.status,\n      element: { id: elementId, name: parsed.name, resource },\n    };\n  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });\n\n  // Kein weiterer Import, wenn bereits verknüpft; nur ggf. Koordinaten aktualisiert.\n  if (result.status !== \"PENDING\") {\n    return { elementId, status: result.status };\n  }\n\n  // PENDING nach Verschieben automatisch erneut mit den Teamflächen abgleichen.\n  // Der bestehende V5-Importer verhindert doppelte PinPoints anhand der DJI-ID.\n  const received = await receiveDjiMapElement({\n    workspaceId,\n    groupId: result.groupId,\n    pilotUserId,\n    orderId: sessionOrderId,\n    element: result.element,\n    allowImport: true,\n    matchByTeam: true,\n  });\n  return { elementId, status: received.status };\n}\n", "app/api/map/api/v1/workspaces/[workspaceId]/elements/[elementId]/route.ts": "// DJI_PUT_MOVE_V6: offizielle DJI Cloud API fuer verschobene Karten-Punkte.\nimport { NextRequest, NextResponse } from \"next/server\";\nimport { checkDjiSession } from \"@/lib/dji/token\";\nimport { DjiElementUpdateError, updateDjiMapElement } from \"@/lib/dji/update-element\";\n\nexport const runtime = \"nodejs\";\nexport const dynamic = \"force-dynamic\";\nconst responseHeaders = { \"Cache-Control\": \"no-store\" };\n\ntype Context = { params: Promise<{ workspaceId: string; elementId: string }> };\nexport async function PUT(req: NextRequest, context: Context) {\n  const { workspaceId, elementId } = await context.params;\n  const session = await checkDjiSession(req.headers.get(\"x-auth-token\"), workspaceId);\n  if (!session) {\n    return NextResponse.json({ code: 401, message: \"Unauthorized\" },\n      { status: 401, headers: responseHeaders });\n  }\n  const raw = await req.text();\n  if (raw.length > 16_384) {\n    return NextResponse.json({ code: 413, message: \"Payload too large\" },\n      { status: 413, headers: responseHeaders });\n  }\n  let update: unknown;\n  try { update = JSON.parse(raw); }\n  catch {\n    return NextResponse.json({ code: 400, message: \"Invalid JSON\" },\n      { status: 400, headers: responseHeaders });\n  }\n  try {\n    const received = await updateDjiMapElement({\n      workspaceId, elementId,\n      pilotUserId: session.pilotUserId,\n      sessionOrderId: session.orderId,\n      update,\n    });\n    return NextResponse.json({ code: 0, message: \"success\", data: { id: received.elementId } },\n      { headers: responseHeaders });\n  } catch (error) {\n    if (error instanceof DjiElementUpdateError) {\n      return NextResponse.json({ code: error.httpStatus, message: error.message },\n        { status: error.httpStatus, headers: responseHeaders });\n    }\n    console.error(\"DJI point update error\", error);\n    return NextResponse.json({ code: 500, message: \"Point update failed\" },\n      { status: 500, headers: responseHeaders });\n  }\n}\n"};
function verify() {
  const oldRoute = "app/api/map/api/v1/workspaces/[workspaceId]/element-groups/[groupId]/elements/route.ts";
  const importer = "lib/dji/import-element.ts";
  const norm = "lib/dji/normalize.ts";
  for (const name of ["package.json", oldRoute, importer, norm]) {
    if (!fs.existsSync(path.join(root, name))) throw new Error("Datei fehlt: " + name + ". Installer im Projektordner starten.");
  }
  const source = fs.readFileSync(path.join(root, oldRoute), "utf8");
  const code = fs.readFileSync(path.join(root, importer), "utf8");
  if (!/allowImport:\s*true\s*,/.test(source) || !/matchByTeam:\s*true\s*,/.test(source) ||
      !code.includes("DJI_AUTO_TEAM_MATCH_V5")) {
    throw new Error("DJI Autoimport V5 nicht eindeutig erkannt. Keine Dateien geändert.");
  }
  let same = 0;
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    if (fs.existsSync(full)) {
      if (fs.readFileSync(full, "utf8") === content) same++;
      else throw new Error("Bestehende Datei weicht ab: " + name + ". Keine Dateien geändert.");
    }
  }
  if (same !== 0 && same !== Object.keys(files).length) {
    throw new Error("Nur ein Teil von V6 ist vorhanden. Keine Dateien geändert.");
  }
  return same === Object.keys(files).length;
}
function main() {
  const already = verify();
  if (already) { console.log("DJI PUT V6 ist bereits installiert. Keine Änderung."); return; }
  if (checkOnly) {
    console.log("VORPRUEFUNG OK – V6 wuerde nur diese NEUEN Dateien anlegen:");
    for (const name of Object.keys(files)) console.log("  " + name);
    console.log("Bestehende Dateien, Verbindungsfunktion und Datenbank bleiben unveraendert.");
    return;
  }
  const written = [];
  try {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), {recursive:true});
      fs.writeFileSync(full, content, {flag:"wx"});
      written.push(full);
    }
  } catch(error) {
    for (const full of written.reverse()) fs.unlinkSync(full);
    throw error;
  }
  console.log("DJI PUT V6 installiert:");
  for (const name of Object.keys(files)) console.log("  " + name);
  console.log("Keine bestehende Datei veraendert; neue Route verarbeitet DJI-Punktverschiebungen.");
  console.log("Jetzt lokal pruefen: npx.cmd tsc --noEmit && npm.cmd run build");
}
try {main();} catch (e) {console.error("ABBRUCH: " + e.message);process.exitCode=1;}
