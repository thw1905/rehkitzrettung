/*
 * Straßenrouting nach dem bereits installierten Paket
 * 'rehkitzrettung-teamrouten-und-teamtreffpunkte'.
 * Keine DB-Migration. Ändert nur die Routen-API und gezielte UI-Texte.
 * V2: erkennt alte oder bereits entpackte API, sichert alle geaenderten Dateien.
 * Nutzdaten liegen in eigenem Unterordner, entpacken ueberschreibt keinen App-Code.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const source = path.join(__dirname, "strassenrouting-paket-v2");
const uiRel = "components/day-assignments/day-assignments-page-client.tsx";
const apiRel = "app/api/day-assignments/optimize-route/route.ts";
const roadRel = "lib/team-routes/road-routing.ts";
const OLD_API_HASH = "43d834a2639a9263167516aad53ec8bbae72ca223c83f6c22bf027cdea1167ad";
const normalize = (text) => text.replace(/\r\n/g, "\n");
const get = (file) => fs.readFileSync(file, "utf8");
const sha = (text) => crypto.createHash("sha256").update(normalize(text)).digest("hex");
const dest = (relative) => path.join(root, relative);
const src = (relative) => path.join(source, relative === apiRel ? "route.ts" : relative === roadRel ? "road-routing.ts" : relative);
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

  // API-Versionen: original Luftlinie ODER bereits entpackte Strassenrouten-API.
  // Alles andere ist eine unbekannte, potentiell angepasste Benutzerversion.
  const oldApiHash = sha(oldApi);
  const newApiHash = sha(newApi);
  if (oldApiHash !== OLD_API_HASH && oldApiHash !== newApiHash) {
    fail("Unbekannte Routen-API. Nichts ueberschrieben. Bitte aktuelle Datei hochladen: " + apiRel);
  }
  if (oldRoad !== null && sha(oldRoad) !== sha(newRoad)) {
    fail("Anderes Strassenrouting-Modul vorhanden. Nichts ueberschrieben: " + roadRel);
  }

  // Sechs voneinander abhaengige UI-Aenderungen duerfen nicht nur teilweise
  // vorhanden sein. Teilinstallationen mit eigenen Aenderungen nicht erzwingen.
  const updatedUiParts = [
    'Nach dem Zuweisen werden die Aufträge automatisch nach Straßen-Fahrzeit optimiert (bei Ausfall ersatzweise Luftlinie).',
    'return data as { orderIds:string[];distanceKm:number|null;durationMinutes:number|null;routeMode:"strasse"|"luftlinie";warning:string|null;missingCoordinates:string[] };',
    'if (result.warning) warnings.push(`${teamId}: ${result.warning}`);',
    'const road = result.routeMode === "strasse";',
    'routeInfo.includes("Luftlinie") ? "text-amber-800" : "text-green-800"',
    '"Straßenroute automatisch optimieren"',
  ];
  const uiIsNew = updatedUiParts.every((part) => normalize(oldUi).includes(part));
  // editUi() checks all six old variants using exact match before ANY write.
  // Mixed or unknown UI versions fail safely instead of overwriting customizations.
  const changedUi = uiIsNew ? null : editUi(oldUi);

  const changes = [];
  if (oldApiHash !== newApiHash) {
    changes.push({ relative: apiRel,
      newContent: oldApi.includes("\r\n") ? normalize(newApi).replace(/\n/g,"\r\n") : normalize(newApi), oldContent: oldApi });
  }
  if (changedUi !== null && changedUi !== oldUi) {
    changes.push({ relative: uiRel, newContent: changedUi, oldContent: oldUi });
  }
  if (oldRoad === null) changes.push({ relative: roadRel, newContent: newRoad, oldContent: null });

  if (changes.length === 0) {
    console.log("Strassenrouting bereits vollstaendig installiert. Keine Aenderungen noetig.");
    process.exit(0);
  }

  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "");
  for (const entry of changes) {
    if (entry.oldContent === null) continue;
    const backup = dest(entry.relative) + ".backup-strassenrouting-" + suffix;
    fs.copyFileSync(dest(entry.relative), backup, fs.constants.COPYFILE_EXCL);
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
  console.log("Sicherungen (nur ersetzte Dateien): *.backup-strassenrouting-" + suffix);
  console.log("Keine Prisma-Migration erforderlich.");
  console.log("Als Nächstes: API-Key in .env.local/.env setzen, npx tsc --noEmit, npm run build, npm run dev.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
