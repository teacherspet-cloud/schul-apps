// Wache: Seitenauswahl beim Drucken und Speichern (vorher: npm run build).
// Aufruf: node tests/e2e/seitenauswahl.mjs [Ausgabeordner]
//
// Wunsch der Lehrkraft (01.10.2026): „Wenn man von ursprünglich 9 Seiten nur Seite 1–4 und 6
// druckt, soll unten nicht Seite 1, 2 etc. von 9 stehen, sondern Seite 1 von 5."
//
// Geprüft an einem Arbeitsblatt mit 9 Seiten (ohne KI, aus den Stress-Bausteinen der Seitenrand-Wache):
//   1. Druckvorschau: Eingabe „1-4, 6", falsche Eingabe „2-12" wird gemeldet, Antippen eines
//      Seitenbildes, Schnellauswahl; der Druckauftrag (abgefangen) hat 5 Seiten mit „Seite 1 / 5" … „5 / 5".
//   2. PDF speichern mit „Nur bestimmte Seiten": Auswahl-Dialog, „1-4, 6" → PDF mit 5 Seiten,
//      Fußzeilen neu gezählt (Text aus dem PDF gelesen).
//   3. Word speichern mit Auswahl „1-2": kleiner als die ganze Datei, gültiges Dokument.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seitenauswahl')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-seitenwahl-'))
const ablage = mkdtempSync(join(tmpdir(), 'schulapps-seitenwahl-ablage-'))
const problems = []
const errors = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' },
  ...(process.env.SCHULAPPS_ELECTRON ? { executablePath: process.env.SCHULAPPS_ELECTRON } : {})
})
const page = await app.firstWindow()
page.on('pageerror', (e) => errors.push(e.message))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.setSize(1600, 1050)
  win?.center()
})
await warteAufOberflaeche(page)
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) })

