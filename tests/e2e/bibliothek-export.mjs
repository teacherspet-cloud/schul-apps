// Wache für Bibliotheken und Ausgabe (Paket 4) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/bibliothek-export.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Anlass (25.09.2026), Entscheidungen der Lehrkraft: Bibliotheken mit EINEM Einstieg,
// „Zurück zu ‚<Name>'", Suche und Duplizieren überall; Lernzielkontrolle, Grammatiktest und
// Klassenarbeit fragen beim Ausgeben nach den Lösungen (Vorgabe: als eigene Datei), mehrere
// Dateien gehen in EINEN gewählten Ordner.
//
// Geprüft wird:
//  1. Lernzielkontrolle und Grammatiktest: Bibliothek über den Leistenknopf, „Zurück zu …"
//     schließt sie und das Dokument bleibt offen; „Kopie anlegen" legt „… (Kopie)" an, ohne es
//     zu öffnen; die Suche liefert eine flache Trefferliste bzw. „Nichts gefunden".
//  2. Lernzielkontrolle „PDF": Lösungswahl mit Vorgabe „als eigene Datei"; einmal Ordner wählen
//     (Dialog im Hauptprozess ersetzt), Blatt und Lösungen landen dort; eine vorhandene Datei
//     gleichen Namens bleibt erhalten, die neue heißt „… (2)".
//  3. Lernzielkontrolle „Drucken" mit „Lösungen separat drucken": Druckvorschau mit eigenem
//     Lösungsteil und eigener Exemplarzahl (gedruckt wird nicht).
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/bibliothek-export')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-bibliothek-'))
const exportOrdner = mkdtempSync(join(tmpdir(), 'schulapps-export-'))

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
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
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const shot = (name) => page.screenshot({ path: join(shots, `paket4-${name}.png`) })
const sichtbar = (loc) => loc.filter({ visible: true })
const eintraege = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-bibliothek-eintrag]')]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => e.getAttribute('data-bibliothek-eintrag'))
  )

/** Alle zugeklappten Fächer und Bereiche aufklappen (Paket 12) */
async function allesAufklappen() {
  for (let i = 0; i < 12; i++) {
    const zu = sichtbar(page.getByRole('button', { name: /aufklappen$/ }))
    if (!(await zu.count())) return
    await zu.first().click()
    await page.waitForTimeout(250)
  }
}

/**
 * Bibliothek eines Programms durchgehen: öffnen, „Zurück zu", Kopie, Suche.
 * `name` ist der Name des offenen Dokuments, `leiste` die Beschriftung des Leistenknopfs.
 */
async function bibliothekPruefen(programm, leiste, name, suchwort) {
  console.log(`\n${programm}`)
  await sichtbar(page.getByRole('button', { name: leiste, exact: true })).click()
  await page.waitForTimeout(800)
  pruefe((await sichtbar(page.getByRole('heading', { name: leiste })).count()) === 1, `${programm}: Titel der Bibliothek gleich dem Leistenknopf („${leiste}")`)
  const zurueck = sichtbar(page.locator('[data-bibliothek-zurueck]'))
  pruefe((await zurueck.count()) === 1 && (await zurueck.innerText()).includes(name), `${programm}: „Zurück zu „${name}““ steht da`)

  // Seit Paket 12 stehen Fächer und Themenbereiche anfangs zugeklappt, und die Automatik sortiert
  // neue Materialien in Bereiche ein – für die Probe alles aufklappen
  await allesAufklappen()
  // Kopie anlegen: erscheint, wird nicht geöffnet
  const vorher = await eintraege()
  await sichtbar(page.getByRole('button', { name: `Weitere Aktionen für „${name}“` }))
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Kopie anlegen' }).click()
  await page.waitForTimeout(1200)
  await allesAufklappen()
  const nachher = await eintraege()
  pruefe(
    nachher.length === vorher.length + 1 && nachher.includes(`${name} (Kopie)`),
    `${programm}: „Kopie anlegen" legt „${name} (Kopie)" an (${nachher.join(' | ')})`
  )
  pruefe((await zurueck.innerText()).includes(`„${name}“`), `${programm}: Die Kopie wird nicht geöffnet – das Original bleibt offen`)
  await shot(`${programm.toLowerCase()}-kopie`)

  // Suche: flache Trefferliste
  const suche = sichtbar(page.getByRole('textbox', { name: `${leiste} durchsuchen` }))
  await suche.fill('Kopie')
  await page.waitForTimeout(300)
  const treffer = await eintraege()
  pruefe(treffer.length === 1 && treffer[0] === `${name} (Kopie)`, `${programm}: Suche „Kopie" findet genau die Kopie (${treffer.join(' | ')})`)
  await suche.fill(suchwort)
  await page.waitForTimeout(300)
  pruefe((await eintraege()).length === 2, `${programm}: Suche „${suchwort}" (Thema/Fach) findet Original und Kopie`)
  await suche.fill('xyzkeintreffer')
  await page.waitForTimeout(300)
  pruefe((await sichtbar(page.locator('[data-bibliothek-leer]')).innerText()).includes('Nichts gefunden'), `${programm}: Ohne Treffer ein Hinweis`)
  await shot(`${programm.toLowerCase()}-suche`)
  await suche.fill('')

  // Zurück: Bibliothek zu, Dokument noch offen
  await zurueck.click()
  await page.waitForTimeout(800)
  pruefe((await sichtbar(page.getByRole('button', { name: leiste, exact: true })).count()) === 1, `${programm}: „Zurück zu …" schließt die Bibliothek`)
}

