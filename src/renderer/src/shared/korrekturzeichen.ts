/**
 * Korrekturzeichen am Rand (29.09.2026, Wunsch der Lehrkraft: „Standardliste, editierbar").
 *
 * Amtliche, landesweit verbindliche Listen gibt es für die Sekundarstufe I nicht; die Zeichen
 * legt in der Regel die Fachkonferenz fest. Die Voreinstellung hier sind die an deutschen
 * Schulen verbreiteten Zeichen je Fachgruppe (R, Z, Gr, A, W, Sb, T, Bz …). Die Lehrkraft passt
 * sie in den Einstellungen (Reiter „Material") je Fachgruppe an; die Rückmeldung druckt eine
 * Legende der tatsächlich benutzten Zeichen.
 */
import type { AppSettings } from '@shared/types'

export interface Korrekturzeichen {
  zeichen: string
  bedeutung: string
}

export type ZeichenGruppe = 'deutsch' | 'fremdsprache' | 'mathematik' | 'naturwissenschaft' | 'gesellschaft' | 'allgemein'

export const ZEICHEN_GRUPPEN: { id: ZeichenGruppe; label: string }[] = [
  { id: 'deutsch', label: 'Deutsch' },
  { id: 'fremdsprache', label: 'Fremdsprachen' },
  { id: 'mathematik', label: 'Mathematik' },
  { id: 'naturwissenschaft', label: 'Naturwissenschaften, Informatik' },
  { id: 'gesellschaft', label: 'Geschichte, Politik, Erdkunde, Religion' },
  { id: 'allgemein', label: 'Übrige Fächer' }
]

const HAKEN: Korrekturzeichen[] = [
  { zeichen: '✓', bedeutung: 'richtig, gelungen' },
  { zeichen: '(✓)', bedeutung: 'teilweise richtig' },
  { zeichen: '^', bedeutung: 'etwas fehlt' }
]

