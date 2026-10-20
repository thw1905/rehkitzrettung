# Aktualisiert nur die BESTEHENDE Benachrichtigungsroute.
# Die Datei mit notifyAffectedRevierOwnersByEmail wird automatisch ermittelt.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = Join-Path $project 'app\api'
$replacement = Join-Path $project 'INSTALLATIONS_DATEIEN\benachrichtigung-route.txt'
if (-not (Test-Path -LiteralPath $replacement)) { throw 'Die neue Versandroute fehlt. Paket zuerst entpacken.' }
if (-not (Test-Path -LiteralPath $api)) { throw 'Ordner app/api nicht gefunden.' }
$found = @(Get-ChildItem -LiteralPath $api -Filter 'route.ts' -File -Recurse | Where-Object {
  (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8).Contains('notifyAffectedRevierOwnersByEmail')
})
if ($found.Count -ne 1) { throw ('Benachrichtigungsroute muss genau einmal existieren, gefunden: ' + $found.Count) }
$target = $found[0].FullName
$current = Get-Content -LiteralPath $target -Raw -Encoding UTF8
# Schutz vor Ueberschreiben einer unerwartet stark abweichenden/neueren Fassung.
if (-not $current.Contains('getRevierOwnerMailTemplate') -or -not $current.Contains('renderRevierMailText')) {
  throw 'Die bestehende Route verwendet noch nicht die gespeicherte E-Mail-Vorlage. Nicht ueberschrieben.'
}
if ($current.Contains('landwirtFields:')) {
  Write-Host 'Landwirte-Erweiterung ist bereits in der Route enthalten.' -ForegroundColor Green
  exit 0
}
$backup = $target + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
Copy-Item -LiteralPath $replacement -Destination $target -Force -ErrorAction Stop
Write-Host ('Versandroute aktualisiert: ' + $target) -ForegroundColor Green
Write-Host ('Sicherung: ' + $backup) -ForegroundColor Yellow
