/**
 * Regelmodule der Klassenspiele (02.11.2026). Stufe A: Expedition, Boss, Rennen; die übrigen folgen (Stufe B) und sind
 * bis dahin in `KLASSENSPIELE` als `spaeter` markiert.
 */
import type { KBasis, KlassenRegeln } from './kern'
import type { KlassenspielId } from './typen'
import { expedition } from './spiele/expedition'
import { boss } from './spiele/boss'
import { rennen } from './spiele/rennen'

export const KLASSEN_REGELN: Partial<Record<KlassenspielId, KlassenRegeln<KBasis>>> = {
  expedition: expedition as unknown as KlassenRegeln<KBasis>,
  boss: boss as unknown as KlassenRegeln<KBasis>,
  rennen: rennen as unknown as KlassenRegeln<KBasis>
}

export const spielbar = (id: KlassenspielId): boolean => Boolean(KLASSEN_REGELN[id])
