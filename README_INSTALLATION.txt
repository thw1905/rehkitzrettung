Rehkitzrettung – Admin-Link aus „Meine Aufträge“ entfernen
===========================================================

Diese Datei basiert auf dem letzten Austauschpaket zur automatischen
Standortfreigabe und enthält weiterhin den Statusfilter sowie die bisherigen
Pinpoint-/Direktfund-Funktionen.

1. Bestehende Datei sichern:
   components/orders/my-orders-page-client.tsx

2. Gleichnamige Datei aus diesem ZIP in das Projektverzeichnis kopieren.

3. Lokal prüfen:
   npm run build
   npm run dev

WICHTIG: Der Admin-Link wurde NUR aus „Meine Aufträge“ entfernt.
Die bereits bestehende Admin-Seite bleibt weiter erreichbar:
   /admin/direct-findings

Für eine saubere direkte Integration in das bestehende Dashboard wird
noch die aktuelle Datei app/dashboard/page.tsx bzw. die verwendete
Dashboard-Client-Komponente benötigt. NICHT blind eine neue Dashboard-
Datei über eine bestehende kopieren.

Vorschlag zur Einbindung in bestehendes Dashboard, nur für isAdmin:
  <a href="/admin/direct-findings"
     className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-semibold text-amber-950">
    ✏️ Direktfunde korrigieren
  </a>

Keine Datenbankänderung erforderlich.
