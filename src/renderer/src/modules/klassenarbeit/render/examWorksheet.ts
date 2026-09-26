/**
 * Die Klassenarbeit als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt schon gelöst.
 * Statt das alles zu wiederholen, wird die Arbeit in dieselbe Struktur übersetzt: ein Blatt
 * mit einem Kopfbaustein (Zeit, Hilfsmittel, Notenschlüssel), je Teil einer Überschrift und
 * den erzeugten Bausteinen.
 */
import { newId } from '../../vokabeltest/model/random'
import type { Sheet, Worksheet, WsBlock } from '../../arbeitsblatt/model/types'
import { worksheetMetaFor } from '../generation/generateExam'
import { translateAids } from '../model/aids'
import { gradeScaleGroups, gradeScaleLine } from '../model/examRules'
import { CONTENT_SHARE, formatById } from '../model/formats'
import type { Exam } from '../model/types'
import { fassungsLabel, fassungsZahl, teileDerFassung } from '../model/fassungen'
import { examGrades, examPoints } from '../model/types'

/**
 * Kopfkasten der Arbeit: Zeit, Hilfsmittel und Bewertung.
 * In den Fremdsprachen steht er in der Zielsprache, damit die Arbeit einsprachig bleibt.
 * Ein Notenschlüssel erscheint nur, wenn es EINE Note gibt – bei getrennten Teilnoten
 * gälte er nur für einen Teil und würde eher verwirren.
 */
export function examHeadBlock(exam: Exam): WsBlock | null {
  const m = exam.meta
  if (!m.infoBox) return null
  const english = m.subjectId === 'englisch'
  const grades = examGrades(exam)
  const t = english
    ? {
        title: 'Test',
        time: (min: number) => `Time: ${min} minutes`,
        aids: (a: string) => `You may use: ${a || 'nothing'}`,
        points: (n: number) => `${n} points`,
        split: (c: number, l: number) => `${c} % content, ${l} % language`,
        counts: (w: number) => `counts ${w} %`,
        scale: (line: string) => `Marks: ${line}`,
        labels: { writing: 'Writing', other: 'Other skills' }
      }
    : {
        title: 'Klassenarbeit',
        time: (min: number) => `Bearbeitungszeit: ${min} Minuten`,
        aids: (a: string) => `Erlaubte Hilfsmittel: ${a || 'keine'}`,
        points: (n: number) => `${n} Punkte`,
        split: (c: number, l: number) => `${c} % Inhalt, ${l} % Sprache`,
        counts: (w: number) => `zählt ${w} %`,
        scale: (line: string) => `Notenschlüssel: ${line}`,
        labels: { writing: 'Schreiben', other: 'Weitere Kompetenzen' }
      }
  const lines = [
    t.time(m.minutes),
    t.aids(translateAids(m.aids, english ? 'en' : 'de')),
    ...grades.map((g) => {
      const label = g.group === 'writing' ? t.labels.writing : t.labels.other
      const value = g.points > 0 ? t.points(g.points) : t.split(CONTENT_SHARE, 100 - CONTENT_SHARE)
      return `${label}: ${value} – ${t.counts(g.weight)}`
    }),
    // Nur bei einer einzigen Note sinnvoll
    // Nur auf ausdrücklichen Wunsch: Der Schlüssel steht sonst allein im Erwartungshorizont
    ...(m.gradeScale ? gradeScaleGroups(exam).map((g) => t.scale(`${g.label ? `${g.label}: ` : ''}${gradeScaleLine(g.points, m.gradeScaleThresholds)}`)) : [])
  ]
  return {
    id: 'exam-head',
    type: 'infoBox',
    variant: 'wissen',
    title: m.title || t.title,
    body: lines.map((l) => `- ${l}`).join('\n')
  }
}

/**
 * Übersetzt die Arbeit in ein Arbeitsblatt, das sich anzeigen und exportieren lässt.
 *
 * `fassung` wählt bei A/B-Arbeiten die Fassung (0 = A). Sie steht dann oben auf dem Blatt –
 * im Titel des Kopfkastens bzw., ohne Kopfkasten, als eigene Zeile –, damit jedes Blatt
 * sagt, welche Fassung es ist.
 */
