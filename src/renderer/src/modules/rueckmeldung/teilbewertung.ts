/**
 * Bewertung nach Teilen (29.09.2026, Wunsch der Lehrkraft): In den Fremdsprachen erkennt die
 * Rückmeldung Schreib- und Sprachmittlungsaufgaben, bei denen Inhalt und Sprache getrennt
 * bewertet werden (in der Regel 40 % Inhalt, 60 % Sprache). Besteht die Arbeit aus mehreren
 * Teilkompetenzen, ergibt sich die Gesamtleistung aus der prozentualen Gewichtung der Teile
 * oder aus ihren Punkten. Stehen Gewichtungen auf dem Material („Content 40 % / Language 60 %",
 * „(15 P.)"), gelten diese.
 *
 * Quellen der Voreinstellung: recherche/rueckmeldung-inhalt-sprache-gewichtung-2026-09-29.md.
 */
import { formatArt } from '../klassenarbeit/model/faecher'
import { istModerneFremdsprache } from '../klassenarbeit/model/nachweise'
import type { Exam } from '../klassenarbeit/model/types'
import { formatById } from '../klassenarbeit/model/formats'

/** Art eines Teils: getrennt nach Inhalt und Sprache bewertet oder als Ganzes */
export type TeilArt = 'schreiben' | 'sprachmittlung' | 'sonstig'

/** Woher die Angaben eines Teils stammen */
export type TeilQuelle = 'klassenarbeit' | 'material' | 'vorgabe' | 'lehrkraft'

export interface BewertungsTeil {
  id: string
  titel: string
  art: TeilArt
  /** Anteil an der Gesamtleistung in Prozent (Verrechnung „prozent") */
  gewicht?: number
  /** Höchstpunktzahl (Verrechnung „punkte") */
  punkte?: number
  /** Nur Schreiben/Sprachmittlung: Anteil des Inhalts in Prozent; Sprache = 100 − Inhalt */
  inhalt?: number
  quelle: TeilQuelle
}

export type Verrechnung = 'prozent' | 'punkte'

/** Wertung eines Teils in einem Bogen: Erfüllungsgrade in Prozent */
export interface TeilWertung {
  teilId: string
  /** Schreiben/Sprachmittlung: Inhalt und Sprache getrennt */
  inhalt?: number
  sprache?: number
  /** Übrige Teile: Erfüllungsgrad des Teils */
  anteil?: number
  begruendung?: string
}

export const TEIL_ARTEN: { value: TeilArt; label: string }[] = [
  { value: 'schreiben', label: 'Schreiben (Inhalt + Sprache)' },
  { value: 'sprachmittlung', label: 'Sprachmittlung (Inhalt + Sprache)' },
  { value: 'sonstig', label: 'andere Teilkompetenz' }
]

export const getrennt = (t: Pick<BewertungsTeil, 'art'>): boolean => t.art === 'schreiben' || t.art === 'sprachmittlung'

export const fremdsprachlich = (subjectId: string): boolean => istModerneFremdsprache(subjectId)

/**
 * Voreinstellung für den Inhaltsanteil einer Schreib- bzw. Sprachmittlungsaufgabe, wenn das
 * Material nichts angibt. Grundregel 40 : 60 (Inhalt : Sprache) in den Ländern, die sie
 * ausweisen; Abweichungen stehen in `INHALT_ABWEICHUNGEN`.
 */
export const INHALT_STANDARD = 40

export interface InhaltVorgabe {
  inhalt: number
  quelle: string
}

type Regel = (grade: number, art: TeilArt, schoolTypeId: string) => InhaltVorgabe | null

/**
 * Länderabweichungen von 40 : 60 – nur belegte Werte (Recherche 29.09.2026, Abschnitte in
 * recherche/rueckmeldung-inhalt-sprache-gewichtung-2026-09-29.md). In der Oberstufe gilt überall
 * 40 : 60 (KMK-Bildungsstandards 2012, IQB-Aufgabenpool), auch für die Sprachmittlung.
 */
