// Macht aus den großen Programm-Illustrationen (z. B. 1024 × 1024 PNG aus der Bild-KI) die
// Kachelbilder der Startseite: src/renderer/src/assets/programme/<id>.webp
//
//   npx electron scripts/programmbilder.mjs <Quellordner>
//
// Im Quellordner liegen die gewählten Bilder als <id>.png, also vokabeltest.png,
// vokabelliste.png, arbeitsblatt.png, lernzielkontrolle.png, grammatiktest.png,
// klassenarbeit.png, rueckmeldung.png, elternbrief.png, tafelbild.png. Fehlende werden übersprungen – die Kachel zeigt dann weiter das
// Vektorsymbol (modules/registry.ts findet die Bilder von selbst).
//
// Tafelbilder (30.09.2026): ohne Schlüssel für die Bild-KI von Hand als SVG gezeichnet, im Stil der
// übrigen (Kachel mit Glanz und Dicke, Tafel mit Kreidebild, Ablage mit Kreide, Lineal):
// scripts/programmbilder/tafelbild.svg – als 1024-px-PNG in den Quellordner legen.
//
// Was passiert (Paket 9, 26.09.2026):
// - Einfarbiger Hintergrund um die Kachel wird durchsichtig (von den Rändern her gefüllt),
//   damit das Bild auch im Dunkelmodus nicht in einem hellen Kasten steht.
// - Zuschnitt auf das Motiv, quadratisch mit schmalem Rand.
// - Verkleinern in Stufen auf 320 px (scharf genug für die 96-px-Kachel auch bei 200 % Zoom).
// - Dazu <id>-96.webp für die Leiste und „Zuletzt bearbeitet“ (Paket 10a).
// - WebP mit Durchsichtigkeit, Qualität so gewählt, dass jedes Bild unter 150 KB bleibt –
//   die portable .exe soll dadurch nicht spürbar wachsen.
//
// Gezeichnet wird mit Electron selbst (Canvas im versteckten Fenster), ohne zusätzliche Abhängigkeit.
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const IDS = [
  'vokabeltest',
  'vokabelliste',
  'arbeitsblatt',
  'lernzielkontrolle',
  'grammatiktest',
  'klassenarbeit',
  'rueckmeldung',
  'elternbrief',
  'tafelbild',
  'onlinetest',
  'verwaltung',
  'unterrichtsreihe',
  'ergebnisse',
  'laufendereihen',
  'freigaben',
  'vokabeltraining',
  'grammatiktraining',
  'gruppe-unterricht',
  'gruppe-planung',
  'gruppe-pruefung',
  'gruppe-verwaltung',
  'spiel-memory',
  'spiel-zuordnen',
  'spiel-blitz',
  'spiel-satz',
  'spiel-wortraten',
  'spiel-kreuzwort',
  'spiel-fallend',
  'spiel-suchsel',
  'meineklassen'
]
const ZIEL = resolve('src/renderer/src/assets/programme')
const KANTE = 320
const KANTE_LEISTE = 96
const HOECHSTENS = 150 * 1024

