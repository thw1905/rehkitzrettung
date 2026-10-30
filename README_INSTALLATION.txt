REHKITZRETTUNG – UPDATE: STRASSENROUTEN FÜR DIE TEAMPLANUNG
==========================================================

VORAUSSETZUNG
Das alte Paket „rehkitzrettung-teamrouten-und-teamtreffpunkte.zip“
ist auf dem Ziel-PC bereits installiert. Dieses Update ist NUR dafür.

WAS SICH ÄNDERT
- Die vorhandene Route-/Sortier-API nutzt eine Straßen-Fahrzeitmatrix
  von HeiGIT/openrouteservice (Fahrmodus Auto) statt nur Luftlinie.
- Die erste Fläche bleibt fest, die restliche Reihenfolge wird optimiert.
- Über „Als Start“ wird ein anderer Auftrag zum ersten und der Rest neu sortiert.
- Pfeile ▲/▼ zur manuellen Sortierung bleiben unverändert.
- Bei Neuzuweisung wird die Route wie bisher automatisch neu berechnet.
- Ergebnis zeigt Straßenkilometer und ungefähre Fahrzeit; bei API-Ausfall
  ausdrücklich eine Luftlinie und KEINE erfundene Straßen-Fahrzeit.
- Fehlende GPS-Koordinaten bleiben am Ende der Route und werden angezeigt.
- Teamtreffpunkte, Benachrichtigungen und Revierpächter-Mails bleiben bestehen.
- Keine Datenbankänderung; keine neue NPM-Abhängigkeit.

EINSCHRÄNKUNGEN
- Die Optimierung nutzt die GPS-Koordinaten der Fläche aus
  Field.locationLatitude und Field.locationLongitude. Bitte kontrollieren,
  dass diese den gewünschten Treffpunkt markieren – nicht nur die Feldmitte.
- Ein manuell eingegebener TEAM-Treffpunkt verändert NICHT die Straßenroute:
  Sie beginnt beim ersten Auftrag, ohne Anfahrt vom Teamtreffpunkt.
- Es wird keine Rückfahrt zum Ausgangspunkt berechnet.
- Bis 14 koordinatenfähige Aufträge wird die beste offene Reihenfolge
  bei fixem Startauftrag exakt berechnet, darüber eine Näherung.
- Mehr als 25 GPS-Aufträge oder Ausfall/Rate-Limit des Routingdienstes:
  Rückfall auf Luftlinienberechnung mit deutlicher Warnung.
- Straßenkilometer und Fahrzeit sind Schätzwerte ohne Verkehrslage;
  die Straßenroute wird NICHT als Liniengeometrie auf der Karte gezeichnet.
- Zur Routenberechnung werden die GPS-Koordinaten an HeiGIT übertragen.

INSTALLATION LOKAL (Windows / PowerShell)
1. VORHER: Quellcode und produktive SQLite-Datenbank sichern.
2. Dieses ZIP vollständig in C:\Projekte\rehkitzrettung entpacken.
   Dabei die Ordnerstruktur beibehalten. Keine alten Dateien manuell ersetzen.
3. PowerShell in diesem Ordner öffnen und eingeben:

     node .\install-strassenrouting.cjs

   Der Installer erstellt BACKUPS der zwei geänderten Dateien.
   Bei Versionsabweichungen bricht er ab, ohne zu überschreiben.
   In diesem Fall bitte die genaue Fehlermeldung zeigen – nichts erzwingen.

4. HEIGIT API KEY
   Account/Schlüssel: https://account.heigit.org/
   In C:\Projekte\rehkitzrettung\.env.local (oder deiner bisherigen
   lokalen .env) eine Zeile ergänzen:

     OPENROUTESERVICE_API_KEY="DEIN_ECHTER_SCHLUESSEL"

   Schlüssel nicht hier im Chat teilen und NICHT in Git committen.
   Achtung: Next.js muss nach einer Änderung der ENV neu gestartet werden.

5. Test und Build (weiterhin im Projektordner):

     npx tsc --noEmit
     npm run build
     npm run dev

6. IN DER TEAMPLANUNG TESTEN:
   a) Team mit mindestens drei Aufträgen mit GPS-Treffpunkten öffnen.
   b) „Straßenroute automatisch optimieren“ auswählen.
   c) Prüfen, ob „km Straße“ und „min Fahrzeit“ angezeigt werden.
   d) „Als Start“ für einen anderen Auftrag wählen – der bleibt vorne.
   e) ▲/▼ weiterhin testen.
   f) API-Key testweise entfernen und Dev-Server NEU starten.
      Jetzt MUSS „Luftlinie“ samt Warnung erscheinen.
      Anschließend Key wiederherstellen und Server neu starten.

NACH ERFOLGREICHEM LOKALEN TEST: GIT
   git status
   git add -- "components/day-assignments/day-assignments-page-client.tsx" "app/api/day-assignments/optimize-route/route.ts" "lib/team-routes/road-routing.ts"
   git commit -m "Straßenrouten für Tages-Teamplanung"
   git push

WICHTIG: Backups (*.backup-strassenrouting-*), das ZIP, den Installer
und .env/.env.local NICHT in git add aufnehmen. Vermeide "git add .".

PRODUKTIONSSERVER (Ubuntu; erst nach erfolgreichem lokalem Build)
   cd /root/rehkitzrettung
   git pull --ff-only
   # OPENROUTESERVICE_API_KEY sicher in der Server-Umgebung/.env setzen
   npm run build
   pm2 restart rehkitzrettung --update-env

WICHTIG: Schlüssel MUSS AUCH auf dem Produktionsserver vorhanden sein.
Ohne ihn funktioniert nur die Luftlinien-Notlösung.

INSTALLER: WELCHE DATEIEN WERDEN VERÄNDERT?
   app/api/day-assignments/optimize-route/route.ts         (ersetzt)
   components/day-assignments/day-assignments-page-client.tsx (gezielt angepasst)
   lib/team-routes/road-routing.ts                          (neu)

Es werden KEINE bestehenden Push- und Mail-APIs, DB-Schemata, Aufträge,
Teamzuweisungen, Teamtreffpunkte, oder gespeicherte Daten gelöscht.

Technik: https://api.heigit.org/openrouteservice/v2/matrix/driving-car
