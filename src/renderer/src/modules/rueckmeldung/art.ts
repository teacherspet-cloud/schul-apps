/**
 * Art der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): wählbare FORMEN und EINSTUFUNGEN.
 *
 * Abgestimmt (Multiple Choice, 29.09.2026):
 * - Zwei Gruppen: Formen mehrfach, Einstufung genau eine oder keine, dazu die Ebene
 *   (Gesamtleistung, je Kriterium oder beides).
 * - Die KI schlägt die Einstufung vor, die Lehrkraft bestätigt. Die KI liefert dafür einen
 *   ERFÜLLUNGSGRAD in Prozent (bei einer Bewertungstabelle mit Punkten die Punkte selbst); den
 *   Wert der Skala rechnet die App aus – mit dem Notenschlüssel der Einstellungen
 *   (shared/gradeScale.ts) bzw. dem Punkteraster des Landes (shared/notenpunkte.ts). So steht
 *   nie eine Note auf dem Bogen, die nicht zum Schlüssel der Lehrkraft passt.
 * - Notenpunkte 0–15 nur in der Sekundarstufe II; Smileys und ++ … −− in allen Jahrgängen.
 *
 * Diese Datei kennt kein React – die Tests prüfen sie ohne Oberfläche.
 */
import { gehoertZurSekII } from '../arbeitsblatt/didactics/bildungsgang'
import { gradeForPoints, normalizeThresholds } from '../../shared/gradeScale'
import { punkteFuerErreicht, punkteRegelFuer } from '../../shared/notenpunkte'
import { punkteInSekI } from './laenderRegeln'
import type {
  Bewertungstabelle,
  Bogen,
  EinstufungsArt,
  EinstufungsEbene,
  Einstufungswert,
  FormArt,
  RueckmeldungMeta,
  TabellenWertung
} from './model/types'

export interface FormInfo {
  id: FormArt
  label: string
  beschreibung: string
}

export const FORMEN: FormInfo[] = [
  { id: 'schriftlich', label: 'Schriftlich', beschreibung: 'Was gelingt, Kriterien mit Beleg, Schlusssatz' },
  { id: 'tipps', label: 'Verbesserungstipps', beschreibung: 'Nächste Schritte als machbare Handlungen' },
  { id: 'tabelle', label: 'Bewertungstabelle', beschreibung: 'Kriterien mit Punkten oder Stufen – hineinziehen oder von der KI entwerfen lassen' },
  { id: 'rand', label: 'Korrekturrand (digitaler Text)', beschreibung: 'Kommentare und Korrekturzeichen am Rand neben dem Text' },
  { id: 'scan', label: 'Kommentare am Scan', beschreibung: 'Nummerierte Marker im eingescannten Text, zum Feinjustieren verschiebbar' },
  { id: 'ueberarbeitung', label: 'Überarbeitungsauftrag', beschreibung: 'Ein konkreter Auftrag, eine Stelle zu überarbeiten' }
]

export const STANDARD_FORMEN: FormArt[] = ['schriftlich', 'tipps']

export interface EinstufungInfo {
  id: EinstufungsArt
  label: string
  beispiel: string
}

export const EINSTUFUNGEN: EinstufungInfo[] = [
  { id: 'keine', label: 'Ohne Einstufung', beispiel: 'nur Rückmeldung' },
  { id: 'notenpunkte', label: 'Notenpunkte 0–15', beispiel: '11 Punkte' },
  { id: 'noteTendenz', label: 'Note mit + und −', beispiel: '2+, 2, 2−' },
  { id: 'note', label: 'Note ohne + und −', beispiel: '1 bis 6' },
  { id: 'plusMinus', label: '++ · + · 0 · − · −−', beispiel: 'fünf Stufen' },
  { id: 'smileys', label: 'Smileys', beispiel: '😀 🙂 😐' },
  { id: 'ampel', label: 'Ampel', beispiel: 'grün · gelb · rot' }
]

export const EBENEN: { value: EinstufungsEbene; label: string }[] = [
  { value: 'gesamt', label: 'Gesamtleistung' },
  { value: 'kriterien', label: 'Je Kriterium' },
  { value: 'beides', label: 'Beides' }
]

export const formenVon = (m: Pick<RueckmeldungMeta, 'formen'>): FormArt[] => (m.formen?.length ? m.formen : STANDARD_FORMEN)
export const einstufungVon = (m: Pick<RueckmeldungMeta, 'einstufung'>): EinstufungsArt => m.einstufung ?? 'keine'
export const ebeneVon = (m: Pick<RueckmeldungMeta, 'ebene'>): EinstufungsEbene => m.ebene ?? 'gesamt'
export const hatForm = (m: Pick<RueckmeldungMeta, 'formen'>, f: FormArt): boolean => formenVon(m).includes(f)
export const mitEinstufung = (m: Pick<RueckmeldungMeta, 'einstufung'>): boolean => einstufungVon(m) !== 'keine'
export const gesamtEinstufen = (m: Pick<RueckmeldungMeta, 'einstufung' | 'ebene'>): boolean => mitEinstufung(m) && ebeneVon(m) !== 'kriterien'
export const kriterienEinstufen = (m: Pick<RueckmeldungMeta, 'einstufung' | 'ebene'>): boolean => mitEinstufung(m) && ebeneVon(m) !== 'gesamt'

