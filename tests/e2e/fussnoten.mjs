// Wache FUSSNOTEN ODER ENDNOTEN – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/fussnoten.mjs [Ausgabeordner]
//
// Wunsch der Lehrkraft (01.10.2026): In den Blattoptionen erscheint, sobald ein Material
// Anmerkungen hat, die Wahl „Fußnoten" oder „Endnoten". Geprüft wird an einem langen Material
// über zwei Seiten mit Anmerkungen auf beiden Seiten:
//  1. Blattoptionen: Wahl nur mit Anmerkungen, Vorgabe Endnoten, Umschalten speichert im Dokument
//  2. Fußnoten: jede Seite zeigt unten genau die Anmerkungen ihrer hochgestellten Ziffern, nichts
//     läuft in den Fußnotenbereich oder über den Satzspiegel; keine Liste mehr am Materialende
//  3. Druck: dieselben Fußnoten im Druck-HTML, Seitenzahl wie in der Ansicht
//  4. Endnoten: unverändert – Liste am Ende des Materials, kein Fußnotenbereich
//  5. Word: echte Fußnoten mit eigenem Zeichen (je Material ab 1)
//  6. Klassenarbeit: dieselben Fußnoten unten auf der Seite
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/fussnoten')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-fussnoten-'))
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' },
  ...(process.env.SCHULAPPS_ELECTRON ? { executablePath: process.env.SCHULAPPS_ELECTRON } : {})
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))

/*
 * Je sichtbarer Seite: hochgestellte Ziffern im Materialtext, Nummern im Fußnotenbereich, Liste am
 * Materialende, und wie weit Inhalt in den Fußnotenbereich bzw. über die Inhaltsfläche ragt (mm).
 */
const SEITEN = (wurzel) => {
  const seiten = [...document.querySelectorAll(`${wurzel} .ws-page`)].filter(
    (s) => !s.closest('.ws-measure') && !s.parentElement.closest('.ws-page') && s.getBoundingClientRect().height > 0
  )
  return seiten.map((seite) => {
    const mm = seite.getBoundingClientRect().width / 210
    const body = seite.querySelector('.ws-body')
    const b = body.getBoundingClientRect()
    const fn = [...body.children].find((k) => k.hasAttribute('data-fussnoten-seite'))
    const grenze = fn ? fn.getBoundingClientRect().top : b.bottom
    let tiefste = -Infinity
    for (const k of body.children) {
      if (k === fn || k.matches('.ws-free')) continue
      for (const el of [k, ...k.querySelectorAll('*')]) {
        if (el.closest('.editor-block-toolbar, .editor-ai-revise-slot, [data-seitenrand-ignorieren]')) continue
        const r = el.getBoundingClientRect()
        // Zeilenweise geteilter Absatz (02.10.2026): sichtbar ist nur, was im Rahmen steht – der Rest ist abgeschnitten
        const schnitt = el.closest('.ws-zeilen-schnitt')
        const unten = schnitt ? Math.min(r.bottom, schnitt.getBoundingClientRect().bottom) : r.bottom
        if (r.width > 0.5 && r.height > 0.5) tiefste = Math.max(tiefste, unten)
      }
    }
    return {
      // Nur sichtbare Ziffern: Bei zeilenweise geteilten Absätzen steckt der Rest abgeschnitten im Rahmen (02.10.2026)
      ziffern: [...seite.querySelectorAll('.ws-paragraph sup')]
        .filter((s) => {
          const rahmen = s.closest('.ws-zeilen-schnitt')
          if (!rahmen) return true
          const r = s.getBoundingClientRect()
          const f = rahmen.getBoundingClientRect()
          return r.top >= f.top - 1 && r.bottom <= f.bottom + 1
        })
        .map((s) => s.textContent.trim()),
      noten: fn ? [...fn.querySelectorAll('[data-fn-nr]')].map((s) => s.getAttribute('data-fn-nr')) : [],
      liste: seite.querySelectorAll('.ws-glossary').length,
      inFussnoten: Math.round(((tiefste - grenze) / mm) * 10) / 10,
      fnUnten: fn ? Math.round(((fn.getBoundingClientRect().bottom - b.bottom) / mm) * 10) / 10 : 0
    }
  })
}

const sichtbar = '.module-container:not([hidden])'
const seitenJetzt = () => page.evaluate(`(${SEITEN.toString()})(${JSON.stringify(sichtbar)})`)

