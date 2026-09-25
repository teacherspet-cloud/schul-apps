// Wache: „Neu anfangen“ muss in jedem Programm ein benutzbares Formular hinterlassen – OHNE KI.
// Aufruf: node tests/e2e/neu-anfangen.mjs
//
// Anlass: Im Programm „Klassenarbeiten“ hinterließ der Knopf „Neue Klassenarbeit“ einen leeren
// Bildschirm. Der Effekt, der eine frische Arbeit anlegt, lief nur einmal beim Öffnen des
// Moduls; nach dem Verwerfen legte niemand eine neue an. Das Arbeitsblatt machte es seit jeher
// richtig – derselbe Fehler kann jederzeit in einem anderen Modul entstehen, deshalb prüft
// diese Wache alle auf einmal.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const userData = mkdtempSync(join(tmpdir(), 'schulapps-neu-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

/** Sichtbare Beschriftungen der Eingabefelder – das Maß dafür, ob ein Formular da ist. */
const felder = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('label')]
      .filter((l) => l.offsetParent)
      .map((l) => l.textContent.trim())
      .filter(Boolean)
  )

const module = [
  { icon: 'Arbeitsblatt', knopf: 'Neues Arbeitsblatt', erwartet: 'Thema' },
  { icon: 'Klassenarbeiten', knopf: 'Neue Klassenarbeit', erwartet: 'Thema' },
  { icon: 'Grammatiktest', knopf: 'Neuer Test', erwartet: 'Jahrgang' },
  { icon: 'Vokabeltest', knopf: 'Neuer Vokabeltest', erwartet: null }
]

const problems = []
for (const m of module) {
  const tab = page.locator(`[aria-label="${m.icon}"]`)
  if (!(await tab.count())) {
    console.log(`  ?  ${m.icon}: nicht gefunden – übersprungen`)
    continue
  }
  await tab.click()
  await page.waitForTimeout(900)
  const vorher = await felder()

  const knopf = page.getByRole('button', { name: m.knopf }).filter({ visible: true }).first()
  if (!(await knopf.count())) {
    console.log(`  ?  ${m.icon}: „${m.knopf}“ nicht sichtbar – übersprungen`)
    continue
  }
  await knopf.click()
  await page.waitForTimeout(1500)
  const nachher = await felder()

  // Der Kern: Nach dem Neuanfang darf nicht weniger dastehen als vorher – und nichts Leeres.
  const ok = nachher.length > 0 && (m.erwartet === null || nachher.some((f) => f.includes(m.erwartet)))
  console.log(`  ${ok ? 'ok ' : '!! '} ${m.icon}: ${vorher.length} Felder vorher, ${nachher.length} nachher`)
  if (!ok) problems.push(`${m.icon}: Nach „${m.knopf}“ steht kein benutzbares Formular da (${nachher.length} Felder)`)
}

const react = errors.filter((e) => /Maximum update depth|error #185/i.test(e))
if (react.length) problems.push(`Endlosschleife beim Rendern: ${react[0].slice(0, 120)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nJedes Programm lässt sich neu anfangen.')
