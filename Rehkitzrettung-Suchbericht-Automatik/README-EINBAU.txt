REHKITZRETTUNG – AUTOMATISCHER SUCHBERICHT PRO REVIER
======================================================
Stand: 31.10.2026

ZWECK
- Automatische E-Mail nach Abschluss ALLER Auftraege eines Reviers an einem Einsatztag.
- Pro Revierpaechter/Revier/Tag nur ein automatischer Versandversuch.
- Du-Form und BEARBEITBARE Suchbericht-Mailvorlage aus dem vorherigen Paket.
- Revier- und Flaechenergebnisse, direkte Wildfunde, PinPoint-Funde und GPS-Kartenlinks.
- Auch bei null Wildfunden wird ein Bericht erstellt.
- Demo-Auftraege werden ausgeschlossen.
- Der Befliegungsnachweis und die E-Mail VOR der Suche bleiben unberuehrt.

VORAUSSETZUNG
Die erweiterte Vorlagenverwaltung muss bereits funktionieren:
  lib/revier-search-report-template.ts
  lib/revier-search-report-template-store.ts
Der Installer bricht sonst ab, ohne das Projekt zu veraendern.

1. LOKALEN ORDNER VORBEREITEN
- ZIP entpacken.
- Dateien in einem beliebigen Ordner bereithalten, z.B. C:\Downloads\Rehkitzrettung-Suchbericht-Automatik.
- Die Datei install-revier-suchbericht-auto.cjs und die Unterordner lib sowie
  SCHEMA-ERGAENZUNG.prisma muessen zusammenbleiben.
- Vor der Installation Git-Status pruefen und bisherige Aenderungen sichern.

2. INSTALLATION AUS POWERSHELL IM PROJEKTVERZEICHNIS
  cd C:\Projekte\rehkitzrettung
  git status
  node "C:\Downloads\Rehkitzrettung-Suchbericht-Automatik\install-revier-suchbericht-auto.cjs" --check

Wenn die Vorpruefung OK ist:
  node "C:\Downloads\Rehkitzrettung-Suchbericht-Automatik\install-revier-suchbericht-auto.cjs"

Hinweis: Falls Windows den entpackten Ordner anders nennt, Pfad anpassen.
Der Installer prueft beide vorhandenen Abschlussstellen, legt ein Backup unter
.backups/revier-suchbericht-auto-... an, fuegt eine lib-Datei hinzu und
ERGAENZT das aktuelle Prisma-Schema und die aktuelle Abschluss-API.
Bei unbekannter Struktur ABBRUCH OHNE AENDERUNG. NICHT ZWEIMAL ausfuehren.

3. DATENBANK (zunaechst nur lokal)
Vor der DB-Aenderung eine konsistente SQLite-Sicherung erstellen!
- Die neue Tabelle heisst RevierSearchReportDispatch.
- Es wird KEINE bestehende Tabelle ersetzt.
- Nach Backup im Projektordner:
  npx prisma validate
  npx prisma db push
  npx prisma generate
  npm run build

ACHTUNG: Meldet db push einen moeglichen Datenverlust, ABBRECHEN!
NIEMALS --accept-data-loss verwenden. Bitte zuerst die Ausgabe zeigen.

4. AUTOMATISCHEN VERSAND BEWUSST FREISCHALTEN
Standardmaessig ist der automatische Versand AUS, damit nicht versehentlich
bereits beim lokalen Test echte Revierpaechter angeschrieben werden.
Erst wenn die neue DB-Tabelle besteht UND du den Versand aktivieren willst,
in der SERVER-Umgebung setzen:
  REVIER_SEARCH_REPORT_AUTO_SEND=true
Danach Next.js neu starten.

5. DEPLOYMENT
Nicht einfach alte Projektdateien vom 23.10. ueber aktuelle Dateien kopieren.
Git-Commit, Push, Git-Pull; dann ZUERST Produktions-SQLite sichern.
Erst danach auf dem Server:
  npx prisma validate
  npx prisma db push
  npx prisma generate
  npm run build
  pm2 restart rehkitzrettung --update-env
Bei Fehlern den Prozess NICHT neu starten.

6. VERHALTEN / SCHUTZ
- Bei jedem neuen Auftragsabschluss werden alle vom Auftrag betroffenen Reviere
  einzeln darauf geprueft, ob noch offene Auftraege am Einsatztag existieren.
- Revieruebergreifende Flaechen: Direktfunde nur beim Hauptrevier (groesste
  Flaechenueberschneidung); GPS-Punkte werden nach Lage im Revier eingeordnet.
  Befinden sie sich ausserhalb der zugeordneten Reviergrenzen, wird ein Hinweis
  im Bericht ausgegeben; sie werden einmal dem Hauptrevier zugeordnet.
- Eine Tabelle protokolliert je Revier/Tag/Paechter SENDING, SENT oder ERROR.
- Bei ERROR oder unklarem SENDING erfolgt KEIN unbemerkter erneuter Versand,
  weil die SMTP-Zustellung bereits stattgefunden haben koennte. Ein bewusster
  Admin-Wiederholungsversand kann spaeter nachgeruestet werden.
- Werden NACH dem erfolgreichen Versand weitere Auftraege fuer dasselbe Revier
  und Datum angelegt, wird nicht ungefragt eine zweite Mail versendet.
- Auftragsschluss klappt selbst dann, wenn der Mailversand fehlschlaegt.
- Das System versendet nur bei einem NEUEN Wechsel zu ERLEDIGT, nicht
  rueckwirkend fuer alte abgeschlossene Auftraege.

PRUEFUNG
Die Installation wurde gegen das hochgeladene Projektarchiv vom 23.10.2026
statisch geprueft. Seitdem wurden weitere Funktionen hinzugefuegt. Deshalb
ist die Pruefung auf dem AKTUELLEN Projekt per --check erforderlich.
Ein vollstaendiger Prisma-/Next-Build ist nur mit deinem aktuellen Projekt
und deiner aktuellen Datenbankkonfiguration moeglich.
