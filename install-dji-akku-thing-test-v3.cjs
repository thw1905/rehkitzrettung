"use strict";
// DJI_AKKU_THING_TEST_V3 - DIAGNOSE ONLY. No migration, no MQTT secrets inside repo.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const oldFile = "components/dji/PilotSimpleClient.tsx";
const newFile = "app/api/dji/pilot2/thing-test/route.ts";
const patch = [["  wsDisconnect?: () => string;\n", "  wsDisconnect?: () => string;\n  thingGetConnectState?: () => string | boolean;\n"], ["type DjiWindow = Window & { djiBridge?: DjiBridge; rehkitzQuickWsCallback?: (value: unknown) => void };", "type DjiWindow = Window & { djiBridge?: DjiBridge; rehkitzQuickWsCallback?: (value: unknown) => void; rehkitzThingCallback?: (value: unknown) => void };"], ["type MapConfig = { workspaceId: string; groupId: string; autoImportEnabled: boolean };", "type MapConfig = { workspaceId: string; groupId: string; autoImportEnabled: boolean };\ntype ThingConfig = { host: string; username: string; password: string };"], ["  const [preview, setPreview] = useState<Preview | null>(null);", "  const [preview, setPreview] = useState<Preview | null>(null);\n  const [thingBusy, setThingBusy] = useState(false);\n  const [thingStatus, setThingStatus] = useState(\"Noch nicht getestet.\");"], ["  async function checkPoints() {", "  // DJI_AKKU_THING_TEST_V3: Separate Admin-Diagnose, kein Einfluss auf Map/WS/PinPoints.\n  async function testThingConnection() {\n    if (!user?.isAdmin || !isConnected || !token || thingBusy || busy) return;\n    setThingBusy(true);\n    setThingStatus(\"DJI-Telemetrieverbindung wird gestartet ...\");\n    try {\n      const b = bridge();\n      if (!b?.platformLoadComponent) throw new Error(\"Nur in DJI Pilot 2 verfuegbar.\");\n      const config = await api<ThingConfig>(\"/api/dji/pilot2/thing-test\", post(token));\n      (window as DjiWindow).rehkitzThingCallback = (value: unknown) => {\n        const connection = b.thingGetConnectState\n          ? truthy(b.thingGetConnectState()) : truthy(value);\n        setThingStatus(connection === true\n          ? \"MQTT-Verbindung von DJI bestaetigt.\"\n          : connection === false\n            ? \"DJI meldet MQTT nicht verbunden (Zertifikat/Host pruefen).\"\n            : \"DJI-Rueckmeldung vorhanden; MQTT-Status noch nicht eindeutig.\");\n      };\n      assertDji(b.platformLoadComponent(\"thing\", JSON.stringify({\n        host: config.host,\n        username: config.username,\n        password: config.password,\n        connectCallback: \"rehkitzThingCallback\",\n      })), \"DJI-Telemetriemodul\");\n      const connection = b.thingGetConnectState ? truthy(b.thingGetConnectState()) : null;\n      setThingStatus(connection === true\n        ? \"MQTT-Verbindung von DJI bestaetigt.\"\n        : \"DJI-Modul gestartet; auf MQTT-Rueckmeldung warten.\");\n    } catch (e) {\n      setThingStatus(e instanceof Error ? e.message : \"DJI-Telemetrietest fehlgeschlagen.\");\n    } finally {\n      setThingBusy(false);\n    }\n  }\n\n  async function checkPoints() {"], ["              {user?.isAdmin && (\n                <section className=\"space-y-3 rounded-xl border bg-slate-50 p-3\">\n                  <h2 className=\"font-semibold\">GPS-Zuordnung kontrollieren</h2>", "              {user?.isAdmin && (\n                <section className=\"space-y-2 rounded-xl border bg-slate-50 p-3\">\n                  <h2 className=\"font-semibold\">Akku-Telemetrie (Test)</h2>\n                  <p className=\"text-sm text-slate-600\">\n                    Nur fuer Administratoren. Startet das DJI-MQTT-Modul zusaetzlich zur bestehenden PinPoint-Verbindung.\n                  </p>\n                  <button\n                    type=\"button\"\n                    disabled={!isConnected || !token || thingBusy || busy}\n                    onClick={() => void testThingConnection()}\n                    className=\"w-full rounded-lg border p-3 font-semibold disabled:opacity-50\"\n                  >\n                    {thingBusy ? \"MQTT wird gestartet ...\" : \"DJI-Akkudaten-Verbindung testen\"}\n                  </button>\n                  <p className=\"text-sm\" role=\"status\">{thingStatus}</p>\n                </section>\n              )}\n\n              {user?.isAdmin && (\n                <section className=\"space-y-3 rounded-xl border bg-slate-50 p-3\">\n                  <h2 className=\"font-semibold\">GPS-Zuordnung kontrollieren</h2>"]];
const route = "// DJI_AKKU_THING_TEST_V3: Admin-only optional Cloud-Modul-Test.\n// Fuehrt weder einen DJI-Map-Neustart noch Datenbankzugriffe aus.\nimport { NextRequest, NextResponse } from \"next/server\";\nimport { getCurrentUserWithTeams } from \"@/lib/current-user\";\nimport { checkDjiSession } from \"@/lib/dji/token\";\n\nexport const runtime = \"nodejs\";\nexport const dynamic = \"force-dynamic\";\nconst headers = {\n  \"Cache-Control\": \"private, no-store, max-age=0\",\n  \"Referrer-Policy\": \"no-referrer\",\n  \"X-Content-Type-Options\": \"nosniff\",\n};\n\nfunction responseError(error: string, status: number) {\n  return NextResponse.json({ error }, { status, headers });\n}\n\nexport async function POST(req: NextRequest) {\n  const user = await getCurrentUserWithTeams();\n  if (!user?.isAdmin || !user.isApproved) return responseError(\"Nur fuer Administratoren.\", 403);\n  const workspaceId = process.env.DJI_WORKSPACE_ID || \"\";\n  if (!workspaceId) return responseError(\"DJI-Workspace nicht eingerichtet.\", 503);\n  const body = await req.json().catch(() => null);\n  const token = typeof body?.token === \"string\" ? body.token : \"\";\n  const active = await checkDjiSession(token, workspaceId);\n  if (!active || active.pilotUserId !== user.id) return responseError(\"DJI-Sitzung nicht aktiv.\", 403);\n\n  // Kein Default fuer Geheimnisse! Einmalig nur auf dem Server in .env.production.local konfigurieren.\n  const host = process.env.DJI_MQTT_PILOT_HOST || \"\";\n  const username = process.env.DJI_MQTT_PILOT_USER || \"\";\n  const password = process.env.DJI_MQTT_PILOT_PASSWORD || \"\";\n  if (!/^tcp:\\/\\/[a-z0-9.-]+:\\d{2,5}$/i.test(host) || !username || !password) {\n    return responseError(\"MQTT-Testkonfiguration fehlt oder ist ungueltig.\", 503);\n  }\n  // Keine Speicherung, keine Protokollierung der Zugangsdaten.\n  return NextResponse.json({ host, username, password }, { headers });\n}\n";
function prepare() {
  const target = path.join(root, oldFile);
  if (!fs.existsSync(target) || !fs.existsSync(path.join(root, "package.json")))
    throw new Error("Installer muss im Rehkitzrettung-Projektordner gestartet werden.");
  const source = fs.readFileSync(target,"utf8");
  if (source.includes("DJI_AKKU_THING_TEST_V3")) {
    if (fs.existsSync(path.join(root,newFile)) && fs.readFileSync(path.join(root,newFile),"utf8") === route)
      return { already:true };
    throw new Error("V3 ist nur teilweise installiert oder wurde veraendert. Abbruch.");
  }
  if (fs.existsSync(path.join(root,newFile))) throw new Error("Zieldatei existiert bereits: "+newFile);
  let next = source;
  for(const [from,to] of patch) {
    if (next.split(from).length !== 2) throw new Error("Erwarteter Originalabschnitt fehlt/ist nicht eindeutig. Keine Aenderung: "+from.slice(0,65));
    next=next.replace(from,to);
  }
  return {next, target};
}
try {
  const info=prepare();
  if(info.already){console.log("DJI Akku MQTT Thing Test V3 bereits installiert."); process.exit(0);}
  if(checkOnly){console.log("VORPRUEFUNG OK: Nur "+oldFile+" (Oberflaeche) und neue "+newFile+". Kein DJI-Import-/WS-Code, keine Datenbank."); process.exit(0);}
  const backup=info.target+".backup-akku-thing-v3-"+new Date().toISOString().replace(/[:.]/g,"-");
  fs.copyFileSync(info.target,backup,fs.constants.COPYFILE_EXCL);
  const dest=path.join(root,newFile);
  try {
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,route,{flag:"wx"});
    fs.writeFileSync(info.target,info.next,"utf8");
  } catch (error) {
    try {fs.copyFileSync(backup,info.target);} catch {}
    try {if(fs.existsSync(dest) && fs.readFileSync(dest,"utf8")===route)fs.unlinkSync(dest);} catch {}
    throw error;
  }
  console.log("INSTALLATION OK: Admin-Thing-Test V3; gesichert nach "+backup);
  console.log("HINWEIS: DJI_MQTT_PILOT_HOST, DJI_MQTT_PILOT_USER, DJI_MQTT_PILOT_PASSWORD nur auf Ubuntu setzen.");
}catch(error){console.error("ABBRUCH: "+error.message);process.exitCode=1;}
