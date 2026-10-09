/** Hilfe für die Sprachpakete: Reiseplaner-Lexikon moderner Sprachen aus Zeilen in fester Reihenfolge (09.10.2026) */
import type { Begriff, Lexikon, Merkmal, Zahlen } from '../mehrspieler/reiseLexikon'

/** Feste Reihenfolge der Begriffe moderner Sprachen (Kennung, Symbol, Grundwortschatz) – für die Sprachpakete */
const ORDNUNG: Record<Merkmal, [string, string, boolean][]> = {
  ziel: [['meer', '🏖️', true], ['berge', '⛰️', true], ['stadt', '🏙️', true], ['see', '🏞️', false], ['insel', '🏝️', false], ['land', '🐄', true]],
  verkehr: [['zug', '🚆', true], ['bus', '🚌', true], ['auto', '🚗', true], ['flugzeug', '✈️', true], ['rad', '🚲', false], ['schiff', '⛴️', false]],
  wetter: [['sonne', '☀️', true], ['regen', '🌧️', true], ['schnee', '❄️', true], ['wind', '🌬️', false]],
  akt: [['schwimmen', '🏊', true], ['wandern', '🥾', true], ['ski', '⛷️', false], ['museum', '🏛️', true], ['einkaufen', '🛍️', true], ['segeln', '⛵', false], ['zelten', '⛺', false]]
}
/** [Karte, so soll es sein (null = gibt es nicht), so nicht, indirekt (ab Kl. 9), Wort fürs Lehrwerk, wenn/wollen] */
export type Zeile = [string, string | null, string, string, string, string?]

/** Lexikon einer modernen Sprache aus Zeilen in der festen Reihenfolge (Ziel 6, Verkehr 6, Wetter 4 mit „wenn", Aktivität 7 mit „wollen") */
export function lexikonAus(z: Record<Merkmal, Zeile[]>, zahlen: Zahlen): Lexikon {
  const begriffe = Object.fromEntries(
    (Object.keys(ORDNUNG) as Merkmal[]).map((m) => [
      m,
      ORDNUNG[m].map(([id, icon, basis], i) => {
        const [karte, ja, nein, nein9, wort, extra] = z[m][i]
        return {
          id,
          icon,
          karte,
          ja,
          nein,
          nein9,
          wort,
          ...(basis ? { basis: true as const } : {}),
          ...(m === 'wetter' && extra ? { wenn: extra } : {}),
          ...(m === 'akt' && extra ? { wollen: extra } : {})
        }
      })
    ])
  ) as Record<Merkmal, Begriff[]>
  return { begriffe, zahlen }
}

