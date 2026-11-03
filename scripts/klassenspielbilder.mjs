// Szenenbilder der Klassenspiele (03.11.2026, Wunsch der Lehrkraft): aus den Entwürfen der Bild-KI
// (scripts/programmbild-ki.mjs, ids „klassenspiel-<spiel>") werden die Kopfbilder der Spielkarten im Startfenster:
// src/renderer/src/assets/klassenspiele/<spiel>.webp – mittig auf 16:9 zugeschnitten, 640 × 360 Punkte,
// WebP unter 70 KB (die portable .exe soll nicht spürbar wachsen).
//
//   npx electron scripts/klassenspielbilder.mjs <Quellordner>
//
// Im Quellordner liegen die gewählten Bilder als <spiel>.png (expedition.png, boss.png …). Fehlende werden übersprungen –
// die Karte zeigt dann kein Bild.
import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const SPIELE = ['expedition', 'boss', 'rennen', 'puzzle', 'rekord', 'gebiet', 'turnier', 'wette']
const ZIEL = resolve('src/renderer/src/assets/klassenspiele')
const B = 640
const H = 360
const HOECHSTENS = 70 * 1024

// Läuft im versteckten Fenster: zuschneiden (mittig, 16:9), stufenweise verkleinern, WebP mit passender Qualität
async function verarbeite(quelle, b, h, max) {
  const bild = new Image()
  bild.src = quelle
  await bild.decode()
  const ziel = b / h
  let sw = bild.width
  let sh = Math.round(sw / ziel)
  if (sh > bild.height) {
    sh = bild.height
    sw = Math.round(sh * ziel)
  }
  const sx = Math.round((bild.width - sw) / 2)
  const sy = Math.round((bild.height - sh) / 2)
  let c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  c.getContext('2d').drawImage(bild, sx, sy, sw, sh, 0, 0, sw, sh)
  while (c.width / 2 >= b) {
    const k = document.createElement('canvas')
    k.width = Math.round(c.width / 2)
    k.height = Math.round(c.height / 2)
    const g = k.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(c, 0, 0, k.width, k.height)
    c = k
  }
  const fertig = document.createElement('canvas')
  fertig.width = b
  fertig.height = h
  const g = fertig.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(c, 0, 0, b, h)
  for (const q of [0.82, 0.75, 0.68, 0.6, 0.5]) {
    const url = fertig.toDataURL('image/webp', q)
    if ((url.length * 3) / 4 <= max) return url
  }
  return fertig.toDataURL('image/webp', 0.4)
}

app.whenReady().then(async () => {
  const quelle = resolve(process.argv.find((a, i) => i >= 2 && !a.startsWith('-') && existsSync(a)) ?? '')
  mkdirSync(ZIEL, { recursive: true })
  const fenster = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await fenster.loadURL('data:text/html,<!doctype html><title>klassenspielbilder</title>')
  for (const id of SPIELE) {
    const datei = join(quelle, `${id}.png`)
    if (!existsSync(datei)) {
      console.log(`– ${id}: kein Bild`)
      continue
    }
    const url = `data:image/png;base64,${readFileSync(datei).toString('base64')}`
    const aus = await fenster.webContents.executeJavaScript(`(${verarbeite})(${JSON.stringify(url)}, ${B}, ${H}, ${HOECHSTENS})`)
    const daten = Buffer.from(aus.slice(aus.indexOf(',') + 1), 'base64')
    writeFileSync(join(ZIEL, `${id}.webp`), daten)
    console.log(`✓ ${id}.webp (${Math.round(daten.length / 1024)} KB)`)
  }
  app.quit()
})
