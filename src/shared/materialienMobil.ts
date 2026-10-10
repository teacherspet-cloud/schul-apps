/**
 * Materialien am Telefon (10.10.2026, Entscheidung der Lehrkraft „Option 1") – die reine Logik ohne React, prüfbar in
 * tests/materialienMobil.test.ts. Die Ansicht selbst: renderer/src/shared/components/MaterialienMobil.tsx.
 *
 *  - DOPPELTE THEMEN: Die Analyse fand „Green Line 2 › Unit 1: The new boy" (aus dem Lehrwerk) neben „Green Line 2
 *    Unit 1" (aus dem frei getippten Überthema). Beide meinen dieselbe Einheit. `einheitSchluessel` macht aus beiden
 *    „green line 2|unit 1"; `doppelteEinheiten` ordnet den frei benannten Bereich der Lehrwerk-Unit zu – am Telefon
 *    stehen seine Materialien dann IN der Unit, und die Automatik sortiert Neues gleich dorthin (themenVorschlag.ts).
 *  - ARTEN: Chips im Thema nur für vorhandene Arten (Blätter, Tests, Tafel, Vokabellisten …).
 *  - REIHEN: Ausgeblendet wird nur Material, das FÜR eine Reihe entstanden ist (Regel vom 10.10.2026,
 *    shared/reiheMaterial.ts) – eigene, in eine Reihe geholte Blätter bleiben sichtbar.
 */
import { istReiheMaterial, type ReiheZuordnung } from './reiheMaterial'

// ---------- Einheiten eines Lehrwerks ----------

/** Wörter für „Einheit" in den Lehrwerken (Green Line „Unit", Découvertes „Unité", ¡Vamos! „Unidad", Latein „Lektion" …) */
const EINHEIT = 'unit|unite|unité|unidad|lektion|lezione|kapitel|chapter|chapitre|module|modul|lesson|leçon|lecon|station'

/**
 * Schlüssel einer Lehrwerks-Einheit aus einem Text: „Green Line 2 › Unit 1: The new boy", „Green Line 2 Unit 1",
 * „Green Line 2 – Unit 3 Wortliste" → „green line 2|unit 1". Ohne Reihe, Band und Einheit: null.
 */
