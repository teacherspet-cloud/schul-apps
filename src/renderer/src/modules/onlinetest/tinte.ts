/**
 * Tinte und Korrekturzeichen der Schreibfläche im Onlinetest (02.10.2026).
 *
 * Abgestimmt mit der Lehrkraft: Wortkärtchen nach der Erkennung, dazu Korrekturzeichen wie auf
 * Papier. Bewährt aus Notiz-Apps (GoodNotes, OneNote – Recherche 02.10.2026):
 *  - Durchkritzeln (Zickzack) löscht, was darunter liegt
 *  - Durchstreichen (waagerechter Strich über ein Wort) löscht das Wort
 *  - Einfügezeichen ∧ zwischen zwei Wörtern: dort ein Wort einfügen
 *  - Kreis um ein Wort: dieses Wort ersetzen
 * Die Erkennung der Zeichen ist eine FAUSTREGEL (Form des Strichs), keine Handschrifterkennung.
 *
 * Koordinaten sind „logisch": Breite der Fläche = 1000, Höhe im Seitenverhältnis. So passt die
 * Tinte in jede Größe (Feld und vergrößerte Fläche).
 */
export type Punkt = [number, number]
export type Strich = Punkt[]

export const BREITE = 1000

export interface Rahmen {
  x: number
  y: number
  b: number
  h: number
}

export function rahmen(s: Strich): Rahmen {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of s) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return { x: x0, y: y0, b: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

export const laenge = (s: Strich): number => s.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0)

/** Wie oft der Strich waagerecht die Richtung wechselt (Rauschen unter `schwelle` zählt nicht) */
export function richtungswechsel(s: Strich, schwelle = 6): number {
  let wechsel = 0
  let richtung = 0
  let anker = s[0]?.[0] ?? 0
  for (const [x] of s) {
    const d = x - anker
    if (Math.abs(d) < schwelle) continue
    const r = Math.sign(d)
    if (richtung && r !== richtung) wechsel++
    richtung = r
    anker = x
  }
  return wechsel
}

export type Geste = 'kritzeln' | 'streichen' | 'einfuegen' | 'kreis' | null

/** Welches Korrekturzeichen ist dieser Strich? (null = gewöhnliche Schrift) */
export function geste(s: Strich): Geste {
  if (s.length < 4) return null
  const r = rahmen(s)
  const l = laenge(s)
  const gross = Math.max(r.b, r.h)
  // Durchkritzeln: hin und her, mindestens dreimal die Richtung gewechselt, deutlich längerer Weg als breit
  if (richtungswechsel(s) >= 3 && r.b > 25 && l > 2.5 * r.b) return 'kritzeln'
  // Kreis: Anfang und Ende nah beieinander, Weg rund um den Rahmen
  const ende = Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1])
  if (r.b > 25 && r.h > 18 && ende < 0.35 * gross && l > 2.2 * gross) return 'kreis'
  // Durchstreichen: flach, fast gerade, breit
  if (r.b > 45 && r.h < 0.25 * r.b && l < 1.35 * r.b) return 'streichen'
  // Einfügezeichen ∧: hinauf zur Spitze in der Mitte, wieder hinunter; schmal
  if (r.b < 120 && r.b > 8 && r.h > 14 && richtungswechsel(s) === 0) {
    let spitze = 0
    for (let i = 1; i < s.length; i++) if (s[i][1] < s[spitze][1]) spitze = i
    const anteil = spitze / (s.length - 1)
    const unten = r.y + 0.6 * r.h
    if (anteil > 0.2 && anteil < 0.8 && s[0][1] > unten && s[s.length - 1][1] > unten && l < 2.6 * Math.hypot(r.b / 2, r.h)) return 'einfuegen'
  }
  return null
}

/** Überdeckt der Rahmen eines Strichs den anderen weitgehend (für Kritzeln über Tinte)? */
export function ueberdeckt(oben: Rahmen, unten: Rahmen, anteil = 0.5): boolean {
  const b = Math.max(0, Math.min(oben.x + oben.b, unten.x + unten.b) - Math.max(oben.x, unten.x))
  const h = Math.max(0, Math.min(oben.y + oben.h, unten.y + unten.h) - Math.max(oben.y, unten.y))
  const flaeche = Math.max(1, unten.b * unten.h)
  return (b * h) / flaeche >= anteil || (b > 0 && h > 0 && unten.b * unten.h < 40)
}

/** Kritzeln über Tinte: die darunterliegenden Striche entfernen */
export function wegkritzeln(striche: Strich[], kritzel: Strich): Strich[] {
  const k = rahmen(kritzel)
  return striche.filter((s) => !ueberdeckt(k, rahmen(s), 0.45))
}

/** Radierer: alle Striche, die der Radierweg berührt */
export function radieren(striche: Strich[], weg: Strich, radius = 14): Strich[] {
  return striche.filter((s) => !s.some(([x, y]) => weg.some(([a, b]) => Math.hypot(x - a, y - b) < radius)))
}

/** Rahmen aller Striche zusammen */
export function gesamtRahmen(striche: Strich[]): Rahmen | null {
  if (!striche.length) return null
  const rs = striche.map(rahmen)
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  return { x, y, b: Math.max(...rs.map((r) => r.x + r.b)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}

/**
 * Schriftbild für die Erkennung: auf die Schrift zugeschnitten, schwarz auf weiß, höchstens
 * 900 px breit (klein genug für schnelle Anfragen, groß genug für Buchstaben).
 */
export function schriftbild(striche: Strich[]): string | null {
  const r = gesamtRahmen(striche)
  if (!r || typeof document === 'undefined') return null
  const rand = 16
  const skala = Math.min(1.6, 900 / (r.b + 2 * rand))
  const c = document.createElement('canvas')
  c.width = Math.max(40, Math.round((r.b + 2 * rand) * skala))
  c.height = Math.max(40, Math.round((r.h + 2 * rand) * skala))
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#000'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(2, 3.2 * skala)
  for (const s of striche) {
    g.beginPath()
    s.forEach(([x, y], i) => {
      const px = (x - r.x + rand) * skala
      const py = (y - r.y + rand) * skala
      if (i) g.lineTo(px, py)
      else g.moveTo(px, py)
    })
    if (s.length === 1) g.lineTo((s[0][0] - r.x + rand) * skala + 0.1, (s[0][1] - r.y + rand) * skala)
    g.stroke()
  }
  return c.toDataURL('image/png')
}