type LerngruppeMeta = Pick<RueckmeldungMeta, 'grade' | 'schoolTypeId' | 'stateId'>

/** Notenpunkte gibt es nur in der Sekundarstufe II (Entscheidung der Lehrkraft, 29.09.2026) */
export const notenpunkteMoeglich = (m: LerngruppeMeta): boolean => gehoertZurSekII(m.grade, m.schoolTypeId, m.stateId) || punkteInSekI(m)

/** Warum eine Einstufung für diese Lerngruppe nicht angeboten wird – sonst null */
export function einstufungGesperrt(art: EinstufungsArt, m: LerngruppeMeta): string | null {
  if (art === 'notenpunkte' && !notenpunkteMoeglich(m)) return 'Notenpunkte 0–15 gibt es nur in der Oberstufe (Sekundarstufe II).'
  return null
}

// ---------- Skalen ----------

const MINUS = '−'

/** Die Werte einer Skala, beste zuerst – für die Auswahl in der Oberfläche */
export function skalenWerte(art: EinstufungsArt): string[] {
  switch (art) {
    case 'notenpunkte':
      return Array.from({ length: 16 }, (_, i) => String(15 - i))
    case 'noteTendenz':
      return ['1+', '1', `1${MINUS}`, '2+', '2', `2${MINUS}`, '3+', '3', `3${MINUS}`, '4+', '4', `4${MINUS}`, '5+', '5', `5${MINUS}`, '6']
    case 'note':
      return ['1', '2', '3', '4', '5', '6']
    case 'plusMinus':
      return ['++', '+', '0', MINUS, `${MINUS}${MINUS}`]
    case 'smileys':
      return ['😀', '🙂', '😐']
    case 'ampel':
      return ['grün', 'gelb', 'rot']
    default:
      return []
  }
}

/** Kurze Erklärung eines Werts für Ausdruck und Legende */
export function wertText(art: EinstufungsArt, wert: string): string {
  if (art === 'notenpunkte') return `${wert} Punkt${wert === '1' ? '' : 'e'}`
  if (art === 'note' || art === 'noteTendenz') {
    const n = Number(wert.charAt(0))
    const namen = ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend']
    return n >= 1 && n <= 6 ? `${wert} (${namen[n - 1]})` : wert
  }
  if (art === 'smileys') return { '😀': '😀 sehr gut gelungen', '🙂': '🙂 gelungen', '😐': '😐 noch üben' }[wert] ?? wert
  if (art === 'plusMinus') return { '++': '++ sehr sicher', '+': '+ sicher', '0': '0 teilweise', [MINUS]: `${MINUS} unsicher`, [`${MINUS}${MINUS}`]: `${MINUS}${MINUS} noch nicht` }[wert] ?? wert
  return wert
}

export const LEGENDEN: Partial<Record<EinstufungsArt, string>> = {
  plusMinus: `++ sehr sicher · + sicher · 0 teilweise · ${MINUS} unsicher · ${MINUS}${MINUS} noch nicht`,
  smileys: '😀 sehr gut gelungen · 🙂 gelungen · 😐 noch üben',
  ampel: 'grün: sicher · gelb: teilweise · rot: noch nicht'
}

export interface SkalenKontext {
  meta: LerngruppeMeta & Pick<RueckmeldungMeta, 'subjectId'>
  /** Prozentschwellen der Noten 1–6 (thresholdsForSubject aus den Einstellungen) */
  schwellen?: number[]
}

/**
 * Wert der Skala zu einem Erfüllungsgrad in Prozent.
 *
 * Note und Note mit Tendenz folgen dem Notenschlüssel der Lehrkraft; die Tendenz ergibt sich
 * aus der Lage im Notenbereich (oberes Drittel „+", unteres Drittel „−"). Notenpunkte folgen
 * dem Raster des Landes. Die Stufen der übrigen Skalen liegen fest (siehe Legende).
 */
