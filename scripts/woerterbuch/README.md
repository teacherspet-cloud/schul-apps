# Schulwörterbuch (woerterbuch.sqlite)

`bauen.py` erzeugt eine kompakte SQLite-Datei mit ein- und zweisprachigen Wörterbüchern für den Server
(Node 24, `node:sqlite`, nur lesend). Nur Python-Standardbibliothek, keine weiteren Pakete.

## Neu bauen

```
python -I scripts/woerterbuch/bauen.py --arbeitsordner D:\woerterbuch-bau
```

- Rohdaten landen in `D:\woerterbuch-bau\roh\` (rund 1,7 GB, **nicht** in Dropbox). Vorhandene vollständige
  Dateien werden übersprungen, abgebrochene Downloads werden fortgesetzt (HTTP-Range).
- Zwischenstände je Wiktionary-Ausgabe: `D:\woerterbuch-bau\werk\teil-*.pickle`. Mit `--neu-auswerten`
  werden sie neu erzeugt (nötig nach Änderungen an Filtern/Feldern in der Auswertung).
- Ergebnis: `D:\woerterbuch-bau\aus\woerterbuch.sqlite` plus `statistik.json` (Größe, Einträge und Formen je Wörterbuch).
- Dauer auf dem Arbeitsrechner: ca. 2 Minuten Auswertung (4 Prozesse parallel) + ca. 10 Minuten Zusammenführen/Schreiben.
- `--nur-laden` lädt nur herunter; `--ohne-formen-zweisprachig` lässt die Formen der zweisprachigen
  Wörterbücher weg (Datei wird deutlich kleiner).
- Die heruntergeladenen Dateien werden ausschließlich als JSON/Text gelesen, nie ausgeführt.

## Quellen und Lizenzen

| Quelle | Lizenz | Verwendung |
|---|---|---|
| Wiktionary, deutschsprachige Ausgabe (kaikki.org `de-extract.jsonl.gz`) | CC BY-SA 4.0 | `de`, `de-en/fr/es/la`, `la-de`, Teile von `en-de/fr-de/es-de` |
| Wiktionary, englischsprachige Ausgabe, nur englische Wörter (`kaikki.org-dictionary-English.jsonl.gz`) | CC BY-SA 4.0 | `en`, `en-de` |
| Wiktionary, französischsprachige Ausgabe (`fr-extract.jsonl.gz`) | CC BY-SA 4.0 | `fr`, `fr-de` |
| Wiktionary, spanischsprachige Ausgabe (`es-extract.jsonl.gz`) | CC BY-SA 4.0 | `es`, `es-de` |
| OpenThesaurus Textversion | CC BY-SA 4.0 (wahlweise LGPL 2.1) | deutsche Synonyme |

Aufbereitung der Wiktionary-Daten: wiktextract/kaikki.org (Tatu Ylonen). Die Quellenliste steht auch in der
Datenbank (`meta.quellen`). CC BY-SA verlangt Namensnennung und Weitergabe unter gleichen Bedingungen:
In der App muss bei Wörterbuchinhalten ein Quellenhinweis (Wiktionary/OpenThesaurus, Lizenz, Link) sichtbar sein.

## Aufbau der Datenbank

```
meta    (schluessel, wert)    -- gebaut (ISO-Datum), quellen (JSON-Liste {name, lizenz, url}), version '1'
eintrag (id, wb, lemma, norm, wortart, rang, daten)   -- Index eintrag_suche (wb, norm), eintrag_lang (wb, length(norm))
form    (wb, norm, lemma_id)  -- Primärschlüssel (wb, norm, lemma_id), WITHOUT ROWID = Index für die Formsuche
```

- `norm`: klein, Unicode-NFD ohne Akzente, ß→ss, æ→ae, œ→oe, getrimmt, innerer Leerraum zusammengefasst.
  Die Suche muss denselben Schlüssel bilden.
- Suche: erst `eintrag WHERE wb=? AND norm=? ORDER BY rang`; ohne Treffer
  `form JOIN eintrag ON id = lemma_id WHERE form.wb=? AND form.norm=?` (z. B. „ging“ → gehen, „went“ → go,
  „regis“ → rex, „allait“ → aller). Formen stehen auch dann drin, wenn das Wort selbst ein Stichwort ist
  (z. B. engl. „saw“ ist Substantiv und Vergangenheit von „see“).
- `rang`: kleiner = wichtiger. `rang = −(Anzahl Übersetzungen in alle Sprachen + 3 × Anzahl behaltener Bedeutungen)`
  aus der jeweiligen Quellausgabe. Eine echte Häufigkeitsangabe gibt es in den Daten nicht; die Zahl der
  Übersetzungen ist ein brauchbarer Ersatz (Grundwortschatz hat viele Übersetzungen).
  Umgekehrt erzeugte zweisprachige Einträge erhalten ein Viertel des Werts des Ausgangseintrags.
- `wortart`: Substantiv, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Pronomen, Artikel, Numerale,
  Interjektion, Wendung, Abkürzung, Eigenname oder leer (Partikel, Präfix, Suffix, Kontraktion).
  Zeichen, Symbole, Satzzeichen, Infixe werden weggelassen.

### Felder in `daten` (JSON)

- `de`: `bedeutungen [{text, beispiele?}]`, `silben` („Fremd·wort“), `genus` (der/die/das, bei
  Schwankung „der/das“), `plural`, `formen` (Substantiv: „Genitiv: des …“; Verb: „Präsens: er/sie/es geht“,
  „Präteritum“, „Partizip II“, „Hilfsverb“, „Konjunktiv II“, „Imperativ“; Adjektiv: „Komparativ“, „Superlativ“),
  `ipa`, `herkunft` (≤200 Zeichen), `fremdwort` (true), `synonyme` (≤8).
- `en`, `fr`, `es`: `bedeutungen`, `ipa`, `formen` mit Bezeichnungen in der jeweiligen Sprache
  (en „plural: mice“, „past: went“, „past participle: gone“ …; fr „pluriel“, „féminin“, „participe passé“;
  es „plural“, „femenino“, „gerundio“, „participio“).
- zweisprachig (`de-en`, `en-de`, `de-fr`, `fr-de`, `de-es`, `es-de`, `la-de`, `de-la`):
  `bedeutungen [{text}]` (deutsche Bedeutungen, nur bei xx-de aus der deutschen Ausgabe),
  `uebersetzungen [{wort, hinweis?, genus?}]` (≤12, gleiche Wörter zusammengefasst), `genus`, `formen`
  (Latein: „rēx, rēgis m.“, „amāre, amō, amāvī, amātum“, „māgnus, māgna, māgnum“).
  `genus` an einer Übersetzung: bei deutschen Wörtern der/die/das, sonst m./f./n.
  `hinweis` ist die Bedeutungsangabe der Quelle (bei de-xx deutsch, bei en-de englisch, bei fr-de französisch …).

### Woher die zweisprachigen Einträge kommen

- de-xx: Übersetzungstabellen deutscher Stichwörter der deutschen Ausgabe; dazu Umkehrpaare aus xx-de.
- xx-de: Einträge fremdsprachiger Wörter in der deutschen Ausgabe (deutsche Bedeutungen und deutsche
  Übersetzungen), dazu die deutschen Übersetzungen aus der englischen/französischen/spanischen Ausgabe,
  dazu Umkehrpaare aus de-xx. Latein kommt nur aus der deutschen Ausgabe.
- Umkehrpaare legen nur dann neue Einträge an, wenn das Wort im einsprachigen Wörterbuch der Sprache als
  Stichwort existiert (bei Latein nur Ergänzung bestehender Einträge). Ausdrücke mit mehr als 4 Wörtern werden nicht umgekehrt.

## Schulfilter

**Belegt (Kennzeichnung aus Wiktionary):** Eine Bedeutung wird entfernt, wenn sie eines dieser
wiktextract-Etiketten trägt:

- anstößig: `vulgar`, `offensive`, `derogatory`, `slur`, `ethnic`, `pejorative`, `impolite`, `swear-word`, `insult`
- veraltet/selten/falsch: `obsolete`, `archaic`, `dated`, `outdated`, `rare`, `misspelling`, `nonstandard`, `no-gloss`
- freie Etiketten je Ausgabe (`raw_tags`): vulgär, derb, abwertend, pejorativ, beleidigend, Schimpfwort, obszön,
  rassistisch, diskriminierend, veraltet, veraltend, selten, archaisch; fr: vulgaire, injurieux, péjoratif,
  archaïque, désuet, vieilli, très/extrêmement rare, orthographe d’avant 1835; es: insulto, despectivo,
  peyorativo, malsonante, anticuado, desusado, obsoleto, arcaico.
- Kategorien an der Bedeutung: fr/es Kategorien mit vulgaire/injurieux/péjoratif/désuet/vieilli/archaïsme bzw.
  vulgar/despectivo/malsonante/anticuado/desusado/obsoleto; en nur „swear words“/„ethnic slurs“.
- Übersetzungen, die an einer entfernten Bedeutung hängen (sense_index bzw. bei der englischen Ausgabe die
  Zuordnungswerte `_dis1`), fallen mit weg; ebenso Übersetzungen mit solchen Etiketten und deutsche
  Mundartformen (Etiketten „…-German“).
- Einträge ohne verbleibende Bedeutung entfallen. Wörter, die nur anstößige Bedeutungen hatten oder eine
  anstößige Bedeutung haben, erscheinen nicht als Synonym.
- „historical“ (historische Sache, z. B. Ritter) wird **nicht** entfernt; „slang“, „colloquial“, „casual“
  (umgangssprachlich) ebenfalls nicht – das steht so nicht in der vereinbarten Liste.

**Faustregeln (eigene Heuristik):**

- Höchstens 6 Bedeutungen (Reihenfolge der Quelle), höchstens 2 Beispiele je Bedeutung, Beispiele ≤200 Zeichen;
  selbst formulierte Beispiele vor Belegzitaten; in der englischen Ausgabe nur Gebrauchsbeispiele, keine Zitate.
- Reine Formeinträge (form-of, „Konjugierte/Deklinierte Form“, „Forme de verbe“ …) und Schreibvarianten (alt-of,
  z. B. alte Rechtschreibung „daß“) sind keine Stichwörter, sondern landen in der Tabelle `form`.
  Dazu kommen die Einwortformen aus den Formtabellen der Grundformeinträge (ohne Hilfsverben, ohne
  veraltete/seltene Formen, ohne Mehrwortformen wie „ich gehe“).
- Eigennamen: in `de` nur Toponyme und „Eigenname“ (keine Vor-/Nachnamen, Straßennamen); in en/fr/es nur
  Eigennamen mit mindestens 3 Übersetzungen (Länder, große Städte, bekannte Namen); Vor- und Familiennamen nie.
- Mehrwortausdrücke mit mehr als 5 Wörtern entfallen.
- `fremdwort`: true, wenn in der Herkunftsangabe eine fremde Sprache (lateinisch, griechisch, französisch,
  englisch, italienisch, spanisch, arabisch …) **vor** jedem Hinweis auf deutsche/germanische Herkunft oder
  Wortbildung (althochdeutsch, mittelhochdeutsch, germanisch, Kompositum, Ableitung, Konversion …) genannt wird.
  Lehnwörter, die über das Mittelhochdeutsche kamen („Fenster“), gelten damit nicht als Fremdwort; Komposita
  wie „Fremdwort“ selbst auch nicht.
- OpenThesaurus: Begriffe mit (vulg.), (derb), (abwertend), (beleidigend), (Schimpfwort), (veraltet),
  (veraltend), (selten) werden ausgelassen; Klammerzusätze wie (ugs.) werden entfernt; höchstens 3 Wörter.
  Wiktionary-Synonyme kommen zuerst, dann OpenThesaurus, zusammen höchstens 8.

## Bekannte Grenzen

- Der Filter wirkt nur so gut wie die Kennzeichnung in Wiktionary. Beispiele aus dem Bau vom 27.11.2026:
  en „cock“ (Verb) behält „To copulate with …“ (nur als „slang“ markiert), de „geil“ behält
  „auf sexuelle Weise erregt …“ (nur „umgangssprachlich“). Die Penis-Bedeutung von „cock“ ist entfernt.
- `hinweis` in zweisprachigen Einträgen ist mitunter einer falschen Bedeutung zugeordnet, wenn die Quelle
  die Übersetzungstabelle falsch nummeriert (z. B. König → rēx).
- Französische Wiktionary-Einträge enthalten viele Fachwörter und lange Belegzitate.
