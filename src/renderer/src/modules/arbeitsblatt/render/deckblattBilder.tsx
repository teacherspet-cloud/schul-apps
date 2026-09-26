import { renderToStaticMarkup } from 'react-dom/server'
import type { CitationStyle } from '@shared/types'
import type { Worksheet } from '../model/types'
import { CoverPage, DeckblattKarteInhalt, deckblattLage } from './CoverPage'
import { deckblattFarben } from './coverDesigns'
import { istQuer, kartenMasse } from './deckblatt'
import { deckblattVorschau } from './deckblattVorschau'
import type { PagePlan } from './paginate'
import wsCss from './ws.css?raw'

/**
 * Das Deckblatt für den Word-Export (Paket 11): Hintergrund und Seitenvorschauen als Bilder.
 *
 * Word kennt weder gedrehte HTML-Kacheln noch verkleinerte Seiten. Damit die Anordnung in Word
 * GENAU so aussieht wie im Editor und im PDF, wird jede Karte einzeln gerastert und als
 * schwebendes, gedrehtes Bild an ihre Stelle gesetzt (export/docx.ts, `deckblattAbschnitt`);
 * so lässt sie sich in Word sogar noch verschieben.
 *
 * Die TEXTE des Kopfes – Titel, Fakten-Zeile mit Überthema, Kurztext, Kennzeichen – sind
 * dagegen echter Word-Text (Nachbesserung zu Paket 11): Als Teil des Hintergrundbildes ließen
 * sie sich in Word nicht ändern, und gerade den Titel passt man dort gern noch an. Der
 * Hintergrund trägt deshalb nur noch Farbflächen, Band, Maskottchen und Pillen; jeder Text wird
 * im echten Deckblatt VERMESSEN (Lage, Schrift, Farbe) und in Word als Textrahmen an genau
 * dieselbe Stelle gesetzt – für alle vier Kopf-Layouts aus derselben Messung.
 */
export interface DeckblattText {
  art: 'titel' | 'kicker-fach' | 'kicker-thema' | 'fakten' | 'ueberthema' | 'kurztext' | 'kennzeichen'
  /** Quelltext; bei Titel und Kurztext mit Formeln und Auszeichnungen (RichText) */
  text: string
  rich: boolean
  /** Lage des Textbereichs auf der Seite, mm */
  x: number
  y: number
  breite: number
  hoehe: number
  /** Schriftgröße in pt, Zeilenhöhe in mm */
  pt: number
  zeile: number
  fett: boolean
  /** Farbe als Hex ohne „#" – Deckkraft ist schon mit dem Untergrund verrechnet */
  farbe: string
  ausrichtung: 'left' | 'center' | 'right'
  /** Versalien und Sperrung (Fach über dem betonten Überthema) */
  versalien: boolean
  sperrungPt: number
  /** In einer Pille (Kennzeichen): senkrecht mittig */
  mittig: boolean
}

export interface DeckblattBilder {
  /** Ganze Seite ohne Vorschauen und ohne Texte, PNG */
  hintergrund: string
  /** Die Texte des Kopfes – in Word echter, bearbeitbarer Text */
  texte: DeckblattText[]
  karten: {
    png: string
    /** Linke obere Ecke des (ungedrehten) Bildes auf der Seite, mm */
    x0: number
    y0: number
    breite: number
    hoehe: number
    drehung: number
    ebene: number
  }[]
}

/** Rand um jede Karte im Bild – für Klebestreifen, Pin und Schatten, die über die Karte ragen */
const RAND_MM = 4
/** Auflösung der Bilder: 6 Pixel je mm ≈ 150 dpi – für Vorschauen auf dem Deckblatt genug */
const PX_JE_MM = 6

/**
 * HTML als PNG rastern – über ein SVG mit `foreignObject`, ganz im Browser (auch im
 * Netz-Zugang ohne Electron). Die Stile des Blattes kommen mit; Bilder im Blatt sind
 * data:-URLs und werden deshalb mitgezeichnet.
 */
