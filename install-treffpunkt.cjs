/*
 * Lokal aus dem Projekt-Hauptverzeichnis starten: node .\install-treffpunkt.cjs
 * Bricht ohne Dateiveraenderungen ab, wenn die aktuelle Programmstruktur abweicht.
 */
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "");
const planned = new Map();
const p = (...parts) => path.join(root, ...parts);
const normalize = s => s.replace(/\r\n/g, "\n");

function openFile(rel) {
  const absolute = p(rel);
  if (!fs.existsSync(absolute)) throw new Error(`Datei fehlt: ${rel}`);
  const text = normalize(fs.readFileSync(absolute, "utf8"));
  return { absolute, text };
}
function edit(rel, cb) {
  const f = openFile(rel);
  const next = cb(f.text);
  if (typeof next !== "string") throw new Error(`Änderung fehlgeschlagen: ${rel}`);
  if (next !== f.text) planned.set(f.absolute, { previous: f.text, next });
}
function replace(s, from, to, label) {
  if (s.includes(to)) return s;
  const occurrences = s.split(from).length - 1;
  if (occurrences !== 1) throw new Error(`${label}: erwartete Stelle ${occurrences}x gefunden (erwartet 1).`);
  return s.replace(from, to);
}
function injectBefore(s, needle, add, label) {
  if (s.includes(add.trim())) return s;
  return replace(s, needle, add + needle, label);
}
function findDayAssignmentsClient() {
  const results = [];
  for (const base of ["app", "components"]) {
    const basePath = p(base);
    if (!fs.existsSync(basePath)) continue;
    const stack = [basePath];
    while (stack.length) {
      const current = stack.pop();
      for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
        if (["node_modules", ".next", ".git"].includes(dirent.name)) continue;
        const full = path.join(current, dirent.name);
        if (dirent.isDirectory()) stack.push(full);
        else if (/\.tsx$/.test(dirent.name)) {
          const content = fs.readFileSync(full, "utf8");
          if (content.includes("function DayAssignmentsPageClient()") && content.includes("/api/day-assignments")) results.push(path.relative(root, full));
        }
      }
    }
  }
  if (results.length !== 1) throw new Error(`Tagesplanungsseite nicht eindeutig gefunden (${results.length} Dateien): ${results.join(", ")}`);
  return results[0];
}

