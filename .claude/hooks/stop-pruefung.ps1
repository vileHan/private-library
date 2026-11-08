# Stop-Hook: Bevor Claude eine Antwort beendet, wird geprüft, ob der aktuelle Stand vom Prüfer-Agenten abgenommen ist.
# Ist er es nicht, hält der Hook Claude einmal an (Exit-Code 2) und schickt ihm die Aufforderung unten.
# Danach (stop_hook_active = true) lässt er Claude in jedem Fall aufhören – so entsteht keine Endlosschleife,
# z. B. wenn gerade nur auf einen Import gewartet wird oder der Nutzer eine reine Frage gestellt hat.
$inputJson = [Console]::In.ReadToEnd()
try { $data = $inputJson | ConvertFrom-Json } catch { $data = $null }
if ($data -and $data.stop_hook_active) { exit 0 }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$result = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\pruefstempel.ps1')
if ($LASTEXITCODE -eq 0) { exit 0 }

[Console]::Error.WriteLine(@'
Der aktuelle Stand (Code, Styles, Datenbank, Workflows oder Tests) ist noch nicht vom Prüfer abgenommen.
Bitte jetzt den Prüfer-Agenten aufrufen (Agent mit subagent_type "pruefer"), seine Mängel beheben und erneut prüfen lassen
(höchstens 3 Runden). Er setzt bei „BESTANDEN“ den Prüf-Stempel. Ausnahme: Ist die Arbeit noch mitten im Gange
(z. B. Warten auf einen laufenden Import) oder war es eine reine Frage ohne Änderung, kurz begründen und beenden.
'@)
exit 2
