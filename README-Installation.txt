Rehkitzrettung – Statusfarben und Statusfilter in „Meine Aufträge“
===================================================================

Geänderte Datei:
components/orders/my-orders-page-client.tsx

Funktionen:
* Standardansicht „Aktive“: OFFEN + IN_ARBEIT. ERLEDIGT ist ausgeblendet.
* Reiter „Erledigte“: abgeschlossene Aufträge weiterhin für Korrekturen erreichbar.
* Reiter „Alle“: sämtliche Aufträge des ausgewählten Einsatztags.
* Zähler mit Anzahl je Filter, Suchfeld bleibt erhalten.
* Reihenfolge: IN_ARBEIT vor OFFEN vor ERLEDIGT.
* Statusfarben: Rot OFFEN, Gelb IN_ARBEIT, Grün ERLEDIGT.
* Nur Kopfbereich zart eingefärbt, zusätzlich linker Farbstreifen.
* Live-Team-GPS, Navigation, Pinpoint-Sperre, Korrekturen und Wildzählknöpfe bleiben unverändert.

Installation:
1. Vorhandene Datei components/orders/my-orders-page-client.tsx sichern.
2. ZIP entpacken und die enthaltene Datei in dein Projekt C:\Projekte\rehkitzrettung kopieren.
3. Im Projektverzeichnis: npm run build
4. Bei erfolgreichem Build: npm run dev (oder deinen laufenden Dev-Server nutzen).
5. In „Meine Aufträge“ den Statusfilter testen.

Keine Prisma-Schema- oder Datenbankänderung erforderlich.
Hinweis: TSX wurde auf Syntax geprüft; ein vollständiger Projekt-Build wurde hier nicht ausgeführt.
