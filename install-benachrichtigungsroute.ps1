# Fuehrt nur eine gezielte Ersetzung der BESTEHENDEN Versand-Route aus.
# Der echte Pfad wird ueber den Funktionsnamen festgestellt.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = Join-Path $project 'app\api'
$replacement = Join-Path $project 'INSTALLATIONS_DATEIEN\benachrichtigung-route.txt'
if (-not (Test-Path -LiteralPath (Join-Path $project 'prisma\schema.prisma'))) {
  throw 'Bitte das Installationspaket zuerst ins Projektverzeichnis entpacken.'
}
if (-not (Test-Path -LiteralPath $replacement)) {
  throw 'Austauschdatei fuer die Benachrichtigungsroute fehlt.'
}
if (-not (Test-Path -LiteralPath $api)) { throw 'app/api wurde nicht gefunden.' }
$matchesFound = @(Get-ChildItem -LiteralPath $api -Filter 'route.ts' -File -Recurse | Where-Object {
  $content = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
  $content.Contains('notifyAffectedRevierOwnersByEmail')
})
if ($matchesFound.Count -ne 1) {
  throw ('Erwartet wurde exakt eine bestehende Benachrichtigungsroute, gefunden: ' + $matchesFound.Count + '. Bitte nicht automatisch ersetzen; die Datei manuell suchen.')
}
$target = $matchesFound[0].FullName
$backup = $target + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
Copy-Item -LiteralPath $replacement -Destination $target -Force -ErrorAction Stop
Write-Host ('Benachrichtigungsroute ersetzt: ' + $target) -ForegroundColor Green
Write-Host ('Sicherung: ' + $backup) -ForegroundColor Yellow
