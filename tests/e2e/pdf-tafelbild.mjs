// Wache: Das TAFELBILD darf die übrigen Seiten nicht verkleinern (vorher: npm run build).
// Aufruf: node tests/e2e/pdf-tafelbild.mjs <Ausgabeordner>
//
// Gemeldet von der Lehrkraft (24.09.2026) mit einem PDF: Der Inhalt sass nur im oberen
// linken Teil der Seite, rechts und unten blieb alles leer – „die bereiche mit linien/kästen
// v.a. links / oben nicht vollständig dargestellt".
//
// Ursache: Die Tafelbild-Seite ist 297 mm breit (Querformat), `@page` galt aber für das
// ganze Dokument als A4 HOCH. Chromium verkleinert dann beim Drucken ALLE Seiten so weit,
// bis die breiteste hineinpasst – 210/297 = 0,707. Nachgemessen an der eingeschickten
// Datei: Die Tinte reichte waagerecht nur bis 65,7 % statt bis rund 90 %.
//
// Am Bildschirm ist davon nichts zu sehen, und ohne Tafelbild auch im PDF nicht. Deshalb
// misst diese Wache die BEDRUCKTE FLÄCHE im fertigen PDF – einmal mit, einmal ohne.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/pdf-tafelbild')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-tafel-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMitTafelbild())
await page.waitForTimeout(2500)

/** PDF erzeugen und die bedruckte Fläche je Seite messen. */
const messen = async (mitTafelbild, name) => {
  const html = await page.evaluate((m) => (m ? window.__selftest.printHtmlMitTafelbild() : window.__selftest.printHtml()), mitTafelbild)
  const bytes = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), html)
  writeFileSync(join(out, `${name}.pdf`), Buffer.from(bytes))
  const flaeche = await page.evaluate(async (d) => window.__selftest.pdfFlaeche(d), bytes)
  for (const f of flaeche) console.log(`   ${name} Seite ${f.seite}: waagerecht ${f.links}–${f.rechts} %, senkrecht ${f.oben}–${f.unten} %`)
  return flaeche
}

const ohne = await messen(false, 'ohne-tafelbild')
const mit = await messen(true, 'mit-tafelbild')
await app.close()
rmSync(userData, { recursive: true, force: true })

/*
 * Die erste Seite ist in beiden Fällen dasselbe Arbeitsblatt. Sie muss auch gleich breit
 * bedruckt sein – sonst hat das Tafelbild sie mit verkleinert.
 */
const b = (f) => Math.round(f.rechts - f.links)
console.log(`Bedruckte Breite der ersten Seite: ohne Tafelbild ${b(ohne[0])} %, mit Tafelbild ${b(mit[0])} %`)
pruefe(b(ohne[0]) > 75, `Ohne Tafelbild nutzt die Seite die Breite (${b(ohne[0])} %)`)
pruefe(Math.abs(b(mit[0]) - b(ohne[0])) <= 3, `Das Tafelbild verkleinert die Arbeitsblattseite nicht (${b(mit[0])} % statt ${b(ohne[0])} %)`)
// Und das Tafelbild selbst muss quer stehen, also breiter als hoch bedruckt sein
const tafel = mit[mit.length - 1]
pruefe(tafel.rechts - tafel.links > tafel.unten - tafel.oben, `Das Tafelbild steht im Querformat (${b(tafel)} % breit, ${Math.round(tafel.unten - tafel.oben)} % hoch)`)

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDas Tafelbild bekommt seine eigene Querformat-Seite. Dateien in ${out}`)
