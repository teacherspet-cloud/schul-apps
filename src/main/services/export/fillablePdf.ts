/**
 * Arbeitsblätter als AUSFÜLLBARES PDF.
 *
 * Das gewöhnliche PDF entsteht über Electrons `printToPDF` und ist ein Bild des Blattes –
 * darin lässt sich nichts eintragen. Für ein ausfüllbares Blatt braucht es echte
 * Formularfelder (AcroForm). Die kann `printToPDF` nicht erzeugen, deshalb werden sie
 * NACHTRÄGLICH über pdf-lib an die richtigen Stellen gesetzt.
 *
 * DER KNIFFLIGE TEIL SIND DIE KOORDINATEN.
 *
 * Wo eine Schreiblinie oder ein Kästchen landet, entscheidet der Textfluss – das lässt sich
 * nicht ausrechnen, nur messen. Gemessen wird deshalb im selben unsichtbaren Fenster, das
 * anschließend das PDF druckt: erst die Stellen einsammeln, dann drucken. So können beide
 * nicht auseinanderlaufen.
 *
 * Die Umrechnung ist glücklicherweise exakt: Das Blatt ist in CSS 210 mm breit, das sind bei
 * 96 dpi 793,7 px; ein A4-PDF ist 595,28 pt breit. Das Verhältnis ist genau 0,75 (72/96).
 * Der Nullpunkt liegt im PDF unten links, im Fenster oben links – die y-Achse wird gespiegelt.
 *
 * SICHERHEIT: Zum Messen läuft Javascript im Druckfenster, was es sonst nicht tut. Das ist
 * vertretbar, weil das HTML aus `renderToStaticMarkup` stammt und React jeden Text escapt;
 * eingebettetes Fremd-HTML gibt es nicht. Das Fenster bleibt sandboxed, ohne Preload und
 * ohne Node-Zugriff.
 */
import { BrowserWindow } from 'electron'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { PDFDocument, rgb } from 'pdf-lib'
import { attachAudio, type AudioBox, type AudioFile } from './audioInPdf'

/** Ein ausfüllbares Feld, gemessen im Fenster (px, Ursprung oben links auf der Seite). */
export interface FieldBox {
  page: number
  kind: 'line' | 'check' | 'gap' | 'area' | 'box'
  x: number
  y: number
  w: number
  h: number
}

export interface PageSize {
  widthPx: number
  heightPx: number
}

/**
 * Das Messskript, das im Druckfenster läuft.
 *
 * Es liefert für jede Seite die Stellen, an denen etwas eingetragen wird. Die Auswahl deckt
 * beide Renderer ab: `ws-` gehört zum Arbeitsblatt (und damit auch zu Klassenarbeit und
 * Grammatiktest), `vt-` zum Vokabeltest.
 *
 * Leere Flächen unter einer bestimmten Größe werden übergangen – ein Feld, das kleiner ist
 * als ein Zeichen, wäre nur im Weg.
 *
 * AUSGENOMMEN ist das angekreuzte Kästchen an der Arbeitsanweisung (`ws-check-demo`): Es
 * zeigt, was zu tun ist, und ist selbst nichts zum Ankreuzen. Ein Feld darüber würde nicht
 * nur zum falschen Klick einladen, es verdeckte auch das gedruckte Kreuz.
 *
 * Ebenfalls ausgenommen sind die Kästchen im gelösten Beispiel (`ws-example`): Dort steht
 * die Antwort schon.
 */
export const MEASURE_SCRIPT = `(() => {
  const seiten = [...document.querySelectorAll('.ws-page, .vt-page')]
  const felder = []
  const sel = {
    line: '.ws-line, .vt-line, .ws-label-line',
    check: '.ws-check:not(.ws-check-demo), .vt-checkbox',
    gap: '.ws-gap, .vt-gap',
    area: '.ws-space, .ws-workspace, .vt-space',
    box: '.ws-box, .vt-box, .ws-tf-cell'
  }
  seiten.forEach((seite, i) => {
    const p = seite.getBoundingClientRect()
    for (const [kind, q] of Object.entries(sel)) {
      for (const el of seite.querySelectorAll(q)) {
        // Im gelösten Beispiel ist nichts auszufüllen – dort steht die Antwort bereits
        if (el.closest('.ws-example')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 6 || r.height < 4) continue
        felder.push({ page: i, kind, x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height })
      }
    }
  })
  // Hörtexte: Lage des Bausteins, damit der Abspieler im PDF dort landet
  const audios = []
  seiten.forEach((seite, i) => {
    const p = seite.getBoundingClientRect()
    for (const el of seite.querySelectorAll('.ws-audio[data-audio-id]')) {
      const r = el.getBoundingClientRect()
      audios.push({ id: el.getAttribute('data-audio-id'), page: i, x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height })
    }
  })
  const erste = seiten[0] ? seiten[0].getBoundingClientRect() : { width: 0, height: 0 }
  return { felder, audios, seite: { widthPx: erste.width, heightPx: erste.height }, seiten: seiten.length }
})()`

