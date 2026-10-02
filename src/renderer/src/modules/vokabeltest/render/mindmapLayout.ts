import type { MindmapBlock, MindmapItem, MindmapVariante } from '../model/types'

/*
 * Echte Mindmap (02.10.2026, Befund der Lehrkraft): vorher stand nur der Oberbegriff über einer
 * nummerierten Linienliste – das ist keine Mindmap. Jetzt: Oberbegriff in der Mitte, Äste nach
 * links und rechts, an jedem Ast ein Kasten (Oberbegriff bzw. leer zum selbst Beschriften) und
 * darunter Zweige mit Schreiblinien.
 *
 * Dieselbe Geometrie dient der Vorschau/dem Druck (TestPage) und dem Word-Export (als Bild),
 * damit beide gleich aussehen. Alle Maße in Millimetern; die Breite entspricht dem Satzspiegel
 * des Tests (210 mm − 25 mm − 20 mm Rand). Schreiblinien mindestens 38 × 10 mm – darauf passt
 * auch ein längeres Wort in Schülerhandschrift.
 */

export const MM_MASSE = {
  breite: 165,
  mitteB: 44,
  mitteH: 17,
  labelB: 46,
  labelH: 10,
  zweigB: 38,
  zweigH: 10,
  zweigAbstand: 1.5,
  astAbstand: 6,
  /** Abstand des senkrechten Stiels vom inneren Rand des Ast-Kastens */
  stiel: 2,
  rand: 1
} as const

export interface MindmapAst {
  id: string
  /** Oberbegriff (in der offenen Form nur Lösungsvorschlag) */
  label: string
  /** Steht der Oberbegriff auf dem Schülerblatt? Sonst leerer Kasten zum Beschriften */
  vorgegeben: boolean
  /** Freier Ast für eigene Wörter (nicht bewertet) */
  frei: boolean
  /** Erwartete Wörter dieses Astes (Lösung) */
  woerter: MindmapItem[]
  /** Zahl der Schreiblinien */
  zweige: number
}

/** Gilt die Form mit Oberbegriffen? Ohne mindestens zwei Oberbegriffe bleibt nur die offene Form. */
export function mindmapVariante(block: Pick<MindmapBlock, 'variante' | 'branches'>): MindmapVariante {
  return block.variante === 'oberbegriffe' && (block.branches ?? []).filter((b) => b.label.trim()).length >= 2 ? 'oberbegriffe' : 'offen'
}

/** Zahl der Äste für Wörter ohne Oberbegriffe (alte Blöcke): drei bis fünf, nie mehr als Wörter */
const astZahlOhneOberbegriffe = (n: number): number => Math.max(1, Math.min(n, Math.max(3, Math.min(5, Math.ceil(n / 3)))))

/**
 * Äste einer Mindmap – auch für alte Blöcke (nur `topic` + `items`): die werden als offene
 * Mindmap gelesen, die Wörter reihum auf drei bis fünf Äste verteilt (nur für den Lösungsteil).
 */
export function mindmapAeste(block: MindmapBlock): MindmapAst[] {
  const items = block.items
  const variante = mindmapVariante(block)
  const branches = (block.branches ?? []).filter((b) => b.label.trim() || items.some((i) => i.branchId === b.id))

  if (branches.length >= 2) {
    const gruppen = branches.map((b) => ({ b, woerter: items.filter((i) => i.branchId === b.id) }))
    // Wörter ohne (gültigen) Ast kommen an den bisher kleinsten Ast, damit kein Wort verloren geht
    for (const it of items.filter((i) => !branches.some((b) => b.id === i.branchId))) {
      gruppen.reduce((min, g) => (g.woerter.length < min.woerter.length ? g : min)).woerter.push(it)
    }
    if (variante === 'oberbegriffe') {
      const aeste: MindmapAst[] = gruppen.map((g) => ({
        id: g.b.id,
        label: g.b.label,
        vorgegeben: true,
        frei: false,
        woerter: g.woerter,
        // So viele Zweige wie Wörter am Ast – jeder Zweig ist ein Punkt
        zweige: Math.max(1, g.woerter.length)
      }))
      if (block.freierAst) aeste.push({ id: 'frei', label: '', vorgegeben: false, frei: true, woerter: [], zweige: 2 })
      return aeste
    }
    // Offen: alle Äste gleich lang, damit die Linienzahl die Ordnung nicht verrät
    const gleich = Math.max(2, Math.ceil(items.length / gruppen.length), ...gruppen.map((g) => g.woerter.length))
    return gruppen.map((g) => ({ id: g.b.id, label: g.b.label, vorgegeben: false, frei: false, woerter: g.woerter, zweige: gleich }))
  }

  const zahl = astZahlOhneOberbegriffe(items.length)
  const gleich = Math.max(2, Math.ceil(items.length / zahl))
  return Array.from({ length: zahl }, (_, k) => ({
    id: `ast-${k}`,
    label: '',
    vorgegeben: false,
    frei: false,
    woerter: items.filter((_, i) => i % zahl === k),
    zweige: gleich
  }))
}

