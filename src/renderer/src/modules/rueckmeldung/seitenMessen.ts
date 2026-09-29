/**
 * Die Seiten des Blatts MESSEN (29.09.2026 nachts, EINE Paginierung für Ansicht und PDF): Blöcke,
 * Textzeilen, Tabellenzeilen und Randnotizen werden am gezeichneten Blatt gemessen und an die
 * Regeln in seitenPlan.ts gegeben.
 *
 * - Ansicht (steps/Blatt.tsx): misst das Blatt, das sie zeigt.
 * - PDF/Drucken (`boegenDruckHtml`): zeichnet das Druck-HTML in einem unsichtbaren Rahmen in
 *   A4-Breite – ohne die Oberfläche der App, genau wie später das Druckfenster –, misst dort und
 *   gibt dem Druck-HTML den fertigen Seitenplan mit (feste Seiten-Container).
 *
 * Gemessen wird in Millimetern über ein Lineal gleicher Umgebung; Zoom der Ansicht spielt so keine
 * Rolle. Die Lage der Randnotizen kommt aus dem Layout (offsetTop) – eine schon verschobene Notiz
 * (transform) misst deshalb dasselbe wie vorher.
 */
import { kiMetaTag } from '@shared/kiKennzeichnung'
import type { Korrekturzeichen } from '../../shared/korrekturzeichen'
import { BLATT_CSS, blattDokument, blattHtml, leererPlan, SEITE_NUTZ_MM, titelZeile, type SeitenPlan } from './blattLayout'
import { notizenEinpassen, seitenPlanen, type MessBlock, type MessNotiz } from './seitenPlan'
import type { Abgabe, Rueckmeldung } from './model/types'

export const LINEAL_MM = 100

/** Umrechnung px → mm für Bildschirmmaße (getBoundingClientRect) und Layoutmaße (offset…) */
interface Masse {
  client: number
  layout: number
}

export function masseVon(lineal: HTMLElement): Masse | null {
  const c = lineal.getBoundingClientRect().height
  const l = lineal.offsetHeight
  if (!c || !l) return null
  return { client: LINEAL_MM / c, layout: LINEAL_MM / l }
}

/** Ein unsichtbares Lineal von 100 mm – als Maßstab in derselben Umgebung wie das Blatt */
export const linealStil = `position:absolute;left:0;top:0;width:1px;height:${LINEAL_MM}mm;visibility:hidden;pointer-events:none`

/** Kein Schülertext: Randnotizen (Floats mitten im Absatz) und die hochgestellten Nummern */
const istOhneText = (n: Node): boolean => Boolean(n.parentElement?.closest('[data-kein-text], .bl-notiz, .bl-nr-t'))

/** Textzeilen eines Absatzes: Zahl, Höhe und der Anfang jeder Zeile als Zeichenposition */
function textMessen(block: HTMLElement, von: number, m: Masse): MessBlock['text'] {
  const t = block.querySelector<HTMLElement>('.bl-text')
  if (!t) return undefined
  const r0 = t.getBoundingClientRect()
  const oben = (r0.top - block.getBoundingClientRect().top) * m.client
  // Zeilenhöhe: berechnete line-height (Layout-px) → mm
  const doc = t.ownerDocument
  const stil = doc.defaultView ?? window
  const zeile = parseFloat(stil.getComputedStyle(t).lineHeight) * m.layout
  const knoten: { n: Text; start: number }[] = []
  let pos = 0
  let voll = ''
  const lauf = doc.createTreeWalker(t, NodeFilter.SHOW_TEXT)
  for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
    if (istOhneText(n)) continue
    const x = n as Text
    knoten.push({ n: x, start: pos })
    pos += x.data.length
    voll += x.data
  }
  const zeichen: number[] = []
  for (let i = 0; i < voll.length; i++) if (!/\s/.test(voll[i])) zeichen.push(i)
  if (!zeichen.length || !zeile) return { oben, zeile: zeile || 1, zeilen: 0, start: () => null }
  const range = doc.createRange()
  const zeileVon = (i: number): number => {
    let lo = 0
    let hi = knoten.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (knoten[mid].start <= i) lo = mid
      else hi = mid - 1
    }
    const k = knoten[lo]
    range.setStart(k.n, i - k.start)
    range.setEnd(k.n, i - k.start + 1)
    const q = range.getClientRects()[0] ?? range.getBoundingClientRect()
    return Math.max(0, Math.floor((((q.top + q.bottom) / 2 - r0.top) * m.client) / zeile))
  }
  const zeilen = zeileVon(zeichen[zeichen.length - 1]) + 1
  const start = (n: number): number | null => {
    let lo = 0
    let hi = zeichen.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (zeileVon(zeichen[mid]) >= n) hi = mid
      else lo = mid + 1
    }
    return lo < zeichen.length ? von + zeichen[lo] : null
  }
  return { oben, zeile, zeilen, start }
}

