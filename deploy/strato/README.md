# Eigener Server bei Strato (seit 09.10.2026)

87.106.217.186, Ubuntu 26.04, nur Schul-Apps (Gywem Aviation bleibt auf 217.154.120.64).

- `/opt/schul-apps`: Inhalt von `dist/schul-apps-server.tgz` + `docker-compose.override.yml` (diese Datei; bleibt bei Updates).
- `/opt/schul-apps/geheim/hauptschluessel`: Hauptschlüssel (400, Besitzer 1000) – nie ins Projekt.
- `/opt/schul-weiche`: nginx auf 80/443 (`weiche-nginx.conf`, `weiche-docker-compose.yml`), 8443 nur lokal.
- Zertifikat: certbot (apt) mit Lineage `schul-apps-domain`, Webroot `/var/www/acme`, Hook `/usr/local/bin/schul-apps-zertifikat.sh`
  (deploy/vps/schul-apps-zertifikat.sh). Erneuerung erst möglich, wenn die Domain auf diesen Server zeigt.
- Sicherung: `/usr/local/bin/schul-apps-sicherung.sh` nachts 2:30 (cron), 14 Tage in `/root/sicherungen`.
- Firewall ufw: 22, 80, 443.

Aufspielen: `scp dist/schul-apps-server.tgz schul-neu:/tmp/` → `cd /opt/schul-apps && tar xzf /tmp/schul-apps-server.tgz && chmod -R go-w . && docker compose up -d --build`.

Übergang: Der alte Server (217.154.120.64) reicht meineschulapps.de und :8443 an diesen Server weiter
(`/opt/schul-weiche/nginx.conf`, Sicherung der alten Fassung: `nginx.conf.vor-umzug`); sein Schul-Apps-Container ist
gestoppt, das Volume `schul-apps-daten` bleibt als Rückfall.
