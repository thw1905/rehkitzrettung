LIVE-TEAMSTANDORTE — Rehkitzrettungs-App
=======================================

Dateien im ZIP und Zielorte im Next.js-Projekt:

  prisma/schema.prisma
  app/api/team-locations/route.ts
  components/orders/use-team-live-location.ts
  components/orders/pinpoint-navigation-modal.tsx
  components/orders/my-orders-page-client.tsx

FUNKTION
- Jeder Helfer erhält pro Einsatztag eine eindeutige und beständige
  Tageskennung P1, S1, S2 usw. Änderungen des Teams verändern sie nicht.
- Benutzer müssen ihre Standortfreigabe auf "Meine Aufträge" ausdrücklich
  einschalten. Nur die eigenen, aktuell zugeordneten Teammitglieder können
  die Position per API sehen. Nicht teilende Helfer bleiben in der Legende.
- GPS wird kontinuierlich beobachtet. Bei frischer Messung wird höchstens
  alle 2 Sekunden an den Server gesendet; die Karte fragt alle 2 Sekunden
  neue Positionen ab.
- Positionsmessungen mit einer Genauigkeit schlechter als +/-150 Meter
  werden nicht übertragen. Nach 10 Sekunden wird der Marker als veraltet
  gekennzeichnet und nach 60 Sekunden ohne neue Meldung verborgen.
- Karte folgt normalerweise deinem Standort. Bei manuellem Verschieben
  pausiert das Folgen. Die Schaltfläche "Zu mir" schaltet es wieder ein.
- Die GPS-Freigabe bleibt beim Schließen der Pinpoint-Navigation aktiv,
  solange die Seite "Meine Aufträge" geöffnet und aktiv ist.
- Bei ausgeschalteter Freigabe werden Koordinaten auf dem Server gelöscht.
  Koordinaten vergangener Tage werden beim nächsten API-Aufruf bereinigt.
  Für eine garantierte Bereinigung um Mitternacht ist ein Cronjob nötig.

INSTALLATION – LOKAL

1. ZUERST eigene Dateien sowie die SQLite-Datenbank sichern, vor allem
   prisma/schema.prisma und die bisherige my-orders-page-client.tsx.
2. Dateien mit ihren Zielpfaden ins Projekt übernehmen.
3. Im Projektordner den Prisma-Migrationsstand kontrollieren. Wenn
   bestehende Migrationen sauber gepflegt sind:
       npx prisma migrate dev --name daily_team_locations
       npx prisma generate
       npm run build
       npm run dev
   WARNUNG: Wird zum Zurücksetzen/Löschen der Datenbank aufgefordert,
   unbedingt abbrechen. Nicht Prisma migrate reset ausführen!
4. Mit mindestens zwei verschiedenen zugelassenen Testbenutzern, die
   demselben OperationDayTeam zugeteilt sind, im Browser per HTTPS
   testen. Auf beiden Geräten "Standort mit Team teilen" einschalten.
5. Erst nach einem lokalen Test auf dem Server veröffentlichen. Vor der
   Datenbankmigration unbedingt die produktive DB separat sichern.
   Bei bestehender Migration-History: npx prisma migrate deploy.
   Falls das Projekt noch keine Prisma-Migrationen verwendet, muss
   die passende sichere Schema-Aktualisierung individuell geprüft werden.

HINWEISE
- Die Team-Zuordnung stammt aus operationDayTeam, also derselben
  Zuordnung, die "Meine Aufträge" verwendet. Ohne zugeordnetes Team
  ist eine Standortfreigabe über diesen Bildschirm nicht möglich.
- Es gibt bewusst keine Dauer-Ortung im Hintergrund: Smartphone-Browser
  dürfen GPS und Netzwerk bei gesperrtem Bildschirm unterbrechen.
- Eine komplette Next.js-Build- oder Geräteprüfung ist in dieser
  Umgebung nicht möglich. Die gelieferten TypeScript-/TSX-Dateien
  wurden syntaktisch geprüft, nicht im vollständigen Projekt kompiliert.
- Keine Datenbankdatei ist im ZIP enthalten.