async function warteSeiten() {
  let vorher = ''
  let gleich = 0
  for (let i = 0; i < 40 && gleich < 2; i++) {
    await page.waitForTimeout(350)
    const s = JSON.stringify(await seitenJetzt())
    gleich = s === vorher ? gleich + 1 : 0
    vorher = s
  }
  return JSON.parse(vorher)
}

/** Fußnotenmodus: jede Seite trägt unten genau die Anmerkungen ihrer Ziffern */
function fussnotenPruefen(name, seiten, mindestens = 2) {
  const mitNoten = seiten.filter((s) => s.noten.length)
  pruefe(mitNoten.length >= mindestens, `${name}: Fußnoten auf ${mitNoten.length} Seiten (mind. ${mindestens})`)
  seiten.forEach((s, i) => {
    const imText = [...new Set(s.ziffern)].sort()
    const unten = [...s.noten].sort()
    // Anmerkungen ohne Stelle im Text dürfen zusätzlich unten stehen – jede Ziffer im Text aber unten auf DERSELBEN Seite
    pruefe(
      imText.every((z) => unten.includes(z)),
      `${name} S.${i + 1}: jede Ziffer im Text (${imText.join(',') || '–'}) steht unten auf dieser Seite (${unten.join(',') || '–'})`
    )
    pruefe(s.liste === 0, `${name} S.${i + 1}: keine Liste am Materialende`)
    pruefe(s.inFussnoten <= 0.3, `${name} S.${i + 1}: nichts ragt in den Fußnotenbereich (${s.inFussnoten} mm)`)
    pruefe(s.fnUnten <= 0.3, `${name} S.${i + 1}: Fußnotenbereich innerhalb des Satzspiegels (${s.fnUnten} mm)`)
  })
}

