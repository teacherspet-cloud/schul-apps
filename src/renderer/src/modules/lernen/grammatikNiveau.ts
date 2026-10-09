/**
 * Schwierigkeit der Grammatikaufgaben nach Land, Schulform und Jahrgang (09.10.2026, Befund der Lehrkraft: Für eine
 * 10. Klasse am Gymnasium waren die Aufgaben viel zu leicht – kurze Einzelsätze, überwiegend Auswahl).
 *
 *  - `zielNiveau`: GER-Niveau der Lerngruppe – aus der GER-Tabelle der Länder (resources/cefr/levels.json: Land,
 *    Schulform, Stellung der Fremdsprache, Jahrgang), sonst nach Faustregel (Lernjahr am Gymnasium, andere Schulformen
 *    eine bzw. zwei Teilstufen darunter – wie die Tabelle in Niedersachsen).
 *  - `niveauRegel`: verbindliche Vorgaben für die KI je Niveau – Satzlänge, Anteil Auswahl gegenüber offenen
 *    Umformungen, Qualität der Ablenker, Kontext, keine trivialen Aufgaben. „grundlegend / mittel / anspruchsvoll"
 *    verschiebt um eine Teilstufe relativ zu diesem Maßstab.
 *  - `niveauBefund`: deterministische Gegenprobe nach der Erzeugung (mittlere Satzlänge, Anteil Auswahl) – ist der Pool
 *    deutlich zu leicht, sagt es die Abschlussmeldung.
 */
import { CEFR_SCALE, cefrIndex, type CefrLevel, type CefrTable } from '@shared/types'
import { fachAusName } from '@shared/faecher'
import { profilVon } from '@shared/schulformen'
import { defaultSequence, GRAMMAR_TOPICS, learningYear, topicStart } from '../arbeitsblatt/didactics/grammar'

export type Schwierigkeit = 'grundlegend' | 'mittel' | 'anspruchsvoll'

export interface NiveauAngaben {
  fach: string
  sprache: string
  jahrgang: number
  /** Bundesland (Kennung wie „NI") */
  land?: string
  /** Schulform (Kennung wie „gymnasium") */
  schulform?: string
}

const SPRACHE_ZU_FACH: Record<string, string> = { en: 'englisch', fr: 'franzoesisch', es: 'spanisch', la: 'latein', it: 'italienisch', ru: 'russisch' }

/** Fach-Kennung des Katalogs („Englisch" → „englisch") */
export function fachKennung(fach: string, sprache = ''): string {
  return fachAusName(fach)?.id ?? SPRACHE_ZU_FACH[sprache] ?? fach.trim().toLowerCase()
}

/** Stellung der Fremdsprache (1., 2., 3.) – Englisch 1., die übrigen nach der üblichen Folge (grammar.ts) */
export function sprachFolge(fachId: string, jahrgang: number): 1 | 2 | 3 {
  const f = defaultSequence(fachId, jahrgang)
  return f === 'fs1' ? 1 : f === 'fs2' ? 2 : 3
}

/** Niveau aus der GER-Tabelle der Länder (null: Land/Schulform/Sprache/Jahrgang nicht verzeichnet) */
export function niveauAusTabelle(table: CefrTable | null | undefined, a: NiveauAngaben): CefrLevel | null {
  if (!table || !a.land || !a.schulform) return null
  const st = table.states.find((s) => s.id === a.land)?.schoolTypes.find((t) => t.id === a.schulform)
  const folge = sprachFolge(fachKennung(a.fach, a.sprache), a.jahrgang)
  const spur = st?.languages.find((l) => l.order === folge)
  const level = spur?.grades[String(a.jahrgang)]?.level as CefrLevel | undefined
  return level && CEFR_SCALE.includes(level) ? level : null
}

/** Gymnasium je Lernjahr (1. Fremdsprache Niedersachsen: Klasse 5 A1 … Klasse 10 B1+) */
const GYMNASIUM: CefrLevel[] = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B1+', 'B2', 'B2+']

