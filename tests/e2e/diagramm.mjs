// Wache für die DIAGRAMM-ANTWORTFORM (vorher: npm run build).
// Aufruf: node tests/e2e/diagramm.mjs <Ausgabeordner>
//
// Eine Zeitleisten-Aufgabe (Julikrise 1914 mit Eskalationsstufen) und eine Koordinaten-
// Aufgabe stehen im Editor als Zeichenfläche; in der Lösungsansicht liegt die Skizze der
// Musterlösung deckungsgleich darauf. Geprüft: Bild vorhanden, Maße in mm, Skizze im
// Lösungsteil, Baustein-Einstellungen bieten die Art der Zeichenfläche an.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/diagramm')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-diagramm-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1100)
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

await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const leer = { kind: 'diagram', count: 0, heightMm: 0, gapText: '', left: [], right: [], pairs: [], options: [], correct: [], statements: [], items: [], displayOrder: [], headers: [], rows: [], solutionRows: [], labels: [] }
  const vorbild = ws.sheets[0].blocks[0]
  const stars = vorbild?.stars ? { stars: vorbild.stars } : {}
  ws.sheets[0].blocks.push(
    {
      id: 'zeitleiste',
      type: 'task',
      instruction: 'Entwickle eine Zeitleiste mit einem Eskalationsverlauf vom 28. Juli bis zum 4. August 1914. Trage die Ereignisse aus M1 so ein, dass Eskalation oder Deeskalation sichtbar wird.',
      operator: 'Entwickle',
      afbReason: '',
      socialForm: 'EA',
      answer: {
        ...leer,
        diagram: {
          kind: 'zeitleiste',
          heightMm: 70,
          axes: { xLabel: '', yLabel: '', y2Label: '', xMin: 0, xMax: 10, xStep: 1, yMin: 0, yMax: 10, yStep: 1, y2Min: 0, y2Max: 0, y2Step: 0, showNumbers: true, months: false },
          z: { label: '', min: 0, max: 6, step: 1 },
          xCategories: [],
          yLevels: [],
          timeline: { unit: 'day', from: '1914-07-28', to: '1914-08-04', step: 1, sections: [], yLabel: 'Eskalation', yLevels: ['Drohung', 'Ultimatum', 'Mobilmachung', 'Kriegserklärung'], strands: [], events: [] }
        }
      },
      parts: [],
      solution: '- 28.7. Kriegserklärung Ö-U an Serbien\n- 30.7. russische Generalmobilmachung\n- 1.8. deutsche Kriegserklärung an Russland\n- 4.8. Kriegseintritt Großbritanniens',
      modelAnswer: 'Die Kurve steigt vom 28.7. (Kriegserklärung) über die russische Mobilmachung am 30.7. bis zu den Kriegserklärungen am 1.8. und 4.8.',
      modelSketch:
        '<svg viewBox="0 0 160 70" xmlns="http://www.w3.org/2000/svg"><polyline points="29,13 64,23 82,13 118,13 153,13" fill="none" stroke="#c62828" stroke-width="0.5"/><circle cx="29" cy="13" r="1.2" fill="#c62828"/><circle cx="64" cy="23" r="1.2" fill="#c62828"/><circle cx="118" cy="13" r="1.2" fill="#c62828"/><circle cx="153" cy="13" r="1.2" fill="#c62828"/></svg>',
      points: 0,
      minutes: 0,
      ...stars
    },
    {
      id: 'graph',
      type: 'task',
      instruction: 'Zeichne den Graphen der Funktion f(x) = 0,5x + 1 in das Koordinatensystem.',
      operator: 'Zeichne',
      afbReason: '',
      socialForm: 'EA',
      answer: {
        ...leer,
        diagram: {
          kind: 'koordinaten',
          heightMm: 70,
          axes: { xLabel: 'x', yLabel: 'y', y2Label: '', xMin: -2, xMax: 6, xStep: 1, yMin: -1, yMax: 5, yStep: 1, y2Min: 0, y2Max: 0, y2Step: 0, showNumbers: true, months: false },
          z: { label: '', min: 0, max: 6, step: 1 },
          xCategories: [],
          yLevels: [],
          timeline: { unit: 'year', from: '1900', to: '1950', step: 10, sections: [], yLabel: '', yLevels: [], strands: [], events: [] }
        }
      },
      parts: [],
      solution: '- Gerade durch (0|1) und (2|2)',
      points: 0,
      minutes: 0,
      ...stars
    }
  )
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(2500)

