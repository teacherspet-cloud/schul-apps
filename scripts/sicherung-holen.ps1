<#
  Schul-Apps: verschluesselte Nachtsicherung vom Server auf den Betreiber-PC holen
  (23.10.2026, Pruefung des Schultraegers, Loeschkonzept/Sicherung; Windows PowerShell 5.1).

  - fragt per ssh (Alias "schul-neu" aus ~/.ssh/config) die neueste Datei /root/sicherungen/schulapps-*.sicherung.tar ab,
  - holt sie per scp in den Zielordner (Vorgabe D:\Dropbox\Schul-Apps-Sicherungen), sofern sie dort noch fehlt,
  - prueft die SHA-256-Pruefsumme gegen den Server, meldet dem Server die Abholung (Anzeige in Verwaltung > Server),
  - behaelt die neuesten 30 Archive und schreibt ein Protokoll (holen.log im Zielordner).
  Die Archive sind mit dem oeffentlichen Schluessel dieses PCs verschluesselt; der private Schluessel gehoert NICHT in
  den Dropbox-Ordner (scripts/sicherungsschluessel-erzeugen.ps1). Eingerichtet als geplante Aufgabe von
  scripts/sicherung-holen-einrichten.ps1.

  Aufruf: powershell -NoProfile -ExecutionPolicy Bypass -File sicherung-holen.ps1 [-Ziel <Ordner>] [-Behalten 30] [-Server schul-neu]
#>
param(
  [string]$Ziel = 'D:\Dropbox\Schul-Apps-Sicherungen',
  [int]$Behalten = 30,
  [string]$Server = 'schul-neu',
  [string]$Ordner = '/root/sicherungen'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Ziel)) { New-Item -ItemType Directory -Force -Path $Ziel | Out-Null }
$log = Join-Path $Ziel 'holen.log'
function Schreibe([string]$text) {
  $zeile = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text
  Add-Content -Path $log -Value $zeile -Encoding UTF8
  Write-Output $zeile
}

try {
  $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
  $scp = (Get-Command scp.exe -ErrorAction Stop).Source
  $sshOpt = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')

  $neueste = & $ssh @sshOpt $Server "ls -1 $Ordner/schulapps-*.sicherung.tar 2>/dev/null | sort | tail -n 1"
  if ($LASTEXITCODE -ne 0) { throw "ssh $Server fehlgeschlagen (Exitcode $LASTEXITCODE)" }
  $neueste = "$neueste".Trim()
  if (-not $neueste) { throw "Keine Sicherung auf dem Server gefunden ($Ordner). Ist der oeffentliche Schluessel des PCs dort hinterlegt?" }
  if ($neueste -notmatch '^/[A-Za-z0-9/._-]+\.sicherung\.tar$') { throw "Unerwarteter Dateiname: $neueste" }
  $name = Split-Path $neueste -Leaf
  $lokal = Join-Path $Ziel $name

  $fern = (& $ssh @sshOpt $Server "sha256sum '$neueste' | cut -d' ' -f1")
  if ($LASTEXITCODE -ne 0) { throw 'Pruefsumme auf dem Server nicht lesbar' }
  $fern = "$fern".Trim().ToLower()

  if ((Test-Path $lokal) -and ((Get-FileHash -Algorithm SHA256 -Path $lokal).Hash.ToLower() -eq $fern)) {
    Schreibe "Schon vorhanden: $name"
  } else {
    $teil = "$lokal.teil"
    if (Test-Path $teil) { Remove-Item -Force $teil }
    & $scp -q -o BatchMode=yes -o ConnectTimeout=20 "${Server}:$neueste" "$teil"
    if ($LASTEXITCODE -ne 0) { throw "scp fehlgeschlagen (Exitcode $LASTEXITCODE)" }
    $hier = (Get-FileHash -Algorithm SHA256 -Path $teil).Hash.ToLower()
    if ($hier -ne $fern) { Remove-Item -Force $teil; throw "Pruefsumme stimmt nicht ($name) - Datei verworfen" }
    Move-Item -Force $teil $lokal
    $mb = [math]::Round((Get-Item $lokal).Length / 1MB, 1)
    Schreibe "Geholt: $name ($mb MB, Pruefsumme ok)"
  }

  # Abholung beim Server vermerken (Verwaltung > Server zeigt sie an)
  & $ssh @sshOpt $Server "/usr/local/bin/schul-apps-sicherung.sh --abgeholt '$name'" | Out-Null
  if ($LASTEXITCODE -ne 0) { Schreibe 'Hinweis: Abholung konnte dem Server nicht gemeldet werden' }

  # Die neuesten $Behalten behalten (Namen enthalten Datum und Uhrzeit)
  $alle = Get-ChildItem -Path $Ziel -Filter 'schulapps-*.sicherung.tar' | Sort-Object Name -Descending
  if ($alle.Count -gt $Behalten) {
    foreach ($a in $alle[$Behalten..($alle.Count - 1)]) { Remove-Item -Force $a.FullName; Schreibe "Entfernt (aelter als die neuesten $Behalten): $($a.Name)" }
  }
  # Protokoll kurz halten
  $zeilen = Get-Content -Path $log -Encoding UTF8
  if ($zeilen.Count -gt 2000) { $zeilen[-1000..-1] | Set-Content -Path $log -Encoding UTF8 }
  exit 0
} catch {
  Schreibe "FEHLER: $($_.Exception.Message)"
  exit 1
}