export const INHALT_ABWEICHUNGEN: Record<string, Regel> = {
  // Saarland, Gymnasium Englisch: Raster Kl. 5/6 mit vier gleichen Bereichen, Kl. 8 25 : 75 bis 40 : 60
  SL: (grade, art, schoolTypeId) =>
    art === 'schreiben' && schoolTypeId === 'gymnasium' && grade <= 8
      ? grade <= 6
        ? { inhalt: 25, quelle: 'Saarland, Bewertungsraster Englisch Kl. 5/6 (ein Bereich von vier)' }
        : { inhalt: 33, quelle: 'Saarland, Lehrplan Englisch Kl. 8: 25 : 75 bis 40 : 60 (Mitte)' }
      : null,
  // Brandenburg Kl. 7: Raster 5/5/5 Punkte (Inhalt / Aufbau / Sprache)
  BB: (grade, art) => (art === 'schreiben' && grade === 7 ? { inhalt: 33, quelle: 'Brandenburg Kl. 7: Raster Inhalt/Aufbau/Sprache je 5 Punkte' } : null),
  // Mecklenburg-Vorpommern, Prüfung Mittlere Reife: 8/8/8 Punkte
  MV: (grade, art, schoolTypeId) =>
    art === 'schreiben' && grade === 10 && schoolTypeId !== 'gymnasium'
      ? { inhalt: 33, quelle: 'Mecklenburg-Vorpommern, Mittlere Reife: Aufgabenerfüllung/Textgestaltung/Sprache je 8 Punkte' }
      : null,
  // Sachsen-Anhalt, zentrale Klassenarbeit Englisch Kl. 6: „Content: 5 BE Language: 5 BE"
  ST: (grade, art) => (art === 'schreiben' && grade <= 6 ? { inhalt: 50, quelle: 'Sachsen-Anhalt, zentrale Klassenarbeit Kl. 6: Content 5 BE, Language 5 BE' } : null),
  // Bayern, Realschule Abschlussprüfung (Guided Writing): Task Achievement 7 von 30 Punkten
  BY: (grade, art, schoolTypeId) =>
    art === 'schreiben' && grade === 10 && schoolTypeId === 'realschule'
      ? { inhalt: 23, quelle: 'Bayern, Realschul-Abschlussprüfung: Task Achievement 7 von 30 Punkten' }
      : null
}

export function inhaltVorgabe(stateId: string, grade: number, art: TeilArt, schoolTypeId = 'gymnasium'): InhaltVorgabe {
  return INHALT_ABWEICHUNGEN[stateId]?.(grade, art, schoolTypeId) ?? { inhalt: INHALT_STANDARD, quelle: 'übliche Gewichtung 40 : 60 (Inhalt : Sprache)' }
}

/** Die Teile einer gespeicherten Klassenarbeit – Gewichte, Punkte und Inhaltsanteile stehen dort fest */
export function teileAusArbeit(exam: Exam): { teile: BewertungsTeil[]; verrechnung: Verrechnung } {
  const teile = exam.parts.map((p, i): BewertungsTeil => {
    const art = formatArt(p.formatId)
    const teilArt: TeilArt = art === 'writing' ? 'schreiben' : art === 'mediation' ? 'sprachmittlung' : 'sonstig'
    const titel = p.label || formatById(p.formatId)?.label || `Teil ${i + 1}`
    // Andere produktive Teile mit Inhaltsanteil (z. B. Sprechen) werden wie Schreiben getrennt bewertet
    const produktiv = teilArt !== 'sonstig' || typeof p.contentShare === 'number'
    return {
      id: p.id,
      titel,
      art: teilArt !== 'sonstig' ? teilArt : produktiv ? 'schreiben' : 'sonstig',
      gewicht: p.weight,
      ...(p.points ? { punkte: p.points } : {}),
      ...(produktiv ? { inhalt: p.contentShare ?? INHALT_STANDARD } : {}),
      quelle: 'klassenarbeit'
    }
  })
  // Fremdsprachen verrechnen Teilnoten nach Anteilen; sonst zählen die Punkte
  const verrechnung: Verrechnung = fremdsprachlich(exam.meta.subjectId) || teile.some((t) => !t.punkte) ? 'prozent' : 'punkte'
  return { teile, verrechnung }
}