export const STANDARD_ZEICHEN: Record<ZeichenGruppe, Korrekturzeichen[]> = {
  deutsch: [
    { zeichen: 'R', bedeutung: 'Rechtschreibung' },
    { zeichen: 'Z', bedeutung: 'Zeichensetzung' },
    { zeichen: 'Gr', bedeutung: 'Grammatik' },
    { zeichen: 'Sb', bedeutung: 'Satzbau' },
    { zeichen: 'T', bedeutung: 'Tempus (Zeitform)' },
    { zeichen: 'Bz', bedeutung: 'Beziehung unklar' },
    { zeichen: 'A', bedeutung: 'Ausdruck' },
    { zeichen: 'W', bedeutung: 'Wortwahl' },
    { zeichen: 'Wdh', bedeutung: 'Wiederholung' },
    { zeichen: 'St', bedeutung: 'Stil' },
    { zeichen: 'Zit', bedeutung: 'Zitierweise' },
    { zeichen: 'Inh', bedeutung: 'Inhalt falsch oder ungenau' },
    { zeichen: 'Log', bedeutung: 'Gedankenführung, Logik' },
    ...HAKEN
  ],
  fremdsprache: [
    { zeichen: 'R', bedeutung: 'Rechtschreibung' },
    { zeichen: 'Gr', bedeutung: 'Grammatik' },
    { zeichen: 'T', bedeutung: 'Zeitform' },
    { zeichen: 'Sb', bedeutung: 'Satzbau, Wortstellung' },
    { zeichen: 'W', bedeutung: 'Wortwahl, Wortschatz' },
    { zeichen: 'A', bedeutung: 'Ausdruck, Idiomatik' },
    { zeichen: 'Präp', bedeutung: 'Präposition' },
    { zeichen: 'Art', bedeutung: 'Artikel' },
    { zeichen: 'Bz', bedeutung: 'Bezug unklar' },
    { zeichen: 'Z', bedeutung: 'Zeichensetzung' },
    { zeichen: 'Inh', bedeutung: 'Inhalt' },
    ...HAKEN
  ],
  mathematik: [
    { zeichen: 'RF', bedeutung: 'Rechenfehler' },
    { zeichen: 'F', bedeutung: 'Folgefehler (weiter richtig gerechnet)' },
    { zeichen: 'V', bedeutung: 'Vorzeichen' },
    { zeichen: 'E', bedeutung: 'Einheit fehlt oder falsch' },
    { zeichen: 'Ans', bedeutung: 'Ansatz' },
    { zeichen: 'Beg', bedeutung: 'Begründung fehlt' },
    { zeichen: 'Sch', bedeutung: 'Schreibweise, Notation' },
    { zeichen: 'Ant', bedeutung: 'Antwortsatz fehlt' },
    { zeichen: '~', bedeutung: 'ungenau' },
    ...HAKEN
  ],
  naturwissenschaft: [
    { zeichen: 'Fb', bedeutung: 'Fachbegriff' },
    { zeichen: 'E', bedeutung: 'Einheit' },
    { zeichen: 'Beg', bedeutung: 'Begründung fehlt' },
    { zeichen: 'Sk', bedeutung: 'Skizze, Darstellung' },
    { zeichen: 'Inh', bedeutung: 'fachlich falsch' },
    { zeichen: '~', bedeutung: 'ungenau' },
    { zeichen: 'R', bedeutung: 'Rechtschreibung' },
    { zeichen: 'A', bedeutung: 'Ausdruck' },
    ...HAKEN
  ],
  gesellschaft: [
    { zeichen: 'Inh', bedeutung: 'Inhalt falsch' },
    { zeichen: '~', bedeutung: 'ungenau' },
    { zeichen: 'Bel', bedeutung: 'Beleg fehlt' },
    { zeichen: 'Fb', bedeutung: 'Fachbegriff' },
    { zeichen: 'Op', bedeutung: 'Operator nicht erfüllt' },
    { zeichen: 'Zus', bedeutung: 'Zusammenhang fehlt' },
    { zeichen: 'Wdh', bedeutung: 'Wiederholung' },
    { zeichen: 'A', bedeutung: 'Ausdruck' },
    { zeichen: 'R', bedeutung: 'Rechtschreibung' },
    { zeichen: 'Gr', bedeutung: 'Grammatik' },
    { zeichen: 'Z', bedeutung: 'Zeichensetzung' },
    ...HAKEN
  ],
  allgemein: [
    { zeichen: 'Inh', bedeutung: 'Inhalt' },
    { zeichen: '~', bedeutung: 'ungenau' },
    { zeichen: 'A', bedeutung: 'Ausdruck' },
    { zeichen: 'R', bedeutung: 'Rechtschreibung' },
    { zeichen: 'Gr', bedeutung: 'Grammatik' },
    { zeichen: 'Z', bedeutung: 'Zeichensetzung' },
    ...HAKEN
  ]
}

const GRUPPE_VON: Record<string, ZeichenGruppe> = {
  deutsch: 'deutsch',
  daz: 'deutsch',
  englisch: 'fremdsprache',
  franzoesisch: 'fremdsprache',
  spanisch: 'fremdsprache',
  italienisch: 'fremdsprache',
  latein: 'fremdsprache',
  mathematik: 'mathematik',
  biologie: 'naturwissenschaft',
  chemie: 'naturwissenschaft',
  physik: 'naturwissenschaft',
  informatik: 'naturwissenschaft',
  sachunterricht: 'naturwissenschaft',
  geschichte: 'gesellschaft',
  erdkunde: 'gesellschaft',
  politik: 'gesellschaft',
  religion: 'gesellschaft'
}

export const zeichenGruppe = (subjectId: string): ZeichenGruppe => GRUPPE_VON[subjectId] ?? 'allgemein'

/** Die Zeichen für ein Fach – eigene Liste aus den Einstellungen, sonst die Voreinstellung */
export function zeichenFuer(subjectId: string, settings?: Pick<AppSettings, 'korrekturzeichen'>): Korrekturzeichen[] {
  const g = zeichenGruppe(subjectId)
  const eigen = settings?.korrekturzeichen?.[g]
  return eigen?.length ? eigen : STANDARD_ZEICHEN[g]
}

/** Legende nur der benutzten Zeichen, in der Reihenfolge der Liste */
export function legende(liste: Korrekturzeichen[], benutzt: string[]): Korrekturzeichen[] {
  const set = new Set(benutzt.filter(Boolean))
  const bekannt = liste.filter((z) => set.has(z.zeichen))
  const fremd = [...set].filter((z) => !liste.some((l) => l.zeichen === z)).map((z) => ({ zeichen: z, bedeutung: '' }))
  return [...bekannt, ...fremd]
}
