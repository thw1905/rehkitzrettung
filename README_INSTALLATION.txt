REHKITZRETTUNG – DEMO-AUFTRÄGE AUCH AUF DEM SMARTPHONE
============================================================

Änderung:
  In der unteren mobilen Navigation als Admin auf "Hilfe" tippen.
  Dort werden nun angeboten:
    - Hilfe / Bedienungsanleitung
    - GPS-Testmodus (PIN)
    - Demo-Auftrag erstellen (PIN)
    - Demo-Aufträge löschen

Das Anlegen benutzt dieselbe API wie am PC:
  POST /api/demo-order mit DEMO_ORDER_PIN.

Das Löschen benutzt dieselbe API wie am PC:
  POST /api/cleanup-demo-orders, mit zusätzlicher Sicherheitsabfrage.
  Achtung: Der bisherige Desktop-Löschaufruf verlangt keine PIN.
  Diese Änderung ergänzt auch für die mobile Löschfunktion keine PIN.

Installation:
  1. Bisherige Datei sichern:
     components/layout/mobile-bottom-nav.tsx
  2. Nur die gleichnamige Datei aus diesem ZIP im Projekt ersetzen.
  3. Im Projektordner:
        npm run build
        npm run dev
  4. Auf dem Smartphone (als Admin) die Anwendung aktualisieren,
     unten auf "Hilfe" tippen und die Demo-Aktionen ausprobieren.

Wenn die PWA noch die alte Ansicht zeigt, vollständig schließen
und erneut öffnen beziehungsweise Webseitendaten aktualisieren.

Keine Datenbankänderung, keine weiteren Dateien notwendig.
Die ursprüngliche Desktop-Navigation bleibt unverändert.
