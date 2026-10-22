# Eigener Server bei Strato (seit 09.10.2026)

87.106.217.186, Ubuntu 26.04, nur Schul-Apps (Gywem Aviation bleibt auf 217.154.120.64).

- `/opt/schul-apps`: Inhalt von `dist/schul-apps-server.tgz` + `docker-compose.override.yml` (diese Datei; bleibt bei Updates).
- `/opt/schul-apps/geheim/hauptschluessel`: Hauptschlüssel (400, Besitzer 1000) – nie ins Projekt.
- `/opt/schul-weiche`: nginx auf 80/443 (`weiche-nginx.conf`, `weiche-docker-compose.yml`), 8443 nur lokal.
- Zertifikat: certbot (apt) mit Lineage `schul-apps-domain`, Webroot `/var/www/acme`, Hook `/usr/local/bin/schul-apps-zertifikat.sh`
  (deploy/vps/schul-apps-zertifikat.sh). Erneuerung erst möglich, wenn die Domain auf diesen Server zeigt.
- Sicherung: `/usr/local/bin/schul-apps-sicherung.sh` nachts 2:30 (cron), 14 Tage in `/root/sicherungen`. Seit 23.10.2026
  Datenbank + Dateiablagen als ein Archiv, verschlüsselt mit dem öffentlichen Schlüssel des Betreiber-PCs
  (`/root/sicherung-pc.pem` bzw. `/root/sicherung-empfaenger.age`), vom PC täglich abgeholt (`scripts/sicherung-holen.ps1`),
  monatlicher Wiederherstellungstest; Wiederherstellen: `WIEDERHERSTELLEN.md`.
- Firewall ufw: 22, 80, 443.

Aufspielen: `scp dist/schul-apps-server.tgz schul-neu:/tmp/` → `cd /opt/schul-apps && tar xzf /tmp/schul-apps-server.tgz && chmod -R go-w . && docker compose up -d --build`.

Übergang: Der alte Server (217.154.120.64) reicht meineschulapps.de und :8443 an diesen Server weiter
(`/opt/schul-weiche/nginx.conf`, Sicherung der alten Fassung: `nginx.conf.vor-umzug`); sein Schul-Apps-Container ist
gestoppt, das Volume `schul-apps-daten` bleibt als Rückfall.

## Härtung (23.10.2026, Prüfung des Schulträgers)

- **HSTS**: Die Weiche setzt auf 443 `Strict-Transport-Security: max-age=31536000; includeSubDomains` (ohne preload);
  die gleiche Zeile vom Container wird dort ausgeblendet (`proxy_hide_header`), damit sie nur einmal ankommt.
  Nach dem Aufspielen der neuen `weiche-nginx.conf` (Inhalt nach `/opt/schul-weiche/nginx.conf` kopieren, z. B.
  `cat weiche-nginx.conf > /opt/schul-weiche/nginx.conf` – die Datei ist einzeln eingebunden, deshalb in dieselbe Datei
  schreiben): `docker exec schul-weiche nginx -t && docker exec schul-weiche nginx -s reload`. Prüfen:
  `curl -sI https://www.meineschulapps.de/anmelden | grep -i strict` (genau eine Zeile). Achtung: includeSubDomains gilt ein Jahr für alle Namen
  unter meineschulapps.de – jede künftige Subdomain braucht HTTPS.
- **Notzugang** (Anmeldung des Admins mit Passwort) ist standardmäßig AUS. Einschalten: Verwaltung › IServ-Anbindung
  (steht im Protokoll). Fällt IServ aus und kommt niemand mehr in die Verwaltung, in `/opt/schul-apps/notzugang.env`
  (wird von docker-compose.yml gelesen) setzen:

  ```
  SCHULAPPS_NOTZUGANG_ERZWINGEN=1
  # nur falls das Passwort unbekannt ist, zusätzlich: SCHULAPPS_NOTZUGANG_PASSWORT=…
  ```

  dann `cd /opt/schul-apps && docker compose up -d`. Nach der Wiederherstellung beide Zeilen wieder entfernen und
  erneut `docker compose up -d` – sonst bleibt der Notzugang an. Der Start mit erzwungenem Notzugang steht im Protokoll.
