Rehkitzrettung - PWA-Favicon-Fix

Fehler: Turbopack / Next.js 16: app/favicon.ico PNG is not in RGBA format.

Das Skript und die korrigierte ICO-Datei sind enthalten.

1. fix-rehkitz-favicon.cjs nach C:\Projekte\rehkitzrettung kopieren.
2. In diesem Projektordner ausfuehren:
     node fix-rehkitz-favicon.cjs --check
3. Bei VORPRUEFUNG OK:
     node fix-rehkitz-favicon.cjs
4. Dann:
     npm run build

Es wird ausschliesslich app/favicon.ico ersetzt. Die bisherige Datei wird vorher
unter .backups/pwa-favicon-fix-.../favicon.ico gesichert.
Nicht auf GitHub oder Server uebertragen, bevor der Build erfolgreich ist.
