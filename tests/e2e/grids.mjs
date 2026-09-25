// Sichtprüfung der Gitternetze (vorher: npm run build). Aufruf: node tests/e2e/grids.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/gitternetze')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
// Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-grids-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)

const grids = await page.evaluate(() => window.__selftest.grids(170))
writeFileSync(
  join(out, 'gitternetze.json'),
  JSON.stringify(
    grids.map((g) => ({ kind: g.kind, heightMm: g.heightMm })),
    null,
    2
  )
)

// Alle vier Raster untereinander auf einer weißen Seite in echter Millimetergröße
await page.setContent(
  `<html><head><meta charset="utf-8"><style>body{background:#fff;margin:0;padding:8mm;font:12px Arial}h3{margin:6mm 0 2mm}</style></head><body>${grids
    .map((g) => `<h3>${g.kind} (${Math.round(g.heightMm)} mm hoch)</h3>${g.svg}`)
    .join('')}</body></html>`
)
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'gitternetze.png'), fullPage: true })
console.log('Gitternetze:', grids.map((g) => `${g.kind} ${Math.round(g.heightMm)} mm`).join(', '))
await app.close()
