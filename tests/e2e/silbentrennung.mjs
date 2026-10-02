// Silbentrennung am Bildschirm und im Druck-HTML – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/silbentrennung.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (02.10.2026): korrekte Silbentrennung mit Bindestrich in allen Apps.
// Geprüft: Die Seiten des Arbeitsblatts tragen weiche Trennstriche (U+00AD), ein Wort am
// Zeilenende wird wirklich getrennt (es ragt nicht mehr über die Spalte), die gespeicherten Daten
// bleiben ohne unsichtbare Zeichen, und Bearbeiten speichert keine.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/silbentrennung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-silben-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
try {
  const page = await app.firstWindow()
  await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050))
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsBreiteTabelle())
  await page.waitForTimeout(3000)

  const befund = await page.evaluate(() => {
    const seiten = [...document.querySelectorAll('.ws-page')].filter((p) => !p.closest('.ws-measure'))
    const text = seiten.map((p) => p.textContent ?? '').join(' ')
    const mess = [...document.querySelectorAll('.ws-measure .ws-page')].map((p) => p.textContent ?? '').join(' ')
    // Ein langes Wort in einer schmalen Spalte: ragt es über die Zelle hinaus?
    const zellen = [...document.querySelectorAll('.ws-page:not(.ws-measure *) td, .ws-page:not(.ws-measure *) th')]
    // Nur der TEXT zählt (die Ziehgriffe am Rand sind absichtlich außen)
    const ueber = zellen.filter((z) => {
      const rechts = z.getBoundingClientRect().right
      const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const r = document.createRange()
        r.selectNodeContents(n)
        if ([...r.getClientRects()].some((q) => q.right > rechts + 1)) return true
      }
      return false
    }).length
    return { weich: (text.match(/\u00AD/g) ?? []).length, messWeich: (mess.match(/\u00AD/g) ?? []).length, ueber }
  })
  pruefe(befund.weich > 20, `Seiten tragen weiche Trennstriche (${befund.weich})`)
  pruefe(befund.messWeich > 20, `auch die Messfläche (Seitenumbruch) trennt (${befund.messWeich})`)
  pruefe(befund.ueber === 0, `kein Wort ragt über seine Tabellenzelle (${befund.ueber})`)
  await page.screenshot({ path: join(out, '1-blatt.png') })

  const gespeichert = await page.evaluate(() => JSON.stringify(window.__selftest.wsJetzt?.() ?? {}))
  pruefe(!gespeichert.includes('\u00AD') && !gespeichert.includes('\u00ad'), 'die Daten des Blattes bleiben ohne weiche Trennstriche')

  // Bearbeiten: Titel anklicken, ein Zeichen anhängen, verlassen – gespeichert ohne U+00AD
  const titel = page.locator('.ws-page:not(.ws-measure *) .rt-editable').first()
  await titel.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Zusammenarbeitsvereinbarung')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(800)
  const nachher = await page.evaluate(() => JSON.stringify(window.__selftest.wsJetzt?.() ?? {}))
  pruefe(nachher.includes('Zusammenarbeitsvereinbarung'), 'Bearbeitung gespeichert')
  pruefe(!nachher.includes('\u00AD'), 'nach dem Bearbeiten keine weichen Trennstriche in den Daten')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
