/**
 * Texte, die sich an die LERNENDEN richten (Überschriften der Rückmeldebögen) und die Auswahl
 * ihrer Anrede. Sie stehen hier und nicht in den Schritten: Die Oberfläche selbst spricht die
 * Lehrkraft unpersönlich an (Wache tests/anrede.test.ts), der Bogen dagegen duzt oder siezt.
 */
export type Anrede = 'du' | 'sie'

export const STANDARD_ANREDE: Anrede = 'du'

export const ANREDE_OPTIONEN: { value: Anrede; label: string }[] = [
  { value: 'du', label: 'du' },
  { value: 'sie', label: 'Sie' }
]

export interface BogenUeberschriften {
  staerken: string
  schritte: string
  kriterien: string
  tabelle: string
  rand: string
  scan: string
  ueberarbeitung: string
  einstufung: string
  eltern: string
}

export function bogenUeberschriften(anrede: Anrede): BogenUeberschriften {
  const gemeinsam = {
    kriterien: 'Worauf es ankam',
    tabelle: 'Bewertung nach Kriterien',
    rand: 'Anmerkungen am Rand',
    scan: 'Anmerkungen zur Arbeit',
    einstufung: 'Einstufung',
    eltern: 'Rückmeldung für die Eltern'
  }
  return anrede === 'du'
    ? { ...gemeinsam, staerken: 'Das gelingt dir schon', schritte: 'Deine nächsten Schritte', ueberarbeitung: 'Dein Überarbeitungsauftrag' }
    : { ...gemeinsam, staerken: 'Das gelingt Ihnen schon', schritte: 'Ihre nächsten Schritte', ueberarbeitung: 'Ihr Überarbeitungsauftrag' }
}
