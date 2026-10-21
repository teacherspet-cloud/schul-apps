/**
 * Bilder der Medienbank je Bedeutung und Wortart (21.10.2026, Befund der Lehrkraft: Das Verb „bear" bekam das Bild eines
 * Bären). Bisher gab es EIN Bild je Sprache und Wort (shared/medienbank.ts `medienSchluessel`); die Verbliste fragt mit der
 * Grundform „bear" und traf so das Bild der Vokabel „bear – Bär". Abgestimmt:
 *  - Bilder hängen an einer Bedeutung (deutsche Übersetzung) und ihrer Wortart: ein Verb bekommt nie das Bild eines
 *    Nicht-Verbs und umgekehrt; auch gleiche Wortart mit anderer Bedeutung („bat" – Fledermaus / Schläger) bleibt getrennt.
 *  - Die Aussprache bleibt je Wort (gleiche Aussprache) – nur die Bilder ziehen um.
 *  - Ablage in einer eigenen Datei bedeutungen.json neben index.json (main/services/storage/medienbank.ts), Schlüssel =
 *    Lemma (`sinnSchluessel`): „to bear", „(to) bear" und das „bear" der Verbliste landen beim selben Lemma wie das Nomen
 *    „bear" – getrennt über die Wortart der Bedeutung.
 *  - Gleiche Bedeutung in anderer Schreibweise („Bär", „der Bär", „Bär (Tier)") ist EINE Bedeutung (`bedeutungNorm`,
 *    Überschneidung der Teile); was übrig bleibt, ordnet die KI im Medienauftrag zu bzw. führt ein Admin-Knopf zusammen.
 * Alles hier ist rein rechnend (Tests: tests/medienBedeutung.test.ts).
 */
import { medienSchluessel, sprachKurz, type Bildstufe, type MedienBild, type MedienSicht } from './medienbank'

export type Wortart = 'verb' | 'andere'
export const WORTART_NAME: Record<Wortart, string> = { verb: 'Verb', andere: 'kein Verb' }

/** Eine Bedeutung eines Lemmas mit ihren Bildern (Felder wie im Medieneintrag) */
export interface MedienBedeutung {
  /** 8 Hex, bleibt fest */
  id: string
  wortart: Wortart
  /** Bezeichnung („Bär", „ertragen") */
  deutsch: string
  /** Vereinheitlichte Übersetzungen, die zu dieser Bedeutung gehören (`bedeutungNorm`) – zugleich der Merker der SinnZuordnung */
  varianten: string[]
  /** Englischer Suchbegriff der Bildsuche („to bear", „baseball bat") – von der KI, sonst nach Regel */
  suchbegriff?: string
  bild?: MedienBild
  bildStufen?: Partial<Record<Bildstufe, MedienBild>>
  ohneBild?: Bildstufe[]
  quelle: 'migration' | 'ki' | 'hand' | 'neu'
  zeit: number
}

/** Bild aus der Zeit vor den Bedeutungen, das noch einer Bedeutung zugeordnet werden muss (KI sieht es sich an) */
export interface AltBild {
  datei: string
  stufe: Bildstufe
  /** Wortarten, zu denen es gehören kann */
  wortarten: Wortart[]
  bild: MedienBild
}

export interface SinnEintrag {
  bedeutungen: MedienBedeutung[]
  /** Mehrere Bedeutungen derselben Wortart – vielleicht nur Synonyme („Füller" / „Kugelschreiber"); die KI prüft */
  klaeren?: true
  offen?: AltBild[]
  /** Zuletzt geklärt (KI) */
  geklaert?: number
}

export interface SinnDatei {
  version?: number
  eintraege: Record<string, SinnEintrag>
}

/** Was eine Seite zu einem Wort anfragt: Wort, deutsche Bedeutung, Wortart aus der Liste bzw. ausdrücklich (Verbliste) */
export interface MedienAnfrage {
  w: string
  de?: string
  pos?: string
  art?: Wortart
}

/** Kurzangabe einer Bedeutung für die Oberfläche */
export interface BedeutungKurz {
  id: string
  deutsch: string
  wortart: Wortart
}

/** Bild einer Anfrage in der Antwort (`MedienSicht.bilder`, Schlüssel `anfrageSchluessel`) */
export interface BildTeil {
  bild?: MedienSicht['bild']
  bildStufe?: Bildstufe
  bildStufenDa?: Bildstufe[]
  ohneBild?: Bildstufe[]
  /** Nur für die Lehrkraft: zu welcher Bedeutung das Bild gehört, ob nur vorläufig, ob mehrdeutig, welche es sonst gibt */
  bedeutung?: BedeutungKurz
  vorlaeufig?: true
  mehrdeutig?: true
  andere?: BedeutungKurz[]
}

