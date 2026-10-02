// Useful vocabulary im Phrases-Kasten – Darstellung OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/hoervokabular.mjs <Ausgabeordner>
//
// Entscheidung der Lehrkraft (02.10.2026): Vokabeln zu Hörtexten/Videos als Gruppe im
// Useful-phrases-Kasten; die Erklärung steht IMMER da (auch wenn die deutschen Entsprechungen
// der Redemittel ab B1+ entfallen), darunter kursiv der Satz aus dem Text.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hoervokabular')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hoervok-'))
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
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const ws = structuredClone(window.__selftest.wsJetzt())
    ws.meta.cefrLevel = 'B2'
    const kasten = {
      id: 'vok-kasten',
      type: 'phrases',
      title: 'Useful phrases',
      hint: '',
      groups: [
        { label: 'Useful vocabulary', art: 'vokabeln', items: [{ text: '**abode** (n.) /əˈbəʊd/', german: 'a place where someone lives', kontext: 'I moved to a new abode last summer.' }] },
        { label: 'Giving reasons', items: [{ text: 'That is why …', german: 'Deshalb …' }] }
      ]
    }
    ws.sheets[0].blocks.splice(1, 0, kasten)
    window.__selftest.setWorksheet(ws)
  })
  await page.waitForTimeout(2500)
  const sicht = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.ws-page:not(.ws-measure *) .ws-phrases')][0]
    const t = (k?.textContent ?? '').replace(/\u00AD/g, '')
    return { t, kontext: k?.querySelector('.ws-phrases-kontext')?.textContent?.replace(/\u00AD/g, '') ?? '' }
  })
  pruefe(sicht.t.includes('Useful vocabulary') && sicht.t.includes('abode'), 'Gruppe „Useful vocabulary“ im Kasten')
  pruefe(sicht.t.includes('a place where someone lives'), 'Erklärung steht da, obwohl B2 (Redemittel ohne Übersetzung)')
  pruefe(!sicht.t.includes('Deshalb'), 'Redemittel weiter ohne deutsche Entsprechung (B2)')
  pruefe(sicht.kontext.includes('I moved to a new abode'), `Kontextsatz darunter (${sicht.kontext})`)
  await page.locator('.ws-page:not(.ws-measure *) .ws-phrases').first().screenshot({ path: join(out, '1-kasten.png') })
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
