#!/bin/sh
# Nächtliche Sicherung der Schul-Apps-Datenbank (09.10.2026, neuer Server): konsistente Kopie per VACUUM INTO.
# Sie landet im Datenordner unter sicherungen/ (dort zeigt sie „Schule & Daten › Server"; die neuesten 14 bleiben)
# und zusätzlich als Kopie außerhalb des Docker-Volumes in /root/sicherungen (14 Tage, nur für root lesbar).
# Die Inhalte sind feldweise verschlüsselt (Hauptschlüssel liegt NICHT hier).
set -eu
ZIEL=/root/sicherungen
mkdir -p "$ZIEL"; chmod 700 "$ZIEL"
NAME="schulapps-$(date +%Y-%m-%d-%H%M)-nacht"
docker exec schul-apps node -e "
const {DatabaseSync}=require('node:sqlite'),fs=require('fs'),zlib=require('zlib')
fs.mkdirSync('/daten/sicherungen',{recursive:true})
const roh='/daten/sicherungen/$NAME.db.teil'
new DatabaseSync('/daten/schulapps.db').exec(\"VACUUM INTO '\"+roh+\"'\")
fs.writeFileSync('/daten/sicherungen/$NAME.db.gz',zlib.gzipSync(fs.readFileSync(roh)),{mode:0o600})
fs.rmSync(roh)
// wie sicherungenAufraeumen im Server: nur die neuesten 14 behalten
const alle=fs.readdirSync('/daten/sicherungen').filter(n=>/^schulapps-.*\.db(\.gz)?$/.test(n)).sort().reverse()
for (const n of alle.slice(14)) fs.rmSync('/daten/sicherungen/'+n)"
docker cp "schul-apps:/daten/sicherungen/$NAME.db.gz" "$ZIEL/$NAME.db.gz"
chmod 600 "$ZIEL/$NAME.db.gz"
find "$ZIEL" -name 'schulapps-*.db.gz' -mtime +14 -delete
