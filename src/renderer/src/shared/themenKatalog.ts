/**
 * Belegte Themen je Fach für die Themenbereiche – als HIERARCHIE (Paket 10b, erweitert in
 * Paket 12).
 *
 * Nichts Neues erfunden – nur zusammengetragen, was die App aus der Recherche kennt:
 * 1. Lehrplandatei des Landes (resources/lehrplaene/<LAND>.json, Paket 14) mit Oberthemen und
 *    Unterthemen – wenn es sie für das Land und das Fach gibt. Sie wird über den Hauptprozess
 *    gelesen (`lehrplan:themen`, siehe `ladeLehrplan`).
 * 2. Sonst – Rückfall – die flachen Lehrplanthemen, die die App schon mitbringt:
 *    Lernzielkontrolle (lernzielkontrolle/didactics/themenDaten.ts) und Geschichtsthemen der
 *    Klassenarbeit (klassenarbeit/model/curriculumGeschichte.ts).
 * 3. Immer dazu: Units der Lehrwerke als Band › Unit (shared/lehrwerkThemen.ts; Green Line:
 *    Band N = Klasse N + 4) und Grammatikthemen der Sprachenfächer (grammarTopics.ts).
 *
 * `katalogBaum` liefert den Baum, `katalogFuer` dieselben Themen flach, jedes mit seinem Pfad
 * (Oberthemen) – so kann die Automatik ein Material in „Der Erste Weltkrieg › Ursachen des
 * Ersten Weltkriegs" einsortieren und die fehlenden Ebenen anlegen.
 *
 * Getrennt von themenVorschlag.ts, damit die Vorschlagslogik ohne die großen Datenlisten
 * prüfbar bleibt.
 */
import type { LehrplanDatei, LehrplanUnterthema } from '@shared/lehrplan'
import { THEMENBLOECKE } from '../modules/lernzielkontrolle/didactics/themen'
import { CURRICULUM_TOPICS } from '../modules/klassenarbeit/model/curriculumGeschichte'
import { GRAMMAR_TOPICS } from '../modules/arbeitsblatt/didactics/grammarTopics'
import { LEHRWERK_THEMEN } from './lehrwerkThemen'
import type { KatalogThema } from './themenVorschlag'

/** Ein Thema im Baum; `kinder` sind seine Unterthemen */
export interface KatalogKnoten {
  name: string
  quelle: KatalogThema['quelle']
  zusatz?: string
  jahrgaenge?: number[]
  kinder: KatalogKnoten[]
}

/** Jahrgang eines Lehrwerksbandes: „Green Line 3" → Klasse 7; unbekannt → keine Einschränkung */
function lehrwerkJahrgang(buch: string): number[] | undefined {
  const n = /(\d+)\s*$/.exec(buch)?.[1]
  if (n) return [Number(n) + 4]
  if (/transition/i.test(buch)) return [11]
  return undefined
}

const gleich = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de')

/** Gleichnamige Knoten einer Ebene zusammenlegen (mehrere Schulformen, Doppeljahrgänge) – Jahrgänge und Kinder vereinigen */
function zusammenlegen(knoten: KatalogKnoten[]): KatalogKnoten[] {
  const out: KatalogKnoten[] = []
  for (const k of knoten) {
    const da = out.find((x) => x.quelle === k.quelle && gleich(x.name, k.name))
    if (!da) {
      out.push({ ...k, kinder: [...k.kinder] })
      continue
    }
    da.jahrgaenge = da.jahrgaenge && k.jahrgaenge ? [...new Set([...da.jahrgaenge, ...k.jahrgaenge])].sort((a, b) => a - b) : undefined
    da.zusatz = [da.zusatz, k.zusatz].filter(Boolean).join(' ') || undefined
    da.kinder = [...da.kinder, ...k.kinder]
  }
  for (const k of out) k.kinder = zusammenlegen(k.kinder)
  return out
}

/**
 * Unterthemen aus der Lehrplandatei. „z. B."-Beispiele (`beispiel`) werden KEINE eigenen
 * Bereiche – „Ort", „Region" als Ordner wären Lärm –, ihre Wörter zählen aber beim Vergleich
 * für das Oberthema mit.
 */
function ausUnterthemen(liste: LehrplanUnterthema[] | undefined, jahrgaenge: number[] | undefined): { kinder: KatalogKnoten[]; beispiele: string } {
  const kinder: KatalogKnoten[] = []
  const beispiele: string[] = []
  for (const u of liste ?? []) {
    if (u.beispiel) {
      beispiele.push(u.thema)
      continue
    }
    const tiefer = ausUnterthemen(u.unterthemen, jahrgaenge)
    kinder.push({ name: u.thema, quelle: 'lehrplan', zusatz: tiefer.beispiele || undefined, jahrgaenge, kinder: tiefer.kinder })
  }
  return { kinder, beispiele: beispiele.join(' ') }
}

