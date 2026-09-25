/**
 * Katalog der Aufgabenformate für Klassenarbeiten.
 *
 * Englisch folgt den Kompetenzbereichen der KMK-Bildungsstandards für die erste Fremdsprache
 * (Hör-/Hörsehverstehen, Leseverstehen, Sprechen, Schreiben, Sprachmittlung, Verfügung über
 * sprachliche Mittel). Geschichte hat keine KMK-Bildungsstandards für die Sekundarstufe I;
 * die Länder arbeiten mit demselben Grundmodell aus Sach-, Methoden-, Urteils- und
 * Urteilskompetenz, das hier abgebildet ist: Niedersachsen nennt Sach-, Methoden- und
 * Urteilskompetenz mit der narrativen Kompetenz als Oberziel, Nordrhein-Westfalen ergänzt die
 * Handlungskompetenz. Für das Abitur gelten die EPA Geschichte (KMK 2005) mit den Aufgabenarten
 * Quelleninterpretation, Erörterung von Deutungen und historische Darstellung.
 */
import type { ExamSubjectId } from './types'

export interface ExamFormat {
  id: string
  subject: ExamSubjectId
  /** Bezeichnung auf der Arbeit */
  label: string
  /** Kompetenzbereich, der geprüft wird */
  competence: string
  /** Was die Lernenden tun – erscheint als Erklärung in der Auswahl */
  description: string
  /** Schwerpunkt der Anforderungsbereiche */
  afb: ('I' | 'II' | 'III')[]
  /** Üblicher Anteil an der Gesamtpunktzahl in Prozent */
  share: number
  /** Jahrgangsspanne, in der das Format üblich ist */
  grades: [number, number]
  /** Braucht Material (Text, Quelle, Hörtext, Bild) */
  material: 'text' | 'audio' | 'image' | 'data' | 'none'
  /** Hinweis für die Lehrkraft */
  note?: string
  /**
   * Produktiver Teil: Die Lernenden schreiben einen eigenen Text, die Bewertung teilt sich
   * in Inhalt und Sprache (üblich 40 : 60).
   */
  productive?: boolean
  /**
   * Punkte, die dieser Teil für sich hat; aus ihnen ergibt sich die Teilnote.
   * 0 bedeutet: Der Teil wird nicht über Punkte bewertet, sondern über die Aufteilung
   * in Inhalt und Sprache (Schreiben, Sprachmittlung).
   */
  defaultPoints?: number
}

