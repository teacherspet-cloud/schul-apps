// Erzeugt das Startbild der portablen .exe (build/splash.bmp) und das Programmsymbol für
// Windows (build/icon.ico) aus dem App-Symbol build/icon.png.
//
// Anlass (Paket 9, 26.09.2026): Das Startbild zeigte noch das alte grüne Symbol, obwohl das
// App-Symbol längst das dunkelblaue Klemmbrett ist. Damit das nicht wieder auseinanderläuft,
// entsteht beides reproduzierbar aus icon.png – nach einem neuen Symbol genügt:
//
//   npx electron scripts/splash.mjs [Vorschau.png]
//
// Gezeichnet wird mit Electron selbst (verstecktes Fenster, Chromium-Schrift und -Kantenglättung),
// also ohne zusätzliche Bild-Abhängigkeit. Das Format des Startbilds ist das, was NSIS
// (electron-builder, portable.splashImage) sicher lädt: BMP, 24 Bit, unkomprimiert, 460 × 260.
import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const BREITE = 460
const HOEHE = 260
// Lage der abgerundeten Kachel in icon.png (Anteil der Kantenlänge, am 512er-Bild ausgemessen)
const RAND = 7 / 512
const RADIUS = 90 / 512
const vorschau = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.png'))

// Farben aus dem Symbol abgeleitet: tiefes Blau des Rahmens, kühles Hellblau als Grund
const html = (symbol) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${BREITE}px; height: ${HOEHE}px; overflow: hidden; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(135deg, #f5f8fd 0%, #e7eef9 100%);
    box-sizing: border-box; border: 1px solid #c9d6ea;
    display: flex; align-items: center; gap: 26px; padding: 0 30px 0 34px;
  }
  .symbol { width: 128px; height: 128px; flex: none; filter: drop-shadow(0 6px 10px rgba(20, 45, 90, 0.25)); }
  /* icon.png hat dunkle, undurchsichtige Ecken um die abgerundete Kachel – hier weggeschnitten */
  .symbol img { width: 128px; height: 128px; display: block; clip-path: inset(${RAND * 128}px round ${RADIUS * 128}px); }
  h1 { margin: 0; font-size: 34px; font-weight: 700; color: #173a6e; letter-spacing: -0.3px; }
  .start { margin-top: 12px; font-size: 16px; color: #2c3f5c; }
  .geduld { margin-top: 18px; font-size: 11.5px; color: #6b7a90; }
</style></head><body>
  <div class="symbol"><img src="${symbol}"></div>
  <div><h1>Schul-Apps</h1><div class="start">wird gestartet …</div><div class="geduld">Beim ersten Start einen Moment Geduld</div></div>
</body></html>`

/** BGRA-Pixel (oben beginnend, wie Chromium sie liefert) → BMP 24 Bit, Zeilen von unten */
function alsBmp(bgra, breite, hoehe) {
  const zeile = Math.ceil((breite * 3) / 4) * 4
  const daten = zeile * hoehe
  const b = Buffer.alloc(54 + daten)
  b.write('BM', 0, 'ascii')
  b.writeUInt32LE(54 + daten, 2)
  b.writeUInt32LE(54, 10)
  b.writeUInt32LE(40, 14)
  b.writeInt32LE(breite, 18)
  b.writeInt32LE(hoehe, 22)
  b.writeUInt16LE(1, 26)
  b.writeUInt16LE(24, 28)
  b.writeUInt32LE(0, 30)
  b.writeUInt32LE(daten, 34)
  b.writeInt32LE(2835, 38)
  b.writeInt32LE(2835, 42)
  for (let y = 0; y < hoehe; y++) {
    const ziel = 54 + (hoehe - 1 - y) * zeile
    for (let x = 0; x < breite; x++) {
      const q = (y * breite + x) * 4
      b[ziel + x * 3] = bgra[q]
      b[ziel + x * 3 + 1] = bgra[q + 1]
      b[ziel + x * 3 + 2] = bgra[q + 2]
    }
  }
  return b
}

/**
 * ICO mit mehreren Größen (PNG-Einträge, ab Windows Vista üblich). Ohne die kleinen Größen
 * rechnet Windows das 256er-Bild für Taskleiste und Titelzeile selbst herunter – unscharf.
 */
function alsIco(pngs) {
  const kopf = Buffer.alloc(6 + pngs.length * 16)
  kopf.writeUInt16LE(0, 0)
  kopf.writeUInt16LE(1, 2)
  kopf.writeUInt16LE(pngs.length, 4)
  let versatz = kopf.length
  pngs.forEach(({ groesse, png }, i) => {
    const e = 6 + i * 16
    kopf[e] = groesse >= 256 ? 0 : groesse
    kopf[e + 1] = groesse >= 256 ? 0 : groesse
    kopf.writeUInt16LE(1, e + 4)
    kopf.writeUInt16LE(32, e + 6)
    kopf.writeUInt32LE(png.length, e + 8)
    kopf.writeUInt32LE(versatz, e + 12)
    versatz += png.length
  })
  return Buffer.concat([kopf, ...pngs.map((p) => p.png)])
}

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  try {
    const iconPfad = resolve('build/icon.png')
    const symbol = `data:image/png;base64,${readFileSync(iconPfad).toString('base64')}`

    const fenster = new BrowserWindow({ width: BREITE, height: HOEHE, show: false, useContentSize: true, frame: false, webPreferences: { offscreen: true } })
    await fenster.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html(symbol))}`)
    await fenster.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 100)))')
    let bild = await fenster.webContents.capturePage({ x: 0, y: 0, width: BREITE, height: HOEHE })
    const { width, height } = bild.getSize()
    if (width !== BREITE || height !== HOEHE) bild = bild.resize({ width: BREITE, height: HOEHE, quality: 'best' })
    writeFileSync(resolve('build/splash.bmp'), alsBmp(bild.toBitmap(), BREITE, HOEHE))
    if (vorschau) writeFileSync(resolve(vorschau), bild.toPNG())

    // Symbolgrößen im selben Fenster zeichnen: Ecken durchsichtig, schrittweise verkleinert (schärfer als ein Sprung)
    const groessen = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    const urls = await fenster.webContents.executeJavaScript(`(async () => {
      const img = document.querySelector('.symbol img')
      const RAND = ${RAND}, RADIUS = ${RADIUS}
      const stufe = (quelle, von, nach) => {
        const c = document.createElement('canvas'); c.width = c.height = nach
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
        g.drawImage(quelle, 0, 0, von, von, 0, 0, nach, nach); return c
      }
      return ${JSON.stringify(groessen)}.map((z) => {
        let quelle = img, von = img.naturalWidth
        while (von / 2 >= z * 1.5) { quelle = stufe(quelle, von, Math.round(von / 2)); von = Math.round(von / 2) }
        const c = document.createElement('canvas'); c.width = c.height = z
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
        g.beginPath(); g.roundRect(z * RAND, z * RAND, z * (1 - 2 * RAND), z * (1 - 2 * RAND), z * RADIUS); g.clip()
        g.drawImage(quelle, 0, 0, von, von, 0, 0, z, z)
        return c.toDataURL('image/png')
      })
    })()`)
    const pngs = groessen.map((groesse, i) => ({ groesse, png: nativeImage.createFromDataURL(urls[i]).toPNG() }))
    if (vorschau) writeFileSync(resolve(vorschau.replace(/\.png$/i, '-symbol32.png')), pngs[3].png)
    writeFileSync(resolve('build/icon.ico'), alsIco(pngs))
    console.log('build/splash.bmp und build/icon.ico geschrieben')
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
