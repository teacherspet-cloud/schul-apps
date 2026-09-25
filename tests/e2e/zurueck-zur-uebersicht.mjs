// Wache: Aus geöffnetem Material zurück zur Übersicht – in JEDEM Programm (vorher: npm run build).
// Aufruf: node tests/e2e/zurueck-zur-uebersicht.mjs <Ausgabeordner>
//
// Gemeldet von der Lehrkraft (24.09.2026): „Man kann geöffnetes erstelltes material etc.
// nicht schließen, um zum anfangsbildschirm zum öffnen erstellten materials zu gelangen."
//
// Nachgesehen: Lernzielkontrolle und Grammatiktest hatten oben einen beschrifteten Knopf,
// das Arbeitsblatt nur ein kleines Ordnersymbol tief in der Editorleiste, die Klassenarbeit
// nur innerhalb der Schritte – und der Vokabeltest gar keinen.
//
// Geprüft wird deshalb nicht „irgendwo gibt es einen Weg", sondern: In jedem Programm steht
// ein sichtbarer, BESCHRIFTETER Knopf, und er öffnet wirklich die Übersicht.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/zurueck-zur-uebersicht')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-zurueck-'))
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

/** Alle sichtbaren, beschrifteten Knöpfe der obersten Leiste. */
const knoepfe = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.app-toolbar button')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => b.textContent?.trim() ?? '')
      .filter(Boolean)
  )

const faelle = [
  { modul: 'Arbeitsblatt', aufbau: () => window.__selftest.wsGeteilteAufgabe(0), knopf: 'Meine Arbeitsblätter' },
  { modul: 'Klassenarbeiten', aufbau: () => window.__selftest.examSheet?.(), knopf: 'Meine Klassenarbeiten' },
  { modul: 'Vokabeltest', aufbau: () => window.__selftest.vtLatein(), knopf: 'Meine Vokabeltests' },
  { modul: 'Lernzielkontrolle', aufbau: () => window.__selftest.lzkSheet?.(), knopf: 'Meine Lernzielkontrollen' },
  { modul: 'Grammatiktest', aufbau: () => window.__selftest.gtestSheet?.(), knopf: 'Meine Grammatiktests' }
]

for (const { modul, aufbau, knopf } of faelle) {
  await page.click(`[aria-label="${modul}"]`)
  await page.waitForTimeout(600)
  // Material öffnen – erst dann stellt sich die Frage, wie man wieder herauskommt
  await page.evaluate(aufbau).catch(() => undefined)
  await page.waitForTimeout(1800)
  const sichtbar = await knoepfe()
  pruefe(sichtbar.includes(knopf), `${modul}: „${knopf}" steht oben (gefunden: ${sichtbar.join(' · ') || 'nichts'})`)
  if (!sichtbar.includes(knopf)) continue

  // Und er muss auch wirklich zur Übersicht führen
  await page.evaluate((k) => {
    const b = [...document.querySelectorAll('.app-toolbar button')].find((x) => x.textContent?.trim() === k)
    b?.click()
  }, knopf)
  await page.waitForTimeout(1500)
  const uebersicht = await page.evaluate(
    () => document.body.textContent?.includes('Zuletzt bearbeitet') || /Meine |Gespeicherte|Noch nichts gespeichert/.test(document.body.textContent ?? '')
  )
  pruefe(uebersicht, `${modul}: Der Knopf öffnet die Übersicht`)
  await page.screenshot({ path: join(out, `${modul.toLowerCase()}.png`) })
  // Manche Programme zeigen die Übersicht als Fenster – es muss zu, sonst blockiert es den nächsten Klick
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nAus jedem Programm führt ein beschrifteter Knopf zurück zur Übersicht. Bilder in ${out}`)
