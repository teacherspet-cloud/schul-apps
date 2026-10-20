/**
 * Etappen im Grammatiktrainer (20.10.2026, mit der Lehrkraft abgestimmt; Memory „grammatik-etappen-2026-10-20"):
 * Befund: Lernende sahen bei einer einzigen Form knapp 200 Übungen (8 je Feld × 5 Übungsarten × 2 Stufen) – das
 * demotiviert. Jetzt hat jede Regel (Teilbereich) kleine Etappen, sichtbar ist nur die aktuelle:
 *
 *  1 Erkennen → 2 Bilden → 3 Anwenden   (Grundstufe des Kurses – am Gymnasium „mittel")
 *  4 Profi                              (Kernübungen der höheren Stufe – am Gymnasium „anspruchsvoll")
 *  5 Bonus                              (Unterscheiden, Fehler finden)
 *
 * Freigeschaltet wird die nächste Etappe, sobald in der aktuellen 80 % beim ersten Versuch richtig sind (mindestens 5
 * bearbeitet bzw. alle, wenn sie weniger hat) – wie die sicher-Regel. Damit niemand festsitzt, gilt eine Etappe auch als
 * geschafft, wenn alle ihre Übungen bearbeitet sind (Falsches kommt über die Wiederholungen ohnehin wieder).
 *
 * Aufgaben ohne Übungsart (ältere KI-Trainings, Förder/Forder) bilden eine einzige, offene Etappe – wie bisher.
 * Die Grundstufe ergibt sich aus dem Paket: die leichteste Stufe unter den Aufgaben der Regel (die Förderreserve liegt
 * getrennt in `paket.reserve` und zählt nicht).
 */
import type { GrammatikAufgabe, GrammatikPaket } from './grammatiktrainer'
import { KERN_UEBUNGEN, STUFEN, stufeVon, type Stufe } from './grammatikBank'
import { ersterVersuch, MIN_AUFGABEN, SICHER_ERSTE_AB } from './grammatikSicher'
import type { WortStand } from './vokabeltrainer'

export type EtappeId = 'erkennen' | 'bilden' | 'anwenden' | 'profi' | 'bonus' | 'alle'
export const ETAPPE_NAME: Record<EtappeId, string> = {
  erkennen: 'Erkennen',
  bilden: 'Bilden',
  anwenden: 'Anwenden',
  profi: 'Profi',
  bonus: 'Bonus',
  alle: 'Übungen'
}

type Stand = Pick<WortStand, 'versuche' | 'falsch'> & Partial<Pick<WortStand, 'erster' | 'nachFehler'>>
type Aufgabe = Pick<GrammatikAufgabe, 'id' | 'uebung' | 'niveau'>

export interface Etappe {
  id: EtappeId
  name: string
  /** Kennungen der Übungen dieser Etappe */
  aufgaben: string[]
  bearbeitet: number
  ersteRichtig: number
  geschafft: boolean
  /** Freigeschaltet (die erste immer, jede weitere nach der geschafften vorigen) */
  frei: boolean
}

/** Etappe einer Aufgabe bei gegebener Grundstufe */
function etappeVon(a: Aufgabe, grund: Stufe): EtappeId {
  if (!a.uebung) return 'alle'
  if (!KERN_UEBUNGEN.includes(a.uebung)) return 'bonus'
  if (stufeVon(a) !== grund) return 'profi'
  return a.uebung as 'erkennen' | 'bilden' | 'anwenden'
}

const REIHENFOLGE: EtappeId[] = ['alle', 'erkennen', 'bilden', 'anwenden', 'profi', 'bonus']

/** Geschafft: 80 % beim ersten Versuch richtig (bei genug bearbeiteten) – oder alle bearbeitet */
export function etappeGeschafft(e: Pick<Etappe, 'aufgaben' | 'bearbeitet' | 'ersteRichtig'>): boolean {
  if (!e.aufgaben.length) return true
  if (e.bearbeitet >= e.aufgaben.length) return true
  const noetig = Math.max(1, Math.min(MIN_AUFGABEN, e.aufgaben.length))
  return e.bearbeitet >= noetig && e.ersteRichtig / e.bearbeitet >= SICHER_ERSTE_AB
}

