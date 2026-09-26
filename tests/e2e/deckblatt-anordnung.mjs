// Wache für das DECKBLATT aus Paket 11 – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/deckblatt-anordnung.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (26.09.2026): Die Seitenvorschauen starten aus einem Layout (Fächer,
// Stapel, Treppe, Raster, Pinnwand) und lassen sich danach frei ziehen, drehen, vergrößern und
// nach vorn/hinten legen; eine Geste ist EIN Rückgängig-Schritt. Seiten lassen sich austauschen,
// das Maskottchen abwählen, und Druck/Word geben die Anordnung wieder. Geprüft wird der Weg der
// Lehrkraft mit Maus und Tastatur:
//  1. Karte ziehen, dann am Griff drehen → Strg+Z nimmt zuerst die Drehung, dann den Zug zurück;
//  2. Layoutwechsel legt neu (Raster: keine Drehung, eigene Lage verworfen);
//  3. „Austauschen …" ersetzt die Seite einer Karte an derselben Stelle;
//  4. Maskottchen „Keins" entfernt das Bild;
//  5. Druck-HTML ohne Griffe, PDF mit Inhalt; Word-Raster liefert Hintergrund und Karten.
// Bilder (gedruckte Seite 1): paket11-layout-*.png, paket11-pinnwand.png, paket11-kopf-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche, blattoptionen } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/deckblatt-anordnung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-deckblatt11-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.setSize(1600, 1100)
  })
  await warteAufOberflaeche(page)

  const DECKBLATT = '.ws-editor-pages .ws-cover'
  const karten = () =>
    page.$$eval(`${DECKBLATT} .ws-cover-thumb`, (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return {
          seite: e.dataset.seite,
          drehung: Number(e.dataset.drehung),
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          links: e.style.left,
          oben: e.style.top
        }
      })
    )
  const meta = () =>
    page.evaluate(() => {
      const m = window.__selftest.worksheetJetzt().meta
      return { anordnung: m.coverArrangement ?? null, seiten: m.coverPages ?? null, layout: m.coverLayout ?? 'faecher', maskottchen: m.coverMascot ?? 'fuchs' }
    })
  const waehle = async (feld, option) => {
    await page.locator('.deckblatt-werkzeuge').getByLabel(feld, { exact: true }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.waitForTimeout(700)
  }
  /*
   * Bild der ganzen Deckblattseite – so, wie sie GEDRUCKT wird: Druck-HTML → PDF → Seite 1 als
   * Bild. Die Seite ist höher als das Fenster; ein Bildschirmfoto zeigte nur ihren oberen Teil.
   * Zugleich sieht man so, dass der Druck die Anordnung genau wiedergibt.
   */
  const foto = async (name) => {
    const html = await page.evaluate(() => window.__selftest.printHtml())
    const bytes = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), html)
    const png = await page.evaluate(async (d) => {
      const [jpg] = await window.__selftest.renderPdf(d)
      const bild = new Image()
      await new Promise((ok) => ((bild.onload = ok), (bild.src = jpg)))
      const c = document.createElement('canvas')
      c.width = bild.naturalWidth
      c.height = bild.naturalHeight
      c.getContext('2d').drawImage(bild, 0, 0)
      return c.toDataURL('image/png')
    }, bytes)
    writeFileSync(join(out, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'))
  }

  // ---- Blatt mit mehreren Seiten, Deckblatt an ----
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(30))
  await page.waitForTimeout(2500)
  await blattoptionen(page)
  await page.locator('label', { hasText: 'Deckblatt' }).first().click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2000)
  pruefe((await page.locator('.deckblatt-werkzeuge').count()) === 1, 'Werkzeugleiste des Deckblatts steht über der Seite')
  const start = await karten()
  pruefe(start.length >= 4 && start.length <= 6, `automatisch vier bis sechs Seiten (${start.length})`)
  pruefe((await page.locator(`${DECKBLATT} .ws-cover-griff`).count()) === 0, 'ohne Auswahl keine Griffe')

  // ---- 1) Ziehen, Drehen, Strg+Z ----
  console.log('\nZiehen und Drehen')
  const k0 = start[0]
  await page.locator(DECKBLATT).first().scrollIntoViewIfNeeded()
  const vorZug = (await karten())[0]
  await page.mouse.move(vorZug.x, vorZug.y)
  await page.mouse.down()
  await page.mouse.move(vorZug.x + 40, vorZug.y - 20, { steps: 4 })
  await page.mouse.move(vorZug.x + 90, vorZug.y - 45, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const nachZug = (await karten()).find((k) => k.seite === k0.seite)
  const m1 = await meta()
  pruefe(
    Math.abs(nachZug.x - vorZug.x - 90) < 6 && Math.abs(nachZug.y - vorZug.y + 45) < 6,
    `Karte folgt der Maus (${Math.round(nachZug.x - vorZug.x)}, ${Math.round(nachZug.y - vorZug.y)} px)`
  )
  pruefe(Array.isArray(m1.anordnung) && m1.anordnung.length === start.length, 'Lage im Blatt gespeichert (coverArrangement)')

  const griff = page.locator(`${DECKBLATT} .ws-cover-thumb-aktiv .ws-cover-griff-drehen`)
  pruefe((await griff.count()) === 1, 'die gezogene Karte ist gewählt und zeigt den Drehgriff')
  const g = await griff.boundingBox()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + 60, g.y + 10, { steps: 5 })
  await page.mouse.move(g.x + 120, g.y + 30, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const gedreht = (await karten()).find((k) => k.seite === k0.seite)
  pruefe(Math.abs(gedreht.drehung - nachZug.drehung) > 10, `am Griff gedreht (${nachZug.drehung}° → ${gedreht.drehung}°)`)

  const groesse = page.locator(`${DECKBLATT} .ws-cover-thumb-aktiv .ws-cover-griff-groesse`)
  pruefe((await groesse.count()) === 1, 'Eckgriff zum Vergrößern ist da')

  await page.locator('.deckblatt-werkzeuge').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const undo1 = (await karten()).find((k) => k.seite === k0.seite)
  pruefe(Math.abs(undo1.drehung - nachZug.drehung) < 0.2, `Strg+Z nimmt die ganze Drehung in einem Schritt zurück (${undo1.drehung}°)`)
  pruefe(Math.abs(undo1.x - nachZug.x) < 3, '… und lässt den Zug stehen')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const undo2 = (await karten()).find((k) => k.seite === k0.seite)
  // Verglichen wird die Lage auf der Seite (mm), nicht am Bildschirm – der Bereich kann dazwischen rollen
  pruefe(undo2.links === vorZug.links && undo2.oben === vorZug.oben, `zweites Strg+Z nimmt den ganzen Zug zurück (${undo2.links} / ${vorZug.links})`)
  pruefe((await meta()).anordnung === null, '… und damit die eigene Anordnung')

  // ---- 2) Layouts ----
  console.log('\nLayouts')
  // Erst ziehen, damit der Wechsel etwas zu verwerfen hat
  const v = (await karten())[1]
  await page.mouse.move(v.x, v.y)
  await page.mouse.down()
  await page.mouse.move(v.x - 60, v.y + 20, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  for (const [wert, name] of [
    ['raster', 'Raster'],
    ['stapel', 'Stapel'],
    ['treppe', 'Treppe'],
    ['pinnwand', 'Pinnwand'],
    ['faecher', 'Fächer']
  ]) {
    await waehle('Anordnung', name)
    const m = await meta()
    const ks = await karten()
    pruefe(m.layout === wert && m.anordnung === null, `Layout „${name}": gewechselt, eigene Lage verworfen`)
    if (wert === 'raster')
      pruefe(
        ks.every((k) => k.drehung === 0),
        'Raster: keine Drehung'
      )
    if (wert === 'pinnwand') {
      pruefe((await page.locator(`${DECKBLATT} .ws-cover-rahmen-polaroid`).count()) === 1, 'Pinnwand: Polaroid-Rahmen')
      pruefe(
        (await page.locator(`${DECKBLATT} .ws-cover-klebe, ${DECKBLATT} .ws-cover-pin`).count()) === ks.length,
        'Pinnwand: jede Karte mit Klebestreifen oder Pin'
      )
      await foto('paket11-pinnwand')
    }
    await foto(`paket11-layout-${wert}`)
  }

  // ---- Kopf-Layouts ----
  for (const [wert, name] of [
    ['seite', 'Seitliches Band'],
    ['zentriert', 'Zentriert'],
    ['titelbild', 'Großes Titelbild'],
    ['band', 'Farbband oben']
  ]) {
    await waehle('Kopf', name)
    const cls = await page.locator(DECKBLATT).first().getAttribute('class')
    pruefe(cls.includes(`ws-cover-kopf-${wert}`), `Kopf „${name}"`)
    // Die Karten liegen weiter auf der Seite
    const lage = await page.evaluate((sel) => {
      const s = document.querySelector(sel).getBoundingClientRect()
      return [...document.querySelectorAll(`${sel} .ws-cover-thumb`)].every((k) => {
        const r = k.getBoundingClientRect()
        return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1
      })
    }, DECKBLATT)
    pruefe(lage, `… alle Karten auf der Seite`)
    await foto(`paket11-kopf-${wert}`)
  }

  // ---- 3) Austauschen ----
  console.log('\nAustauschen')
  const vorTausch = (await karten())[1]
  await page.mouse.click(vorTausch.x, vorTausch.y)
  await page.waitForTimeout(300)
  await page.locator(`${DECKBLATT} .ws-cover-griffe`).getByRole('button', { name: 'Austauschen …' }).click()
  await page.waitForTimeout(800)
  const kandidat = page.locator('.deckblatt-kandidat:not([disabled])').first()
  const neu = await kandidat.getAttribute('data-kandidat')
  await kandidat.click()
  await page.waitForTimeout(700)
  const nachTausch = await karten()
  const getauscht = nachTausch.find((k) => k.seite === neu)
  pruefe(Boolean(getauscht) && !nachTausch.some((k) => k.seite === vorTausch.seite), `Seite ausgetauscht (${vorTausch.seite} → ${neu})`)
  pruefe(getauscht && getauscht.links === vorTausch.links && getauscht.oben === vorTausch.oben, '… an derselben Stelle')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  pruefe(
    (await karten()).some((k) => k.seite === vorTausch.seite),
    'Strg+Z holt die alte Seite zurück'
  )

  // ---- 4) Maskottchen „Keins" ----
  console.log('\nMaskottchen')
  pruefe((await page.locator(`${DECKBLATT} .ws-cover-fox`).count()) === 1, 'Fuchs ist da')
  await waehle('Maskottchen', 'Fachsymbol')
  pruefe((await page.locator(`${DECKBLATT} .ws-cover-fox img`).count()) === 1, 'Fachsymbol statt Fuchs')
  await waehle('Maskottchen', 'Keins')
  pruefe(
    (await page.locator(`${DECKBLATT} .ws-cover-fox`).count()) === 0 && (await meta()).maskottchen === 'keins',
    'Maskottchen „Keins": kein Bild auf dem Deckblatt'
  )
  await foto('paket11-ohne-maskottchen')
  await waehle('Maskottchen', 'Fuchs')

  // ---- 5) Druck, PDF, Word ----
  console.log('\nDruck, PDF, Word')
  // Eine Karte gedreht lassen, damit die Ausgabe eine eigene Lage zeigt
  const k = (await karten())[0]
  await page.mouse.move(k.x, k.y)
  await page.mouse.down()
  await page.mouse.move(k.x + 30, k.y + 10, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const html = await page.evaluate(() => window.__selftest.printHtml())
  // Nur der Inhalt zählt – die Stile im Kopf nennen die Griffe natürlich
  const koerper = html.slice(html.indexOf('<body>'))
  pruefe(koerper.includes('ws-cover-thumb') && !koerper.includes('ws-cover-griff') && !koerper.includes('role="button"'), 'Druck: Karten ohne Griffe')
  const eigene = (await meta()).anordnung[0]
  pruefe(html.includes(`rotate(${eigene.drehung}deg)`) || eigene.drehung === 0, 'Druck: Drehung wie im Editor')
  const bytes = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), html)
  writeFileSync(join(out, 'paket11-deckblatt.pdf'), Buffer.from(bytes))
  const flaeche = await page.evaluate(async (d) => window.__selftest.pdfFlaeche(d), bytes)
  pruefe(flaeche[0] && flaeche[0].unten > 80, `PDF: Deckblatt bis unten bedruckt (${flaeche[0]?.unten} %)`)
  const word = await page.evaluate(() => window.__selftest.deckblattWord(true))
  word.bilder.forEach((b, i) => b && writeFileSync(join(out, `paket11-word-${i ? 'karte' : 'hintergrund'}.png`), Buffer.from(b.split(',')[1], 'base64')))
  pruefe(word.hintergrund > 5000, `Word: Hintergrund gerastert (${word.hintergrund} Zeichen)`)
  pruefe(
    word.karten.length === (await karten()).length && word.karten.every((x) => x.laenge > 3000),
    `Word: jede Karte als eigenes Bild (${word.karten.map((x) => x.laenge).join(', ')})`
  )
  /*
   * Die Kopftexte stehen in Word als ECHTER Text über dem Hintergrund (Nachbesserung zu
   * Paket 11) – gemessen im Deckblatt: der Titel oben im Kopf, groß und fett gesetzt.
   */
  const titel = word.texte.find((t) => t.art === 'titel')
  pruefe(
    Boolean(titel) && titel.y > 5 && titel.y < 120 && titel.pt > 16,
    `Word: Titel als echter Text gemessen (${titel ? `${titel.x.toFixed(1)}/${titel.y.toFixed(1)} mm, ${titel.pt} pt, #${titel.farbe}` : 'fehlt'})`
  )
  pruefe(
    word.texte.some((t) => t.art === 'fakten') && word.texte.some((t) => t.art === 'kennzeichen'),
    `Word: Fakten-Zeile und Kennzeichen als Text (${word.texte.map((t) => t.art).join(', ')})`
  )
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nDeckblatt (Paket 11): alles in Ordnung. Bilder in ${out}`)