const begrenze = (x: unknown, max = 100): number => Math.max(0, Math.min(max, Math.round(Number(x) || 0)))

/** Erfüllungsgrad eines Teils aus seiner Wertung (Inhalt und Sprache nach dem Inhaltsanteil) */
export function teilAnteil(t: BewertungsTeil, w: TeilWertung | undefined): number | null {
  if (!w) return null
  if (getrennt(t)) {
    if (typeof w.inhalt !== 'number' && typeof w.sprache !== 'number') return typeof w.anteil === 'number' ? w.anteil : null
    const i = t.inhalt ?? INHALT_STANDARD
    return Math.round(((w.inhalt ?? 0) * i + (w.sprache ?? 0) * (100 - i)) / 100)
  }
  return typeof w.anteil === 'number' ? w.anteil : null
}

/**
 * Gesamtleistung aus den Teilen: nach Prozentgewicht oder nach Punkten. Teile ohne Wertung
 * zählen nicht mit (die Summe der übrigen Gewichte wird auf 100 % bezogen).
 */
export function gesamtAusTeilen(
  teile: BewertungsTeil[],
  wertungen: TeilWertung[],
  verrechnung: Verrechnung
): { anteil: number; erreicht?: number; moeglich?: number } | null {
  let summe = 0
  let gewichte = 0
  let erreicht = 0
  let moeglich = 0
  for (const t of teile) {
    const a = teilAnteil(
      t,
      wertungen.find((w) => w.teilId === t.id)
    )
    if (a === null) continue
    const g = verrechnung === 'punkte' ? (t.punkte ?? 0) : (t.gewicht ?? 0)
    summe += a * g
    gewichte += g
    if (verrechnung === 'punkte' && t.punkte) {
      erreicht += (a * t.punkte) / 100
      moeglich += t.punkte
    }
  }
  if (!gewichte) return null
  const anteil = Math.round(summe / gewichte)
  return verrechnung === 'punkte' ? { anteil, erreicht: Math.round(erreicht * 2) / 2, moeglich } : { anteil }
}

/** Gewichte auf 100 % bringen (nach dem Ändern eines Teils) */
export function aufHundert(teile: BewertungsTeil[]): BewertungsTeil[] {
  const summe = teile.reduce((s, t) => s + (t.gewicht ?? 0), 0)
  if (!summe || summe === 100) return teile
  let rest = 100
  return teile.map((t, i) => {
    const g = i === teile.length - 1 ? rest : Math.round(((t.gewicht ?? 0) * 100) / summe)
    rest -= g
    return { ...t, gewicht: g }
  })
}

/** Zeile für die KI und den Bogen: „Writing (60 %; Inhalt 40 %, Sprache 60 %)" */
export function teilZeile(t: BewertungsTeil, verrechnung: Verrechnung): string {
  const umfang = verrechnung === 'punkte' ? (t.punkte ? `${t.punkte} P.` : '') : typeof t.gewicht === 'number' ? `${t.gewicht} %` : ''
  const split = getrennt(t) ? `Inhalt ${t.inhalt ?? INHALT_STANDARD} %, Sprache ${100 - (t.inhalt ?? INHALT_STANDARD)} %` : ''
  return `${t.titel}${umfang || split ? ` (${[umfang, split].filter(Boolean).join('; ')})` : ''}`
}

