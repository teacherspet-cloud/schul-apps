/**
 * Bereits akzeptierte Alternativen im Vokabeltest (10.10.2026, Entscheidung der Lehrkraft) – Speicher und Routen.
 *
 * Je Lehrkraft und Sprache eine Liste „Lösungswort → akzeptierte Antworten" (Text, Anzahl, Datum) – ohne Bezug zu den
 * Lernenden, die sie geschrieben haben. Trotzdem verschlüsselt (feldschutz.ts: im Zweifel verschlüsseln). Nur für die
 * Lehrkraft selbst, nicht schulweit. Logik: renderer/modules/onlinetest/akzeptiert.ts.
 */
import type { DatabaseSync } from 'node:sqlite'
import {
  abweichendeWoerter,
  entfernen,
  merken,
  schonAkzeptiertMarkieren,
  zuruecknehmen,
  type AkzeptiertListe
} from '../renderer/src/modules/onlinetest/akzeptiert'
import type { Antworten, Bewertung, Einheit, EinheitBewertung, OnlineFassung } from '../renderer/src/modules/onlinetest/kern'
import { datenbank } from './datenbank'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS akzeptierte_alternativen (
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  sprache TEXT NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (lehrkraft_id, sprache)
);
`

const bereit = new WeakSet<DatabaseSync>()
const db = (): DatabaseSync => {
  const d = datenbank()
  if (!bereit.has(d)) {
    d.exec(SCHEMA)
    bereit.add(d)
  }
  return d
}

const sprachSchluessel = (s: string): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 12)

/** Die gemerkten Alternativen einer Lehrkraft in einer Sprache */
export function akzeptierteListe(lehrkraftId: string, sprache: string): AkzeptiertListe {
  const z = db()
    .prepare('SELECT daten FROM akzeptierte_alternativen WHERE lehrkraft_id = ? AND sprache = ?')
    .get(lehrkraftId, sprachSchluessel(sprache)) as { daten: string } | undefined
  if (!z) return {}
  try {
    const l = JSON.parse(z.daten) as AkzeptiertListe
    return l && typeof l === 'object' ? l : {}
  } catch {
    return {}
  }
}

function speichern(lehrkraftId: string, sprache: string, liste: AkzeptiertListe): void {
  if (!Object.keys(liste).length) {
    db().prepare('DELETE FROM akzeptierte_alternativen WHERE lehrkraft_id = ? AND sprache = ?').run(lehrkraftId, sprachSchluessel(sprache))
    return
  }
  db()
    .prepare(
      'INSERT INTO akzeptierte_alternativen (lehrkraft_id, sprache, daten) VALUES (?, ?, ?) ON CONFLICT(lehrkraft_id, sprache) DO UPDATE SET daten = excluded.daten'
    )
    .run(lehrkraftId, sprachSchluessel(sprache), JSON.stringify(liste))
}

/**
 * Nach dem Urteil der Lehrkraft: akzeptiert sie eine laut Lösung falsche Wort-Antwort, wird sie gemerkt; nimmt sie die
 * Akzeptanz wieder zurück, zählt sie wieder herunter. Liefert die neue Bewertung der Einheit (mit Vermerk, ob gemerkt).
 */
export function beimUrteil(
  lehrkraftId: string,
  sprache: string,
  fassung: Pick<OnlineFassung, 'loesungen'>,
  einheit: Pick<Einheit, 'felder'>,
  antworten: Antworten,
  vorher: EinheitBewertung | undefined,
  neu: EinheitBewertung
): EinheitBewertung {
  if (!sprache) return neu
  const { alsAlternativeGemerkt: _weg, ...ohne } = neu
  void _weg
  const richtig = neu.status === 'richtig' && neu.punkte > 0
  const war = Boolean(vorher?.alsAlternativeGemerkt)
  if (richtig === war) return war ? { ...ohne, alsAlternativeGemerkt: true } : ohne
  const abw = abweichendeWoerter(fassung, einheit, antworten)
  if (!abw?.length) return ohne
  let liste = akzeptierteListe(lehrkraftId, sprache)
  for (const x of abw) liste = richtig ? merken(liste, x.wort, x.antwort) : zuruecknehmen(liste, x.wort, x.antwort)
  speichern(lehrkraftId, sprache, liste)
  return richtig ? { ...ohne, alsAlternativeGemerkt: true } : ohne
}

/** Nach der Abgabe: schon einmal akzeptierte Antworten nach „Zu entscheiden" */
export function schonAkzeptierteMarkieren(
  lehrkraftId: string,
  sprache: string,
  fassung: Pick<OnlineFassung, 'einheiten' | 'loesungen'>,
  antworten: Antworten,
  bewertung: Bewertung
): Bewertung {
  if (!sprache) return bewertung
  return schonAkzeptiertMarkieren(fassung, antworten, bewertung, akzeptierteListe(lehrkraftId, sprache))
}

/** Von der Lehrkraft entfernt (×) */
export function alternativeEntfernen(lehrkraftId: string, sprache: string, wort: string, text: string): AkzeptiertListe {
  const liste = entfernen(akzeptierteListe(lehrkraftId, sprache), wort, text)
  speichern(lehrkraftId, sprache, liste)
  return liste
}

/** Für die Anzeige: Wörter alphabetisch */
export function listeSortiert(liste: AkzeptiertListe): AkzeptiertListe {
  return Object.fromEntries(Object.entries(liste).sort(([a], [b]) => a.localeCompare(b)))
}
