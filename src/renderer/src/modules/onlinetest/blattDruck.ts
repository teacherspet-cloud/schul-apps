/**
 * Druckfassung eines ausgefüllten digitalen Arbeitsblatts (PDF und Drucken), 03.10.2026.
 *
 * Befund der Lehrkraft (PDF „Wendepunkte im Ersten Weltkrieg"): Der getippte Text lag als Ebene mit
 * festen Seitenkoordinaten über dem Blatt. Beim Drucken auf A4 schiebt der Browser aber Aufgaben auf
 * die nächste Seite (sie sollen nicht zerreißen) – die Ebene blieb zurück und lag über M2 und der
 * Aufgabenstellung. Deshalb hier alles im Fluss des Blatts:
 *
 *  - Text auf Schreiblinien: so umbrochen wie im Feld (gemessen mit derselben Schrift und Breite) und
 *    Zeile für Zeile IN die Linien geschrieben – er wandert mit jeder Linie auf jede Seite.
 *  - Lücken, Kästchen, Felder: der Text steht im Element selbst.
 *  - Stift und Kästchen/Linien/Punkte: je Baustein ausgeschnitten und an den Baustein gehängt.
 *  - Markierungen im Text und Randkommentare im Korrekturrand neben der Zeile (wie am Bildschirm).
 */
import { objekteSvg, type BlattObjekt } from '@shared/blattObjekte'
import { fundstellen, ANMERKUNG_FARBE, type Anmerkung } from './blattKorrektur'

/** Alle Eingabestellen eines Blatts (Reihenfolge = Index `el` der Felder) */
export const FELDER = '.ws-line, .ws-label-line, .ws-check:not(.ws-check-demo), .ws-gap, .ws-space, .ws-workspace, .ws-box, .ws-tf-cell, .ws-cell-empty'
export const SCHRIFT = '"Segoe Print", "Comic Sans MS", system-ui, sans-serif'
const BLAU = '#1d4ed8'

export interface DruckFeld {
  id: string
  art: string
  seite: number
  x: number
  y: number
  w: number
  h: number
  zeilen?: number
  abstand?: number
  el?: number
}
export interface DruckSeite {
  x: number
  y: number
  w: number
  h: number
}

/** Zeilen, wie das Feld den Text umbricht: je Zeile Anfang und Ende im Text */
export function umbruch(text: string, breite: number, abstand: number): { start: number; ende: number }[] {
  const spiegel = document.createElement('div')
  spiegel.style.cssText = [
    'position:absolute',
    'left:-99999px',
    'top:0',
    `width:${breite}px`,
    `font-family:${SCHRIFT}`,
    `font-size:${schriftgroesse(abstand)}px`,
    `line-height:${abstand}px`,
    'padding:0 3px',
    'white-space:pre-wrap',
    'overflow-wrap:break-word',
    'box-sizing:border-box',
    'visibility:hidden'
  ].join(';')
  const teile: { start: number; ende: number; span: HTMLSpanElement | null }[] = []
  for (const m of text.matchAll(/\n|[^\S\n]+|\S+/g)) {
    const t = m[0]
    if (t === '\n') {
      spiegel.appendChild(document.createTextNode('\n'))
      continue
    }
    const span = document.createElement('span')
    span.textContent = t
    spiegel.appendChild(span)
    teile.push({ start: m.index ?? 0, ende: (m.index ?? 0) + t.length, span: /\S/.test(t) ? span : null })
  }
  document.body.appendChild(spiegel)
  const zeilen: { start: number; ende: number }[] = []
  for (const t of teile) {
    if (!t.span) continue
    const k = Math.max(0, Math.floor((t.span.offsetTop + 1) / abstand))
    while (zeilen.length <= k) zeilen.push({ start: -1, ende: -1 })
    if (zeilen[k].start < 0) zeilen[k].start = t.start
    zeilen[k].ende = t.ende
  }
  spiegel.remove()
  return zeilen.map((z) => (z.start < 0 ? { start: 0, ende: 0 } : z))
}

export const schriftgroesse = (abstand: number): number => Math.max(12, Math.min(18, abstand * 0.6))