/** Lädt das HTML, misst Felder und Hörtexte und druckt daraus ein PDF. */
export async function measureAndPrint(html: string): Promise<{ pdf: Buffer; felder: FieldBox[]; audios: AudioBox[]; seite: PageSize }> {
  const dir = mkdtempSync(join(tmpdir(), 'schulapps-fill-'))
  const file = join(dir, 'druck.html')
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    // Javascript NUR zum Messen; kein Preload, kein Node, sandboxed (siehe Kopfkommentar)
    webPreferences: { javascript: true, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
  })
  try {
    await win.loadURL(pathToFileURL(file).toString())
    const gemessen = (await win.webContents.executeJavaScript(MEASURE_SCRIPT)) as {
      felder: FieldBox[]
      audios: AudioBox[]
      seite: PageSize
      seiten: number
    }
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    return { pdf, felder: gemessen.felder, audios: gemessen.audios ?? [], seite: gemessen.seite }
  } finally {
    win.destroy()
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Mindestgrößen in PDF-Punkten.
 *
 * Für Ankreuzfelder deutlich kleiner als für Textfelder: Ein Kästchen ist auf dem Blatt
 * 4,2 mm breit, das sind 11,9 pt. Mit einer gemeinsamen Untergrenze von 12 pt fielen genau
 * die Kästchen heraus, um die es geht – in der ersten Fassung blieben von fünf nur zwei
 * übrig. Ein Textfeld von 12 pt Breite wäre dagegen sinnlos, dort bleibt die Grenze.
 */
const MIN_BREITE = 24
const MIN_HOEHE = 8
const MIN_KAESTCHEN = 7

/**
 * Setzt die Formularfelder ins fertige PDF.
 *
 * Schreiblinien und Lücken werden Textfelder, Kästchen werden Ankreuzfelder, größere Flächen
 * werden mehrzeilige Textfelder. Die Felder bekommen KEINEN eigenen Rahmen und keinen
 * Hintergrund: Die Linie bzw. das Kästchen ist ja schon gedruckt: ein zweiter Rahmen
 * darüber sähe nach einem Fehler aus.
 */
export async function makeFillable(pdfBytes: Buffer, felder: FieldBox[], seite: PageSize): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes)
  const form = doc.getForm()
  const seiten = doc.getPages()
  if (!seite.widthPx || !seiten.length) return pdfBytes
  // 210 mm sind in CSS 793,7 px und im PDF 595,28 pt – das Verhältnis ist genau 72/96
  const scale = seiten[0].getWidth() / seite.widthPx
  let n = 0

  for (const f of felder) {
    const page = seiten[f.page]
    if (!page) continue
    const w = f.w * scale
    const h = f.h * scale
    const ankreuzen = f.kind === 'check' || f.kind === 'box'
    if (w < (ankreuzen ? MIN_KAESTCHEN : MIN_BREITE) || h < (ankreuzen ? MIN_KAESTCHEN : MIN_HOEHE)) continue
    // PDF zählt von unten, das Fenster von oben
    const x = f.x * scale
    /*
     * Auf die Seite begrenzen. Textfelder werden gleich um 1 pt angehoben, damit die
     * gedruckte Linie sichtbar bleibt – bei einem Feld ganz oben ragte es dadurch über den
     * Seitenrand hinaus. Ein Feld außerhalb der Seite ist in manchen Betrachtern gar nicht
     * erreichbar.
     */
    const y = Math.max(0, Math.min(page.getHeight() - h, page.getHeight() - f.y * scale - h))
    const name = `feld_${++n}`

    try {
      if (ankreuzen) {
        const cb = form.createCheckBox(name)
        cb.addToPage(page, { x, y, width: w, height: h, borderWidth: 0 })
      } else if (f.kind === 'area') {
        const tf = form.createTextField(name)
        tf.enableMultiline()
        tf.addToPage(page, { x: x + 2, y: y + 2, width: w - 4, height: h - 4, borderWidth: 0, backgroundColor: undefined })
        tf.setFontSize(11)
      } else {
        const tf = form.createTextField(name)
        // Die gedruckte Linie bleibt sichtbar; das Feld sitzt knapp darüber
        const hoehe = f.kind === 'line' ? Math.max(MIN_HOEHE, h) : h
        const oben = Math.min(y + 1, page.getHeight() - hoehe)
        tf.addToPage(page, { x, y: Math.max(0, oben), width: w, height: hoehe, borderWidth: 0, backgroundColor: undefined })
        tf.setFontSize(f.kind === 'gap' ? 10 : 11)
      }
    } catch {
      // Ein einzelnes Feld, das sich nicht anlegen lässt, darf den Export nicht verhindern
    }
  }

  /*
   * Aussehen der Felder beim Öffnen erzeugen. Ohne diesen Schritt zeigen manche Betrachter
   * (u. a. der eingebaute in Chrome und Edge) ein leeres Rechteck, bis man hineinklickt.
   */
  form.updateFieldAppearances()
  return Buffer.from(await doc.save())
}

/** Farbe für den Versuchsmodus: macht die Felder sichtbar, damit sich die Lage prüfen lässt. */
export const DEBUG_COLOR = rgb(0.9, 0.2, 0.2)

/** Erzeugt aus dem Druck-HTML ein PDF mit Formularfeldern. */
export async function htmlToFillablePdf(html: string): Promise<Buffer> {
  const { pdf, felder, seite } = await measureAndPrint(html)
  return makeFillable(pdf, felder, seite)
}

/**
 * Der gemeinsame Weg für beide Zusätze: Formularfelder und eingebettete Hörtexte.
 *
 * Gemessen wird NUR EINMAL – das Fenster zu öffnen und die Seite zu setzen ist der teure
 * Teil, und zwei getrennte Durchgänge könnten außerdem minimal auseinanderlaufen.
 */
export async function htmlToPdfWithExtras(html: string, opts: { fillable?: boolean; audio?: AudioFile[] }): Promise<Buffer> {
  const { pdf, felder, audios, seite } = await measureAndPrint(html)
  let bytes = opts.fillable ? await makeFillable(pdf, felder, seite) : pdf
  if (opts.audio?.length) bytes = (await attachAudio(bytes, opts.audio, audios, seite.widthPx)).pdf
  return bytes
}