const schueler = await page.evaluate(() =>
  [...document.querySelectorAll('.ws-editor-pages .ws-diagram')].map((d) => {
    const img = d.querySelector('img')
    return { breite: img?.style.width, hoehe: img?.style.height, skizze: d.querySelectorAll('.ws-muster-skizze svg').length, src: (img?.getAttribute('src') ?? '').slice(0, 30) }
  })
)
console.log('Schülerblatt:', JSON.stringify(schueler))
pruefe(schueler.length === 2, `Beide Aufgaben zeigen eine Zeichenfläche (${schueler.length})`)
pruefe(schueler.every((s) => /mm$/.test(s.breite ?? '') && /mm$/.test(s.hoehe ?? '')), 'Die Flächen sind in Millimetern bemessen')
pruefe(schueler.every((s) => s.skizze === 0), 'Auf dem Schülerblatt liegt keine Skizze')
pruefe(schueler.every((s) => s.src.startsWith('data:image/svg+xml')), 'Die Fläche ist ein SVG-Bild')
const zeitleiste = await page.evaluate(() => decodeURIComponent(document.querySelector('.ws-editor-pages .ws-diagram img')?.getAttribute('src') ?? ''))
pruefe(zeitleiste.includes('28.7.') && zeitleiste.includes('Ultimatum') && zeitleiste.includes('Eskalation'), 'Die Zeitleiste trägt Datumsmarken, Stufen und Achsentitel')
await page.locator('.ws-editor-pages .editor-block:has(.ws-diagram)').first().screenshot({ path: join(out, 'zeitleiste-schueler.png') })

// Baustein-Einstellungen bieten die Zeichenfläche an
const aufgabe = page.locator('.ws-editor-pages .editor-block:has(.ws-diagram)').first()
await aufgabe.hover()
await page.waitForTimeout(300)
await aufgabe.locator('[aria-label="Baustein einstellen"]').first().click().catch(() => undefined)
await page.waitForTimeout(500)
const einstellungen = (await page.locator('.mantine-Popover-dropdown', { hasText: 'Antwortform' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
pruefe(einstellungen.includes('Art der Zeichenfläche') && einstellungen.includes('Stufen der y-Achse'), `Einstellungen zeigen Art der Zeichenfläche und Stufen (${einstellungen.slice(0, 80)}…)`)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Lösungsansicht: Skizze auf der Fläche, Text darunter
await page.locator('.app-toolbar label:has-text("Lösungen")').first().click()
await page.waitForTimeout(2500)
const loesung = await page.evaluate(() => {
  const m = document.querySelector('.ws-editor-pages .ws-diagram-muster')
  if (!m) return null
  const d = m.querySelector('.ws-diagram')
  const svg = m.querySelector('.ws-muster-skizze svg')
  const r1 = d?.getBoundingClientRect()
  const r2 = svg?.getBoundingClientRect()
  return { skizze: Boolean(svg), deckungsgleich: r1 && r2 ? Math.abs(r1.width - r2.width) < 2 && Math.abs(r1.height - r2.height) < 2 : false, text: m.querySelector('.ws-muster-text')?.textContent?.slice(0, 40) ?? '' }
})
console.log('Lösungsansicht:', JSON.stringify(loesung))
pruefe(Boolean(loesung?.skizze), 'In der Lösungsansicht liegt die Skizze auf der Zeitleiste')
pruefe(Boolean(loesung?.deckungsgleich), 'Skizze und Fläche sind deckungsgleich')
pruefe(Boolean(loesung?.text), 'Die Beschreibung der Musterlösung steht darunter')
await page.locator('.ws-editor-pages .editor-block:has(.ws-diagram-muster)').first().screenshot({ path: join(out, 'zeitleiste-loesung.png') })

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
