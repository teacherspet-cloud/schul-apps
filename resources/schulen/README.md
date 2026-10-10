# Schulverzeichnis für die Offline-Suche (`schulen.json`)

Stand: 26.09.2026 · 29 516 Schulen (allgemein- und berufsbildend) · alle 16 Länder
Dateigröße: 3,04 MB (UTF-8), **gzip -9: 0,69 MB**

Erzeugt von `recherche/schulen/aktualisieren.mjs`; die Rohdaten liegen in `recherche/schulen/roh/` (per .gitignore ausgeschlossen).

## Format

```json
{ "stand": "2026-09-26",
  "felder": ["name","ort","plz","land","schulformen","id","strasse","telefon","email"],
  "schulformen": { "gs": "Grundschule", "hs": "Hauptschule/Mittelschule", "rs": "Realschule",
                   "igs": "Gesamt-/Gemeinschaftsschule", "gym": "Gymnasium", "fs": "Förderschule",
                   "bbs": "berufsbildende Schule", "sonst": "sonstige" },
  "quellen": [ { "name", "url", "lizenz", "abgerufen", "datenstand", "laender" } ],
  "schulen": [ ["Gymnasium Wesermünde","Bremerhaven","27570","NI",["gym"],"NI-67052"], … ] }
```

- `land`: ISO-3166-2-Kürzel ohne `DE-` (BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH).
- `schulformen`: Liste der Kürzel. Schulen mit mehreren Zweigen haben mehrere Einträge (z. B. Oberschule NI = `hs, rs`). Wenn die Quelle keine Schulart angibt, wird sie aus dem Namen abgeleitet; bleibt sie offen, steht dort `sonst`.
- `plz` kann leer sein (nur SN/ST aus OpenStreetMap, dazu 4 Einzelfälle).
- `strasse`, `telefon` (seit 29.09.2026) und `email` (seit 10.10.2026) können leer sein. `email` stammt nur aus Quellen, deren Lizenz die Weitergabe erlaubt: JedeSchule-Länder (BY dort ohne E-Mail), HE (Verz-6/7), RP und OSM (`email`/`contact:email`). Das LSN-Verzeichnis (NI) führt keine E-Mail, die nibis-Datenbank nennt keine Lizenz. Für NI steht deshalb nur die einzeln geprüfte Ergänzung des Gymnasiums Wesermünde (`ERGAENZUNGEN` in `aktualisieren.mjs`, laut Website der Schule). Neu aufbereiten ohne Abruf mit `--stand=JJJJ-MM-TT`, damit der Stand der Rohdaten bleibt.
- `id`: Kennung der Quelle (Schulnummer mit Länderpräfix, z. B. `NW-184858`; OpenStreetMap: `OSM-n…`/`OSM-w…`). Sie ist nicht zwingend über Jahre stabil.
- Sortiert nach Land und Name. Eine Schule pro Zeile, deshalb lassen sich Unterschiede zwischen zwei Ständen gut lesen.

### Hinweise für die Suche

- Die App kann alles einmal laden und beim Start je Schule einen Suchtext vorbereiten: Kleinschreibung, Umlaute als ae/oe/ue/ss, Bindestriche und Anführungszeichen als Leerzeichen, dazu Name und Ort. Ein linearer Durchlauf über ~30 000 Zeilen dauert pro Tastendruck deutlich unter 10 ms. Ein eigener Index lohnt sich nicht.
- Treffer an Wortanfängen (Wörter getrennt an Leer- und Bindestrichen) sind sinnvoller als reine Teilwortsuche. Sonst findet „Heine“ auch „Rhein-Erft“ und „Weserm“ auch „Mittelweser, mit …“. Treffer am Namensanfang zuerst zeigen, danach die übrigen Wortanfang-Treffer; Ort und Land in der Trefferliste mit anzeigen.
- Namen stehen so da, wie die Länder sie führen (NRW z. B. „Städt. Heinrich-Heine-Gymnasium“, RP „Gymnasium Kaiserslautern Heinrich-Heine“). Die Suche sollte deshalb nicht nur den Namensanfang prüfen.
- Für die Auslieferung kann die Datei gzip-komprimiert beigelegt werden (0,69 MB) und in Node mit `zlib.gunzipSync` geladen werden.

