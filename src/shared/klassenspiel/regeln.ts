/**
 * Regelmodule der Klassenspiele (02.11.2026). Stufe A: Expedition, Boss, Rennen; Stufe B: Team-Puzzle, Rekord,
 * Gebietseroberung, Turnier-Tische, Wett-Quiz.
 */
import type { KBasis, KlassenRegeln } from './kern'
import type { KlassenspielId } from './typen'
import { expedition } from './spiele/expedition'
import { boss } from './spiele/boss'
import { rennen } from './spiele/rennen'
import { puzzle } from './spiele/puzzle'
import { rekord } from './spiele/rekord'
import { gebiet } from './spiele/gebiet'
import { turnier } from './spiele/turnier'
import { wette } from './spiele/wette'

export const KLASSEN_REGELN: Partial<Record<KlassenspielId, KlassenRegeln<KBasis>>> = {
  expedition: expedition as unknown as KlassenRegeln<KBasis>,
  boss: boss as unknown as KlassenRegeln<KBasis>,
  rennen: rennen as unknown as KlassenRegeln<KBasis>,
  puzzle: puzzle as unknown as KlassenRegeln<KBasis>,
  rekord: rekord as unknown as KlassenRegeln<KBasis>,
  gebiet: gebiet as unknown as KlassenRegeln<KBasis>,
  turnier: turnier as unknown as KlassenRegeln<KBasis>,
  wette: wette as unknown as KlassenRegeln<KBasis>
}

export const spielbar = (id: KlassenspielId): boolean => Boolean(KLASSEN_REGELN[id])
