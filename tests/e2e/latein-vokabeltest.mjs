// Wache für den LATEIN-Vokabeltest – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/latein-vokabeltest.mjs <Ausgabeordner>
//
// Latein arbeitet anders als die modernen Fremdsprachen (Recherche 24.09.2026, Belege in
// `didactics/latein.ts`): Zu jeder Vokabel gehört ihre Nennform, abgefragt wird nur
// Lateinisch → Deutsch, und Sprech- oder Schreibformate gibt es nicht.
//
// Geprüft wird am gesetzten Blatt, weil sich nur dort zeigt, ob die drei Spalten
// „Vokabel | Form | Bedeutungen" wirklich stehen – im Modell sähe alles gleich aus.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/latein-vokabeltest')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-latein-'))
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

await page.click('[aria-label="Vokabeltest"]')
await page.waitForTimeout(800)
const stand = await page.evaluate(() => window.__selftest.vtLatein())
await page.waitForTimeout(2500)

console.log(`Nennform-Zeilen im Modell: ${stand.zeilen}`)
pruefe(stand.zeilen === 5, `Alle fünf Vokabeln stehen im Block (${stand.zeilen})`)

/** Was auf dem gesetzten Blatt steht. */
const tabelle = async () =>
  page.evaluate(() =>
    // Der Messbereich der App enthält dieselbe Tabelle noch einmal – er zählt nicht mit
    [...document.querySelectorAll('.vt-latin-forms tr')]
      .filter((tr) => !tr.closest('[aria-hidden="true"]') && tr.getBoundingClientRect().height > 0)
      .map((tr) => ({
        wort: tr.querySelector('.vt-latin-term')?.textContent?.trim() ?? '',
        ansage: tr.querySelector('.vt-latin-label')?.textContent?.trim() ?? '',
        leer: tr.querySelectorAll('.vt-latin-blank').length,
        loesung: [...tr.querySelectorAll('.vt-key-text')].map((e) => e.textContent?.trim() ?? '')
      }))
  )

const schueler = await tabelle()
console.log('Schülerblatt:')
for (const z of schueler) console.log(`   ${z.wort.padEnd(12)} | ${z.ansage.padEnd(18)} | ${z.leer} Lücken`)

pruefe(schueler.length === 5, `Die Tabelle hat fünf Zeilen (${schueler.length})`)
/*
 * Die Ansage in der mittleren Spalte ist der Kern: Ohne sie wäre bei „servus" unklar, ob
 * Genitiv oder Akkusativ verlangt ist – beides steht je nach Lehrwerk in der Vokabelliste.
 */
const erwartet = {
  servus: 'Genitiv, Genus:',
  cantāre: 'Stammformen:',
  praeclārus: 'f., n.:',
  cum: 'mit Kasus:',
  saepe: '—'
}
for (const [wort, ansage] of Object.entries(erwartet)) {
  const zeile = schueler.find((z) => z.wort === wort)
  pruefe(zeile?.ansage === ansage, `„${wort}" verlangt „${ansage}" (gefunden: „${zeile?.ansage ?? 'Zeile fehlt'}")`)
}
pruefe(
  schueler.every((z) => z.leer > 0 && z.loesung.length === 0),
  'Auf dem Schülerblatt sind Form und Bedeutungen leer'
)
// Wörter ohne Nennform bekommen nur EINE Lücke – im Mustertest steht dort ein Strich
pruefe(schueler.find((z) => z.wort === 'saepe')?.leer === 1, 'Bei „saepe" gibt es keine Lücke für eine Form, die es nicht gibt')

// ---------------------------------------------------------------- Lösungsansicht
await page.evaluate(() => {
  const el = [...document.querySelectorAll('label, button')].find((x) => x.textContent?.trim() === 'Lösungen')
  el?.click()
})
await page.waitForTimeout(1800)
const loesung = await tabelle()
const servus = loesung.find((z) => z.wort === 'servus')
console.log(`Lösung zu „servus": ${JSON.stringify(servus?.loesung ?? [])}`)
pruefe(servus?.loesung.includes('servī m.') === true, 'Im Lösungsteil steht die Nennform')
pruefe(servus?.loesung.some((t) => t.includes('Sklave')) === true, 'Im Lösungsteil stehen die Bedeutungen')
pruefe(
  loesung.every((z) => z.leer === 0),
  'In der Lösungsansicht bleiben keine Lücken'
)

await page.screenshot({ path: join(out, 'latein.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDer Latein-Vokabeltest fragt Nennform und Bedeutungen ab. Bilder in ${out}`)
