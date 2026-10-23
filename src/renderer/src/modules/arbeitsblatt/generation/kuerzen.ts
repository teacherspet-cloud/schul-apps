import type { StructuredRequest } from '@shared/types'
import type { Worksheet, WsBlock } from '../model/types'

/**
 * „Auf weniger Seiten" – zweite Stufe: die KI kürzt (23.10.2026, abgestimmt: „App rechnet, KI kürzt"). Nur, wenn
 * Schrift, Abstände und Bilder nicht reichen; jede Kürzung wird vor dem Übernehmen gezeigt und lässt sich abwählen.
 *
 * Nachtrag der Lehrkraft: „wenn inhalte gestrichen werden, muss dies bei A/B, A/B/C, A/B/C/D Tests beachtet werden,
 * damit alle Tests die gleichen Anforderungen und Punktzahlen haben." Deshalb:
 * - Bewertete Aufgaben werden NIE gestrichen und ihre Punkte nie angefasst – nur ihre Aufgabenstellung kürzer gefasst.
 * - Weglassen lassen sich nur unbewertete Zugaben (Lernziele, Selbsteinschätzung, Schmuckbild) – und dann
 *   in ALLEN Fassungen (die App ergänzt die Entsprechung, wenn die KI eine vergisst).
 * - Bei mehreren Fassungen bekommt die KI alle zugleich und kürzt Entsprechendes gleich.
 * - Materialtexte mit Zeilennummern oder Quellenangabe bleiben wörtlich (Zitate, Zeilenverweise der Aufgaben).
 */

export type KuerzFeld = 'instruction' | 'body' | 'intro'

export interface Kuerzung {
  aenderungen: { blockId: string; feld: KuerzFeld; alt: string; neu: string; wo: string }[]
  /** `gruppe`: dieselbe Zugabe in allen Fassungen – nur gemeinsam abwählbar */
  weglassen: { blockId: string; wo: string; gruppe: string }[]
}

/**
 * Unbewertete Zugaben, die wegfallen dürfen. NICHT Hilfen und Redemittel (Probelauf mit echter KI, 23.10.2026: sie
 * strich die Hilfekarten – das macht die Aufgabe schwerer, ist also keine Kürzung) und NICHT Infokästen (zweiter
 * Probelauf: sie strich eine Begriffsklärung, die eine Aufgabe braucht; Merke/Definition/Regel sind Inhalt).
 */
const WEGLASSBAR = new Set<WsBlock['type']>(['learningGoals', 'selfCheck'])

/**
 * Kennungen aller Bausteine im gespeicherten Dokument. Was die App beim Setzen selbst ergänzt (Kopf der Klassenarbeit,
 * Operatorenliste, Lösungsschlüssel), steht dort nicht – das bleibt unveränderlich (Probelauf: die KI wollte Kopf und
 * Operatorenliste einer Klassenarbeit weglassen; ins Dokument geschrieben hätte das nichts bewirkt).
 */
export function bausteinIds(doc: unknown): Set<string> {
  const ids = new Set<string>()
  const gehe = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(gehe)
    if (!x || typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.type === 'string' && typeof o.id === 'string') ids.add(o.id)
    Object.values(o).forEach(gehe)
  }
  gehe(doc)
  return ids
}

/** Darf `b` geändert werden – steht er im gespeicherten Dokument? (ohne Angabe: ja) */
let imDokument: (b: WsBlock) => boolean = () => true
function mitQuelle<T>(quelle: unknown, fn: () => T): T {
  const vorher = imDokument
  if (quelle !== undefined) {
    const ids = bausteinIds(quelle)
    imDokument = (b) => ids.has(b.id)
  }
  try {
    return fn()
  } finally {
    imDokument = vorher
  }
}

function weglassbar(b: WsBlock): boolean {
  if (!imDokument(b)) return false
  if (b.type === 'image') return b.role === 'motivation' || b.fn === 'schmuck'
  return WEGLASSBAR.has(b.type)
}

/** Welche Texte eines Bausteins gekürzt werden dürfen */
function kuerzbareFelder(b: WsBlock): KuerzFeld[] {
  if (!imDokument(b)) return []
  if (b.type === 'task') return ['instruction']
  if (b.type === 'infoBox') return ['body']
  // Quellentexte und Texte mit Zeilennummern bleiben wörtlich
  if (b.type === 'text')
    return [...(!b.lineNumbers && !b.source?.trim() && !b.sourceHeader ? (['body'] as const) : []), ...(b.intro ? (['intro'] as const) : [])]
  return []
}

