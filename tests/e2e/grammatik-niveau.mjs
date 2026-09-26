// Wache: Das GER-Niveau folgt dem Jahrgang, und die Grammatikthemen passen dazu – OHNE KI
// (vorher: npm run build). Aufruf: node tests/e2e/grammatik-niveau.mjs <Ausgabeordner>
//
// Befund der Lehrkraft vom 26.09.2026: Im Grammatiktest blieb das Niveau beim Wechsel des
// Jahrgangs stehen (ein neuer Test begann immer mit A2), und bei A1 in Klasse 5 bot die Liste
// „Geprüfte Formen" Themen mit „A2/B1" an. Geprüft in Grammatiktest, Arbeitsblatt und
// Klassenarbeit. Bildschirmfotos: grammatik-niveau-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/grammatik-niveau')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-niveau-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})

const sichtbar = (loc) => loc.filter({ visible: true })
const feld = (name) => sichtbar(page.getByLabel(name, { exact: true })).first()
const wert = async (name) => (await feld(name).inputValue()).trim()
const waehle = async (name, option) => {
  await feld(name).click()
  await sichtbar(page.getByRole('option', { name: option, exact: true }))
    .first()
    .click()
  await page.waitForTimeout(400)
}
/** GER-Kennzeichen der angebotenen Grammatikthemen (ohne „Alle Themen des Fachs") */
const themenNiveaus = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.mantine-Checkbox-root')]
      .filter((c) => c.offsetParent)
      .map((c) => c.querySelector('.mantine-Badge-root')?.textContent ?? '')
      .filter(Boolean)
  )
const ueberA1 = (liste) => liste.filter((l) => /^(A2|B1|B2)/.test(l))

try {
  await warteAufOberflaeche(page)

  // ---------- Grammatiktest
  console.log('\nGrammatiktest')
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(900)
  const start = await wert('Jahrgang')
  pruefe((await wert('Sprachniveau (GER)')) === 'A2' && start === 'Klasse 7', `Neuer Test: ${start} → Niveau ${await wert('Sprachniveau (GER)')} (Tabelle: A2)`)
  await waehle('Jahrgang', 'Klasse 5')
  pruefe((await wert('Sprachniveau (GER)')) === 'A1', `Klasse 5: Niveau folgt → ${await wert('Sprachniveau (GER)')}`)
  const k5 = await themenNiveaus()
  pruefe(k5.length > 5 && ueberA1(k5).length === 0, `Klasse 5, A1: ${k5.length} Themen, keins über A1 (${[...new Set(k5)].join(', ')})`)
  await page.screenshot({ path: join(out, 'grammatik-niveau-klasse5.png') })
  await waehle('Jahrgang', 'Klasse 9')
  pruefe((await wert('Sprachniveau (GER)')) === 'B1', `Klasse 9: Niveau → ${await wert('Sprachniveau (GER)')}`)
  // Von Hand zurück auf A1: die Liste folgt dem gewählten Niveau
  await waehle('Sprachniveau (GER)', 'A1')
  await waehle('Jahrgang', 'Klasse 5')
  pruefe(ueberA1(await themenNiveaus()).length === 0, 'Nach dem Zurückwechseln wieder keine Themen über A1')
  await waehle('Fach', 'Französisch')
  pruefe((await wert('Sprachniveau (GER)')) !== '', `Fachwechsel zu Französisch (2. Fremdsprache, Klasse 5): Niveau ${await wert('Sprachniveau (GER)')}`)
  await waehle('Jahrgang', 'Klasse 6')
  pruefe((await wert('Sprachniveau (GER)')) === 'A1', `Französisch Klasse 6 (1. Lernjahr): ${await wert('Sprachniveau (GER)')}`)
  const fr = await themenNiveaus()
  pruefe(ueberA1(fr).length === 0, `Französisch, A1: keine Themen über A1 (${[...new Set(fr)].join(', ')})`)

  // ---------- Arbeitsblatt (Englisch)
  console.log('\nArbeitsblatt')
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(900)
  await waehle('Fach', 'Englisch')
  await waehle('Jahrgang', 'Klasse 5')
  pruefe((await wert('Sprachniveau (GER)')) === 'A1', `Arbeitsblatt Klasse 5: ${await wert('Sprachniveau (GER)')}`)
  await waehle('Jahrgang', 'Klasse 8')
  pruefe((await wert('Sprachniveau (GER)')) === 'A2+', `Arbeitsblatt Klasse 8: ${await wert('Sprachniveau (GER)')}`)

  // ---------- Klassenarbeit (Englisch)
  console.log('\nKlassenarbeit')
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')
  await waehle('Jahrgang', 'Klasse 5')
  pruefe((await wert('Sprachniveau (GER)')) === 'A1', `Klassenarbeit Klasse 5: ${await wert('Sprachniveau (GER)')}`)
  await waehle('Sprachniveau (GER)', 'B2')
  // Land wechseln (Schulangabe aufklappen): das Niveau zieht wieder mit
  const aendern = sichtbar(page.getByRole('button', { name: /ändern/ }))
  if (await aendern.count()) await aendern.first().click()
  await waehle('Bundesland', 'Bayern')
  const by = await wert('Sprachniveau (GER)')
  pruefe(by !== 'B2', `Landeswechsel: Niveau zieht mit (Bayern, Klasse 5: ${by})`)
  await page.screenshot({ path: join(out, 'grammatik-niveau-klassenarbeit.png') })
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'grammatik-niveau-fehler.png') }).catch(() => undefined)
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

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