## Quellen, Lizenzen, Deckung je Land

| Land | Anzahl | Quelle | Lizenz / Nutzungsbedingung | Datenstand | Lücken / Hinweise |
|---|---:|---|---|---|---|
| BW | 5 038 | JedeSchule ← INSPIRE-WFS Kultusministerium BW (gis.kultus-bw.de) | Metadaten: „Nutzungsbedingungen: Keine Einschränkungen“ | 19.09.2026 | Die Quelle nennt kaum Schularten, deshalb meist aus dem Namen abgeleitet; 329 bleiben `sonst` (z. B. „Fritz-Erler-Schule“). Außenstellen stehen als eigene Einträge. |
| BY | 4 376 | JedeSchule ← WFS Schulstandorte Bayern (gdiserv.bayern.de) | CC BY 4.0, Namensnennung „Bayerisches Staatsministerium für Unterricht und Kultus“ | 19.09.2026 | **Private Schulen fehlen** (auch Waldorf- und kirchliche Schulen). Der WFS führt nur die öffentlichen. Ein freies Verzeichnis gibt es nicht; das LfStat verkauft es. |
| BE | 918 | JedeSchule ← WFS Schulen (gdi.berlin.de) | Datenlizenz Deutschland – Zero – 2.0 | 19.09.2026 | Ort meist nur „Berlin“; nummerierte Schulen („10. Schule“) mehrfach in verschiedenen Bezirken. |
| BB | 963 | JedeSchule ← WFS schullandschaft.brandenburg.de | Datenlizenz Deutschland – Namensnennung – 2.0, „© Ministerium für Bildung, Jugend und Sport“ | 19.09.2026 | – |
| HB | 246 | JedeSchule ← INSPIRE Schulstandorte Land Bremen | CC BY, „Freie Hansestadt Bremen, Die Senatorin für Kinder und Bildung“ | 19.09.2026 | – |
| HH | 503 | JedeSchule ← api.hamburg.de (staatliche + nichtstaatliche Schulen) | Datenlizenz Deutschland – Namensnennung – 2.0, „Freie und Hansestadt Hamburg, Behörde für Schule und Berufsbildung“ | 19.09.2026 | – |
| HE | 2 152 | Hessisches Statistisches Landesamt, Verz-6 + Verz-7 (Excel) | „© Hessisches Statistisches Landesamt, Wiesbaden, 2026. Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.“ | 08/2026 | Enthält öffentliche und private Schulen. JedeSchule-Daten für Hessen wurden **nicht** genutzt, weil das Land JedeSchule laut jedeschule.de/daten keine Erlaubnis erteilt hat. |
| MV | 561 | JedeSchule ← WFS Schulstandorte (geodaten-mv.de) | „Auszugsweise Vervielfältigung und Verbreitung mit Quellenangabe gestattet“ | 19.09.2026 | **Berufliche Schulen fehlen** (der WFS führt nur allgemeinbildende). |
| NI | 2 936 | Landesamt für Statistik Niedersachsen: Verzeichnis der allgemeinbildenden Schulen und Verzeichnis der berufsbildenden Schulen (Excel) | „© LSN … Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.“ | allgemeinbildend 28.08.2025, BBS 15.11.2025 | Die Schulen des Gesundheitswesens stehen in einem eigenen LSN-Verzeichnis und sind nicht aufgenommen. Die nibis-Schuldatenbank (Quelle von JedeSchule) nennt keine Lizenz und wurde deshalb nicht genutzt. |
| NW | 5 406 | JedeSchule ← schuldaten.csv, Ministerium für Schule und Bildung NRW | Datenlizenz Deutschland – Namensnennung – 2.0 | 19.09.2026 | Namen sind lang und amtlich („Städt. Gem. Grundschule …“); die Zusätze „- Sekundarstufe I -“ sind entfernt. |
| RP | 1 626 | Statistisches Landesamt Rheinland-Pfalz, Schulverzeichnis 2025/26 (Excel) | „© Statistisches Landesamt Rheinland-Pfalz, Bad Ems, 2026. Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.“ | Anschriften 09/2025 | Die Quelle nutzt Kurznamen („GY Kaiserslautern Heinrich-Heine“). Das Schulart-Kürzel ist ausgeschrieben („Gymnasium Kaiserslautern Heinrich-Heine“). Schulen des Gesundheitswesens sind nicht aufgenommen. Geoportal/bildung.rlp.de: „Bedingungen unbekannt“, deshalb nicht genutzt. |
| SL | 359 | JedeSchule ← WFS Schulen Saarland (geoportal.saarland.de) | CC BY 4.0 | 19.09.2026 | Ältere, doppelt erfasste Datensätze (alte Kennungen) sind verworfen. |
| SH | 1 046 | JedeSchule ← Open-Data-Portal SH, Datensatz „Schulen“ | CC0 | 19.09.2026 | 110 `sonst` (vor allem dänische Minderheitenschulen, Waldorf, Außenstellen). |
| TH | 976 | JedeSchule ← WFS Schulen (geoproxy.geoportal-th.de) | CC BY 4.0, „© GDI-Th“ | 19.09.2026 | Musikschulen, Schullandheime und Hochschulen sind entfernt. |
| SN | 1 567 | **OpenStreetMap** (amenity=school) | ODbL 1.0, „© OpenStreetMap-Mitwirkende“ | OSM 26.09.2026 | Ersatzquelle, siehe unten. Die amtliche Zahl liegt bei ~2 000 Einrichtungen, es fehlen also etwa 20–25 %. 632 ohne PLZ. Als Ort steht die Gemeinde am Standort, wenn `addr:city` fehlt. 381 `sonst`. |
| ST | 843 | **OpenStreetMap** (amenity=school) | ODbL 1.0, „© OpenStreetMap-Mitwirkende“ | OSM 26.09.2026 | Ersatzquelle, siehe unten. 286 ohne PLZ, 170 `sonst`. Vereinzelt stehen Nicht-Schulen darin, die in OSM falsch als Schule markiert sind. |

