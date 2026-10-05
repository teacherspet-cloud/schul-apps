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
  t: 'text' | 'linie' | 'punkt' | 'form'
  /** Form: welche (05.10.2026, Werkzeug „Formen") */
  f?: FormArt
  x: number
  y: number
  /** Linie: Endpunkt */
  x2?: number
  y2?: number
  /** Textkästchen: Breite und Höhe (Höhe seit 03.10.2026 ziehbar; fehlt = nach Inhalt) */
  w?: number
  h?: number
  /** Linie: Anfang/Ende hängt an diesem Kästchen (wandert beim Verschieben mit) */
  v1?: string
  v2?: string
  /** Text des Kästchens bzw. Wert am Punkt */
  text?: string
  farbe?: string
}

export const OBJEKTE_SCHLUESSEL = 'objekte'

/*
 * Geometrische Formen (05.10.2026, Wunsch der Lehrkraft: „ein Werkzeug, bei dem man geometrische Formen aus
 * einem Dropdown-Menü auswählen kann – symbolhafte Darstellung, z. B. Dreieck/Rechteck –, um sie auf die
 * Schreibfläche zu legen"). Lage: x/y oben links, w/h Breite und Höhe in Seitenpixeln.
 */
export type FormArt = 'dreieck' | 'rechtwinklig' | 'rechteck' | 'quadrat' | 'kreis' | 'ellipse' | 'pfeil' | 'sechseck'

export const FORMEN: { art: FormArt; name: string }[] = [
  { art: 'dreieck', name: 'Dreieck' },
  { art: 'rechtwinklig', name: 'Rechtwinkliges Dreieck' },
  { art: 'rechteck', name: 'Rechteck' },
  { art: 'quadrat', name: 'Quadrat' },
  { art: 'kreis', name: 'Kreis' },
  { art: 'ellipse', name: 'Ellipse' },
  { art: 'sechseck', name: 'Sechseck' },
  { art: 'pfeil', name: 'Pfeil' }
]
const FORM_ARTEN = new Set(FORMEN.map((f) => f.art))

/** Quadrat und Kreis bleiben gleichseitig */
export const formMasse = (f: FormArt, w: number, h: number): { w: number; h: number } =>
  f === 'quadrat' || f === 'kreis' ? { w: Math.min(w, h), h: Math.min(w, h) } : { w, h }

/** Geometrie als SVG-Element (Zeichenkette ohne Farbe): Vieleck, Ellipse oder Pfad */
export function formGeometrie(
  f: FormArt,
  x: number,
  y: number,
  w0: number,
  h0: number
): { art: 'polygon'; points: string } | { art: 'ellipse'; cx: number; cy: number; rx: number; ry: number } {
  const { w, h } = formMasse(f, w0, h0)
  const p = (...xs: [number, number][]): { art: 'polygon'; points: string } => ({
    art: 'polygon',
    points: xs.map(([a, b]) => `${Math.round(x + a * w)},${Math.round(y + b * h)}`).join(' ')
  })
  switch (f) {
    case 'dreieck':
      return p([0.5, 0], [1, 1], [0, 1])
    case 'rechtwinklig':
      return p([0, 0], [0, 1], [1, 1])
    case 'kreis':
    case 'ellipse':
      return { art: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }
    case 'sechseck':
      return p([0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5])
    case 'pfeil':
      return p([0, 0.35], [0.65, 0.35], [0.65, 0.1], [1, 0.5], [0.65, 0.9], [0.65, 0.65], [0, 0.65])
    default:
      return p([0, 0], [1, 0], [1, 1], [0, 1])
  }
}

export function formSvg(o: Pick<BlattObjekt, 'f' | 'x' | 'y' | 'w' | 'h'>, farbe: string): string {
  const g = formGeometrie(o.f ?? 'rechteck', o.x, o.y, o.w ?? 90, o.h ?? 70)
  const stil = `fill="none" stroke="${farbe}" stroke-width="2.2" stroke-linejoin="round"`
  return g.art === 'ellipse' ? `<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${stil}/>` : `<polygon points="${g.points}" ${stil}/>`
}

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
    const t = x.t === 'text' || x.t === 'linie' || x.t === 'punkt' || x.t === 'form' ? x.t : null
    if (!t) return []
    if (t === 'form' && !FORM_ARTEN.has(x.f as FormArt)) return []
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
        ...(t === 'linie' && typeof x.v1 === 'string' && x.v1 ? { v1: x.v1.slice(0, 20) } : {}),
        ...(t === 'linie' && typeof x.v2 === 'string' && x.v2 ? { v2: x.v2.slice(0, 20) } : {}),
        ...(t === 'text' ? { w: Math.max(40, Math.min(600, zahl(x.w) || 160)) } : {}),
        ...(t === 'text' && Number(x.h) > 0 ? { h: Math.max(24, Math.min(900, zahl(x.h))) } : {}),
        ...(t === 'form' ? { f: x.f as FormArt, w: Math.max(10, Math.min(760, zahl(x.w) || 90)), h: Math.max(10, Math.min(1000, zahl(x.h) || 70)) } : {}),
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
    if (o.t === 'form') teile.push(formSvg(o, f))
    if (o.t === 'punkt') {
      teile.push(`<circle cx="${o.x}" cy="${o.y}" r="4.5" fill="${f}"/>`)
      if (o.text) teile.push(`<text x="${o.x + 8}" y="${o.y - 6}" font-size="13" font-family="sans-serif" fill="${f}">${esc(o.text)}</text>`)
    }
    if (o.t === 'text') {
      const w = o.w ?? 160
      const zeilen = (o.text ?? '').split('\n').flatMap((z) => umbrechen(z, Math.max(6, Math.floor(w / 7.2))))
      const h = Math.max(o.h ?? 24, zeilen.length * 17 + 8)
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

/** Kästchen und Verbindungslinien als Text für die KI (03.10.2026: Aufgaben ohne Schreibfelder, z. B. Zeitleiste) */
export function objekteText(objekte: BlattObjekt[]): string {
  const kaestchen = objekte.filter((o) => o.t === 'text' && o.text?.trim())
  const punkte = objekte.filter((o) => o.t === 'punkt')
  const linien = objekte.filter((o) => o.t === 'linie')
  const formen = objekte.filter((o) => o.t === 'form')
  if (!kaestchen.length && !punkte.length && !linien.length && !formen.length) return ''
  return [
    kaestchen.length ? `Textkästchen auf dem Blatt: ${kaestchen.map((o) => `„${o.text!.trim().replace(/\s+/g, ' ')}“`).join('; ')}` : '',
    linien.length ? `${linien.length} Verbindungslinie(n) gezogen (Lage siehe Seitenbild)` : '',
    punkte.length ? `${punkte.length} Punkt(e) gesetzt${punkte.some((o) => o.text) ? `: ${punkte.map((o) => o.text || '–').join(', ')}` : ''}` : '',
    formen.length ? `Formen gelegt: ${formen.map((o) => FORMEN.find((x) => x.art === o.f)?.name ?? 'Form').join(', ')} (Lage siehe Seitenbild)` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
