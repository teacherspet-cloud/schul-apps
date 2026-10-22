<#
  Schul-Apps: geplante Aufgabe "Schul-Apps Sicherung holen" einrichten (23.10.2026, Windows PowerShell 5.1).
  Laeuft taeglich um 07:00 und bei jeder Anmeldung (verpasste Laeufe werden nachgeholt), als angemeldeter Nutzer
  (der ssh-Schluessel fuer "schul-neu" liegt in dessen Profil). Ruft scripts/sicherung-holen.ps1 auf.

  Aufruf (einmalig, normale PowerShell genuegt):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sicherung-holen-einrichten.ps1 [-Ziel D:\Dropbox\Schul-Apps-Sicherungen] [-Uhrzeit 07:00]
  Entfernen: Unregister-ScheduledTask -TaskName 'Schul-Apps Sicherung holen' -Confirm:$false
#>
param(
  [string]$Ziel = 'D:\Dropbox\Schul-Apps-Sicherungen',
  [string]$Uhrzeit = '07:00',
  [string]$Name = 'Schul-Apps Sicherung holen'
)
$ErrorActionPreference = 'Stop'

$skript = Join-Path $PSScriptRoot 'sicherung-holen.ps1'
if (-not (Test-Path $skript)) { throw "Nicht gefunden: $skript" }
# Das Skript an einen festen Ort ausserhalb von Dropbox kopieren, damit die Aufgabe nicht an einem Sync haengt
$heim = Join-Path $env:LOCALAPPDATA 'Schul-Apps'
New-Item -ItemType Directory -Force -Path $heim | Out-Null
$fest = Join-Path $heim 'sicherung-holen.ps1'
Copy-Item -Force $skript $fest

$aktion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Ziel "{1}"' -f $fest, $Ziel)
$ausloeser = @(
  (New-ScheduledTaskTrigger -Daily -At $Uhrzeit),
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
)
$einst = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$wer = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $Name -Action $aktion -Trigger $ausloeser -Settings $einst -Principal $wer -Description 'Holt die verschluesselte Nachtsicherung von Schul-Apps (schul-neu) in den Sicherungsordner.' -Force | Out-Null
Write-Output "Geplante Aufgabe '$Name' eingerichtet: taeglich $Uhrzeit und bei der Anmeldung, Ziel $Ziel"
Write-Output "Skript: $fest  (nach Aenderungen am Skript dieses Einrichten erneut ausfuehren)"
Write-Output "Sofort testen: Start-ScheduledTask -TaskName '$Name'  - Protokoll: $Ziel\holen.log"
