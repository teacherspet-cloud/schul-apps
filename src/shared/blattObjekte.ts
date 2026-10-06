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
  /*
   * Optionen aus dem Kontextmenü (06.10.2026, abgestimmt mit der Lehrkraft). Alle optional – fehlt etwas, gilt
   * das bisherige Aussehen (`farbe` für alles).
   */
  /** Kästchen/Form: Randfarbe (sonst `farbe`) */
  rand?: string
  /** Kästchen/Form: Füllfarbe (Kästchen sonst weiß, Form sonst leer) */
  fuellung?: string
  /** Kästchen: Textfarbe (sonst `farbe`) */
  textFarbe?: string
  /** Linie, Form, Kastenrand */
  linienArt?: LinienArt
  /** 1 dünn, 2 mittel (Standard), 3 dick */
  staerke?: 1 | 2 | 3
  /** Linie: Pfeilspitze am Ende oder an beiden Enden */
  pfeil?: 'ende' | 'beide'
  /** Kästchen: Schriftgröße klein/groß (sonst normal) und fett */
  groesse?: 'klein' | 'gross'
  fett?: boolean
  /** Linie: Jahr (Datum) an Anfang/Ende, wenn es dort auf einer Zeitleiste liegt */
  jahr1?: string
  jahr2?: string
  /** Linie: Jahreszahlen ausgeblendet */
  ohneJahr?: boolean
}

export type LinienArt = 'voll' | 'strich' | 'punkt'

/** Strichstärke in Seitenpixeln: Linien/Formen bzw. Kastenrand */
export const staerkeVon = (o: Pick<BlattObjekt, 'staerke' | 't'>): number =>
  o.t === 'text' ? ({ 1: 1, 2: 1.4, 3: 2.6 } as const)[o.staerke ?? 2] : ({ 1: 1.3, 2: 2.2, 3: 3.8 } as const)[o.staerke ?? 2]

/** SVG-Strichmuster (gestrichelt/gepunktet) */
export function strichMuster(art: LinienArt | undefined, w: number): string {
  if (art === 'strich') return `${Math.round(w * 3.2 * 10) / 10} ${Math.round(w * 2.4 * 10) / 10}`
  if (art === 'punkt') return `0.1 ${Math.round(w * 2.3 * 10) / 10}`
  return ''
}

/** CSS-Randstil zur Linienart */
export const randStil = (art: LinienArt | undefined): 'solid' | 'dashed' | 'dotted' => (art === 'strich' ? 'dashed' : art === 'punkt' ? 'dotted' : 'solid')

/** Schriftgröße und Zeilenhöhe eines Kästchens */
export const schriftVon = (o: Pick<BlattObjekt, 'groesse'>): { size: number; zeile: number } =>
  o.groesse === 'klein' ? { size: 11, zeile: 14 } : o.groesse === 'gross' ? { size: 16, zeile: 21 } : { size: 13, zeile: 17 }

/**
 * Jahreszahl entlang der Verbindungslinie (06.10.2026): nahe dem Ende, das auf der Zeitleiste liegt, mitgedreht –
 * aber nie kopfüber. Lage in Seitenpixeln.
 */
export function jahrBeschriftungen(o: BlattObjekt): { x: number; y: number; winkel: number; text: string }[] {
  if (o.t !== 'linie' || o.ohneJahr) return []
  const x2 = o.x2 ?? o.x
  const y2 = o.y2 ?? o.y
  const laenge = Math.hypot(x2 - o.x, y2 - o.y)
  if (laenge < 20) return []
  const aus: { x: number; y: number; winkel: number; text: string }[] = []
  for (const [text, ax, ay, bx, by] of [
    [o.jahr1, o.x, o.y, x2, y2],
    [o.jahr2, x2, y2, o.x, o.y]
  ] as const) {
    if (!text) continue
    // Einheitsvektor vom Ende zur Mitte der Linie
    const ux = (bx - ax) / laenge
    const uy = (by - ay) / laenge
    const abstand = Math.min(laenge / 2, 10 + text.length * 3.6)
    let winkel = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
    if (winkel > 90) winkel -= 180
    if (winkel < -90) winkel += 180
    // Senkrecht zur Linie etwas abrücken – immer zur „oberen" Seite der lesbaren Schrift
    const rad = (winkel * Math.PI) / 180
    const nx = Math.sin(rad)
    const ny = -Math.cos(rad)
    aus.push({ x: ax + ux * abstand + nx * 6, y: ay + uy * abstand + ny * 6, winkel: Math.round(winkel * 10) / 10, text })
  }
  return aus
}