/** Die Blöcke eines Blatts messen (Elemente mit `data-bl`, direkt im Blatt) */
export function blockeMessen(blatt: HTMLElement, m: Masse): { bloecke: MessBlock[]; els: HTMLElement[] } {
  const els = [...blatt.querySelectorAll<HTMLElement>(':scope > [data-bl]')]
  const bloecke = els.map((el): MessBlock => {
    const r = el.getBoundingClientRect()
    const b: MessBlock = { key: el.dataset.bl!, basis: el.dataset.blBasis ?? el.dataset.bl!, von: Number(el.dataset.blVon) || 0, art: el.dataset.blArt ?? '', hoehe: r.height * m.client }
    if (b.art === 'abs') b.text = textMessen(el, b.von, m)
    if (b.art === 'k') {
      const posten = [...el.querySelectorAll<HTMLElement>('[data-bl-teil]')]
      if (posten.length) {
        b.posten = posten.map((p) => {
          const q = p.getBoundingClientRect()
          return { oben: (q.top - r.top) * m.client, unten: (q.bottom - r.top) * m.client, halten: p.classList.contains('bereich') }
        })
        const k = el.matches('.bl-k') ? el : el.querySelector<HTMLElement>('.bl-k')
        const cs = k ? (k.ownerDocument.defaultView ?? window).getComputedStyle(k) : null
        b.polster = cs ? (parseFloat(cs.paddingBottom) + (parseFloat(cs.borderBottomWidth) || 0)) * m.layout : 0
      }
    }
    return b
  })
  return { bloecke, els }
}

/** Oberkante eines Elements im Blatt nach dem Layout (ohne transform) in Layout-px */
function layoutOben(el: HTMLElement, blatt: HTMLElement): number {
  let y = 0
  let x: HTMLElement | null = el
  while (x && x !== blatt) {
    y += x.offsetTop
    const p = x.offsetParent as HTMLElement | null
    if (!p || !blatt.contains(p)) {
      // offsetParent liegt außerhalb des Blatts: Abstand des Blatts abziehen
      if (p !== blatt) y -= blatt.offsetTop
      break
    }
    x = p
  }
  return y
}

/** Randnotizen je Seite messen und einpassen */
export function notizenPlanen(blatt: HTMLElement, els: HTMLElement[], seiten: { start: string }[], m: Masse, seite = SEITE_NUTZ_MM): SeitenPlan['notizen'] {
  const anfaenge = new Set(seiten.map((s) => s.start))
  const gruppen: HTMLElement[][] = [[]]
  for (const el of els) {
    if (anfaenge.has(el.dataset.bl!) && gruppen[gruppen.length - 1].length) gruppen.push([])
    gruppen[gruppen.length - 1].push(el)
  }
  const out: SeitenPlan['notizen'] = {}
  for (const gruppe of gruppen) {
    const seitenOben = layoutOben(gruppe[0], blatt)
    const notizen: MessNotiz[] = []
    let minOben = 0
    for (const el of gruppe) {
      if (el.dataset.blArt === 'kopf') minOben = (layoutOben(el, blatt) - seitenOben + el.offsetHeight) * m.layout + 1
      for (const n of el.querySelectorAll<HTMLElement>('.bl-notiz')) {
        // Kennung = Nummer der Notiz (Ansicht: data-notiz-nr, Druck: die Nummer im Kreis)
        const nr = n.dataset.notizNr ?? n.querySelector('.bl-nr')?.textContent?.trim()
        if (nr) notizen.push({ id: nr, oben: (layoutOben(n, blatt) - seitenOben) * m.layout, hoehe: n.offsetHeight * m.layout })
      }
    }
    Object.assign(out, notizenEinpassen(notizen, seite, minOben))
  }
  return out
}

