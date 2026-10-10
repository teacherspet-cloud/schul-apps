// Wache: PDF-Vorschau ohne Speichern (10.10.2026, vorher: npx electron-vite build).
// Aufruf: node tests/e2e/pdf-vorschau.mjs [Ausgabeordner]
//
// Wunsch der Lehrkraft: Neben „PDF"/„Speichern" ein Knopf „Vorschau", der dasselbe PDF zeigt, das
// gespeichert würde – ohne es abzulegen. Erst „PDF speichern" im Fenster speichert, wie gewohnt.
//
// Geprüft am Arbeitsblatt (ohne KI, Prüfblatt der Selbsttests):
//   1. Exe: Vorschau → Fenster mit PDF (Rahmen mit blob:-PDF oder Seitenbilder), KEIN Speichern-Dialog,
//      keine Datei; Schließen; noch einmal Vorschau → „PDF speichern" → Speichern-Dialog, gültiges PDF.
//   2. Browser (Edge über den Netzzugang, wie ein PC-Browser): Vorschau ohne Download, „PDF speichern"
//      lädt herunter.
//   3. Browser als iPad (Safari-Kennung, Berührung): Vorschau als Seitenbilder (pdf.js), ohne Download.
import { _electron as electron, chromium } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import { leisteApp, warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/pdf-vorschau')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vorschau-'))
const ablage = mkdtempSync(join(tmpdir(), 'schulapps-vorschau-ablage-'))
const problems = []
const errors = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}
const da = (l, ms = 60000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' },
  ...(process.env.SCHULAPPS_ELECTRON ? { executablePath: process.env.SCHULAPPS_ELECTRON } : {})
})
const page = await app.firstWindow()
page.on('pageerror', (e) => errors.push(e.message))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.setSize(1500, 1000)
  win?.center()
})
await warteAufOberflaeche(page)

/** Arbeitsblatt öffnen und das Prüfblatt laden (keine KI) */
async function blattLaden(p) {
  // Die Gruppen der Leiste sind zu Beginn zugeklappt (warten.mjs)
  await p.locator('.app-leiste').waitFor({ timeout: 30000 })
  await (await leisteApp(p, 'Arbeitsblatt')).first().click()
  await p.waitForTimeout(900)
  await p.evaluate(() => window.__selftest.wsGeteilteAufgabe(0))
  await p.waitForTimeout(1200)
  // Gibt es schon gespeicherte Blätter, zeigt die App zuerst die Bibliothek – zurück zum geladenen Blatt
  const zurueck = p.getByRole('button', { name: /^Zurück zu/ })
  if (await zurueck.isVisible().catch(() => false)) await zurueck.click()
  await p
    .getByRole('button', { name: 'PDF', exact: true })
    .first()
    .waitFor({ timeout: 30000 })
    .catch(async (e) => {
      await p.screenshot({ path: join(out, `fehler-blatt-${Date.now()}.png`) })
      throw e
    })
  await p.waitForTimeout(1500)
}

/** PDF-Dialog öffnen, „Vorschau" – liefert das Vorschaufenster */
async function vorschauOeffnen(p) {
  await p.getByRole('button', { name: 'PDF', exact: true }).first().click()
  const dlg = p.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' })
  await dlg.waitFor({ timeout: 10000 })
  // Eine Datei (ohne eigene Lösungsdatei) – sonst fragt die Exe nach einem Ordner
  await dlg.locator('input[type=radio][value="none"]').check()
  await dlg.locator('[data-pdf-vorschau-knopf]').click()
  const fenster = p.locator('.mantine-Modal-content', { hasText: 'Vorschau – noch nicht gespeichert' })
  await fenster.waitFor({ timeout: 60000 })
  return fenster
}

/** Was zeigt das Fenster? Rahmen mit blob:-PDF oder Seitenbilder */
async function inhalt(fenster) {
  const rahmen = fenster.locator('iframe[data-pdf-vorschau-rahmen]')
  const bild = fenster.locator('img[data-pdf-vorschau-seite="1"]')
  await Promise.race([rahmen.waitFor({ timeout: 60000 }), bild.waitFor({ timeout: 60000 })]).catch(() => undefined)
  if (await rahmen.count()) {
    const src = (await rahmen.getAttribute('src')) ?? ''
    // Ist hinter der blob:-Adresse wirklich ein PDF?
    const kopf = await fenster.page().evaluate(async (u) => {
      const b = await (await fetch(u)).blob()
      return { typ: b.type, anfang: new TextDecoder().decode(new Uint8Array(await b.slice(0, 5).arrayBuffer())) }
    }, src)
    return { art: 'rahmen', ok: src.startsWith('blob:') && kopf.typ === 'application/pdf' && kopf.anfang === '%PDF-', info: `${src.slice(0, 20)}… ${kopf.typ} ${kopf.anfang}` }
  }
  if (await bild.count()) {
    const seiten = await fenster.locator('img[data-pdf-vorschau-seite]').count()
    const breite = await bild.evaluate((i) => i.naturalWidth)
    return { art: 'seiten', ok: seiten > 0 && breite > 100, info: `${seiten} Seitenbild(er), ${breite} px breit` }
  }
  return { art: 'nichts', ok: false, info: 'weder Rahmen noch Seitenbilder' }
}