export const EXAM_FORMATS: ExamFormat[] = [
  // ---------- Englisch ----------
  {
    id: 'en-listening',
    subject: 'englisch',
    label: 'Listening comprehension',
    competence: 'Hör-/Hörsehverstehen',
    description:
      'Ein Hörtext (Interview, Durchsage, Gespräch) wird zweimal abgespielt; dazu Ankreuz-, Zuordnungs- und Tabellenaufgaben, die während des Hörens lösbar sind.',
    afb: ['I', 'II'],
    share: 15,
    grades: [5, 13],
    material: 'audio',
    defaultPoints: 21,
    note: 'Während des Hörens keine zusammenhängenden Texte schreiben lassen.'
  },
  {
    id: 'en-reading',
    subject: 'englisch',
    label: 'Reading comprehension',
    competence: 'Leseverstehen',
    description:
      'Ein unbekannter Text auf dem Niveau der Lerngruppe mit Aufgaben zum Global- und Detailverstehen: richtig/falsch mit Textbeleg, Multiple Choice, Überschriften zuordnen, kurze Antworten.',
    afb: ['I', 'II'],
    share: 25,
    grades: [5, 13],
    material: 'text',
    defaultPoints: 21
  },
  {
    id: 'en-mediation',
    subject: 'englisch',
    label: 'Mediation',
    competence: 'Sprachmittlung',
    description:
      'Ein deutscher Gebrauchstext wird sinngemäß und adressatengerecht in die Zielsprache übertragen – als situierte Schreibaufgabe mit Adressat, Textsorte und Zweck.',
    afb: ['II', 'III'],
    share: 20,
    grades: [6, 13],
    material: 'text',
    defaultPoints: 0,
    productive: true,
    note: 'Keine Übersetzung; Adressat, Textsorte und inhaltlicher Fokus sind vorgegeben.'
  },
  {
    id: 'en-writing',
    subject: 'englisch',
    label: 'Writing',
    competence: 'Schreiben',
    description:
      'Eine situierte Schreibaufgabe (E-Mail, Artikel, Blogbeitrag, Rede) mit Adressat, Zweck und Gliederungspunkten; bewertet nach Inhalt, Textsortenmerkmalen und Sprache.',
    afb: ['II', 'III'],
    share: 35,
    grades: [5, 13],
    material: 'none',
    defaultPoints: 0,
    productive: true
  },
  {
    id: 'en-language',
    subject: 'englisch',
    label: 'Use of English',
    competence: 'Verfügung über sprachliche Mittel',
    description:
      'Wortschatz und Grammatik im Zusammenhang: Lückentext, Wortbildung, Satzumformung, Zeiten im Kontext – immer eingebettet, nie als isolierte Einzelsätze.',
    afb: ['I', 'II'],
    share: 20,
    grades: [5, 10],
    material: 'text',
    defaultPoints: 20
  },
  {
    id: 'en-grammar',
    subject: 'englisch',
    label: 'Grammatik im Kontext',
    competence: 'Verfügung über sprachliche Mittel',
    description: 'Ein festgelegtes Grammatikthema wird in einem zusammenhängenden Text geprüft: erkennen, ergänzen, umformen und in eigenen Sätzen anwenden.',
    afb: ['I', 'II'],
    share: 20,
    grades: [5, 11],
    material: 'text',
    defaultPoints: 20,
    note: 'Das Thema wird im Rahmen der Arbeit festgelegt; geprüft wird im Text, nicht in Einzelsätzen.'
  },
  {
    id: 'en-speaking',
    subject: 'englisch',
    label: 'Speaking (Ersatz für eine schriftliche Arbeit)',
    competence: 'Sprechen',
    description: 'Paar- oder Gruppenprüfung: Monolog (Bildimpuls, Kurzvortrag) und Dialog (Diskussion, Rollenspiel) mit Bewertungsraster.',
    afb: ['II', 'III'],
    share: 100,
    grades: [5, 13],
    material: 'image',
    defaultPoints: 30,
    note: 'In den meisten Ländern kann eine Klassenarbeit pro Schuljahr durch eine Sprechprüfung ersetzt werden.'
  },
  // ---------- Geschichte ----------
  {
    id: 'ge-knowledge',
    subject: 'geschichte',
    label: 'Grundwissen',
    competence: 'Sachkompetenz',
    description: 'Begriffe erklären, Daten und Ereignisse zuordnen, eine Zeitleiste ergänzen, Zusammenhänge in eigenen Worten wiedergeben.',
    afb: ['I'],
    share: 25,
    grades: [5, 13],
    material: 'none'
  },
  {
    id: 'ge-source',
    subject: 'geschichte',
    label: 'Quellenanalyse (Textquelle)',
    competence: 'Methodenkompetenz',
    description: 'Eine Textquelle wird eingeordnet (Verfasser, Zeit, Textsorte, Adressat), der Inhalt herausgearbeitet und die Absicht gedeutet.',
    afb: ['I', 'II'],
    share: 40,
    grades: [6, 13],
    material: 'text',
    note: 'Vollständige Quellenangabe und Zeilennummern; Quelle und Darstellung klar unterscheiden.'
  },
  {
    id: 'ge-cartoon',
    subject: 'geschichte',
    label: 'Karikaturanalyse',
    competence: 'Methodenkompetenz',
    description: 'Erst genau beschreiben, dann Symbole und Überzeichnungen deuten, zuletzt Aussage und Absicht beurteilen.',
    afb: ['I', 'II', 'III'],
    share: 35,
    grades: [7, 13],
    material: 'image'
  },
  {
    id: 'ge-image',
    subject: 'geschichte',
    label: 'Bildquelle oder Plakat',
    competence: 'Methodenkompetenz',
    description: 'Ein Gemälde, Foto oder Plakat wird beschrieben, in seinen Entstehungszusammenhang eingeordnet und auf seine Wirkung hin untersucht.',
    afb: ['I', 'II'],
    share: 30,
    grades: [5, 13],
    material: 'image'
  },
  {
    id: 'ge-data',
    subject: 'geschichte',
    label: 'Statistik oder Diagramm auswerten',
    competence: 'Methodenkompetenz',
    description: 'Zahlenmaterial beschreiben, Auffälligkeiten mit Werten belegen und historisch erklären.',
    afb: ['I', 'II'],
    share: 25,
    grades: [7, 13],
    material: 'data'
  },
  {
    id: 'ge-comparison',
    subject: 'geschichte',
    label: 'Vergleich',
    competence: 'Urteilskompetenz',
    description:
      'Zwei Quellen, Positionen oder Epochen werden unter festgelegten Gesichtspunkten verglichen; Gemeinsamkeiten und Unterschiede werden gewichtet.',
    afb: ['III'],
    share: 30,
    grades: [8, 13],
    material: 'text',
    note: 'In Geschichte zählt „vergleichen“ zum Anforderungsbereich III.'
  },
  {
    id: 'ge-judgement',
    subject: 'geschichte',
    label: 'Urteilsaufgabe',
    competence: 'Urteilskompetenz',
    description:
      'Ein Sachurteil (historisch einordnen) oder Werturteil (mit offengelegten Maßstäben bewerten) auf Grundlage des Materials, mit Begründung und Gegenargument.',
    afb: ['III'],
    share: 30,
    grades: [7, 13],
    material: 'none'
  },
  {
    id: 'ge-narrative',
    subject: 'geschichte',
    label: 'Darstellungstext verfassen',
    competence: 'Narrative Kompetenz',
    description:
      'Einen zusammenhängenden Text schreiben (Erklärtext, Bericht, historische Argumentation), der Fachbegriffe nutzt und Zusammenhänge herstellt – in den EPA die Aufgabenart „Darstellen historischer Sachverhalte“.',
    afb: ['II', 'III'],
    share: 30,
    grades: [6, 13],
    material: 'none'
  },
  {
    id: 'ge-action',
    subject: 'geschichte',
    label: 'Handlungsaufgabe',
    competence: 'Handlungskompetenz',
    description:
      'Begründet Position beziehen zu einer historischen Sachfrage oder zur Geschichtskultur – z. B. Leserbrief, Beitrag zur Gedenktagsdebatte, Stellungnahme zu einem Denkmal.',
    afb: ['III'],
    share: 25,
    grades: [8, 13],
    material: 'none',
    note: 'In Nordrhein-Westfalen als eigene Überprüfungsform im Kernlehrplan ausgewiesen.'
  }
]

