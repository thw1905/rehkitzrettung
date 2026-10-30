# Rehkitzrettung: Korrigiert ausschliesslich den TypeScript-Vergleich
# in der bestehenden app/api/orders/[id]/route.ts.
# Lokal in C:\Projekte\rehkitzrettung ausfuehren, NICHT auf dem Linux-Server.
$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot 'app/api/orders/[id]/route.ts'
if (-not [System.IO.File]::Exists($path)) {
    throw "Auftrags-API nicht gefunden: $path. ZIP bitte im Projektordner entpacken."
}

$before = [System.IO.File]::ReadAllText($path)
$old = 'existingOrder.status !== "ERLEDIGT" && order.status === "ERLEDIGT"'
$new = 'order.status === "ERLEDIGT"'
$occurrences = [regex]::Matches($before, [regex]::Escape($old)).Count

if ($occurrences -eq 0) {
    if ($before.Contains('maybeSendFlightAfterOrderCompleted') -and $before.Contains($new)) {
        Write-Host 'Die fehlerhafte Bedingung ist nicht vorhanden. Eventuell ist die Korrektur bereits eingebaut.' -ForegroundColor Yellow
        exit 0
    }
    throw 'Erwartete Zeile nicht gefunden. Keine Aenderung. Bitte die aktuelle app/api/orders/[id]/route.ts schicken.'
}

if ($occurrences -gt 3) {
    throw "Unerwartete Anzahl ($occurrences). Keine Aenderung. Bitte route.ts pruefen."
}

# Die Sicherung liegt ausserhalb des Git-Projekts und kann nicht versehentlich gepusht werden.
$backup = Join-Path ([System.IO.Path]::GetTempPath()) ("rehkitzrettung-order-route-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.ts.bak')
[System.IO.File]::Copy($path, $backup)
$after = $before.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $after, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Erfolg: $occurrences fehlerhafte Bedingung(en) korrigiert." -ForegroundColor Green
Write-Host "Datei: $path"
Write-Host "Sicherung: $backup"
Write-Host 'Jetzt lokal npm run build ausfuehren. Erst bei erfolgreichem Build zu GitHub hochladen.' -ForegroundColor Cyan
