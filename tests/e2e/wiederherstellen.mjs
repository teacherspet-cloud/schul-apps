// Wache für SICHERUNG EINLESEN (vorher: npm run build).
// Aufruf: node tests/e2e/wiederherstellen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): das Wiederherstellen nachholen, das beim Zurücksetzen auf
// „später" stand. Die Regeln (zusammenführen, Lehrwerke und Zugänge nie anfassen, fremde Dateien
// abweisen) prüft tests/wartung.test.ts. Hier: Ist der Weg durch die App verdrahtet – Knopf in
// „Wartung" und im Assistenten, Vorschau und Einlesen über die echten Aufrufe?
//
// Alles läuft in einem WEGWERF-Profil; das echte Profil bleibt unberührt.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/wiederherstellen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-wiederherstellen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page, 3, { assistent: true })

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

// ---------------------------------------------------------------- Assistent
const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
await page.waitForTimeout(2500)
pruefe((await assistent.getByRole('button', { name: 'Sicherung einlesen …' }).count()) === 1, 'Der Einrichtungsassistent bietet „Sicherung einlesen" an')
if (await assistent.count()) await assistent.getByRole('button', { name: 'Später einrichten' }).click()
await page.waitForTimeout(600)

// ---------------------------------------------------------------- Wartung
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(1000)
await page.getByRole('tab', { name: 'Wartung' }).click()
await page.waitForTimeout(600)
pruefe(
  (await page.getByRole('button', { name: 'Sicherung einlesen …' }).filter({ visible: true }).count()) === 1,
  'Im Reiter „Wartung" steht „Sicherung einlesen"'
)
await page.screenshot({ path: join(out, 'wartung.png') })

// ---------------------------------------------------------------- Aufrufe
/*
 * Der Dateidialog lässt sich nicht fernsteuern. Die Aufrufe dahinter schon: Sicherung erzeugen,
 * prüfen, einlesen – im Wegwerf-Profil mit einem echten Blatt.
 */
const ergebnis = await page.evaluate(async () => {
  const ws = { version: 1, meta: { title: 'Wache' }, sheets: [] }
  await window.api.worksheets?.save?.('wache-wiederherstellen', ws).catch(() => undefined)
  const { daten } = await window.api.wartung.sicherung()
  const vorschau = await window.api.wartung.pruefen(daten)
  let abgewiesen = ''
  try {
    await window.api.wartung.pruefen(new TextEncoder().encode('kein json'))
  } catch (e) {
    abgewiesen = String(e)
  }
  const eingelesen = await window.api.wartung.wiederherstellen(daten)
  return { vorschau, abgewiesen, eingelesen }
})
console.log(JSON.stringify(ergebnis).slice(0, 300))
pruefe(typeof ergebnis.vorschau.erstellt === 'string' && ergebnis.vorschau.erstellt.length > 0, 'Die Vorschau liest das Erstellungsdatum')
pruefe(ergebnis.abgewiesen.includes('keine Sicherung'), 'Eine fremde Datei wird abgewiesen')
pruefe(Array.isArray(ergebnis.eingelesen.wiederhergestellt), 'Das Einlesen läuft durch')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nSicherung einlesen ist verdrahtet. Bilder in ${out}`)