export interface Rechteck {
  x: number
  y: number
  b: number
  h: number
}

export interface AstLage {
  ast: MindmapAst
  seite: 'links' | 'rechts'
  label: Rechteck
  zweige: Rechteck[]
  /** Hauptast von der Mitte zum Kasten (SVG-Pfad) */
  pfad: string
  /** Stiel und Zweige zu den Schreiblinien (SVG-Pfad) */
  zweigPfad: string
}

export interface MindmapLage {
  breite: number
  hoehe: number
  mitte: Rechteck
  aeste: AstLage[]
}

const r1 = (n: number): number => Math.round(n * 10) / 10

const astHoehe = (a: MindmapAst): number => MM_MASSE.labelH + a.zweige * (MM_MASSE.zweigH + MM_MASSE.zweigAbstand)

/**
 * Lage aller Teile: Die Äste kommen abwechselnd auf die Seite, die gerade kürzer ist (so bleibt
 * die Mindmap ausgewogen und niedrig), jede Seite senkrecht um die Mitte zentriert.
 */
export function mindmapLage(aeste: MindmapAst[], breite: number = MM_MASSE.breite): MindmapLage {
  const m = MM_MASSE
  const seiten: Record<'links' | 'rechts', MindmapAst[]> = { links: [], rechts: [] }
  const hoehe = { links: 0, rechts: 0 }
  for (const a of aeste) {
    const seite = hoehe.rechts <= hoehe.links ? 'rechts' : 'links'
    seiten[seite].push(a)
    hoehe[seite] += astHoehe(a) + (seiten[seite].length > 1 ? m.astAbstand : 0)
  }
  const gesamt = r1(Math.max(hoehe.links, hoehe.rechts, m.mitteH + 4) + 2 * m.rand)
  const mitte: Rechteck = { x: r1((breite - m.mitteB) / 2), y: r1((gesamt - m.mitteH) / 2), b: m.mitteB, h: m.mitteH }
  const cy = mitte.y + m.mitteH / 2

  const lagen: AstLage[] = []
  for (const seite of ['rechts', 'links'] as const) {
    let y = (gesamt - hoehe[seite]) / 2
    for (const ast of seiten[seite]) {
      const rechts = seite === 'rechts'
      const label: Rechteck = { x: rechts ? breite - m.labelB : 0, y: r1(y), b: m.labelB, h: m.labelH }
      const zweige: Rechteck[] = Array.from({ length: ast.zweige }, (_, i) => ({
        x: rechts ? breite - m.zweigB : 0,
        y: r1(y + m.labelH + m.zweigAbstand + i * (m.zweigH + m.zweigAbstand)),
        b: m.zweigB,
        h: m.zweigH
      }))
      // Hauptast: geschwungen von der Seite der Mitte zur Innenkante des Kastens
      const sx = rechts ? mitte.x + m.mitteB : mitte.x
      const ex = rechts ? label.x : label.x + m.labelB
      const ey = label.y + m.labelH / 2
      const mx = (sx + ex) / 2
      const pfad = `M ${r1(sx)} ${r1(cy)} C ${r1(mx)} ${r1(cy)}, ${r1(mx)} ${r1(ey)}, ${r1(ex)} ${r1(ey)}`
      // Stiel an der Innenseite, von dort je ein Zweig zum Anfang der Schreiblinie
      const stielX = rechts ? label.x + m.stiel : label.x + m.labelB - m.stiel
      const linienX = rechts ? breite - m.zweigB : m.zweigB
      const letzte = zweige[zweige.length - 1]
      const zweigPfad = [
        `M ${r1(stielX)} ${r1(label.y + m.labelH)} L ${r1(stielX)} ${r1((letzte?.y ?? label.y) + m.zweigH)}`,
        ...zweige.map((z) => `M ${r1(stielX)} ${r1(z.y + m.zweigH)} L ${r1(linienX)} ${r1(z.y + m.zweigH)}`)
      ].join(' ')
      lagen.push({ ast, seite, label, zweige, pfad, zweigPfad })
      y += astHoehe(ast) + m.astAbstand
    }
  }
  return { breite, hoehe: gesamt, mitte, aeste: lagen }
}

