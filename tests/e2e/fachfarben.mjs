// Wache für die FACHFARBEN – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/fachfarben.mjs <Ausgabeordner>
//
// Anlass (Paket 10a, 26.09.2026): Jedes Fach hat eine Farbe, die die Akzentfarbe der
// Designvorlage ersetzt. Geprüft wird der Weg der Lehrkraft:
//  - Einstellungen › Material: Fachfarbe wählen; eine zu helle freie Farbe löst die
//    Graustufen-Warnung aus;
//  - die Arbeitsblatt-Vorschau übernimmt die neue Farbe, ohne das Blatt neu zu öffnen;
//  - „Farbe der Vorlage verwenden" in den Blattoptionen stellt die Vorlagenfarbe wieder her;
//  - der Kopf der Lernzielkontrolle übernimmt die Fachfarbe ebenso (und abgeschaltet nicht);
//  - „Zuletzt bearbeitet" auf der Startseite zeigt den Farbpunkt des Fachs.
// Bildschirmfotos: paket10a-einstellungen.png, paket10a-warnung.png, paket10a-blatt-fachfarbe.png,
// paket10a-lzk-fachfarbe.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche, blattoptionen } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/fachfarben')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-fachfarben-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const MAGENTA = '#b0247a'
const BRAUN = '#7c4a1e'

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.setSize(1500, 1000)
  })
  await warteAufOberflaeche(page)

  /** Akzentfarbe der ersten sichtbaren Blattseite im Editor (nicht die Messseiten) */
  const akzent = () =>
    page.evaluate(() => {
      const seite = [...document.querySelectorAll('.ws-editor-pages .ws-page')].find((p) => p.getBoundingClientRect().width > 0)
      return seite ? getComputedStyle(seite).getPropertyValue('--ws-accent').trim().toLowerCase() : null
    })

  async function fachfarbeWaehlen(fach, farbname) {
    await page.click('[aria-label="Einstellungen"]')
    await page.getByRole('tab', { name: 'Material' }).click()
    await page.waitForTimeout(300)
    await page.click(`.fachfarbe-zeile[data-fach="${fach}"]`)
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: farbname, exact: true }).click()
    await page.waitForTimeout(300)
  }

  // ---- Arbeitsblatt anlegen (ohne KI) ----
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(4))
  await page.waitForTimeout(2500)
  const blatt = await page.evaluate(() => {
    const ws = window.__selftest.worksheetJetzt()
    return { fach: ws.meta.subjectId, vorlage: ws.design.page.accentColor.toLowerCase() }
  })
  console.log(`Blatt: Fach ${blatt.fach}, Vorlagenfarbe ${blatt.vorlage}`)
  const vorher = await akzent()
  pruefe(vorher && vorher !== blatt.vorlage, `ohne eigene Wahl gilt der Vorschlag für das Fach (${vorher}), nicht die Vorlage`)

  // ---- Einstellungen: Fachfarbe wählen, Graustufen-Warnung ----
  await fachfarbeWaehlen(blatt.fach, 'Magenta')
  await page.screenshot({ path: join(out, 'paket10a-einstellungen.png') })
  const frei = page.getByLabel(/^Freie Farbe für/)
  await frei.fill('#ffe066')
  await frei.press('Enter')
  // Den Farbwähler schließen, damit das Bildschirmfoto die Warnung zeigt
  await page.getByText(/^Farbe für /).click()
  await page.waitForTimeout(400)
  const warnung = await page.$eval('.fachfarbe-grau', (el) => ({ stufe: el.getAttribute('data-stufe'), text: el.textContent }))
  pruefe(warnung.stufe === 'zu-hell' && /Zu hell/.test(warnung.text), `zu helle freie Farbe → Graustufen-Warnung (${warnung.stufe})`)
  const warnSymbol = await page.$(`.fachfarbe-zeile[data-fach="${blatt.fach}"] [aria-label="Hinweis zum S/W-Druck"]`)
  pruefe(Boolean(warnSymbol), 'die Fachzeile trägt danach ein Warnzeichen')
  await page.screenshot({ path: join(out, 'paket10a-warnung.png') })
  // Zurück zu einer druckfesten Farbe
  await page.getByRole('button', { name: 'Magenta', exact: true }).click()
  await page.waitForTimeout(300)
  const gut = await page.$eval('.fachfarbe-grau', (el) => el.getAttribute('data-stufe'))
  pruefe(gut === 'gut', `Palettenfarbe → keine Warnung (${gut})`)
  await page.keyboard.press('Escape')

  // ---- Arbeitsblatt übernimmt die Farbe ----
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(800)
  const nachher = await akzent()
  pruefe(nachher === MAGENTA, `Arbeitsblatt-Vorschau übernimmt die neue Fachfarbe (${nachher})`)
  const leiste = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.ws-editor-pages .ws-page h1, .ws-editor-pages .ws-page .ws-title')].find(
      (e) => e.getBoundingClientRect().width > 0
    )
    return t ? getComputedStyle(t).color : null
  })
  console.log(`  Titelfarbe: ${leiste}`)
  await page
    .locator('.ws-editor-pages .ws-page')
    .filter({ visible: true })
    .first()
    .screenshot({ path: join(out, 'paket10a-blatt-fachfarbe.png') })

  // ---- Abschalten: Farbe der Vorlage ----
  await blattoptionen(page)
  await page.locator('label', { hasText: 'Farbe der Vorlage verwenden' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(600)
  const abgeschaltet = await akzent()
  pruefe(abgeschaltet === blatt.vorlage, `„Farbe der Vorlage verwenden" → Vorlagenfarbe (${abgeschaltet})`)
  await page.locator('label', { hasText: 'Farbe der Vorlage verwenden' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(400)
  pruefe((await akzent()) === MAGENTA, 'wieder eingeschaltet → Fachfarbe')
  await page.keyboard.press('Escape')

  // ---- Lernzielkontrolle ----
  await fachfarbeWaehlen('mathematik', 'Braun')
  await page.keyboard.press('Escape')
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.waitForTimeout(2000)
  // Die Wache legt die LZK mit der ersten Vorlage („Klassisch") an
  const lzkVorlage = '#2b6cb0'
  const lzk = await akzent()
  pruefe(lzk === BRAUN, `LZK-Kopf übernimmt die Fachfarbe Mathematik (${lzk})`)
  const kopf = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.ws-editor-pages .ws-page .ws-header')].find((e) => e.getBoundingClientRect().width > 0)
    return k ? getComputedStyle(k).borderBottomColor || getComputedStyle(k).color : null
  })
  console.log(`  Kopf der LZK: ${kopf}`)
  await page
    .locator('.ws-editor-pages .ws-page')
    .filter({ visible: true })
    .first()
    .screenshot({ path: join(out, 'paket10a-lzk-fachfarbe.png') })
  await page.evaluate(() => window.__selftest.lzkMetaSetzen({ vorlagenfarbe: true }))
  await page.waitForTimeout(600)
  const lzkAus = await akzent()
  pruefe(lzkAus === lzkVorlage, `LZK mit „Farbe der Vorlage" → Vorlagenfarbe (${lzkAus})`)

  // ---- Startseite: Farbpunkt in „Zuletzt bearbeitet" ----
  await page.waitForTimeout(2500) // Autosave
  await page.click('[aria-label="Startseite"]')
  await page.waitForTimeout(1200)
  const punkte = await page.$$eval('.home-material .fach-punkt', (els) => els.map((e) => e.getAttribute('data-farbe')))
  console.log(`  Farbpunkte auf der Startseite: ${punkte.join(', ')}`)
  pruefe(punkte.includes(MAGENTA), '„Zuletzt bearbeitet" zeigt den Farbpunkt des Arbeitsblatt-Fachs')
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nFachfarben: alles in Ordnung')
