REHKITZRETTUNG – Historische PinPoints (Version 1)
===================================================

FUNKTIONSUMFANG
- Auf der Flächenkarte eines Auftrags können frühere PinPoints eingeblendet werden.
- Optionaler Saisonfilter auf der Flächenkarte.
- Neue Übersichtskarte unter /historical-pinpoints, auch über Persönlich erreichbar.
- Anzeige für freigegebene Piloten, Sucher und Administratoren.
- Nur lesende Darstellung, ohne Bearbeitung, QR-Scan, Statusänderungen oder neue Datenbanktabellen.
- Historisch = abgeschlossene, nicht als Demo markierte Aufträge aus Kalenderjahren vor der aktiven Saison.
  Die aktive Saison wechselt wie bei der Verfügbarkeitsplanung am 1. August auf das Folgejahr.
- Quelle: vorhandene OrderPinpoint-Datensätze, verknüpft mit Order und Field.
- Punkte einer Auftragskarte werden über die gespeicherte fieldId derselben Fläche zugeordnet.
- Zur Sicherheit max. 5.000 Punkte je API-Abfrage; bei mehr Punkten wird eine Warnung angezeigt.
- Frei eingegebene Notizen, QR-Codes und Kontaktdaten werden NICHT öffentlich über die Historien-API ausgegeben.

INSTALLATION (Windows / VS Code)
1. Nur die Datei install-historische-pinpoints.cjs in C:\Projekte\rehkitzrettung kopieren.
2. Terminal:
   cd C:\Projekte\rehkitzrettung
   node install-historische-pinpoints.cjs --check
3. Wenn VORPRUEFUNG OK:
   node install-historische-pinpoints.cjs
4. Anschließend:
   npm run build
5. Bei Fehlern: NICHT pushen oder auf dem Server aktualisieren. Ausgabe zur Prüfung senden.

SICHERHEIT
- Das Skript erstellt vor Änderungen .backups/historische-pinpoints-... .
- --check verändert keine Dateien.
- Bei unbekannten Stellen bricht das Skript ab, anstatt zu raten.
- Bestehende API für aktive PinPoints, DJI-Integration und Datenbank bleiben unverändert.
- Kein prisma db push erforderlich.
- Projektarchiv aus 23.10.2026 diente als Grundlage. Änderungen danach können Anker verschieben;
  deshalb zuerst --check ausführen.

NACH ERFOLGREICHEM BUILD
Die von uns hinzugefügten Quelltexte gezielt committen (nicht .backups oder .env):
  git status --short
  git add "app/api/historical-pinpoints/route.ts" "app/historical-pinpoints/page.tsx"
  git add "components/historical-pinpoints"
  git add "components/orders/order-field-map.tsx" "components/orders/my-orders-page-client.tsx"
  git add "components/layout/app-header.tsx" "app/personal/page.tsx"
  git diff --cached --stat
  git commit -m "Historische PinPoints auf Karten anzeigen"
  git push origin main
Dann wie gewohnt auf dem IONOS-Server git pull, npm run build, pm2 restart.