const ART: Partial<Record<WsBlock['type'], string>> = {
  task: 'Aufgabe',
  text: 'Text',
  infoBox: 'Infokasten',
  learningGoals: 'Lernziele',
  selfCheck: 'Selbsteinschätzung',
  scaffold: 'Hilfen',
  phrases: 'Redemittel',
  image: 'Bild'
}

const wert = (b: WsBlock, f: KuerzFeld): string => String((b as unknown as Record<string, unknown>)[f] ?? '')

function kurzBeschreibung(b: WsBlock): string {
  const t = b as unknown as Record<string, unknown>
  return String(t.title ?? t.instruction ?? t.caption ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
}

/** `quelle`: das gespeicherte Dokument (Klassenarbeit, Lernzielkontrolle …), wenn das Blatt daraus erst gesetzt wird */
export function kuerzAnfrage(ws: Worksheet, seiten: number, quelle?: unknown): StructuredRequest {
  return mitQuelle(quelle, () => anfrage(ws, seiten))
}

function anfrage(ws: Worksheet, seiten: number): StructuredRequest {
  const fassungen = ws.sheets.length > 1
  const zeilen: string[] = []
  ws.sheets.forEach((s) => {
    zeilen.push(`=== ${fassungen ? `FASSUNG ${s.label || s.id}` : 'BLATT'} ===`)
    for (const b of s.blocks) {
      const felder = kuerzbareFelder(b)
      const darf = weglassbar(b)
      if (!felder.length && !darf) {
        zeilen.push(`[${b.id}] ${ART[b.type] ?? b.type}${b.type === 'task' ? ` (${b.points} P.)` : ''} – unveränderlich`)
        continue
      }
      zeilen.push(
        `[${b.id}] ${ART[b.type] ?? b.type}${b.type === 'task' ? ` (${b.points} P.)` : ''}${darf ? ' – darf wegfallen' : ''}${
          !felder.length ? `: ${kurzBeschreibung(b)}` : ''
        }`
      )
      for (const f of felder) zeilen.push(`  ${f}: ${wert(b, f)}`)
    }
  })
  return {
    system:
      'Du kürzt Unterrichtsmaterial so, dass es eine Seite weniger braucht – ohne die Anforderungen zu ändern. Du schreibst in der Sprache des jeweiligen Textes weiter.',
    user: [
      `Das Material braucht jetzt ${seiten} Seiten; Ziel sind ${seiten - 1}. Schrift, Abstände und Bilder sind schon so klein wie erlaubt.`,
      'REGELN:',
      '- Kürze Aufgabenstellungen (instruction) und Texte (body, intro) knapper: Füllwörter, Wiederholungen, umständliche Einleitungen weg. Operator, Arbeitsauftrag, verlangte Menge und Bedingungen bleiben VOLLSTÄNDIG erhalten – gleiche Anforderung, gleiche Punkte. Bedingungen sind auch Zeitpunkt und Art der Bearbeitung („while watching“, „während des Hörens“, „in zwei Sätzen“, „mit Belegen“, „in eigenen Worten“).',
      '- Verweise, Markierungen und Platzhalter bleiben wörtlich: M1/M2, M{…}, [[…]], **…**, Zeilenangaben, Formeln, Zahlen.',
      '- Weglassen (weglassen) nur Bausteine, die mit „darf wegfallen“ gekennzeichnet sind, und nur, wenn Kürzen allein nicht reicht. Aufgaben werden nie weggelassen.',
      fassungen
        ? '- MEHRERE FASSUNGEN (A/B …): Alle Fassungen müssen danach gleiche Anforderungen und Punktzahlen haben. Kürze einander entsprechende Bausteine gleich stark; lässt du einen Baustein weg, dann den entsprechenden in JEDER Fassung.'
        : '',
      '- Nur Bausteine aufführen, die sich ändern; der neue Text ist kürzer als der alte.',
      '',
      ...zeilen
    ]
      .filter((z) => z !== '')
      .join('\n'),
    schemaName: 'material_kuerzen',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['aenderungen', 'weglassen'],
      properties: {
        aenderungen: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['blockId', 'feld', 'text'],
            properties: {
              blockId: { type: 'string', description: 'Kennung in eckigen Klammern' },
              feld: { type: 'string', enum: ['instruction', 'body', 'intro'] },
              text: { type: 'string', description: 'Der gekürzte Text' }
            }
          }
        },
        weglassen: { type: 'array', items: { type: 'string', description: 'Kennung eines Bausteins, der wegfallen darf' } }
      }
    }
  }
}

const wo = (ws: Worksheet, sheetIndex: number, b: WsBlock): string =>
  `${ws.sheets.length > 1 ? `${ws.sheets[sheetIndex].label || `Fassung ${sheetIndex + 1}`}: ` : ''}${ART[b.type] ?? b.type}${
    kurzBeschreibung(b) ? ` „${kurzBeschreibung(b)}${kurzBeschreibung(b).length >= 60 ? '…' : ''}“` : ''
  }`

