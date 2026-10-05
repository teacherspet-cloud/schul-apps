#!/bin/sh
# Deploy-Hook von certbot für die Zertifikate des Schul-Apps-Servers (02.10.2026, Domain seit 05.10.2026).
#
# Ausstellung (einmalig, als root auf dem VPS):
#   IP-Adresse:
#   certbot certonly --webroot -w /var/lib/docker/volumes/gywem-aviation-data/_data/acme \
#     --ip-address 217.154.120.64 --preferred-profile shortlived --cert-name schul-apps-ip \
#     --deploy-hook /usr/local/bin/schul-apps-zertifikat.sh
#   Domain:
#   certbot certonly --webroot -w /var/lib/docker/volumes/gywem-aviation-data/_data/acme \
#     -d www.meineschulapps.de -d meineschulapps.de --cert-name schul-apps-domain \
#     --deploy-hook /usr/local/bin/schul-apps-zertifikat.sh
#
# Port 80 beantwortet die Weiche (deploy/weiche) bzw. der Umleiter von Gywem Aviation die ACME-Challenges
# aus demselben acme-Ordner. Erneuert wird automatisch (snap.certbot.renew.timer); dieser Hook kopiert das
# neue Zertifikat ATOMAR ins Volume von Schul-Apps, der Server übernimmt es ohne Neustart (watchFile, 60 s).
set -eu
case "${RENEWED_LINEAGE:-}" in
  */schul-apps-ip) NAME=le ;;
  */schul-apps-domain) NAME=domain ;;
  *) exit 0 ;;
esac
ZIEL=/var/lib/docker/volumes/schul-apps-daten/_data/tls
mkdir -p "$ZIEL"
cp "$RENEWED_LINEAGE/fullchain.pem" "$ZIEL/$NAME.crt.neu"
cp "$RENEWED_LINEAGE/privkey.pem" "$ZIEL/$NAME.key.neu"
chown 1000:1000 "$ZIEL" "$ZIEL/$NAME.crt.neu" "$ZIEL/$NAME.key.neu"
chmod 600 "$ZIEL/$NAME.key.neu"
mv "$ZIEL/$NAME.key.neu" "$ZIEL/$NAME.key"
mv "$ZIEL/$NAME.crt.neu" "$ZIEL/$NAME.crt"
