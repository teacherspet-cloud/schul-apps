/**
 * Leichtes Textformat für Arbeitsblätter:
 *   **fett**, *kursiv*, $Formel$, $$abgesetzte Formel$$ (eigene Zeile), \ce{H2O} in Formeln,
 *   Aufzählungen mit "- " und nummerierte Listen mit "1. ".
 * Seit 01.10.2026 (Textauswahl-Menü der Materialtexte) außerdem ++unterstrichen++, ==markiert==
 * und ^{hochgestellt} (Fußnotenziffern im Word-Export).
 * Dieselbe Struktur speist Editor, Druck und Word-Export.
 */

export type Inline =
  { t: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean; mark?: boolean; sup?: boolean } | { t: 'math'; tex: string }

export type RichBlock =
  | { t: 'para'; inlines: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][]; /** erste Nummer nummerierter Listen */ start?: number }
  | { t: 'math'; tex: string }

const LIST_ITEM = /^\s*[-•*]\s+(.*)$/
const ORDERED_ITEM = /^\s*(\d+)[.)]\s+(.*)$/
const DISPLAY_MATH = /^\s*\$\$([\s\S]+?)\$\$\s*$/

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = []
  const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n')
  let para: string[] = []

  const flushPara = (): void => {
    if (para.length) blocks.push({ t: 'para', inlines: parseInline(para.join('\n')) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const display = DISPLAY_MATH.exec(line)
    if (display) {
      flushPara()
      blocks.push({ t: 'math', tex: display[1].trim() })
      continue
    }
    const bullet = LIST_ITEM.exec(line)
    const ordered = bullet ? null : ORDERED_ITEM.exec(line)
    if (bullet || ordered) {
      flushPara()
      const isOrdered = Boolean(ordered)
      const last = blocks[blocks.length - 1]
      const content = parseInline(bullet ? bullet[1] : ordered![2])
      if (last?.t === 'list' && last.ordered === isOrdered) last.items.push(content)
      else blocks.push({ t: 'list', ordered: isOrdered, items: [content], ...(ordered ? { start: Number(ordered[1]) } : {}) })
      continue
    }
    if (!line.trim()) {
      flushPara()
      continue
    }
    para.push(line)
  }
  flushPara()
  return blocks
}

/** Zerlegt eine Zeile in Text, fett/kursiv und Formeln. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  // Formeln zuerst herauslösen, damit * und _ in Formeln nicht als Formatierung gelten
  const parts = splitMath(text)
  for (const part of parts) {
    if (part.math) out.push({ t: 'math', tex: part.value })
    else out.push(...parseEmphasis(part.value))
  }
  return mergeText(out)
}

function splitMath(text: string): { math: boolean; value: string }[] {
  const parts: { math: boolean; value: string }[] = []
  let buf = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && text[i + 1] === '$') {
      buf += '$'
      i++
      continue
    }
    if (c === '$') {
      const end = findClosingDollar(text, i + 1)
      if (end > i + 1) {
        if (buf) parts.push({ math: false, value: buf })
        buf = ''
        parts.push({ math: true, value: text.slice(i + 1, end).trim() })
        i = end
        continue
      }
    }
    buf += c
  }
  if (buf) parts.push({ math: false, value: buf })
  return parts
}

function findClosingDollar(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j++
      continue
    }
    if (text[j] === '$') return j
  }
  return -1
}

function parseEmphasis(text: string): Inline[] {
  return emphasisAbschnitte(text).map(({ von, bis, ...f }) => ({ t: 'text' as const, text: text.slice(von, bis), ...f }))
}

/**
 * Sichtbare Abschnitte eines Textstücks (ohne Formeln) mit ihrer Auszeichnung – als Stellen im
 * Rohtext. Grundlage der Anzeige UND des Textauswahl-Menüs (Formatieren einer Markierung).
 */
export function emphasisAbschnitte(text: string): ({ von: number; bis: number } & Auszeichnung)[] {
  // Neue Marken (unterstrichen, markiert, hochgestellt) laufen über den Zähler mit Verschachtelung
  if (NEUE_MARKEN.test(text)) return markenAbschnitte(text)
  const out: ({ von: number; bis: number } & Auszeichnung)[] = []
  const re = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ von: last, bis: m.index })
    if (m[1] !== undefined) out.push({ von: m.index + 2, bis: m.index + 2 + m[1].length, bold: true })
    else out.push({ von: m.index + 1, bis: m.index + 1 + m[2].length, italic: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ von: last, bis: text.length })
  return out.filter((a) => a.bis > a.von)
}