Summe: 29 516 Einträge. Zum Vergleich: Die amtliche Statistik zählt bundesweit rund 32 000 allgemeinbildende und 8 500 berufliche Schulen. Die Lücke erklären vor allem: die privaten Schulen in Bayern, die beruflichen Schulen in MV, SN/ST aus OSM und die Schulen des Gesundheitswesens (NI/RP). Dazu zählen einige Länder Organisationseinheiten und andere Standorte.

### Warum Sachsen und Sachsen-Anhalt aus OpenStreetMap kommen

- **Sachsen:** Die Sächsische Schuldatenbank (schuldatenbank.sachsen.de) bietet Export und API öffentlich an, nennt aber **keine Lizenz**. Rechtlich heißt das: Weiterverbreitung ist nicht erlaubt. Die Daten sind sehr gut (JedeSchule: 2 070 Einträge). **Empfehlung:** beim SMK (support@schuldatenbank.sachsen.de) eine Nutzung unter „Datenlizenz Deutschland – Namensnennung 2.0“ erbitten und dann in `aktualisieren.mjs` bei `LAENDER_QUELLE.SN` den Wert `'jedeschule'` eintragen.
- **Sachsen-Anhalt:** Die aktuelle JedeSchule-Quelle ist der ArcGIS-Dienst „Schulenstandorte 2024/25“ des Statistischen Landesamts. Laut dessen Schulstandort-Atlas gilt für die allgemeinbildenden Schulen: © Statistisches Landesamt Sachsen-Anhalt, **Vervielfältigung und Verbreitung grundsätzlich untersagt**. Das Adressverzeichnis ist kostenpflichtig. Für den älteren Bestand vom Bildungsserver (bildung-lsa.de) ist keine Lizenz angegeben. **Empfehlung:** beim Statistischen Landesamt oder beim Bildungsministerium um Freigabe bitten; bis dahin OSM.

### Nicht verwendet

- JedeSchule-Datensätze für HE (keine Erlaubnis des Landes), NI (nibis, ohne Lizenz), RP (bildung.rlp.de, ohne Lizenz), SN (s. o.) und ST (s. o.).
- JedeSchule-Einträge, die im jüngsten Lauf einer Landesquelle nicht mehr vorkamen (Zeitstempel mehr als 14 Tage vor dem neuesten Lauf dieses Landes). Das sind geschlossene Schulen oder Dubletten mit alten Kennungen (SH ~980, ST ~930, SL ~350, BW ~550, übrige Länder zusammen ~200).
- Keine Schulen im Sinne der Suche: Schulämter, Ministerien, Studienseminare und ZfsL, Hochschulen, Musikschulen, Volkshochschulen, Schullandheime, Schulkindergärten und Test-Dienststellen.