export function examToWorksheet(exam: Exam, fassung = 0): Worksheet {
  const meta = worksheetMetaFor(exam)
  const english = exam.meta.subjectId === 'englisch'
  const gesamt = fassungsZahl(exam)
  const f = Math.min(Math.max(0, fassung), gesamt - 1)
  const label = fassungsLabel(f, gesamt)
  const gruppe = label ? `${english ? 'Group' : 'Gruppe'} ${label}` : ''
  const head = examHeadBlock(exam)
  const kopf: WsBlock[] = head ? [gruppe && head.type === 'infoBox' ? { ...head, title: `${head.title} – ${gruppe}` } : head] : []
  if (!head && gruppe) kopf.push({ id: 'exam-gruppe', type: 'divider', title: gruppe })
  const blocks: WsBlock[] = kopf
  teileDerFassung(exam, f).forEach((part, i) => {
    const format = formatById(part.formatId)
    // Überschrift der Teile in der Sprache des Faches
    const points = part.points > 0 ? ` (${part.points} ${english ? 'points' : 'Punkte'})` : ''
    blocks.push({ id: `part-${part.id}`, type: 'divider', title: `${english ? 'Part' : 'Teil'} ${i + 1}: ${format?.label ?? part.label}${points}` })
    blocks.push(...part.blocks.map((b) => ({ ...b, id: b.id || newId() })))
  })
  // Fassung A behält die bisherige Blattkennung – so bleibt alles gültig, was sich darauf bezieht
  const sheet: Sheet = { id: f === 0 ? 'exam' : `exam-${label.toLowerCase()}`, label: label ? `Fassung ${label}` : 'Klassenarbeit', blocks }
  return {
    version: 1,
    meta: {
      ...meta,
      // Kopf in der Sprache des Faches
      title: exam.meta.title || (exam.meta.subjectId === 'englisch' ? 'English test' : `Klassenarbeit ${exam.meta.subjectLabel}`),
      subjectLabel: exam.meta.subjectId === 'englisch' ? 'English' : exam.meta.subjectLabel,
      labelLanguage: exam.meta.subjectId === 'englisch' ? ('en' as const) : ('de' as const),
      // Der Lösungsteil einer Klassenarbeit ist der Erwartungshorizont – auch im Kopf
      loesungsBegriff: 'Erwartungshorizont',
      // Fachfarbe oder Vorlagenfarbe – gilt für Arbeit und Erwartungshorizont gleichermaßen
      vorlagenfarbe: exam.meta.vorlagenfarbe,
      pages: Math.max(1, Math.ceil(blocks.length / 6)),
      // Im Erwartungshorizont steht der Schlüssel immer – aber nur für Teile mit Punkten
      gradeScale: { thresholds: exam.meta.gradeScaleThresholds, groups: gradeScaleGroups(exam) }
    },
    // Auf einer Klassenarbeit tragen die Lernenden Name, Klasse und Datum ein
    design: { ...exam.design, header: { ...exam.design.header, fields: { name: true, class: true, date: true } } },
    outline: null,
    sheets: [sheet],
    sources: [],
    createdAt: exam.createdAt
  }
}

/**
 * Alle Fassungen in EINEM Dokument – je Fassung ein Blatt (wie `kurztestToWorksheetAlle`).
 * Gedacht zum Ausdrucken in einem Zug; jedes Blatt trägt seinen Gruppenbuchstaben selbst.
 */
export function examToWorksheetAlle(exam: Exam): Worksheet {
  const erste = examToWorksheet(exam, 0)
  const sheets = Array.from({ length: fassungsZahl(exam) }, (_, f) => (f === 0 ? erste.sheets[0] : examToWorksheet(exam, f).sheets[0]))
  return { ...erste, sheets }
}

/** Sind schon Aufgaben erzeugt? */
export const examHasContent = (exam: Exam): boolean => exam.parts.some((p) => p.blocks.length > 0)

/** Punkte der ganzen Arbeit, soweit über Punkte bewertet wird. */
export const examTotalPoints = (exam: Exam): number => examPoints(exam)