const NEUE_MARKEN = /==|\+\+|\^\{/

export type Auszeichnung = { bold?: boolean; italic?: boolean; underline?: boolean; mark?: boolean; sup?: boolean }

/**
 * Sichtbare Abschnitte eines Textes mit Marken – als Stellen im ROHTEXT (von, bis).
 *
 * Paarweise Marken (`**`, `*`, `==`, `++`) gelten nur, wenn es ein Gegenstück gibt; `^{` endet an
 * der nächsten `}`. So lassen sich Marken verschachteln („==**wichtig** und richtig=="). Die
 * Stellen braucht das Textauswahl-Menü, um eine Markierung im Blatt dem Rohtext zuzuordnen.
 */
export function markenAbschnitte(text: string): ({ von: number; bis: number } & Auszeichnung)[] {
  const re = /\*\*|\*|==|\+\+|\^\{|\}/g
  const treffer: { art: string; i: number }[] = []
  for (let m = re.exec(text); m; m = re.exec(text)) treffer.push({ art: m[0], i: m.index })
  // Gegenstücke bestimmen: je Art abwechselnd öffnen/schließen; eine unpaarige letzte Marke bleibt Text
  const gilt = new Set<number>()
  const offen = new Map<string, number>()
  let hochOffen = -1
  for (let k = 0; k < treffer.length; k++) {
    const { art } = treffer[k]
    if (art === '^{') {
      if (hochOffen < 0) hochOffen = k
      continue
    }
    if (art === '}') {
      if (hochOffen >= 0) {
        gilt.add(hochOffen)
        gilt.add(k)
        hochOffen = -1
      }
      continue
    }
    const vorher = offen.get(art)
    if (vorher === undefined) offen.set(art, k)
    else {
      gilt.add(vorher)
      gilt.add(k)
      offen.delete(art)
    }
  }
  const SCHALTER: Record<string, keyof Auszeichnung> = { '**': 'bold', '*': 'italic', '==': 'mark', '++': 'underline', '^{': 'sup', '}': 'sup' }
  const stand: Auszeichnung = {}
  const out: ({ von: number; bis: number } & Auszeichnung)[] = []
  let pos = 0
  const abschnitt = (bis: number): void => {
    if (bis <= pos) return
    const f: Auszeichnung = {}
    for (const [k, v] of Object.entries(stand)) if (v) f[k as keyof Auszeichnung] = true
    out.push({ von: pos, bis, ...f })
  }
  treffer.forEach((t, k) => {
    if (!gilt.has(k)) return
    abschnitt(t.i)
    const schalter = SCHALTER[t.art]
    stand[schalter] = t.art === '^{' ? true : t.art === '}' ? false : !stand[schalter]
    pos = t.i + t.art.length
  })
  abschnitt(text.length)
  return out
}

const gleicheAuszeichnung = (a: Auszeichnung, b: Auszeichnung): boolean =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.mark === !!b.mark && !!a.sup === !!b.sup

function mergeText(items: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const it of items) {
    const prev = out[out.length - 1]
    if (it.t === 'text' && prev?.t === 'text' && gleicheAuszeichnung(prev, it)) {
      prev.text += it.text
    } else out.push({ ...it })
  }
  return out.filter((i) => i.t === 'math' || i.text !== '')
}

/** Reiner Text ohne Markierungen (z. B. für KI-Prüfungen und Suche). */
export function plainText(source: string): string {
  return parseRichText(source)
    .map((b) =>
      b.t === 'math'
        ? b.tex
        : b.t === 'para'
          ? b.inlines.map((i) => (i.t === 'math' ? i.tex : i.text)).join('')
          : b.items.map((it) => `- ${it.map((i) => (i.t === 'math' ? i.tex : i.text)).join('')}`).join('\n')
    )
    .join('\n')
}
