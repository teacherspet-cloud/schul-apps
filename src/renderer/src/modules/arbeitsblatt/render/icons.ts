import type { InfoVariant, SocialForm } from '../model/types'

const person = (x: number): string =>
  `<circle cx="${x}" cy="7" r="3.2" fill="currentColor"/><path d="M${x - 5} 20c0-4 2.2-7 5-7s5 3 5 7z" fill="currentColor"/>`

/** Einfache, druckfreundliche Symbole für Sozialformen (als SVG-Text für HTML und Word). */
export const SOCIAL_FORM_SVG: Record<SocialForm, string> = {
  EA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 22" width="24" height="22">${person(12)}</svg>`,
  PA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 22" width="30" height="22">${person(9)}${person(21)}</svg>`,
  GA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 22" width="36" height="22">${person(8)}${person(18)}${person(28)}</svg>`,
  // Flächig gezeichnet: flächige Symbole werden als leichter erkennbar bewertet als lineare (DBSV)
  Plenum: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 22" width="30" height="22"><path d="M2 2h18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4v-4H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="currentColor"/><path d="M24 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2v3l-3-3h-6a2 2 0 0 1-2-2v-1h5a3 3 0 0 0 3-3z" fill="currentColor"/></svg>`,
  // Rollenspiel: zwei Personen, jede mit einer Karte in der Hand
  Rollenspiel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 22" width="34" height="22">${person(9)}${person(25)}<rect x="1" y="12" width="7" height="9" rx="1" fill="currentColor"/><rect x="26" y="12" width="7" height="9" rx="1" fill="currentColor"/></svg>`
}

export const SOCIAL_FORM_LABELS: Record<SocialForm, string> = {
  EA: 'Einzelarbeit',
  PA: 'Partnerarbeit',
  GA: 'Gruppenarbeit',
  Plenum: 'Klassengespräch',
  Rollenspiel: 'Rollenspiel'
}

export const INFO_VARIANTS: Record<InfoVariant, { label: string; symbol: string }> = {
  merke: { label: 'Merke', symbol: '!' },
  definition: { label: 'Definition', symbol: '≡' },
  beispiel: { label: 'Beispiel', symbol: '✎' },
  wissen: { label: 'Wissen', symbol: 'i' },
  regel: { label: 'Regel', symbol: '§' }
}
