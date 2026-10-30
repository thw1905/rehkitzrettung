"use strict";
// DJI_AIRCRAFT_JSBRIDGE_V7: no schema change, no map/WS/PinPoint change.
const fs=require("node:fs"), path=require("node:path"), crypto=require("node:crypto");
const root=process.cwd(),check=process.argv.includes("--check");
const ui="components/dji/PilotSimpleClient.tsx";
const mqtt="scripts/dji-akku-mqtt-v2.cjs";
const endpoint="app/api/dji/pilot2/aircraft-detect/route.ts";
const apiText="// DJI_AIRCRAFT_JSBRIDGE_V7: native DJI Pilot 2 SN recognition, without MQTT.\nimport { NextRequest, NextResponse } from \"next/server\";\nimport { getCurrentUserWithTeams } from \"@/lib/current-user\";\nimport { db } from \"@/lib/db\";\n\nexport const runtime = \"nodejs\";\nexport const dynamic = \"force-dynamic\";\nconst headers = { \"Cache-Control\": \"private, no-store\", \"Referrer-Policy\": \"no-referrer\" };\nfunction result(error: string, status = 400) {\n  return NextResponse.json({ error }, { status, headers });\n}\nexport async function POST(req: NextRequest) {\n  const origin = req.headers.get(\"origin\");\n  if (origin && origin !== req.nextUrl.origin) return result(\"Ungueltiger Ursprung.\", 403);\n  const user = await getCurrentUserWithTeams();\n  if (!user?.isApproved || (!user.isAdmin && user.role !== \"PILOT\")) {\n    return result(\"Nicht berechtigt.\", 403);\n  }\n  let body: unknown;\n  try { body = await req.json(); }\n  catch { return result(\"Ungueltiges JSON.\"); }\n  const raw = body && typeof body === \"object\" && !Array.isArray(body)\n    ? (body as { serialNumber?: unknown }).serialNumber : null;\n  const sn = typeof raw === \"string\" ? raw.trim() : \"\";\n  if (!/^[A-Za-z0-9_-]{5,80}$/.test(sn)) return result(\"DJI-Seriennummer ungueltig.\");\n\n  let aircraft = await db.djiAircraft.findUnique({ where: { serialNumber: sn } });\n  if (!aircraft) {\n    // Identifikation per echter DJI-SN, Modell erst durch Topologie/OSD ermitteln.\n    for (const label of [`DJI (${sn.slice(-8)})`, `DJI (${sn})`]) {\n      try {\n        aircraft = await db.djiAircraft.create({\n          data: { label, model: \"Noch nicht ermittelt\", serialNumber: sn },\n        });\n        break;\n      } catch (error) {\n        if (!(error && typeof error === \"object\" && \"code\" in error && error.code === \"P2002\")) {\n          console.error(\"DJI-SN-Erkennung: Datenbankfehler\");\n          return result(\"Drohne konnte nicht registriert werden.\", 500);\n        }\n        // Gleichzeitige Anmeldung oder zufaellige identische Label-Endung.\n        aircraft = await db.djiAircraft.findUnique({ where: { serialNumber: sn } });\n        if (aircraft) break;\n      }\n    }\n  }\n  if (!aircraft) return result(\"Drohne konnte nicht registriert werden.\", 409);\n  if (!aircraft.isActive) return result(\"Diese Drohne ist in der Verwaltung deaktiviert.\", 409);\n  // Niemals Akku-SNs, Admin-Felder oder interne Geraetewerte an Piloten zurueckgeben.\n  return NextResponse.json({ aircraft: { id: aircraft.id, label: aircraft.label } }, { headers });\n}\n";
const helper="// DJI_AIRCRAFT_JSBRIDGE_V7: DJI returns SN as plain text or bridge response JSON.\nfunction parseDjiAircraftSn(raw: unknown): string | null {\n  let value: unknown = raw;\n  if (typeof value === \"string\") {\n    const trimmed = value.trim();\n    if (trimmed.startsWith(\"{\") || trimmed.startsWith('\"')) {\n      try { value = JSON.parse(trimmed) as unknown; }\n      catch { value = trimmed; }\n    } else value = trimmed;\n  }\n  if (value && typeof value === \"object\" && !Array.isArray(value)) {\n    const reply = value as { code?: unknown; data?: unknown; sn?: unknown };\n    if (typeof reply.code === \"number\" && reply.code !== 0) return null;\n    value = reply.data ?? reply.sn;\n    if (value && typeof value === \"object\" && !Array.isArray(value)) {\n      const details = value as { sn?: unknown; serialNumber?: unknown; aircraftSN?: unknown };\n      value = details.sn ?? details.serialNumber ?? details.aircraftSN;\n    }\n  }\n  if (typeof value !== \"string\") return null;\n  const sn = value.trim();\n  return /^[A-Za-z0-9_-]{5,80}$/.test(sn) && !/^(undefined|null|unknown|false)$/i.test(sn) ? sn : null;\n}\n\n";
const effect="  // DJI_AIRCRAFT_JSBRIDGE_V7: die Drohne ohne MQTT und ohne Tagesauftrag erkennen.\n  useEffect(() => {\n    if (auth !== \"authenticated\" || !allowed) return;\n    const b = bridge();\n    if (!b?.platformGetAircraftSN) {\n      setAircraftDetection(\"Automatische Erkennung nur in DJI Pilot 2 moeglich.\");\n      return;\n    }\n    let cancelled = false;\n    let inFlight = false;\n    let lastDetectedSn = \"\";\n    async function syncAircraft() {\n      if (cancelled || inFlight) return;\n      let sn: string | null;\n      try { sn = parseDjiAircraftSn(b?.platformGetAircraftSN?.()); }\n      catch { return; }\n      if (!sn || sn === lastDetectedSn) return;\n      inFlight = true;\n      try {\n        const detected = await api<{ aircraft: AircraftChoice }>(\"/api/dji/pilot2/aircraft-detect\", {\n          method: \"POST\", headers: { \"Content-Type\": \"application/json\" },\n          body: JSON.stringify({ serialNumber: sn }),\n        });\n        if (cancelled) return;\n        lastDetectedSn = sn;\n        setAircraftChoices((old) => old.some((a) => a.id === detected.aircraft.id)\n          ? old : [...old, detected.aircraft].sort((a, z) => a.label.localeCompare(z.label)));\n        setSelectedAircraft(detected.aircraft.id);\n        setAircraftDetection(\"Verbundene DJI-Drohne automatisch erkannt.\");\n      } catch (error) {\n        if (!cancelled) setAircraftDetection(error instanceof Error ? error.message : \"Drohne konnte nicht erkannt werden.\");\n      } finally { inFlight = false; }\n    }\n    void syncAircraft();\n    const timer = window.setInterval(() => void syncAircraft(), 10000);\n    return () => { cancelled = true; window.clearInterval(timer); };\n  }, [auth, allowed]);\n\n";
const oldModel="  if (existing) {\n    // Bereits manuell vergebene Bezeichnung niemals aendern, inaktive nicht reaktivieren.\n    return existing;\n  }\n";
const newModel="  if (existing) {\n    // DJI_AIRCRAFT_JSBRIDGE_V7: V7 hat die Seriennummer ggf. schon vor MQTT erkannt.\n    // Die DJI-Modellinformation nachtragen, manuelle Beschriftung respektieren.\n    if (existing.model === \"Noch nicht ermittelt\") {\n      const autoLabel = `DJI (${entry.serialNumber.slice(-8)})`;\n      const data = { model: entry.model,\n        ...(existing.label === autoLabel ? { label: `${entry.model} (${entry.serialNumber.slice(-8)})` } : {}),\n      };\n      try { return await db.djiAircraft.update({ where: { id: existing.id }, data }); }\n      catch (error) {\n        // Bei gleichlautenden automatisch generierten Namen nur das Modell aktualisieren.\n        if (error?.code !== \"P2002\") throw error;\n        return await db.djiAircraft.update({ where: { id: existing.id }, data: { model: entry.model } });\n      }\n    }\n    // Bereits manuell vergebene Bezeichnung niemals aendern, inaktive nicht reaktivieren.\n    return existing;\n  }\n";
function changeOnce(text, search, replacement, name) {
  if (text.split(search).length !== 2) throw Error(`Nicht eindeutiger oder fehlender Abschnitt: ${name}`);
  return text.replace(search,replacement);
}
function digest(data) { return crypto.createHash("sha256").update(data).digest("hex"); }
try {
  if (!fs.existsSync(path.join(root,"package.json"))) throw Error("Bitte im Rehkitzrettungs-Projekt starten.");
  const a=fs.readFileSync(path.join(root,ui),"utf8");
  const b=fs.readFileSync(path.join(root,mqtt),"utf8");
  if (!a.includes("DJI_AKKU_V4") || !b.includes("DJI_AUTOERKENNUNG_V5")) throw Error("V4-Oberflaeche oder V5-Empfaenger fehlt.");
  if (a.includes("DJI_AIRCRAFT_JSBRIDGE_V7") || b.includes("DJI_AIRCRAFT_JSBRIDGE_V7")) {
    if (a.includes("DJI_AIRCRAFT_JSBRIDGE_V7") && b.includes("DJI_AIRCRAFT_JSBRIDGE_V7") && fs.existsSync(path.join(root,endpoint))) {
      console.log("V7 bereits installiert; keine Dateien veraendert."); process.exit(0);
    }
    throw Error("Unvollstaendige V7-Installation erkannt, Abbruch.");
  }
  if (fs.existsSync(path.join(root,endpoint))) throw Error("Erkennungs-API existiert bereits, Abbruch.");
  let next=a;
  next=changeOnce(next,
    '  thingGetConnectState?: () => string | boolean;',
    '  thingGetConnectState?: () => string | boolean;\n  platformGetAircraftSN?: () => string;',"DJI-Bridge-Typ");
  next=changeOnce(next,'function bridge(): DjiBridge | null {',helper+'function bridge(): DjiBridge | null {',"DJI-SN-Parser");
  next=changeOnce(next,'  const [selectedAircraft, setSelectedAircraft] = useState("");',
    '  const [selectedAircraft, setSelectedAircraft] = useState("");\n  const [aircraftDetection, setAircraftDetection] = useState("Drohne wird automatisch erkannt ...");',"State");
  next=changeOnce(next,'  // Aktuelles Fluggeraet ist eine Auswahl fuer die Sitzung, KEINE dauerhafte Piloten-Zuordnung.',
    effect+'  // Aktuelles Fluggeraet ist eine Auswahl fuer die Sitzung, KEINE dauerhafte Piloten-Zuordnung.',"Autosynchronisierung");
  next=changeOnce(next,'              {selectedAircraft && batteryRecommendation && (',
    '              <p className="text-xs text-slate-600" role="status">{aircraftDetection}</p>\n              {selectedAircraft && batteryRecommendation && (',"Statusanzeige");
  const updatedReceiver=changeOnce(b,oldModel,newModel,"V5-Modellnachtrag");
  if (!next.includes("DJI_AIRCRAFT_JSBRIDGE_V7") || !updatedReceiver.includes("DJI_AIRCRAFT_JSBRIDGE_V7")) {
    throw Error("V7 Marker fehlt.");
  }
  if (check) {
    console.log("VORPRUEFUNG OK: V4 + V5 kompatibel. DJI-SN automatisch erkennen, Backend-API anlegen, V5-Modell nachtragen.");
    console.log("Keine Prisma-Migration, keine Aenderung an DJI WebSocket/PinPoints/Mosquitto/VPN.");
    process.exit(0);
  }
  const base=path.join(root,".backups","dji-aircraft-jsbridge-v7-"+new Date().toISOString().replace(/[:.]/g,"-"));
  for (const f of [ui,mqtt]) {
    const target=path.join(base,f); fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(root,f),target,fs.constants.COPYFILE_EXCL);
  }
  const created=[];
  try {
    fs.mkdirSync(path.dirname(path.join(root,endpoint)),{recursive:true});
    fs.writeFileSync(path.join(root,endpoint),apiText,{flag:"wx",encoding:"utf8"});created.push(endpoint);
    fs.writeFileSync(path.join(root,ui),next,"utf8");
    fs.writeFileSync(path.join(root,mqtt),updatedReceiver,"utf8");
  } catch (e) {
    for (const f of [ui,mqtt]) {
      try {fs.copyFileSync(path.join(base,f),path.join(root,f));}catch{}
    }
    for (const f of created) {try{fs.unlinkSync(path.join(root,f));}catch{}}
    throw e;
  }
  console.log("V7 installiert: Drohne per DJI-JSBridge-SN erkennen, Modell spaeter per V5 aktualisieren.");
  console.log("Sicherung: "+base);
  console.log("Sicherheit: Nur freigegebene PILOT/Admin-Nutzer; keine Datenbankmigration; MQTT/WS/PinPoints unberuehrt.");
}catch(e){ console.error("ABBRUCH: "+(e instanceof Error?e.message:String(e)));process.exitCode=1; }
