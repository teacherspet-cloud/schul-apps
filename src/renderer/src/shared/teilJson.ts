/**
 * Unfertige KI-Antwort lesen (Live-Vorschau, 02.10.2026).
 *
 * Mit API-Schlüssel kommt die Antwort im Strom; die Vorschau soll jeden Baustein zeigen, sobald
 * er VOLLSTÄNDIG da ist – nie einen halben. Gesucht wird die Liste unter `feld` (z. B. „blocks")
 * auf oberster Ebene; geliefert werden nur ihre abgeschlossenen Elemente. Zeichenketten und
 * Escapes werden mitgezählt, damit eine Klammer im Text nichts durcheinanderbringt.
 */
export function vollstaendigeElemente(text: string, feld: string): unknown[] {
  const start = feldAnfang(text, feld)
  if (start < 0) return []
  const out: unknown[] = []
  let tiefe = 0
  let imText = false
  let escape = false
  let elementAnfang = -1
  for (let i = start + 1; i < text.length; i++) {
    const z = text[i]
    if (imText) {
      if (escape) escape = false
      else if (z === '\\') escape = true
      else if (z === '"') imText = false
      continue
    }
    if (z === '"') {
      imText = true
      if (tiefe === 0 && elementAnfang < 0) elementAnfang = i
      continue
    }
    if (z === '{' || z === '[') {
      if (tiefe === 0) elementAnfang = i
      tiefe++
    } else if (z === '}' || z === ']') {
      if (tiefe === 0) break // Ende der Liste
      tiefe--
      if (tiefe === 0 && elementAnfang >= 0) {
        try {
          out.push(JSON.parse(text.slice(elementAnfang, i + 1)))
        } catch {
          return out
        }
        elementAnfang = -1
      }
    }
  }
  return out
}

/** Stelle der öffnenden Klammer von `"feld": [` auf oberster Ebene des Objekts, sonst -1 */
function feldAnfang(text: string, feld: string): number {
  let tiefe = 0
  let imText = false
  let escape = false
  let textAnfang = -1
  for (let i = 0; i < text.length; i++) {
    const z = text[i]
    if (imText) {
      if (escape) escape = false
      else if (z === '\\') escape = true
      else if (z === '"') {
        imText = false
        // Ein Schlüssel auf Ebene 1, gefolgt von ":" und "["?
        if (tiefe === 1 && text.slice(textAnfang + 1, i) === feld) {
          const rest = /^\s*:\s*\[/.exec(text.slice(i + 1))
          if (rest) return i + rest[0].length
        }
      }
      continue
    }
    if (z === '"') {
      imText = true
      textAnfang = i
    } else if (z === '{' || z === '[') tiefe++
    else if (z === '}' || z === ']') tiefe--
  }
  return -1
}