/** Faustregel ohne Tabelle: Lernjahr am Gymnasium, andere Schulformen darunter */
export function niveauFaustregel(a: NiveauAngaben): CefrLevel {
  const fachId = fachKennung(a.fach, a.sprache)
  const folge = defaultSequence(fachId, a.jahrgang)
  const lj = learningYear(a.jahrgang, folge, a.land ?? '')
  const basis = cefrIndex(GYMNASIUM[Math.min(GYMNASIUM.length, Math.max(1, lj)) - 1])
  const profil = a.schulform ? profilVon(a.schulform, a.land) : undefined
  const abzug = profil === 'realschule' || profil === 'integriert' ? 1 : profil === 'hauptschule' ? 2 : profil === 'foerderLernen' ? 3 : 0
  return CEFR_SCALE[Math.max(1, basis - abzug)]
}

/** Niveau der Lerngruppe: Tabelle, sonst Faustregel */
export function zielNiveau(a: NiveauAngaben, table?: CefrTable | null): { ger: CefrLevel; quelle: 'tabelle' | 'faustregel' } {
  const t = niveauAusTabelle(table, a)
  return t ? { ger: t, quelle: 'tabelle' } : { ger: niveauFaustregel(a), quelle: 'faustregel' }
}

/** Relativ zum Maßstab: grundlegend eine Teilstufe darunter, anspruchsvoll eine darüber */
export function verschoben(ger: CefrLevel, s?: Schwierigkeit | string): CefrLevel {
  const i = cefrIndex(ger)
  const d = s === 'grundlegend' ? -1 : s === 'anspruchsvoll' ? 1 : 0
  return CEFR_SCALE[Math.max(1, Math.min(CEFR_SCALE.length - 2, i + d))]
}

export interface NiveauVorgabe {
  /** Wörter je Satz (Zielsprache), von–bis */
  satz: [number, number]
  /** Höchstanteil Auswahl/Mehrfachauswahl */
  auswahlHoechstens: number
  /** Aufgabenmischung für 40 Aufgaben (Englisch, Französisch …) */
  mischung: string
  anforderungen: string[]
}

