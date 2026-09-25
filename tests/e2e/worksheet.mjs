// Oberflächentest Arbeitsblatt (vorher: npm run build). Aufruf: node tests/e2e/worksheet.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { tmpdir } from 'os'
import { oeffneLerngruppe, weitereOptionen } from './warten.mjs'
import { warteAufOberflaeche } from './warten.mjs'
const out = resolve(process.argv[2] ?? 'test-results/arbeitsblatt')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
// Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-worksheet-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.setViewportSize({ width: 1500, height: 1000 })
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)
try {
  await page.click('[aria-label="Arbeitsblatt"]')
  // Sind schon Arbeitsblätter gespeichert, öffnet sich die Bibliothek – dann neu anfangen
  const neu = page.getByRole('button', { name: 'Neues Arbeitsblatt' })
  if (await neu.isVisible({ timeout: 3000 }).catch(() => false)) await neu.click()
  await page.waitForSelector('text=Thema & Lerngruppe')
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, '1-thema.png') })
  // Bundesland Brandenburg, Oberschule → Jahrgang ab 7
  // Module bleiben gemountet: Nur das sichtbare Feld dieses Programms ansprechen
  const field = (name) => page.getByLabel(name).filter({ visible: true }).first()
  await oeffneLerngruppe(page)
  await field('Bundesland').click()
  await page.getByRole('option', { name: 'Brandenburg' }).click()
  await field('Schulform').click()
  await page.getByRole('option', { name: 'Oberschule' }).click()
  await field('Jahrgang').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, '2-jahrgang-bb.png') })
  await page.keyboard.press('Escape')

  // „Neues Arbeitsblatt“ in der Kopfzeile: beginnt von vorn, ohne Umweg über die Bibliothek
  await page.getByRole('button', { name: 'Neues Arbeitsblatt' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(600)
  await oeffneLerngruppe(page)
  const nachNeu = await field('Bundesland').inputValue()
  if (!nachNeu.trim()) throw new Error('Nach „Neues Arbeitsblatt“ muss wieder ein leeres Blatt mit Vorgaben bereitstehen')
  console.log('„Neues Arbeitsblatt“ beginnt von vorn:', nachNeu)

  // Fremdsprache: Die Hörtext-Auswahl erscheint in „Art & Umfang“
  await field('Fach').click()
  await page.getByRole('option', { name: 'Englisch', exact: true }).click()
  await page.waitForTimeout(500)
  const hoertext = page
    .getByRole('checkbox', { name: /Hörtext von der KI schreiben lassen/ })
    .filter({ visible: true })
    .first()
  if (!(await hoertext.isVisible())) throw new Error('Für Englisch muss die Hörtext-Auswahl erscheinen')
  // Das SKRIPT schreibt die Text-KI – dafür braucht es keine Stimme. Nur das Vertonen
  // verlangt einen ElevenLabs-Schlüssel; genau das versprechen auch die Einstellungen.
  if (!(await hoertext.isEnabled())) throw new Error('Der Hörtext muss auch ohne Stimme wählbar sein – das Skript schreibt die Text-KI')
  if (
    !(await page
      .getByText(/bleibt das Skript als Lesetext/)
      .first()
      .isVisible())
  )
    throw new Error('Der Hinweis auf das Skript ohne Vertonung fehlt')
  await hoertext.check()
  await page.waitForTimeout(300)
  if (!(await page.getByText('Hörtextsorte').count())) throw new Error('Nach dem Anhaken müssen die Hörtext-Einstellungen erscheinen')
  await hoertext.uncheck()
  console.log('Hörtext-Auswahl ist auch ohne Stimme nutzbar; das Skript bleibt als Lesetext')
  await page.screenshot({ path: join(out, '2b-hoertext.png'), fullPage: true })
  // Grammatik-Auswahl: Fremdsprachenfolge, Themenliste und Hinweise
  await field('Kompetenzschwerpunkt').click()
  await page.getByRole('option', { name: 'Grammatik', exact: true }).click()
  await page.waitForTimeout(400)
  // Das Lernjahr wird aus der schon vorhandenen Angabe zur Fremdsprache abgeleitet, nicht doppelt erfragt
  if (!(await page.getByText(/Lernjahr/).count())) throw new Error('Der Picker muss das Lernjahr nennen, aus dem sich die Auswahl ergibt')
  const simplePast = page
    .getByRole('checkbox', { name: /Einfache Vergangenheit/ })
    .filter({ visible: true })
    .first()
  if (!(await simplePast.count())) throw new Error('In der Grammatikauswahl fehlt das simple past')
  await simplePast.check()
  await page.waitForTimeout(300)
  if (!(await page.getByText(/Typische Fehler/).count())) throw new Error('Zum gewählten Thema fehlen die typischen Fehlerquellen')
  if (!(await page.getByText(/Passende Übungsformate/).count())) throw new Error('Zum gewählten Thema fehlen die Übungsformate')
  console.log('Grammatikauswahl: Thema gewählt, Fehlerquellen und Formate werden angezeigt')
  await page.screenshot({ path: join(out, '2d-grammatik.png'), fullPage: true })
  // Zurück auf gemischt, damit der weitere Ablauf unverändert bleibt
  await field('Kompetenzschwerpunkt').click()
  await page.getByRole('option', { name: 'Gemischt', exact: true }).click()
  await page.waitForTimeout(300)

  // Für ein Sachfach gibt es sie nicht
  await field('Fach').click()
  await page.getByRole('option', { name: 'Biologie', exact: true }).click()
  await page.waitForTimeout(500)
  if (
    await page
      .getByRole('checkbox', { name: /Hörtext von der KI schreiben lassen/ })
      .filter({ visible: true })
      .count()
  )
    throw new Error('In Biologie darf die Hörtext-Auswahl nicht erscheinen')

  // Bildregeln: Schmuckbild und Piktogramme stehen seit Paket 6 unter „Weitere Optionen“
  await weitereOptionen(page)
  const schmuck = page
    .getByRole('switch', { name: /Ein Schmuckbild zulassen/ })
    .filter({ visible: true })
    .first()
  if (!(await schmuck.isVisible())) throw new Error('Der Schalter für das Schmuckbild fehlt')
  // Standard an: Ein Schmuckbild ist unter Bedingungen erlaubt, nicht pauschal verboten
  if (!(await schmuck.isChecked())) throw new Error('Das Schmuckbild muss standardmäßig zugelassen sein')
  await schmuck.uncheck()
  if (await schmuck.isChecked()) throw new Error('Das Schmuckbild ließ sich nicht abschalten')
  await schmuck.check()

  const piktos = page
    .getByRole('switch', { name: /Piktogramme an den Arbeitsanweisungen/ })
    .filter({ visible: true })
    .first()
  if (!(await piktos.isVisible())) throw new Error('Der Schalter für die Piktogramme fehlt')
  // Standard aus: Es gibt keine belegte Altersgrenze, das entscheidet die Lehrkraft
  if (await piktos.isChecked()) throw new Error('Piktogramme dürfen nicht voreingestellt sein')
  await piktos.check()
  if (!(await piktos.isChecked())) throw new Error('Piktogramme ließen sich nicht einschalten')
  console.log('Bildschalter vorhanden: Schmuckbild an (Standard), Piktogramme aus (Standard)')
  await page.screenshot({ path: join(out, '2c-bildregeln.png'), fullPage: true })

  // Designvorlagen
  await page.getByText('Designvorlagen', { exact: true }).click()
  await page.waitForSelector('text=Vorschau: Seite 1 und Folgeseite')
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, '3-designs.png') })
  await page.getByText('Seitenleiste', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, '4-design-seitenleiste.png') })
  // Beispiel öffnen
  await page.getByText('Arbeitsblatt', { exact: true }).first().click()
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, resolve('tests/fixtures/beispiel.arbeitsblatt'))
  // „Datei öffnen …" steht seit Paket 4 nur noch in der Bibliothek
  const bibliothek = page.getByRole('button', { name: 'Meine Arbeitsblätter' })
  if (await bibliothek.isVisible().catch(() => false)) await bibliothek.click()
  await page.getByRole('button', { name: 'Datei öffnen …' }).click()
  await page.waitForSelector('.ws-editor-pages .ws-page')
  await page.waitForTimeout(1500)
  const pages = page.locator('.ws-editor-pages .ws-page')
  const n = await pages.count()
  console.log('Seiten im Editor:', n)
  for (let i = 0; i < n; i++) await pages.nth(i).screenshot({ path: join(out, `5-seite-${i + 1}.png`) })
  await page.getByText('Lösungen', { exact: true }).click()
  await page.waitForTimeout(1200)
  const keyPages = page.locator('.ws-editor-pages .ws-page')
  await keyPages.nth(0).screenshot({ path: join(out, '6-loesung-1.png') })
  // Export – mehrere Dateien (Blatt, Lösungen, Tafelbild) gehen seit Paket 4 in EINEN gewählten Ordner
  const exportOrdner = join(out, 'export')
  rmSync(exportOrdner, { recursive: true, force: true })
  mkdirSync(exportOrdner, { recursive: true })
  const set = (paths) =>
    app.evaluate(
      ({ dialog }, { p, ordner }) => {
        let k = 0
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: p[k++ % p.length] })
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ordner] })
      },
      { p: paths, ordner: exportOrdner }
    )
  await set([join(out, 'ab.pdf'), join(out, 'ab-loesungen.pdf')])
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  await page.getByRole('button', { name: 'Speichern …', exact: true }).click()
  await page.waitForSelector('text=PDF gespeichert', { timeout: 60000 })
  await set([join(out, 'ab.docx'), join(out, 'ab-loesungen.docx')])
  await page.getByRole('button', { name: 'Word', exact: true }).click()
  await page.getByRole('button', { name: 'Speichern …', exact: true }).click()
  await page.waitForSelector('text=Word-Dokument gespeichert', { timeout: 60000 })
  console.log('Ausgabe:', [...readdirSync(exportOrdner), ...['ab.pdf', 'ab.docx'].filter((f) => existsSync(join(out, f)))].join(', '))
} catch (e) {
  console.log('FEHLER', e.message)
  process.exitCode = 1
  await page.screenshot({ path: join(out, 'fehler.png') })
} finally {
  console.log('Konsolenfehler:', errors.length ? errors.slice(0, 5) : 'keine')
  if (errors.length) process.exitCode = 1
  await app.close()
  // Den eigenen Datenordner wegräumen – nichts soll liegen bleiben
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}
