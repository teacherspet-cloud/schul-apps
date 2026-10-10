/**
 * Achievements der Lernenden (08.10.2026) – gespeicherter Teil je Person: erreichte Achievements mit Zeitpunkt (nie
 * entzogen), noch nicht gemeldete (für den Glückwunsch), Zähler für das, was sich nur im Moment des Geschehens
 * erkennen lässt (Rekord gebrochen, fehlerfreie Blitzrunde, Diktate, Handschrift, Verbformen, fehlerfreie Tage), die
 * gesammelten Übungstage (die Kästen behalten nur 60) und Regeln, die einmal eine Schwäche waren.
 * Liegt verschlüsselt (feldschutz.ts: achievements.daten). Nur diese Datei schreibt die Tabelle.
 */
import { datenbank, type NutzerInfo } from './datenbank'
import { LEERE_ZAEHLER, type AchGruppe, type AchZaehler, type Medaille } from '../shared/achievements'
import { SPIELART_BIT, type MehrArt, type MehrspielId } from '../shared/mehrspieler/typen'
import {
  HOER_SPIELE,
  HOER_UEBUNGEN,
  HOERSPIEL_PUNKTE,
  LEERE_SPRACH_ZAEHLER,
  type AuszNeu,
  type AuszStand,
  type SprachZaehler,
  type TitelWahl
} from '../shared/auszeichnungen'

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
  // Medaillen und Titel je Sprache (10.10.2026, shared/auszeichnungen.ts)
  /** Zähler und Übungstage je Sprache (was sich nur im Moment des Geschehens zählen lässt) */
  je: Record<string, { z: SprachZaehler; tage: string[] }>
  /** Gehaltene Medaillen und Titel je Sprache – nie entzogen */
  ausz: AuszStand
  /** Erreicht, aber noch nicht als Glückwunsch gezeigt */
  offenAusz: AuszNeu[]
  /** Form und angezeigter Titel – wählt die Person selbst */
  titelWahl: TitelWahl
  /** Alte Achievements einmalig übernommen (Sprache) */
  uebernommen?: string
}

const leer = (): AchDaten => ({
  erreicht: {},
  offen: [],
  zaehler: { ...LEERE_ZAEHLER },
  tage: [],
  warSchwaeche: [],
  je: {},
  ausz: { medaillen: {}, titel: {} },
  offenAusz: [],
  titelWahl: {}
})
const objekt = <T>(x: unknown, r: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? (x as T) : r)

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
      warSchwaeche: Array.isArray(d.warSchwaeche) ? d.warSchwaeche : [],
      je: objekt(d.je, l.je),
      // Jahresreihen (10.10.2026): fehlen sie, stellt die Auswertung bzw. die Wartung einmalig um (jahreUmstellen)
      ausz: {
        medaillen: objekt(d.ausz?.medaillen, {}),
        titel: objekt(d.ausz?.titel, {}),
        ...(d.ausz?.jahre && typeof d.ausz.jahre === 'object' && !Array.isArray(d.ausz.jahre) ? { jahre: d.ausz.jahre } : {})
      },
      offenAusz: Array.isArray(d.offenAusz) ? d.offenAusz : [],
      titelWahl: objekt(d.titelWahl, {}),
      ...(typeof d.uebernommen === 'string' ? { uebernommen: d.uebernommen } : {})
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

/**
 * Für den Schulvergleich (09.10.2026, achievementsVergleich.ts): je Person die Kennungen des Erreichten und die
 * gesammelten Übungstage. Verlässt den Server nie als Einzelwert – nur als Anteil bzw. eigener Platz.
 */
export function alleAchievementDaten(): Map<string, { erreicht: string[]; tage: string[] }> {
  const aus = new Map<string, { erreicht: string[]; tage: string[] }>()
  for (const z of db().prepare('SELECT nutzer_id, daten FROM achievements').all() as { nutzer_id: string; daten: string }[]) {
    try {
      const d = JSON.parse(z.daten) as Partial<AchDaten>
      aus.set(z.nutzer_id, { erreicht: Object.keys(d.erreicht ?? {}), tage: Array.isArray(d.tage) ? d.tage : [] })
    } catch {
      // beschädigter Eintrag: zählt wie keiner
    }
  }
  return aus
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

/** Zähler und Tage einer Sprache (angelegt, wenn nötig); heute als Übungstag eintragen */
export function jeSprache(d: AchDaten, sprache: string, jetzt: number): SprachZaehler {
  const s = sprache.trim().toLowerCase().slice(0, 8)
  const e = (d.je[s] ??= { z: LEERE_SPRACH_ZAEHLER(), tage: [] })
  e.z = { ...LEERE_SPRACH_ZAEHLER(), ...e.z }
  const heute = isoTag(jetzt)
  if (!Array.isArray(e.tage)) e.tage = []
  if (!e.tage.includes(heute)) e.tage = tageVereinen(e.tage, [heute])
  return e.z
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
  a: { uebung: string; urteil: string; eingabe?: unknown; sprache?: string },
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
    // Je Sprache (10.10.2026): Übungstag und „Hören & Sprechen"
    if (a.sprache) {
      const z = jeSprache(d, a.sprache, jetzt)
      if (a.urteil === 'richtig' && HOER_UEBUNGEN.has(a.uebung)) z.hoeren++
    }
    achDatenSchreiben(n.id, d)
  } catch {
    // Achievements dürfen das Üben nie stören
  }
}

