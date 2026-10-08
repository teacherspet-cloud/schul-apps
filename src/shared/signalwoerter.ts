/**
 * Signalwörter der englischen Zeitformen (Signalwort-Sortierer, 08.10.2026, abgestimmt). Zuordnung zu den Kennungen
 * des Grammatikkatalogs (`en.verb.…`). Das Spiel nimmt nur Zeitformen, die das Kind schon kennt (bekannte Grammatik),
 * und nur Signalwörter, die eindeutig zu genau einer dieser Zeitformen gehören.
 */
export interface Zeitform {
  /** Katalog-Kennung */
  id: string
  name: string
  signale: string[]
}

/*
 * Nur eindeutige Signalwörter: „never" (simple present und present perfect), „Look!" (present progressive und
 * going to-future) oder „tomorrow" (will und going to) kommen deshalb nicht vor.
 */
export const ZEITFORMEN_EN: Zeitform[] = [
  {
    id: 'en.verb.present_simple',
    name: 'Simple present',
    signale: ['always', 'usually', 'often', 'sometimes', 'every day', 'every week', 'on Mondays', 'twice a week']
  },
  { id: 'en.verb.present_progressive', name: 'Present progressive', signale: ['now', 'right now', 'at the moment', 'Listen!'] },
  { id: 'en.verb.past_simple', name: 'Simple past', signale: ['yesterday', 'last week', 'last year', 'two days ago', 'in 2019'] },
  { id: 'en.verb.past_progressive', name: 'Past progressive', signale: ['while', 'at that moment yesterday', 'at 8 o’clock last night'] },
  { id: 'en.verb.present_perfect', name: 'Present perfect', signale: ['already', 'yet', 'ever', 'just', 'so far', 'since 2020'] },
  { id: 'en.verb.will_future', name: 'will-future', signale: ['probably', 'I’m sure', 'I think …', 'maybe'] },
  { id: 'en.verb.going_to', name: 'going to-future', signale: ['I’ve decided to …', 'I’m planning to …', 'Look at those dark clouds!'] }
]

/** Zeitformen, die das Kind kennt (Kennungen wie „en.verb.past_simple" oder mit Teilform „…/fragen") */
export function bekannteZeitformen(bekannt: string[]): Zeitform[] {
  const themen = new Set(bekannt.map((b) => b.split('/')[0]))
  return ZEITFORMEN_EN.filter((z) => themen.has(z.id))
}

/** Runden: Signalwort → richtige Zeitform (aus den bekannten, mindestens zwei) */
export function signalRunden(zeitformen: Zeitform[], anzahl = 12, zufall: () => number = Math.random): { signal: string; richtig: string }[] {
  if (zeitformen.length < 2) return []
  const alle = zeitformen.flatMap((z) => z.signale.map((s) => ({ signal: s, richtig: z.id })))
  for (let i = alle.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1))
    ;[alle[i], alle[j]] = [alle[j], alle[i]]
  }
  return alle.slice(0, anzahl)
}
