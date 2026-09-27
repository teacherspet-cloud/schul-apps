// Wache für MASKOTTCHEN (vorher: npm run build).
// Aufruf: node tests/e2e/maskottchen.mjs <Ausgabeordner>
//
// Zwei Figuren liegen im Prüfprofil (Kopien aus dem Profil der Lehrkraft, falls vorhanden,
// sonst ein Platzhalter-PNG). Geprüft: Einstellungskarte zeigt die Figuren und die
// Klassengrenze; ein Blatt der Klasse 5 bekommt nach „Figuren neu setzen" Figuren am Kopf,
// am Merkkasten und am Schluss; das Lösungsblatt bleibt frei davon; der Dialog heftet eine
// Figur mit Sprechblase an; Klasse 9 bekommt von selbst keine.
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/maskottchen-wache')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-maskottchen-'))

// Figuren ins Prüfprofil legen (alte flache Form – die App überführt sie in Ordner)
const quelle = join(process.env.APPDATA ?? '', 'schul-apps', 'maskottchen')
const ziel = join(userData, 'maskottchen')
mkdirSync(ziel, { recursive: true })
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
for (const [id, name] of [
  ['professor-pengu', 'Professor Pengu'],
  ['fiona-fuchs', 'Forscherin Fiona Fuchs']
]) {
  const ordner = join(quelle, id)
  if (existsSync(join(ordner, 'vorlage.png'))) {
    mkdirSync(join(ziel, id), { recursive: true })
    for (const f of ['figur.json', 'vorlage.png', 'winkend.png']) if (existsSync(join(ordner, f))) copyFileSync(join(ordner, f), join(ziel, id, f))
  } else if (existsSync(join(quelle, `${id}.png`))) {
    copyFileSync(join(quelle, `${id}.png`), join(ziel, `${id}.png`))
    copyFileSync(join(quelle, `${id}.json`), join(ziel, `${id}.json`))
  } else {
    writeFileSync(join(ziel, `${id}.png`), PNG_1PX)
    writeFileSync(join(ziel, `${id}.json`), JSON.stringify({ name, beschreibung: 'Platzhalter', pose: 'winkend', quelle: 'ki', erstellt: '2026-09-26T00:00:00.000Z' }))
  }
}

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

// ---------- Einstellungen
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(800)
await page.getByRole('tab', { name: /Material/ }).click().catch(() => undefined)
await page.waitForTimeout(600)
const figuren = await page.locator('[data-maskottchen]').count()
pruefe(figuren === 2, `Die Einstellungskarte zeigt beide Figuren (${figuren})`)
const karte = page.locator('text=Maskottchen und Illustrationen').first()
pruefe((await karte.count()) === 1, 'Karte „Maskottchen und Illustrationen" ist da')
pruefe((await page.getByLabel('Illustrationen bis Klasse').count()) === 1, 'Klassengrenze ist einstellbar')
await page.locator('[data-maskottchen]').first().scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, 'einstellungen.png') })