// ---------- SVG für den Word-Export ----------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Zeilenumbruch nach geschätzter Zeichenbreite (Arial ≈ 0,52 × Schriftgröße) */
function umbrechen(text: string, breite: number, groesse: number, maxZeilen: number): string[] {
  const proZeile = Math.max(4, Math.floor(breite / (groesse * 0.52)))
  const zeilen: string[] = []
  let zeile = ''
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    if (!zeile) zeile = wort
    else if ((zeile + ' ' + wort).length <= proZeile) zeile += ' ' + wort
    else {
      zeilen.push(zeile)
      zeile = wort
    }
  }
  if (zeile) zeilen.push(zeile)
  if (zeilen.length > maxZeilen) {
    const rest = zeilen.slice(maxZeilen - 1).join(' ')
    return [...zeilen.slice(0, maxZeilen - 1), rest.length > proZeile ? rest.slice(0, proZeile - 1) + '…' : rest]
  }
  return zeilen
}

function textBlock(text: string, r: Rechteck, groesse: number, maxZeilen: number, attr: string): string {
  const zeilen = umbrechen(text, r.b - 3, groesse, maxZeilen)
  const lh = groesse * 1.15
  const y0 = r.y + r.h / 2 - ((zeilen.length - 1) * lh) / 2 + groesse * 0.35
  return zeilen
    .map((z, i) => `<text x="${r1(r.x + r.b / 2)}" y="${r1(y0 + i * lh)}" font-size="${groesse}" text-anchor="middle" ${attr}>${esc(z)}</text>`)
    .join('')
}

/**
 * Die Mindmap als SVG (Einheiten = mm) – für Word, wo sich die Zeichnung aus Kästen und
 * Linien nicht mit Tabellen nachbauen lässt. `loesung` trägt die erwarteten Wörter rot ein.
 */
export function mindmapSvg(block: MindmapBlock, loesung: boolean, akzent: string | null = null): string {
  const lage = mindmapLage(mindmapAeste(block))
  const farbe = akzent ?? '#111111'
  const rot = '#c62828'
  const teile: string[] = []
  for (const a of lage.aeste) {
    teile.push(`<path d="${a.pfad}" fill="none" stroke="#111" stroke-width="0.6"/>`)
    teile.push(`<path d="${a.zweigPfad}" fill="none" stroke="#111" stroke-width="0.3"/>`)
    const l = a.label
    const leer = !a.ast.vorgegeben
    teile.push(
      `<rect x="${l.x}" y="${l.y}" width="${l.b}" height="${l.h}" rx="2" fill="#fff" stroke="#111" stroke-width="${leer ? 0.3 : 0.4}"${
        leer ? ' stroke-dasharray="1.2 0.8"' : ''
      }/>`
    )
    if (a.ast.vorgegeben) teile.push(textBlock(a.ast.label, l, 3.5, 2, 'font-weight="bold"'))
    else if (loesung && a.ast.label) teile.push(textBlock(`(${a.ast.label})`, l, 3.2, 2, `fill="${rot}" font-style="italic"`))
    a.zweige.forEach((z, i) => {
      teile.push(`<line x1="${z.x}" y1="${r1(z.y + z.h)}" x2="${r1(z.x + z.b)}" y2="${r1(z.y + z.h)}" stroke="#111" stroke-width="0.3"/>`)
      const wort = a.ast.woerter[i]?.answer
      if (loesung && wort) teile.push(textBlock(wort, { ...z, y: z.y + 1.5 }, 3.5, 1, `fill="${rot}" font-weight="bold"`))
    })
  }
  const m = lage.mitte
  teile.push(
    `<rect x="${m.x}" y="${m.y}" width="${m.b}" height="${m.h}" rx="${m.h / 2}" fill="#fff" stroke="${farbe}" stroke-width="0.7"/>`,
    textBlock(block.topic, m, 4, 3, `font-weight="bold" fill="${farbe}"`)
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lage.breite}mm" height="${lage.hoehe}mm" viewBox="0 0 ${lage.breite} ${
    lage.hoehe
  }" font-family="Arial, Helvetica, sans-serif">${teile.join('')}</svg>`
}
