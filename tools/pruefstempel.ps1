# Prüf-Stempel: merkt sich, welcher Stand von App und Katalog-Code zuletzt vom Prüfer-Agenten abgenommen wurde.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/pruefstempel.ps1 -Setzen   → Stempel für den jetzigen Stand
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/pruefstempel.ps1           → "aktuell" oder "veraltet"
# Der Stop-Hook (.claude/hooks/stop-pruefung.ps1) nutzt das, um Claude erst fertig melden zu lassen, wenn geprüft ist.
# Gezählt werden nur Dateien, die das Verhalten ändern (Code, Styles, Datenbank, Workflows, Tests) – keine Doku.
param([switch]$Setzen)

$root = Split-Path -Parent $PSScriptRoot
$stamp = Join-Path $root '.claude\pruefung.json'
$include = @('index.html', 'sw.js', 'manifest.webmanifest', 'js', 'css', 'supabase', 'scripts', 'tests', '.github\workflows')

function Get-StandHash {
  $lines = foreach ($p in $include) {
    $full = Join-Path $root $p
    if (-not (Test-Path $full)) { continue }
    Get-ChildItem -Path $full -File -Recurse | Sort-Object FullName | ForEach-Object {
      $rel = $_.FullName.Substring($root.Length + 1)
      # Zeilenenden vereinheitlichen, damit Git (CRLF/LF) den Stempel nicht ungültig macht
      $text = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
      $bytes = [Text.Encoding]::UTF8.GetBytes($text)
      $h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes))
      "$rel=$h"
    }
  }
  $all = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($all)).Replace('-', '')
}

$hash = Get-StandHash
if ($Setzen) {
  @{ hash = $hash; zeit = (Get-Date).ToString('yyyy-MM-dd HH:mm') } | ConvertTo-Json | Set-Content -Encoding utf8 $stamp
  Write-Output "Prüf-Stempel gesetzt ($((Get-Date).ToString('HH:mm')))."
  exit 0
}
$old = if (Test-Path $stamp) { (Get-Content -Raw -Encoding utf8 $stamp | ConvertFrom-Json).hash } else { '' }
if ($old -eq $hash) { Write-Output 'aktuell'; exit 0 } else { Write-Output 'veraltet'; exit 1 }