export const formatsFor = (subject: ExamSubjectId, grade: number): ExamFormat[] =>
  EXAM_FORMATS.filter((f) => f.subject === subject && grade >= f.grades[0] && grade <= f.grades[1])

export const formatById = (id: string): ExamFormat | undefined => EXAM_FORMATS.find((f) => f.id === id)

/**
 * Anteil des Schreibteils an der Arbeit. In Niedersachsen erhält der Schreibteil eine
 * eigenständige Note; üblich sind 60 % in Klasse 5 und 70 % ab Klasse 6.
 */
export const writingWeightFor = (grade: number): number => (grade <= 5 ? 60 : 70)

/** Übliche Aufteilung eines produktiven Teils in Inhalt und Sprache */
export const CONTENT_SHARE = 40

/**
 * Setzt die Anteile nach der Regel des Landes: In den Fremdsprachen trägt der Schreibteil
 * 70 % (Klasse 5: 60 %), die übrigen geprüften Kompetenzen teilen sich den Rest.
 * Gibt es keinen Schreibteil, teilen sich alle Teile die 100 % gleichmäßig.
 */
export function defaultWeights(subject: ExamSubjectId, grade: number, parts: { formatId: string; gradeGroup: 'writing' | 'other' }[]): number[] {
  if (!parts.length) return []
  if (subject !== 'englisch') {
    const shares = parts.map((p) => formatById(p.formatId)?.share ?? 1)
    const total = shares.reduce((n, x) => n + x, 0)
    let rest = 100
    return shares.map((sh, i) => {
      const w = i === shares.length - 1 ? rest : Math.round((100 * sh) / total)
      rest -= w
      return w
    })
  }
  const writingIdx = parts.map((p, i) => (p.gradeGroup === 'writing' ? i : -1)).filter((i) => i >= 0)
  const otherIdx = parts.map((p, i) => (p.gradeGroup === 'writing' ? -1 : i)).filter((i) => i >= 0)
  if (!writingIdx.length || !otherIdx.length) {
    // Nur eine Sorte Teile: gleichmäßig aufteilen
    const even = Math.floor(100 / parts.length)
    return parts.map((_, i) => (i === parts.length - 1 ? 100 - even * (parts.length - 1) : even))
  }
  const writingTotal = writingWeightFor(grade)
  const otherTotal = 100 - writingTotal
  const out = new Array(parts.length).fill(0)
  const spread = (idx: number[], total: number): void => {
    let rest = total
    idx.forEach((pos, k) => {
      const w = k === idx.length - 1 ? rest : Math.round(total / idx.length)
      out[pos] = w
      rest -= w
    })
  }
  spread(writingIdx, writingTotal)
  spread(otherIdx, otherTotal)
  return out
}

