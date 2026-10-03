/**
 * Objekte, die Lernende auf ein freigegebenes Arbeitsblatt setzen (03.10.2026): Textkästchen,
 * Verbindungslinien (z. B. Kästchen → Datum auf einer Zeitleiste) und Punkte mit Wert (Diagramme).
 * Gespeichert als JSON unter dem Antwortschlüssel `objekte`; Lage in CSS-Pixeln der Seite
 * (A4 = 794 px breit), Seite 0-basiert wie bei der Stift-Ebene.
 */
export interface BlattObjekt {
  id: string
  /** Seite */
  s: number
  t: 'text' | 'linie' | 'punkt'
  x: number
  y: number
  /** Linie: Endpunkt */
  x2?: number
  y2?: number
  /** Textkästchen: Breite */
  w?: number
  /** Text des Kästchens bzw. Wert am Punkt */
  text?: string
  farbe?: string
}

export const OBJEKTE_SCHLUESSEL = 'objekte'

const zahl = (v: unknown, max = 5000): number => Math.max(-50, Math.min(max, Math.round(Number(v) * 10) / 10 || 0))
const FARBE = /^#[0-9a-f]{6}$/i

/** Aus den Antworten lesen und bereinigen (höchstens 200 Objekte) */
export function objekteAus(roh: unknown): BlattObjekt[] {
  let liste: unknown = roh
  if (typeof roh === 'string') {
    try {
      liste = JSON.parse(roh)
    } catch {
      return []
    }
  }
  if (!Array.isArray(liste)) return []
  return liste.slice(0, 200).flatMap((o): BlattObjekt[] => {
    const x = (o ?? {}) as Record<string, unknown>
    const t = x.t === 'text' || x.t === 'linie' || x.t === 'punkt' ? x.t : null
    if (!t) return []
    const s = Math.round(Number(x.s))
    if (!Number.isInteger(s) || s < 0 || s > 40) return []
    return [
      {
        id: String(x.id ?? '').slice(0, 20) || Math.random().toString(36).slice(2, 10),
        s,
        t,
        x: zahl(x.x),
        y: zahl(x.y, 20000),
        ...(t === 'linie' ? { x2: zahl(x.x2), y2: zahl(x.y2, 20000) } : {}),
        ...(t === 'text' ? { w: Math.max(40, Math.min(600, zahl(x.w) || 160)) } : {}),
        ...(typeof x.text === 'string' && x.text ? { text: x.text.slice(0, 400) } : {}),
        ...(typeof x.farbe === 'string' && FARBE.test(x.farbe) ? { farbe: x.farbe } : {})
      }
    ]
  })
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Die Objekte einer Seite als SVG (für Seitenbilder an die KI und den Druck) */
export function objekteSvg(objekte: BlattObjekt[], breite: number, hoehe: number): string {
  const teile: string[] = []
  for (const o of objekte) {
    const f = o.farbe ?? '#1d4ed8'
    if (o.t === 'linie')
      teile.push(
        `<line x1="${o.x}" y1="${o.y}" x2="${o.x2 ?? o.x}" y2="${o.y2 ?? o.y}" stroke="${f}" stroke-width="2.2" stroke-linecap="round"/>`,
        `<circle cx="${o.x}" cy="${o.y}" r="3" fill="${f}"/>`,
        `<circle cx="${o.x2 ?? o.x}" cy="${o.y2 ?? o.y}" r="3" fill="${f}"/>`
      )
    if (o.t === 'punkt') {
      teile.push(`<circle cx="${o.x}" cy="${o.y}" r="4.5" fill="${f}"/>`)
      if (o.text) teile.push(`<text x="${o.x + 8}" y="${o.y - 6}" font-size="13" font-family="sans-serif" fill="${f}">${esc(o.text)}</text>`)
    }
    if (o.t === 'text') {
      const w = o.w ?? 160
      const zeilen = (o.text ?? '').split('\n').flatMap((z) => umbrechen(z, Math.max(6, Math.floor(w / 7.2))))
      const h = Math.max(24, zeilen.length * 17 + 8)
      teile.push(`<rect x="${o.x}" y="${o.y}" width="${w}" height="${h}" rx="4" fill="#ffffff" fill-opacity="0.92" stroke="${f}" stroke-width="1.4"/>`)
      zeilen.forEach((z, i) => teile.push(`<text x="${o.x + 5}" y="${o.y + 17 + i * 17}" font-size="13" font-family="sans-serif" fill="${f}">${esc(z)}</text>`))
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" viewBox="0 0 ${breite} ${hoehe}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:55">${teile.join('')}</svg>`
}

/** Grober Zeilenumbruch nach Zeichenzahl (für das SVG) */
function umbrechen(text: string, breite: number): string[] {
  const woerter = text.split(/\s+/).filter(Boolean)
  if (!woerter.length) return ['']
  const zeilen: string[] = []
  let z = ''
  for (const w of woerter) {
    if (z && (z + ' ' + w).length > breite) {
      zeilen.push(z)
      z = w
    } else z = z ? `${z} ${w}` : w
  }
  zeilen.push(z)
  return zeilen
}
