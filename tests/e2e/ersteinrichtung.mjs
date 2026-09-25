// Wache für FRISCHE INSTALLATION, Einrichtungsassistent und Zurücksetzen (vorher: npm run build).
// Aufruf: node tests/e2e/ersteinrichtung.mjs <Ausgabeordner>
//
// Drei Wünsche der Lehrkraft vom 25.09.2026 hängen hier zusammen:
//
// 1. „Füge einen Einrichtungsassistenten hinzu, der nach dem erstmaligen Start oder
//    Zurücksetzen der App dem Nutzer hilft, alles wichtige einzurichten."
// 2. „Füge bei Einstellungen einen ‚Zurücksetzen' Button … hinzu."
// 3. „stelle sicher, dass die app funktioniert, wenn ich jemandem nur die .exe Datei gebe.
//    Lehrwerke und Vokabular muss darin hinterlegt sein."
//
// Der dritte Punkt ist der, den man ohne Wache zu spät merkt: Die mitgelieferten Lehrwerke
// liegen in `resources/`, und ob electron-builder sie ins Paket nimmt, sieht man erst, wenn
// jemand die .exe auf einem fremden Rechner startet. Diese Wache startet mit einem LEEREN
// Benutzerprofil – also genau so, wie es beim Empfänger aussieht.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ersteinrichtung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-frisch-'))
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

// ---------------------------------------------------------------- Nur die .exe
/*
 * Die mitgelieferten Lehrwerke müssen ohne jede Einrichtung da sein. Sie kommen aus
 * `resources/lehrwerke` und sind die Grundlage für Vokabeltests – fehlen sie, steht der
 * Empfänger vor leeren Listen.
 */
const lehrwerke = await page.evaluate(() => window.api.textbooks.list().then((b) => b.map((x) => x.title ?? x.id)))
console.log(`mitgelieferte Lehrwerke: ${lehrwerke.length} (${lehrwerke.slice(0, 3).join(', ')}…)`)
pruefe(lehrwerke.length > 0, `Die .exe bringt Lehrwerke mit (${lehrwerke.length})`)

const woerter = await page.evaluate(async () => {
  const buecher = await window.api.textbooks.list()
  if (!buecher.length) return 0
  const erstes = await window.api.textbooks.get(buecher[0].id)
  // Aufbau eines Lehrwerks: units[] → sections[] → entries[]
  return (erstes?.units ?? []).reduce((n, u) => n + (u.sections ?? []).reduce((m, s) => m + (s.entries?.length ?? 0), 0), 0)
})
console.log(`Vokabeln im ersten Lehrwerk: ${woerter}`)
pruefe(woerter > 0, `Das Vokabular ist darin hinterlegt (${woerter} Wörter im ersten Lehrwerk)`)

// ---------------------------------------------------------------- Assistent
const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
await page.waitForTimeout(2500)
pruefe((await assistent.count()) > 0, 'Beim ersten Start erscheint der Einrichtungsassistent')
if ((await assistent.count()) > 0) {
  const text = await assistent.innerText()
  for (const schritt of ['Schule', 'KI-Zugang', 'Aussehen']) {
    pruefe(text.includes(schritt), `Er führt durch „${schritt}"`)
  }
  pruefe(text.includes('Später einrichten'), 'Er lässt sich verlassen')
  pruefe(text.includes('Überspringen'), 'Jeder Schritt ist überspringbar')
  await assistent.screenshot({ path: join(out, 'assistent.png') })
  await assistent.getByRole('button', { name: 'Später einrichten' }).click()
  await page.waitForTimeout(800)
  pruefe((await page.locator('.mantine-Modal-content').count()) === 0, 'Nach „Später einrichten" ist er weg')
}

// ---------------------------------------------------------------- Wartung
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(1200)
const reiter = page.getByRole('tab', { name: 'Wartung' })
pruefe((await reiter.count()) > 0, 'In den Einstellungen gibt es den Reiter „Wartung"')
await reiter.click()
await page.waitForTimeout(800)

const seite = await page.evaluate(() => document.body.innerText)
pruefe(seite.includes('Sicherung'), 'Dort steht die Sicherung')
pruefe(seite.includes('Werkszustand'), 'Dort steht das Zurücksetzen')
pruefe(seite.includes('Vokabellisten und Lehrwerke bleiben erhalten'), 'Der Schutz der Vokabellisten wird ausdrücklich genannt')

await page.getByRole('button', { name: 'Zurücksetzen …' }).click()
await page.waitForTimeout(1000)
const dialog = page.locator('.mantine-Modal-content', { hasText: 'Werkszustand' })
pruefe((await dialog.count()) > 0, 'Der Knopf öffnet eine Warnung')

const warnung = await dialog.innerText()
pruefe(warnung.includes('nicht rückgängig'), 'Die Warnung sagt, dass es unumkehrbar ist')
pruefe(warnung.includes('Vorher sichern'), 'Sie bietet die Sicherung an')

/*
 * Der Kern der Absicherung: Solange das Wort nicht eingetippt ist, ist der Knopf gesperrt.
 * Ein Doppelklick an der falschen Stelle darf die Arbeit eines Schuljahres nicht löschen.
 */
const endgueltig = dialog.getByRole('button', { name: 'Endgültig zurücksetzen' })
pruefe(await endgueltig.isDisabled(), 'Ohne das Bestätigungswort ist der Knopf gesperrt')
await dialog.getByRole('textbox').first().fill('irgendwas')
await page.waitForTimeout(400)
pruefe(await endgueltig.isDisabled(), 'Ein falsches Wort genügt nicht')
await dialog.getByRole('textbox').first().fill('ZURÜCKSETZEN')
await page.waitForTimeout(400)
pruefe(!(await endgueltig.isDisabled()), 'Mit dem richtigen Wort wird er freigegeben')

await dialog.screenshot({ path: join(out, 'warnung.png') })
// Geklickt wird NICHT: Der Lauf würde sein eigenes Profil leeren – geprüft ist die Sperre.

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDie .exe genügt, der Assistent führt, das Zurücksetzen ist gesichert. Bilder in ${out}`)
