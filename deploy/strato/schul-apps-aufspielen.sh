#!/bin/sh
# Schul-Apps auf schul-neu aufspielen – EIN Schritt, der danach aufräumt (24.10.2026).
#
# Hintergrund: Bis 0.4.178 wurde nur mit `tar xzf` entpackt. tar legt dazu und löscht nichts, dadurch sammelten sich in
# oberflaeche/assets 2.400 alte Bündel (1,6 GB), jedes Aufspielen legte sie als neue Schicht in den Docker-Build-Cache
# (76 GB, Platte 80 % voll). Dazu lagen 52 Vor-Update-Kopien (6,9 GB) in /root ohne Aufräumregel.
#
# Ablauf:
#   0. Unterrichtszeit (Mo–Fr 7:30–14:00) → Abbruch, außer mit --jetzt (Neustart würde laufende Tests stören)
#   1. Vor-Update-Kopie der Datenbank (VACUUM INTO im laufenden Container) nach /root/sicherung-vor-update-<Zeit>.db
#   2. server/, oberflaeche/, resources/ löschen und das Paket frisch entpacken (geheim/ und die Override-Datei bleiben)
#   3. docker compose up -d --build, bis zu 90 s auf „healthy“ warten
#   4. Aufräumen: Build-Cache auf 4 GB begrenzen (Grundschichten apt/npm bleiben für schnelle Bauten), alte Images
#      weg, Paket in /tmp weg, ältere Vor-Update-Kopien weg (nur die eben erzeugte bleibt bis zum nächsten Mal)
#
# Aufruf vom PC:  scp dist/schul-apps-server.tgz schul-neu:/tmp/ && ssh schul-neu schul-apps-aufspielen.sh
#                 ssh schul-neu schul-apps-aufspielen.sh /tmp/schul-apps-server.tgz --jetzt   (trotz Unterrichtszeit)
set -eu
PAKET=/tmp/schul-apps-server.tgz
JETZT=false
for a in "$@"; do
  case "$a" in
    --jetzt) JETZT=true ;;
    *) PAKET=$a ;;
  esac
done
ZIEL=/opt/schul-apps
CONTAINER=schul-apps
STEMPEL=$(date +%Y%m%d-%H%M)
KOPIE="/root/sicherung-vor-update-$STEMPEL.db"

[ -s "$PAKET" ] || { echo "Paket fehlt oder leer: $PAKET"; exit 1; }
tar tzf "$PAKET" ./server/start.mjs ./oberflaeche/index.html ./Dockerfile >/dev/null 2>&1 || { echo "Kein Schul-Apps-Paket: $PAKET"; exit 1; }

# 0. Unterrichtszeit
WT=$(date +%u); HM=$(date +%H%M)
if [ "$JETZT" = false ] && [ "$WT" -le 5 ] && [ "$HM" -ge 0730 ] && [ "$HM" -lt 1400 ]; then
  echo "Unterrichtszeit (Mo–Fr 7:30–14:00): kein Neustart. Später erneut aufrufen oder --jetzt anhängen."
  exit 2
fi

# 1. Vor-Update-Kopie
echo "1/4 Vor-Update-Kopie der Datenbank …"
MP=$(docker volume inspect -f '{{ .Mountpoint }}' schul-apps-daten)
docker exec "$CONTAINER" node -e "new (require('node:sqlite').DatabaseSync)('/daten/schulapps.db').exec(\"VACUUM INTO '/daten/sicherungen/.vor-update-$STEMPEL.db'\")"
mv "$MP/sicherungen/.vor-update-$STEMPEL.db" "$KOPIE"
chmod 600 "$KOPIE"
ls -lh "$KOPIE"

# 2. Frisch entpacken
echo "2/4 Entpacken …"
cd "$ZIEL"
rm -rf "$ZIEL/server" "$ZIEL/oberflaeche" "$ZIEL/resources"
tar xzf "$PAKET" -C "$ZIEL"
chmod -R go-w "$ZIEL"
du -sh server oberflaeche resources

# 3. Bauen und starten
echo "3/4 Bauen und starten …"
docker compose up -d --build
ZUSTAND=unbekannt
i=0
while [ $i -lt 18 ]; do
  ZUSTAND=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo fehlt)
  [ "$ZUSTAND" = healthy ] && break
  sleep 5; i=$((i + 1))
done
echo "Zustand: $ZUSTAND"
docker stats --no-stream "$CONTAINER"
dmesg 2>/dev/null | grep -i -E "oom|killed process" | tail -3 || true

# 4. Aufräumen
echo "4/4 Aufräumen …"
docker builder prune -f --keep-storage 4GB >/dev/null
docker image prune -f >/dev/null
rm -f "$PAKET"
find /root -maxdepth 1 -name 'sicherung-vor-*.db' ! -name "$(basename "$KOPIE")" -delete
echo "Behalten: $KOPIE (Rückfall bis zum nächsten Aufspielen)"
df -h / | tail -1
docker system df

if [ "$ZUSTAND" != healthy ]; then
  echo "WARNUNG: Container nicht gesund. Protokoll: docker logs --tail 100 $CONTAINER – Rückfall: Datenbank aus $KOPIE, Paket aus dist/ der letzten Fassung."
  exit 1
fi
echo "Fertig."