/** Teile aus der Antwort der KI (Material lesen) übernehmen – Angaben vom Material gehen vor */
export function teileAusKi(
  daten: unknown,
  kontext: { stateId: string; grade: number; schoolTypeId: string }
): { teile: BewertungsTeil[]; verrechnung: Verrechnung } | null {
  const roh = Array.isArray(daten) ? (daten as Record<string, unknown>[]) : []
  const teile = roh
    .map((d, i): BewertungsTeil | null => {
      const titel = String(d.titel ?? '').trim()
      if (!titel) return null
      const art: TeilArt = d.art === 'schreiben' || d.art === 'sprachmittlung' ? d.art : 'sonstig'
      const gewicht = begrenze(d.gewichtProzent)
      const punkte = begrenze(d.punkte, 1000)
      const inhalt = begrenze(d.inhaltProzent)
      const vorgabe = inhaltVorgabe(kontext.stateId, kontext.grade, art, kontext.schoolTypeId)
      return {
        id: `t${i + 1}`,
        titel,
        art,
        ...(gewicht ? { gewicht } : {}),
        ...(punkte ? { punkte } : {}),
        ...(art !== 'sonstig' ? { inhalt: inhalt > 0 && inhalt < 100 ? inhalt : vorgabe.inhalt } : {}),
        quelle: gewicht || punkte || (art !== 'sonstig' && inhalt > 0 && inhalt < 100) ? 'material' : 'vorgabe'
      }
    })
    .filter((t): t is BewertungsTeil => t !== null)
  if (!teile.length) return null
  // Ohne Angaben: gleich gewichten; Punkte nur, wenn jeder Teil Punkte hat
  const verrechnung: Verrechnung = teile.every((t) => t.punkte) && !teile.every((t) => t.gewicht) ? 'punkte' : 'prozent'
  const ohneGewicht = teile.every((t) => !t.gewicht)
  const mitGewicht = ohneGewicht
    ? aufHundert(teile.map((t) => ({ ...t, gewicht: t.punkte ?? 1 })))
    : teile.some((t) => !t.gewicht)
      ? teile
      : aufHundert(teile)
  return { teile: mitGewicht, verrechnung }
}

/** Wertungen aus der Antwort der KI (Bogen) – nur zu bekannten Teilen, Werte 0–100 */
export function wertungenAusKi(daten: unknown, teile: BewertungsTeil[]): TeilWertung[] {
  const roh = Array.isArray(daten) ? (daten as Record<string, unknown>[]) : []
  return teile.flatMap((t): TeilWertung[] => {
    const d = roh.find((x) => String(x.id ?? '').replace(/[[\]]/g, '') === t.id)
    if (!d) return []
    const begruendung = String(d.begruendung ?? '').trim() || undefined
    return getrennt(t)
      ? [{ teilId: t.id, inhalt: begrenze(d.inhalt), sprache: begrenze(d.sprache), ...(begruendung ? { begruendung } : {}) }]
      : [{ teilId: t.id, anteil: begrenze(d.anteil), ...(begruendung ? { begruendung } : {}) }]
  })
}

/**
 * Zeilen für den ausgedruckten Bogen – nur mit bestätigter Gesamteinstufung, damit dort keine
 * Werte stehen, die die Lehrkraft noch nicht gesehen hat.
 */
export function teilZeilenFuerBogen(teile: BewertungsTeil[] | undefined, wertungen: TeilWertung[] | undefined, v: Verrechnung = 'prozent'): string[] {
  if (!teile?.length || !wertungen?.length) return []
  return teile.flatMap((t) => {
    const w = wertungen.find((x) => x.teilId === t.id)
    if (!w) return []
    const kopf = teilZeile({ ...t, ...(getrennt(t) ? { art: 'sonstig' as const } : {}) }, v)
    return [getrennt(t) ? `${kopf}: Inhalt ${w.inhalt ?? 0} % · Sprache ${w.sprache ?? 0} %` : `${kopf}: ${w.anteil ?? 0} %`]
  })
}
