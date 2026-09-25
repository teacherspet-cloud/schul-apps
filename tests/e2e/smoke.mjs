// Oberflächentest der gebauten App (vorher: npm run build).
// Aufruf: node tests/e2e/smoke.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { warteAufOberflaeche } from './warten.mjs'

const outDir = resolve(process.argv[2] ?? 'test-results')
mkdirSync(outDir, { recursive: true })
const fixture = resolve('tests/fixtures/beispiel.vokabeltest')
const shot = (page, name) => page.screenshot({ path: join(outDir, `${name}.png`) })

/** Temporäre Datenordner – am Ende weggeräumt, damit nichts liegen bleibt */
const datenordner = []

async function launch(args = []) {
  // Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
  // Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
  const userData = mkdtempSync(join(tmpdir(), 'schulapps-smoke-'))
  datenordner.push(userData)
  const app = await electron.launch({ args: ['.', ...args, `--user-data-dir=${userData}`] })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  // Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
  await warteAufOberflaeche(page)
  return { app, page, errors }
}

// 1) Start, Vokabeln einfügen, Testeinstellungen
{
  const { app, page, errors } = await launch()
  await shot(page, '1-start')
  // Über die Leiste: Auf der Startseite steht „Vokabeltest" inzwischen auch in Kacheltexten und der Materialliste
  await page.click('[aria-label="Vokabeltest"]')
  await page.click('button:has-text("Tabelle einfügen")')
  await page.getByRole('dialog').locator('textarea').fill('ladder\tLeiter\nto explore\terkunden\ncastle\tBurg\nbrave\tmutig\numbrella\tRegenschirm')
  await page.click('button:has-text("Übernehmen")')
  await page.click('button:has-text("Bisherige Liste ersetzen")')
  await page.waitForSelector('text=5 Vokabeln')
  // Eingefügte Vokabeln sind zunächst unmarkiert – erst markieren, dann weiter
  await page.click('button:has-text("Alle markieren")')
  await shot(page, '2-vokabeln')
  await page.click('button:has-text("Weiter zu den Testeinstellungen")')
  await page.waitForSelector('text=Aufgabentypen')
  await page.waitForTimeout(500)
  await shot(page, '3-einstellungen')
  /*
   * Bundesland und Schulform stehen eingeklappt, solange sie den Einstellungen entsprechen.
   * Erst „ändern" klappt sie auf – genau dieser Weg wird hier mitgeprüft, denn er ist für
   * eine Lehrkraft, die für eine andere Lerngruppe etwas erstellt, der einzige.
   */
  const aendern = page.getByRole('button', { name: 'ändern' }).first()
  if (await aendern.count()) await aendern.click()
  await page.getByLabel('Bundesland').first().waitFor()
  await page.getByLabel('Bundesland').first().click()
  await page.getByRole('option', { name: 'Bayern' }).waitFor()
  await shot(page, '3b-bundesland')
  await page.getByRole('option', { name: 'Bayern' }).click()
  await page.getByLabel('Schulform').first().click()
  await page.getByRole('option', { name: 'Realschule' }).click()
  await page.waitForTimeout(300)
  // Grammatiktest: neues Programm, öffnet sich mit der Themenauswahl
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForSelector('text=Geprüfte Formen')
  await page.waitForTimeout(600)
  if (!(await page.getByText('Anlage des Tests').count())) throw new Error('Im Grammatiktest fehlt der Abschnitt zur Anlage')
  if (!(await page.getByText(/nicht isoliert bewertet/).count())) throw new Error('Der Hinweis zur Bewertung in Niedersachsen fehlt')
  // Speichern: über die Programmschnittstelle ablegen, wieder auslesen und löschen.
  // Bewusst ohne KI – der Ablauf soll geprüft werden, nicht das Erzeugen von Aufgaben.
  const roundTrip = await page.evaluate(async () => {
    const payload = { version: 1, meta: { subjectLabel: 'Englisch', grade: 7 }, blocks: [], createdAt: '2026-09-22' }
    const stats = { subjectLabel: 'Englisch', grade: 7, topics: 'Einfache Vergangenheit', taskCount: 3, points: 20, minutes: 20, graded: false }
    const saved = await window.api.grammarTests.save({ id: 'e2e-probe-test', name: 'Probelauf', stats, payload })
    const list = await window.api.grammarTests.list()
    const got = await window.api.grammarTests.get('e2e-probe-test')
    const after = await window.api.grammarTests.delete('e2e-probe-test')
    return {
      name: saved.name,
      listed: list.some((t) => t.id === 'e2e-probe-test'),
      topics: got.topics,
      blocksBack: Array.isArray((got.payload || {}).blocks),
      goneAfterDelete: !after.some((t) => t.id === 'e2e-probe-test')
    }
  })
  if (!roundTrip.listed) throw new Error('Der gespeicherte Grammatiktest erscheint nicht in der Übersicht')
  if (roundTrip.topics !== 'Einfache Vergangenheit') throw new Error('Die geprüften Formen gehen beim Speichern verloren')
  if (!roundTrip.blocksBack) throw new Error('Die Aufgaben kommen beim Öffnen nicht zurück')
  if (!roundTrip.goneAfterDelete) throw new Error('Der gelöschte Test steht weiterhin in der Übersicht')
  console.log('Grammatiktest gespeichert, gelesen und gelöscht:', roundTrip.name)

  if (!(await page.getByRole('button', { name: 'Meine Tests' }).count())) throw new Error('Der Zugang zur Test-Übersicht fehlt')

  await shot(page, '5-grammatiktest')
  console.log('Grammatiktest geöffnet, Themenauswahl und Landeshinweis vorhanden')

  await page.click('[aria-label="Einstellungen"]')
  // Die Einstellungen sind in Reiter gegliedert – der KI-Zugang hat einen eigenen
  await page.getByRole('tab', { name: 'KI-Zugang' }).click()
  await page.waitForSelector('text=Künstliche Intelligenz')
  // Die GER-Tabelle gehört nicht mehr in die App-Einstellungen (Niveau wird im Programm gewählt)
  if (await page.getByText('Jahrgang → GER-Niveau').count()) throw new Error('GER-Tabelle ist noch in den Einstellungen')
  // Piktogramm-Werkstatt: Liste mit allen Symbolen und je ein Knopf zum Neugestalten
  await page.getByRole('tab', { name: 'Material' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Gestalten' }).first().click()
  await page.waitForSelector('text=Piktogramme gestalten')
  const neu = page.getByRole('button', { name: 'Partnerarbeit neu gestalten' })
  if (!(await neu.count())) throw new Error('In der Piktogramm-Werkstatt fehlt der Knopf zum Neugestalten')
  // Ohne eingerichtete Bild-KI ist er abgeschaltet und die Werkstatt erklärt, warum
  if (!(await page.getByText(/keine Bild-KI eingerichtet/).count())) throw new Error('Der Hinweis auf die fehlende Bild-KI fehlt')
  // Einblendung abwarten, sonst ist der Abzug halbdurchsichtig
  await page.waitForTimeout(900)
  const dialog = page.locator('.mantine-Modal-content').first()
  await dialog.screenshot({ path: join(outDir, '4b-piktogramme.png') })
  await page.getByRole('button', { name: 'Schließen' }).click()
  await page.waitForTimeout(200)
  console.log('Piktogramm-Werkstatt geöffnet, Symbole und Knöpfe vorhanden')

  await page.waitForTimeout(300)
  await shot(page, '4-app-einstellungen')
  console.log('Durchlauf 1 – Fehler in der Konsole:', errors.length ? errors : 'keine')
  await app.close()
}

// 2) Gespeicherten Test öffnen, bearbeiten, exportieren
{
  const { app, page, errors } = await launch([fixture])
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForSelector('.editor-sheet .vt-page')
  await shot(page, '5-editor')

  // Überschrift der ersten Aufgabe bearbeiten und rückgängig machen
  const title = page.locator('.editor-sheet .vt-block-title').first()
  await title.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' (edited)')
  await page.locator('.editor-sheet .vt-title').click()
  await page.waitForSelector('.editor-sheet >> text=(edited)')
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => !document.body.innerText.includes('(edited)'))

  await page.click('text=Lösungen >> nth=0')
  await page.waitForSelector('.editor-sheet .vt-key')
  await shot(page, '6-loesungen')

  // Speicherdialog im Main-Prozess ersetzen, damit der Export ohne Klick läuft
  const pdfPath = join(outDir, 'export.pdf')
  const docxPath = join(outDir, 'export.docx')
  await app.evaluate(
    ({ dialog }, paths) => {
      let n = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths[n++ % paths.length] })
    },
    [pdfPath, join(outDir, 'export-loesungen.pdf')]
  )
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  await page.click('button:has-text("Speichern …")')
  await page.waitForSelector('text=PDF gespeichert', { timeout: 60000 })

  await app.evaluate(
    ({ dialog }, paths) => {
      let n = 0
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths[n++ % paths.length] })
    },
    [docxPath, join(outDir, 'export-loesungen.docx')]
  )
  await page.getByRole('button', { name: 'Word', exact: true }).click()
  await page.click('button:has-text("Speichern …")')
  await page.waitForSelector('text=Word-Dokument gespeichert', { timeout: 60000 })

  for (const f of [pdfPath, docxPath]) {
    console.log(f, existsSync(f) ? `${statSync(f).size} Bytes` : 'FEHLT')
  }
  console.log('Durchlauf 2 – Fehler in der Konsole:', errors.length ? errors : 'keine')
  await app.close()
}

for (const d of datenordner) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
