/**
 * Fußnoten und Worthilfen eines Materialtexts – EINE Zählung mit hochgestellten Ziffern (01.10.2026).
 *
 * Wunsch der Lehrkraft: Jede Anmerkung zu einem Material ist im Text mit einer HOCHGESTELLTEN
 * Ziffer markiert (¹ ² ³), und dieselbe Ziffer steht vor der Anmerkung unter dem Material. Keine
 * „(1)", „[1]", Sternchen oder unmarkierten Wörter – am Bildschirm, im Druck/PDF und in Word gleich.
 *
 * Zwei Quellen werden gemeinsam gezählt, in der Reihenfolge ihrer Stelle im Text:
 *   - Fußnoten aus dem Textauswahl-Menü: Marke `[^kennung]` im Text, Eintrag in `fussnoten`.
 *   - Worthilfen (`glossary`, auch ältere und von der KI erzeugte): Die Stelle ist das erste
 *     Vorkommen des Begriffs im Text. Alte Kennzeichnungen („¹ preserve", „(1) preserve",
 *     „[1]" bzw. „*" hinter dem Wort im Text) werden dabei in die neue Form überführt.
 * Gespeichert wird keine Ziffer: Nach jeder Änderung zählt die App neu, auch über Seitenumbrüche
 * hinweg (die Liste steht immer am Ende des Materials, auch im Folgestück).
 *
 * Die ANZEIGE trägt die Ziffern als `^{n}` (Textformat, shared/richtext/parse.ts) – so setzt
 * derselbe Weg sie am Bildschirm als <sup> und in Word als hochgestellten Lauf.
 */
import type { TextBlock } from '../model/types'

export interface Anmerkung {
  nr: number
  art: 'fussnote' | 'worthilfe'
  /** Stelle in `fussnoten` bzw. `glossary` */
  index: number
  /** Steht die Ziffer im Text? (Eine Worthilfe, deren Begriff im Text fehlt, nicht) */
  imText: boolean
  /** Stichwort und Erklärung, bereinigt um alte Kennzeichnungen */
  wort: string
  text: string
}

export interface AnmerkungsSatz {
  /** Der Text mit hochgestellten Ziffern `^{n}` – für Anzeige und Export */
  anzeige: string
  anmerkungen: Anmerkung[]
}

/** Fußnotenmarke im Text */
export const FUSSNOTE_MARKE = /\[\^([^\]\s]+)\]/g

const HOCH = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const hochZiffern = (n: number): string => [...String(n)].map((z) => HOCH[Number(z)]).join('')
const ausHoch = (s: string): number => Number([...s].map((z) => HOCH.indexOf(z)).join(''))

/** Alte Kennzeichnung vor einer Worthilfe: „¹ ", „(1) ", „[1] ", „1) ", „1. ", „* " */
const ALTE_NUMMER = /^\s*(?:([⁰¹²³⁴⁵⁶⁷⁸⁹]+)|\((\d{1,2})\)|\[(\d{1,2})\]|(\d{1,2})[.)](?=\s)|(\*+))\s*/

/** Ziffer als hochgestelltes Zeichen (für Hinweise und Tests) */
export const hochgestellt = hochZiffern

/** Begriff ohne alte Kennzeichnung; dazu die alte Nummer bzw. Sternzahl */
export function alteKennzeichnung(term: string): { term: string; nummer?: number; sterne?: number } {
  const m = ALTE_NUMMER.exec(term)
  if (!m) return { term: term.trim() }
  const rest = term.slice(m[0].length).trim()
  if (!rest) return { term: term.trim() }
  if (m[1]) return { term: rest, nummer: ausHoch(m[1]) }
  if (m[5]) return { term: rest, sterne: m[5].length }
  return { term: rest, nummer: Number(m[2] ?? m[3] ?? m[4]) }
}

/** Bereiche, in denen keine Marke gesetzt wird: Formeln, Lücken, Fußnotenmarken, Hochgestelltes */
function sperrBereiche(text: string): [number, number][] {
  const out: [number, number][] = []
  for (const re of [/\$[^$]*\$/g, /\[\[[\s\S]*?\]\]/g, /\[\^[^\]]*\]/g, /\^\{[^}]*\}/g]) {
    for (let m = re.exec(text); m; m = re.exec(text)) out.push([m.index, m.index + m[0].length])
  }
  return out
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Zwischen zwei Zeichen dürfen Auszeichnungen stehen (**, *, ==, ++) */
const MARKEN_ZWISCHEN = '(?:\\*\\*|\\*|==|\\+\\+)*'

/**
 * Erstes Vorkommen eines Worthilfe-Begriffs im Text (Ende der Fundstelle), sonst -1.
 *
 * Gesucht wird als ganzes Wort, Groß-/Kleinschreibung egal, mit kurzer Endung („Pfand" →
 * „Pfandes", „preserve" → „preserved"); ein „to " vor englischen Verben darf im Text fehlen.
 */
