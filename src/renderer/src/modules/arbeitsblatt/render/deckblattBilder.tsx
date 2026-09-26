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
 * so lässt sie sich in Word sogar noch verschieben. Kopf, Kurztext und Merkmale liegen als
 * ein Bild der ganzen Seite dahinter.
 */
export interface DeckblattBilder {
  /** Ganze Seite ohne Vorschauen, PNG */
  hintergrund: string
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
  const hintergrund = await rastereHtml(renderToStaticMarkup(<CoverPage ws={ws} />), 210, 297)
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
  return { hintergrund, karten: aus }
}
