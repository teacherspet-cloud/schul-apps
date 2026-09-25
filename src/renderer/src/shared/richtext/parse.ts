/**
 * Leichtes Textformat für Arbeitsblätter:
 *   **fett**, *kursiv*, $Formel$, $$abgesetzte Formel$$ (eigene Zeile), \ce{H2O} in Formeln,
 *   Aufzählungen mit "- " und nummerierte Listen mit "1. ".
 * Dieselbe Struktur speist Editor, Druck und Word-Export.
 */

export type Inline = { t: 'text'; text: string; bold?: boolean; italic?: boolean } | { t: 'math'; tex: string }

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
  const out: Inline[] = []
  const re = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'text', text: m[1], bold: true })
    else out.push({ t: 'text', text: m[2], italic: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}

function mergeText(items: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const it of items) {
    const prev = out[out.length - 1]
    if (it.t === 'text' && prev?.t === 'text' && !!prev.bold === !!it.bold && !!prev.italic === !!it.italic) {
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
