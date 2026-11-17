#!/bin/sh
# Arbeitet auftraege.txt (Zeilen „name|referenz") der Reihe nach ab; Vorhandenes wird übersprungen.
# Kontingent erschöpft → 30 Minuten warten und denselben Auftrag erneut versuchen. Anderer Fehler → einmal wiederholen,
# dann überspringen (ein späterer Lauf holt ihn nach). Protokoll: $BOSSBILD_DIR/log.txt (OK/FEHLT/LIMIT/FERTIG).
# Start im Container:  docker exec -d -e BOSSBILD_DIR=… -e BOSSBILD_CODEX_HOME=… -e BOSSBILD_HOME=… schul-apps sh …/lauf.sh
B="${BOSSBILD_DIR:?}"
cd "$B" || exit 1
if [ -f lauf.pid ] && kill -0 "$(cat lauf.pid)" 2>/dev/null; then echo "läuft schon"; exit 0; fi
echo $$ > lauf.pid
echo "START $(date +%d.%m.%H:%M)" >> log.txt
while IFS='|' read -r N R; do
  [ -z "$N" ] && continue
  [ -f "out/$N.png" ] && continue
  if [ -n "$R" ] && [ ! -f "out/$R.png" ]; then echo "OHNE-VORLAGE $N" >> log.txt; continue; fi
  versuch=0
  while :; do
    sh "$B/run.sh" "$N" "$R" > letzt.txt 2>&1
    if [ -f "out/$N.png" ]; then echo "OK $N $(date +%H:%M)" >> log.txt; break; fi
    if grep -qiE "usage limit|rate limit|try again at|too many requests|quota" letzt.txt; then
      echo "LIMIT $(date +%d.%m.%H:%M) $N" >> log.txt
      sleep 1800
      continue
    fi
    versuch=$((versuch + 1))
    echo "FEHLT $N ($versuch) $(tail -c 240 letzt.txt | tr '\n' ' ')" >> log.txt
    [ "$versuch" -ge 2 ] && break
    sleep 30
  done
done < auftraege.txt
echo "FERTIG $(date +%d.%m.%H:%M)" >> log.txt
rm -f lauf.pid
