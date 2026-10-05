/**
 * Aufgaben und Bausteine eines Materials für einen Reihen-Schritt auswählen (05.10.2026, Wunsch der
 * Lehrkraft: „einzelne Aufgaben / Bausteine … ausblenden, wenn dadurch die Lernziele und Zeiten der
 * Unterrichtsreihe besser erfüllt werden. Das soll nicht das Originalmaterial verändern, nur die
 * Sichtbarkeit für die Schüler und die entsprechende Bewertung").
 *
 * Abgestimmt: Aufgaben, Bausteine UND Teilaufgaben; drei Zustände Pflicht / Freiwillig ★ (sichtbar,
 * mit Feedback, zählt nicht für den Erfolg) / Ausgeblendet; Aufgaben für die Lernenden neu
 * durchgezählt, Materialnummern wie im Original; die KI schlägt vor, die Lehrkraft bestätigt.
 */
import type { StructuredRequest } from '@shared/types'
import type { Reihe, Schritt } from '@shared/reihe'
import { plainText } from '../../shared/richtext/parse'
import type { Sheet, TaskBlock, Worksheet, WsBlock } from '../arbeitsblatt/model/types'
import { isMaterial, loeseMaterialverweise, materialNummern, wandleTexte } from '../arbeitsblatt/didactics/integrity'
import { BLOCK_LABELS } from '../arbeitsblatt/model/factory'
import { describeBlock } from '../arbeitsblatt/generation/describe'

type Ki = <T>(req: StructuredRequest) => Promise<T>
export type Auswahl = Record<string, 'frei' | 'aus'>
export type Stufe = 'pflicht' | 'frei' | 'aus'

export const teilSchluessel = (blockId: string, teilId: string): string => `${blockId}/${teilId}`
export const stufeVon = (a: Auswahl | undefined, schluessel: string): Stufe => a?.[schluessel] ?? 'pflicht'

export interface AuswahlEintrag {
  schluessel: string
  art: 'aufgabe' | 'material' | 'baustein'
  /** „Aufgabe 3", „M2", „Merkkasten / Info" */
  kennung: string
  text: string
  /** Bearbeitungszeit laut Blatt (Aufgaben) */
  minuten?: number
  teile: { schluessel: string; kennung: string; text: string }[]
}