try {
  // A: Datenbankschema – manuell nur bei Bedarf, sonst automatische Flaechen-Zuordnung.
  edit("prisma/schema.prisma", s => {
    if (s.includes("meetingPointText")) return s;
    if (!/model OperationDay\s*\{/.test(s)) throw new Error("Datenbankschema: OperationDay-Modell fehlt.");
    return s.replace(/(model OperationDay\s*\{[\s\S]*?\bmeetingTime\s+String\?[^\n]*\n)/,
      (match) => match + "  meetingPointText String?\n");
  });
  if (!openFile("prisma/schema.prisma").text.includes("meetingPointText") &&
    !planned.get(p("prisma/schema.prisma"))?.next.includes("meetingPointText")) {
    throw new Error("Schema: meetingPointText konnte nicht hinzugefügt werden.");
  }

  // B: API sendet dieselbe aufgeloeste Angabe an die Helfer und Paechter.
  edit("app/api/web-push/notify-operation-day/route.ts", s => {
    if (s.includes("getOperationDayMeetingPoint")) return s; // bereits installiert
    s = injectBefore(s, 'import { db } from "@/lib/db";',
      'import { getOperationDayMeetingPoint } from "@/lib/operation-day-meeting-point";\n', "Benachrichtigung: Import");
    s = replace(s,
      "  meetingText: string;\n  operationDayId: string;",
      "  meetingText: string;\n  meetingPointText: string;\n  operationDayId: string;",
      "Benachrichtigung: Parameter");
    s = replace(s, "      treffzeit: params.meetingText.trim(),",
      "      treffzeit: params.meetingText.trim(),\n      treffpunkt: params.meetingPointText,",
      "Benachrichtigung: Platzhalterwerte");
    s = replace(s,
      'import { renderRevierMailText } from "@/lib/revier-owner-mail-template";',
      'import { renderRevierMailText, ensureRevierMailMeetingPoint } from "@/lib/revier-owner-mail-template";',
      "Benachrichtigung: Vorlagenimport");
    s = replace(s,
      "renderRevierMailText(mailTemplate.body, templateValues)",
      "renderRevierMailText(ensureRevierMailMeetingPoint(mailTemplate.body), templateValues)",
      "Benachrichtigung: Vorlagenrendern");
    s = injectBefore(s,
      "    const plannedUserIds = new Set<string>();",
      `    if (!operationDay.meetingTime?.trim()) {
      return NextResponse.json(
        { error: "Bitte zuerst eine Treffzeit für den Einsatztag speichern." },
        { status: 400 },
      );
    }

    // Server entscheidet ueber den Treffpunkt (nicht der Browser).\n    const point = await getOperationDayMeetingPoint(operationDay.id);\n    if (!point.text) {\n      return NextResponse.json(\n        { error: "Kein Treffpunkt vorhanden. Bitte in der Tagesplanung einen Treffpunkt festlegen und speichern." },\n        { status: 400 },\n      );\n    }\n\n`, "Benachrichtigung: Treffpunktermittlung");
    const old = /const plannedMessage = `Du bist für den Einsatz am \$\{displayDate\}\$\{[\s\S]*?\} eingeplant\. Bitte öffne die App, prüfe deine Aufträge und bestätige die Kenntnisnahme\.`;/;
    if (!old.test(s)) throw new Error("Benachrichtigung: Pushtext hat sich geändert; bitte aktuelle Datei senden.");
    s = s.replace(old,
      'const plannedMessage = `Du bist für den Einsatz am ${displayDate} eingeplant.\\n${meetingText}\\nTreffpunkt:\\n${point.text}\\nBitte öffne die App, prüfe deine Aufträge und bestätige die Kenntnisnahme.`;');
    s = replace(s,
      "      meetingText,\n      operationDayId: operationDay.id,",
      "      meetingText,\n      meetingPointText: point.text,\n      operationDayId: operationDay.id,",
      "Benachrichtigung: Treffpunkt an Paechter");
    return s;
  });

  // C: Platzhalter und Standardvorlage (bestehende gespeicherte Texte NICHT ueberschreiben).
  edit("lib/revier-owner-mail-template.ts", s => {
    if (s.includes("ensureRevierMailMeetingPoint")) return s;
    s = replace(s, "{{treffzeit}}\n", "{{treffzeit}}\n\nTreffpunkt:\n{{treffpunkt}}\n", "Reviermail: Standardtext");
    s = s.replace(/(\s*\{ key: "treffzeit",[^\n]*\n)/,
      '$1  { key: "treffpunkt", label: "Treffpunkt des Einsatztages mit Standortangabe und ggf. Kartenlink" },\n');
    if (!s.includes('key: "treffpunkt"')) throw new Error("Reviermail: Platzhalterliste nicht aktualisiert.");
    s = replace(s,
      '  treffzeit: "Treffzeit: 06:00 Uhr.",',
      '  treffzeit: "Treffzeit: 06:00 Uhr.",\n  treffpunkt: "Wiesenweg bei Hittfeld\\nGPS: 53.384000, 9.977000\\nKarte: https://www.google.com/maps/search/?api=1&query=53.384000%2C9.977000",',
      "Reviermail: Beispielwerte");
    s = injectBefore(s,
      "export function renderRevierMailText(",
      `/**\n * Bei aelteren gespeicherten Vorlagen den Treffpunkt in die Mail einfuegen,\n * ohne den in der Datenbank bearbeiteten Text zu veraendern.\n * Der Block erscheint niemals hinter der Grussformel.\n */\nexport function ensureRevierMailMeetingPoint(body: string): string {\n  if (/{{\\s*treffpunkt\\s*}}/i.test(body)) return body;\n  const block = "\\n\\nTreffpunkt:\\n{{treffpunkt}}";\n  const time = /{{\\s*treffzeit\\s*}}/i.exec(body);\n  if (time) {\n    const at = time.index + time[0].length;\n    return body.slice(0, at) + block + body.slice(at);\n  }\n  const header = /(?:^|\\n)\\s*Betroffene Reviere\\s*:/i.exec(body);\n  if (header) return body.slice(0, header.index) + block + "\\n" + body.slice(header.index);\n  const footer = /(?:^|\\n)\\s*(?:Viele Grüße|Mit freundlichen Grüßen|Freundliche Grüße|Beste Grüße|Herzliche Grüße|Diese Nachricht wurde automatisch erstellt)/i.exec(body);\n  if (footer) return body.slice(0, footer.index) + block + "\\n" + body.slice(footer.index);\n  return body.trimEnd() + block;\n}\n\n`, "Reviermail: Einfuegehilfe");
    return s;
  });

  // D: Vorschau und Testversand entsprechen dem echten Mailversand.
  edit("components/admin/revier-email-template-client.tsx", s => {
    if (s.includes("ensureRevierMailMeetingPoint")) return s;
    s = replace(s, "  renderRevierMailText, validateRevierMailTemplate,",
      "  renderRevierMailText, ensureRevierMailMeetingPoint, validateRevierMailTemplate,",
      "Vorlage UI: Import");
    return replace(s,
      "renderRevierMailText(body, EXAMPLE_REV_OWNER_MAIL_VALUES)",
      "renderRevierMailText(ensureRevierMailMeetingPoint(body), EXAMPLE_REV_OWNER_MAIL_VALUES)",
      "Vorlage UI: Vorschau");
  });
  edit("app/api/admin/revier-email-template/route.ts", s => {
    if (s.includes("ensureRevierMailMeetingPoint")) return s;
    s = replace(s,
      "renderRevierMailText, validateRevierMailTemplate",
      "renderRevierMailText, ensureRevierMailMeetingPoint, validateRevierMailTemplate",
      "Vorlagentest: Import");
    return replace(s,
      "renderRevierMailText(saved.body, EXAMPLE_REV_OWNER_MAIL_VALUES)",
      "renderRevierMailText(ensureRevierMailMeetingPoint(saved.body), EXAMPLE_REV_OWNER_MAIL_VALUES)",
      "Vorlagentest: Mailtext");
  });

  // E: Treffpunkt im Zuordnungsbildschirm.
  const client = findDayAssignmentsClient();
  edit(client, s => {
    if (s.includes("/* Treffpunkt Einsatztag */")) return s;
    s = injectBefore(s, "export default function DayAssignmentsPageClient() {",
      `type MeetingPointData = {\n  mode: "AUTO" | "MANUELL";\n  text: string;\n  autoText: string;\n  manualText: string;\n  sourceOrder: string | null;\n};\n\n`, "Tagesplanung: Treffpunkttyp");
    s = replace(s,
      "  const [savingMeetingTime, setSavingMeetingTime] = useState(false);",
      `  const [savingMeetingTime, setSavingMeetingTime] = useState(false);\n  /* Treffpunkt Einsatztag */\n  const [meetingPoint, setMeetingPoint] = useState<MeetingPointData | null>(null);\n  const [meetingPointMode, setMeetingPointMode] = useState<"AUTO" | "MANUELL">("AUTO");\n  const [manualMeetingPoint, setManualMeetingPoint] = useState("");\n  const [savingMeetingPoint, setSavingMeetingPoint] = useState(false);\n  const [meetingPointError, setMeetingPointError] = useState("");\n`, "Tagesplanung: Status");
    s = replace(s,
      "    setLoading(true);\n\n    try {",
      "    setLoading(true);\n    setMeetingPoint(null);\n    setMeetingPointError(\"\");\n\n    try {",
      "Tagesplanung: Zuruecksetzen");
    s = injectBefore(s,
      "      setMeetingTime(data.operationDay?.meetingTime || \"\");",
      `      const pointResponse = await fetch(\n        \`/api/operation-days/meeting-point?date=\${encodeURIComponent(date)}\`,\n        { cache: "no-store" },\n      );\n      const pointData = await pointResponse.json();\n      if (!pointResponse.ok) throw new Error(pointData.error || "Treffpunkt konnte nicht geladen werden.");\n      setMeetingPoint(pointData as MeetingPointData);\n      setMeetingPointMode(pointData.mode === "MANUELL" ? "MANUELL" : "AUTO");\n      setManualMeetingPoint(pointData.manualText || "");\n`, "Tagesplanung: Treffpunkt laden");
    s = injectBefore(s,
      "  async function notifyTeams() {",
      `  const meetingPointChanged = meetingPoint !== null && (\n    meetingPointMode !== meetingPoint.mode ||\n    (meetingPointMode === "MANUELL" && manualMeetingPoint.trim() !== meetingPoint.manualText)\n  );\n\n  async function saveMeetingPoint() {\n    if (meetingPointMode === "MANUELL" && !manualMeetingPoint.trim()) {\n      setMeetingPointError("Bitte einen manuellen Treffpunkt angeben.");\n      return;\n    }\n    setSavingMeetingPoint(true);\n    setMeetingPointError("");\n    try {\n      const response = await fetch("/api/operation-days/meeting-point", {\n        method: "PATCH",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({\n          date: selectedDate,\n          meetingPointText: meetingPointMode === "MANUELL" ? manualMeetingPoint.trim() : null,\n        }),\n      });\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.error || "Treffpunkt konnte nicht gespeichert werden.");\n      setMeetingPoint(data as MeetingPointData);\n      setMeetingPointMode(data.mode);\n      setManualMeetingPoint(data.manualText);\n    } catch (error) {\n      setMeetingPointError(error instanceof Error ? error.message : "Fehler beim Speichern.");\n    } finally { setSavingMeetingPoint(false); }\n  }\n\n`, "Tagesplanung: Speichern");
    s = replace(s,
      "  async function notifyTeams() {\n",
      "  async function notifyTeams() {\n    if (meetingPointChanged) { alert(\"Bitte Treffpunkt zuerst speichern.\"); return; }\n    if (!meetingPoint?.text) { alert(\"Bitte einen Treffpunkt festlegen, bevor Benachrichtigungen gesendet werden.\"); return; }\n    if (!meetingTime || savingMeetingTime) { alert(\"Bitte zuerst die Treffzeit speichern.\"); return; }\n",
      "Tagesplanung: Prüfung vor Versand");
    // Der Abschnitt steht unmittelbar vor den Ruecknavigation-/Senden-Buttons.
    const markup = `          {/* Treffpunkt des Einsatztages */}\n          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">\n            <h2 className="text-base font-bold text-gray-950">Treffpunkt für diesen Einsatztag</h2>\n            <p className="mt-1 text-sm text-gray-700">Standard: Treffpunkt der Fläche des ersten zugeteilten Auftrags. Du kannst stattdessen einen anderen Treffpunkt eingeben.</p>\n            <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-gray-900">\n              <label className="flex items-center gap-2">\n                <input type="radio" checked={meetingPointMode === "AUTO"} onChange={() => setMeetingPointMode("AUTO")} /> Automatisch\n              </label>\n              <label className="flex items-center gap-2">\n                <input type="radio" checked={meetingPointMode === "MANUELL"} onChange={() => setMeetingPointMode("MANUELL")} /> Manuell festlegen\n              </label>\n            </div>\n            {meetingPointMode === "AUTO" ? (\n              <div className="mt-3 rounded-xl bg-white p-3">\n                <div className="text-xs font-semibold text-gray-500">Erster Auftrag: {meetingPoint?.sourceOrder || "Noch keiner zugeteilt"}</div>\n                <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-sm text-gray-900">{meetingPoint?.autoText || "Für den ersten Auftrag ist noch kein Treffpunkt hinterlegt. Bitte in der Fläche einen Treffpunkt setzen oder manuell festlegen."}</pre>\n              </div>\n            ) : (\n              <div className="mt-3">\n                <label htmlFor="manual-day-point" className="block text-sm font-semibold text-gray-900">Treffpunkt / Adresse / GPS-Koordinaten</label>\n                <textarea id="manual-day-point" rows={3} maxLength={500} value={manualMeetingPoint} onChange={e => setManualMeetingPoint(e.target.value)} placeholder="z. B. Parkplatz am Sportplatz, Musterstraße 12, Hittfeld" className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-950" />\n              </div>\n            )}\n            {meetingPointError && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{meetingPointError}</p>}\n            {meetingPointChanged && <p className="mt-2 text-sm font-bold text-amber-800">Änderung noch nicht gespeichert. Erst speichern, dann benachrichtigen.</p>}\n            {meetingPointChanged && (\n              <button type="button" onClick={() => void saveMeetingPoint()} disabled={savingMeetingPoint} className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">\n                {savingMeetingPoint ? "Speichert ..." : "Treffpunkt speichern"}\n              </button>\n            )}\n            {!meetingPointChanged && meetingPoint?.text && <p className="mt-2 text-xs font-semibold text-green-900">Dieser Treffpunkt wird in Helfer-Benachrichtigungen und Revierpächter-Mails verwendet.</p>}\n          </div>\n\n`;
    s = injectBefore(s,
      '          <div className="mt-4 flex flex-wrap gap-2">',
      markup, "Tagesplanung: Bedienelement");
    // Vor dem echten Versand denselben Treffpunkt noch einmal bestaetigen.
    const oldConfirm = '`Möchtest du alle Teammitglieder für den ${selectedDate} benachrichtigen?`';
    const newConfirm = '`Einsatz am ${selectedDate}\\nTreffzeit: ${meetingTime || "nicht angegeben"}\\nTreffpunkt:\\n${meetingPoint?.text}\\n\\nHelfer benachrichtigen und Revierpächter-Mails senden?`';
    if (s.includes(oldConfirm)) s = s.replace(oldConfirm, newConfirm);
    s = replace(s,
      "disabled={notifying || dayTeams.length === 0}",
      "disabled={notifying || dayTeams.length === 0 || savingMeetingPoint || savingMeetingTime || !meetingTime || meetingPointChanged || !meetingPoint?.text}",
      "Tagesplanung: Versand-Sperre");
    // Nach dem Versand auch die Paechter-Mails sichtbar bestaetigen.
    const oldAlert = '`Benachrichtigung gesendet.\\nNutzer: ${data.notifiedUsers}\\nPushs: ${data.sentPushes}`';
    const newAlert = '`Benachrichtigungen ausgelöst.\\nGeplante Helfer: ${data.plannedUsers ?? 0}\\nPushs: ${data.sentPushes ?? 0}\\nRevierpächter-Mails: ${data.revierOwnerEmails?.sent ?? 0} von ${data.revierOwnerEmails?.recipients ?? 0}`';
    if (s.includes(oldAlert)) s = s.replace(oldAlert, newAlert);
    return s;
  });

  // Alle Prüfungen erfolgreich: Erst jetzt Änderungen mit Backups speichern.
  const changes = [...planned.entries()];
  if (!changes.length) { console.log("Treffpunkt-Erweiterung ist bereits installiert."); process.exit(0); }
  for (const [filename, data] of changes) {
    const backup = `${filename}.backup-treffpunkt-${runId}`;
    fs.writeFileSync(backup, data.previous, "utf8");
    fs.writeFileSync(filename, data.next, "utf8");
    console.log(`OK: ${path.relative(root, filename)} (Sicherung: ${path.basename(backup)})`);
  }
  console.log("Fertig. Bitte: npx prisma validate, npx prisma db push, npx prisma generate, npm run build.");
} catch (error) {
  console.error("INSTALLATION ABGEBROCHEN: " + (error instanceof Error ? error.message : String(error)));
  console.error("Vorherige Programmdateien wurden nicht verändert. Bitte Fehlermeldung senden.");
  process.exit(1);
}
