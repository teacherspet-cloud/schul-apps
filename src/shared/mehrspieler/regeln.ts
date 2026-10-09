/**
 * Alle Regelmodule der Mehrspieler-Spiele (08.10.2026). Ein neues Spiel: Eintrag in typen.ts (MEHRSPIELE) und hier
 * sein Regelmodul – die Oberfläche zeichnet die Bausteine der Sicht von selbst.
 */
import type { Basis, Regeln } from './kern'
import type { MehrspielId, MehrspielInfo, SpielInhalt } from './typen'
import { MEHRSPIELE } from './typen'
import { teammatch } from './spiele/teammatch'
import { satzbaustelle } from './spiele/ordnen'
import { fluchtraum } from './spiele/fluchtraum'
import { beschreiben } from './spiele/beschreiben'
import { tauziehen } from './spiele/tauziehen'
import { schiffe, staffel } from './spiele/staffel'
import { bingo } from './spiele/bingo'
import { WELLE2 } from './spiele/welle2'
import { mehrBeschreibung, spielName } from '../spielSprache'

export const REGELN: Record<MehrspielId, Regeln<Basis>> = {
  teammatch,
  satzbaustelle,
  fluchtraum,
  beschreiben,
  tauziehen,
  staffel,
  bingo,
  schiffe,
  ...WELLE2
} as unknown as Record<MehrspielId, Regeln<Basis>>

/** Jahrgangsband: sichtbar, wenn die Klasse des Kurses höchstens eins außerhalb liegt (unbekannt = sichtbar) */
export const imJahrgang = (info: MehrspielInfo, jahrgang: number | null): boolean =>
  !info.jahrgang || jahrgang === null || (jahrgang >= info.jahrgang[0] - 1 && jahrgang <= info.jahrgang[1] + 1)

export interface Angebot {
  id: MehrspielId
  name: string
  art: MehrspielInfo['art']
  beschreibung: string
  min: number
  max: number
  /** null = spielbar; sonst Grund (Spiel bleibt ausgeblendet) */
  grund: string | null
}

/** Welche Spiele gibt es für diesen Kurs? Ausgeblendet: falscher Bereich, Jahrgang, fehlender Inhalt (wie karteFuer) */
export function angebotFuer(inhalt: SpielInhalt, jahrgang: number | null, stimme = true): Angebot[] {
  return MEHRSPIELE.filter((s) => s.bereiche.includes(inhalt.bereich) && imJahrgang(s, jahrgang)).flatMap((s) => {
    const r = REGELN[s.id]
    const grund = r ? r.passt(inhalt, stimme) : 'Noch nicht verfügbar.'
    // Name und Regel in der Zielsprache des Kurses (09.10.2026)
    return grund
      ? []
      : [
          {
            id: s.id,
            name: spielName('mehr', s.id, inhalt.sprache, s.name),
            art: s.art,
            beschreibung: mehrBeschreibung(s.id, s.beschreibung, inhalt.sprache, jahrgang),
            min: s.min,
            max: s.max,
            grund: null
          }
        ]
  })
}
