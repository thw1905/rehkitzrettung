# Rehkitzrettung - Behebt einen TypeScript-Typfehler in der SMTP-Empfaengerpruefung.
# Lokal im Windows-Projektordner ausfuehren; bestehende Datei wird punktuell geaendert.
$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot 'lib/flight-certificates.ts'
if (-not [System.IO.File]::Exists($path)) {
    throw "Datei nicht gefunden: $path. Bitte ZIP in C:\Projekte\rehkitzrettung entpacken."
}

$before = [System.IO.File]::ReadAllText($path)
$old = 'if (!result.accepted.some(a => a.toLowerCase()===to.toLowerCase()))'
$new = 'if (!result.accepted.some(a => (typeof a === "string" ? a : a.address).trim().toLowerCase() === to.trim().toLowerCase()))'

$occurrences = [regex]::Matches($before, [regex]::Escape($old)).Count
if ($occurrences -eq 0) {
    if ($before.Contains($new)) {
        Write-Host 'Korrektur ist bereits vorhanden. Keine Aenderung notwendig.' -ForegroundColor Yellow
        exit 0
    }
    throw 'Die gesuchte Codezeile wurde nicht gefunden. Keine Aenderung vorgenommen. Bitte aktuelle lib/flight-certificates.ts senden.'
}
if ($occurrences -ne 1) {
    throw "Die gesuchte Codezeile wurde $occurrences-mal gefunden. Keine Aenderung vorgenommen."
}

# Sicherung bewusst ausserhalb des Git-Projekts ablegen.
$backup = Join-Path ([System.IO.Path]::GetTempPath()) ("rehkitzrettung-flight-mail-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.ts.bak')
[System.IO.File]::Copy($path, $backup)
$after = $before.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $after, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Erfolg: TypeScript-Fehler der SMTP-Empfaengerpruefung korrigiert.' -ForegroundColor Green
Write-Host "Datei: $path"
Write-Host "Sicherung: $backup"
Write-Host 'Jetzt: npm run build' -ForegroundColor Cyan
