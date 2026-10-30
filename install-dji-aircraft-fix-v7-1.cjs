"use strict";
// DJI_AIRCRAFT_JSBRIDGE_V7_1: Verifizierung vor SN-Abfrage, Bridge erneut suchen.
// Keine Aenderung an MQTT, WS, PinPoints, Datenbank oder anderen Dateien.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const file = path.join(root, "components/dji/PilotSimpleClient.tsx");
const check = process.argv.includes("--check");
const start = '  // DJI_AIRCRAFT_JSBRIDGE_V7: die Drohne ohne MQTT und ohne Tagesauftrag erkennen.\n';
const end = '  // Aktuelles Fluggeraet ist eine Auswahl fuer die Sitzung, KEINE dauerhafte Piloten-Zuordnung.';
const replacement = `  // DJI_AIRCRAFT_JSBRIDGE_V7_1: DJI-Lizenz vor Seriennummernabfrage sicherstellen.
  // Kein geplanter Einsatz erforderlich. Die Bridge wird bei jedem Versuch neu gesucht.
  useEffect(() => {
    if (auth !== "authenticated" || !allowed) return;
    let cancelled = false;
    let inFlight = false;
    let lastDetectedSn = "";

    async function syncAircraft() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const b = bridge();
        if (!b?.platformGetAircraftSN || !b.platformVerifyLicense || !b.platformIsVerified) {
          if (!cancelled) setAircraftDetection("DJI-Schnittstelle noch nicht bereit. Bitte die Seite in DJI Pilot 2 öffnen.");
          return;
        }
        if (!djiVerified(b.platformIsVerified())) {
          if (!cancelled) setAircraftDetection("DJI-Lizenz wird für die Drohnenerkennung geprüft …");
          const license = await api<License>("/api/dji/pilot2/bridge-license");
          if (cancelled) return;
          assertDji(b.platformVerifyLicense(license.appId, license.appKey, license.license), "DJI-Lizenz für Drohnenerkennung");
          await waitForVerifiedApp(b);
        }
        if (cancelled) return;
        const sn = parseDjiAircraftSn(b.platformGetAircraftSN());
        if (!sn) {
          setAircraftDetection("DJI meldet noch keine Drohnenseriennummer. Drohne einschalten und verbinden.");
          return;
        }
        if (sn === lastDetectedSn) return;
        setAircraftDetection("DJI-Drohne erkannt – Registrierung wird geprüft …");
        const detected = await api<{ aircraft: AircraftChoice }>("/api/dji/pilot2/aircraft-detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serialNumber: sn }),
        });
        if (cancelled) return;
        lastDetectedSn = sn;
        setAircraftChoices((old) => old.some((a) => a.id === detected.aircraft.id)
          ? old : [...old, detected.aircraft].sort((a, z) => a.label.localeCompare(z.label)));
        setSelectedAircraft(detected.aircraft.id);
        setAircraftDetection("Verbundene DJI-Drohne automatisch erkannt.");
      } catch (error) {
        if (!cancelled) {
          setAircraftDetection("Drohnen-Erkennung: " +
            (error instanceof Error ? error.message : "Unbekannter Fehler."));
        }
      } finally {
        inFlight = false;
      }
    }

    void syncAircraft();
    const timer = window.setInterval(() => void syncAircraft(), 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [auth, allowed]);

`;
try {
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(file)) {
    throw new Error("Bitte im Rehkitzrettungs-Projektordner starten.");
  }
  const current = fs.readFileSync(file, "utf8");
  if (current.includes("DJI_AIRCRAFT_JSBRIDGE_V7_1")) {
    console.log("V7.1 bereits installiert. Keine Aenderung.");
    process.exit(0);
  }
  const a = current.indexOf(start);
  const z = current.indexOf(end);
  if (a < 0 || z < 0 || z <= a || current.indexOf(start, a + start.length) >= 0 ||
      current.indexOf(end, z + end.length) >= 0 ||
      !current.slice(a, z).includes("platformGetAircraftSN")) {
    throw new Error("V7-Erkennungsabschnitt nicht eindeutig gefunden. Keine Aenderung.");
  }
  if (check) {
    console.log("VORPRUEFUNG OK: Nur DJI-Autoerkennung in PilotSimpleClient.tsx wird repariert.");
    console.log("Keine Aenderung an API, Datenbank, MQTT, WebSocket, Karten oder PinPoints.");
    process.exit(0);
  }
  const base = path.join(root, ".backups", "dji-aircraft-fix-v7-1-" + new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(base, { recursive: true });
  fs.copyFileSync(file, path.join(base, "PilotSimpleClient.tsx"), fs.constants.COPYFILE_EXCL);
  const updated = current.slice(0, a) + replacement + current.slice(z);
  try { fs.writeFileSync(file, updated, "utf8"); }
  catch (error) { fs.copyFileSync(path.join(base, "PilotSimpleClient.tsx"), file); throw error; }
  console.log("V7.1 installiert. Sicherung: " + base);
  console.log("Lizenzerkennung vor Drohnen-SN und wiederholte Bridge-Suche aktiv.");
} catch (error) {
  console.error("ABBRUCH: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
