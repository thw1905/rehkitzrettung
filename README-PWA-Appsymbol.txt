Rehkitzrettung Hegering Hittfeld - PWA Appsymbol (Drohne und Rehkitz)
===============================================================

Fuer Next.js 16 (bestehende Konfiguration app/manifest.ts).
Dieses Paket hat nur EINE Installationsdatei.

Installation (Windows / CMD / VS Code Terminal):
  1. install-rehkitz-appsymbol.cjs direkt nach C:\Projekte\rehkitzrettung kopieren.
  2. cd C:\Projekte\rehkitzrettung
  3. node install-rehkitz-appsymbol.cjs --check
  4. Wenn VORPRUEFUNG OK:
     node install-rehkitz-appsymbol.cjs
  5. npm run build

Der Installer erstellt folgende Dateien:
  public/icon-192.png
  public/icon-512.png
  public/rehkitz-app-192.png
  public/rehkitz-app-512.png
  public/rehkitz-app-maskable-512.png
  app/apple-icon.png
  app/favicon.ico
  app/manifest.ts wird gezielt an den Icons angepasst.

Vorhandene Versionen werden VOR der Bearbeitung gesichert, ausserhalb
vom Projektordner in einem Ordner namens:
  rehkitzrettung-pwa-backup-<Zeitstempel>

Es werden KEINE Datenbank-, API-, DJI-, Push-Service-Worker- oder
Anmeldedateien veraendert. Das Skript ist eigenstaendig; es muss kein
weiteres Bild aus dem Archiv kopiert werden.

Achtung: Bereits installierte PWA-Shortcuts zeigen das neue Symbol ggf.
erst nach dem Entfernen und erneuten Hinzufuegen zum Startbildschirm.

Nach einem erfolgreichen lokalen Build:
  git status
  git add app/manifest.ts app/apple-icon.png app/favicon.ico public/icon-192.png public/icon-512.png public/rehkitz-app-192.png public/rehkitz-app-512.png public/rehkitz-app-maskable-512.png
  git commit -m "PWA Appsymbol Rehkitzrettung"
  git push origin main

Server (nur nach erfolgreichem Push, separater Schritt):
  cd /root/rehkitzrettung
  git pull --ff-only origin main
  npm run build
  pm2 restart rehkitzrettung --update-env

Keine Prisma-Aktualisierung erforderlich.
