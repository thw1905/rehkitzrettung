REHKITZRETTUNG – GPS-TESTMODUS: ADMIN + DEMO-PIN (OHNE BENUTZER-ID)
=====================================================================

DIESES ZIP ERSETZT DAS VORHERIGE GPS-TEST-PIN-MENUEPAKET.
Es enthält die vollständige PC-/Smartphone-Navigation und die geschützte Test-API.

WAS IST ANDERS?
- GPS_TEST_ALLOWED_USER_ID wird NICHT mehr benötigt und wird nicht geprüft.
- Jeder angemeldete Administrator kann den Menüpunkt GPS-Testmodus sehen.
- Erst die korrekte DEMO_ORDER_PIN erlaubt den Zugriff auf Testdaten / Test-API.
- Die PIN-Freigabe gilt für 2 Stunden und ist als signiertes HttpOnly-Cookie
  an den jeweils angemeldeten Adminaccount gebunden.
- Ohne PIN können auch Admins die Test-API nicht direkt benutzen.
- Normale Helfer erhalten keinen Zugriff – auch nicht mit der PIN.
- Die PIN ist DIESELBE wie beim Demoauftrag; keine zweite PIN notwendig.

WICHTIG: Wenn ein anderer Admin deine Demo-PIN kennt, kann auch er den
GPS-Testmodus freischalten. "Nur ich" ist ohne persönliche Zuordnung nicht
technisch garantiert. Teile die PIN deshalb nicht mit anderen.

ZU ERSETZENDE / NEUE DATEIEN (relativ zum Projektordner):
- components/layout/app-header.tsx                  ERSETZEN
- components/layout/mobile-bottom-nav.tsx           ERSETZEN
- lib/gps-test-access.ts                             ERSETZEN
- components/admin/gps-test-pin-gate.tsx             ERSETZEN
- app/admin/gps-test/page.tsx                        ERSETZEN
- app/api/admin/gps-test/route.ts                    ERSETZEN (nur falls bisher aus Vorversion)
- app/api/admin/gps-test/unlock/route.ts             ERSETZEN (oder NEU)
- app/api/admin/gps-test/access/route.ts             ERSETZEN (oder NEU)

Die bisherige GPS-Test-Clientdatei
components/admin/gps-test-admin-page-client.tsx
wird NICHT verändert.

VOR DER INSTALLATION
Bestehende Dateien sichern. Besonders bei individuellen Aenderungen an
app/api/admin/gps-test/route.ts vor dem Ersetzen vergleichen.

UMGEBUNGSVARIABLEN (.env lokal und auf dem Server):
Bereits vorhanden:
  DEMO_ORDER_PIN=DEINE_BISHERIGE_DEMO_PIN
  NEXTAUTH_SECRET=DEIN_BESTEHENDES_SECRET

Statt NEXTAUTH_SECRET kann AUTH_SECRET verwendet werden.
Alternativ ein mindestens 24 Zeichen langes GPS_TEST_SESSION_SECRET.
GPS_TEST_ALLOWED_USER_ID kann aus der .env entfernt werden.
PIN und Secrets niemals in Git hochladen!

INSTALLATION LOKAL
1. ZIP in C:\Projekte\rehkitzrettung entpacken und Dateien ersetzen.
2. Vorhandene DEMO_ORDER_PIN und ein Secret in der .env pruefen.
3. npm run build
4. npm run dev
5. Als Admin: Verwaltung > Hilfe / System > GPS-Testmodus
   (mobil: Hilfe > GPS-Testmodus).
6. Demo-PIN eingeben, Testmodus öffnen.
7. Als Admin ohne PIN pruefen: Seite zeigt nur die PIN-Abfrage.
   Als Sucher pruefen: kein Zugriff auf /admin/gps-test und die Test-API.

Keine Prisma-Migration bzw. Datenbankänderung erforderlich.

SERVERUPDATE
Auf PC git add / git commit / git push, auf Server:
  git pull
  npm install
  npm run build
  pm2 restart rehkitzrettung --update-env
Die .env auf dem Server muss die PIN und eines der genannten Secrets enthalten.

WICHTIG: Vollständigen Next.js-Build und Liveprüfung bitte lokal ausführen.