/** Seiten des Druck-HTML (je Seite eine Marke) */
const druckSeiten = async () => {
  const html = await page.evaluate(() => window.__selftest.printHtml())
  return (html.match(/data-sa-seite="/g) ?? []).length
}
/** Warten, bis die Seitenaufteilung steht (dreimal dieselbe Seitenzahl) */
async function warteSeiten() {
  let vorher = -1
  let gleich = 0
  await page.waitForTimeout(1200)
  for (let i = 0; i < 40 && gleich < 3; i++) {
    await page.waitForTimeout(500)
    // Seiten in der Ansicht (wie die Seitenrand-Wache) – die Druckseiten folgen erst danach
    const n = await page.evaluate(() => [...document.querySelectorAll('.ws-page')].filter((x) => !x.closest('.ws-measure') && !x.parentElement.closest('.ws-page') && x.getBoundingClientRect().height > 0).length)
    gleich = n > 0 && n === vorher ? gleich + 1 : 0
    vorher = n
  }
  return vorher
}
/** Das Arbeitsblatt mit diesen Bausteinen setzen: ohne Deckblatt, Seitenzahl im Fuß */
const setzeBausteine = (bloecke) =>
  page.evaluate((b) => {
    const ws = structuredClone(window.__selftest.worksheetJetzt())
    ws.meta.coverPage = false
    ws.sheets = [{ ...ws.sheets[0], blocks: b }]
    const f = ws.design.footer
    f.show = true
    if (![f.left, f.center, f.right].includes('pageNumber')) f.right = 'pageNumber'
    window.__selftest.setWorksheet(ws)
  }, bloecke)

/** „Seite X / Y" je PDF-Seite */
const fusszeilen = async (bytes) => {
  const texte = await page.evaluate((d) => window.__selftest.pdfText(d), Array.from(bytes))
  return texte.map((t) => {
    const m = /Seite\s*(\d+)\s*\/\s*(\d+)/.exec(t.replace(/\s+/g, ' '))
    return m ? `${m[1]}/${m[2]}` : '–'
  })
}

try {
  // ---------- Ein Arbeitsblatt mit 9 Seiten
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsSeitenrand('gemischt', 11, 0))
  await page.waitForTimeout(1500)
  let bloecke = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks)
  const vorrat = []
  for (const [art, seed] of [
    ['gemischt', 23],
    ['gemischt', 37],
    ['knapp', 1],
    ['gemischt', 51],
    ['tabellen', 1]
  ])
    vorrat.push(...(await page.evaluate(([a, s]) => window.__selftest.seitenrandBlatt(a, s, 0, `${a}${s}-`).sheets[0].blocks, [art, seed])))
  await setzeBausteine(bloecke)
  let n = await warteSeiten()
  // Zu lang: hinten kürzen
  while (n > 9 && bloecke.length > 1) {
    bloecke = bloecke.slice(0, -1)
    await setzeBausteine(bloecke)
    n = await warteSeiten()
    if (process.env.SEITENWAHL_LOG) console.log(`   Gekürzt auf ${bloecke.length} Bausteine: ${n} Seiten`)
  }
  // Bausteine einzeln anhängen; einer, der über 9 Seiten hinausführt, bleibt weg
  for (const b of vorrat) {
    if (n >= 9) break
    const probe = [...bloecke, b]
    await setzeBausteine(probe)
    const m = await warteSeiten()
    if (process.env.SEITENWAHL_LOG) console.log(`   Probe mit ${probe.length} Bausteinen: ${m} Seiten`)
    if (m <= 9) {
      bloecke = probe
      n = m
    }
  }
  await setzeBausteine(bloecke)
  await page.waitForTimeout(2000)
  n = await warteSeiten()
  const imDruck = await druckSeiten()
  console.log(`Arbeitsblatt mit ${n} Seiten in der Ansicht, ${imDruck} im Druck (${bloecke.length} Bausteine)`)
  pruefe(imDruck === n, `Druck-HTML und Ansicht haben gleich viele Seiten (${imDruck}/${n})`)
  pruefe(n === 9, `Das Prüfblatt hat 9 Seiten (${n})`)
  const ziel = Math.min(5, n)
  const wahl = n >= 6 ? '1-4, 6' : '1-3'
  const anzahl = n >= 6 ? 5 : 3
  void ziel

  // Drucker und Druckauftrag abfangen: kein Papier, aber das HTML des Auftrags
  await app.evaluate(({ ipcMain }) => {
    globalThis.__drucke = []
    ipcMain.removeHandler('export:printers')
    ipcMain.handle('export:printers', async () => ({ ok: true, value: [{ name: 'Prüfdrucker', displayName: 'Prüfdrucker', isDefault: true }] }))
    ipcMain.removeHandler('export:print')
    ipcMain.handle('export:print', async (_e, html, opts) => {
      globalThis.__drucke.push({ html, opts })
      return { ok: true, value: undefined }
    })
  })

  // ---------- 1) Druckvorschau
  console.log('\nDruckvorschau')
  await page.getByRole('button', { name: 'Drucken', exact: true }).first().click()
  const druckDialog = page.locator('.mantine-Modal-content', { hasText: 'Weiter zur Druckvorschau' })
  await druckDialog.locator('input[type=radio][value="none"]').check()
  await druckDialog.getByRole('button', { name: 'Weiter zur Druckvorschau' }).click()
  await page.waitForSelector(`[data-print-page="${n}"]`, { timeout: 60000 })
  const angabe = page.locator('.pv-seite [data-seitenangabe]')
  pruefe((await angabe.inputValue()) === `1-${n}`, `Zu Beginn sind alle Seiten gewählt („${await angabe.inputValue()}")`)
  // Falsche Eingabe
  await angabe.fill(`2-${n + 3}`)
  await page.waitForTimeout(200)
  const fehler = await page.locator('.pv-seite .mantine-TextInput-error').innerText().catch(() => '')
  pruefe(new RegExp(`Seite ${n + 3} gibt es nicht`).test(fehler), `„2-${n + 3}" wird gemeldet („${fehler}")`)
  pruefe(await page.locator('.pv-drucken').isDisabled(), 'Mit falscher Angabe lässt sich nicht drucken')
  await shot('1-druckvorschau-fehler')
  // Gültige Auswahl
  await angabe.fill(wahl.replace('-', ' – '))
  await page.waitForTimeout(300)
  const unter = async (s) => page.locator(`[data-seite-unterschrift="${s}"]`).innerText()
  pruefe((await unter(5)).includes('wird nicht gedruckt'), `Seite 5 wird nicht gedruckt („${await unter(5)}")`)
  pruefe((await unter(6)).includes(`Seite ${anzahl} / ${anzahl}`), `Seite 6 wird als „Seite ${anzahl} / ${anzahl}" gedruckt („${await unter(6)}")`)
  pruefe((await unter(1)).includes(`Seite 1 / ${anzahl}`), `Seite 1 wird als „Seite 1 / ${anzahl}" gedruckt`)
  await page.locator('[data-print-page="6"]').scrollIntoViewIfNeeded()
  await shot('2-druckvorschau-auswahl')
  // Antippen: Seite 9 dazu, wieder weg
  await page.locator(`[data-print-page="${n}"]`).click()
  await page.waitForTimeout(200)
  pruefe((await angabe.inputValue()) === `${wahl}, ${n}`, `Antippen von Seite ${n} ergänzt das Feld („${await angabe.inputValue()}")`)
  await page.locator(`[data-print-page="${n}"]`).click()
  await page.waitForTimeout(200)
  // Schnellauswahl „Aktuelle Seite" und „Alle"
  pruefe((await page.locator('.pv-seite [data-schnellwahl="alle"]').count()) === 1, 'Schnellauswahl „Alle" ist da')
  pruefe((await page.locator('.pv-seite [data-schnellwahl="aktuell"]').count()) === 1, 'Schnellauswahl „Aktuelle Seite" ist da')
  pruefe((await angabe.inputValue()) === wahl, `Wieder „${wahl}"`)
  await page.locator('.pv-drucken').click()
  await page.waitForTimeout(1500)
  const drucke = await app.evaluate(() => globalThis.__drucke)
  pruefe(drucke.length === 1, `Ein Druckauftrag (${drucke.length})`)
  if (drucke[0]) {
    pruefe(!drucke[0].opts?.pages, 'Der Auftrag ist schon gekürzt – keine Seitenbereiche für den Drucker')
    const pdf = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), drucke[0].html)
    const zeilen = await fusszeilen(pdf)
    console.log('   Druckauftrag:', zeilen.join(' | '))
    pruefe(zeilen.length === anzahl, `Der Druckauftrag hat ${anzahl} Seiten (${zeilen.length})`)
    pruefe(
      zeilen.join(',') === Array.from({ length: anzahl }, (_, i) => `${i + 1}/${anzahl}`).join(','),
      `Fußzeilen „Seite 1 / ${anzahl}" … „${anzahl} / ${anzahl}" (${zeilen.join(', ')})`
    )
  }

  // ---------- 2) PDF mit Seitenauswahl
  console.log('\nPDF speichern')
  const pdfPfad = join(ablage, 'Auswahl.pdf')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, pdfPfad)
  await page.getByRole('button', { name: 'PDF', exact: true }).first().click()
  const pdfDialog = page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' })
  await pdfDialog.locator('input[type=radio][value="none"]').check()
  await pdfDialog.locator('[data-seitenwahl-schalter]').check()
  await shot('3-pdf-dialog-schalter')
  await pdfDialog.getByRole('button', { name: 'Speichern …' }).click()
  await page.waitForSelector(`[data-seitenwahl-dialog] [data-seitenbild="${n}"]`, { timeout: 60000 })
  await page.locator('[data-seitenwahl-dialog] [data-seitenangabe]').fill(wahl)
  await page.waitForTimeout(300)
  pruefe((await page.locator('[data-seitenwahl-dialog] [data-seitenbild="5"]').getAttribute('aria-pressed')) === 'false', 'Im Auswahl-Dialog ist Seite 5 abgewählt')
  await shot('4-pdf-seitenauswahl')
  await page.locator('[data-seitenwahl-ok]').click()
  await page.waitForSelector('text=PDF gespeichert', { timeout: 60000 })
  pruefe(existsSync(pdfPfad), 'Das PDF liegt am gewählten Ort')
  if (existsSync(pdfPfad)) {
    const bytes = readFileSync(pdfPfad)
    const seiten = (await PDFDocument.load(bytes)).getPageCount()
    const zeilen = await fusszeilen(bytes)
    console.log('   PDF:', zeilen.join(' | '))
    pruefe(seiten === anzahl, `Das PDF hat ${anzahl} Seiten (${seiten})`)
    pruefe(
      zeilen.join(',') === Array.from({ length: anzahl }, (_, i) => `${i + 1}/${anzahl}`).join(','),
      `PDF-Fußzeilen neu gezählt (${zeilen.join(', ')})`
    )
  }

  // ---------- 3) Word mit Seitenauswahl
  console.log('\nWord speichern')
  const wordText = async (p) => (await (await JSZip.loadAsync(readFileSync(p))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '')
  const ganzPfad = join(ablage, 'Ganz.docx')
  const teilPfad = join(ablage, 'Teil.docx')
  const wordSpeichern = async (pfad, auswahl) => {
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
    }, pfad)
    await page.getByRole('button', { name: 'Word', exact: true }).first().click()
    const d = page.locator('.mantine-Modal-content', { hasText: 'Als Word-Dokument speichern' })
    await d.locator('input[type=radio][value="none"]').check()
    if (auswahl) await d.locator('[data-seitenwahl-schalter]').check()
    await d.getByRole('button', { name: 'Speichern …' }).click()
    if (auswahl) {
      await page.waitForSelector('[data-seitenwahl-dialog] [data-seitenbild="1"]', { timeout: 60000 })
      await page.locator('[data-seitenwahl-dialog] [data-seitenangabe]').fill(auswahl)
      await page.waitForTimeout(300)
      await shot('5-word-seitenauswahl')
      await page.locator('[data-seitenwahl-ok]').click()
    }
    await page.waitForSelector('text=Word-Dokument gespeichert', { timeout: 60000 })
    await page.waitForTimeout(800)
  }
  await wordSpeichern(ganzPfad, null)
  await wordSpeichern(teilPfad, '1-2')
  if (existsSync(ganzPfad) && existsSync(teilPfad)) {
    const ganz = await wordText(ganzPfad)
    const teil = await wordText(teilPfad)
    console.log(`   Word: ganz ${ganz.length} Zeichen, Seiten 1-2: ${teil.length} Zeichen`)
    pruefe(teil.length > 50 && teil.length < ganz.length * 0.6, `Word mit Seiten 1-2 enthält deutlich weniger (${teil.length} von ${ganz.length} Zeichen)`)
  } else pruefe(false, 'Beide Word-Dateien wurden gespeichert')
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await shot('fehler').catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
  rmSync(ablage, { recursive: true, force: true, maxRetries: 5 })
}

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler im Fenster: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log(`\nSeitenauswahl in Ordnung. Bilder in ${out}`)