/** Bedeutung, die ein Aufrufer beim Schreiben meint: Kennung (falls bekannt), Wortart und deutsche Bedeutung */
export interface SinnAngabe {
  id?: string
  wortart: Wortart
  deutsch: string
}

/** Ergebnis der SinnZuordnung je Anfrage: die Bedeutung – oder die Kandidaten, unter denen die KI wählen soll */
export type SinnZuordnung = { id: string; deutsch: string } | { fragen: { id: string; deutsch: string }[] }

/** Ein Lemma, das auf die Klärung wartet (Admin-Knopf) */
export interface SinnStandEintrag {
  schluessel: string
  bedeutungen: { id: string; wortart: Wortart; deutsch: string; varianten: string[] }[]
  klaeren?: true
  offen: { datei: string; stufe: Bildstufe; wortarten: Wortart[] }[]
}

/** Angabe von außen bereinigen (IPC, Server) */
export function sinnBereinigt(x: unknown): SinnAngabe | undefined {
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  const deutsch = typeof o.deutsch === 'string' ? o.deutsch.slice(0, 300) : ''
  if (!deutsch.trim() && typeof o.id !== 'string') return undefined
  return { ...(typeof o.id === 'string' && /^[0-9a-f]{8}$/.test(o.id) ? { id: o.id } : {}), wortart: o.wortart === 'verb' ? 'verb' : 'andere', deutsch }
}

/** Eine einfache Anfrage nur mit dem Wort (ältere Seiten) */
export const istEinfach = (a: MedienAnfrage): boolean => !a.de && !a.pos && !a.art

/** Anfrage aus einem Wort oder einer Anfrage */
export function alsAnfrage(x: unknown): MedienAnfrage | null {
  if (typeof x === 'string') return x.trim() ? { w: x } : null
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const w = typeof o.w === 'string' ? o.w.slice(0, 300) : ''
  if (!w.trim()) return null
  const art = o.art === 'verb' || o.art === 'andere' ? o.art : undefined
  return {
    w,
    ...(typeof o.de === 'string' && o.de.trim() ? { de: o.de.slice(0, 300) } : {}),
    ...(typeof o.pos === 'string' && o.pos.trim() ? { pos: o.pos.slice(0, 40) } : {}),
    ...(art ? { art } : {})
  }
}

const VERB_POS = /^(v|vt|vi|verb|vb)$/
/** Wortart eines Listeneintrags (pos), null = unbekannt */
function wortartAusPos(pos: string | undefined): Wortart | null {
  const p = (pos ?? '')
    .replace(/[()[\].]/g, '')
    .trim()
    .toLowerCase()
  if (!p) return null
  if (VERB_POS.test(p) || p.startsWith('verb')) return 'verb'
  return 'andere'
}

const MIT_TO = /^\s*\(to\)\s+|^\s*to\s+/i

/**
 * Wortart einer Anfrage: ausdrücklich (Verbliste), sonst die Wortart der Liste (pos gewinnt – „to and fro" ist eine
 * Wendung), sonst Englisch „(to) …" bzw. „to …" = Verb, sonst kein Verb.
 */
export function wortartFuer(a: { w?: string; term?: string; pos?: string; art?: Wortart }, sprache = 'en'): Wortart {
  if (a.art === 'verb' || a.art === 'andere') return a.art
  const ausPos = wortartAusPos(a.pos)
  if (ausPos) return ausPos
  return sprachKurz(sprache) === 'en' && MIT_TO.test(a.w ?? a.term ?? '') ? 'verb' : 'andere'
}

/**
 * Lemma des Bildes: bei Verben ohne „(to)"/„to", ohne Klammerzusätze und nur die erste Schreibweise („burn/burnt") – wie
 * die Verbliste ihre Grundform schreibt (shared/verbTraining.ts `medienSchluesselVerb`). Andere Wörter bleiben, wie sie sind.
 */
export function bildLemma(term: string, wortart: Wortart): string {
  if (wortart !== 'verb') return term
  const l = term
    .replace(MIT_TO, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split('/')[0]
    .replace(/\s+/g, ' ')
    .trim()
  return l || term
}

/** Schlüssel in bedeutungen.json: Sprache + Lemma (vereinheitlicht wie die Medienbank) */
export const sinnSchluessel = (sprache: string, term: string, wortart: Wortart): string => medienSchluessel(sprache, bildLemma(term, wortart))

const PLATZHALTER = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|sich|etw\.?|etwas|jdn\.?|jdm\.?|jds\.?|jmd\.?|jemanden|jemandem|zu)\s+/i

