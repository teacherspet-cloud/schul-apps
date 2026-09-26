// Wache für BILDBESCHRIFTUNGEN ohne Überdeckung (vorher: npm run build).
// Aufruf: node tests/e2e/bildbeschriftung.mjs <Ausgabeordner> [Arbeitsblatt-JSON]
//
// Befund der Lehrkraft (26.09.2026): Im PDF „Strahlung aus Atomkernen" lagen bei M1 Teile der
// Beschriftung unter anderen Schildern. Geprüft wird am gebauten Programm: Kein Schild
// überschneidet ein anderes, keines ragt aus seiner Spalte, jede Linie beginnt am Punkt.
// Ohne Datei wird ein Bild mit den Beschriftungen von M1 nachgestellt.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/bildbeschriftung')
mkdirSync(out, { recursive: true })
const datei = process.argv[3]
const userData = mkdtempSync(join(tmpdir(), 'schulapps-labels-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(2))
await page.waitForTimeout(2000)

const M1 = [
  { id: 'a', text: 'Strahlungsquelle', x: 9, y: 50 },
  { id: 'b', text: 'Alphastrahlung', x: 30, y: 22 },
  { id: 'c', text: 'Betastrahlung', x: 46, y: 50 },
  { id: 'd', text: 'Gammastrahlung', x: 68, y: 78 },
  { id: 'e', text: 'Papier', x: 35, y: 14 },
  { id: 'f', text: 'Aluminium', x: 58, y: 42 },
  { id: 'g', text: 'Blei', x: 80, y: 70 }
]

if (datei && existsSync(datei)) {
  // Das echte Blatt der Lehrkraft
  const json = JSON.parse(readFileSync(datei, 'utf8'))
  const ws = json.worksheet ?? json.payload ?? json
  await page.evaluate((w) => window.__selftest.setWorksheet(structuredClone(w)), ws)
  console.log(`Blatt geladen: ${ws.meta?.title ?? '?'}`)
} else {
  // Nachgestellt: ein 4:3-Bild (weiß) mit den sieben Schildern von M1
  await page.evaluate((labels) => {
    const ws = window.__selftest.worksheetJetzt()
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 600
    const g = c.getContext('2d')
    g.fillStyle = '#f2f2f2'
    g.fillRect(0, 0, 800, 600)
    g.strokeStyle = '#888'
    g.strokeRect(20, 20, 760, 560)
    ws.sheets[0].blocks.splice(1, 0, {
      id: 'm1-bild',
      type: 'image',
      role: 'material',
      description: 'Durchdringungsvermögen von Strahlung',
      caption: 'Durchdringungsvermögen von Strahlung',
      widthPercent: 60,
      image: { dataUrl: c.toDataURL('image/png'), source: 'own', credit: 'Prüfstand' },
      labels
    })
    window.__selftest.setWorksheet(structuredClone(ws))
  }, M1)
}
await page.waitForTimeout(2500)

const befund = await page.evaluate(() => {
  const ergebnis = []
  for (const fig of document.querySelectorAll('.ws-editor-pages .ws-image')) {
    const boxen = [...fig.querySelectorAll('.ws-imglabel-box')].map((b) => ({ text: b.innerText.trim(), r: b.getBoundingClientRect(), col: b.parentElement }))
    if (!boxen.length) continue
    const area = fig.querySelector('.ws-imglabel-area').getBoundingClientRect()
    const ueber = []
    for (let i = 0; i < boxen.length; i++)
      for (let j = i + 1; j < boxen.length; j++) {
        const a = boxen[i].r
        const b = boxen[j].r
        const schnitt = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
        if (schnitt) ueber.push(`${boxen[i].text} × ${boxen[j].text}`)
      }
    const ausserhalb = boxen.filter((b) => b.r.top < area.top - 2 || b.r.bottom > area.bottom + 2).map((b) => b.text)
    const linien = fig.querySelectorAll('.ws-imglabel-lines polyline').length
    ergebnis.push({ schilder: boxen.length, ueber, ausserhalb, linien })
  }
  return ergebnis
})
console.log('Befund:', JSON.stringify(befund))
pruefe(befund.length > 0, 'Es gibt ein Bild mit Beschriftungen')
for (const b of befund) {
  pruefe(b.ueber.length === 0, `Kein Schild überdeckt ein anderes${b.ueber.length ? ` (${b.ueber.join('; ')})` : ''}`)
  pruefe(b.ausserhalb.length === 0, `Kein Schild ragt über das Bild hinaus${b.ausserhalb.length ? ` (${b.ausserhalb.join(', ')})` : ''}`)
  pruefe(b.linien === b.schilder, `Jedes Schild hat seine Linie (${b.linien} von ${b.schilder})`)
}

const fig = page.locator('.ws-editor-pages .ws-image:has(.ws-imglabel-box)').first()
await fig.screenshot({ path: join(out, 'bildbeschriftung.png') })

// Dieselbe Setzung im Druck-HTML (PDF): keine Messung im Browser nötig
const druck = await page.evaluate(() => window.__selftest.printHtmlNow?.() ?? null)
if (druck) {
  const tops = [...druck.matchAll(/ws-imglabel-box" style="top:([\d.]+)%"/g)].map((m) => Number(m[1]))
  pruefe(tops.length > 0 && new Set(tops.map((t) => t.toFixed(1))).size === tops.length, `Im Druck-HTML stehen alle Schilder auf verschiedenen Höhen (${tops.length})`)
}

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
