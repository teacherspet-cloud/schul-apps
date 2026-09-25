// Wache: Nichts auf dem Blatt ist BREITER als die Seite (vorher: npm run build).
// Aufruf: node tests/e2e/seitenbreite.mjs <Ausgabeordner>
//
// Gemeldet von der Lehrkraft (24.09.2026): Im PDF stand der Inhalt nur im oberen Drittel
// der Seite, die Schreiblinien endeten auf halber Breite – „die bereiche mit linien/kästen
// v.a. links / oben nicht vollständig dargestellt".
//
// Ursache war eine fünfspaltige Wortschatztabelle. Wächst irgendetwas über die Blattbreite
// hinaus, verkleinert Chromium beim Drucken das GANZE Dokument, damit es aufs Papier passt –
// jede Seite, auch die ohne Tabelle. Am Bildschirm sieht man nichts davon: Die Seite ist auf
// `overflow: hidden` gestellt und schneidet den Überstand einfach ab.
//
// Deshalb wird hier am Bildschirm GEMESSEN, was im PDF zuschlägt.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seitenbreite')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-breite-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Ragt auf irgendeiner Seite etwas über den Rand hinaus? */
const ueberstand = async () =>
  page.evaluate(() => {
    const seiten = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)
    const treffer = []
    for (const [i, seite] of seiten.entries()) {
      const s = seite.getBoundingClientRect()
      for (const el of seite.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        const rechts = Math.round(r.right - s.right)
        const links = Math.round(s.left - r.left)
        if (rechts > 1 || links > 1) {
          treffer.push({ seite: i + 1, was: String(el.className).split(' ').slice(0, 2).join('.') || el.tagName, rechts, links })
        }
      }
    }
    // Nur die schlimmsten drei je Seite – eine lange Liste sagt nicht mehr als die ersten
    return treffer.sort((a, b) => Math.max(b.rechts, b.links) - Math.max(a.rechts, a.links)).slice(0, 6)
  })

for (const [name, aufbau] of [
  ['breite Wortschatztabelle', () => window.__selftest.wsBreiteTabelle()],
  ['Schreibaufgabe mit Notizentabelle', () => window.__selftest.wsGeteilteAufgabe(0)],
  ['Aufgabe mit neun Teilaufgaben', () => window.__selftest.wsGeteilteAufgabe(9)]
]) {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(400)
  await page.evaluate(aufbau)
  await page.waitForTimeout(2500)
  const treffer = await ueberstand()
  console.log(`${name}: ${treffer.length ? JSON.stringify(treffer) : 'kein Überstand'}`)
  pruefe(treffer.length === 0, `${name}: Nichts ragt über die Blattbreite hinaus`)
}

await page.screenshot({ path: join(out, 'breite-tabelle.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nKein Inhalt ist breiter als die Seite – Chromium verkleinert beim Drucken nichts. Bilder in ${out}`)
