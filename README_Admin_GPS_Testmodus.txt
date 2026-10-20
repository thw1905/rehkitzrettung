REHKITZRETTUNG – ADMIN GPS-TESTMODUS
===================================

Dieses Paket ergänzt die bereits installierte Live-Teamstandort-Funktion.

NEUE DATEIEN:
  app/api/admin/gps-test/route.ts
  app/admin/gps-test/page.tsx
  components/admin/gps-test-admin-page-client.tsx

Es wird KEINE bestehende Datei überschrieben und KEINE neue Prisma-Tabelle benötigt.
Die vorherige Live-Ortungserweiterung mit dem Modell DailyTeamLocation
muss aber bereits installiert und in der Datenbank vorhanden sein.

EINRICHTUNG LOKAL:
  1) Projekt- und Datenbank-Backup erstellen.
  2) Die drei Dateien mit ihren Verzeichnisstrukturen ins Projekt kopieren.
  3) Im Projektordner: npm run build
  4) npm run dev
  5) Als Admin öffnen: http://localhost:3000/admin/gps-test

SO TESTEST DU:
  1) Einen bereits vorhandenen Demoauftrag auswählen (isDemo = true).
     Fehlt er, über die vorhandene Demo-Funktion vorher anlegen.
  2) Einen freigeschalteten Piloten und 1–6 freigeschaltete Sucher auswählen.
  3) Die Test-Pinpoint-Koordinaten eingeben oder GPS übernehmen.
  4) "GPS-Testteam und Demoauftrag anlegen" klicken.
  5) Die ausgewählten Personen melden sich auf zwei Smartphones jeweils mit
     ihrem eigenen Nutzerkonto an; unter "Meine Aufträge" heute auswählen.
  6) Standortfreigabe jeweils ausdrücklich einschalten, den Testauftrag
     öffnen und PinPoint 1 -> Navigation starten wählen.
  7) Prüfen, ob die Marker der Teammitglieder erscheinen.
  8) Nach dem Test als Admin "Test beenden und Testdaten entfernen" klicken.

TECHNISCHE HINWEISE:
  - Der Test verwendet das heutige Datum in Europe/Berlin und umgeht nur den
    Saisonkalender; der normale Kalender wird nicht verändert.
  - Das System legt ein eigenes INAKTIVES Team an, das aber im Testeinsatztag
    als Teamzuordnung gespeichert wird, plus einen geklonten Demoauftrag mit
    einem eigenen Test-Pinpoint. Der Original-Demoauftrag bleibt unverändert.
  - Der Test funktioniert nur mit bereits zugelassenen Benutzerkonten.
    Keiner der ausgewählten Helfer darf heute bereits in einem anderen
    OperationDayTeam eingeteilt sein.
  - Es werden KEINE Helfer-Push-Nachrichten oder Revierinhaber-E-Mails gesendet.
  - Die Standortübertragung erfordert HTTPS (oder localhost auf dem Gerät)
    und eine ausdrückliche Freigabe pro Benutzer. HTTP von anderen Geräten
    über eine LAN-IP reicht für GPS-Browserberechtigungen meist nicht.
  - Bei Testende werden nur entsprechend markierte Testobjekte gelöscht;
    eventuell vorhandene echte Einsatztage bleiben erhalten.
  - Der Testmodus ist nur als Administrator erreichbar.

WICHTIG: Prisma ist SQLite in diesem Projekt. Wenn die bisherige
Live-Teamstandort-Migration noch nicht eingespielt ist, NICHT die
Datenbank zurücksetzen. Sichere sie zuerst und installiere die
bestehende Migration fachgerecht.

EINSCHRÄNKUNGEN:
  - Eine komplette Next.js-Buildprüfung ist ohne das gesamte Projekt
    nicht möglich; die Dateien wurden isoliert auf Syntax geprüft.
  - Wenn GET /api/orders in deinem aktuellen Stand zusätzliche Filter nutzt,
    prüfen wir diese anhand einer konkreten Fehlermeldung.