/** Schnitt in den Plan übernehmen (Schnitte sammeln sich an, bis der Plan steht) */
export function mitSchnitt(plan: SeitenPlan, schnitt: { basis: string; stellen: number[] }): SeitenPlan {
  const alt = plan.schnitte[schnitt.basis] ?? []
  return { ...plan, schnitte: { ...plan.schnitte, [schnitt.basis]: [...new Set([...alt, ...schnitt.stellen])].sort((x, y) => x - y) }, seiten: [], notizen: {}, kappen: {} }
}

/** Höchstzahl der Messdurchgänge je Blatt (je Durchgang höchstens ein neu geteilter Block) */
export const MAX_DURCHGAENGE = 40

// ---------- Druck ----------

const bilderGeladen = async (el: HTMLElement): Promise<void> => {
  await Promise.all(
    [...el.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : img.decode().catch(() => new Promise<void>((fertig) => ((img.onload = () => fertig()), (img.onerror = () => fertig()))))
    )
  )
}

/** Ein unsichtbarer Rahmen in A4-Breite – dieselbe Umgebung wie das Druckfenster (nur das Blatt-CSS) */
async function messRahmen(): Promise<{ doc: Document; buehne: HTMLElement; lineal: HTMLElement; weg: () => void }> {
  const rahmen = document.createElement('iframe')
  rahmen.setAttribute('aria-hidden', 'true')
  rahmen.tabIndex = -1
  rahmen.style.cssText = 'position:fixed;left:-30000px;top:0;width:260mm;height:400mm;border:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(rahmen)
  const doc = rahmen.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}#buehne{position:relative;width:180mm}${BLATT_CSS}</style></head><body><div id="lineal" style="${linealStil}"></div><div id="buehne"></div></body></html>`
  )
  doc.close()
  await doc.fonts?.ready
  return { doc, buehne: doc.getElementById('buehne')!, lineal: doc.getElementById('lineal')!, weg: () => rahmen.remove() }
}

/** Den Seitenplan eines Blatts für den Druck messen */
async function druckPlan(r: Rueckmeldung, a: Abgabe, zeichen: Korrekturzeichen[] | undefined, rahmen: Awaited<ReturnType<typeof messRahmen>>): Promise<SeitenPlan> {
  let plan = leererPlan()
  for (let k = 0; k < MAX_DURCHGAENGE; k++) {
    rahmen.buehne.innerHTML = blattHtml(r, a, { zeichen, plan, messen: true })
    await bilderGeladen(rahmen.buehne)
    const m = masseVon(rahmen.lineal)
    const blatt = rahmen.buehne.querySelector<HTMLElement>('section.blatt')
    if (!m || !blatt) return plan
    const { bloecke, els } = blockeMessen(blatt, m)
    const erg = seitenPlanen(bloecke)
    if (erg.schnitt) {
      plan = mitSchnitt(plan, erg.schnitt)
      continue
    }
    return { ...plan, seiten: erg.seiten, notizen: notizenPlanen(blatt, els, erg.seiten, m), kappen: erg.kappen }
  }
  return plan
}

/**
 * Die Bögen als Druck-HTML MIT gemessenem Seitenplan – dieselben Seiten wie in der Ansicht, auch
 * für „Alle als PDF", wenn kein Bogen aufgeklappt ist. Ohne DOM (sollte nicht vorkommen) bleibt
 * es beim freien Fluss.
 */
export async function boegenDruckHtml(r: Rueckmeldung, abgaben: Abgabe[], opt: { zeichen?: Korrekturzeichen[] } = {}): Promise<string> {
  const fertige = abgaben.filter((a) => a.bogen)
  if (typeof document === 'undefined') return blattDokument(titelZeile(r), fertige.map((a) => blattHtml(r, a, { zeichen: opt.zeichen })), kiMetaTag(r.meta.ki))
  const rahmen = await messRahmen()
  try {
    const sektionen: string[] = []
    for (const a of fertige) sektionen.push(blattHtml(r, a, { zeichen: opt.zeichen, plan: await druckPlan(r, a, opt.zeichen, rahmen) }))
    return blattDokument(titelZeile(r), sektionen, kiMetaTag(r.meta.ki))
  } finally {
    rahmen.weg()
  }
}