/** Oberthemen eines Fachs aus der Lehrplandatei (optional nur für eine Schulform) */
export function lehrplanBaum(lehrplan: LehrplanDatei | null | undefined, fachId: string, schulform?: string): KatalogKnoten[] {
  if (!lehrplan) return []
  const knoten: KatalogKnoten[] = []
  for (const e of lehrplan.eintraege) {
    if (e.fach !== fachId) continue
    if (schulform && e.schulformen?.length && !e.schulformen.includes(schulform)) continue
    const unter = ausUnterthemen(e.unterthemen, e.jahrgaenge)
    knoten.push({
      name: e.thema,
      quelle: 'lehrplan',
      zusatz: [unter.beispiele, ...(e.stichwoerter ?? [])].filter(Boolean).join(' ') || undefined,
      jahrgaenge: e.jahrgaenge,
      kinder: unter.kinder
    })
  }
  return zusammenlegen(knoten)
}

/** Der Rückfall: die flachen Lehrplanthemen, die die App schon mitbringt */
function vorhandeneLehrplanthemen(fachId: string): KatalogKnoten[] {
  const liste: KatalogKnoten[] = []
  for (const b of THEMENBLOECKE)
    if (b.fach === fachId) for (const t of b.themen) liste.push({ name: t, quelle: 'lehrplan', jahrgaenge: b.jahrgaenge, kinder: [] })
  if (fachId === 'geschichte') for (const t of CURRICULUM_TOPICS) liste.push({ name: t.label, quelle: 'lehrplan', jahrgaenge: t.grades, kinder: [] })
  return liste
}

/** Lehrwerke: Band › Unit (nur Englisch; die Units sind nur für Green Line hinterlegt) */
function lehrwerkBaum(fachId: string): KatalogKnoten[] {
  if (fachId !== 'englisch') return []
  return Object.entries(LEHRWERK_THEMEN).map(([buch, { kapitel }]) => ({
    name: buch,
    quelle: 'lehrwerk' as const,
    jahrgaenge: lehrwerkJahrgang(buch),
    kinder: Object.entries(kapitel).map(([key, k]) => ({
      name: `${key}: ${k.titel}`,
      zusatz: [buch, k.thema, k.ort, k.grammatik].filter(Boolean).join(' '),
      quelle: 'lehrwerk' as const,
      jahrgaenge: lehrwerkJahrgang(buch),
      kinder: []
    }))
  }))
}

const cache = new Map<string, KatalogKnoten[]>()

/**
 * Der Themenbaum eines Fachs. Mit Lehrplandatei (und Einträgen für dieses Fach) gilt sie; sonst
 * die mitgebrachten flachen Themen. Lehrwerk und Grammatik kommen in beiden Fällen dazu.
 */
export function katalogBaum(fachId: string, lehrplan?: LehrplanDatei | null, schulform?: string): KatalogKnoten[] {
  const schluessel = `${fachId}|${lehrplan?.stateId ?? ''}|${lehrplan?.stand ?? ''}|${lehrplan?.eintraege.length ?? 0}|${schulform ?? ''}`
  const da = cache.get(schluessel)
  if (da) return da
  const ausDatei = lehrplanBaum(lehrplan, fachId, schulform)
  const baum = [
    ...zusammenlegen(ausDatei.length ? ausDatei : vorhandeneLehrplanthemen(fachId)),
    ...lehrwerkBaum(fachId),
    ...zusammenlegen(
      GRAMMAR_TOPICS.filter((g) => g.subject === fachId).map((g) => ({ name: g.label, zusatz: g.term, quelle: 'grammatik' as const, kinder: [] }))
    )
  ]
  cache.set(schluessel, baum)
  return baum
}

/** Derselbe Baum flach – jedes Thema mit seinen Oberthemen (`pfad`) */
export function katalogFuer(fachId: string, lehrplan?: LehrplanDatei | null, schulform?: string): KatalogThema[] {
  const out: KatalogThema[] = []
  const gehe = (knoten: KatalogKnoten[], pfad: string[]): void => {
    for (const k of knoten) {
      out.push({
        name: k.name,
        quelle: k.quelle,
        ...(k.zusatz ? { zusatz: k.zusatz } : {}),
        ...(k.jahrgaenge ? { jahrgaenge: k.jahrgaenge } : {}),
        ...(pfad.length ? { pfad } : {})
      })
      gehe(k.kinder, [...pfad, k.name])
    }
  }
  gehe(katalogBaum(fachId, lehrplan, schulform), [])
  return out
}

// ---------- Lehrplandatei laden (über den Hauptprozess) ----------

const geladen = new Map<string, Promise<LehrplanDatei | null>>()

/**
 * Die Lehrplandatei eines Landes – einmal je Sitzung geholt. Ohne Datei (oder im Test ohne
 * Hauptprozess) null: Dann gilt der Rückfall auf die mitgebrachten Themen.
 */
export function ladeLehrplan(stateId: string): Promise<LehrplanDatei | null> {
  if (!stateId) return Promise.resolve(null)
  let p = geladen.get(stateId)
  if (!p) {
    p = (typeof window !== 'undefined' && window.api?.lehrplan ? window.api.lehrplan.themen(stateId) : Promise.resolve(null)).catch(() => null)
    geladen.set(stateId, p)
  }
  return p
}
