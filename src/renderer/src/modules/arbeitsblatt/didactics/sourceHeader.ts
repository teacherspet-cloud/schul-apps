/**
 * Der Materialkopf einer Quelle in Geschichte.
 *
 * Die EPA Geschichte macht dazu ungewöhnlich genaue Vorgaben (Abschnitt 3.3.3, wörtlich):
 *
 *   „Die Materialien sind entsprechend der wissenschaftlichen Zitierweise genau zu benennen.
 *    Sie sind am Rand mit einer Zeilenzählung zu versehen."
 *   „Kürzungen sind nur behutsam vorzunehmen und kenntlich zu machen. Dabei ist der
 *    authentische, geschlossene Sinnzusammenhang zu wahren."
 *   „Erläuterungen und Sacherklärungen sind so weit beizufügen, wie es zum Verständnis des
 *    Materials notwendig ist."
 *
 * Das ist mehr als Formalie. Eine Quelle ohne Urheber, Datum und Textsorte lässt sich nicht
 * analysieren: Genau diese Angaben braucht man, um die Standortgebundenheit zu beurteilen –
 * „Quellen verkörpern nicht ‚die historische Wahrheit', sondern sind subjektiv bedingte
 * Aussagen" (EPA Geschichte 3.2.2).
 *
 * WARUM EIN EIGENES FELD UND NICHT DER FREIE TEXT IN `source`:
 * Dort stand bisher alles in einer Zeile, von der KI frei formuliert. Weder ließ sich prüfen,
 * ob Urheber und Datum überhaupt dastehen, noch ließ sich der Kopf einheitlich setzen. Jetzt
 * sind die Angaben einzeln da – und es fällt auf, wenn eine fehlt.
 */
import type { Sheet, TextBlock, WorksheetMeta } from '../model/types'
import type { DidacticWarning } from './checks'

export interface SourceHeader {
  /** Wer die Quelle verfasst hat (Person, Amt, Zeitung …) */
  author: string
  /** Wann sie entstanden ist */
  date: string
  /** Gattung: Brief, Rede, Verordnung, Flugblatt, Tagebuch, Zeitungsartikel … */
  textType: string
  /** Fundstelle in wissenschaftlicher Zitierweise */
  found: string
}

/** Fächer, in denen Quellen einen eigenen Materialkopf bekommen. */
export const SOURCE_HEADER_SUBJECTS = ['geschichte', 'politik']

export const wantsSourceHeader = (meta: Pick<WorksheetMeta, 'subjectId'>): boolean => SOURCE_HEADER_SUBJECTS.includes(meta.subjectId)

/** Die vorhandenen Angaben als Zeile: „Verfasser, Textsorte, Datum". */
export function headerLine(h: Partial<SourceHeader> | undefined): string {
  if (!h) return ''
  return [h.author, h.textType, h.date]
    .map((t) => (t ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

/**
 * Was am Materialkopf fehlt.
 *
 * Absichtlich nur die drei Angaben, ohne die eine Quellenanalyse nicht geht. Die Fundstelle
 * prüft schon `completeOriginalSources` über den Wortlaut.
 */
export function missingHeaderParts(h: Partial<SourceHeader> | undefined): string[] {
  const fehlt: string[] = []
  if (!h?.author?.trim()) fehlt.push('Verfasser')
  if (!h?.date?.trim()) fehlt.push('Entstehungsdatum')
  if (!h?.textType?.trim()) fehlt.push('Textsorte')
  return fehlt
}

/**
 * Enthält der Text gekennzeichnete Kürzungen?
 *
 * Die EPA verlangt, Kürzungen „kenntlich zu machen" – üblich sind […] oder [...]. Geprüft
 * wird nicht, OB gekürzt wurde (das lässt sich nicht wissen), sondern ob die Kennzeichnung
 * die übliche Form hat, wenn gekürzt wurde.
 */
export const hasMarkedCuts = (body: string): boolean => /\[\s*(…|\.\.\.)\s*\]/.test(body)

/** Gilt der Baustein als Quelle (und nicht als Darstellung)? */
export function isSource(b: TextBlock): boolean {
  // Die App vergibt Quellen-Bausteinen einen Titel „Q1: …"; daran hängt auch die Zitatprüfung
  return /^Q\d*\s*:/.test(b.title.trim()) || Boolean(b.sourceHeader)
}

/**
 * Regelteil für den KI-Auftrag.
 *
 * Der wichtigste Satz ist die Unterscheidung: Ein Schulbuch- oder Sachtext ist in Geschichte
 * eine DARSTELLUNG, keine Quelle. „Quellen sind die Grundlagen unseres Wissens von der
 * Vergangenheit, nicht das Wissen selbst" (EPA Geschichte 3.2.1). Wer beides gleich
 * behandelt, nimmt der Quellenarbeit ihren Gegenstand.
 */
export function sourceHeaderRules(meta: Pick<WorksheetMeta, 'subjectId'>): string {
  if (!wantsSourceHeader(meta)) return ''
  return [
    'MATERIALKOPF BEI QUELLEN (EPA Geschichte 3.3.3):',
    '- Unterscheide Quelle und Darstellung. Eine QUELLE stammt aus der behandelten Zeit; ein Sach- oder Verfassertext ist eine DARSTELLUNG, also heutiges Wissen. Nur Quellen bekommen den Materialkopf.',
    '- Zu jeder Quelle gehören: Verfasser (Person, Amt, Zeitung), Entstehungsdatum, Textsorte (Brief, Rede, Verordnung, Flugblatt, Tagebuch, Zeitungsartikel …) und die Fundstelle in wissenschaftlicher Zitierweise.',
    '- Kürzungen werden mit […] kenntlich gemacht; der Sinnzusammenhang bleibt gewahrt.',
    '- Schwierige oder zeitgebundene Wörter kommen als Worterklärung in das Glossar des Bausteins, nicht in den Quellentext.',
    '- Quellenbausteine bekommen Zeilennummern (lineNumbers = true), damit sich Textbelege angeben lassen.'
  ].join('\n')
}

/**
 * Prüft die Materialköpfe der Quellen auf einem Blatt.
 *
 * Gemeldet wird nur, was sich lokal entscheiden lässt: ob die Angaben überhaupt dastehen.
 * Ob sie STIMMEN, kann die App nicht wissen – dafür gibt es die Zitatprüfung gegen die
 * Fundstelle und am Ende die Lehrkraft.
 */
export function checkSourceHeaders(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if (!wantsSourceHeader(meta)) return []
  const out: DidacticWarning[] = []
  for (const b of sheet.blocks) {
    if (b.type !== 'text' || !isSource(b)) continue
    const label = b.title.trim() || 'Die Quelle'
    const fehlt = missingHeaderParts(b.sourceHeader)
    if (fehlt.length) {
      out.push({
        kind: 'instruction',
        message: `${label}: Im Materialkopf fehlt ${fehlt.join(', ')}. Ohne diese Angaben lässt sich die Standortgebundenheit nicht beurteilen (EPA Geschichte 3.3.3).`
      })
    }
    if (!b.lineNumbers) {
      out.push({
        kind: 'instruction',
        message: `${label}: keine Zeilennummern. Die EPA verlangt, Materialien „am Rand mit einer Zeilenzählung" zu versehen – sonst lassen sich Textbelege nicht angeben.`
      })
    }
  }
  return out
}