export function einheitSchluessel(text: string | undefined | null): string | null {
  if (!text) return null
  const t = text
    .toLocaleLowerCase('de')
    .replace(/[›»>–—:,;()[\]/|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = new RegExp(`^(.*?\\p{L})\\s*(\\d{1,2})\\s+(?:${EINHEIT})\\s*(\\d{1,2})(?!\\d)`, 'u').exec(t)
  if (!m) return null
  const reihe = m[1].trim()
  // Mindestens ein Wort mit drei Buchstaben – „Kl 7 Unit 2" ist kein Lehrwerk
  if (!/\p{L}{3,}/u.test(reihe)) return null
  return `${reihe} ${Number(m[2])}|unit ${Number(m[3])}`
}

/** Was die Logik von einem Themenbereich braucht (Auszug aus shared/themen.ts) */
export interface BereichKurz {
  id: string
  fachId: string
  name: string
  elternId?: string
  herkunft?: string
}

/** Namen von oben nach unten: „Green Line 2 › Unit 1: The new boy" */
export function pfadText(bereiche: readonly BereichKurz[], b: BereichKurz): string {
  const nachId = new Map(bereiche.map((x) => [x.id, x]))
  const namen: string[] = []
  let x: BereichKurz | undefined = b
  for (let i = 0; x && i < 20; i++) {
    namen.unshift(x.name)
    x = x.elternId ? nachId.get(x.elternId) : undefined
  }
  return namen.join(' › ')
}

/** Ist der Bereich eine Unit eines Lehrwerks (von der Automatik aus dem Lehrwerk angelegt bzw. unter einem Band)? */
const istLehrwerksUnit = (bereiche: readonly BereichKurz[], b: BereichKurz): boolean => {
  if (!einheitSchluessel(pfadText(bereiche, b))) return false
  if (b.herkunft === 'lehrwerk') return true
  // Unter einem Band, der selbst kein Unit-Name ist („Green Line 2" › „Unit 1: …")
  const eltern = b.elternId ? bereiche.find((x) => x.id === b.elternId) : undefined
  return !!eltern && !einheitSchluessel(eltern.name)
}

/** Lehrwerks-Units nach Schlüssel – je Fach (die erste gewinnt) */
export function einheitenNachSchluessel(bereiche: readonly BereichKurz[]): Map<string, BereichKurz> {
  const karte = new Map<string, BereichKurz>()
  for (const b of bereiche) {
    if (!istLehrwerksUnit(bereiche, b)) continue
    const k = `${b.fachId}#${einheitSchluessel(pfadText(bereiche, b))}`
    if (!karte.has(k)) karte.set(k, b)
  }
  return karte
}

/** Lehrwerks-Unit zu einem Text (Überthema, Quelle einer Vokabelliste) im Fach – null, wenn keine passt */
export function einheitZuText(bereiche: readonly BereichKurz[], fachId: string, text: string | undefined | null, karte = einheitenNachSchluessel(bereiche)): BereichKurz | null {
  const k = einheitSchluessel(text)
  return k ? (karte.get(`${fachId}#${k}`) ?? null) : null
}

/**
 * Frei benannte Bereiche, die eine Lehrwerks-Unit doppeln: Kennung → Kennung der Unit. Nur Bereiche ohne Unterbereiche,
 * die selbst keine Lehrwerks-Unit sind – ein selbst angelegter Ordner mit eigener Gliederung bleibt, wie er ist.
 */
export function doppelteEinheiten(bereiche: readonly BereichKurz[]): Map<string, string> {
  const karte = einheitenNachSchluessel(bereiche)
  const mitKindern = new Set(bereiche.map((b) => b.elternId).filter((x): x is string => !!x))
  const doppelt = new Map<string, string>()
  for (const b of bereiche) {
    if (mitKindern.has(b.id) || istLehrwerksUnit(bereiche, b)) continue
    const ziel = einheitZuText(bereiche, b.fachId, pfadText(bereiche, b), karte)
    if (ziel && ziel.id !== b.id) doppelt.set(b.id, ziel.id)
  }
  return doppelt
}

// ---------- Arten ----------

export type MaterialTyp = 'blaetter' | 'tests' | 'tafel' | 'vokabellisten' | 'briefe' | 'weitere'

export const TYP_NAMEN: Record<MaterialTyp, string> = {
  blaetter: 'Blätter',
  tests: 'Tests',
  tafel: 'Tafel',
  vokabellisten: 'Vokabellisten',
  briefe: 'Briefe',
  weitere: 'Weitere'
}
const TYP_FOLGE: MaterialTyp[] = ['blaetter', 'tests', 'tafel', 'vokabellisten', 'briefe', 'weitere']

/** Art eines Materials für die Chips – Tests: Lernzielkontrolle, Grammatiktest, Klassenarbeit, Vokabeltest */
export function typVon(moduleId: string): MaterialTyp {
  if (moduleId === 'arbeitsblatt') return 'blaetter'
  if (['lernzielkontrolle', 'grammatiktest', 'klassenarbeit', 'vokabeltest'].includes(moduleId)) return 'tests'
  if (moduleId === 'tafelbild') return 'tafel'
  if (moduleId === 'vokabelliste') return 'vokabellisten'
  if (moduleId === 'elternbrief') return 'briefe'
  return 'weitere'
}

/** Chips im Thema: „Alle n", dann nur die vorhandenen Arten in fester Folge. Bei nur einer Art keine Chips. */
export function typChips(moduleIds: readonly string[]): { typ: MaterialTyp | 'alle'; name: string; n: number }[] {
  const zahl = new Map<MaterialTyp, number>()
  for (const id of moduleIds) zahl.set(typVon(id), (zahl.get(typVon(id)) ?? 0) + 1)
  if (zahl.size < 2) return []
  return [
    { typ: 'alle' as const, name: 'Alle', n: moduleIds.length },
    ...TYP_FOLGE.filter((t) => zahl.has(t)).map((t) => ({ typ: t, name: TYP_NAMEN[t], n: zahl.get(t)! }))
  ]
}

// ---------- Reihen, Suche ----------

/** Material ohne das FÜR Reihen entstandene (außer eingeblendet) – eigene, in eine Reihe geholte Blätter bleiben */
export function ohneReiheErzeugtes<T extends { id: string; name: string }>(liste: readonly T[], zuordnung: ReiheZuordnung, einblenden: boolean): T[] {
  return einblenden ? [...liste] : liste.filter((m) => !istReiheMaterial(zuordnung.get(m.id), m.name))
}

/**
 * Suche über Titel, Thema, Unit und Fach: Alle Wörter der Eingabe müssen vorkommen (wie die Suche der Startseite,
 * shell/materialien.ts). `zusatz` liefert den Pfad des Themenbereichs und den Fachnamen.
 */
export function materialSuche<T extends { suchtext: string }>(liste: readonly T[], eingabe: string, zusatz: (m: T) => string): T[] {
  const woerter = eingabe.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
  if (!woerter.length) return []
  return liste.filter((m) => {
    const text = `${m.suchtext} ${zusatz(m).toLocaleLowerCase('de')}`
    return woerter.every((w) => text.includes(w))
  })
}

/** „Arbeitsblatt · Kl. 9" – Untertitel einer Zeile ohne das Fach (das steht schon oben) */
export function untertitel(artName: string, grade?: number): string {
  return [artName, grade ? `Kl. ${grade}` : ''].filter(Boolean).join(' · ')
}