/** Spiele, deren Wert richtige Verbformen zählt */
const VERBSPIELE = new Set(['vok:formenblitz', 'vok:bildverb', 'gram:verbblitz', 'gram:bildverb', 'gram:formenblitz'])

/** Ein Spiel ist zu Ende (aus dem Rekordbuch): `gebrochen` = früherer Rekord übertroffen; `fehler` = falsche Antworten, wenn bekannt */
export function achievementSpiel(
  n: NutzerInfo,
  schluessel: string,
  wert: number,
  gebrochen: boolean,
  fehler?: number,
  jetzt = Date.now(),
  /** Sprache des Kurses (10.10.2026: Medaillen je Sprache) */
  sprache?: string
): void {
  if (!zaehlt(n)) return
  try {
    const d = achDatenLesen(n.id)
    const heute = isoTag(jetzt)
    if (!d.tage.includes(heute)) d.tage = tageVereinen(d.tage, [heute])
    if (gebrochen) d.zaehler.rekordeGebrochen++
    if (schluessel === 'vok:blitz' && fehler === 0 && wert >= 10) d.zaehler.blitzFehlerfrei++
    if (VERBSPIELE.has(schluessel) && wert > 0) d.zaehler.verbformen += Math.min(200, Math.round(wert))
    if (sprache) {
      const z = jeSprache(d, sprache, jetzt)
      // Einzelspiele zählen als Spielrunde; gemeinsame Runden zählt achievementZusammen
      if (schluessel.startsWith('vok:') || schluessel.startsWith('gram:')) z.spielrunden++
      if (gebrochen) z.rekorde++
      if (HOER_SPIELE.has(schluessel)) z.hoeren += HOERSPIEL_PUNKTE
    }
    achDatenSchreiben(n.id, d)
  } catch {
    // wie oben
  }
}

/**
 * Ein Mehrspieler-Spiel ist zu Ende (08.10.2026, server/spiel.ts; nie für Beschreib-Raten): Teamrunden, Team-Ziele,
 * fehlerfreie Fluchträume/Baustellen, Versus-Spiele und Siege, Comeback, „unmöglich“, ausprobierte Spielarten.
 */
export function achievementZusammen(
  n: NutzerInfo,
  e: { spiel: MehrspielId; art: MehrArt; teamZiel: boolean; gewonnen: boolean; comeback: boolean; fehlerfrei: boolean; unmoeglich: boolean },
  jetzt = Date.now(),
  sprache?: string
): void {
  if (!zaehlt(n) || e.spiel === 'beschreiben') return
  try {
    const d = achDatenLesen(n.id)
    const heute = isoTag(jetzt)
    if (!d.tage.includes(heute)) d.tage = tageVereinen(d.tage, [heute])
    const z = d.zaehler
    z.spielarten = (z.spielarten ?? 0) | (SPIELART_BIT[e.spiel] ?? 0)
    if (e.art === 'koop') {
      z.koopRunden++
      if (e.teamZiel) z.teamZiele++
      if (e.spiel === 'fluchtraum' && e.teamZiel && e.fehlerfrei) z.fluchtraumFehlerfrei++
      if (e.spiel === 'satzbaustelle' && e.fehlerfrei) z.satzbaustelleFehlerfrei++
      if (e.unmoeglich && e.teamZiel) z.unmoeglich++
    } else {
      z.versusSpiele++
      if (e.gewonnen) z.faireSiege++
      if (e.gewonnen && e.comeback) z.comebackSiege++
      if (e.unmoeglich && e.gewonnen) z.unmoeglich++
    }
    if (sprache) {
      const j = jeSprache(d, sprache, jetzt)
      j.zusammenRunden++
      if (e.art === 'koop' && e.teamZiel) j.teamZiele++
    }
    achDatenSchreiben(n.id, d)
  } catch {
    // Achievements dürfen das Spielen nie stören
  }
}

/** Medaillen, Titel und Titelwahl einer Person (Lehrkraftansicht, Spielraum) – nur lesen */
export function auszeichnungenVon(nutzerId: string): { ausz: AuszStand; titelWahl: TitelWahl } {
  try {
    const d = achDatenLesen(nutzerId)
    return { ausz: d.ausz, titelWahl: d.titelWahl }
  } catch {
    return { ausz: { medaillen: {}, titel: {} }, titelWahl: {} }
  }
}

/** Form bzw. angezeigten Titel speichern (frisch gelesen, damit nichts anderes überschrieben wird) */
export function titelWahlSetzen(n: NutzerInfo, wahl: TitelWahl): TitelWahl {
  const d = achDatenLesen(n.id)
  d.titelWahl = { ...d.titelWahl, ...wahl }
  if (zaehlt(n)) achDatenSchreiben(n.id, d)
  return d.titelWahl
}