export interface SuggestedPart {
  formatId: string
  weight: number
  minutes: number
  gradeGroup: 'writing' | 'other'
  contentShare?: number
}

/**
 * Vorschlag für den Aufbau einer Arbeit.
 *
 * Englisch: In der Regel werden genau zwei Kompetenzen geprüft – eine rezeptive oder die
 * Sprachmittlung und dazu das Schreiben. Der Schreibteil trägt 60 % (Klasse 5) bzw. 70 %.
 * Geschichte: die üblichen Teile des Fachs, gleichmäßig nach ihrem Anteil verteilt.
 */
export function suggestParts(
  subject: ExamSubjectId,
  grade: number,
  points: number,
  minutes: number
): { formatId: string; points: number; minutes: number; weight: number; gradeGroup: 'writing' | 'other'; contentShare?: number }[] {
  if (subject === 'englisch') {
    // Jeder Teil hat eigene Punkte; daraus entsteht seine Teilnote. Erst die Teilnoten
    // werden nach ihrem Anteil (30 : 70 bzw. 40 : 60 in Klasse 5) zur Gesamtnote verrechnet.
    const writing = writingWeightFor(grade)
    const other = 100 - writing
    const otherFormat = grade <= 7 ? 'en-reading' : 'en-mediation'
    const otherDef = formatById(otherFormat)
    const writingDef = formatById('en-writing')
    const otherMinutes = Math.round((minutes * other) / 100)
    return [
      {
        formatId: otherFormat,
        weight: other,
        points: otherDef?.defaultPoints ?? 0,
        minutes: otherMinutes,
        gradeGroup: 'other',
        ...(otherDef?.productive ? { contentShare: CONTENT_SHARE } : {})
      },
      {
        formatId: 'en-writing',
        weight: writing,
        points: writingDef?.defaultPoints ?? 0,
        minutes: minutes - otherMinutes,
        gradeGroup: 'writing',
        contentShare: CONTENT_SHARE
      }
    ]
  }
  // Geschichte: eine Note, die Punkte werden auf die Teile verteilt
  const ids = grade <= 7 ? ['ge-knowledge', 'ge-source', 'ge-judgement'] : ['ge-source', 'ge-comparison', 'ge-judgement']
  const chosen = ids.map((id) => formatById(id)!).filter(Boolean)
  const total = chosen.reduce((n, f) => n + f.share, 0)
  let restMinutes = minutes
  let restWeight = 100
  let restPoints = points
  return chosen.map((f, i) => {
    const last = i === chosen.length - 1
    const weight = last ? restWeight : Math.round((100 * f.share) / total)
    const min = last ? restMinutes : Math.round((minutes * f.share) / total)
    const pts = last ? restPoints : Math.round((points * f.share) / total)
    restWeight -= weight
    restMinutes -= min
    restPoints -= pts
    return { formatId: f.id, weight, points: pts, minutes: min, gradeGroup: 'other' as const, ...(f.productive ? { contentShare: CONTENT_SHARE } : {}) }
  })
}