/** Bedeutung vergleichbar machen: „der Bär", „Bär (Tier)", „Bär" → „bär" */
export function bedeutungNorm(de: string | undefined): string {
  let s = String(de ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’‚‛ʼ′´`]/g, "'")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[.,;:!?"„“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (let i = 0; i < 4; i++) {
    const n = s.replace(PLATZHALTER, '').trim()
    if (n === s || !n) break
    s = n
  }
  return s.replace(/\s+(etw\.?|jdn\.?|jdm\.?)$/i, '').trim()
}

/** Teile einer Übersetzung („buchen, reservieren" → buchen | reservieren), je vereinheitlicht */
export function bedeutungTeile(de: string | undefined): Set<string> {
  const aus = new Set<string>()
  for (const t of String(de ?? '').split(/[,;/]|\s+-\s+|\s+–\s+/)) {
    const n = bedeutungNorm(t)
    if (n) aus.add(n)
  }
  const ganz = bedeutungNorm(de)
  if (ganz) aus.add(ganz)
  return aus
}

const teileVon = (b: MedienBedeutung): Set<string> => {
  const aus = new Set<string>()
  for (const v of [...b.varianten, b.deutsch]) for (const t of bedeutungTeile(v)) aus.add(t)
  return aus
}

export type Treffer = 'genau' | 'teil' | 'einzig' | 'mehrdeutig' | 'keine'

/**
 * Welche Bedeutung meint eine Übersetzung? Nur Bedeutungen derselben Wortart zählen – ein Verb landet nie bei einem Nomen.
 *  - genau: die Übersetzung ist schon zugeordnet; teil: genau eine Bedeutung teilt einen Teil;
 *  - einzig: keine Übereinstimmung, aber es gibt nur eine Bedeutung dieser Wortart (vorläufig);
 *  - mehrdeutig: mehrere passen oder mehrere kommen in Frage; keine: diese Wortart hat noch keine Bedeutung.
 */
export function bedeutungFinden(e: SinnEintrag | undefined, art: Wortart, de: string | undefined): { b?: MedienBedeutung; wie: Treffer } {
  const gleich = (e?.bedeutungen ?? []).filter((b) => b.wortart === art)
  if (!gleich.length) return { wie: 'keine' }
  const n = bedeutungNorm(de)
  if (n) {
    const g = gleich.find((b) => b.varianten.includes(n) || bedeutungNorm(b.deutsch) === n)
    if (g) return { b: g, wie: 'genau' }
    const teile = bedeutungTeile(de)
    const passend = gleich.filter((b) => [...teileVon(b)].some((t) => teile.has(t)))
    if (passend.length === 1) return { b: passend[0], wie: 'teil' }
    if (passend.length > 1) return { wie: 'mehrdeutig' }
  }
  if (gleich.length === 1) return { b: gleich[0], wie: 'einzig' }
  return { wie: 'mehrdeutig' }
}

/** Schlüssel einer Anfrage in `MedienSicht.bilder` – Seite und Ablage rechnen ihn gleich */
export const anfrageSchluessel = (a: MedienAnfrage, sprache = 'en'): string =>
  istEinfach(a) ? a.w : `${a.w}|${wortartFuer(a, sprache)}|${bedeutungNorm(a.de)}`

export interface Aufloesung {
  /** Die Bedeutung, deren Bild gilt */
  b?: MedienBedeutung
  /** Nur vorläufig zugeordnet (einzige Bedeutung der Wortart, Übersetzung weicht ab) */
  vorlaeufig?: true
  /** Mehrere Bedeutungen kommen in Frage – kein Bild, bis der Medienauftrag zuordnet */
  mehrdeutig?: true
  /** Das alte Bild aus index.json darf gelten (Lemma ohne Bedeutungen) */
  altErlaubt: boolean
}

/**
 * Lese-Regeln (abgestimmt 21.10.2026):
 *  - Anfrage mit Bedeutung/Wortart: genau/teil → diese Bedeutung; einzig → vorläufig; mehrdeutig → kein Bild.
 *  - Einfache Anfrage (nur das Wort, ältere Seiten): das Bild nur, wenn das Lemma genau EINE Bedeutung hat.
 *  - Das alte Bild (index.json) nur, wenn das Lemma noch keine Bedeutungen hat und kein altes Bild auf seine SinnZuordnung
 *    wartet; der Aufrufer prüft dazu die Wortart des alten Schlüssels (`altPasst`).
 */
export function aufloesen(e: SinnEintrag | undefined, a: MedienAnfrage, sprache = 'en'): Aufloesung {
  const alle = e?.bedeutungen ?? []
  const wartet = Boolean(e?.offen?.length)
  if (istEinfach(a)) {
    if (alle.length === 1) return { b: alle[0], altErlaubt: false }
    return { altErlaubt: !alle.length && !wartet, ...(alle.length > 1 ? { mehrdeutig: true as const } : {}) }
  }
  const art = wortartFuer(a, sprache)
  const f = bedeutungFinden(e, art, a.de)
  if (f.b) return { b: f.b, altErlaubt: false, ...(f.wie === 'einzig' ? { vorlaeufig: true as const } : {}) }
  if (f.wie === 'mehrdeutig') return { mehrdeutig: true, altErlaubt: false }
  // Diese Wortart hat noch keine Bedeutung: das alte Bild nur ohne jede Bedeutung und ohne wartendes altes Bild
  return { altErlaubt: !alle.length && !wartet }
}

/**
 * Unter welchen Wörtern von index.json darf das alte Bild für diese Anfrage liegen? Englische Verben nur unter „to …" –
 * ein Verb der Verbliste („bear") sieht also nie das alte Bild von „bear" (das Nomen), wohl aber das von „to bear".
 * Andere Wörter und andere Sprachen: unter dem Wort selbst.
 */
export function altSchluesselFuer(sprache: string, a: MedienAnfrage): string[] {
  const art = istEinfach(a) ? null : wortartFuer(a, sprache)
  if (sprachKurz(sprache) !== 'en' || art === null) return [a.w]
  const lemma = bildLemma(a.w, art)
  if (art === 'verb') return [...new Set([MIT_TO.test(a.w) ? a.w : `to ${lemma}`, `to ${lemma}`])]
  return [a.w]
}

/** Neue Kennung einer Bedeutung */
export const neueBedeutungsId = (): string =>
  Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')

/** Suchbegriff der Bildsuche: der der Bedeutung, sonst bei englischen Verben „to …", sonst das Wort */
export function suchbegriffFuer(sprache: string, term: string, wortart: Wortart, b?: Pick<MedienBedeutung, 'suchbegriff'>): string {
  if (b?.suchbegriff?.trim()) return b.suchbegriff.trim()
  if (sprachKurz(sprache) === 'en' && wortart === 'verb') return `to ${bildLemma(term, 'verb')}`
  return term
}

/**
 * Hinweis an die KI zu Wortart und Bedeutung (Motiv, Bildwahl, Bild-KI): „Verb: to bear = ertragen – die Handlung zeigen,
 * nicht ein gleichnamiges Tier oder einen Gegenstand". `andere`: die übrigen Bedeutungen des Lemmas (ausdrücklich nicht gemeint).
 */
export function bedeutungsHinweis(
  sprache: string,
  term: string,
  wortart: Wortart,
  deutsch: string,
  andere: { wortart: Wortart; deutsch: string }[] = []
): string {
  const nicht = andere.filter((x) => x.deutsch && bedeutungNorm(x.deutsch) !== bedeutungNorm(deutsch))
  const lemma = bildLemma(term, wortart)
  const teil =
    wortart === 'verb'
      ? `Wortart: Verb${
          sprachKurz(sprache) === 'en' ? ` („to ${lemma}")` : ''
        } – Bedeutung: „${deutsch}". Zeige die Handlung bzw. den Vorgang, nie ein gleichnamiges Tier, einen Gegenstand oder eine Person mit demselben Namen.`
      : `Wortart: kein Verb – Bedeutung: „${deutsch}". Zeige genau diese Bedeutung.`
  return nicht.length ? `${teil} NICHT gemeint: ${nicht.map((x) => `„${x.deutsch}" (${WORTART_NAME[x.wortart]})`).join(', ')}.` : teil
}

// ---------------------------------------------------------------- Einrichten (Wartung, ohne KI)

/** Ein Wort aus Lehrwerken, Verblisten, Tests und Kursen */
export interface KorpusWort {
  sprache: string
  term: string
  translation: string
  pos?: string
  art?: Wortart
}

/** Bedeutungsgruppen je Lemma und Wortart (Vereinigung über gemeinsame Teile der Übersetzungen) */
export interface LemmaGruppen {
  schluessel: string
  sprache: string
  /** Wortart → Gruppen von Übersetzungen (vereinheitlicht), je Gruppe die häufigste Schreibweise als Bezeichnung */
  gruppen: { wortart: Wortart; deutsch: string; varianten: string[] }[]
  /** Unter welchen bisherigen Wörtern (Schlüsseln von index.json) die Einträge stehen, je Wortart */
  woerter: { wort: string; wortart: Wortart }[]
}

export function gruppiereKorpus(korpus: KorpusWort[]): Map<string, LemmaGruppen> {
  const roh = new Map<
    string,
    { sprache: string; je: Map<Wortart, Map<string, { n: number; zeigen: Map<string, number> }>>; woerter: Map<string, Set<Wortart>> }
  >()
  for (const k of korpus) {
    if (!k.term?.trim() || !k.translation?.trim()) continue
    const art = wortartFuer({ term: k.term, pos: k.pos, art: k.art }, k.sprache)
    const schluessel = sinnSchluessel(k.sprache, k.term, art)
    let r = roh.get(schluessel)
    if (!r) roh.set(schluessel, (r = { sprache: sprachKurz(k.sprache), je: new Map(), woerter: new Map() }))
    r.woerter.set(k.term, new Set([...(r.woerter.get(k.term) ?? []), art]))
    let je = r.je.get(art)
    if (!je) r.je.set(art, (je = new Map()))
    const n = bedeutungNorm(k.translation)
    if (!n) continue
    const x = je.get(n) ?? { n: 0, zeigen: new Map<string, number>() }
    x.n++
    x.zeigen.set(k.translation.trim(), (x.zeigen.get(k.translation.trim()) ?? 0) + 1)
    je.set(n, x)
  }
  const aus = new Map<string, LemmaGruppen>()
  for (const [schluessel, r] of roh) {
    const gruppen: LemmaGruppen['gruppen'] = []
    for (const [wortart, je] of r.je) {
      // Vereinigung: Übersetzungen mit gemeinsamem Teil gehören zusammen
      const normen = [...je.keys()]
      const eltern = normen.map((_, i) => i)
      const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])))
      const teile = normen.map((n) => bedeutungTeile(n))
      for (let i = 0; i < normen.length; i++)
        for (let j = i + 1; j < normen.length; j++) if ([...teile[i]].some((t) => teile[j].has(t))) eltern[wurzel(i)] = wurzel(j)
      const nach = new Map<number, string[]>()
      normen.forEach((n, i) => nach.set(wurzel(i), [...(nach.get(wurzel(i)) ?? []), n]))
      for (const varianten of nach.values()) {
        // Bezeichnung: die häufigste Schreibweise der häufigsten Übersetzung
        const best = [...varianten].sort((a, b) => je.get(b)!.n - je.get(a)!.n)[0]
        const zeigen = [...je.get(best)!.zeigen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? best
        gruppen.push({ wortart, deutsch: zeigen, varianten: varianten.sort() })
      }
    }
    aus.set(schluessel, {
      schluessel,
      sprache: r.sprache,
      gruppen,
      woerter: [...r.woerter].flatMap(([wort, arten]) => [...arten].map((wortart) => ({ wort, wortart })))
    })
  }
  return aus
}

