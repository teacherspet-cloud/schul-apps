// Materialkopf nur einmal (03.10.2026, Befund der Lehrkraft): Eine Textquelle unten auf der Seite wurde
// mitten im ERSTEN Absatz geteilt – auf der nächsten Seite standen Titel, Quellenangabe und Einleitung
// ein zweites Mal, dann ging der Text richtig weiter. Ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/material-kopf.mjs [Ausgabeordner]
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/material-kopf')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-kopf-'))
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
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  let geteilt = 0
  // Eine Schreibaufgabe davor schiebt die Quelle Schritt für Schritt an das Seitenende
  for (let zeilen = 8; zeilen <= 32; zeilen += 3) {
    await page.evaluate((n) => {
      const st = window.__selftest
      const ws = st.fussnotenBlatt('endnoten')
      ws.meta.title = `Kopf ${n}`
      const [material, aufgabe] = ws.sheets[0].blocks
      const satz =
        'Am 21. Februar 1916 begann das Trommelfeuer. Die Erde bebte, die Unterstände stürzten ein, und niemand wusste, ob er den Morgen erleben würde. '
      Object.assign(material, {
        title: 'Tagebuch aus dem Stellungskrieg',
        sourceHeader: { author: 'Louis Barthas', textType: 'Tagebuch', date: '1916' },
        intro: 'Der französische Reservist Louis Barthas schildert 1916 in seinem Tagebuch Erfahrungen aus den Kämpfen bei Verdun:',
        body: satz.repeat(14) + '\n\n' + satz.repeat(3),
        fussnoten: [],
        glossary: []
      })
      const davor = JSON.parse(JSON.stringify(aufgabe))
      davor.id = 'fuell'
      davor.answer = { ...davor.answer, count: n }
      ws.sheets[0].blocks = [davor, material, aufgabe]
      st.setWorksheet(ws)
    }, zeilen)
    await page.waitForTimeout(1800)
    const befund = await page.evaluate(() => {
      const stuecke = [...document.querySelectorAll('.module-container:not([hidden]) .ws-editor-pages [data-fluss="fn-material"]')]
      const zahl = (sel) => stuecke.reduce((s, e) => s + e.querySelectorAll(sel).length, 0)
      return {
        stuecke: stuecke.length,
        titel: zahl('.ws-text-title'),
        kopf: zahl('.ws-source-header'),
        einleitung: zahl('.ws-text-intro'),
        hinweis: stuecke.slice(1).every((e) => e.querySelector('.ws-task-continued'))
      }
    })
    if (befund.stuecke < 2) continue
    geteilt++
    pruefe(
      befund.titel === 1 && befund.kopf === 1 && befund.einleitung === 1 && befund.hinweis,
      `${zeilen} Zeilen davor, ${befund.stuecke} Stücke: Titel ${befund.titel}×, Quellenangabe ${befund.kopf}×, Einleitung ${befund.einleitung}×, Fortsetzungshinweis ${befund.hinweis ? 'ja' : 'nein'}`
    )
    if (geteilt === 1) {
      await page.locator('.module-container:not([hidden]) [data-fluss="fn-material"]').nth(1).scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(out, `geteilt-${zeilen}.png`) })
    }
  }
  pruefe(geteilt >= 3, `Quelle in ${geteilt} Lagen über den Seitenumbruch geteilt`)
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
console.log('\nMaterialkopf: alles in Ordnung')