// Läuft im Fenster: Bild → durchsichtiger Rand, Zuschnitt, Verkleinern → WebP-Daten-URL
const verarbeite = `async (quelle, kante, hoechstens) => {
  const img = new Image()
  img.src = quelle
  await img.decode()
  const b = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas'); c.width = b; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const bild = g.getImageData(0, 0, b, h)
  const p = bild.data

  // Hintergrund: Farbe der Ecken. Schon durchsichtig? Dann bleibt alles, wie es ist.
  const ecken = [0, b - 1, (h - 1) * b, h * b - 1]
  const durchsichtig = ecken.every((i) => p[i * 4 + 3] < 16)
  if (!durchsichtig) {
    const grund = [0, 1, 2].map((k) => ecken.reduce((s, i) => s + p[i * 4 + k], 0) / 4)
    const abstand = (i) => Math.hypot(p[i * 4] - grund[0], p[i * 4 + 1] - grund[1], p[i * 4 + 2] - grund[2])
    const TOLERANZ = 28
    // Von allen Rändern aus füllen: nur zusammenhängender Hintergrund wird durchsichtig,
    // helle Flächen IM Motiv (z. B. ein weißes Blatt) bleiben stehen
    const weg = new Uint8Array(b * h)
    const stapel = []
    for (let x = 0; x < b; x++) stapel.push(x, (h - 1) * b + x)
    for (let y = 0; y < h; y++) stapel.push(y * b, y * b + b - 1)
    while (stapel.length) {
      const i = stapel.pop()
      if (weg[i] || abstand(i) > TOLERANZ) continue
      weg[i] = 1
      const x = i % b, y = (i - x) / b
      if (x > 0) stapel.push(i - 1)
      if (x < b - 1) stapel.push(i + 1)
      if (y > 0) stapel.push(i - b)
      if (y < h - 1) stapel.push(i + b)
    }
    for (let i = 0; i < b * h; i++) {
      if (weg[i]) { p[i * 4 + 3] = 0; continue }
      // Kantenpixel neben dem Hintergrund weich auslaufen lassen (sonst heller Saum)
      const x = i % b
      const nachbar = (x > 0 && weg[i - 1]) || (x < b - 1 && weg[i + 1]) || (i >= b && weg[i - b]) || (i < (h - 1) * b && weg[i + b])
      if (nachbar) p[i * 4 + 3] = Math.round(p[i * 4 + 3] * Math.min(1, abstand(i) / (TOLERANZ * 3)))
    }
    g.putImageData(bild, 0, 0)
  }

  // Zuschnitt auf alles, was sichtbar ist
  let x0 = b, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < b; x++)
      if (p[(y * b + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) throw new Error('Bild ist leer')
  const seite = Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.04
  const mx = (x0 + x1 + 1) / 2, my = (y0 + y1 + 1) / 2

  // Verkleinern in Halbierungsschritten, der letzte Schritt genau auf die Kante
  let stufe = document.createElement('canvas')
  let groesse = Math.round(seite)
  stufe.width = stufe.height = groesse
  stufe.getContext('2d').drawImage(c, mx - seite / 2, my - seite / 2, seite, seite, 0, 0, groesse, groesse)
  while (groesse / 2 >= kante) {
    const n = document.createElement('canvas'); n.width = n.height = Math.round(groesse / 2)
    const ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'
    ng.drawImage(stufe, 0, 0, groesse, groesse, 0, 0, n.width, n.height)
    stufe = n; groesse = n.width
  }
  const fertig = document.createElement('canvas'); fertig.width = fertig.height = kante
  const fg = fertig.getContext('2d'); fg.imageSmoothingQuality = 'high'
  fg.drawImage(stufe, 0, 0, groesse, groesse, 0, 0, kante, kante)

  for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const url = fertig.toDataURL('image/webp', q)
    if ((url.length - 23) * 0.75 <= hoechstens) return url
  }
  return fertig.toDataURL('image/webp', 0.4)
}`

app.whenReady().then(async () => {
  const quellordner = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.mjs'))
  if (!quellordner) {
    console.error('Aufruf: npx electron scripts/programmbilder.mjs <Quellordner mit <id>.png>')
    app.exit(1)
    return
  }
  try {
    mkdirSync(ZIEL, { recursive: true })
    const fenster = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await fenster.loadURL('data:text/html,<!doctype html><title>programmbilder</title>')
    let anzahl = 0
    for (const id of IDS) {
      const datei = join(resolve(quellordner), `${id}.png`)
      if (!existsSync(datei)) {
        console.log(`– ${id}: keine Vorlage, bleibt beim Vektorsymbol`)
        continue
      }
      const quelle = `data:image/png;base64,${readFileSync(datei).toString('base64')}`
      const url = await fenster.webContents.executeJavaScript(`(${verarbeite})(${JSON.stringify(quelle)}, ${KANTE}, ${HOECHSTENS})`)
      const daten = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
      writeFileSync(join(ZIEL, `${id}.webp`), daten)
      console.log(`✓ ${id}.webp (${Math.round(daten.length / 1024)} KB)`)
      // Paket 10a: kleine Fassung für die Leiste (bis 40 px, bei 200 % Zoom 80 px) – in
      // Stufen verkleinert, damit sie schärfer ist, als der Browser sie aus 320 px rechnet
      const klein = await fenster.webContents.executeJavaScript(`(${verarbeite})(${JSON.stringify(quelle)}, ${KANTE_LEISTE}, ${HOECHSTENS})`)
      writeFileSync(join(ZIEL, `${id}-96.webp`), Buffer.from(klein.slice(klein.indexOf(',') + 1), 'base64'))
      anzahl++
    }
    console.log(`${anzahl} Kachelbild(er) in ${ZIEL}`)
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
