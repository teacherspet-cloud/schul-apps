// Werkzeugleiste eines Bausteins unten auf der Seite (03.10.2026, Befund der Lehrkraft: „Wenn man mit der
// Maus über einen Baustein hovert, der nicht ganz unten auf die Seite passte, sind die Baukastenoptionen
// rechts daneben abgeschnitten"). Die Leiste muss ganz in der Inhaltsfläche stehen, die oben und unten
// abschneidet. Ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/leiste-unten.mjs [Ausgabeordner]
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/leiste-unten')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-leiste-'))
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
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setSize(1600, 1050)
    win?.center()
  })
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  const sichtbar = '.module-container:not([hidden])'
  let eng = 0
  // Mehrere Blätter mit vielen Bausteinen: gesucht sind Bausteine, die so knapp über dem unteren Rand der
  // Inhaltsfläche beginnen, dass die Leiste an ihrem natürlichen Platz unten herausragte
  for (const art of ['gemischt', 'teilbar', 'knapp', 'protokoll', 'tabellen', 'raender']) {
    await page.evaluate((a) => window.__selftest.wsSeitenrand(a), art)
    await page.waitForTimeout(2500)
    const ziele = await page.evaluate((s) => {
      const out = []
      const seiten = [...document.querySelectorAll(`${s} .ws-editor-pages .ws-page`)]
      const alle = [...document.querySelectorAll(`${s} .ws-editor-pages .editor-block`)]
      seiten.forEach((seite, i) => {
        const body = seite.querySelector('.ws-body')
        if (!body) return
        const unten = body.getBoundingClientRect().bottom
        for (const b of seite.querySelectorAll('.editor-block')) {
          const t = b.querySelector(':scope > .editor-block-toolbar')
          if (!t || b.closest('.ws-free')) continue
          const r = b.getBoundingClientRect()
          // Natürlicher Platz der Leiste: 6 mm unter der Oberkante des Bausteins (editor.css)
          const ueber = r.top + t.offsetTop + t.offsetHeight - unten
          if (r.height > 4 && r.top < unten - 20 && ueber > 0) out.push({ seite: i, index: alle.indexOf(b), ueber: Math.round(ueber) })
        }
      })
      return out
    }, sichtbar)
    for (const z of ziele) {
      eng++
      const block = page.locator(`${sichtbar} .ws-editor-pages .editor-block`).nth(z.index)
      await block.scrollIntoViewIfNeeded()
      await block.hover({ position: { x: 20, y: 6 } })
      await page.waitForTimeout(400)
      const lage = await block.evaluate((b) => {
        const t = b.querySelector(':scope > .editor-block-toolbar')
        const body = b.closest('.ws-body')
        if (!t || !body) return null
        const tr = t.getBoundingClientRect()
        const br = body.getBoundingClientRect()
        return { leisteOben: tr.top, leisteUnten: tr.bottom, flaecheOben: br.top, flaecheUnten: br.bottom, hoehe: tr.height }
      })
      pruefe(
        Boolean(lage) && lage.hoehe > 20 && lage.leisteUnten <= lage.flaecheUnten + 1 && lage.leisteOben >= lage.flaecheOben - 1,
        `${art}, Seite ${z.seite + 1} (Leiste ragte ${z.ueber} px heraus): jetzt ${lage ? `${Math.round(lage.leisteUnten - lage.flaecheUnten)} px zum unteren Rand` : 'keine Leiste'}`
      )
      if (eng <= 3) await page.screenshot({ path: join(out, `${art}-seite-${z.seite + 1}.png`) })
      await page.mouse.move(5, 500)
    }
  }
  pruefe(eng > 0, `Knappe Bausteine gefunden: ${eng}`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 4).join(' | ')}`)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nLeiste unten: alles in Ordnung')