/** Blattoptionen öffnen – ein Klick auf den offenen Knopf schließt sie wieder */
async function blattoptionen() {
  const offen = () => page.locator('label', { hasText: 'Schulangaben' }).filter({ visible: true }).count()
  for (let i = 0; i < 3 && !(await offen()); i++) {
    await page.getByRole('button', { name: 'Blattoptionen' }).click()
    await page.waitForTimeout(500)
  }
}
async function blattoptionenZu() {
  for (let i = 0; i < 3 && (await page.locator('label', { hasText: 'Schulangaben' }).filter({ visible: true }).count()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    if (await page.locator('label', { hasText: 'Schulangaben' }).filter({ visible: true }).count())
      await page.getByRole('button', { name: 'Blattoptionen' }).click()
    await page.waitForTimeout(300)
  }
}

try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setSize(1600, 1050)
    win?.center()
  })
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)

  // ---------- 1. Blattoptionen: ohne Anmerkungen keine Wahl
  await page.evaluate(() => window.__selftest.wsSeitenrand('knapp', 1, 0))
  await page.waitForTimeout(1200)
  await blattoptionen()
  pruefe(
    (await page.locator('[data-testid="blattoption-anmerkungen"]').filter({ visible: true }).count()) === 0,
    'Ohne Anmerkungen keine Wahl Fußnoten/Endnoten'
  )
  await blattoptionenZu()

  // ---------- 4. Endnoten (Vorgabe) – unverändert
  await page.evaluate(() => {
    const ws = window.__selftest.fussnotenBlatt('endnoten')
    delete ws.meta.anmerkungen
    window.__selftest.setWorksheet(ws)
  })
  let seiten = await warteSeiten()
  pruefe(seiten.length >= 2, `Endnoten: Material über ${seiten.length} Seiten`)
  pruefe(
    seiten.every((s) => s.noten.length === 0),
    'Endnoten: kein Fußnotenbereich'
  )
  const listeAuf = seiten.map((s, i) => (s.liste ? i : -1)).filter((i) => i >= 0)
  const zifferSeiten = seiten.map((s, i) => (s.ziffern.length ? i : -1)).filter((i) => i >= 0)
  pruefe(
    listeAuf.length === 1 && listeAuf[0] === Math.max(...zifferSeiten),
    `Endnoten: eine Liste am Ende des Materials (Seite ${listeAuf.map((i) => i + 1).join(',')})`
  )
  pruefe(zifferSeiten.length >= 2, `Endnoten: hochgestellte Ziffern auf ${zifferSeiten.length} Seiten`)
  await page.screenshot({ path: join(out, '4-endnoten.png') })

  // ---------- 1b. Wahl erscheint, Vorgabe Endnoten, Umschalten speichert
  await blattoptionen()
  const wahl = page.locator('[data-testid="blattoption-anmerkungen"]').filter({ visible: true }).first()
  pruefe(await wahl.isVisible(), 'Mit Anmerkungen: Wahl „Fußnoten und Worthilfen" in den Blattoptionen')
  pruefe((await wahl.inputValue()).startsWith('Endnoten'), `Vorgabe: Endnoten („${await wahl.inputValue()}")`)
  await page.screenshot({ path: join(out, '1-blattoptionen.png') })
  await wahl.click()
  await page.getByRole('option', { name: /Fußnoten/ }).click()
  await page.waitForTimeout(300)
  pruefe((await page.evaluate(() => window.__selftest.worksheetJetzt().meta.anmerkungen)) === 'fussnoten', 'Umschalten speichert „fussnoten" im Dokument')
  await blattoptionenZu()

  // ---------- 2. Fußnoten
  seiten = await warteSeiten()
  fussnotenPruefen('Arbeitsblatt Fußnoten', seiten)
  const erste = seiten.findIndex((s) => s.noten.length)
  if (erste >= 0) {
    await page.evaluate(
      ([w, i]) =>
        [...document.querySelectorAll(`${w} .ws-page`)]
          .filter((s) => !s.closest('.ws-measure') && s.getBoundingClientRect().height > 0)
          [i]?.scrollIntoView({ block: 'end' }),
      [sichtbar, erste]
    )
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, '2-fussnoten-seite1.png') })
    await page.evaluate(
      ([w, i]) =>
        [...document.querySelectorAll(`${w} .ws-page`)]
          .filter((s) => !s.closest('.ws-measure') && s.getBoundingClientRect().height > 0)
          [i]?.scrollIntoView({ block: 'end' }),
      [sichtbar, seiten.findLastIndex((s) => s.noten.length)]
    )
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, '2-fussnoten-seite2.png') })
  }

  // ---------- 3. Druck
  const html = await page.evaluate(() => window.__selftest.druckHtmlJetzt())
  const pfad = join(userData, 'druck.html')
  writeFileSync(pfad, html, 'utf8')
  const druck = await app.evaluate(
    async ({ BrowserWindow }, [p, mess]) => {
      const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true } })
      try {
        await win.loadFile(p)
        win.webContents.debugger.attach('1.3')
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
        const erg = await win.webContents.executeJavaScript(`(${mess})('body')`)
        win.webContents.debugger.detach()
        const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
        return { erg, pdf: pdf.toString('base64') }
      } finally {
        win.destroy()
      }
    },
    [pfad, SEITEN.toString()]
  )
  writeFileSync(join(out, '3-druck.pdf'), Buffer.from(druck.pdf, 'base64'))
  const blattSeiten = druck.erg.filter((s) => s.ziffern.length || s.noten.length)
  fussnotenPruefen('Druck Fußnoten', blattSeiten)

  // ---------- 5. Word
  const word = await page.evaluate(() => window.__selftest.wordXmlJetzt())
  const zeichen = [...word.dokument.matchAll(/<w:footnoteReference w:customMarkFollows="1" w:id="\d+"\/><w:t xml:space="preserve">(\d+)<\/w:t>/g)].map(
    (m) => m[1]
  )
  pruefe(zeichen.join(',') === '1,2,3', `Word: echte Fußnoten mit eigenem Zeichen 1,2,3 (${zeichen.join(',')})`)
  pruefe(word.fussnoten.includes('Sonnenwärme') && word.fussnoten.includes('Eiskörnern'), 'Word: Erklärungen stehen in footnotes.xml')
  pruefe(!word.dokument.includes('Sonnenwärme'), 'Word: keine Liste unter dem Material')

  // ---------- 6. Klassenarbeit
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.exam())
  await page.evaluate(() => {
    const e = structuredClone(window.__selftest.kaJetzt())
    const blatt = window.__selftest.fussnotenBlatt('fussnoten')
    e.parts[0].blocks = blatt.sheets[0].blocks
    e.meta.anmerkungen = 'fussnoten'
    window.__selftest.kaSetzen(e)
  })
  seiten = (await warteSeiten()).filter((s) => s.ziffern.length || s.noten.length)
  fussnotenPruefen('Klassenarbeit Fußnoten', seiten)
  await page.screenshot({ path: join(out, '6-klassenarbeit.png') })
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log(`\nFußnoten und Endnoten stimmen. Ergebnisse in ${out}`)
