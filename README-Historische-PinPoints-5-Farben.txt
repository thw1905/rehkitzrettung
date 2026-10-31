REHKITZRETTUNG – Historische PinPoints mit 5 Fundarten

Alle historischen PinPoints werden angezeigt. Die Farben sind:
  GRUEN:  Rehkitz gesichert
  ORANGE: Rehkitz abgesprungen
  BLAU:   Sonstiges Wild gesichert
  ROT:    Sonstiges Wild abgesprungen
  BRAUN:  Maulwurfshuegel / Fehlstelle

Sind mehrere Fundarten an einem Punkt gespeichert, wird der Kreis in gleich
grosse farbige Segmente aufgeteilt. Der Saisonfilter bleibt unveraendert.
Eine zusaetzliche Kategorie "Kein Fund" wird nicht angezeigt.
Fuer moegliche alte unvollstaendige Datensaetze ohne Fundart wird die Position
als schlichter Ring ohne besondere Fundartfarbe angezeigt, nicht als Fund.

INSTALLATION (Windows, VS Code Terminal):
  1. install-historische-pinpoints-5-farben.cjs nach C:\Projekte\rehkitzrettung kopieren.
  2. cd C:\Projekte\rehkitzrettung
  3. node install-historische-pinpoints-5-farben.cjs --check
  4. Nur bei VORPRUEFUNG OK bzw. Erkennung: 
     node install-historische-pinpoints-5-farben.cjs
  5. npm run build

Unterstuetzt sowohl das urspruengliche Historien-Paket als auch das bereits
installierte vorherige Farbpaket. Bei unbekanntem Projektstand bricht es ab.
Die Installationsroutine fertigt Sicherungskopien unter .backups an.
Keine Datenbankmigration erforderlich.
