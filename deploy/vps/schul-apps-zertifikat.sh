#!/bin/sh
# Deploy-Hook von certbot für das IP-Zertifikat des Schul-Apps-Servers (02.10.2026).
#
# Ausstellung (einmalig, als root auf dem VPS):
#   certbot certonly --webroot -w /var/lib/docker/volumes/gywem-aviation-data/_data/acme \
#     --ip-address 217.154.120.64 --preferred-profile shortlived --cert-name schul-apps-ip \
#     --deploy-hook /usr/local/bin/schul-apps-zertifikat.sh
#
# Port 80 gehört dem Umleiter von Gywem Aviation; er beantwortet ACME-Challenges für jeden Host
# aus seinem acme-Ordner. Certbot legt die Challenge nur dort ab – an Gywem selbst ändert sich nichts.
# Erneuert wird automatisch (snap.certbot.renew.timer); dieser Hook kopiert das neue Zertifikat
# ATOMAR ins Volume von Schul-Apps, der Server übernimmt es ohne Neustart (watchFile, 60 s).
set -eu
case "${RENEWED_LINEAGE:-}" in
  */schul-apps-ip) ;;
  *) exit 0 ;;
esac
ZIEL=/var/lib/docker/volumes/schul-apps-daten/_data/tls
mkdir -p "$ZIEL"
cp "$RENEWED_LINEAGE/fullchain.pem" "$ZIEL/le.crt.neu"
cp "$RENEWED_LINEAGE/privkey.pem" "$ZIEL/le.key.neu"
chown 1000:1000 "$ZIEL" "$ZIEL/le.crt.neu" "$ZIEL/le.key.neu"
chmod 600 "$ZIEL/le.key.neu"
mv "$ZIEL/le.key.neu" "$ZIEL/le.key"
mv "$ZIEL/le.crt.neu" "$ZIEL/le.crt"