try {
  // ---------- 1a) Lernzielkontrolle
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(800)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.evaluate(() => window.__selftest.lzkSpeichern('Prüflauf Potenzen'))
  await page.waitForTimeout(800)
  await bibliothekPruefen('Lernzielkontrolle', 'Meine Lernzielkontrollen', 'Prüflauf Potenzen', 'potenzgesetze mathe')

  // ---------- 1b) Grammatiktest
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(800)
  await page.evaluate(() => window.__selftest.grammarTestSheet())
  // Gesichert wird von selbst (1,5 s nach der letzten Änderung)
  await page.waitForTimeout(3000)
  await bibliothekPruefen('Grammatiktest', 'Meine Grammatiktests', 'Grammar test', 'englisch klasse 8')

  // ---------- 2) Lernzielkontrolle: PDF mit Lösungen als eigene Datei in EINEN Ordner
  console.log('\nAusgabe')
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(800)
  // Eine Datei gleichen Namens liegt schon im Ordner – sie darf nicht überschrieben werden
  writeFileSync(join(exportOrdner, 'Potenzgesetze.pdf'), 'alt')
  await app.evaluate(({ dialog }, ordner) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ordner] })
    // Käme doch ein Speichern-Dialog, wäre das der alte Weg – er wird abgebrochen und fällt auf
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
  }, exportOrdner)
  await sichtbar(page.getByRole('button', { name: 'PDF', exact: true })).click()
  await page.waitForTimeout(500)
  const dialog = page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' })
  pruefe(await dialog.getByRole('radio', { name: 'Lösungen als eigene Datei' }).isChecked(), 'Lösungswahl steht auf „als eigene Datei"')
  await shot('loesungsdialog')
  await dialog.getByRole('button', { name: 'Speichern …' }).click()
  // Gibt es schon (05.10.2026): Rückfrage – hier „Als neue Version speichern"
  const frage = page.locator('.mantine-Modal-content', { hasText: 'Datei gibt es schon' })
  pruefe(
    await frage.waitFor({ timeout: 60000 }).then(
      () => true,
      () => false
    ),
    'Rückfrage „Datei gibt es schon“ erscheint'
  )
  await shot('vorhanden-frage')
  await page.locator('[data-vorhanden="neu"]').click()
  await page.waitForSelector('text=PDF gespeichert', { timeout: 60000 })
  await shot('ordner-hinweis')
  const dateien = readdirSync(exportOrdner).sort()
  console.log('   Ordner:', dateien.join(', '))
  pruefe(dateien.includes('Potenzgesetze (2).pdf') && dateien.includes('Potenzgesetze - Lösungen.pdf'), 'Blatt und Lösungen liegen im gewählten Ordner')
  pruefe(
    existsSync(join(exportOrdner, 'Potenzgesetze.pdf')) && readdirSync(exportOrdner).length === 3,
    'Die vorhandene Datei bleibt erhalten, die neue heißt „… (2)"'
  )
  pruefe((await page.getByRole('button', { name: 'Ordner öffnen' }).count()) > 0, 'Der Hinweis bietet „Ordner öffnen" an')

  // ---------- 2b) Noch einmal – jetzt beide vorhanden: „Überschreiben" für alle weiteren Dateien
  await page.waitForTimeout(800)
  await sichtbar(page.getByRole('button', { name: 'PDF', exact: true })).click()
  await page.waitForTimeout(500)
  await page.locator('.mantine-Modal-content', { hasText: 'Als PDF speichern' }).getByRole('button', { name: 'Speichern …' }).click()
  await frage.waitFor({ timeout: 60000 })
  await frage.getByLabel('Für alle weiteren Dateien').check()
  await page.locator('[data-vorhanden="ersetzen"]').click()
  await page.waitForSelector('text=PDF gespeichert', { timeout: 60000 })
  await page.waitForTimeout(500)
  const nachher = readdirSync(exportOrdner).sort()
  console.log('   Ordner:', nachher.join(', '))
  pruefe(nachher.length === 3, `Überschreiben legt keine weiteren Dateien an (${nachher.length})`)
  pruefe(statSync(join(exportOrdner, 'Potenzgesetze.pdf')).size > 1000, 'Die alte Datei „Potenzgesetze.pdf" wurde durch das neue PDF ersetzt')
  pruefe((await frage.count()) === 0, 'Für die Lösungen wurde nicht noch einmal gefragt („Für alle weiteren Dateien")')

  // ---------- 3) Drucken mit „Lösungen separat drucken"
  await page.waitForTimeout(500)
  await sichtbar(page.getByRole('button', { name: 'Drucken', exact: true })).click()
  await page.waitForTimeout(500)
  const druck = page.locator('.mantine-Modal-content', { hasText: 'Weiter zur Druckvorschau' })
  const separat = druck.getByRole('radio', { name: 'Lösungen separat drucken' })
  pruefe((await separat.count()) === 1, 'Beim Drucken gibt es „Lösungen separat drucken"')
  pruefe(await separat.isChecked(), 'Die gemerkte Wahl („eigene Datei") gilt beim Drucken als „separat drucken"')
  await druck.getByRole('button', { name: 'Weiter zur Druckvorschau' }).click()
  await page.waitForSelector('[data-print-loesung="1"]', { timeout: 60000 })
  pruefe((await page.getByLabel('Exemplare Lösungen').count()) === 1, 'Die Druckvorschau hat eine eigene Exemplarzahl für die Lösungen')
  await shot('druckvorschau-loesungen')
  await page.locator('.pv-abbrechen').click()
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
  rmSync(exportOrdner, { recursive: true, force: true, maxRetries: 5 })
}

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
