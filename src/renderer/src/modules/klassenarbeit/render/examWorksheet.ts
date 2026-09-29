/**
 * Die Klassenarbeit als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt schon gelöst.
 * Statt das alles zu wiederholen, wird die Arbeit in dieselbe Struktur übersetzt: ein Blatt
 * mit einem Kopfbaustein (Zeit, Hilfsmittel, Notenschlüssel), je Teil einer Überschrift und
 * den erzeugten Bausteinen.
 */
import { nachweisFuer } from '../model/nachweise'
import { eigeneTeilnoteLabel, istAlteSprache } from '../model/faecher'
import { fachDerArbeit, inhaltsanteil, zweiterTeil } from '../model/faecher'
import { platziereKopfUndSchluss } from '../../arbeitsblatt/generation/illustrationen'
import { newId } from '../../vokabeltest/model/random'
import type { Sheet, Worksheet, WsBlock } from '../../arbeitsblatt/model/types'
import { upperSecondary, worksheetMetaFor } from '../generation/generateExam'
import { translateAids } from '../model/aids'
import { gradeScaleGroups, scaleLineFuer } from '../model/examRules'
import { notenpunkteFuer } from '../../../shared/notenpunkte'
import { formatById } from '../model/formats'
import type { Exam } from '../model/types'
import { fassungsLabel, fassungsZahl, teileDerFassung } from '../model/fassungen'
import { operatorenBlock } from '../didactics/operatorenliste'
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
  const fach = fachDerArbeit(m.subjectId)
  const english = fach.sprache === 'en'
  const grades = examGrades(exam)
  const t =
    fach.sprache === 'fr'
      ? {
          title: 'Contrôle',
          time: (min: number) => `Durée : ${min} minutes`,
          aids: (a: string) => `Documents autorisés : ${a || 'aucun'}`,
          points: (n: number) => `${n} points`,
          split: (c: number, l: number) => `${c} % contenu, ${l} % langue`,
          counts: (w: number) => `compte pour ${w} %`,
          scale: (line: string) => `Barème : ${line}`,
          labels: { writing: 'Production écrite', other: 'Autres compétences' }
        }
      : fach.sprache === 'it'
        ? {
            title: 'Verifica',
            time: (min: number) => `Tempo: ${min} minuti`,
            aids: (a: string) => `Materiale consentito: ${a || 'nessuno'}`,
            points: (n: number) => `${n} punti`,
            split: (c: number, l: number) => `${c} % contenuto, ${l} % lingua`,
            counts: (w: number) => `conta ${w} %`,
            scale: (line: string) => `Voti: ${line}`,
            labels: {
              writing: 'Produzione scritta',
              other: 'Altre competenze'
            }
          }
        : fach.sprache === 'ru'
          ? {
              title: 'Контрольная работа',
              time: (min: number) => `Время: ${min} минут`,
              aids: (a: string) => `Разрешено: ${a || 'ничего'}`,
              points: (n: number) => `${n} баллов`,
              split: (c: number, l: number) => `${c} % содержание, ${l} % язык`,
              counts: (w: number) => `составляет ${w} %`,
              scale: (line: string) => `Оценки: ${line}`,
              labels: { writing: 'Письмо', other: 'Другие компетенции' }
            }
          : fach.sprache === 'es'
            ? {
                title: 'Examen',
                time: (min: number) => `Tiempo: ${min} minutos`,
                aids: (a: string) => `Material permitido: ${a || 'ninguno'}`,
                points: (n: number) => `${n} puntos`,
                split: (c: number, l: number) => `${c} % contenido, ${l} % lengua`,
                counts: (w: number) => `cuenta ${w} %`,
                scale: (line: string) => `Notas: ${line}`,
                labels: {
                  writing: 'Expresión escrita',
                  other: 'Otras competencias'
                }
              }
            : english
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
                  split: (c: number, l: number) => `${c} % Inhalt, ${l} % ${zweiterTeil(m.subjectId)}`,
                  counts: (w: number) => `zählt ${w} %`,
                  scale: (line: string) => `Notenschlüssel: ${line}`,
                  labels: {
                    writing: eigeneTeilnoteLabel(m.subjectId),
                    other: istAlteSprache(m.subjectId) ? 'Begleitaufgaben' : 'Weitere Kompetenzen'
                  }
                }
  const lines = [
    t.time(m.minutes),
    t.aids(translateAids(m.aids, fach.sprache)),
    ...grades.map((g) => {
      const value = g.points > 0 ? t.points(g.points) : t.split(inhaltsanteil(m.subjectId), 100 - inhaltsanteil(m.subjectId))
      // Eine einzige Note (Deutsch, Sachfächer): „Gesamt: 60 Punkte" statt „Weitere Kompetenzen … zählt 100 %"
      if (grades.length === 1) return `${fach.sprache === 'de' ? 'Gesamt' : 'Total'}: ${value}`
      const label = g.group === 'writing' ? t.labels.writing : t.labels.other
      return `${label}: ${value} – ${t.counts(g.weight)}`
    }),
    // Nur bei einer einzigen Note sinnvoll
    // Nur auf ausdrücklichen Wunsch: Der Schlüssel steht sonst allein im Erwartungshorizont
    ...(m.gradeScale ? gradeScaleGroups(exam).map((g) => t.scale(`${g.label ? `${g.label}: ` : ''}${scaleLineFuer(m, g.points)}`)) : [])
  ]
  return {
    id: 'exam-head',
    type: 'infoBox',
    variant: 'wissen',
    title: m.title || t.title,
    // Von Hand geänderter Wortlaut hat Vorrang (27.09.2026); leer = aus den Angaben berechnet
    body: m.kopfText?.trim() ? m.kopfText : lines.map((l) => `- ${l}`).join('\n')
  }
}