const kurz = (s: string, n = 110): string => {
  const t = plainText(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Die auswählbaren Bausteine eines Blattes, in Blattreihenfolge mit Originalnummern */
export function auswahlEintraege(sheet: Sheet): AuswahlEintrag[] {
  const mNr = materialNummern(sheet.blocks)
  let aufgabe = 0
  // Angezeigt mit aufgelösten Verweisen („M2" statt „M{video}")
  return loeseMaterialverweise(sheet.blocks).map((b): AuswahlEintrag => {
    if (b.type === 'task') {
      aufgabe++
      return {
        schluessel: b.id,
        art: 'aufgabe',
        kennung: `Aufgabe ${aufgabe}`,
        text: kurz(b.instruction),
        minuten: b.minutes || undefined,
        teile: b.parts.map((p, i) => ({ schluessel: teilSchluessel(b.id, p.id), kennung: `${String.fromCharCode(97 + i)})`, text: kurz(p.instruction, 90) }))
      }
    }
    const titel = 'title' in b && typeof b.title === 'string' ? kurz(b.title, 80) : ''
    return {
      schluessel: b.id,
      art: isMaterial(b) ? 'material' : 'baustein',
      kennung: mNr.get(b.id) ?? BLOCK_LABELS[b.type] ?? b.type,
      text: titel || kurz(describeBlock(b), 90),
      teile: []
    }
  })
}

// ---------------------------------------------------------------- Aufgabennummern in Texten (05.10.2026)
/*
 * Befund der Lehrkraft: Freie Texte im gekürzten Material („Optional help cards for task 4", „Nutze deine
 * Ergebnisse aus Aufgabe 2") behielten die alte Nummer, obwohl die Aufgaben neu durchgezählt werden. Jetzt
 * werden Verweise in ALLEN sichtbaren Texten (Hilfen, Hinweise, Aufgaben, Lösungen) auf die neue Zählung
 * umgeschrieben; Bausteine, die nur ausgeblendete Aufgaben betreffen, fallen mit weg.
 */
const AUFGABE_WORT = String.raw`(?:Aufgaben?|Aufg\.|Teilaufgaben?|[Tt]asks?|[Ee]xercises?|[Ee]xercices?|[Tt]âches?|[Ee]jercicios?|[Tt]areas?|[Ee]sercizi|[Ee]sercizio)`
const NR = String.raw`\d{1,2}[a-h]?`
const VERBINDER = String.raw`\s*(?:,|und|and|et|y|e|bis|to|à|–|-|/|&)\s*`
const VERWEIS = new RegExp(String.raw`(\b${AUFGABE_WORT}\s+)(${NR}(?:${VERBINDER}${NR})*)(?![\d])`, 'g')
const EINZELNR = /(\d{1,2})([a-h]?)/g

/** Alle Aufgabennummern, auf die ein Text verweist */
export function aufgabenVerweise(text: string): number[] {
  const aus: number[] = []
  for (const m of text.matchAll(VERWEIS)) for (const n of m[2].matchAll(EINZELNR)) aus.push(Number(n[1]))
  return aus
}

/**
 * Verweise umschreiben: `nummern` alt → neu; `buchstaben` je alter Nummer: alte → neue Teilaufgabe („4c" → „3b").
 * Verweist ein sichtbarer Text auf eine ausgeblendete Aufgabe, wird sie als „(entfällt)" gekennzeichnet – nach dem
 * Neuzählen trüge sonst eine ANDERE Aufgabe diese Nummer. Die Lehrkraft bekommt dazu eine Warnung.
 */
export function verweiseUmschreiben(text: string, nummern: Map<number, number | null>, buchstaben: Map<number, Map<string, string>> = new Map()): string {
  if (!/\d/.test(text)) return text
  return text.replace(
    VERWEIS,
    (_ganz, wort: string, liste: string) =>
      wort +
      liste.replace(EINZELNR, (nr: string, z: string, b: string) => {
        const alt = Number(z)
        const neu = nummern.get(alt)
        if (neu === undefined) return nr
        if (neu === null) return `${nr} (entfällt)`
        return `${neu}${b ? (buchstaben.get(alt)?.get(b) ?? b) : ''}`
      })
  )
}

/** Teilaufgaben-Verweise innerhalb einer Aufgabe („aus b)", „Teilaufgabe c") auf die neuen Buchstaben */
function buchstabenUmschreiben(text: string, karte: Map<string, string>): string {
  if (!karte.size) return text
  return text
    .replace(/(^|[^\p{L}\d])([a-h])\)/gu, (ganz, vor: string, b: string) => (karte.has(b) ? `${vor}${karte.get(b)})` : ganz))
    .replace(/\b(Teilaufgabe|part|partie|parte)\s+([a-h])\b/g, (ganz, wort: string, b: string) => (karte.has(b) ? `${wort} ${karte.get(b)}` : ganz))
}

/** Texte eines Bausteins (für die Verweissuche) */
function texteVon(b: WsBlock): string {
  const t: string[] = []
  wandleTexte(b, (x) => (t.push(x), x))
  return t.join('\n')
}

/** Nummerierung alt → neu (null: ausgeblendet) und Buchstabenkarten je Aufgabe */
function zaehlung(bloecke: WsBlock[], a: Auswahl): { nummern: Map<number, number | null>; buchstaben: Map<number, Map<string, string>> } {
  const nummern = new Map<number, number | null>()
  const buchstaben = new Map<number, Map<string, string>>()
  let alt = 0
  let neu = 0
  for (const b of bloecke) {
    if (b.type !== 'task') continue
    alt++
    const weg = stufeVon(a, b.id) === 'aus'
    nummern.set(alt, weg ? null : ++neu)
    const karte = new Map<string, string>()
    let k = 0
    b.parts.forEach((p, i) => {
      if (stufeVon(a, teilSchluessel(b.id, p.id)) === 'aus') return
      karte.set(String.fromCharCode(97 + i), String.fromCharCode(97 + k++))
    })
    if ([...karte].some(([x, y]) => x !== y)) buchstaben.set(alt, karte)
  }
  return { nummern, buchstaben }
}

/**
 * Bausteine (keine Aufgaben, kein Material), die AUSSCHLIESSLICH auf ausgeblendete Aufgaben verweisen –
 * z. B. „Hilfekarten zu Aufgabe 4", wenn Aufgabe 4 ausgeblendet ist. Sie fallen mit weg.
 */
export function automatischAus(sheet: Sheet, a: Auswahl | undefined): string[] {
  if (!a || !Object.keys(a).length) return []
  const { nummern } = zaehlung(sheet.blocks, a)
  return sheet.blocks
    .filter((b) => b.type !== 'task' && !isMaterial(b) && stufeVon(a, b.id) !== 'aus')
    .filter((b) => {
      const v = aufgabenVerweise(texteVon(b))
      return v.length > 0 && v.every((n) => nummern.get(n) === null)
    })
    .map((b) => b.id)
}

/** Das Blatt, wie die Lernenden es in diesem Schritt sehen – das Original bleibt unverändert */
export function blattMitAuswahl(sheet: Sheet, a: Auswahl | undefined): Sheet {
  if (!a || !Object.keys(a).length) return sheet
  // Verweise „M{kennung}" vorher auflösen und Nummern festhalten – sonst rückten sie nach
  const bloecke = loeseMaterialverweise(sheet.blocks)
  const nummern = materialNummern(bloecke)
  const { nummern: aufgaben, buchstaben } = zaehlung(bloecke, a)
  const mitWeg = new Set(automatischAus(sheet, a))
  const neu: WsBlock[] = []
  let alt = 0
  for (const b of bloecke) {
    const altNr = b.type === 'task' ? ++alt : 0
    const stufe = stufeVon(a, b.id)
    if (stufe === 'aus' || mitWeg.has(b.id)) continue
    const m = nummern.get(b.id)
    let x: WsBlock = m ? { ...b, festeNummer: m } : b
    if (x.type === 'task') {
      const karte = buchstaben.get(altNr) ?? new Map<string, string>()
      const t: TaskBlock = {
        ...x,
        parts: x.parts
          .filter((p) => stufeVon(a, teilSchluessel(b.id, p.id)) !== 'aus')
          .map((p) => (stufeVon(a, teilSchluessel(b.id, p.id)) === 'frei' ? { ...p, instruction: `★ freiwillig: ${p.instruction}` } : p)),
        ...(stufe === 'frei' ? { freiwillig: true } : {})
      }
      // Teilaufgaben-Verweise innerhalb der Aufgabe („aus c)" → „aus b)")
      x = karte.size ? (wandleTexte(t, (s) => buchstabenUmschreiben(s, karte)) as TaskBlock) : t
    }
    // Aufgabennummern in allen Texten auf die neue Zählung
    x = wandleTexte(x, (s) => verweiseUmschreiben(s, aufgaben, buchstaben)) as WsBlock
    neu.push(x)
  }
  return { ...sheet, blocks: neu }
}

/** Alle Blätter (Niveaustufen) eines Arbeitsblatts mit Auswahl */
export const mitAuswahl = (ws: Worksheet, a: Auswahl | undefined): Worksheet =>
  a && Object.keys(a).length ? { ...ws, sheets: ws.sheets.map((s) => blattMitAuswahl(s, a)) } : ws

/**
 * Warnungen: Eine sichtbare Aufgabe nennt ein ausgeblendetes Material, oder es bleibt keine
 * Pflichtaufgabe übrig.
 */
export function auswahlWarnungen(sheet: Sheet, a: Auswahl | undefined): string[] {
  if (!a) return []
  const aus: string[] = []
  const bloecke = loeseMaterialverweise(sheet.blocks)
  const nummern = materialNummern(bloecke)
  const versteckt = bloecke.filter((b) => isMaterial(b) && stufeVon(a, b.id) === 'aus').map((b) => nummern.get(b.id)!)
  const sichtbareAufgaben = bloecke.filter((b): b is TaskBlock => b.type === 'task' && stufeVon(a, b.id) !== 'aus')
  for (const m of versteckt)
    for (const t of sichtbareAufgaben) {
      const text = [t.instruction, ...t.parts.filter((p) => stufeVon(a, teilSchluessel(t.id, p.id)) !== 'aus').map((p) => p.instruction)]
        .map((s) => plainText(s))
        .join(' ')
      if (new RegExp(`\\b${m}\\b`).test(text)) aus.push(`Eine sichtbare Aufgabe verweist auf ${m}, das ausgeblendet ist.`)
    }
  if (!sichtbareAufgaben.some((t) => stufeVon(a, t.id) === 'pflicht'))
    aus.push('Es bleibt keine Pflichtaufgabe – der Schritt ließe sich ohne Arbeit abschließen.')
  // Sichtbare Texte, die auf ausgeblendete Aufgaben verweisen (dort steht dann „(entfällt)")
  const { nummern: zaehl } = zaehlung(sheet.blocks, a)
  const mitWeg = new Set(automatischAus(sheet, a))
  let nr = 0
  for (const b of sheet.blocks) {
    if (b.type === 'task') nr++
    if (stufeVon(a, b.id) === 'aus' || mitWeg.has(b.id)) continue
    const weg = [...new Set(aufgabenVerweise(texteVon(b)).filter((n) => zaehl.get(n) === null))]
    if (weg.length)
      aus.push(
        `${b.type === 'task' ? `Aufgabe ${nr}` : `„${BLOCK_LABELS[b.type] ?? b.type}"`} verweist auf die ausgeblendete Aufgabe ${weg.join(', ')} – dort steht „(entfällt)". Besser freiwillig statt ausgeblendet.`
      )
  }
  for (const id of automatischAus(sheet, a)) {
    const b = sheet.blocks.find((x) => x.id === id)!
    aus.push(`„${BLOCK_LABELS[b.type] ?? b.type}" wird mit ausgeblendet – er gehört nur zu ausgeblendeten Aufgaben.`)
  }
  return [...new Set(aus)]
}

/** Geschätzte Bearbeitungszeit der Pflichtaufgaben (laut Blatt) */
export function pflichtMinuten(sheet: Sheet, a: Auswahl | undefined): number {
  return sheet.blocks.reduce((n, b) => n + (b.type === 'task' && stufeVon(a, b.id) === 'pflicht' ? b.minutes || 0 : 0), 0)
}

// ---------------------------------------------------------------- Vorschlag der KI

const SCHEMA = {
  type: 'object',
  properties: {
    eintraege: {
      type: 'array',
      items: {
        type: 'object',
        properties: { schluessel: { type: 'string' }, stufe: { type: 'string', enum: ['pflicht', 'frei', 'aus'] }, grund: { type: 'string' } },
        required: ['schluessel', 'stufe', 'grund'],
        additionalProperties: false
      }
    },
    minuten: { type: 'integer' },
    hinweis: { type: 'string' }
  },
  required: ['eintraege', 'minuten', 'hinweis'],
  additionalProperties: false
}

/** Die KI schlägt vor, was in diesem Schritt Pflicht, freiwillig oder ausgeblendet sein soll */
export async function auswahlVorschlagen(
  r: Reihe,
  s: Schritt,
  sheet: Sheet,
  ki: Ki
): Promise<NonNullable<Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>['auswahlVorschlag']>> {
  const eintraege = auswahlEintraege(sheet)
  const bekannt = new Set(eintraege.flatMap((e) => [e.schluessel, ...e.teile.map((t) => t.schluessel)]))
  const stundeMin = r.stunden?.[s.stunde ?? -1] === 'doppel' ? 90 : 45
  const ziel = s.minuten ?? Math.round(stundeMin * 0.6)
  const voll = new Map(sheet.blocks.map((b) => [b.id, b]))
  const d = await ki<{ eintraege: { schluessel: string; stufe: string; grund: string }[]; minuten: number; hinweis: string }>({
    system: `Du passt ein vorhandenes Arbeitsblatt an einen Schritt einer Unterrichtsreihe an (${r.fachLabel}, Klasse ${r.grade}). Das Original bleibt unverändert; du entscheidest nur, was die Lernenden in diesem Schritt als Pflicht bearbeiten, was freiwillig ist und was ausgeblendet wird.`,
    user: [
      `REIHE: ${r.titel} (Oberthema: ${r.oberthema})`,
      `SCHRITT: ${s.titel}`,
      s.lernziele.length ? `LERNZIELE DES SCHRITTS: ${s.lernziele.map((l) => l.text).join('; ')}` : '',
      r.lernziele.length ? `LERNZIELE DER REIHE: ${r.lernziele.map((l) => l.text).join('; ')}` : '',
      `ZEIT FÜR DIESEN SCHRITT: etwa ${ziel} Minuten`,
      'BAUSTEINE DES BLATTES (Schlüssel in eckigen Klammern; Teilaufgaben eingerückt):',
      ...eintraege.flatMap((e) => [
        `[${e.schluessel}] ${e.kennung}${e.minuten ? ` (${e.minuten} min)` : ''}: ${kurz(describeBlock(voll.get(e.schluessel)!), 300)}`,
        ...e.teile.map((t) => `   [${t.schluessel}] ${t.kennung} ${t.text}`)
      ]),
      'REGELN:',
      '- Nenne NUR Bausteine/Teilaufgaben, die NICHT Pflicht bleiben sollen ("frei" oder "aus"); alles Ungenannte bleibt Pflicht.',
      '- "aus" für Aufgaben/Teilaufgaben, die nicht zu den Lernzielen des Schritts gehören oder die Zeit sprengen, und für Materialien, auf die keine verbleibende Aufgabe zugreift.',
      '- "frei" für sinnvolle Vertiefungen (meist Anforderungsbereich III) und Zusatzaufgaben, wenn die Zeit knapp ist.',
      '- Materialien, auf die eine sichtbare Aufgabe verweist, NIE ausblenden. Teilaufgaben, auf die eine spätere Teilaufgabe aufbaut, nicht ausblenden.',
      '- Lernziele, Merkkästen und Hilfen nur ausblenden, wenn sie zu ausgeblendeten Aufgaben gehören.',
      '- Mindestens eine Pflichtaufgabe bleibt. Ziel: Pflichtaufgaben passen in die Zeit.',
      '- "grund": ein kurzer Satz. "minuten": geschätzte Zeit der verbleibenden Pflichtaufgaben. "hinweis": ein bis zwei Sätze für die Lehrkraft.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_auswahl',
    schema: SCHEMA
  })
  const auswahl: Auswahl = {}
  const gruende: Record<string, string> = {}
  for (const e of d?.eintraege ?? []) {
    const k = String(e.schluessel ?? '').trim()
    if (!bekannt.has(k) || (e.stufe !== 'frei' && e.stufe !== 'aus')) continue
    auswahl[k] = e.stufe
    if (e.grund?.trim()) gruende[k] = e.grund.trim()
  }
  // Nie alle Pflichtaufgaben weg
  if (!sheet.blocks.some((b) => b.type === 'task' && stufeVon(auswahl, b.id) === 'pflicht')) {
    const erste = sheet.blocks.find((b) => b.type === 'task')
    if (erste) delete auswahl[erste.id]
  }
  return { auswahl, gruende, minuten: Math.max(0, Math.round(Number(d?.minuten) || pflichtMinuten(sheet, auswahl))), hinweis: String(d?.hinweis ?? '').trim() }
}
