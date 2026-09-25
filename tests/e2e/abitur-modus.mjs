// Wache für den ABITUR-MODUS in Schritt 1 (vorher: npm run build).
// Aufruf: node tests/e2e/abitur-modus.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (24.09.2026): „Passe hierfür bei der Auswahl des 12./13. Jahrgangs per
// Knopfdruck unter Kompetenzniveau das Menü ‚Thema & Lerngruppe' grundlegend so daran an,
// dass man Vorgaben für an Abituraufgaben angelehnte Übungsaufgaben und Übungsklausuren
// entwerfen lassen kann."
//
// Geprüft wird die SICHTBARKEIT: Der Schalter darf erst ab Jahrgang 12 erscheinen, und erst
// nach dem Einschalten dürfen die Abitur-Vorgaben dastehen. Ein Schalter, der in Klasse 7
// auftaucht, verwirrt mehr als er nützt – und einer, der in Jahrgang 12 fehlt, ist für die
// Lehrkraft nicht von einem Fehler zu unterscheiden.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/abitur-modus')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-abitur-'))
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

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(1200)

/** Sichtbarer Text der ganzen Seite. */
const seitentext = () => page.evaluate(() => document.body.innerText)

const schalter = () => page.locator('label', { hasText: 'An Abituraufgaben angelehnt' }).first()

const vorher = await seitentext()
pruefe(!vorher.includes('An Abituraufgaben angelehnt'), 'Im voreingestellten Jahrgang gibt es den Schalter nicht')

/*
 * Jahrgang 12 waehlen.
 *
 * Der Eintrag muss erst ins Sichtfeld gerollt werden: Die Liste reicht von Klasse 5 bis 13
 * und scrollt, der gesuchte Eintrag ist zwar vorhanden, aber nicht sichtbar – und auf etwas
 * Unsichtbares klickt Playwright zu Recht nicht. Das Feld selbst ist schreibgeschuetzt, es
 * laesst sich also auch nichts hineintippen.
 */
const jahrgang = page.locator('.mantine-InputWrapper-root', { hasText: 'Jahrgang' }).locator('input').first()
await jahrgang.click()
await page.waitForTimeout(400)
const option = page.locator('[role="option"]', { hasText: 'Klasse 12' }).first()
pruefe((await option.count()) > 0, 'Klasse 12 ist am Gymnasium waehlbar')
await option.scrollIntoViewIfNeeded()
await option.click()
await page.waitForTimeout(800)
pruefe((await jahrgang.inputValue()) === 'Klasse 12', 'Jahrgang 12 ist eingestellt')

const mit12 = await seitentext()
pruefe(mit12.includes('An Abituraufgaben angelehnt'), 'Ab Jahrgang 12 erscheint der Schalter')
pruefe(!mit12.includes('Abiturbezogene Vorgaben'), 'Die Vorgaben stehen erst da, wenn der Schalter an ist')

await schalter().click()
await page.waitForTimeout(600)
const an = await seitentext()
pruefe(an.includes('Abiturbezogene Vorgaben'), 'Nach dem Einschalten erscheinen die Vorgaben')
pruefe(an.includes('Anforderungsniveau'), 'Das Anforderungsniveau ist wählbar')
pruefe(an.includes('Aufgabenart'), 'Die Aufgabenart ist wählbar')
pruefe(an.includes('Als Übungsklausur'), 'Übungsaufgabe oder Übungsklausur ist wählbar')
/*
 * Das Wichtigste: Die App beruft sich auf Quellen und sagt, was daran NICHT amtlich
 * vorgegeben ist. Ohne diesen Hinweis hielte die Lehrkraft die Richtwerte für Vorschriften.
 */
pruefe(an.includes('Worauf sich das stützt'), 'Die Grundlage der Vorgaben steht dabei')
pruefe(an.includes('keine amtliche Prüfungsaufgabe'), 'Es steht dabei, dass es eine Übung ist')

await page.screenshot({ path: join(out, 'abitur.png'), fullPage: true })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDer Abitur-Modus erscheint an der richtigen Stelle. Bild in ${out}`)