/** Vorgaben je Niveaustufe (Teilstufen zusammengefasst) */
export function niveauVorgabe(ger: CefrLevel): NiveauVorgabe {
  const i = cefrIndex(ger)
  if (i <= cefrIndex('A1'))
    return {
      satz: [4, 9],
      auswahlHoechstens: 0.3,
      mischung: 'etwa 12 Lücke, 8 Auswahl, 8 Umformen, 6 Fehler finden, 6 Satzbau',
      anforderungen: [
        'kurze, klare Hauptsätze aus dem Alltag der Kinder; je Aufgabe eine Form',
        'Ablenker sind typische Anfängerfehler (falsche Person, fehlende Endung)'
      ]
    }
  if (i <= cefrIndex('A2'))
    return {
      satz: [6, 12],
      auswahlHoechstens: 0.25,
      mischung: 'etwa 11 Lücke, 7 Auswahl, 10 Umformen, 6 Fehler finden, 6 Satzbau',
      anforderungen: [
        'Hauptsätze und einfache Nebensätze (and, but, because, when); kleine Situationen statt Einzelsätzen ohne Zusammenhang',
        'Umformen: verneinen, fragen, Person/Zeitangabe ändern',
        'Ablenker: plausible Formen derselben Struktur, keine offensichtlich unsinnigen'
      ]
    }
  if (i <= cefrIndex('B1'))
    return {
      satz: [8, 15],
      auswahlHoechstens: 0.2,
      mischung: 'etwa 10 Lücke (je Satz mit Kontext), 6 Auswahl, 12 Umformen, 7 Fehler finden, 5 Satzbau',
      anforderungen: [
        'Sätze mit Nebensätzen, Zeit- und Ortsangaben; mehrere Formen im Satz, nicht nur die geübte',
        'ähnliche Formen gegenüberstellen (z. B. zwei Zeitformen, Aktiv/Passiv), Signalwörter nicht in jedem Satz',
        'Fehler finden in längeren Sätzen; Umformungen mit mehr als einem Schritt',
        'Ablenker: typische Verwechslungen auf diesem Niveau, keine trivial falschen Formen'
      ]
    }
  if (i <= cefrIndex('B1+'))
    return {
      satz: [10, 20],
      auswahlHoechstens: 0.15,
      mischung: 'etwa 8 Lücke (in längeren Sätzen mit Kontext), 4 Auswahl, 14 Umformen (davon mehrere mit zwei Schritten), 10 Fehler finden im Kontext, 4 Satzbau',
      anforderungen: [
        'authentisch wirkende, längere Sätze (Zeitung, Erzählung, Gespräch, Sachtext); gemischte Formen und Satzgefüge',
        'Transfer: die Regel in neuen Zusammenhängen anwenden; ähnliche Formen gezielt gegenüberstellen; Signalwörter oft weglassen – der Kontext entscheidet',
        'kaum isolierte Einzellücken; Lücken nur, wo der Kontext die Form verlangt',
        'Fehler finden im Kontext mehrerer Sätze bzw. in einem längeren Satz',
        'Wortschatz des Niveaus (kein Grundschulwortschatz); Ablenker: anspruchsvolle typische Fehler (Kongruenz, Zeitenfolge, Stellung)'
      ]
    }
  return {
    satz: [12, 24],
    auswahlHoechstens: 0.1,
    mischung: 'etwa 6 Lücke (im Kontext), 4 Auswahl, 16 Umformen (Paraphrase, Registerwechsel, mehrere Schritte), 10 Fehler finden im Kontext, 4 Satzbau',
    anforderungen: [
      'komplexe, authentische Sätze mit Satzgefügen, Einschüben und gemischten Zeitformen; Register (formell/informell) berücksichtigen',
      'Paraphrase und Umformulierung mit gleicher Bedeutung; feine Bedeutungsunterschiede ähnlicher Formen',
      'keine Drill-Aufgaben ohne Kontext; Ablenker auf hohem Niveau'
    ]
  }
}

