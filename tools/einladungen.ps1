# Einladungs-Links erzeugen (18.11.2026).
# Erzeugt Codes auf diesem Rechner, schickt nur deren SHA-256-Werte an den Workflow „Einladungen anlegen“ und schreibt
# die fertigen Links in eine Datei in „Dokumente“ (nicht ins Repository – wer den Link hat, kann ein Konto anlegen).
# Jeder Link gilt genau einmal. Braucht die GitHub-Kommandozeile (gh), angemeldet.
#
#   powershell -File tools/einladungen.ps1 -Anzahl 9
#   powershell -File tools/einladungen.ps1 -Anzahl 1 -Verwalter     # eigene Einladung: sieht die Datennutzung
param(
  [int]$Anzahl = 1,
  [switch]$Verwalter,
  [string]$Datei = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Bibliothek-Einladungen.txt')
)
$ErrorActionPreference = 'Stop'
if ($Anzahl -lt 1 -or $Anzahl -gt 50) { throw 'Anzahl zwischen 1 und 50.' }

$alphabet = 'abcdefghkmnpqrstuvwxyz23456789'.ToCharArray() # ohne leicht verwechselbare Zeichen (0/o, 1/l/i, j)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$sha = [System.Security.Cryptography.SHA256]::Create()
$links = @()
$hashes = @()
for ($i = 0; $i -lt $Anzahl; $i++) {
  $bytes = New-Object byte[] 12
  $rng.GetBytes($bytes)
  $code = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  $hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($code)) | ForEach-Object { $_.ToString('x2') })
  $hashes += $(if ($Verwalter) { "admin:$hash" } else { $hash })
  $links += "https://vilehan.github.io/private-library/#einladung-$code"
}

& gh workflow run invites.yml --repo vileHan/private-library -f "hashes=$($hashes -join ',')"
if ($LASTEXITCODE -ne 0) { throw 'Workflow konnte nicht gestartet werden (gh angemeldet?).' }

$kopf = "--- $(Get-Date -Format 'dd.MM.yyyy HH:mm') · $Anzahl $(if ($Verwalter) { 'Verwalter-' } else { '' })Einladung(en) · jeder Link gilt einmal ---"
Add-Content -Path $Datei -Value (@('', $kopf) + $links) -Encoding UTF8
Write-Host "$Anzahl Einladung(en) erzeugt. Links stehen in: $Datei"
Write-Host 'Gültig, sobald der Workflow „Einladungen anlegen“ durchgelaufen ist (~1 Minute).'
