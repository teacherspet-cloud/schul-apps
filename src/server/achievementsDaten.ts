/**
 * Achievements der Lernenden (08.10.2026) – gespeicherter Teil je Person: erreichte Achievements mit Zeitpunkt (nie
 * entzogen), noch nicht gemeldete (für den Glückwunsch), Zähler für das, was sich nur im Moment des Geschehens
 * erkennen lässt (Rekord gebrochen, fehlerfreie Blitzrunde, Diktate, Handschrift, Verbformen, fehlerfreie Tage), die
 * gesammelten Übungstage (die Kästen behalten nur 60) und Regeln, die einmal eine Schwäche waren.
 * Liegt verschlüsselt (feldschutz.ts: achievements.daten). Nur diese Datei schreibt die Tabelle.
 */
import { datenbank, type NutzerInfo } from './datenbank'
import { LEERE_ZAEHLER, type AchGruppe, type AchZaehler, type Medaille } from '../shared/achievements'

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(`CREATE TABLE IF NOT EXISTS achievements (
      nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
      daten TEXT NOT NULL
    )`)
    bereit = true
  }
  return d
}

export interface Erreicht {
  am: number
  titel: string
  text: string
  gruppe: AchGruppe
  medaille: Medaille
}

export interface AchDaten {
  erreicht: Record<string, Erreicht>
  /** Erreicht, aber noch nicht als Glückwunsch gezeigt */
  offen: string[]
  zaehler: AchZaehler
  tage: string[]
  /** Kasten heute: Antworten und Fehler (für „fehlerfreie Tagesrunde", ausgewertet, wenn der Tag vorbei ist) */
  runde?: { tag: string; n: number; falsch: number }
  warSchwaeche: string[]
}

const leer = (): AchDaten => ({ erreicht: {}, offen: [], zaehler: { ...LEERE_ZAEHLER }, tage: [], warSchwaeche: [] })

export function achDatenLesen(nutzerId: string): AchDaten {
  const z = db().prepare('SELECT daten FROM achievements WHERE nutzer_id = ?').get(nutzerId) as { daten: string } | undefined
  try {
    const d = z ? (JSON.parse(z.daten) as Partial<AchDaten>) : {}
    const l = leer()
    return {
      erreicht: d.erreicht ?? l.erreicht,
      offen: Array.isArray(d.offen) ? d.offen : [],
      zaehler: { ...l.zaehler, ...(d.zaehler ?? {}) },
      tage: Array.isArray(d.tage) ? d.tage : [],
      runde: d.runde,
      warSchwaeche: Array.isArray(d.warSchwaeche) ? d.warSchwaeche : []
    }
  } catch {
    return leer()
  }
}

export function achDatenSchreiben(nutzerId: string, d: AchDaten): void {
  db()
    .prepare('INSERT INTO achievements (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten')
    .run(nutzerId, JSON.stringify(d))
}

const zaehlt = (n: NutzerInfo): boolean => n.rolle === 'schueler' && n.quelle !== 'vorschau'
const isoTag = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Übungstage zusammenführen (sortiert, höchstens rund drei Schuljahre) */
export function tageVereinen(a: string[], b: Iterable<string>): string[] {
  return [...new Set([...a, ...b])]
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t))
    .sort()
    .slice(-1100)
}

/** Ein abgelaufener Kastentag mit mindestens 10 Antworten und keinem Fehler zählt als fehlerfreie Tagesrunde */
export function rundeAbschliessen(d: AchDaten, jetzt: number): void {
  if (d.runde && d.runde.tag < isoTag(jetzt)) {
    if (d.runde.n >= 10 && d.runde.falsch === 0) d.zaehler.fehlerfreieTage++
    d.runde = undefined
  }
}

/** Eine Antwort im Vokabelkasten (Liste oder Vokabelweg) */
export function achievementAntwort(
  n: NutzerInfo,
  a: { uebung: string; urteil: string; eingabe?: unknown },
  jetzt = Date.now()
): void {
  if (!zaehlt(n)) return
  try {
    const d = achDatenLesen(n.id)
    const heute = isoTag(jetzt)
    if (!d.tage.includes(heute)) d.tage = tageVereinen(d.tage, [heute])
    rundeAbschliessen(d, jetzt)
    // Lernkarte beim ersten Kontakt ist eine Selbsteinschätzung – kein Fehler im Sinne der Tagesrunde
    if (a.uebung !== 'karte') {
      const r = d.runde ?? { tag: heute, n: 0, falsch: 0 }
      r.n++
      if (a.urteil !== 'richtig') r.falsch++
      d.runde = r
    }
    if (a.uebung === 'diktat' && a.urteil === 'richtig') d.zaehler.diktate++
    // „Lege das Wort" von Hand geschrieben (Eingabeart kommt vom Trainer mit)
    if (a.uebung === 'buchstaben' && a.eingabe === 'schreiben') d.zaehler.handschrift++
    achDatenSchreiben(n.id, d)
  } catch {
    // Achievements dürfen das Üben nie stören
  }
}

/** Spiele, deren Wert richtige Verbformen zählt */
const VERBSPIELE = new Set(['vok:formenblitz', 'vok:bildverb', 'gram:verbblitz', 'gram:bildverb', 'gram:formenblitz'])

/** Ein Spiel ist zu Ende (aus dem Rekordbuch): `gebrochen` = früherer Rekord übertroffen; `fehler` = falsche Antworten, wenn bekannt */
export function achievementSpiel(n: NutzerInfo, schluessel: string, wert: number, gebrochen: boolean, fehler?: number, jetzt = Date.now()): void {
  if (!zaehlt(n)) return
  try {
    const d = achDatenLesen(n.id)
    const heute = isoTag(jetzt)
    if (!d.tage.includes(heute)) d.tage = tageVereinen(d.tage, [heute])
    if (gebrochen) d.zaehler.rekordeGebrochen++
    if (schluessel === 'vok:blitz' && fehler === 0 && wert >= 10) d.zaehler.blitzFehlerfrei++
    if (VERBSPIELE.has(schluessel) && wert > 0) d.zaehler.verbformen += Math.min(200, Math.round(wert))
    achDatenSchreiben(n.id, d)
  } catch {
    // wie oben
  }
}