// Pose antippen: groß zeigen, erst dort „neu zeichnen" (27.09.2026) – nichts wird ungefragt gezeichnet
await page.locator('[data-maskottchen]').first().getByLabel('Pose winkend').click()
await page.waitForTimeout(500)
const posenFenster = page.locator('[data-posen-ansicht="winkend"]')
pruefe((await posenFenster.count()) === 1, 'Ein Druck auf die Pose öffnet die große Ansicht')
pruefe((await posenFenster.getByRole('button', { name: /Pose (neu )?zeichnen lassen/ }).count()) === 1, 'Erst dort gibt es „zeichnen lassen"')
await posenFenster.getByLabel('Nächste Pose').click()
await page.waitForTimeout(300)
pruefe((await page.locator('[data-posen-ansicht="zeigend"]').count()) === 1, 'Blättern zur nächsten Pose')
pruefe((await page.locator('[data-auftrag]').count()) === 0, 'Ohne Bestätigung läuft kein Zeichenauftrag')
await page.screenshot({ path: join(out, 'pose-gross.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
pruefe((await page.locator('[data-posen-ansicht]').count()) === 0, 'Escape schließt die Ansicht')
// Der Kasten „Neue Figur" folgt dem Thema (kein fester Grauton)
const neueFigur = page.locator('.mantine-Card-root', { hasText: 'Neue Figur' }).last()
const hintergrund = await neueFigur.evaluate((el) => getComputedStyle(el).backgroundColor)
pruefe(hintergrund !== 'rgb(255, 255, 255)', `„Neue Figur" hat einen getönten Grund (${hintergrund})`)

// ---------- Arbeitsblatt Klasse 5
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(2))
await page.waitForTimeout(2000)
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  ws.meta.grade = 5
  ws.sheets[0].blocks.push(
    { id: 'merke', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Ein Bruch besteht aus Zähler und Nenner.' },
    { id: 'check', type: 'selfCheck', title: 'Das kann ich', statements: ['Ich kann Brüche lesen.'], format: 'smileys' }
  )
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(2000)
const optionen = page.getByRole('button', { name: 'Blattoptionen' })
await optionen.click()
await page.waitForTimeout(500)
const schalter = page.getByLabel('Illustrationen (Maskottchen)')
pruefe((await schalter.count()) === 1, 'Blattoptionen bieten „Illustrationen (Maskottchen)"')
pruefe(await schalter.isChecked(), 'Für Klasse 5 sind sie vorgesehen (Schalter an)')
await page.getByRole('button', { name: 'Figuren neu setzen' }).click()
await page.waitForTimeout(1500)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const gesetzt = await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  return ws.sheets[0].blocks.map((b) => `${b.type}:${b.illustration?.pose ?? '-'}${b.illustration?.bubble ? '+blase' : ''}`)
})
console.log('Gesetzt:', gesetzt.join(' | '))
pruefe(gesetzt[0].includes('winkend+blase'), 'Der erste Baustein begrüßt winkend mit Sprechblase')
pruefe(gesetzt.some((g) => g.startsWith('infoBox:zeigend')), 'Der Merkkasten zeigt (zeigend)')
pruefe(gesetzt[gesetzt.length - 1].includes('jubelnd'), 'Die Selbsteinschätzung jubelt')
const bilder = await page.evaluate(() => [...document.querySelectorAll('.ws-editor-pages .ws-illu')].map((i) => ({ w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, src: i.getAttribute('src')?.slice(0, 15) })))
pruefe(bilder.length >= 3 && bilder.every((b) => b.h > 20 && b.src?.startsWith('data:image/png')), `Die Figuren sind als Bilder auf dem Blatt (${bilder.length})`)
const blasen = await page.locator('.ws-editor-pages .ws-illu-bubble').count()
pruefe(blasen >= 1, `Sprechblasen sind sichtbar (${blasen})`)
await page.locator('.ws-editor-pages .ws-page').first().screenshot({ path: join(out, 'blatt-klasse5.png') })

// Lösungsblatt ohne Figuren
await page.locator('.app-toolbar label:has-text("Lösungen")').first().click()
await page.waitForTimeout(2000)
pruefe((await page.locator('.ws-editor-pages .ws-illu').count()) === 0, 'Das Lösungsblatt bleibt ohne Figuren')
await page.locator('.app-toolbar label:has-text("Arbeitsblatt")').first().click()
await page.waitForTimeout(1500)

// Dialog: Figur an einen Baustein heften
const merke = page.locator('.ws-editor-pages .editor-block:has(.ws-info)').first()
await merke.hover()
await page.waitForTimeout(300)
await merke.locator('[aria-label="Weitere Aktionen"]').first().click()
await page.waitForTimeout(400)
await page.getByRole('menuitem', { name: /Maskottchen (anheften|ändern)/ }).click()
await page.waitForTimeout(500)
const dialog = page.locator('.mantine-Modal-content', { hasText: 'Maskottchen an diesem Baustein' })
pruefe((await dialog.count()) === 1, 'Der Dialog „Maskottchen an diesem Baustein" öffnet sich')
await dialog.getByLabel('Sprechblase (optional)').fill('Zähler oben, Nenner unten.')
await dialog.getByRole('button', { name: 'Übernehmen' }).click()
await page.waitForTimeout(1200)
const merkeBlase = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'merke')?.illustration)
pruefe(merkeBlase?.bubble === 'Zähler oben, Nenner unten.', `Die Sprechblase steht am Merkkasten (${JSON.stringify(merkeBlase)})`)
await page.locator('.ws-editor-pages .editor-block:has(.ws-info)').first().screenshot({ path: join(out, 'merkkasten.png') })

// Klasse 9: keine Figuren von selbst
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  ws.meta.grade = 9
  delete ws.meta.illustrationen
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(1000)
await optionen.click()
await page.waitForTimeout(500)
pruefe(!(await page.getByLabel('Illustrationen (Maskottchen)').isChecked()), 'Für Klasse 9 sind Illustrationen nicht vorgesehen (Schalter aus)')
await page.keyboard.press('Escape')

// ---------- Vokabeltest: Kopf- und Schlussfigur (27.09.2026)
await page.click('[aria-label="Vokabeltest"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.vtMitHinweis('Probe'))
await page.waitForTimeout(1500)
pruefe((await page.locator('.vt-illu').count()) === 0, 'Vokabeltest Klasse 8: keine Figur von selbst')
await page.evaluate(() => window.__selftest.vtJahrgang(5))
await page.waitForTimeout(1500)
const vtKopf = await page.locator('.vt-page .vt-illu-kopf').count()
const vtSchluss = await page.locator('.vt-page .vt-illu-schluss').count()
pruefe(vtKopf >= 1 && vtSchluss >= 1, `Vokabeltest Klasse 5: winkend im Kopf (${vtKopf}) und jubelnd am Schluss (${vtSchluss})`)
const vtBild = await page.locator('.vt-page .vt-illu-kopf').first().evaluate((i) => ({ h: i.getBoundingClientRect().height, src: i.getAttribute('src')?.slice(0, 15) }))
pruefe(vtBild.h > 20 && vtBild.src?.startsWith('data:image/png'), `Die Kopffigur ist ein Bild (${JSON.stringify(vtBild)})`)
await page.locator('.vt-page:visible').first().screenshot({ path: join(out, 'vokabeltest-klasse5.png'), timeout: 5000 }).catch(() => page.screenshot({ path: join(out, 'vokabeltest-klasse5.png') }))
// Die Schlussfigur sitzt im unteren Seitenrand – in der Ansicht liegt dort die feste Fußleiste, deshalb eigens hinscrollen
const schluss = page.locator('.vt-page:visible .vt-illu-schluss').first()
await schluss.scrollIntoViewIfNeeded().catch(() => undefined)
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'vokabeltest-schluss.png') })

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
