// HOCH- UND QUERFORMAT je Seite (06.10.2026) – Grundlage: Diagramm-Aufgaben aus diagramm.mjs (vorher: npm run build).
// Aufruf: node tests/e2e/diagramm.mjs <Ausgabeordner>
//
// Eine Zeitleisten-Aufgabe (Julikrise 1914 mit Eskalationsstufen) und eine Koordinaten-
// Aufgabe stehen im Editor als Zeichenfläche; in der Lösungsansicht liegt die Skizze der
// Musterlösung deckungsgleich darauf. Geprüft: Bild vorhanden, Maße in mm, Skizze im
// Lösungsteil, Baustein-Einstellungen bieten die Art der Zeichenfläche an.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { PDFDocument } from 'pdf-lib'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seitenformat')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-seitenformat-'))
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
  const leer = {
    kind: 'diagram',
    count: 0,
    heightMm: 0,
    gapText: '',
    left: [],
    right: [],
    pairs: [],
    options: [],
    correct: [],
    statements: [],
    items: [],
    displayOrder: [],
    headers: [],
    rows: [],
    solutionRows: [],
    labels: []
  }
  const vorbild = ws.sheets[0].blocks[0]
  const stars = vorbild?.stars ? { stars: vorbild.stars } : {}
  ws.sheets[0].blocks.push(
    {
      id: 'zeitleiste',
      type: 'task',
      instruction:
        'Entwickle eine Zeitleiste mit einem Eskalationsverlauf vom 28. Juli bis zum 4. August 1914. Trage die Ereignisse aus M1 so ein, dass Eskalation oder Deeskalation sichtbar wird.',
      operator: 'Entwickle',
      afbReason: '',
      socialForm: 'EA',
      answer: {
        ...leer,
        diagram: {
          kind: 'zeitleiste',
          heightMm: 70,
          axes: {
            xLabel: '',
            yLabel: '',
            y2Label: '',
            xMin: 0,
            xMax: 10,
            xStep: 1,
            yMin: 0,
            yMax: 10,
            yStep: 1,
            y2Min: 0,
            y2Max: 0,
            y2Step: 0,
            showNumbers: true,
            months: false
          },
          z: { label: '', min: 0, max: 6, step: 1 },
          xCategories: [],
          yLevels: [],
          timeline: {
            unit: 'day',
            from: '1914-07-28',
            to: '1914-08-04',
            step: 1,
            sections: [],
            yLabel: 'Eskalation',
            yLevels: ['Drohung', 'Ultimatum', 'Mobilmachung', 'Kriegserklärung'],
            strands: [],
            events: []
          }
        }
      },
      parts: [],
      solution:
        '- 28.7. Kriegserklärung Ö-U an Serbien\n- 30.7. russische Generalmobilmachung\n- 1.8. deutsche Kriegserklärung an Russland\n- 4.8. Kriegseintritt Großbritanniens',
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
          axes: {
            xLabel: 'x',
            yLabel: 'y',
            y2Label: '',
            xMin: -2,
            xMax: 6,
            xStep: 1,
            yMin: -1,
            yMax: 5,
            yStep: 1,
            y2Min: 0,
            y2Max: 0,
            y2Step: 0,
            showNumbers: true,
            months: false
          },
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
  // Zeitleiste und Graph je auf eine eigene Seite – so lässt sich „nur diese Seite" prüfen
  for (const b of ws.sheets[0].blocks) if (b.id === 'zeitleiste' || b.id === 'graph') b.pageBreakBefore = true
  // Zum Schluss eine Querseite der KI: kurzer Text links, Aufgabe rechts daneben
  ws.sheets[0].blocks.push(
    {
      id: 'kurz',
      type: 'text',
      title: 'Aus einem Tagebuch, 1914',
      body: 'Heute früh kam die Nachricht von der Mobilmachung. Auf dem Marktplatz standen die Menschen dicht gedrängt, manche jubelten, andere schwiegen. Mein Bruder muss morgen einrücken.',
      lineNumbers: false,
      source: 'fiktiver Tagebucheintrag',
      glossary: [],
      seitenFormat: 'quer',
      ...stars
    },
    {
      id: 'kurzA',
      type: 'task',
      instruction: 'Beschreibe die Stimmung, die der Tagebucheintrag schildert.',
      operator: 'Beschreibe',
      afbReason: '',
      socialForm: 'EA',
      answer: { ...leer, kind: 'lines', count: 6 },
      parts: [],
      solution: 'gemischt: Jubel und Schweigen',
      points: 0,
      minutes: 0,
      ...stars
    }
  )
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(2500)

const seiten = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ws-editor-pages .ws-page')].map((p) => ({
      quer: p.classList.contains('ws-page-quer'),
      b: Math.round(p.offsetWidth),
      h: Math.round(p.offsetHeight),
      zeitleiste: Boolean(p.querySelector('[data-fluss="zeitleiste"]')),
      knopf: Boolean(p.querySelector('[data-seitenformat-knopf]'))
    }))
  )
