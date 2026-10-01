/**
 * Bewertungsraster der Sprechprüfung (01.10.2026).
 *
 * Die Kriterien folgen dem gemeinsamen Kern der Länderraster und des GER (Begleitband 2020,
 * „Qualitative Aspekte der gesprochenen Sprache"): Aufgabenerfüllung/Inhalt, Interaktion,
 * Spektrum, Korrektheit, Aussprache/Intonation, Flüssigkeit. Welche Kriterien ein Land nennt
 * und wie es sie gewichtet, steht in `laender.ts`; gerechnet wird hier.
 *
 * Die Punkte des Teils werden nach dem Gewicht auf die Kriterien verteilt – mit derselben
 * Summenregel wie die Teile der Klassenarbeit (die Summe stimmt immer genau).
 */
import { gradeSteps, roundHalfUp } from '../gradeScale'

export type SprechKriteriumId = 'aufgabe' | 'interaktion' | 'spektrum' | 'korrektheit' | 'aussprache' | 'fluessigkeit' | 'strategie'

export interface SprechKriterium {
  id: SprechKriteriumId
  label: string
  /** Was die volle Punktzahl verlangt (Deskriptor des obersten Bandes) */
  oben: string
  /** Mittleres Band */
  mitte: string
  /** Unteres Band */
  unten: string
  /** Gehört zum Bereich Inhalt/Kommunikation oder zur Sprache */
  bereich: 'inhalt' | 'sprache'
}

export const SPRECH_KRITERIEN: Record<SprechKriteriumId, SprechKriterium> = {
  aufgabe: {
    id: 'aufgabe',
    label: 'Kommunikative Aufgabenerfüllung / Inhalt',
    oben: 'Aufgabe vollständig erfüllt, Inhalt differenziert, Aussagen begründet und mit Beispielen gestützt, Material sinnvoll genutzt.',
    mitte: 'Aufgabe im Wesentlichen erfüllt, Inhalt nachvollziehbar, Begründungen teils knapp.',
    unten: 'Aufgabe nur in Ansätzen erfüllt, Inhalt lückenhaft oder unklar.',
    bereich: 'inhalt'
  },
  interaktion: {
    id: 'interaktion',
    label: 'Interaktion / Gesprächsführung',
    oben: 'Geht auf die Partnerin bzw. den Partner ein, ergreift das Wort, fragt nach, leitet über und führt das Gespräch zu einem Ergebnis.',
    mitte: 'Reagiert angemessen, bringt eigene Beiträge ein, braucht gelegentlich Impulse.',
    unten: 'Reagiert kaum auf Beiträge anderer, Gespräch kommt nur mit Hilfe zustande.',
    bereich: 'inhalt'
  },
  strategie: {
    id: 'strategie',
    label: 'Kommunikationsstrategien / Präsentation',
    oben: 'Klar strukturiert, adressatengerecht, nutzt Strategien (Umschreiben, Nachfragen, Zeit gewinnen) souverän.',
    mitte: 'Erkennbare Struktur, Strategien teilweise genutzt.',
    unten: 'Kaum Struktur, Strategien fehlen; Abbrüche bei Lücken.',
    bereich: 'inhalt'
  },
  spektrum: {
    id: 'spektrum',
    label: 'Spektrum sprachlicher Mittel (Wortschatz, Strukturen)',
    oben: 'Breiter, themenspezifischer Wortschatz und variable Strukturen, auch komplexe Satzgefüge.',
    mitte: 'Ausreichender Wortschatz, überwiegend einfache Strukturen mit einzelnen Variationen.',
    unten: 'Begrenzter Wortschatz, einfache und sich wiederholende Strukturen.',
    bereich: 'sprache'
  },
  korrektheit: {
    id: 'korrektheit',
    label: 'Sprachliche Korrektheit',
    oben: 'Weitgehend korrekt; Fehler beeinträchtigen das Verständnis nicht.',
    mitte: 'Mehrere Fehler, das Verständnis bleibt überwiegend gesichert.',
    unten: 'Häufige Fehler, die das Verständnis erheblich beeinträchtigen.',
    bereich: 'sprache'
  },
  aussprache: {
    id: 'aussprache',
    label: 'Aussprache und Intonation',
    oben: 'Klar verständlich, natürliche Intonation, kaum Abweichungen.',
    mitte: 'Verständlich, Abweichungen fallen auf, stören aber selten.',
    unten: 'Häufig schwer verständlich.',
    bereich: 'sprache'
  },
  fluessigkeit: {
    id: 'fluessigkeit',
    label: 'Flüssigkeit und Zusammenhang',
    oben: 'Spricht flüssig und zusammenhängend, verknüpft Aussagen mit passenden Konnektoren.',
    mitte: 'Überwiegend flüssig, gelegentliche Pausen zur Planung.',
    unten: 'Stockend, kurze unverbundene Äußerungen.',
    bereich: 'sprache'
  }
}

/** Ein Kriterium mit Gewicht (Prozent) in der Vorgabe eines Landes */
export interface Gewichtung {
  id: SprechKriteriumId
  gewicht: number
}

/** Eine Zeile des fertigen Rasters */
export interface RasterZeile {
  kriterium: SprechKriterium
  gewicht: number
  punkte: number
}

/**
 * Verteilt `gesamt` Punkte nach den Gewichten auf die Kriterien.
 * Gerundet wird fortlaufend, damit die Summe genau stimmt.
 */
export function rasterZeilen(gewichte: Gewichtung[], gesamt: number): RasterZeile[] {
  const summe = gewichte.reduce((n, g) => n + g.gewicht, 0) || 1
  let erledigt = 0
  let bisher = 0
  return gewichte.map((g, i) => {
    bisher += g.gewicht
    const bis = i === gewichte.length - 1 ? gesamt : Math.round((gesamt * bisher) / summe)
    const punkte = bis - erledigt
    erledigt = bis
    return { kriterium: SPRECH_KRITERIEN[g.id], gewicht: g.gewicht, punkte }
  })
}

/** Anteil von Inhalt/Kommunikation und Sprache am Raster in Prozent */
export function bereichsAnteile(gewichte: Gewichtung[]): {
  inhalt: number
  sprache: number
} {
  const summe = gewichte.reduce((n, g) => n + g.gewicht, 0) || 1
  const inhalt = Math.round((100 * gewichte.filter((g) => SPRECH_KRITERIEN[g.id].bereich === 'inhalt').reduce((n, g) => n + g.gewicht, 0)) / summe)
  return { inhalt, sprache: 100 - inhalt }
}

/** Note aus erreichten Punkten nach dem Notenschlüssel der Arbeit (Prozentschwellen) */
export function noteAusPunkten(erreicht: number, gesamt: number, schwellen?: number[]): number {
  if (gesamt <= 0) return 6
  const prozent = (100 * Math.max(0, Math.min(erreicht, gesamt))) / gesamt
  const stufe = gradeSteps(schwellen).find((s) => prozent >= s.percent)
  return stufe?.grade ?? 6
}

/** Mindestpunktzahl je Note (1–6) für die Tabelle unter dem Raster */
export function punkteJeNote(gesamt: number, schwellen?: number[]): { note: number; label: string; ab: number }[] {
  return gradeSteps(schwellen).map((s) => ({
    note: s.grade,
    label: s.label,
    ab: roundHalfUp((gesamt * s.percent) / 100)
  }))
}