let browser
try {
  // ---------- 1) Exe
  console.log('\nExe')
  await blattLaden(page)
  const pdfPfad = join(ablage, 'Vorschau-Test.pdf')
  await app.evaluate(({ dialog }, p) => {
    globalThis.__speicherDialoge = 0
    dialog.showSaveDialog = async () => {
      globalThis.__speicherDialoge++
      return { canceled: false, filePath: p }
    }
  }, pdfPfad)
  let fenster = await vorschauOeffnen(page)
  const exe = await inhalt(fenster)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(out, '1-exe-vorschau.png') })
  pruefe(exe.ok, `Exe: Vorschau zeigt das PDF (${exe.art}: ${exe.info})`)
  pruefe((await app.evaluate(() => globalThis.__speicherDialoge)) === 0, 'Exe: kein Speichern-Dialog bei der Vorschau')
  pruefe(!existsSync(pdfPfad), 'Exe: keine Datei angelegt')
  await fenster.locator('[data-pdf-vorschau-schliessen]').click()
  await page.waitForTimeout(500)
  pruefe((await page.locator('.mantine-Modal-content', { hasText: 'Vorschau – noch nicht gespeichert' }).count()) === 0, 'Exe: Schließen schließt das Fenster')
  pruefe(await page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' }).isVisible(), 'Exe: der Ausgabe-Dialog bleibt nach dem Schließen offen')
  await page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' }).locator('[data-pdf-vorschau-knopf]').click()
  fenster = page.locator('.mantine-Modal-content', { hasText: 'Vorschau – noch nicht gespeichert' })
  await fenster.waitFor({ timeout: 60000 })
  await fenster.locator('[data-pdf-vorschau-speichern]').click()
  pruefe(await da(page.locator('text=PDF gespeichert')), 'Exe: „PDF speichern" meldet „PDF gespeichert"')
  pruefe((await app.evaluate(() => globalThis.__speicherDialoge)) === 1, 'Exe: genau ein Speichern-Dialog')
  if (existsSync(pdfPfad)) {
    const n = (await PDFDocument.load(readFileSync(pdfPfad))).getPageCount()
    pruefe(n > 0, `Exe: gültiges PDF gespeichert (${n} Seiten)`)
  } else pruefe(false, 'Exe: PDF liegt am gewählten Ort')
  await page.waitForTimeout(500)
  pruefe((await page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' }).count()) === 0, 'Exe: nach dem Speichern ist der Ausgabe-Dialog zu')

  // ---------- 2) Browser über den Netzzugang
  console.log('\nBrowser (Edge)')
  const status = await page.evaluate(() => window.api.lan.start())
  const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
  const basis = `http://127.0.0.1:${status.port}`
  const { token } = await (await fetch(`${basis}/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })).json()
  browser = await chromium.launch({ channel: 'msedge' })

  async function imBrowser(name, ctxOpts) {
    const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts })
    await ctx.addInitScript((t) => localStorage.setItem('schulapps-netz-token', t), token)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    const downloads = []
    p.on('download', (d) => downloads.push(d))
    await p.goto(`${basis}/?selftest`)
    await p.waitForTimeout(3000)
    await p.screenshot({ path: join(out, `0-${name}-start.png`) })
    await blattLaden(p)
    return { ctx, p, downloads }
  }

  const pc = await imBrowser('PC', { viewport: { width: 1400, height: 950 } })
  fenster = await vorschauOeffnen(pc.p)
  const b = await inhalt(fenster)
  await pc.p.waitForTimeout(4000)
  await pc.p.screenshot({ path: join(out, '2-browser-vorschau.png') })
  pruefe(b.ok, `Browser: Vorschau zeigt das PDF (${b.art}: ${b.info})`)
  await pc.p.waitForTimeout(800)
  pruefe(pc.downloads.length === 0, `Browser: kein Download bei der Vorschau (${pc.downloads.length})`)
  const neueSeiten = pc.ctx.pages().length
  pruefe(neueSeiten === 1, `Browser: kein neuer Tab (${neueSeiten} Seite(n))`)
  const dl = pc.p.waitForEvent('download', { timeout: 60000 }).catch(() => null)
  await fenster.locator('[data-pdf-vorschau-speichern]').click()
  const d = await dl
  pruefe(Boolean(d), `Browser: „PDF speichern" lädt herunter (${d?.suggestedFilename() ?? '–'})`)
  if (d) {
    const ziel = join(ablage, 'browser.pdf')
    await d.saveAs(ziel)
    const n = (await PDFDocument.load(readFileSync(ziel))).getPageCount()
    pruefe(n > 0, `Browser: heruntergeladenes PDF gültig (${n} Seiten)`)
  }
  await pc.ctx.close()

  // ---------- 3) Browser als iPad
  console.log('\nBrowser als iPad')
  const ipad = await imBrowser('iPad', {
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  })
  fenster = await vorschauOeffnen(ipad.p)
  const i = await inhalt(fenster)
  await ipad.p.screenshot({ path: join(out, '3-ipad-vorschau.png') })
  pruefe(i.ok && i.art === 'seiten', `iPad: Vorschau als Seitenbilder (${i.art}: ${i.info})`)
  pruefe(ipad.downloads.length === 0, 'iPad: kein Download bei der Vorschau')
  await fenster.locator('[data-pdf-vorschau-schliessen]').click()
  await ipad.ctx.close()
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await browser?.close().catch(() => undefined)
  await page.evaluate(() => window.api.lan.stop()).catch(() => undefined)
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
console.log('\nAlles in Ordnung.')