const vor = await seiten()
console.log('VORHER', JSON.stringify(vor))
pruefe(
  vor.length >= 4 && vor.slice(0, -1).every((s) => !s.quer) && vor.at(-1).quer,
  `Zunächst hoch, nur die Querseite der KI am Schluss quer (${vor.map((s) => (s.quer ? 'Q' : 'H')).join('')})`
)
const neben = await page.evaluate(() => {
  const t = document.querySelector('.ws-editor-pages [data-fluss="kurzA"] .ws-side-quer')
  const a = document.querySelector('.ws-editor-pages [data-fluss="kurzA"] .ws-task-instruction')
  if (!t || !a) return null
  const rt = t.getBoundingClientRect()
  const ra = a.getBoundingClientRect()
  return { textRechts: Math.round(rt.right), aufgabeLinks: Math.round(ra.left), textBreite: Math.round(rt.width), oben: Math.round(Math.abs(rt.top - ra.top)) }
})
console.log('NEBEN', JSON.stringify(neben))
await page.locator('.ws-editor-pages .ws-page').last().scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, '0-ki-quer.png') })
pruefe(
  Boolean(neben) && neben.textBreite > 300 && neben.aufgabeLinks >= neben.textRechts && neben.oben < 40,
  `Querseite: kurzer Text links, Aufgabe rechts daneben (${JSON.stringify(neben)})`
)
pruefe(vor.filter((s) => s.knopf).length >= 1, 'Symbol zum Umschalten am Seitenrand')
const iz = vor.findIndex((s) => s.zeitleiste)
pruefe(iz >= 0, `Zeitleiste steht auf Seite ${iz + 1}`)
const breiteVor = await page.evaluate(() => document.querySelector('[data-fluss="zeitleiste"] .ws-diagram')?.getBoundingClientRect().width ?? 0)
// Seite mit der Zeitleiste umschalten
await page.locator('.ws-editor-pages .ws-page').nth(iz).locator('[data-seitenformat-knopf]').click()
await page.waitForTimeout(2500)
const nach = await seiten()
console.log('NACHHER', JSON.stringify(nach))
const jz = nach.findIndex((s) => s.zeitleiste)
pruefe(jz >= 0 && nach[jz].quer && nach[jz].b > nach[jz].h, `Seite mit der Zeitleiste quer (${nach[jz]?.b}×${nach[jz]?.h})`)
pruefe(
  nach.length === vor.length && nach.filter((s) => s.quer).length === 2,
  `Nur diese Seite quer, die anderen bleiben hoch (${nach.map((s) => (s.quer ? 'Q' : 'H')).join('')})`
)
const breiteNach = await page.evaluate(() => document.querySelector('[data-fluss="zeitleiste"] .ws-diagram')?.getBoundingClientRect().width ?? 0)
pruefe(breiteNach > breiteVor * 1.25, `Zeitleiste nutzt die Querseite (${Math.round(breiteVor)} → ${Math.round(breiteNach)} px)`)
const anker = await page.evaluate(() =>
  window.__selftest
    .worksheetJetzt()
    .sheets[0].blocks.filter((b) => b.seitenFormat)
    .map((b) => [b.id, b.seitenFormat, b.seitenFormatFest])
)
console.log('ANKER', JSON.stringify(anker))
pruefe(
  anker.some((a) => a[1] === 'quer' && a[2]),
  'Format am Baustein verankert, als Wahl der Lehrkraft'
)
await page.locator('.ws-editor-pages .ws-page').nth(jz).scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, '1-quer.png') })
// PDF: die Querseite ist im PDF quer, die anderen bleiben hoch (benannte Seite @page quer)
const html = await page.evaluate(() => window.__selftest.druckHtmlJetzt())
const pfad = join(userData, 'druck.html')
writeFileSync(pfad, html, 'utf8')
const pdfB64 = await app.evaluate(async ({ BrowserWindow }, p) => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(p)
    await new Promise((r) => setTimeout(r, 800))
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    return pdf.toString('base64')
  } finally {
    win.destroy()
  }
}, pfad)
writeFileSync(join(out, '2-druck.pdf'), Buffer.from(pdfB64, 'base64'))
const pdf = await PDFDocument.load(Buffer.from(pdfB64, 'base64'))
const formate = pdf
  .getPages()
  .map((s) => (s.getWidth() > s.getHeight() ? 'Q' : 'H'))
  .join('')
