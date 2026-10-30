/*
 * Straßenrouting nach dem bereits installierten Paket
 * 'rehkitzrettung-teamrouten-und-teamtreffpunkte'.
 * Keine DB-Migration. Ändert nur die Routen-API und gezielte UI-Texte.
 * Prüft die Ausgangsversion, sichert Dateien und bricht bei Abweichungen ab.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const source = __dirname;
const uiRel = "components/day-assignments/day-assignments-page-client.tsx";
const apiRel = "app/api/day-assignments/optimize-route/route.ts";
const roadRel = "lib/team-routes/road-routing.ts";
const OLD_API_HASH = "43d834a2639a9263167516aad53ec8bbae72ca223c83f6c22bf027cdea1167ad";
const normalize = (text) => text.replace(/\r\n/g, "\n");
const get = (file) => fs.readFileSync(file, "utf8");
const sha = (text) => crypto.createHash("sha256").update(normalize(text)).digest("hex");
const dest = (relative) => path.join(root, relative);
const src = (relative) => path.join(source, relative);
function fail(message) {
  console.error("\nINSTALLATION ABGEBROCHEN: " + message);
  console.error("Keine Programmdateien verändert, sofern kein ausdrücklicher Rollback-Hinweis erscheint.");
  process.exit(1);
}
function replaceExactlyOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: erwarteter Ausgangstext ${count} statt genau einmal gefunden. Vorhandene Version bitte prüfen.`);
  }
  return text.replace(before, after);
}
function editUi(old) {
  let text = normalize(old);
  text = replaceExactlyOnce(
    text,
    'Nach dem Zuweisen werden die Aufträge automatisch nach GPS-Luftlinien optimiert.',
    'Nach dem Zuweisen werden die Aufträge automatisch nach Straßen-Fahrzeit optimiert (bei Ausfall ersatzweise Luftlinie).',
    "Routenbeschreibung"
  );
  text = replaceExactlyOnce(
    text,
    'return data as { orderIds:string[];distanceKm:number|null;missingCoordinates:string[] };',
    'return data as { orderIds:string[];distanceKm:number|null;durationMinutes:number|null;routeMode:"strasse"|"luftlinie";warning:string|null;missingCoordinates:string[] };',
    "API-Rückgabewert"
  );
  text = replaceExactlyOnce(
    text,
    'if (result.missingCoordinates.length) warnings.push(`${teamId}: ${result.missingCoordinates.length} Fläche(n) ohne GPS, am Ende eingeordnet.`);',
    'if (result.missingCoordinates.length) warnings.push(`${teamId}: ${result.missingCoordinates.length} Fläche(n) ohne GPS, am Ende eingeordnet.`);\n          if (result.warning) warnings.push(`${teamId}: ${result.warning}`);',
    "Warnung bei neuer Zuweisung"
  );
  text = replaceExactlyOnce(
    text,
    'const distance=result.distanceKm === null ? "" : ` · ca. ${result.distanceKm.toFixed(1).replace(".",",")} km Luftlinie`;\n      await loadData(selectedDate);\n      setRouteInfo(`Route optimiert${distance}${result.missingCoordinates.length ? ` · ${result.missingCoordinates.length} ohne GPS am Ende` : ""}`);',
    'const road = result.routeMode === "strasse";\n      const distance=result.distanceKm === null ? "" : ` · ca. ${result.distanceKm.toFixed(1).replace(".",",")} km ${road ? "Straße" : "Luftlinie"}`;\n      const duration=road && result.durationMinutes !== null ? ` · ca. ${result.durationMinutes.toFixed(1).replace(".",",")} min Fahrzeit` : "";\n      await loadData(selectedDate);\n      setRouteInfo(`${road ? "Straßenroute" : "Luftlinien-Route"} optimiert${distance}${duration}${result.missingCoordinates.length ? ` · ${result.missingCoordinates.length} ohne GPS am Ende` : ""}${result.warning ? ` · Hinweis: ${result.warning}` : ""}`);',
    "Ergebnisanzeige der Route"
  );
  text = replaceExactlyOnce(
    text,
    '{routeInfo && <p className="mt-2 text-sm font-semibold text-green-800">{routeInfo}</p>}',
    '{routeInfo && <p className={`mt-2 text-sm font-semibold ${routeInfo.includes("Luftlinie") ? "text-amber-800" : "text-green-800"}`}>{routeInfo}</p>}',
    "Statusfarbe für Ersatzroute"
  );
  text = replaceExactlyOnce(
    text,
    '"Route automatisch optimieren"',
    '"Straßenroute automatisch optimieren"',
    "Knopfbeschriftung"
  );
  return old.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text;
}

try {
  if (!fs.existsSync(dest("package.json"))) fail("Bitte in C:\\Projekte\\rehkitzrettung ausführen (package.json fehlt).");
  for (const relative of [uiRel, apiRel]) {
    if (!fs.existsSync(dest(relative))) fail("Vorhandene Programmdatei fehlt: " + relative);
  }
  for (const relative of [apiRel, roadRel]) {
    if (!fs.existsSync(src(relative))) fail("Paket unvollständig: " + relative);
  }

  const oldApi = get(dest(apiRel));
  const newApi = get(src(apiRel));
  const newRoad = get(src(roadRel));
  const oldUi = get(dest(uiRel));
  const oldRoad = fs.existsSync(dest(roadRel)) ? get(dest(roadRel)) : null;

  // Idempotenz: bereits vollständig installierte Dateien nicht neu anfassen.
  if (sha(oldApi) === sha(newApi) &&
      oldUi.includes("Straßenroute automatisch optimieren") &&
      oldUi.includes('result.routeMode === "strasse"') &&
      oldRoad !== null && sha(oldRoad) === sha(newRoad)) {
    console.log("Straßenrouting ist bereits vollständig installiert. Keine Änderung nötig.");
    process.exit(0);
  }

  if (sha(oldApi) !== OLD_API_HASH) {
    fail("Die vorhandene Routen-API entspricht nicht dem hochgeladenen Originalpaket. Nichts überschreiben! Bitte diese Datei zur Prüfung hochladen: " + apiRel);
  }
  if (oldRoad !== null && sha(oldRoad) !== sha(newRoad)) {
    fail("Es existiert bereits ein anderes Straßenrouting-Modul: " + roadRel);
  }

  const changedUi = editUi(oldUi); // Vor jeder Änderung ALLE Textprüfungen abschließen.
  const changes = [
    { relative: apiRel, newContent: oldApi.includes("\r\n") ? normalize(newApi).replace(/\n/g,"\r\n") : normalize(newApi), oldContent: oldApi },
    { relative: uiRel, newContent: changedUi, oldContent: oldUi },
  ];
  if (oldRoad === null) changes.push({ relative: roadRel, newContent: newRoad, oldContent: null });

  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const backups = [];
  for (const entry of changes) {
    if (entry.oldContent === null) continue;
    const backup = dest(entry.relative) + ".backup-strassenrouting-" + suffix;
    fs.copyFileSync(dest(entry.relative), backup, fs.constants.COPYFILE_EXCL);
    backups.push({ original: dest(entry.relative), backup });
  }
  const written = [];
  try {
    for (const entry of changes) {
      const target = dest(entry.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      written.push(entry);
      fs.writeFileSync(target, entry.newContent, "utf8");
    }
  } catch (error) {
    // Bei Schreibfehlern: bekannte Originalstände vollständig zurückspielen.
    let rollbackErrors = [];
    for (const entry of written.reverse()) {
      try {
        if (entry.oldContent === null) fs.unlinkSync(dest(entry.relative));
        else fs.writeFileSync(dest(entry.relative), entry.oldContent, "utf8");
      } catch (rollback) { rollbackErrors.push(String(rollback)); }
    }
    throw new Error("Schreibfehler: " + String(error) + (rollbackErrors.length ? "; MANUELLER ROLLBACK NÖTIG: " + rollbackErrors.join("; ") : "; automatische Rücksetzung abgeschlossen"));
  }

  console.log("\nStraßenrouting installiert. Geänderte Dateien:");
  for (const { relative } of changes) console.log(" - " + relative);
  console.log("Sicherungen: *.backup-strassenrouting-" + suffix);
  console.log("Keine Prisma-Migration erforderlich.");
  console.log("Als Nächstes: API-Key in .env.local/.env setzen, npx tsc --noEmit, npm run build, npm run dev.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
