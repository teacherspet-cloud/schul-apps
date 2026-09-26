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
import { bereichsName, lehrplanSchulform, type LehrplanDatei, type LehrplanUnterthema } from '@shared/lehrplan'
import { THEMENBLOECKE } from '../modules/lernzielkontrolle/didactics/themen'
import { CURRICULUM_TOPICS } from '../modules/klassenarbeit/model/curriculumGeschichte'
import { GRAMMAR_TOPICS } from '../modules/arbeitsblatt/didactics/grammarTopics'
import { LEHRWERK_THEMEN } from './lehrwerkThemen'
import type { KatalogThema } from './themenVorschlag'

/** Ein Thema im Baum; `kinder` sind seine Unterthemen */
export interface KatalogKnoten {
  name: string
  /** Wortlaut des Lehrplans, wenn `name` daraus gekürzt ist (Paket 13) – als Tooltip am Bereich */
  wortlaut?: string
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
 *
 * Seit Paket 13 ebenso Kompetenz- und Leitsätze („lineare Funktionen … analysieren …",
 * „Enzyme steuern Lebensvorgänge in Zellen"; gemeldet von der Lehrkraft): Aus ihnen wird kein
 * Bereich (`bereichsName` liefert null), ihre Wörter zählen beim Oberthema, und ihre eigenen
 * Unterthemen rücken eine Ebene hoch. Ein Material zu „Winkelsummensatz …" landet so im
 * Oberthema „Körper und Figuren" statt in einem Ordner mit Satz-Namen.
 */
function ausUnterthemen(
  liste: LehrplanUnterthema[] | undefined,
  jahrgaenge: number[] | undefined,
  eltern = ''
): { kinder: KatalogKnoten[]; beispiele: string } {
  const kinder: KatalogKnoten[] = []
  const beispiele: string[] = []
  for (const u of liste ?? []) {
    if (u.beispiel) {
      beispiele.push(u.thema)
      continue
    }
    const n = bereichsName(u.thema)
    const tiefer = ausUnterthemen(u.unterthemen, jahrgaenge, n?.name ?? eltern)
    // Kurzform wie das Oberthema („lineare Zusammenhänge identifizieren …" unter „Lineare Zusammenhänge"): kein zweiter Ordner gleichen Namens
    if (!n || gleich(n.name, eltern)) {
      beispiele.push(u.thema, tiefer.beispiele)
      kinder.push(...tiefer.kinder)
      continue
    }
    kinder.push({
      name: n.name,
      ...(n.wortlaut ? { wortlaut: n.wortlaut } : {}),
      quelle: 'lehrplan',
      // Der volle Wortlaut zählt beim Vergleich mit – gekürzt wird nur der Ordnername
      zusatz: [n.wortlaut, tiefer.beispiele].filter(Boolean).join(' ') || undefined,
      jahrgaenge,
      kinder: tiefer.kinder
    })
  }
  return { kinder, beispiele: beispiele.filter(Boolean).join(' ') }
}

/**
 * Oberthemen eines Fachs aus der Lehrplandatei (optional nur für eine Schulform der App –
 * übersetzt in die Schulformen der Datei, `lehrplanSchulform`).
 */
export function lehrplanBaum(lehrplan: LehrplanDatei | null | undefined, fachId: string, schulform?: string): KatalogKnoten[] {
  if (!lehrplan) return []
  const form = lehrplanSchulform(schulform)
  const knoten: KatalogKnoten[] = []
  for (const e of lehrplan.eintraege) {
    if (e.fach !== fachId) continue
    if (form && e.schulformen?.length && !e.schulformen.includes(form)) continue
    const n = bereichsName(e.thema)
    const unter = ausUnterthemen(e.unterthemen, e.jahrgaenge, n?.name)
    const zusatz = [n?.wortlaut, unter.beispiele, ...(e.stichwoerter ?? [])].filter(Boolean).join(' ') || undefined
    if (!n) {
      // Oberthema ohne brauchbaren Namen: Seine Unterthemen stehen oben, sein Text zählt bei ihnen mit
      for (const k of unter.kinder) knoten.push({ ...k, zusatz: [k.zusatz, e.thema, zusatz].filter(Boolean).join(' ') })
      continue
    }
    knoten.push({ name: n.name, ...(n.wortlaut ? { wortlaut: n.wortlaut } : {}), quelle: 'lehrplan', zusatz, jahrgaenge: e.jahrgaenge, kinder: unter.kinder })
  }
  return zusammenlegen(knoten)
}

/**
 * Der Rückfall: die flachen Lehrplanthemen, die die App schon mitbringt. Seit Paket 13 nur die
 * des Landes (und der Schulform), für das das Material gemacht ist – wie bei der Lehrplandatei.
 * Ohne Land (ältere Aufrufe) alle, wie bis Paket 12.
 */
function vorhandeneLehrplanthemen(fachId: string, land?: string, schulform?: string): KatalogKnoten[] {
  const liste: KatalogKnoten[] = []
  for (const b of THEMENBLOECKE) {
    if (b.fach !== fachId || (land && b.stateId !== land)) continue
    if (schulform && b.schulformen?.length && !b.schulformen.includes(schulform)) continue
    for (const t of b.themen) liste.push({ name: t, quelle: 'lehrplan', jahrgaenge: b.jahrgaenge, kinder: [] })
  }
  if (fachId === 'geschichte')
    for (const t of CURRICULUM_TOPICS)
      if ((!land || t.stateId === land) && (!schulform || t.schoolTypeIds.includes(schulform)))
        liste.push({ name: t.label, quelle: 'lehrplan', jahrgaenge: t.grades, kinder: [] })
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
export function katalogBaum(fachId: string, lehrplan?: LehrplanDatei | null, schulform?: string, land?: string): KatalogKnoten[] {
  const schluessel = `${fachId}|${lehrplan?.stateId ?? ''}|${lehrplan?.stand ?? ''}|${lehrplan?.eintraege.length ?? 0}|${schulform ?? ''}|${land ?? ''}`
  const da = cache.get(schluessel)
  if (da) return da
  const ausDatei = lehrplanBaum(lehrplan, fachId, schulform)
  const baum = [
    ...zusammenlegen(ausDatei.length ? ausDatei : vorhandeneLehrplanthemen(fachId, land, schulform)),
    ...lehrwerkBaum(fachId),
    ...zusammenlegen(
      GRAMMAR_TOPICS.filter((g) => g.subject === fachId).map((g) => ({ name: g.label, zusatz: g.term, quelle: 'grammatik' as const, kinder: [] }))
    )
  ]
  cache.set(schluessel, baum)
  return baum
}

/** Derselbe Baum flach – jedes Thema mit seinen Oberthemen (`pfad`) */
export function katalogFuer(fachId: string, lehrplan?: LehrplanDatei | null, schulform?: string, land?: string): KatalogThema[] {
  const out: KatalogThema[] = []
  const gehe = (knoten: KatalogKnoten[], pfad: KatalogKnoten[]): void => {
    for (const k of knoten) {
      out.push({
        name: k.name,
        quelle: k.quelle,
        ...(k.wortlaut ? { wortlaut: k.wortlaut } : {}),
        ...(k.zusatz ? { zusatz: k.zusatz } : {}),
        ...(k.jahrgaenge ? { jahrgaenge: k.jahrgaenge } : {}),
        ...(pfad.length ? { pfad: pfad.map((p) => p.name) } : {}),
        ...(pfad.some((p) => p.wortlaut) ? { pfadWortlaut: pfad.map((p) => p.wortlaut ?? '') } : {})
      })
      gehe(k.kinder, [...pfad, k])
    }
  }
  gehe(katalogBaum(fachId, lehrplan, schulform, land), [])
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