/** Eine Verbindungslinie als SVG (Linie, Endpunkte bzw. Pfeilspitzen, Jahreszahlen) – Blatt, Druck und KI-Bild */
export function linieSvg(o: BlattObjekt): string {
  const f = o.farbe ?? '#1d4ed8'
  const w = staerkeVon(o)
  const x2 = o.x2 ?? o.x
  const y2 = o.y2 ?? o.y
  const muster = strichMuster(o.linienArt, w)
  const teile = [
    `<line x1="${o.x}" y1="${o.y}" x2="${x2}" y2="${y2}" stroke="${f}" stroke-width="${w}" stroke-linecap="round"${muster ? ` stroke-dasharray="${muster}"` : ''}/>`
  ]
  const spitze = (ax: number, ay: number, bx: number, by: number): string => {
    // Spitze bei b, Richtung a → b
    const l = Math.hypot(bx - ax, by - ay) || 1
    const ux = (bx - ax) / l
    const uy = (by - ay) / l
    const g = 6 + w * 2.2
    const b2 = g * 0.55
    const p = [
      [bx, by],
      [bx - ux * g - uy * b2, by - uy * g + ux * b2],
      [bx - ux * g + uy * b2, by - uy * g - ux * b2]
    ]
    return `<polygon points="${p.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ')}" fill="${f}"/>`
  }
  if (o.pfeil) teile.push(spitze(o.x, o.y, x2, y2))
  else teile.push(`<circle cx="${x2}" cy="${y2}" r="${w + 0.8}" fill="${f}"/>`)
  if (o.pfeil === 'beide') teile.push(spitze(x2, y2, o.x, o.y))
  else teile.push(`<circle cx="${o.x}" cy="${o.y}" r="${w + 0.8}" fill="${f}"/>`)
  for (const j of jahrBeschriftungen(o))
    teile.push(
      `<text x="${j.x}" y="${j.y}" transform="rotate(${j.winkel} ${j.x} ${j.y})" text-anchor="middle" font-size="12" font-weight="700" font-family="sans-serif" fill="${f}" stroke="#ffffff" stroke-width="3" paint-order="stroke" data-jahr>${esc(j.text)}</text>`
    )
  return teile.join('')
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

export function formSvg(o: Pick<BlattObjekt, 'f' | 'x' | 'y' | 'w' | 'h' | 'rand' | 'fuellung' | 'linienArt' | 'staerke' | 't'>, farbe: string): string {
  const g = formGeometrie(o.f ?? 'rechteck', o.x, o.y, o.w ?? 90, o.h ?? 70)
  const w = staerkeVon({ ...o, t: 'form' })
  const muster = strichMuster(o.linienArt, w)
  const stil = `fill="${o.fuellung ?? 'none'}" stroke="${o.rand ?? farbe}" stroke-width="${w}" stroke-linejoin="round"${muster ? ` stroke-dasharray="${muster}" stroke-linecap="round"` : ''}`
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
        ...(typeof x.farbe === 'string' && FARBE.test(x.farbe) ? { farbe: x.farbe } : {}),
        // Optionen (06.10.2026)
        ...(t !== 'linie' && t !== 'punkt' && typeof x.rand === 'string' && FARBE.test(x.rand) ? { rand: x.rand } : {}),
        ...(t !== 'linie' && t !== 'punkt' && typeof x.fuellung === 'string' && FARBE.test(x.fuellung) ? { fuellung: x.fuellung } : {}),
        ...(t === 'text' && typeof x.textFarbe === 'string' && FARBE.test(x.textFarbe) ? { textFarbe: x.textFarbe } : {}),
        ...(t !== 'punkt' && (x.linienArt === 'strich' || x.linienArt === 'punkt') ? { linienArt: x.linienArt } : {}),
        ...(t !== 'punkt' && (x.staerke === 1 || x.staerke === 3) ? { staerke: x.staerke } : {}),
        ...(t === 'linie' && (x.pfeil === 'ende' || x.pfeil === 'beide') ? { pfeil: x.pfeil } : {}),
        ...(t === 'text' && (x.groesse === 'klein' || x.groesse === 'gross') ? { groesse: x.groesse } : {}),
        ...(t === 'text' && x.fett === true ? { fett: true } : {}),
        ...(t === 'linie' && typeof x.jahr1 === 'string' && x.jahr1 ? { jahr1: x.jahr1.slice(0, 30) } : {}),
        ...(t === 'linie' && typeof x.jahr2 === 'string' && x.jahr2 ? { jahr2: x.jahr2.slice(0, 30) } : {}),
        ...(t === 'linie' && x.ohneJahr === true ? { ohneJahr: true } : {})
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
    if (o.t === 'linie') teile.push(linieSvg(o))
    if (o.t === 'form') teile.push(formSvg(o, f))
    if (o.t === 'punkt') {
      teile.push(`<circle cx="${o.x}" cy="${o.y}" r="4.5" fill="${f}"/>`)
      if (o.text) teile.push(`<text x="${o.x + 8}" y="${o.y - 6}" font-size="13" font-family="sans-serif" fill="${f}">${esc(o.text)}</text>`)
    }
    if (o.t === 'text') {
      const w = o.w ?? 160
      const { size, zeile } = schriftVon(o)
      const zeilen = (o.text ?? '').split('\n').flatMap((z) => umbrechen(z, Math.max(6, Math.floor(w / (size * 0.55 * (o.fett ? 1.08 : 1))))))
      const h = Math.max(o.h ?? 24, zeilen.length * zeile + 8)
      const rw = staerkeVon(o)
      const muster = strichMuster(o.linienArt, rw)
      teile.push(
        `<rect x="${o.x}" y="${o.y}" width="${w}" height="${h}" rx="4" fill="${o.fuellung ?? '#ffffff'}" fill-opacity="0.92" stroke="${o.rand ?? f}" stroke-width="${rw}"${muster ? ` stroke-dasharray="${muster}" stroke-linecap="round"` : ''}/>`
      )
      zeilen.forEach((z, i) =>
        teile.push(
          `<text x="${o.x + 5}" y="${o.y + zeile + i * zeile}" font-size="${size}"${o.fett ? ' font-weight="700"' : ''} font-family="sans-serif" fill="${o.textFarbe ?? f}">${esc(z)}</text>`
        )
      )
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
    linien.length
      ? `${linien.length} Verbindungslinie(n) gezogen (Lage siehe Seitenbild)${linien.some((o) => o.jahr1 || o.jahr2) ? `; auf der Zeitleiste markiert: ${linien.flatMap((o) => [o.jahr1, o.jahr2].filter(Boolean)).join(', ')}` : ''}`
      : '',
    punkte.length ? `${punkte.length} Punkt(e) gesetzt${punkte.some((o) => o.text) ? `: ${punkte.map((o) => o.text || '–').join(', ')}` : ''}` : '',
    formen.length ? `Formen gelegt: ${formen.map((o) => FORMEN.find((x) => x.art === o.f)?.name ?? 'Form').join(', ')} (Lage siehe Seitenbild)` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
