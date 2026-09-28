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

export function bogenUeberschriften(anrede: Anrede): { staerken: string; schritte: string; kriterien: string } {
  return anrede === 'du'
    ? { staerken: 'Das gelingt dir schon', schritte: 'Deine nächsten Schritte', kriterien: 'Worauf es ankam' }
    : { staerken: 'Das gelingt Ihnen schon', schritte: 'Ihre nächsten Schritte', kriterien: 'Worauf es ankam' }
}