/** Stück Text mit Markierungen (Hintergrund, Unterstreichung, Nummer) als DOM */
function markiert(doc: Document, text: string, von: number, bis: number, treffer: { start: number; ende: number; a: Anmerkung }[]): DocumentFragment {
  const frag = doc.createDocumentFragment()
  let pos = von
  for (const t of treffer) {
    const s = Math.max(t.start, von)
    const e = Math.min(t.ende, bis)
    if (e <= s) continue
    if (s > pos) frag.appendChild(doc.createTextNode(text.slice(pos, s)))
    const span = doc.createElement('span')
    const farbe = ANMERKUNG_FARBE[t.a.art]
    span.textContent = text.slice(s, e)
    span.style.cssText = [
      `background:${t.a.art === 'lob' ? 'rgba(47,158,68,0.16)' : t.a.art === 'hinweis' ? 'rgba(240,140,0,0.14)' : 'rgba(224,49,49,0.10)'}`,
      t.a.art === 'lob' ? '' : `text-decoration:underline ${t.a.art === 'fehler' ? 'wavy' : 'solid'} ${farbe}`,
      'text-decoration-thickness:1.5px',
      'text-underline-offset:3px'
    ]
      .filter(Boolean)
      .join(';')
    frag.appendChild(span)
    if (t.ende <= bis) {
      const sup = doc.createElement('sup')
      sup.textContent = String(t.a.nr)
      sup.style.cssText = `color:${farbe};font-weight:800;font-size:0.65em;font-family:sans-serif`
      frag.appendChild(sup)
    }
    pos = e
  }
  if (bis > pos) frag.appendChild(doc.createTextNode(text.slice(pos, bis)))
  return frag
}

function kommentar(doc: Document, a: Anmerkung): HTMLElement {
  const k = doc.createElement('div')
  const farbe = ANMERKUNG_FARBE[a.art]
  k.style.cssText = `border-left:2.5px solid ${farbe};padding:0 0 0 1.5mm;font:7.5pt/1.25 system-ui,sans-serif;color:#222;background:#fff`
  const b = doc.createElement('b')
  b.style.color = farbe
  b.textContent = `${a.nr}${a.zeichen ? ` ${a.zeichen}` : ''} `
  k.append(b, doc.createTextNode(a.text))
  return k
}

const bildLaden = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, fehler) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fehler(new Error('Stift-Ebene nicht lesbar'))
    img.src = src
  })

