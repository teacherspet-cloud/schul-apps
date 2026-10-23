#!/bin/sh
# Nächtliche Sicherung von Schul-Apps (09.10.2026, neuer Server; erweitert 23.10.2026, Prüfung des Schulträgers):
#
#  1. Datenbank: konsistente Kopie per VACUUM INTO (im Container). Wie bisher als <DATEN>/sicherungen/<Name>-nacht.db.gz
#     (sichtbar in „Verwaltung › Server", die neuesten 14 bleiben).
#  2. Archiv mit Datenbank UND Dateiablagen (nutzer, fach, system, lehrwerke, sprechbilder – dort ohnehin verschlüsselt
#     abgelegt; ohne die Anmeldedaten der KI-Programme nutzer/*/ki und system/ki) und inhalt.json (Zeilen je Tabelle).
#  3. Verschlüsselt mit dem ÖFFENTLICHEN Schlüssel des Betreiber-PCs – der Server hat den Schlüssel zum Öffnen nie:
#       age     wenn `age` installiert ist und /root/sicherung-empfaenger.age (Zeile „age1…") existiert
#       openssl sonst mit /root/sicherung-pc.pem (öffentlicher RSA-Schlüssel): zufälliges Passwort für AES-256-CBC
#               (PBKDF2), Passwort + SHA-256 des Archivs per RSA-OAEP-SHA256 verschlüsselt
#     Im Archiv liegt zusätzlich der Hauptschlüssel des Servers, ebenso mit dem Schlüssel des PCs verschlüsselt – eine
#     Wiederherstellung geht damit allein vom PC aus (deploy/strato/WIEDERHERSTELLEN.md).
#     Ergebnis: /root/sicherungen/schulapps-<Datum>.sicherung.tar (14 Tage), abgeholt vom PC (scripts/sicherung-holen.ps1).
#  4. Monatlich (am 1., wenn der letzte Test älter als 31 Tage ist, oder mit --pruefen) Wiederherstellungstest: Die
#     unverschlüsselte Zwischenkopie wird nach <DATEN>/sicherungen/.pruefung-<Name>/ entpackt; der Server prüft sie
#     (integrity_check, Zeilen je Tabelle, Stichprobe mit dem Hauptschlüssel), zeigt das Ergebnis in „Verwaltung ›
#     Server" und im Protokoll und entfernt den Ordner. Die Zwischenkopie selbst wird nach jedem Lauf gelöscht.
#  5. Stand für die Verwaltung: <DATEN>/sicherungen/stand-nacht.json (nur Zahlen und Dateinamen).
#
# Aufrufe:  schul-apps-sicherung.sh                      Nachtlauf (cron 2:30)
#           schul-apps-sicherung.sh --pruefen            Nachtlauf mit Wiederherstellungstest
#           schul-apps-sicherung.sh --abgeholt <Datei>   vom PC nach dem Abholen (vermerkt Zeit und Datei)
set -eu
umask 077
ZIEL=/root/sicherungen
CONTAINER=schul-apps
VOLUME=schul-apps-daten
HAUPTSCHLUESSEL=/opt/schul-apps/geheim/hauptschluessel
AGE_EMPFAENGER=/root/sicherung-empfaenger.age
RSA_PC=/root/sicherung-pc.pem
ORDNER="${SCHULAPPS_SICHERUNG_ORDNER:-nutzer fach system lehrwerke sprechbilder}"
BEHALTEN_TAGE=14

mkdir -p "$ZIEL"; chmod 700 "$ZIEL"
MP=$(docker volume inspect -f '{{ .Mountpoint }}' "$VOLUME")
SICH="$MP/sicherungen"
jetzt() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if [ "${1:-}" = "--abgeholt" ]; then
  DATEI=$(basename "${2:-}" | tr -cd 'A-Za-z0-9._-')
  printf '{"zeit":"%s","archiv":"%s"}\n' "$(jetzt)" "$DATEI" > "$SICH/stand-abgeholt.json"
  chmod 644 "$SICH/stand-abgeholt.json"
  exit 0
fi

NAME="schulapps-$(date +%Y-%m-%d-%H%M)"
PAKET="$SICH/.paket-$NAME"
ARBEIT=$(mktemp -d "$ZIEL/.arbeit-XXXXXX")
STAND_OK=false; STAND_MELDUNG=""; VERFAHREN=""; ARCHIV=""; GROESSE=0
stand() {
  printf '{"zeit":"%s","ok":%s,"archiv":"%s","groesse":%s,"verfahren":"%s","meldung":"%s"}\n' \
    "$(jetzt)" "$STAND_OK" "$ARCHIV" "$GROESSE" "$VERFAHREN" "$STAND_MELDUNG" > "$SICH/stand-nacht.json" || true
  chmod 644 "$SICH/stand-nacht.json" 2>/dev/null || true
}
aufraeumen() {
  if [ "$STAND_OK" != true ]; then
    [ -n "$STAND_MELDUNG" ] || STAND_MELDUNG="Nachtsicherung abgebrochen (Protokoll: journalctl bzw. Mail von cron)"
    stand
  fi
  rm -rf "$ARBEIT" "$PAKET"
}
trap aufraeumen EXIT

