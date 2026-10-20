# Installiert NUR den Aufruf nach dem Abschluss eines Auftrags.
# Verwendet die aktuelle Route des Projekts - ersetzt niemals die Gesamtdatei.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$path = Join-Path $root 'app/api/orders/[id]/route.ts'
if (-not [System.IO.File]::Exists($path)) {
  throw "Datei nicht gefunden: $path. Bitte dieses Skript im Projektordner ausfuehren."
}
$original = [System.IO.File]::ReadAllText($path)
$importLine = 'import { maybeSendFlightAfterOrderCompleted } from "@/lib/flight-certificates";'
if ($original.Contains('maybeSendFlightAfterOrderCompleted')) {
  Write-Host 'Der Auto-Versand ist bereits eingebaut. Keine Aenderung.' -ForegroundColor Green
  exit 0
}
$start = $original.IndexOf('export async function PATCH(')
if ($start -lt 0) { throw 'PATCH-Route nicht gefunden. Nichts geaendert.' }
$end = $original.IndexOf('export async function DELETE(', $start)
if ($end -lt 0) { throw 'DELETE-Grenze nicht gefunden. Bitte aktuelle Auftragsroute pruefen. Nichts geaendert.' }
$head = $original.Substring(0, $start)
$patch = $original.Substring($start, $end - $start)
$tail = $original.Substring($end)
$pattern = '(?m)^([ \t]*)return NextResponse\.json\(normalizeOrderResponse\(order\)\);'
$count = [regex]::Matches($patch, $pattern).Count
if ($count -lt 1 -or $count -gt 3) {
  throw "Unerwartete Struktur der Auftrags-API ($count Rueckgaben gefunden). Keine Datei geaendert. Bitte route.ts schicken."
}
$replacement = [regex]::Replace($patch, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{
  param($match)
  $lineIndent = $match.Groups[1].Value
  $extra = @(
    'if (existingOrder.status !== "ERLEDIGT" && order.status === "ERLEDIGT") {',
    '  try {',
    '    await maybeSendFlightAfterOrderCompleted(order.id);',
    '  } catch (error) {',
    '    // Der erfolgreiche Auftragsabschluss darf nie durch einen Mailfehler verloren gehen.',
    '    console.error("Befliegungsnachweis beim Auftragsabschluss:", error);',
    '  }',
    '}',
    'return NextResponse.json(normalizeOrderResponse(order));'
  )
  # Den gesamten Einrueckungsblock exakt wie bei der Originalzeile uebernehmen.
  $lineIndent + ($extra -join ("`n" + $lineIndent))
})
# Ein neuer Import nur am Dateianfang - unveraendert bleibt alles andere.
$newContent = $importLine + "`r`n" + $head + $replacement + $tail
$backup = "$path.before-flightcert-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
[System.IO.File]::Copy($path, $backup)
[System.IO.File]::WriteAllText($path, $newContent, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Erfolg: $count Abschluss-Stelle(n) ergaenzt." -ForegroundColor Green
Write-Host "Sicherung: $backup"