pruefe((formate.match(/Q/g) ?? []).length >= 2 && formate.includes('H'), `PDF: Querseiten quer, übrige hoch (${formate})`)
pruefe(
  pdf.getPages().every((s) => Math.round(Math.max(s.getWidth(), s.getHeight())) === 842),
  'PDF: alle Seiten A4 (nichts verkleinert)'
)
// Word: ein Abschnitt im Querformat
const word = await page.evaluate(() => window.__selftest.wordXmlJetzt())
const quer = (word.dokument.match(/w:orient="landscape"/g) ?? []).length
pruefe(quer >= 2, `Word: Abschnitte im Querformat (${quer})`)
// Und zurück
await page.locator('.ws-editor-pages .ws-page').nth(jz).locator('[data-seitenformat-knopf]').click()
await page.waitForTimeout(2500)
const zurueck = await seiten()
pruefe(zurueck.filter((s) => s.quer).length === 1, 'Zurück ins Hochformat: wieder nur die Querseite der KI')

// ---------- Vokabeltest: eigene Seiten, derselbe Umschalter
await page.click('[aria-label="Vokabeltest"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.vtLatein())
await page.waitForTimeout(3000)
const vtSeiten = () =>
  page.evaluate(() => [...document.querySelectorAll('.editor-sheet .vt-page')].map((p) => (p.classList.contains('vt-page-quer') ? 'Q' : 'H')).join(''))
const vt0 = await vtSeiten()
pruefe(
  vt0.length >= 1 && !vt0.includes('Q') && (await page.locator('.editor-sheet .vt-page [data-seitenformat-knopf]').count()) >= 1,
  `Vokabeltest: Seiten hoch, Umschalter da (${vt0})`
)
await page.locator('.editor-sheet .vt-page').first().locator('[data-seitenformat-knopf]').click()
await page.waitForTimeout(2500)
const vt1 = await vtSeiten()
const vtBreite = await page.evaluate(() => document.querySelector('.editor-sheet .vt-page-quer')?.offsetWidth ?? 0)
pruefe(vt1.startsWith('Q') && vtBreite > 1100, `Vokabeltest: erste Seite quer (${vt1}, ${vtBreite} px)`)
await page.screenshot({ path: join(out, '3-vokabeltest-quer.png') })

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