# 1. Datenbank-Kopie und inhalt.json im Container (als Nutzer node, im Datenvolume)
docker exec -i -e NAME="$NAME" "$CONTAINER" node - <<'JS'
const { DatabaseSync } = require('node:sqlite'), fs = require('fs'), zlib = require('zlib')
const name = process.env.NAME, o = '/daten/sicherungen', paket = `${o}/.paket-${name}`
fs.mkdirSync(paket, { recursive: true, mode: 0o700 })
const roh = `${paket}/schulapps.db`
new DatabaseSync('/daten/schulapps.db').exec(`VACUUM INTO '${roh}'`)
const k = new DatabaseSync(roh, { readOnly: true })
const tabellen = {}
for (const { name: t } of k.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all())
  tabellen[t] = Number(k.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n)
k.close()
fs.writeFileSync(`${paket}/inhalt.json`, JSON.stringify({ zeit: new Date().toISOString(), tabellen }), { mode: 0o600 })
fs.writeFileSync(`${o}/${name}-nacht.db.gz`, zlib.gzipSync(fs.readFileSync(roh)), { mode: 0o600 })
// wie sicherungenAufraeumen im Server: nur die neuesten 14 behalten
const alle = fs.readdirSync(o).filter((n) => /^schulapps-.*\.db(\.gz)?$/.test(n)).sort().reverse()
for (const n of alle.slice(14)) fs.rmSync(`${o}/${n}`)
JS

# 2. Archiv (unverschlüsselte Zwischenkopie, nur in $ARBEIT unter /root, Rechte 700)
VORHANDEN=""
for o in $ORDNER; do if [ -d "$MP/$o" ]; then VORHANDEN="$VORHANDEN $o"; fi; done
# Laufender Server: eine Datei kann sich beim Packen ändern („file changed as we read it“, Rückgabe 1) – das ist eine
# Warnung, kein Fehler (23.10.2026; die Datenbank selbst ist die konsistente VACUUM-Kopie). Andere Fehler brechen ab.
TAR_RC=0
# shellcheck disable=SC2086
tar -czf "$ARBEIT/daten.tar.gz" --warning=no-file-changed --exclude='nutzer/*/ki' --exclude='system/ki' \
  -C "$PAKET" schulapps.db inhalt.json -C "$MP" $VORHANDEN || TAR_RC=$?
if [ "$TAR_RC" -gt 1 ]; then STAND_MELDUNG="Archiv fehlgeschlagen (tar $TAR_RC)"; exit 1; fi
DATEIEN=$(tar -tzf "$ARBEIT/daten.tar.gz" | grep -vc '/$' || true)

# 3. Für den PC verschlüsseln
TEILE=""
if command -v age >/dev/null 2>&1 && [ -s "$AGE_EMPFAENGER" ]; then
  VERFAHREN=age
  age -R "$AGE_EMPFAENGER" -o "$ARBEIT/daten.tar.gz.age" "$ARBEIT/daten.tar.gz"
  age -R "$AGE_EMPFAENGER" -o "$ARBEIT/hauptschluessel.age" "$HAUPTSCHLUESSEL"
  TEILE="daten.tar.gz.age hauptschluessel.age"
elif [ -s "$RSA_PC" ]; then
  VERFAHREN=openssl
  OAEP="-pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256"
  # Zeile 1: Passwort (zufällig, nur für dieses Archiv), Zeile 2: SHA-256 des unverschlüsselten Archivs
  { openssl rand -hex 32; sha256sum "$ARBEIT/daten.tar.gz" | cut -d' ' -f1; } > "$ARBEIT/schluessel.txt"
  head -n 1 "$ARBEIT/schluessel.txt" > "$ARBEIT/passwort"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$ARBEIT/passwort" -in "$ARBEIT/daten.tar.gz" -out "$ARBEIT/daten.tar.gz.enc"
  # shellcheck disable=SC2086
  openssl pkeyutl -encrypt -pubin -inkey "$RSA_PC" $OAEP -in "$ARBEIT/schluessel.txt" -out "$ARBEIT/schluessel.rsa"
  # shellcheck disable=SC2086
  openssl pkeyutl -encrypt -pubin -inkey "$RSA_PC" $OAEP -in "$HAUPTSCHLUESSEL" -out "$ARBEIT/hauptschluessel.rsa"
  rm -f "$ARBEIT/passwort" "$ARBEIT/schluessel.txt"
  TEILE="daten.tar.gz.enc schluessel.rsa hauptschluessel.rsa"