export function begriffImText(text: string, begriff: string, ab = 0): number {
  const roh = begriff
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*[,;/].*$/, '')
    .trim()
  if (!roh) return -1
  const kandidaten = [roh, roh.replace(/^(to|the|a|an|le|la|les|l'|el|los|las|der|die|das)\s+/i, ''), roh.replace(/e$/i, '')].filter(
    (k, i, a) => k.length >= 2 && a.indexOf(k) === i
  )
  const sperre = sperrBereiche(text)
  for (const k of kandidaten) {
    const woerter = k.split(/\s+/).map((w) => [...w].map(escape).join(MARKEN_ZWISCHEN))
    const kern = woerter.join(`(?:\\s|${MARKEN_ZWISCHEN})+`)
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${kern}\\p{L}{0,${k === roh ? 3 : 4}}(?![\\p{L}\\p{N}])`, 'giu')
    re.lastIndex = ab
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const ende = m.index + m[0].length
      if (!sperre.some(([a, b]) => m!.index < b && ende > a)) return ende
    }
  }
  return -1
}

/**
 * Anzeige und Anmerkungen eines Materialtexts.
 *
 * `body` ist der ganze Text (alle Absätze) – die Zählung läuft über das ganze Material, auch wenn
 * es über zwei Seiten geteilt ist.
 */
export function anmerkungenVon(block: Pick<TextBlock, 'body' | 'glossary' | 'fussnoten'>): AnmerkungsSatz {
  const body = block.body ?? ''
  const fussnoten = block.fussnoten ?? []
  const glossar = block.glossary ?? []
  /** Stellen im Rohtext: Einfügen (Ende des Worts) bzw. Ersetzen (Fußnoten- und Altmarken) */
  const stellen: { pos: number; ende: number; art: Anmerkung['art']; index: number }[] = []

  // 1. Fußnotenmarken
  for (const m of body.matchAll(FUSSNOTE_MARKE)) {
    const index = fussnoten.findIndex((f) => f.id === m[1])
    // Doppelte Marke derselben Fußnote: nur die erste zählt, die zweite verschwindet in der Anzeige
    if (index >= 0 && !stellen.some((s) => s.art === 'fussnote' && s.index === index))
      stellen.push({ pos: m.index!, ende: m.index! + m[0].length, art: 'fussnote', index })
    else stellen.push({ pos: m.index!, ende: m.index! + m[0].length, art: 'fussnote', index: -1 })
  }

  // 2. Worthilfen – alte Kennzeichnungen zuerst über ihre Marke im Text, sonst über den Begriff
  const bereinigt = glossar.map((g) => ({ ...alteKennzeichnung(g.term ?? ''), explanation: g.explanation ?? '' }))
  const vergeben = new Set<number>()
  const altMarke = (nummer: number): RegExp =>
    new RegExp(`(?<=[\\p{L}\\p{N}.,;:!?»“”"'’)])(?:[ \\u00a0]?(?:\\[${nummer}\\]|\\(${nummer}\\))|${hochZiffern(nummer)}(?![⁰¹²³⁴⁵⁶⁷⁸⁹]))`, 'u')
  const frei = (a: number, b: number): boolean => !stellen.some((s) => a < s.ende && b > s.pos)
  bereinigt.forEach((g, index) => {
    if (g.nummer === undefined && g.sterne === undefined) return
    const re = g.nummer !== undefined ? altMarke(g.nummer) : new RegExp(`(?<=[\\p{L}\\p{N}])\\*{${g.sterne}}(?!\\*)`, 'u')
    // Die erste noch freie Marke dieser Art (gleiche Nummer kann in alten Texten zweimal vorkommen)
    const m = [...body.matchAll(new RegExp(re.source, 'gu'))].find((x) => frei(x.index!, x.index! + x[0].length))
    if (m && m.index !== undefined) {
      stellen.push({ pos: m.index, ende: m.index + m[0].length, art: 'worthilfe', index })
      vergeben.add(index)
    }
  })
  bereinigt.forEach((g, index) => {
    if (vergeben.has(index)) return
    const ende = begriffImText(body, g.term)
    if (ende >= 0 && frei(ende, ende)) {
      // Eine schon vorhandene hochgestellte Ziffer direkt dahinter (alte Texte) wird ersetzt
      const alt = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/.exec(body.slice(ende))
      stellen.push({ pos: ende, ende: ende + (alt?.[0].length ?? 0), art: 'worthilfe', index })
      vergeben.add(index)
    }
  })

  // 3. Zählen in der Reihenfolge im Text; Worthilfen ohne Stelle hinten
  const geordnet = stellen.filter((s) => s.index >= 0).sort((a, b) => a.pos - b.pos)
  const anmerkungen: Anmerkung[] = []
  const nummerVon = new Map<(typeof stellen)[number], number>()
  for (const s of geordnet) {
    const nr = anmerkungen.length + 1
    nummerVon.set(s, nr)
    const f = s.art === 'fussnote' ? fussnoten[s.index] : undefined
    const g = s.art === 'worthilfe' ? bereinigt[s.index] : undefined
    anmerkungen.push({ nr, art: s.art, index: s.index, imText: true, wort: f ? f.wort : g!.term, text: f ? f.text : g!.explanation })
  }
  bereinigt.forEach((g, index) => {
    if (vergeben.has(index)) return
    anmerkungen.push({ nr: anmerkungen.length + 1, art: 'worthilfe', index, imText: false, wort: g.term, text: g.explanation })
  })

  // 4. Anzeige: von hinten nach vorn ersetzen, damit die Stellen gültig bleiben
  let anzeige = body
  for (const s of [...stellen].sort((a, b) => b.pos - a.pos)) {
    const nr = nummerVon.get(s)
    anzeige = anzeige.slice(0, s.pos) + (nr ? `^{${nr}}` : '') + anzeige.slice(s.ende)
  }
  return { anzeige, anmerkungen }
}

/** Fußnotenmarken und Hochgestelltes entfernen – für Wortzahl, KI-Aufträge und Prüfungen */
export const ohneFussnotenMarken = (text: string): string => text.replace(FUSSNOTE_MARKE, '').replace(/\^\{[^}]*\}/g, '')

/*
 * FUSSNOTEN ODER ENDNOTEN (01.10.2026, Wahl der Lehrkraft in den Blattoptionen).
 *
 * Endnoten (Vorgabe, bisheriges Verhalten): Die Anmerkungen stehen gesammelt am Ende des
 * Materials, auch wenn es über zwei Seiten geteilt ist. Fußnoten: Jede Anmerkung steht unten
 * auf DER Seite, auf der ihr Wort steht – über der Fußzeile, durch eine kurze Linie abgesetzt.
 * Der Seitenumbruch hält dafür Platz frei (shared/render/paginate.ts, `noteUnits`). Die Zählung
 * beginnt in beiden Fällen je Material bei ¹.
 */
export type AnmerkungsArt = 'fussnoten' | 'endnoten'

/** Die gewählte Art; ohne Angabe Endnoten */
export const anmerkungsArt = (meta: { anmerkungen?: AnmerkungsArt } | undefined): AnmerkungsArt =>
  meta?.anmerkungen === 'fussnoten' ? 'fussnoten' : 'endnoten'

/** Absätze wie in der Darstellung (render/baustein/hilfen.tsx, `splitParagraphs`) */
const absaetze = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

/**
 * Welche Anmerkung gehört zu welchem Absatz? `absaetze[i]` = Nummern der Ziffern in Absatz i
 * (in der Reihenfolge im Text); `rest` = Anmerkungen ohne Stelle im Text – sie stehen beim
 * letzten Stück des Materials.
 */
export function anmerkungenJeAbsatz(block: Pick<TextBlock, 'body' | 'glossary' | 'fussnoten'>): { satz: AnmerkungsSatz; absaetze: number[][]; rest: number[] } {
  const satz = anmerkungenVon(block)
  const roh = absaetze(block.body ?? '')
  const anzeige = absaetze(satz.anzeige)
  // Teilt die Anzeige anders als der Rohtext (sehr selten), stehen alle Anmerkungen beim letzten Stück
  const je = anzeige.length === roh.length ? anzeige.map((p) => [...p.matchAll(/\^\{(\d+)\}/g)].map((m) => Number(m[1]))) : roh.map(() => [])
  const vergeben = new Set(je.flat())
  return { satz, absaetze: je, rest: satz.anmerkungen.filter((a) => !vergeben.has(a.nr)).map((a) => a.nr) }
}

/**
 * Die Anmerkungen eines Stücks [von, bis) – in Absätzen gezählt. Was keine Stelle im Text hat,
 * gehört zum Stück, das das Material abschließt.
 */
export function anmerkungenImStueck(block: Pick<TextBlock, 'body' | 'glossary' | 'fussnoten'>, von = 0, bis = Infinity): Anmerkung[] {
  const { satz, absaetze: je, rest } = anmerkungenJeAbsatz(block)
  const nummern = new Set(je.slice(von, Math.min(bis, je.length)).flat())
  if (bis >= je.length) for (const nr of rest) nummern.add(nr)
  return satz.anmerkungen.filter((a) => nummern.has(a.nr))
}

/** Hat eines der Materialien Anmerkungen? Nur dann bieten die Blattoptionen die Wahl an */
export const hatAnmerkungen = (bloecke: readonly { type: string }[]): boolean =>
  bloecke.some((b) => b.type === 'text' && anmerkungenVon(b as TextBlock).anmerkungen.length > 0)
