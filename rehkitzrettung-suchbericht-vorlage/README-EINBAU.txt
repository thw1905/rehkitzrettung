Rehkitzrettung – zweite bearbeitbare E-Mail-Vorlage für Ergebnisberichte
=======================================================================

ENTHALTENE DATEIEN / ZIELORTE

1. app/api/admin/revier-email-template/route.ts
   -> Vorhandene Datei unter gleichem Pfad ersetzen.

2. lib/revier-search-report-template.ts
   -> Neue Datei unter diesem Pfad anlegen.

3. lib/revier-search-report-template-store.ts
   -> Neue Datei unter diesem Pfad anlegen.

4. KOMPONENTE-am-bisherigen-Speicherort/RevierEmailTemplateClient.tsx
   -> DIESE DATEI am bisherigen Ort der Komponente ersetzen.
      In VS Code nach 'export default function RevierEmailTemplateClient()' suchen,
      um den tatsächlichen Pfad festzustellen. Die Datei in der ZIP ist aus
      Sicherheitsgründen NICHT auf einen geratenen App-Pfad gelegt worden.

FUNKTION

- Unveränderte E-Mail vor der Suche: Datenbank-Key 'default'.
- Neue bearbeitbare E-Mail nach der Suche: Datenbank-Key 'search-report'.
- Gemeinsame Adminoberfläche, getrennte Entwürfe und Vorlagen.
- Betreff, Text, dynamische Platzhalter, Vorschau, Speichern, Testmail.
- Testmails verwenden ausdrücklich nur Beispieldaten.
- Die bereits vorhandene Prisma-Tabelle revierOwnerEmailTemplate wird benutzt.
  Es ist KEINE neue Prisma-Migration erforderlich.

WICHTIGE GRENZE / OFFENER SCHRITT

Dies baut zunächst NUR die neue Vorlagenverwaltung auf.
Der automatische Versand bei Abschluss aller Tagesaufträge eines Reviers ist
NOCH NICHT VERKNÜPFT: Dafür werden die aktuelle(n) Auftragsabschluss-Route(n),
das tatsächliche Revier/Order Datenmodell sowie die Prüfung, ob alle
zugeordneten Aufträge erledigt sind, benötigt.
Auch Versandsperre / idempotente Protokollierung für den Produktivversand
sind in diesem Paket noch nicht eingebaut.

VOR DEPLOY

Lokal 'npm run build' ausführen. Nicht auf den Server bringen, wenn der
Build fehlschlägt. Vor dem Ersetzen der vorhandenen Dateien sichern.

SICHTPRÜFUNG

Admin -> E-Mail-Vorlage Revierpächter
Beide Register prüfen, Testversand nur an eine eigene Adresse.