export function wertFuerAnteil(art: EinstufungsArt, anteil: number, k: SkalenKontext): string {
  const p = Math.max(0, Math.min(100, anteil))
  switch (art) {
    case 'notenpunkte': {
      // Sek I (Saarland): Punktwert „je nach Notentendenz" aus dem Notenschlüssel der Lehrkraft (1+ = 15 … 5− = 1, 6 = 0)
      if (!gehoertZurSekII(k.meta.grade, k.meta.schoolTypeId, k.meta.stateId)) {
        const t = wertFuerAnteil('noteTendenz', p, k)
        const note = Number(t.charAt(0))
        if (note >= 6) return '0'
        return String(15 - (note - 1) * 3 - (t.endsWith('+') ? 0 : t.length > 1 ? 2 : 1))
      }
      return String(punkteFuerErreicht(Math.round(p * 10), 1000, punkteRegelFuer(k.meta.stateId).schwellen).punkte)
    }
    case 'note':
      return String(gradeForPoints(p, 100, k.schwellen).grade)
    case 'noteTendenz': {
      const th = normalizeThresholds(k.schwellen)
      const note = gradeForPoints(p, 100, th).grade
      if (note === 6) return '6'
      const unten = th[note - 1]
      const oben = note === 1 ? 100 : th[note - 2]
      const lage = oben > unten ? (p - unten) / (oben - unten) : 0.5
      return `${note}${lage >= 2 / 3 ? '+' : lage < 1 / 3 ? MINUS : ''}`
    }
    case 'plusMinus':
      return p >= 85 ? '++' : p >= 65 ? '+' : p >= 45 ? '0' : p >= 25 ? MINUS : `${MINUS}${MINUS}`
    case 'smileys':
      return p >= 75 ? '😀' : p >= 45 ? '🙂' : '😐'
    case 'ampel':
      return p >= 75 ? 'grün' : p >= 45 ? 'gelb' : 'rot'
    default:
      return ''
  }
}

/** Vorschlag der KI → Einstufungswert (unbestätigt) */
export function vorschlag(art: EinstufungsArt, anteil: number, k: SkalenKontext, begruendung?: string): Einstufungswert {
  const a = Math.round(Math.max(0, Math.min(100, Number.isFinite(anteil) ? anteil : 0)))
  return { anteil: a, wert: wertFuerAnteil(art, a, k), ...(begruendung ? { begruendung } : {}) }
}

// ---------- Bewertungstabelle ----------

export interface TabellenSumme {
  /** Summe der erreichten Punkte (nur Kriterien mit Punkten) */
  erreicht: number
  moeglich: number
  /** Erfüllungsgrad über alle Kriterien in Prozent – Punkte gewichtet, Stufen gleichmäßig */
  anteil: number
  /** Kriterien ohne Wertung */
  offen: number
}

/** Anteil eines Kriteriums (0–1) aus seiner Wertung */
function kriteriumAnteil(t: Bewertungstabelle, id: string, w: TabellenWertung | undefined): number | null {
  const k = t.kriterien.find((x) => x.id === id)
  if (!k || !w) return null
  if (k.punkte && k.punkte > 0) return w.punkte == null ? null : Math.max(0, Math.min(k.punkte, w.punkte)) / k.punkte
  const n = t.stufen.length
  if (w.stufe == null || n < 2) return null
  return (n - 1 - Math.max(0, Math.min(n - 1, w.stufe))) / (n - 1)
}

export function tabellenSumme(t: Bewertungstabelle, wertung: TabellenWertung[] = []): TabellenSumme {
  let erreicht = 0
  let moeglich = 0
  let gewicht = 0
  let summe = 0
  let offen = 0
  const mittel = (() => {
    const p = t.kriterien.map((k) => k.punkte ?? 0).filter((x) => x > 0)
    return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 1
  })()
  for (const k of t.kriterien) {
    const w = wertung.find((x) => x.kriteriumId === k.id)
    const a = kriteriumAnteil(t, k.id, w)
    const g = k.punkte && k.punkte > 0 ? k.punkte : mittel
    if (k.punkte && k.punkte > 0) moeglich += k.punkte
    if (a == null) {
      offen++
      continue
    }
    if (k.punkte && k.punkte > 0) erreicht += Math.max(0, Math.min(k.punkte, w?.punkte ?? 0))
    summe += a * g
    gewicht += g
  }
  return { erreicht, moeglich, anteil: gewicht ? Math.round((summe / gewicht) * 1000) / 10 : 0, offen }
}

/** Einstufung der Gesamtleistung neu aus der Tabelle, wenn die Lehrkraft Punkte ändert */
export function gesamtAusTabelle(t: Bewertungstabelle, b: Bogen, art: EinstufungsArt, k: SkalenKontext): Einstufungswert | undefined {
  if (!b.tabelle?.length) return b.gesamt
  const s = tabellenSumme(t, b.tabelle)
  return { ...vorschlag(art, s.anteil, k, b.gesamt?.begruendung), bestaetigt: false }
}

/** Noch offene Bestätigungen eines Bogens (leer = exportbereit) */
export function offeneBestaetigungen(m: Pick<RueckmeldungMeta, 'einstufung' | 'ebene'>, b: Bogen | undefined): string[] {
  if (!b || !mitEinstufung(m)) return []
  const offen: string[] = []
  if (gesamtEinstufen(m) && !b.gesamt?.bestaetigt) offen.push('Gesamteinstufung')
  if (kriterienEinstufen(m) && (b.kriterienStufen ?? []).some((s) => s && !s.bestaetigt)) offen.push('Einstufung der Kriterien')
  return offen
}
