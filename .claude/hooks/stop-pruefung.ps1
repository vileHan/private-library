# Stop-Hook: Bevor Claude eine Antwort beendet, wird geprüft, ob der aktuelle Stand vom Prüfer-Agenten abgenommen ist.
# Ist er es nicht, hält der Hook Claude einmal an (Exit-Code 2) und schickt ihm die Aufforderung unten.
# Danach (stop_hook_active = true) lässt er Claude in jedem Fall aufhören – so entsteht keine Endlosschleife,
# z. B. wenn gerade nur auf einen Import gewartet wird oder der Nutzer eine reine Frage gestellt hat.
[Console]::OutputEncoding = [Text.Encoding]::UTF8 # sonst kommen Umlaute als „Pr�fer“ an
$inputJson = [Console]::In.ReadToEnd()
try { $data = $inputJson | ConvertFrom-Json } catch { $data = $null }
if ($data -and $data.stop_hook_active) { exit 0 }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$result = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\pruefstempel.ps1')
if ($LASTEXITCODE -eq 0) { exit 0 }

[Console]::Error.WriteLine(@'
Der aktuelle Stand (Code, Styles, Datenbank, Workflows oder Tests) ist noch ungeprüft.
Prüfstufe nach CLAUDE.md wählen: Stufe 1 (kleine, von Tests abgedeckte Änderung) = Tests selbst laufen lassen und
bei grün selbst stempeln (tools/pruefstempel.ps1 -Setzen); Stufe 2/3 = Prüfer-Agent (subagent_type "pruefer"), höchstens 3 Runden.
Ausnahme: Ist die Arbeit noch mitten im Gange (z. B. eine Prüfrunde oder ein Import läuft) oder war es eine reine Frage
ohne Änderung, kurz begründen und beenden.
'@)
exit 2
