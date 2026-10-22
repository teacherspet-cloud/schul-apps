# Wiederherstellen aus der Sicherung (23.10.2026)

Gilt für die nächtlichen Archive `schulapps-JJJJ-MM-TT-HHMM.sicherung.tar` (`schul-apps-sicherung.sh`). Sie liegen
14 Tage auf dem Server in `/root/sicherungen` und 30 Stück auf dem Betreiber-PC in `D:\Dropbox\Schul-Apps-Sicherungen`
(`scripts/sicherung-holen.ps1`).

## Wo welcher Schlüssel liegt

| Schlüssel | Ort | Wozu |
|---|---|---|
| Privater Sicherungsschlüssel (`sicherung-privat.pem`, Passphrase; bzw. `sicherung-age.txt`) | **nur** Betreiber-PC, `%USERPROFILE%\.schul-apps-sicherung\` – NICHT in Dropbox; zweite Kopie offline (USB-Stick im Schrank / Ausdruck), Passphrase im Passwortmanager | öffnet die Archive |
| Öffentlicher Sicherungsschlüssel | Server: `/root/sicherung-pc.pem` (bzw. `/root/sicherung-empfaenger.age`) | verschlüsselt nachts – kann nichts öffnen |
| Hauptschlüssel des Servers (32 Byte, Base64) | Server: `/opt/schul-apps/geheim/hauptschluessel` (400, Besitzer 1000); **zusätzlich in jedem Archiv**, mit dem öffentlichen Sicherungsschlüssel verschlüsselt (`hauptschluessel.rsa` bzw. `.age`) | entschlüsselt Datenbankfelder und Dateiablagen |

Ohne den privaten Sicherungsschlüssel ist kein Archiv zu öffnen. Ohne den Hauptschlüssel sind Datenbank und Ablagen
zwar vollständig, aber unlesbar – darum steckt er (verschlüsselt) in jedem Archiv.

## 1. Archiv am PC öffnen

Git Bash (bringt `openssl`, `tar`, `sha256sum` mit), in einem leeren Arbeitsordner **außerhalb** von Dropbox:

```sh
mkdir -p ~/wiederherstellung && cd ~/wiederherstellung
tar -xf "/d/Dropbox/Schul-Apps-Sicherungen/schulapps-2026-10-24-0230.sicherung.tar"
cat verfahren.txt      # openssl oder age
```

**openssl** (Vorgabe):

```sh
P=~/.schul-apps-sicherung/sicherung-privat.pem
OAEP="-pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256"
openssl pkeyutl -decrypt -inkey "$P" $OAEP -in schluessel.rsa -out schluessel.txt        # fragt nach der Passphrase
head -n 1 schluessel.txt > passwort
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:passwort -in daten.tar.gz.enc -out daten.tar.gz
[ "$(sha256sum daten.tar.gz | cut -d' ' -f1)" = "$(sed -n 2p schluessel.txt)" ] && echo "Prüfsumme ok"
openssl pkeyutl -decrypt -inkey "$P" $OAEP -in hauptschluessel.rsa -out hauptschluessel
rm passwort schluessel.txt
```

**age**:

```sh
age -d -i ~/.schul-apps-sicherung/sicherung-age.txt -o daten.tar.gz daten.tar.gz.age
age -d -i ~/.schul-apps-sicherung/sicherung-age.txt -o hauptschluessel hauptschluessel.age
```

Inhalt von `daten.tar.gz`: `schulapps.db` (VACUUM-Kopie), `inhalt.json` (Zeilen je Tabelle zum Vergleich), `nutzer/`,
`fach/`, `system/`, `lehrwerke/`, `sprechbilder/`. Nicht enthalten: Anmeldedaten der KI-Programme (`nutzer/*/ki`,
`system/ki` – die Lehrkräfte melden sich danach neu an), Medienbank, TLS-Zertifikat (certbot stellt neu aus).

## 2. Auf den Server bringen

Server neu aufgesetzt? Erst nach `deploy/strato/README.md` einrichten (Paket, `docker-compose.override.yml`, Weiche),
**noch nicht starten**. Dann:

```sh
scp daten.tar.gz hauptschluessel schul-neu:/root/
ssh schul-neu
cd /opt/schul-apps && docker compose stop schul-apps
# Hauptschlüssel – nur wenn er fehlt oder der Server neu ist (sonst den vorhandenen behalten und vergleichen: cmp)
install -m 400 -o 1000 -g 1000 /root/hauptschluessel /opt/schul-apps/geheim/hauptschluessel
MP=$(docker volume inspect -f '{{ .Mountpoint }}' schul-apps-daten)
# Bisherigen Stand zur Seite legen (nicht löschen, bis alles läuft)
mkdir -p /root/vor-wiederherstellung && cp -a "$MP/." /root/vor-wiederherstellung/
rm -f "$MP/schulapps.db" "$MP/schulapps.db-wal" "$MP/schulapps.db-shm"
tar -xzf /root/daten.tar.gz -C "$MP"
chown -R 1000:1000 "$MP"
rm "$MP/inhalt.json"
docker compose up -d
shred -u /root/daten.tar.gz /root/hauptschluessel
```

Danach anmelden, „Verwaltung › Server" ansehen (Ampel, Protokoll), Stichprobe in „Meine Klassen". Läuft alles, die
Kopie `/root/vor-wiederherstellung` löschen. Am PC den Arbeitsordner löschen (`rm -rf ~/wiederherstellung`).

Nur die Datenbank einzeln zurückholen (Dateien unverändert): wie oben, aber nur `schulapps.db` entpacken
(`tar -xzf daten.tar.gz schulapps.db`).

## 3. Probe ohne Server

Der Server prüft jeden Monat selbst (Wiederherstellungstest, „Verwaltung › Server" grün/rot). Einmal im Halbjahr
zusätzlich am PC Schritt 1 durchspielen – nur so ist sicher, dass privater Schlüssel und Passphrase noch passen.
