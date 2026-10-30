REHKITZRETTUNG – STRASSENROUTING UPDATE V2 (SICHERE INSTALLATION)
=================================================================

Warum V2?
Das vorherige ZIP hatte app/.../route.ts direkt im ZIP. Beim Entpacken in
C:\Projekte\rehkitzrettung konnte diese Datei bereits ersetzt werden,
BEVOR der Installer ausgefuehrt wurde. Daher hat die alte Versionspruefung
abgebrochen. Die hier enthaltenen Quell-Dateien liegen ausschliesslich im
Unterordner strassenrouting-paket-v2/. Entpacken schreibt KEINE
Programmdateien um (nur Installer + Readme + separaten Paketordner).

VORAUSSETZUNG
- Bereits installiertes Paket rehkitzrettung-teamrouten-und-teamtreffpunkte.zip.
- Eine von zwei bekannten route.ts Versionen: die urspruengliche
  Luftlinienversion oder die neue bereits entpackte Strassenrouten-Version.
- Bestehende UI mit Originaltexten oder bereits vollstaendig aktualisierte UI.
- Kein abweichend veraendertes road-routing.ts Modul.

INSTALLATION
1. Quellcode und ggf. produktive SQLite-Datenbank separat sichern.
2. Dieses ZIP nach C:\Projekte\rehkitzrettung entpacken und dabei die
   Ordnerstruktur beibehalten.
3. Konsole/PowerShell im Projektverzeichnis oeffnen:

     node .\install-strassenrouting-v2.cjs

   Der Installer prueft die Ausgangsversion, erstellt Backups der
   TATSAECHLICH geaenderten Dateien und fuehrt nur noetige Aenderungen aus.
   Bereits aktuelle Dateien bleiben unangetastet. Bei unklarer Version
   bricht er vor Aenderungen ab.
4. API-Key bei https://account.heigit.org/ erstellen und in .env.local
   oder deiner aktuellen .env eintragen:

     OPENROUTESERVICE_API_KEY="DEIN_SCHLUESSEL"

   Geheim halten, niemals in Git einchecken. Next.js danach neu starten.
5. Pruefen:

     npx tsc --noEmit
     npm run build
     npm run dev

6. In der Tagesplanung ein Team mit >= 3 GPS-Auftraegen waehlen,
   die Strassenroute optimieren und km Strasse + Fahrzeit kontrollieren.
   "Als Start" und manuelle Sortierung weiter testen.

UNVERAENDERT
- Datenbank und Prisma-Schema
- Teamtreffpunkte, Mails, Push-Benachrichtigungen
- Vorhandene manuelle Sortierung und erste Auftragsposition

HINWEISE
- Strassenroutenberechnung benutzt aktuell Field.locationLatitude/
  Field.locationLongitude, NICHT den eigenen Teamtreffpunkt.
- Bei Ausfall des Dienstes erfolgt sichtbar gekennzeichnete Luftlinie.
- Keine Rueckfahrt, keine Verkehrsvorhersage und keine Linienanzeige
  auf der Karte. Keine neuen NPM-Pakete erforderlich.

GIT erst nach erfolgreichem Test:
  git status
  git add -- "components/day-assignments/day-assignments-page-client.tsx" "app/api/day-assignments/optimize-route/route.ts" "lib/team-routes/road-routing.ts"
  git commit -m "Strassenrouting Tagesplanung"
  git push

HINWEIS: Backups, Installer, Paketordner und .env-Dateien nicht einchecken.
PRODUKTION: API-Key auch in der Serverumgebung eintragen und den Server
mit aktualisierter Umgebung neu starten.
