REHKITZRETTUNG - MUSTER BEFLIEGUNGSNACHWEIS ANZEIGEN

Voraussetzung: Das Paket "rehkitzrettung-befliegungsnachweis-auto-pdf.zip"
mit der Verwaltungsseite /admin/flight-certificates ist bereits installiert.

FUNKTION
- Unter Verwaltung -> Hilfe / System -> Befliegungsnachweise:
  "Muster anzeigen / drucken" oeffnet ein ausgefuelltes Beispiel-PDF.
  "Muster-PDF herunterladen" speichert dieselbe Musterversion.
- Beide Buttons funktionieren ohne abgeschlossene Einsaetze oder angelegte Landwirte.
- Musterdaten: 2 Flaechen des Landwirts Max Mustermann, 1x kein Wildfund,
  1x ein gesichertes Kitz. Pilot: Peter Beispiel (keine Sucher-Namen).
- Das Muster nutzt exakt die bereits installierte PDF-Erzeugung.
- Das PDF wird als MUSTER gekennzeichnet, kein Versand, kein Datenbankzugriff
  auf die Einsatzdaten, keine zusaetzlichen Prisma-Aenderungen.
- Nur angemeldete Admins koennen das Muster abrufen.

INSTALLATION
1. Entpacke dieses ZIP in C:\Projekte\rehkitzrettung und bestaetige
   das Ueberschreiben der folgenden bestehenden Datei:
      components/admin/flight-certificates-client.tsx
   Neu hinzu kommt:
      app/api/admin/flight-certificates/sample/route.ts
2. Entwicklungsserver bei Bedarf neu starten:
      npm run dev
   Fuer den Live-Server vorher:
      npm run build
3. Rufe im Programm "Verwaltung -> Hilfe / System -> Befliegungsnachweise"
   auf. Klicke auf "Muster anzeigen / drucken".

KEIN npx prisma db push und KEIN neues npm-Paket erforderlich.

HINWEIS
Wenn kein PDF erscheint, ggf. Pop-up-Blocker fuer die Website pruefen.
Die Anzeige oeffnet sich in einem neuen Browser-Tab.