/**
 * Übersetzt die Arbeit in ein Arbeitsblatt, das sich anzeigen und exportieren lässt.
 *
 * `fassung` wählt bei A/B-Arbeiten die Fassung (0 = A). Sie steht dann oben auf dem Blatt –
 * im Titel des Kopfkastens bzw., ohne Kopfkasten, als eigene Zeile –, damit jedes Blatt
 * sagt, welche Fassung es ist.
 */
/** Arbeiten bekommen nur Kopf und Schluss eine Figur (26.09.2026) */
export function examToWorksheet(exam: Exam, fassung = 0): Worksheet {
  return platziereKopfUndSchluss(examToWorksheetOhneIllustration(exam, fassung))
}

function examToWorksheetOhneIllustration(exam: Exam, fassung = 0): Worksheet {
  const meta = worksheetMetaFor(exam)
  const kopfText = fachDerArbeit(exam.meta.subjectId).kopf
  const gesamt = fassungsZahl(exam)
  const f = Math.min(Math.max(0, fassung), gesamt - 1)
  const label = fassungsLabel(f, gesamt)
  const gruppe = label ? `${kopfText.gruppe} ${label}` : ''
  const head = examHeadBlock(exam)
  const kopf: WsBlock[] = head ? [gruppe && head.type === 'infoBox' ? { ...head, title: `${head.title} – ${gruppe}` } : head] : []
  if (!head && gruppe) kopf.push({ id: 'exam-gruppe', type: 'divider', title: gruppe })
  const blocks: WsBlock[] = kopf
  teileDerFassung(exam, f).forEach((part, i) => {
    const format = formatById(part.formatId)
    // Überschrift der Teile in der Sprache des Faches
    const points = part.points > 0 ? ` (${part.points} ${kopfText.punkte})` : ''
    blocks.push({
      id: `part-${part.id}`,
      type: 'divider',
      title: `${kopfText.teil} ${i + 1}: ${format?.label ?? part.label}${points}`
    })
    blocks.push(...part.blocks.map((b) => ({ ...b, id: b.id || newId() })))
  })
  /*
   * Oberstufe: keine Schreiblinien unter Schreibaufgaben (Befund der Lehrkraft vom 27.09.2026) –
   * geschrieben wird auf eigenem Papier, und die Auffüllung bis zum Seitenende entfällt damit.
   */
  const bloecke: WsBlock[] = upperSecondary(exam.meta)
    ? blocks.map((b) => (b.type === 'task' && b.answer.kind === 'lines' ? { ...b, answer: { ...b.answer, kind: 'none' as const } } : b))
    : blocks
  // Operatorenliste (27.09.2026) – DIREKT hinter der letzten Aufgabe, nicht hinter dem Material (Wunsch der Lehrkraft)
  const operatoren = operatorenBlock(exam)
  if (operatoren) {
    let letzteAufgabe = -1
    bloecke.forEach((b, k) => {
      if (b.type === 'task') letzteAufgabe = k
    })
    bloecke.splice(letzteAufgabe + 1, 0, operatoren)
  }
  // Fassung A behält die bisherige Blattkennung – so bleibt alles gültig, was sich darauf bezieht
  const sheet: Sheet = {
    id: f === 0 ? 'exam' : `exam-${label.toLowerCase()}`,
    label: label ? `Fassung ${label}` : 'Klassenarbeit',
    blocks: bloecke
  }
  return {
    version: 1,
    meta: {
      ...meta,
      // Kopf in der Sprache des Faches
      // Deutschsprachige Arbeiten heißen nach der Art des Leistungsnachweises (Schulaufgabe, Lernkontrolle …, model/nachweise.ts)
      title: exam.meta.title || (fachDerArbeit(exam.meta.subjectId).sprache === 'de' ? grossAnfang(`${exam.meta.nachweis ?? nachweisFuer(exam.meta).bezeichnung} ${fachDerArbeit(exam.meta.subjectId).label}`) : kopfText.titel),
      subjectLabel: fachDerArbeit(exam.meta.subjectId).art === 'fremdsprache' ? kopfText.fach : exam.meta.subjectLabel,
      labelLanguage: fachDerArbeit(exam.meta.subjectId).sprache,
      // Der Lösungsteil einer Klassenarbeit ist der Erwartungshorizont – auch im Kopf
      loesungsBegriff: 'Erwartungshorizont',
      // Fachfarbe oder Vorlagenfarbe – gilt für Arbeit und Erwartungshorizont gleichermaßen
      vorlagenfarbe: exam.meta.vorlagenfarbe,
      // Überthema im Kopf (Paket 11) – den Themenbereich setzt der Editor beim Anzeigen ein
      ueberthema: exam.meta.ueberthema,
      ueberthemaAus: exam.meta.ueberthemaAus,
      pages: Math.max(1, Math.ceil(blocks.length / 6)),
      // Im Erwartungshorizont steht der Schlüssel immer – aber nur für Teile mit Punkten
      gradeScale: {
        thresholds: exam.meta.gradeScaleThresholds,
        groups: gradeScaleGroups(exam),
        // Sekundarstufe II: Notenpunkte 0–15 nach dem Raster des Landes (26.09.2026)
        ...((r) => (r ? { punkte: { schwellen: r.schwellen, hinweis: r.hinweis } } : {}))(notenpunkteFuer(exam.meta))
      }
    },
    // Auf einer Klassenarbeit tragen die Lernenden Name, Klasse und Datum ein
    design: {
      ...exam.design,
      header: {
        ...exam.design.header,
        fields: { name: true, class: true, date: true }
      }
    },
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

/** Titel beginnen groß („schriftliche Lernkontrolle“ → „Schriftliche Lernkontrolle“) */
const grossAnfang = (s: string): string => s.charAt(0).toLocaleUpperCase('de') + s.slice(1)