export async function druckfassung(
  doc: Document,
  gemessen: { felder: DruckFeld[]; seiten: DruckSeite[] },
  antworten: Record<string, string>,
  tinte: Record<string, string>,
  objekte: BlattObjekt[],
  anmerkungen: Anmerkung[]
): Promise<string> {
  // Bausteine je Seite (oberste Ebene im Inhalt) – Stift und Kästchen hängen an ihnen
  const bausteine: { seite: number; x: number; y: number; w: number; h: number; i: number }[] = []
  const seitenEl = [...doc.querySelectorAll<HTMLElement>('.ws-page')]
  let n = 0
  seitenEl.forEach((seite, si) => {
    const s = seite.getBoundingClientRect()
    seite.querySelectorAll<HTMLElement>('.ws-body > *').forEach((b) => {
      const r = b.getBoundingClientRect()
      if (r.height < 2) return
      b.setAttribute('data-druck-baustein', String(n))
      bausteine.push({ seite: si, x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, i: n++ })
    })
  })
  const klon = doc.documentElement.cloneNode(true) as HTMLElement
  doc.querySelectorAll('[data-druck-baustein]').forEach((b) => b.removeAttribute('data-druck-baustein'))
  const baustein = (i: number): HTMLElement | null => klon.querySelector<HTMLElement>(`[data-druck-baustein="${i}"]`)
  const elemente = [...klon.querySelectorAll<HTMLElement>(FELDER)]

  // ---------- Text
  const vergeben = new Set<number>()
  const nachtrag = new Map<Element, Anmerkung[]>()
  for (const f of gemessen.felder) {
    const wert = antworten[f.id] ?? ''
    if (!wert.trim() || f.el === undefined) continue
    const el = elemente[f.el]
    if (!el) continue
    const treffer = fundstellen(
      wert,
      anmerkungen.filter((a) => !vergeben.has(a.nr))
    )
    treffer.forEach((t) => vergeben.add(t.a.nr))
    if (f.art === 'zeilen' && (f.zeilen ?? 1) > 1) {
      const abstand = f.abstand ?? 24
      const linien = elemente.slice(f.el, f.el + (f.zeilen ?? 1)).filter((x) => x.classList.contains('ws-line'))
      const umbr = umbruch(wert, f.w, abstand)
      // Mehr Text als Linien (sollte durch das Mitwachsen nicht vorkommen): Linien ergänzen
      while (linien.length < umbr.length && linien.length) {
        const neu = linien[linien.length - 1].cloneNode(true) as HTMLElement
        neu.innerHTML = ''
        linien[linien.length - 1].after(neu)
        linien.push(neu)
      }
      umbr.forEach((z, k) => {
        const linie = linien[k]
        if (!linie || z.ende <= z.start) return
        linie.style.position = 'relative'
        const span = klon.ownerDocument.createElement('span')
        span.style.cssText = `position:absolute;left:3px;bottom:${Math.round(abstand * 0.14)}px;white-space:pre;color:${BLAU};font-family:${SCHRIFT};font-size:${schriftgroesse(abstand)}px;line-height:1.2`
        span.appendChild(markiert(klon.ownerDocument, wert, z.start, z.ende, treffer))
        linie.appendChild(span)
      })
      // Randkommentare im Korrekturrand, auf Höhe der Zeile, ohne Überlappung
      let frei = 0
      for (const t of treffer) {
        const k0 = Math.max(
          0,
          umbr.findIndex((z) => t.start >= z.start && t.start < Math.max(z.ende, z.start + 1))
        )
        const k = Math.min(linien.length - 1, Math.max(k0, frei))
        const linie = linien[k]
        if (!linie) continue
        linie.style.position = 'relative'
        const box = kommentar(klon.ownerDocument, t.a)
        box.style.position = 'absolute'
        box.style.left = 'calc(100% + 2mm)'
        box.style.top = '2px'
        box.style.width = '30mm'
        box.style.zIndex = '30'
        linie.appendChild(box)
        const hoehePx = Math.ceil(((t.a.zeichen?.length ?? 0) + t.a.text.length + 4) / 24) * 12.5 + 4
        frei = k + Math.max(1, Math.ceil(hoehePx / abstand))
      }
      continue
    }
    // Lücke, Kästchen, Fläche: Text im Element
    el.style.position = el.style.position || 'relative'
    const div = klon.ownerDocument.createElement('div')
    if (f.art === 'kreuz') {
      div.textContent = '✗'
      div.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${BLAU};font-weight:700;font-size:${Math.min(f.w, f.h) * 0.9}px;line-height:1`
    } else {
      div.textContent = wert
      const einzeilig = f.art === 'luecke' || f.art === 'zeilen' || f.art === 'text'
      div.style.cssText = [
        'position:absolute',
        'left:0',
        einzeilig ? 'bottom:1px' : 'top:2px',
        'width:100%',
        `color:${BLAU}`,
        `font-family:${SCHRIFT}`,
        `font-size:${einzeilig ? Math.max(11, Math.min(18, f.h * 0.65)) : 14}px`,
        'line-height:1.25',
        einzeilig ? 'white-space:nowrap' : 'white-space:pre-wrap;overflow-wrap:break-word',
        'padding:0 3px',
        'z-index:20'
      ].join(';')
    }
    el.appendChild(div)
    // Kommentare zu Lücken und Kästchen: unter der Aufgabe gesammelt
    if (treffer.length) {
      const ziel = el.closest('.ws-task') ?? el.closest('.ws-body > *')
      if (ziel) nachtrag.set(ziel, [...(nachtrag.get(ziel) ?? []), ...treffer.map((t) => t.a)])
    }
  }
  for (const [ziel, liste] of nachtrag) {
    const kasten = klon.ownerDocument.createElement('div')
    kasten.style.cssText = 'margin:2mm 0 0;display:flex;flex-direction:column;gap:1mm'
    for (const a of liste) kasten.appendChild(kommentar(klon.ownerDocument, a))
    ziel.appendChild(kasten)
  }

  // ---------- Stift (je Baustein ausgeschnitten) und Kästchen/Linien/Punkte
  for (const [seiteStr, src] of Object.entries(tinte)) {
    const si = Number(seiteStr)
    const s = gemessen.seiten[si]
    if (!s || !src) continue
    const img = await bildLaden(src).catch(() => null)
    if (!img) continue
    const k = img.naturalWidth / s.w
    for (const b of bausteine.filter((x) => x.seite === si)) {
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(b.w * k))
      c.height = Math.max(1, Math.round(b.h * k))
      const ctx = c.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(img, b.x * k, b.y * k, b.w * k, b.h * k, 0, 0, c.width, c.height)
      const px = ctx.getImageData(0, 0, c.width, c.height).data
      let leer = true
      for (let i = 3; i < px.length; i += 16)
        if (px[i] > 8) {
          leer = false
          break
        }
      const ziel = baustein(b.i)
      if (leer || !ziel) continue
      ziel.style.position = ziel.style.position || 'relative'
      const bild = klon.ownerDocument.createElement('img')
      bild.src = c.toDataURL('image/png')
      bild.style.cssText = `position:absolute;left:0;top:0;width:${b.w}px;height:${b.h}px;z-index:50;pointer-events:none;mix-blend-mode:multiply`
      ziel.appendChild(bild)
    }
  }
  const proBaustein = new Map<number, BlattObjekt[]>()
  for (const o of objekte) {
    const liste = bausteine.filter((b) => b.seite === o.s)
    if (!liste.length) continue
    // Der Baustein, in dem das Objekt liegt – sonst der letzte darüber
    const b = liste.find((x) => o.y >= x.y && o.y <= x.y + x.h) ?? [...liste].reverse().find((x) => x.y <= o.y) ?? liste[0]
    const verschoben = {
      ...o,
      x: o.x - b.x,
      y: o.y - b.y,
      ...(o.x2 !== undefined ? { x2: o.x2 - b.x } : {}),
      ...(o.y2 !== undefined ? { y2: o.y2 - b.y } : {})
    }
    proBaustein.set(b.i, [...(proBaustein.get(b.i) ?? []), verschoben])
  }
  for (const [i, liste] of proBaustein) {
    const ziel = baustein(i)
    const b = bausteine[i]
    if (!ziel || !b) continue
    ziel.style.position = ziel.style.position || 'relative'
    ziel.insertAdjacentHTML('beforeend', objekteSvg(liste, b.w, b.h))
  }
  klon.querySelectorAll('[data-druck-baustein]').forEach((b) => b.removeAttribute('data-druck-baustein'))

  const druck = klon.ownerDocument.createElement('style')
  druck.textContent =
    '@page{size:A4;margin:0}html,body{background:#fff !important}' +
    '.ws-page{break-after:page;margin:0 !important;box-shadow:none !important}.ws-page:last-child{break-after:auto}' +
    '.ws-line{break-inside:avoid}' +
    '@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
  klon.querySelector('head')?.appendChild(druck)
  return `<!doctype html>${klon.outerHTML}`
}

/** Druckdialog mit Seitenvorschau: die Druckfassung in einem unsichtbaren Rahmen drucken */
export async function druckenImRahmen(html: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const rahmen = document.createElement('iframe')
  rahmen.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  rahmen.setAttribute('data-druckrahmen', '')
  const geladen = new Promise<void>((ok) => (rahmen.onload = () => ok()))
  rahmen.src = url
  document.body.appendChild(rahmen)
  await geladen
  const w = rahmen.contentWindow
  const d = rahmen.contentDocument
  if (!w || !d) throw new Error('Drucken ist hier nicht möglich.')
  await (d.fonts?.ready ?? Promise.resolve())
  await Promise.all([...d.images].map((i) => (i.complete ? null : new Promise((ok) => ((i.onload = ok), (i.onerror = ok))))))
  const weg = (): void => {
    setTimeout(() => {
      rahmen.remove()
      URL.revokeObjectURL(url)
    }, 1000)
  }
  w.addEventListener('afterprint', weg, { once: true })
  setTimeout(weg, 10 * 60_000)
  w.focus()
  w.print()
}