/** Etappen einer Regel (ihre Aufgaben aus dem Paket) mit dem Stand der Person – leere Etappen fallen weg */
export function etappenDerRegel(aufgaben: readonly Aufgabe[], staende: Record<string, Stand | undefined>): Etappe[] {
  const mitStufe = aufgaben.filter((a) => a.uebung)
  const grund = STUFEN.find((s) => mitStufe.some((a) => stufeVon(a) === s)) ?? 'm'
  const je = new Map<EtappeId, string[]>()
  for (const a of aufgaben) {
    const id = etappeVon(a, grund)
    je.set(id, [...(je.get(id) ?? []), a.id])
  }
  let vorigeGeschafft = true
  return REIHENFOLGE.filter((id) => je.get(id)?.length).map((id) => {
    const ids = je.get(id)!
    let bearbeitet = 0
    let ersteRichtig = 0
    for (const x of ids) {
      const e = ersterVersuch(staende[x])
      if (!e) continue
      bearbeitet++
      if (e === 'r') ersteRichtig++
    }
    const geschafft = etappeGeschafft({ aufgaben: ids, bearbeitet, ersteRichtig })
    const frei = vorigeGeschafft
    vorigeGeschafft = vorigeGeschafft && geschafft
    return { id, name: ETAPPE_NAME[id], aufgaben: ids, bearbeitet, ersteRichtig, geschafft, frei }
  })
}

/** Die Etappe, an der die Person gerade ist (die erste freie, nicht geschaffte); null = alle geschafft */
export const aktuelleEtappe = (etappen: readonly Etappe[]): Etappe | null => etappen.find((e) => e.frei && !e.geschafft) ?? null

/** Etappen je Regel des Pakets */
export function etappenDesPakets(paket: Pick<GrammatikPaket, 'aufgaben' | 'regeln'>, staende: Record<string, Stand | undefined>): Map<string, Etappe[]> {
  const je = new Map<string, Aufgabe[]>()
  for (const a of paket.aufgaben) je.set(a.regelId, [...(je.get(a.regelId) ?? []), a])
  return new Map([...je].map(([rid, l]) => [rid, etappenDerRegel(l, staende)]))
}

/** Kennungen aller Übungen in freigeschalteten Etappen */
export function freieAufgaben(paket: Pick<GrammatikPaket, 'aufgaben' | 'regeln'>, staende: Record<string, Stand | undefined>): Set<string> {
  const frei = new Set<string>()
  for (const etappen of etappenDesPakets(paket, staende).values()) for (const e of etappen) if (e.frei) for (const id of e.aufgaben) frei.add(id)
  return frei
}

/**
 * Zusammenfassung für Lernraum und Regal: geschaffte Etappen von allen, die aktuelle Etappe (Name, wie viele ihrer
 * Übungen noch unbearbeitet sind) und wie viele Übungen in freien Etappen noch offen sind.
 */
export function etappenUebersicht(
  paket: Pick<GrammatikPaket, 'aufgaben' | 'regeln'>,
  staende: Record<string, Stand | undefined>
): { geschafft: number; gesamt: number; aktuell: { name: string; offen: number; gesamt: number } | null; offen: number } {
  let geschafft = 0
  let gesamt = 0
  let offen = 0
  let aktuell: { name: string; offen: number; gesamt: number } | null = null
  for (const etappen of etappenDesPakets(paket, staende).values()) {
    gesamt += etappen.length
    geschafft += etappen.filter((e) => e.geschafft).length
    for (const e of etappen) if (e.frei) offen += e.aufgaben.filter((id) => !staende[id]?.versuche).length
    const a = aktuelleEtappe(etappen)
    if (a && !aktuell) aktuell = { name: a.name, offen: a.aufgaben.filter((id) => !staende[id]?.versuche).length, gesamt: a.aufgaben.length }
  }
  return { geschafft, gesamt, aktuell, offen }
}