/** Verbindliche Niveau-Vorgaben für die KI */
export function niveauRegel(a: NiveauAngaben, ger: CefrLevel, schwierigkeit?: Schwierigkeit | string): string {
  const ziel = verschoben(ger, schwierigkeit)
  const v = niveauVorgabe(ziel)
  const wo = [a.schulform ? schulformText(a.schulform, a.land) : '', a.land ?? ''].filter(Boolean).join(', ')
  return [
    `NIVEAU – VERBINDLICH: Lerngruppe Klasse ${a.jahrgang}${wo ? ` (${wo})` : ''}, erwartetes GER-Niveau ${ger}${
      schwierigkeit && schwierigkeit !== 'mittel' ? `; gewünscht „${schwierigkeit}" – Zielniveau der Aufgaben ${ziel}` : ''
    }.`,
    `- Satzlänge in der Zielsprache meist ${v.satz[0]}–${v.satz[1]} Wörter (Satzbau-Aufgaben eher am unteren Ende).`,
    `- Auswahl-Aufgaben höchstens ${Math.round(v.auswahlHoechstens * 100)} % der Aufgaben; offene Umformungen und Fehler im Kontext haben Vorrang.`,
    ...v.anforderungen.map((x) => `- ${x}`),
    '- Keine trivialen Aufgaben, die man ohne die Regel lösen kann; nicht dieselbe Satzschablone wiederholen.'
  ].join('\n')
}

/** Mischung der 40 Aufgaben (nicht Latein) je Niveau */
export const niveauMischung = (ger: CefrLevel, schwierigkeit?: Schwierigkeit | string): string => niveauVorgabe(verschoben(ger, schwierigkeit)).mischung

function schulformText(id: string, land?: string): string {
  const p = profilVon(id, land)
  return p === 'gymnasium' ? 'Gymnasium' : p === 'realschule' ? 'Realschule' : p === 'hauptschule' ? 'Hauptschule' : p === 'foerderLernen' ? 'Förderschule Lernen' : id
}

export interface NiveauBefund {
  mittlereLaenge: number
  auswahlAnteil: number
  zuLeicht: boolean
  hinweis: string
}

const woerterIn = (t: string): number => t.replace(/_{3,}/g, ' x ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length

/**
 * Gegenprobe nach der Erzeugung: mittlere Satzlänge (Satz bzw. bei Umformen/Satzbau die Lösung, ohne Übersetzen) und
 * Anteil der Auswahl-Aufgaben. Deutlich zu leicht: Satzlänge unter 75 % des Mindestwerts oder Auswahl mehr als 15
 * Prozentpunkte über dem Höchstanteil.
 */
export function niveauBefund(
  aufgaben: { art: string; satz?: string; loesungen?: string[]; teile?: string[] }[],
  ziel: CefrLevel
): NiveauBefund {
  const v = niveauVorgabe(ziel)
  const saetze = aufgaben
    .filter((x) => x.art !== 'uebersetzen' && x.art !== 'tabelle' && x.art !== 'bestimmen')
    .map((x) => (x.art === 'satzbau' ? (x.teile ?? []).join(' ') || x.loesungen?.[0] : x.satz || x.loesungen?.[0]) ?? '')
    .filter((t) => t.trim())
  const mittlereLaenge = saetze.length ? saetze.reduce((s, t) => s + woerterIn(t), 0) / saetze.length : 0
  const auswahlAnteil = aufgaben.length ? aufgaben.filter((x) => x.art === 'auswahl' || x.art === 'mehrfach').length / aufgaben.length : 0
  const zuKurz = saetze.length >= 5 && mittlereLaenge < v.satz[0] * 0.75
  const zuVielAuswahl = aufgaben.length >= 8 && auswahlAnteil > v.auswahlHoechstens + 0.15
  const zuLeicht = zuKurz || zuVielAuswahl
  return {
    mittlereLaenge,
    auswahlAnteil,
    zuLeicht,
    hinweis: zuLeicht
      ? `wirkt für ${ziel} zu leicht: ${[
          zuKurz ? `Sätze im Schnitt ${Math.round(mittlereLaenge)} Wörter (erwartet ${v.satz[0]}–${v.satz[1]})` : '',
          zuVielAuswahl ? `${Math.round(auswahlAnteil * 100)} % Auswahl (höchstens ${Math.round(v.auswahlHoechstens * 100)} %)` : ''
        ]
          .filter(Boolean)
          .join(', ')} – vor dem Freigeben ansehen oder „+ Aufgaben" mit „anspruchsvoll"`
      : ''
  }
}

// ---------------------------------------------------------------- Alle Fremdsprachen (09.10.2026, Nachtrag der Lehrkraft)

/** Lernjahr der Lerngruppe in diesem Fach (Fremdsprachenfolge wie grammar.ts, NRW: 2. Fremdsprache ein Jahr später) */
export function lernjahrVon(a: Pick<NiveauAngaben, 'fach' | 'sprache' | 'jahrgang' | 'land'>): number {
  const fachId = fachKennung(a.fach, a.sprache)
  return learningYear(a.jahrgang, defaultSequence(fachId, a.jahrgang), a.land ?? '')
}

/**
 * Bekannte Grammatik nach Lernjahr aus dem Grammatikkatalog (alle Sprachen): Themen, die in einem FRÜHEREN Lernjahr
 * eingeführt werden – so streng wie zu Beginn des Schuljahres (wie bei Englisch ohne Lehrwerk-Stand).
 */
export function bekanntNachLernjahr(a: Pick<NiveauAngaben, 'fach' | 'sprache' | 'jahrgang' | 'land'>): string[] {
  const fachId = fachKennung(a.fach, a.sprache)
  const folge = defaultSequence(fachId, a.jahrgang)
  const lj = learningYear(a.jahrgang, folge, a.land ?? '')
  return GRAMMAR_TOPICS.filter((t) => t.subject === fachId && t.scale === 'lernjahr' && topicStart(t, folge) < lj).map((t) => t.id)
}

/**
 * Sprachen ohne erfasste Zeitform-Prüfung (Polnisch, Türkisch …): die Regel aus dem Katalog – bekannte Verbformen und
 * die, die erst später kommen.
 */
export function katalogFormenRegel(a: Pick<NiveauAngaben, 'fach' | 'sprache' | 'jahrgang' | 'land'>, themenIds: string[] = []): string {
  const fachId = fachKennung(a.fach, a.sprache)
  const folge = defaultSequence(fachId, a.jahrgang)
  const lj = learningYear(a.jahrgang, folge, a.land ?? '')
  const verben = GRAMMAR_TOPICS.filter((t) => t.subject === fachId && t.scale === 'lernjahr' && /\.(verb|form)\./.test(t.id))
  if (!verben.length) return ''
  const bekannt = verben.filter((t) => topicStart(t, folge) < lj || themenIds.includes(t.id))
  const spaeter = verben.filter((t) => !bekannt.includes(t))
  return [
    `BEKANNTE GRAMMATIK – STRIKT (Lernjahr ${lj}): bekannt sind ${bekannt.map((t) => t.label).join('; ') || 'nur die Grundformen'} – dazu das Thema selbst.`,
    spaeter.length ? `VERBOTEN in Sätzen, Lösungen und Beispielen (erst später): ${spaeter.map((t) => t.label).join('; ')}.` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Latein: Vorgaben je Lernjahr statt GER (Satzlänge, Konstruktionen, Textnähe) */
const LATEIN_STUFEN: { satz: [number, number]; text: string[] }[] = [
  { satz: [3, 7], text: ['kurze Hauptsätze, Einzelformen mit wenigen Merkmalen', 'Wortschatz der ersten Lektionen; Mehrdeutigkeiten nur, wo behandelt'] },
  {
    satz: [5, 10],
    text: ['Hauptsätze und einfache Satzgefüge (cum, quod, postquam, dum); AcI', 'Formen mit typischen Mehrdeutigkeiten gezielt; Tabellen nicht trivial (wenige Vorgaben)']
  },
  {
    satz: [7, 14],
    text: [
      'Satzgefüge mit Relativ-, Konjunktiv- und Partizipialkonstruktionen (PC, Abl. abs.), an Originaltexte angelehnt',
      'Bestimmen im Satzzusammenhang statt Einzelformen; Übersetzen mit Kasusfunktionen und Zeitverhältnis'
    ]
  },
  {
    satz: [10, 18],
    text: [
      'adaptierte oder originale Sätze (Caesar, Nepos, Ovid, Cicero), Satzperioden mit mehreren Konstruktionen',
      'Transfer: Konstruktionen erkennen, auflösen und angemessen übersetzen; kaum isolierte Formenaufgaben'
    ]
  }
]

/** Niveau-Regel für Latein nach Lernjahr; „grundlegend/anspruchsvoll" verschiebt um ein Lernjahr */
export function lateinNiveauRegel(a: Pick<NiveauAngaben, 'fach' | 'sprache' | 'jahrgang' | 'land'>, schwierigkeit?: Schwierigkeit | string): string {
  const lj = lernjahrVon({ ...a, fach: a.fach || 'Latein' })
  const d = schwierigkeit === 'grundlegend' ? -1 : schwierigkeit === 'anspruchsvoll' ? 1 : 0
  const ziel = Math.max(1, Math.min(LATEIN_STUFEN.length, lj + d))
  const v = LATEIN_STUFEN[ziel - 1]
  return [
    `NIVEAU – VERBINDLICH (Latein): Klasse ${a.jahrgang}, ${lj}. Lernjahr${d ? `; gewünscht „${schwierigkeit}" – Aufgaben wie im ${ziel}. Lernjahr` : ''}.`,
    `- Lateinische Sätze meist ${v.satz[0]}–${v.satz[1]} Wörter.`,
    ...v.text.map((x) => `- ${x}`),
    '- Keine trivialen Aufgaben; Ablenker sind echte Verwechslungen (Endungen, Lesarten), keine unsinnigen Formen.'
  ].join('\n')
}
