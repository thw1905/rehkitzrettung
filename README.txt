REHKITZRETTUNG - LANDWIRT-FLAECHENKARTE PER MAIL UND WHATSAPP
==============================================================

Dieses Paket fuegt hinzu:
- Kleine FL-Nummer als Marker INNERHALB jeder vorhandenen Flaeche in der Leaflet-Karte.
- Gleiche FL-Nummern, Flaechengrenzen und Treffpunkte im automatisch erstellten PDF.
- Per E-Mail senden: E-Mail-Adresse wird aus den Stammdaten vorbefuellt und ist fuer den einzelnen Versand editierbar; Stammdaten werden nicht geaendert.
- Ueber WhatsApp teilen: auf kompatiblen Handys native Teilen-Funktion mit PDF-Datei; am PC PDF herunterladen und ueber WhatsApp Web manuell anhaengen.
- Bestehender Drucken-Button bleibt bestehen.

Einbau wie gewohnt:
1. install-landwirt-flaechenkarte-versand.cjs nach C:\Projekte\rehkitzrettung kopieren.
2. Terminal oeffnen: cd C:\Projekte\rehkitzrettung
3. node install-landwirt-flaechenkarte-versand.cjs --check
4. Nur wenn VORPRUEFUNG OK: node install-landwirt-flaechenkarte-versand.cjs
5. npm run build
6. Lokal die Funktion pruefen; erst danach per Git/PM2 auf den Server.

Bestehende Dateien werden unter .backups gesichert. Bei unbekanntem Dateistand bricht das Skript ohne Aenderung ab. Neue Dateien werden niemals ueberschrieben.

Nur Admins duerfen die Karte per E-Mail oder WhatsApp versenden. Eingeloggte Nutzer koennen weiterhin die Karte ansehen und drucken.
Eine separate PDF-API ist vorhanden. Versand ueber bestehende SMTP-Konfiguration.
Keine Datenbankmigration oder neue Node-Pakete erforderlich. pdf-lib ist bereits installiert.

Hinweis zur Kartenqualitaet: Die PDF-Karte nutzt Esri-Satellitenkacheln; bei Problemen mit dem Kartenserver bleiben die gezeichneten Feldgrenzen/FL-Nummern sichtbar.