else
  STAND_MELDUNG="Kein öffentlicher Schlüssel des PCs hinterlegt ($AGE_EMPFAENGER bzw. $RSA_PC) - keine Kopie für den PC"
fi
if [ -n "$TEILE" ]; then
  cat > "$ARBEIT/LIESMICH.txt" <<TXT
Schul-Apps-Sicherung $NAME ($VERFAHREN), $DATEIEN Dateien.
Öffnen nur mit dem privaten Schlüssel des Betreiber-PCs - Anleitung: deploy/strato/WIEDERHERSTELLEN.md
TXT
  printf '%s\n' "$VERFAHREN" > "$ARBEIT/verfahren.txt"
  # shellcheck disable=SC2086
  tar -cf "$ZIEL/$NAME.sicherung.tar.teil" -C "$ARBEIT" LIESMICH.txt verfahren.txt $TEILE
  mv "$ZIEL/$NAME.sicherung.tar.teil" "$ZIEL/$NAME.sicherung.tar"
  chmod 600 "$ZIEL/$NAME.sicherung.tar"
  ARCHIV="$NAME.sicherung.tar"
  GROESSE=$(stat -c %s "$ZIEL/$ARCHIV")
fi

# 4. Wiederherstellungstest (monatlich)
FAELLIG=false
if [ "${1:-}" = "--pruefen" ] || [ "$(date +%d)" = "01" ]; then FAELLIG=true; fi
if [ -z "$(find "$SICH" -maxdepth 1 -name stand-pruefung.json -mtime -31 2>/dev/null)" ]; then FAELLIG=true; fi
if [ "$FAELLIG" = true ]; then
  rm -rf "$SICH"/.pruefung-*
  PRUEF="$SICH/.pruefung-$NAME"
  mkdir -p "$PRUEF"
  tar -xzf "$ARBEIT/daten.tar.gz" -C "$PRUEF"
  GEFUNDEN=$(find "$PRUEF" -type f | wc -l)
  printf '{"archiv":"%s","dateien":{"erwartet":%s,"gefunden":%s}}\n' "${ARCHIV:-$NAME}" "$DATEIEN" "$GEFUNDEN" > "$PRUEF/bereit.json.teil"
  # Der Server (Nutzer node, uid 1000) prüft innerhalb von 10 Minuten und entfernt den Ordner danach
  chown -R 1000:1000 "$PRUEF"
  mv "$PRUEF/bereit.json.teil" "$PRUEF/bereit.json"
fi

# Aufräumen: 14 Tage (verschlüsselte Archive und die früheren .db.gz-Kopien)
find "$ZIEL" -maxdepth 1 \( -name 'schulapps-*.sicherung.tar' -o -name 'schulapps-*.db.gz' \) -mtime +$BEHALTEN_TAGE -delete
find "$ZIEL" -maxdepth 1 -name '*.teil' -mtime +1 -delete
# Vor-Update-Kopien im Datenvolume (vor-<Version>.db) nach 14 Tagen löschen – wie die Archive (23.10.2026, Löschkonzept,
# Nachprüfung des Schulträgers: vorher 30 Tage)
find "$SICH" -maxdepth 1 -name 'vor-*.db' -mtime +$BEHALTEN_TAGE -delete
# Einzelsicherungen des Servers (sicherung-vor-iserv-abgleich-*.db, sicherung-vor-schuljahreswechsel-*.db) ebenso
find "$MP" -maxdepth 1 -name 'sicherung-vor-*.db' -mtime +$BEHALTEN_TAGE -delete

# Ehrlicher Stand (23.10.2026, Nachprüfung des Schulträgers): „ok" nur mit verschlüsselter Kopie für den PC. Ohne Schlüssel
# des PCs liegt nur die Datenbank-Kopie im Datenvolume – bei Verlust des Servers wäre sie mit weg → ok=false (rot).
if [ -n "$ARCHIV" ]; then
  STAND_OK=true
  [ -n "$STAND_MELDUNG" ] || STAND_MELDUNG="Datenbank und $DATEIEN Dateien gesichert"
else
  STAND_OK=false
  STAND_MELDUNG="${STAND_MELDUNG:-Keine Kopie für den PC erzeugt}. Nur die Datenbank-Kopie im Datenvolume des Servers ($NAME-nacht.db.gz) - keine Sicherung außerhalb des Servers"
fi
stand