/** Die Antwort prüfen: nur erlaubte Felder, nur Kürzeres, Weglassen nur Zugaben und in allen Fassungen gleich */
export function kuerzungAus(ws: Worksheet, daten: unknown, quelle?: unknown): Kuerzung {
  return mitQuelle(quelle, () => auswerten(ws, daten))
}

function auswerten(ws: Worksheet, daten: unknown): Kuerzung {
  const d = (daten ?? {}) as { aenderungen?: unknown; weglassen?: unknown }
  const finde = (id: string): { b: WsBlock; i: number; k: number } | null => {
    for (const [i, s] of ws.sheets.entries()) {
      const k = s.blocks.findIndex((b) => b.id === id)
      if (k >= 0) return { b: s.blocks[k], i, k }
    }
    return null
  }
  const aenderungen: Kuerzung['aenderungen'] = []
  const gesehen = new Set<string>()
  for (const a of Array.isArray(d.aenderungen) ? d.aenderungen : []) {
    const { blockId, feld, text } = (a ?? {}) as { blockId?: string; feld?: KuerzFeld; text?: string }
    const f = blockId ? finde(String(blockId)) : null
    const neu = String(text ?? '').trim()
    if (!f || !feld || !kuerzbareFelder(f.b).includes(feld) || gesehen.has(`${f.b.id}|${feld}`)) continue
    const alt = wert(f.b, feld)
    if (!neu || neu.length >= alt.length) continue
    gesehen.add(`${f.b.id}|${feld}`)
    aenderungen.push({ blockId: f.b.id, feld, alt, neu, wo: wo(ws, f.i, f.b) })
  }
  const weg = new Map<string, { wo: string; gruppe: string }>()
  for (const id of Array.isArray(d.weglassen) ? d.weglassen : []) {
    const f = finde(String(id))
    if (!f || !weglassbar(f.b)) continue
    /*
     * Entsprechung in den anderen Fassungen: der n-te Baustein derselben Art (nicht dieselbe Stelle – eine Fassung kann
     * davor einen Baustein mehr haben, Probelauf 23.10.2026: Kopf der Fassung B)
     */
    const nte = (s: Worksheet['sheets'][number], k: number): number => s.blocks.slice(0, k).filter((x) => x.type === f.b.type).length
    const n = nte(ws.sheets[f.i], f.k)
    const gruppe = `${f.b.type}#${n}`
    if (weg.has(f.b.id)) continue
    weg.set(f.b.id, { wo: wo(ws, f.i, f.b), gruppe })
    // Gleiche Anforderungen in allen Fassungen: die Entsprechung (gleiche Art an gleicher Stelle) fällt ebenfalls weg
    ws.sheets.forEach((s, i) => {
      if (i === f.i) return
      const gegen = s.blocks.filter((x) => x.type === f.b.type)[n]
      if (gegen && gegen.type === f.b.type && weglassbar(gegen) && !weg.has(gegen.id)) weg.set(gegen.id, { wo: wo(ws, i, gegen), gruppe })
    })
  }
  return { aenderungen: aenderungen.filter((a) => !weg.has(a.blockId)), weglassen: [...weg].map(([blockId, w]) => ({ blockId, ...w })) }
}

/**
 * Kürzung auf ein Dokument anwenden – geht durch das ganze Dokument (Arbeitsblatt, Klassenarbeit, Lernzielkontrolle,
 * Grammatiktest tragen die Bausteine mit derselben Kennung wie auf dem Blatt) und trifft so auch gleiche Bausteine
 * mehrerer Fassungen.
 */
export function wendeKuerzungAn<T>(doc: T, k: Pick<Kuerzung, 'aenderungen' | 'weglassen'>): T {
  const neu = new Map(k.aenderungen.map((a) => [`${a.blockId}|${a.feld}`, a.neu]))
  const weg = new Set(k.weglassen.map((w) => w.blockId))
  const gehe = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.filter((e) => !(e && typeof e === 'object' && 'type' in e && weg.has(String((e as { id?: unknown }).id)))).map(gehe)
    if (!x || typeof x !== 'object') return x
    const o = x as Record<string, unknown>
    const kopie: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(o)) kopie[key] = gehe(v)
    if (typeof o.type === 'string' && typeof o.id === 'string')
      for (const f of ['instruction', 'body', 'intro'] as const) {
        const t = neu.get(`${o.id}|${f}`)
        if (t !== undefined && typeof o[f] === 'string') kopie[f] = t
      }
    return kopie
  }
  return gehe(doc) as T
}
