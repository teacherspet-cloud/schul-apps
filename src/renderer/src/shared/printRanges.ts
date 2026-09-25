/** Seitenbereich wie „1-3, 5“ in Bereiche umwandeln; null bei ungültiger Eingabe. */
export function parsePageRanges(input: string, pageCount: number): { from: number; to: number }[] | null {
  const text = input.trim()
  if (!text) return null
  const ranges: { from: number; to: number }[] = []
  for (const part of text.split(/[,;]\s*/)) {
    const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(part.trim())
    if (!m) return null
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (from < 1 || to < from || to > pageCount) return null
    ranges.push({ from, to })
  }
  return ranges
}
