/**
 * Gliederung der Testauswahl (02.11.2026, Wunsch der Lehrkraft: „Station 1" aus Green Line 5 und 6 waren in der flachen
 * Liste nicht zu unterscheiden): Band › Unit › Vokabelabschnitte und Grammatik – dieselbe Ordnung wie im Kasten „Units"
 * der Kursseite (`nachBaenden` + `unitsMitGrammatik`): neuester Band oben, in ihm die spätere Unit oben, in der Unit die
 * Grammatik hinter den Vokabeln ihrer Station. Rein rechnend.
 */
import { nachBaenden } from '@shared/kursAbschnitte'
import { vorbelegung } from '@shared/testAbschnitte'
import { LEHRWERK_GRAMMATIK } from '../../../shared/lehrwerkGrammatik'
import { bandGleich, unitsMitGrammatik, type GrammatikStandKurz } from './kursAnsicht'
import type { TestAbschnitteDaten } from './TestAbschnitte'

export type TestEintragDaten = TestAbschnitteDaten['eintraege'][number]

export interface TestUnitGruppe {
  /** Schlüssel für Auf/Zu und Testkennungen */
  schluessel: string
  unit: string
  vok: TestEintragDaten[]
  gram: (TestEintragDaten & { station?: string })[]
}
export interface TestBandGruppe {
  buch: string
  units: TestUnitGruppe[]
}

const unitFolgeImKatalog = (buch: string): string[] =>
  Object.keys(LEHRWERK_GRAMMATIK[Object.keys(LEHRWERK_GRAMMATIK).find((k) => bandGleich(k, buch)) ?? ''] ?? {})

export function testAuswahlGliedern(eintraege: TestEintragDaten[]): TestBandGruppe[] {
  const vok = eintraege
    .filter((e) => e.art === 'vok')
    .map((e) => ({ ...e, unit: e.unit ?? '', name: e.name ?? e.titel, zeit: e.zeit || 0 }))
  const gramEintraege = eintraege.filter((e) => e.art === 'gram')
  const nachKey = new Map(gramEintraege.map((g) => [g.key, g]))
  const grammatik: GrammatikStandKurz[] = gramEintraege.map((g) => ({
    id: g.key,
    titel: g.titel,
    ...(g.buch ? { buch: g.buch } : {}),
    ...(g.unit ? { unit: g.unit } : {}),
    ...(g.station ? { station: g.station } : {}),
    aufgaben: g.aufgaben ?? 0,
    bearbeitet: 0,
    sicher: 0
  }))
  return unitsMitGrammatik(nachBaenden(vok), grammatik, unitFolgeImKatalog).map((b) => ({
    buch: b.buch,
    units: b.units.map((u) => ({
      schluessel: `${b.buch}|${u.unit}`,
      unit: u.unit,
      vok: u.vok as TestEintragDaten[],
      gram: u.gram.map((g) => nachKey.get(g.id)!).filter(Boolean)
    }))
  }))
}

/** Alle Schlüssel einer Unit bzw. eines Bandes */
export const unitSchluessel = (u: TestUnitGruppe): string[] => [...u.vok.map((e) => e.key), ...u.gram.map((e) => e.key)]
export const bandSchluessel = (b: TestBandGruppe): string[] => b.units.flatMap(unitSchluessel)

/**
 * Anfangsauswahl des Fensters: die gewählten Abschnitte; ist der bisherige Termin schon vorbei, der Vorschlag „seit dem
 * letzten Test" (so rechnet auch der Server, sobald ein neuer Termin kommt).
 */
export function anfangsAuswahl(daten: TestAbschnitteDaten, termin: number | null, jetzt = Date.now()): { keys: string[]; vorschlag: boolean } {
  if ((termin && termin < jetzt) || !daten.eigeneWahl) return { keys: vorschlagKeys(daten, termin, jetzt), vorschlag: true }
  return { keys: daten.gewaehlt, vorschlag: false }
}

/** Vorschlag wie auf dem Server (`testKeysVon` ohne eigene Wahl): seit dem letzten Test, sonst die neueste Freigabe */
export function vorschlagKeys(daten: TestAbschnitteDaten, termin: number | null, jetzt = Date.now()): string[] {
  const vorbei = termin && termin < jetzt ? termin : null
  if (!vorbei && !daten.eigeneWahl) return daten.gewaehlt
  const letzter = vorbei ?? daten.letzter
  const vok = daten.eintraege.filter((e) => e.art === 'vok')
  const gram = daten.eintraege.filter((e) => e.art === 'gram')
  return [...vorbelegung(vok, letzter, jetzt), ...vorbelegung(gram, letzter, jetzt)]
}

/** Zusammenfassung: Zahl der Abschnitte, Wörter und Grammatikthemen */
export function auswahlZahlen(eintraege: TestEintragDaten[], keys: Set<string>): { abschnitte: number; woerter: number; grammatik: number } {
  let abschnitte = 0
  let woerter = 0
  let grammatik = 0
  for (const e of eintraege) {
    if (!keys.has(e.key)) continue
    if (e.art === 'vok') {
      abschnitte++
      woerter += e.anzahl ?? 0
    } else grammatik++
  }
  return { abschnitte, woerter, grammatik }
}
