# Rehkitzrettung - Organisationsname auf Befliegungsnachweisen aktualisieren
# Aendert gezielt Textstellen in der vorhandenen Datei, ohne sonstigen Code zu ersetzen.
$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $project 'lib\flight-certificates.ts'

if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  Write-Error "Datei nicht gefunden: $target. Das Skript bitte aus dem ZIP ins Projektverzeichnis entpacken."
  exit 1
}

$original = [System.IO.File]::ReadAllText($target)
$content = $original

# Jede Zeile muss entweder exakt einmal im alten Format oder bereits im neuen Format existieren.
# Bei einer unbekannten Version wird ABGEBROCHEN und nichts ueberschrieben.
$changes = @(
  @{
    Description = 'PDF-Kopfzeile'
    Old = 'Rehkitzrettung · Dokumentation der durchgeführten Flächenabsuche'
    New = 'Rehkitzrettung Hegering Hittfeld · Dokumentation der durchgeführten Flächenabsuche'
  },
  @{
    Description = 'PDF-Fusszeile'
    Old = 'Rehkitzrettung · Befliegungsnachweis · '
    New = 'Rehkitzrettung Hegering Hittfeld · Befliegungsnachweis · '
  },
  @{
    Description = 'E-Mail-Betreff'
    Old = 'Befliegungsnachweis Rehkitzrettung vom '
    New = 'Befliegungsnachweis Rehkitzrettung Hegering Hittfeld vom '
  },
  @{
    Description = 'E-Mail-Grussformel'
    Old = '"","Mit freundlichen Grüßen","Rehkitzrettung"'
    New = '"","Mit freundlichen Grüßen","Rehkitzrettung Hegering Hittfeld"'
  }
)

foreach ($change in $changes) {
  $old = [string]$change.Old
  $new = [string]$change.New
  $count = [regex]::Matches($content, [regex]::Escape($old)).Count
  if ($count -eq 1) {
    $content = $content.Replace($old, $new)
    Write-Host "Vorbereitet: $($change.Description)"
  } elseif ($count -eq 0 -and $content.Contains($new)) {
    Write-Host "Bereits angepasst: $($change.Description)"
  } else {
    Write-Error "Unerwarteter Quelltext bei: $($change.Description). Keine Datei geaendert."
    exit 1
  }
}

if ($content -eq $original) {
  Write-Host 'Alle vier Stellen sind bereits korrekt. Keine Aenderung noetig.'
  exit 0
}

$backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
[System.IO.File]::Copy($target, $backup)
[System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host ''
Write-Host 'Erfolgreich aktualisiert: lib/flight-certificates.ts'
Write-Host "Sicherung: $backup"
Write-Host 'Naechster Schritt: npm run build'