/** Was eine Seite zu einer Vokabel anfragt (Wort, Übersetzung, Wortart der Liste bzw. ausdrücklich) */
export const anfrageVon = (v: { term: string; translation?: string; pos?: string; wortart?: Wortart }): MedienAnfrage => ({
  w: v.term,
  ...(v.translation?.trim() ? { de: v.translation } : {}),
  ...(v.pos?.trim() ? { pos: v.pos } : {}),
  ...(v.wortart ? { art: v.wortart } : {})
})

/**
 * Das Bild einer Vokabel aus der Antwort der Medienbank: das ihrer Bedeutung. Antwortet eine ältere Ablage ohne
 * `bilder`, gilt das Bild des Wortes – aber nie für ein Verb aus einer Verbliste (`wortart` ausdrücklich), dessen Wort
 * sonst das Nomen trifft.
 */
export function bildVon(
  sicht: MedienSicht | undefined,
  v: { term: string; translation?: string; pos?: string; wortart?: Wortart },
  sprache = 'en'
): BildTeil | undefined {
  if (!sicht) return undefined
  const a = anfrageVon(v)
  if (sicht.bilder) return sicht.bilder[anfrageSchluessel(a, sprache)] ?? (istEinfach(a) ? sicht : undefined)
  if (v.wortart === 'verb' && !MIT_TO.test(v.term)) return undefined
  return sicht
}
