<#
  Schul-Apps: Schluesselpaar fuer die Sicherung auf dem Betreiber-PC erzeugen (23.10.2026, Windows PowerShell 5.1).

  Der PRIVATE Schluessel bleibt auf diesem PC (Vorgabe %USERPROFILE%\.schul-apps-sicherung\, NICHT im Dropbox-Ordner)
  und wird mit einer Passphrase geschuetzt. Der OEFFENTLICHE Schluessel wird ausgegeben und gehoert auf den Server:
    -Verfahren openssl (Vorgabe): RSA 4096, braucht openssl.exe (z. B. aus Git fuer Windows:
                                  C:\Program Files\Git\usr\bin\openssl.exe) -> auf dem Server nach /root/sicherung-pc.pem
    -Verfahren age:               braucht age-keygen.exe (https://github.com/FiloSottile/age/releases)
                                  -> Zeile "age1..." auf dem Server nach /root/sicherung-empfaenger.age
  Eine zweite Kopie des privaten Schluessels (USB-Stick im Schrank, Ausdruck) gehoert an einen sicheren Ort: Ohne ihn
  ist KEINE Sicherung mehr zu oeffnen. Anleitung zur Wiederherstellung: deploy/strato/WIEDERHERSTELLEN.md

  Aufruf: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sicherungsschluessel-erzeugen.ps1 [-Verfahren openssl|age] [-Ordner <Pfad>]
#>
param(
  [ValidateSet('openssl', 'age')][string]$Verfahren = 'openssl',
  [string]$Ordner = (Join-Path $env:USERPROFILE '.schul-apps-sicherung')
)
$ErrorActionPreference = 'Stop'

if ($Ordner -match 'Dropbox|OneDrive|Google Drive') { throw "Der private Schluessel gehoert nicht in einen Cloud-Ordner: $Ordner" }
New-Item -ItemType Directory -Force -Path $Ordner | Out-Null

function Finde([string]$exe, [string[]]$orte) {
  $c = Get-Command $exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($o in $orte) { if (Test-Path $o) { return $o } }
  return $null
}

if ($Verfahren -eq 'openssl') {
  $openssl = Finde 'openssl.exe' @('C:\Program Files\Git\usr\bin\openssl.exe', 'C:\Program Files\Git\mingw64\bin\openssl.exe', 'C:\Program Files\OpenSSL-Win64\bin\openssl.exe')
  if (-not $openssl) { throw 'openssl.exe nicht gefunden (Git fuer Windows installieren oder -Verfahren age nutzen).' }
  $privat = Join-Path $Ordner 'sicherung-privat.pem'
  $oeffentlich = Join-Path $Ordner 'sicherung-pc.pem'
  if (Test-Path $privat) { throw "Es gibt schon einen privaten Schluessel: $privat (alte Sicherungen brauchen ihn - nicht ueberschreiben)." }
  Write-Output 'Gleich wird zweimal nach einer Passphrase fuer den privaten Schluessel gefragt (gut merken bzw. im Passwortmanager ablegen).'
  & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -aes-256-cbc -out $privat
  if ($LASTEXITCODE -ne 0) { throw 'Erzeugen fehlgeschlagen.' }
  & $openssl pkey -in $privat -pubout -out $oeffentlich
  if ($LASTEXITCODE -ne 0) { throw 'Oeffentlichen Schluessel ableiten fehlgeschlagen.' }
  Write-Output ''
  Write-Output "Privater Schluessel (bleibt hier): $privat"
  Write-Output "Oeffentlicher Schluessel:          $oeffentlich"
  Write-Output ''
  Write-Output 'Auf dem Server hinterlegen (eine Zeile in PowerShell):'
  Write-Output "  scp `"$oeffentlich`" schul-neu:/root/sicherung-pc.pem; ssh schul-neu 'chmod 600 /root/sicherung-pc.pem'"
  Write-Output ''
  Get-Content $oeffentlich
} else {
  $keygen = Finde 'age-keygen.exe' @((Join-Path $Ordner 'age\age-keygen.exe'))
  if (-not $keygen) { throw 'age-keygen.exe nicht gefunden (von https://github.com/FiloSottile/age/releases entpacken, in den PATH legen).' }
  $privat = Join-Path $Ordner 'sicherung-age.txt'
  if (Test-Path $privat) { throw "Es gibt schon einen privaten Schluessel: $privat" }
  & $keygen -o $privat
  if ($LASTEXITCODE -ne 0) { throw 'Erzeugen fehlgeschlagen.' }
  $oeffentlich = (Select-String -Path $privat -Pattern '^# public key: (age1\S+)').Matches[0].Groups[1].Value
  Write-Output ''
  Write-Output "Privater Schluessel (bleibt hier, ohne Passphrase - Ordner schuetzen!): $privat"
  Write-Output 'Auf dem Server hinterlegen:'
  Write-Output "  ssh schul-neu `"apt-get install -y age && echo $oeffentlich > /root/sicherung-empfaenger.age && chmod 600 /root/sicherung-empfaenger.age`""
  Write-Output ''
  Write-Output $oeffentlich
}
# Nur der eigene Nutzer darf den Ordner lesen
icacls $Ordner /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
