/**
 * Quellenangaben für Bilder und Texte auf Unterrichtsmaterial.
 *
 * Bisher entstand der Nachweis als freier Text, und die Adresse der Fundstelle ging dabei
 * verloren – ohne sie lässt sich eine Quelle weder nachprüfen noch korrekt zitieren.
 * Die Angaben werden deshalb strukturiert gespeichert und erst beim Drucken in den Stil
 * gebracht, den die Lehrkraft eingestellt hat.
 *
 * Die Stile folgen den gängigen Regelwerken, sind aber für Bildquellen auf Schulmaterial
 * gekürzt: Auf einem Arbeitsblatt steht der Nachweis klein auf der Schlussseite und soll
 * lesbar bleiben, nicht eine Bibliografie ersetzen.
 */

import type { CitationStyle } from '@shared/types'

export type { CitationStyle }

export const CITATION_STYLES: { value: CitationStyle; label: string; description: string; example: string }[] = [
  {
    value: 'deutsch',
    label: 'Deutsche Zitierweise (Schule)',
    description: 'Urheber, Titel, Datum, Lizenz, Fundort und Adresse – die in deutschen Schulbüchern übliche Form.',
    example: 'Leonard Raven-Hill: The Boiling Point, 02.10.1912. Public domain. Wikimedia Commons. https://… (abgerufen am 21.09.2026)'
  },
  {
    value: 'mla',
    label: 'MLA (9. Auflage)',
    description: 'Angelsächsischer Standard in den Geisteswissenschaften; Titel in Anführungszeichen, Fundort kursiv.',
    example: 'Raven-Hill, Leonard. „The Boiling Point." Wikimedia Commons, 2 Oct. 1912, https://….'
  },
  {
    value: 'apa',
    label: 'APA (7. Auflage)',
    description: 'Standard in Psychologie und Sozialwissenschaften; Jahr in Klammern, Art des Werkes in eckigen Klammern.',
    example: 'Raven-Hill, L. (1912). The Boiling Point [Bild]. Wikimedia Commons. https://…'
  },
  {
    value: 'chicago',
    label: 'Chicago (Notes)',
    description: 'In der Geschichtswissenschaft verbreitet; Urheber in normaler Reihenfolge, alles durch Kommata getrennt.',
    example: 'Leonard Raven-Hill, „The Boiling Point," Wikimedia Commons, October 2, 1912, https://….'
  }
]

export const DEFAULT_CITATION_STYLE: CitationStyle = 'deutsch'

/** Die Angaben, die eine Quelle nachprüfbar machen. */
export interface SourceCitation {
  /** Urheberin oder Urheber; leer, wenn unbekannt */
  creator?: string
  title?: string
  /** Entstehungs- oder Veröffentlichungsdatum, wie die Quelle es angibt */
  date?: string
  /** Veröffentlichungsorgan oder Sammlung, z. B. „Punch", „Wikimedia Commons" */
  repository?: string
  /** Erscheinungsort, soweit bekannt */
  place?: string
  license?: string
  /** Adresse der Fundstelle */
  url?: string
  /** Tag des Abrufs (ISO), für Internetquellen */
  retrieved?: string
}

const asDate = (iso?: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE')
}

/** Nachname, Vorname – für die Stile, die den Urheber umstellen. */
function inverted(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name.trim()
  const last = parts.pop()!
  return `${last}, ${parts.join(' ')}`
}

const yearOf = (date?: string): string => (date ? (/\b(\d{4})\b/.exec(date)?.[1] ?? date) : 'o. J.')

/**
 * Bringt eine Quellenangabe in den gewählten Stil.
 * Fehlende Angaben werden weggelassen, nicht erfunden – eine unvollständige Quelle
 * bleibt sichtbar unvollständig.
 */
export function formatCitation(c: SourceCitation, style: CitationStyle = DEFAULT_CITATION_STYLE): string {
  const creator = c.creator?.trim()
  const title = c.title?.trim()
  const parts: string[] = []

  if (style === 'mla') {
    if (creator) parts.push(`${inverted(creator)}.`)
    if (title) parts.push(`„${title}."`)
    const tail = [c.repository, c.date, c.url].filter(Boolean).join(', ')
    if (tail) parts.push(`${tail}.`)
    if (c.license) parts.push(`${c.license}.`)
    return parts.join(' ')
  }

  if (style === 'apa') {
    parts.push(creator ? `${inverted(creator)}.` : 'Ohne Urheber.')
    parts.push(`(${yearOf(c.date)}).`)
    if (title) parts.push(`${title} [Bild].`)
    if (c.repository) parts.push(`${c.repository}.`)
    if (c.license) parts.push(`${c.license}.`)
    if (c.url) parts.push(c.url)
    return parts.join(' ')
  }

  if (style === 'chicago') {
    if (creator) parts.push(`${creator},`)
    if (title) parts.push(`„${title},"`)
    const tail = [c.repository, c.date, c.url].filter(Boolean).join(', ')
    if (tail) parts.push(`${tail}.`)
    if (c.license) parts.push(`${c.license}.`)
    return parts.join(' ')
  }

  // Deutsche Zitierweise
  const head = [creator || 'Urheber unbekannt', title].filter(Boolean).join(': ')
  parts.push(c.date ? `${head}, ${c.date}.` : `${head}.`)
  if (c.place) parts.push(`${c.place}.`)
  if (c.license) parts.push(`${c.license}.`)
  if (c.repository) parts.push(`${c.repository}.`)
  if (c.url) parts.push(c.retrieved ? `${c.url} (abgerufen am ${asDate(c.retrieved)})` : c.url)
  return parts.join(' ')
}

/**
 * Angaben, die eine quellenkritische Einleitung braucht: Wer? Was? Wann? Wo erschienen?
 * Fehlt eines davon, können die Lernenden die Quelle nicht einordnen.
 */
export function missingForSourceCriticism(c: SourceCitation): string[] {
  const missing: string[] = []
  if (!c.creator?.trim() || c.creator.trim().toLowerCase().startsWith('unbekannt')) missing.push('Urheber')
  if (!c.title?.trim()) missing.push('Titel')
  if (!c.date?.trim()) missing.push('Entstehungsdatum')
  if (!c.repository?.trim()) missing.push('Erscheinungsort oder Publikationsorgan')
  return missing
}