## Lizenzbewertung: Darf die Datei mit der App verteilt werden?

Ja. Das gilt für alle aufgenommenen Quellen, solange die Namensnennung mitgeliefert wird. Keine Quelle verbietet Weiterverbreitung oder kommerzielle Nutzung.
- CC0 / DL-DE Zero (SH, BE) und JedeSchule selbst (CC0): keine Pflichten.
- CC BY 4.0 / DL-DE BY 2.0 / „mit Quellenangabe gestattet“ (BY, BB, HB, HH, MV, NW, SL, TH, HE, NI, RP, BW): Quelle nennen und angeben, dass die Daten verändert wurden (gefiltert, normalisiert).
- ODbL (SN, ST aus OSM): Namensnennung „© OpenStreetMap-Mitwirkende, ODbL“. Die abgeleiteten Einträge (id `OSM-…`) bleiben unter ODbL; wer die Datei weitergibt, muss diesen Teil ebenfalls unter ODbL anbieten. Das ist erfüllt, weil `schulen.json` frei und unverändert beiliegt.

### Quellenvermerk (für „Über“/„Quellen“ in der App)

> **Schulverzeichnis:** Zusammengestellt aus den amtlichen Schulverzeichnissen der Länder, teils über das Projekt JedeSchule.de (Open Knowledge Foundation Deutschland, CC0). Die Daten wurden gefiltert und vereinheitlicht. Quellen: Kultusministerium Baden-Württemberg; Bayerisches Staatsministerium für Unterricht und Kultus (CC BY 4.0); Senatsverwaltung für Bildung, Jugend und Familie Berlin (DL-DE Zero 2.0); © Ministerium für Bildung, Jugend und Sport Brandenburg (DL-DE BY 2.0); Freie Hansestadt Bremen, Die Senatorin für Kinder und Bildung (CC BY); Freie und Hansestadt Hamburg, Behörde für Schule und Berufsbildung (DL-DE BY 2.0); © Hessisches Statistisches Landesamt, Wiesbaden 2026; Land Mecklenburg-Vorpommern, GeoPortal.MV; © Landesamt für Statistik Niedersachsen 2026; Ministerium für Schule und Bildung NRW (DL-DE BY 2.0); © Statistisches Landesamt Rheinland-Pfalz, Bad Ems 2026; Saarland, Geoportal (CC BY 4.0); Land Schleswig-Holstein (CC0); © GDI-Th (CC BY 4.0); Sachsen und Sachsen-Anhalt: © OpenStreetMap-Mitwirkende (ODbL 1.0, openstreetmap.org/copyright). Lizenztexte: govdata.de/dl-de/by-2-0 · creativecommons.org/licenses/by/4.0 · opendatacommons.org/licenses/odbl/1-0

Kurzform: „Schuldaten: amtliche Schulverzeichnisse der Länder (u. a. via JedeSchule.de) und © OpenStreetMap-Mitwirkende (ODbL); Einzelnachweise unter Quellen.“

## Stichproben (Suche nach Wortanfang)

**„Heine“:** 66 Treffer mit Wortanfang „Heine…“, darunter auch Heinemann, Heinen und Heiner. Davon 35 Heinrich-Heine-Schulen:

| Name | Ort | Land | Formen |
|---|---|---|---|
| Heinrich-Heine-Gymnasium | Ostfildern | BW | gym |
| Heinrich-Heine-Schule | Bremerhaven | HB | igs |
| Heinrich-Heine-Schule | Darmstadt | HE | gs |
| Heinrich-Heine-Schule | Dreieich | HE | hs, rs, igs, gym |
| Heinrich-Heine-Schule | Hanau | HE | gs |
| Heinrich-Heine-Gymnasium | Hamburg | HH | gym |
| Grundschule „Heinrich Heine“ | Rostock | MV | gs |
| Grundschule „Heinrich Heine“ | Schwerin | MV | gs |
| Regionale Schule mit Grundschule Heinrich Heine | Karlshagen | MV | gs, hs, rs |
| Heinrich-Heine-Gymnasium Städt. Gymnasium | Dortmund | NW | gym |
| Heinrich-Heine-Schule Städt. Gem. Grundschule … | Düsseldorf | NW | gs |
| Heinrich-Heine-Schule Städt. Gesamtschule Duisburg-West | Duisburg | NW | igs |
| Heinrich-Heine-Schule Städt. Gesamtschule Laurensberg | Aachen | NW | igs |
| Heinrich-Heine-Schule Städt. Realschule | Hagen | NW | rs |
| Städt. Heinrich-Heine-Gesamtschule | Düsseldorf | NW | igs |
| Städt. Heinrich-Heine-Gymnasium | Bottrop / Köln / Mettmann / Oberhausen | NW | gym |
| Gymnasium Kaiserslautern Heinrich-Heine | Kaiserslautern | RP | gym |
| Realschule plus Neuwied Heinrich-Heine | Neuwied | RP | hs, rs |
| Heinrich-Heine-Schule | Heikendorf | SH | gym |
| Heinrich-Heine-Schule, Gemeinschaftsschule mit Oberstufe … | Büdelsdorf | SH | igs, gym |
| Heinrich-Heine-Grundschule | Chemnitz / Heidenau / Mühlau | SN | gs |
| Oberschule „Heinrich Heine“ | Lauter-Bernsbach | SN | hs, rs |
| Gemeinschaftsschule Heinrich Heine | Halle (Saale) | ST | igs |
| Grundschule „Heinrich Heine“ | Möckern | ST | gs |
| Grundschule Buckau und Sekundarschule Heinrich Heine | Magdeburg | ST | gs, hs, rs |
| Grundschule Heinrich Heine | Wittenberg | ST | gs |
| Heinrich-Heine-Gymnasium | Bitterfeld-Wolfen | ST | gym |
| Grundschule Heinrich Heine | Jena | TH | gs |
| Heinrich Heine | Heideland | TH | gs |
| Staatliche Grundschule „Heinrich Heine“ Uhlstädt | Uhlstädt-Kirchhasel | TH | gs |

**„Weserm“:** 2 Treffer
- Gymnasium Wesermünde, 27570 Bremerhaven, **NI**, gym (Schulnummer 67052)
- Berufsbildende Schulen für den Landkreis Wesermarsch, 26919 Brake, NI, bbs

Zum Gymnasium Wesermünde: Die Schule liegt in Bremerhaven (Humboldtstraße 12–14), ist aber eine **niedersächsische** Schule (Träger Landkreis Cuxhaven, RLSB Lüneburg). Sie steht im niedersächsischen Landesverzeichnis und nicht im Bremer. Ort und Land sind unverändert aus der amtlichen Quelle übernommen. Die Förderschule in Geestland heißt in der nibis-Datenbank „Seeparkschule Wesermünde“. Im LSN-Verzeichnis steht sie ohne „Wesermünde“ als „Seeparkschule Förderzentrum, FöS …“ (NI-93221) und wird deshalb erst bei der Eingabe „Seepark“ gefunden.

## Aktualisieren

```
node recherche/schulen/aktualisieren.mjs --laden   # alle Quellen neu laden (~45 MB, Overpass mit Pausen)
node recherche/schulen/aktualisieren.mjs           # nur neu aufbereiten aus recherche/schulen/roh/
```

Das Skript kommt ohne npm-Pakete aus. CSV- und XLSX-Leser liegen daneben (`csv.mjs`, `xlsx.mjs`). Es gibt Anzahl je Land und Schulform, die Dateigröße (auch gzip) und die beiden Stichproben aus. Die Kennzahlen schreibt es nach `recherche/schulen/statistik.json`.

Jährlich zu prüfen: Die Download-Adressen der Statistikämter HE (`…/files/2026-08/verz-6_26.xlsx`) und RP (`Schulverzeichnis_RLP_2025_26.xlsx`) enthalten das Jahr. Neue Links stehen unter statistik.hessen.de/publikationen/verzeichnisse und statistik.rlp.de/publikationen/verzeichnisse-und-adressarien. Die NI-Links (`/download/167132`, `/download/169155`) blieben bisher gleich. JedeSchule aktualisiert wöchentlich (`latest.csv`).