export async function rastereHtml(html: string, breiteMm: number, hoeheMm: number, pxJeMm = PX_JE_MM): Promise<string> {
  const huelle = document.createElement('div')
  huelle.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  huelle.style.cssText = `width:${breiteMm}mm;height:${hoeheMm}mm;overflow:hidden;position:relative;background:transparent`
  const stil = document.createElement('style')
  stil.textContent = wsCss
  huelle.appendChild(stil)
  const inhalt = document.createElement('div')
  inhalt.innerHTML = html
  huelle.appendChild(inhalt)
  const xhtml = new XMLSerializer().serializeToString(huelle)
  const cssB = (breiteMm * 96) / 25.4
  const cssH = (hoeheMm * 96) / 25.4
  const w = Math.round(breiteMm * pxJeMm)
  const h = Math.round(hoeheMm * pxJeMm)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${cssB} ${cssH}"><foreignObject x="0" y="0" width="${cssB}" height="${cssH}">${xhtml}</foreignObject></svg>`
  const bild = await new Promise<HTMLImageElement>((ok, fehler) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fehler(new Error('Das Deckblatt konnte nicht für Word gezeichnet werden.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bild, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

/** Hintergrund und Karten des Deckblatts als Bilder, in der geltenden Anordnung */
export async function deckblattBilder(
  ws: Worksheet,
  layouts: Map<string, PagePlan[]>,
  logo: string | null,
  schoolName: string,
  citationStyle?: CitationStyle
): Promise<DeckblattBilder> {
  const vorschau = deckblattVorschau(ws, layouts, logo, schoolName, citationStyle)
  const texte = await vermesseTexte(ws, renderToStaticMarkup(<CoverPage ws={ws} />))
  const hintergrund = await rastereHtml(renderToStaticMarkup(<CoverPage ws={ws} nurGrund />), 210, 297)
  const { karten, rahmen } = deckblattLage(ws.meta, vorschau.kandidaten)
  const d = deckblattFarben(ws.meta)
  const farben = { ['--cover-dark' as string]: d.dark, ['--cover-mid' as string]: d.mid, ['--cover-light' as string]: d.light }
  const aus: DeckblattBilder['karten'] = []
  for (const [i, k] of karten.entries()) {
    const m = kartenMasse(k.breite, istQuer(k.seite), rahmen)
    const html = renderToStaticMarkup(
      <div className={`ws-cover-previews ws-cover-rahmen-${rahmen}`} style={farben}>
        <div className="ws-cover-thumb" style={{ left: `${RAND_MM}mm`, top: `${RAND_MM}mm`, width: `${m.breite}mm`, height: `${m.hoehe}mm` }}>
          <DeckblattKarteInhalt karte={k} rahmen={rahmen} nummer={i}>
            {vorschau.seite(k.seite)}
          </DeckblattKarteInhalt>
        </div>
      </div>
    )
    const breite = m.breite + 2 * RAND_MM
    const hoehe = m.hoehe + 2 * RAND_MM
    aus.push({
      png: await rastereHtml(html, breite, hoehe),
      x0: k.x - breite / 2,
      y0: k.y - hoehe / 2,
      breite,
      hoehe,
      drehung: k.drehung,
      ebene: k.ebene
    })
  }
  return { hintergrund, texte, karten: aus }
}

/** CSS-Farbe → [r, g, b, a] */
function rgba(css: string): [number, number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(css)
  if (!m) return [0, 0, 0, 0]
  const [r, g, b, a] = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)
  return [r, g, b, Number.isFinite(a) ? a : 1]
}

const hex = (r: number, g: number, b: number): string =>
  [r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

/**
 * Die Farbe, die man SIEHT: Word kennt keine halb durchsichtige Schrift. Die Fakten-Zeile steht
 * mit 85 % Deckkraft auf dem Band – verrechnet mit der Farbe darunter kommt in Word derselbe
 * Farbton heraus.
 */
function sichtbareFarbe(el: HTMLElement, seite: HTMLElement): string {
  const [r, g, b, a0] = rgba(getComputedStyle(el).color)
  let deckkraft = a0
  let grund: [number, number, number] = [255, 255, 255]
  let grundGefunden = false
  for (let e: HTMLElement | null = el; e && e !== seite.parentElement; e = e.parentElement) {
    const st = getComputedStyle(e)
    deckkraft *= Number(st.opacity || 1)
    const bg = rgba(st.backgroundColor)
    if (!grundGefunden && bg[3] > 0.5) {
      grund = [bg[0], bg[1], bg[2]]
      grundGefunden = true
    }
  }
  const mix = (v: number, u: number): number => v * deckkraft + u * (1 - deckkraft)
  return hex(mix(r, grund[0]), mix(g, grund[1]), mix(b, grund[2]))
}

/**
 * Lage und Schrift der Kopftexte im echten Deckblatt messen.
 *
 * Das Deckblatt wird dazu unsichtbar in einem Schatten-DOM mit den Blattstilen aufgebaut –
 * so wirken weder die Stile der App noch die Zoomstufe des Editors hinein, und die Messung
 * gilt für jedes Kopf-Layout, auch für künftige.
 */
async function vermesseTexte(ws: Worksheet, html: string): Promise<DeckblattText[]> {
  const wirt = document.createElement('div')
  /*
   * `all: initial` zuerst: Das Schatten-DOM erbt sonst Zeilenhöhe und Schrift der App (Mantine
   * setzt am body line-height 1.55). Im Druck und im Hintergrundbild gilt die Grundeinstellung
   * des Browsers – mit geerbter Zeilenhöhe lag im zentrierten Kopf jeder Text darunter 2 mm tiefer.
   */
  wirt.style.cssText = 'all:initial;display:block;position:fixed;left:-20000px;top:0;width:210mm;height:297mm;pointer-events:none;visibility:hidden'
  document.body.appendChild(wirt)
  try {
    const schatten = wirt.attachShadow({ mode: 'open' })
    schatten.innerHTML = `<style>${wsCss}</style>${html}`
    await document.fonts?.ready
    const seite = schatten.querySelector<HTMLElement>('.ws-cover')
    if (!seite) return []
    const s0 = seite.getBoundingClientRect()
    const mmJePx = 210 / (s0.width || 1)
    const ptJePx = mmJePx * (72 / 25.4)
    const out: DeckblattText[] = []
    const miss = (el: HTMLElement | null, art: DeckblattText['art'], text: string, rich = false, mittig = false): void => {
      if (!el || !text.trim()) return
      const st = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const px = (v: string): number => parseFloat(v) || 0
      // Innenfläche: ohne Rahmen und Innenabstand (Überthema-Kasten, Kurztext, Pillen)
      const links = r.left + px(st.borderLeftWidth) + px(st.paddingLeft)
      const oben = r.top + px(st.borderTopWidth) + px(st.paddingTop)
      const breite = r.width - px(st.borderLeftWidth) - px(st.borderRightWidth) - px(st.paddingLeft) - px(st.paddingRight)
      const hoehe = r.height - px(st.borderTopWidth) - px(st.borderBottomWidth) - px(st.paddingTop) - px(st.paddingBottom)
      const schrift = px(st.fontSize)
      const zeile = st.lineHeight === 'normal' ? schrift * 1.2 : px(st.lineHeight)
      const ausrichtung = st.textAlign === 'center' ? 'center' : st.textAlign === 'right' || st.textAlign === 'end' ? 'right' : 'left'
      out.push({
        art,
        text,
        rich,
        x: (links - s0.left) * mmJePx,
        y: (oben - s0.top) * mmJePx,
        breite: breite * mmJePx,
        hoehe: hoehe * mmJePx,
        pt: Math.round(schrift * ptJePx * 10) / 10,
        zeile: zeile * mmJePx,
        fett: Number(st.fontWeight) >= 600,
        farbe: sichtbareFarbe(el, seite),
        ausrichtung,
        versalien: st.textTransform === 'uppercase',
        sperrungPt: st.letterSpacing === 'normal' ? 0 : px(st.letterSpacing) * ptJePx,
        mittig
      })
    }
    const eins = (sel: string): HTMLElement | null => seite.querySelector<HTMLElement>(sel)
    miss(eins('.ws-cover-kicker-fach'), 'kicker-fach', eins('.ws-cover-kicker-fach')?.textContent ?? '')
    miss(eins('.ws-cover-kicker-thema'), 'kicker-thema', eins('.ws-cover-kicker-thema')?.textContent ?? '')
    miss(eins('.ws-cover-title'), 'titel', ws.meta.title || ws.meta.topic, true)
    miss(eins('.ws-cover-facts'), 'fakten', eins('.ws-cover-facts')?.textContent ?? '')
    miss(eins('.ws-cover-ueberthema'), 'ueberthema', eins('.ws-cover-ueberthema')?.textContent ?? '')
    miss(eins('.ws-cover-blurb'), 'kurztext', ws.meta.coverText ?? '', true)
    for (const b of seite.querySelectorAll<HTMLElement>('.ws-cover-badge')) miss(b, 'kennzeichen', b.textContent ?? '', false, true)
    return out
  } finally {
    wirt.remove()
  }
}
