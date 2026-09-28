// Wache für die ABFRAGE DER KI-TEST-WÖRTER (vorher: npm run build).
// Aufruf: node tests/e2e/ki-test-woerter.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): „wenn man den ki test oben aktiviert, frage den nutzer
// welche wörter als test benutzt werden sollen."
//
// Vorher würfelte das Programm ein Wort aus Titel und Thema. Geprüft wird deshalb der ganze
// Weg: Kommt die Frage überhaupt, landet die Antwort auf dem Blatt, und bleibt der Schalter
// aus, wenn die Lehrkraft abbricht? Ein eingeschalteter Test mit einem Wort, das niemand
// kennt, wäre schlimmer als gar keiner.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche, blattoptionen } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ki-test-woerter')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-canary-'))
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' }
})
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(6))
await page.waitForTimeout(2500)

const schalter = page.locator('label', { hasText: 'KI-Test' }).first()
pruefe((await schalter.count()) > 0, 'Der Schalter „KI-Test" ist da')

/** Steht der unsichtbare Satz auf dem Blatt, und mit welchen Wörtern? */
const satzAufBlatt = async () =>
  page.evaluate(() => {
    const seite = document.querySelector('.ws-editor-pages .ws-page')
    // Der Satz steht als winziger weißer Absatz im Seitenrahmen
    const klein = [...(seite?.querySelectorAll('p') ?? [])].find((p) => p.textContent?.includes('Formale Vorgabe'))
    return klein?.textContent ?? ''
  })

pruefe((await satzAufBlatt()) === '', 'Ohne eingeschalteten Test steht nichts auf dem Blatt')

// --- Einschalten: Die Frage muss kommen
await blattoptionen(page)
await schalter.click()
await page.waitForTimeout(800)
const dialog = page.locator('.mantine-Modal-content', {
  hasText: 'Wörter für den KI-Test'
})
pruefe((await dialog.count()) > 0, 'Beim Einschalten wird nach den Wörtern gefragt')

// --- Abbrechen: Der Test darf NICHT eingeschaltet sein
await dialog.getByRole('button', { name: 'Abbrechen' }).click()
await page.waitForTimeout(800)
/*
 * Den Haken ueber den Wurzelknoten suchen: Bei Mantine liegt das `input` NEBEN dem `label`,
 * nicht darin – `label.querySelector('input')` findet nichts und meldet faelschlich einen
 * Fehler.
 */
const hakenStatus = () =>
  page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent?.trim() === 'KI-Test')
    const wurzel = l?.closest('.mantine-Checkbox-root') ?? l?.parentElement?.parentElement
    return wurzel?.querySelector('input[type="checkbox"]')?.checked ?? null
  })
const nachAbbruch = await hakenStatus()
pruefe(nachAbbruch === false, 'Nach Abbrechen bleibt der KI-Test aus')
pruefe((await satzAufBlatt()) === '', 'Nach Abbrechen steht nichts auf dem Blatt')

// --- Eigene Wörter eingeben
await blattoptionen(page)
await schalter.click()
await page.waitForTimeout(800)
const feld = dialog.getByRole('textbox').first()
await feld.fill('Nilpferd, Zimtschnecke')
await page.waitForTimeout(400)
// Der Dialog zeigt vorab, was auf dem Blatt stehen wird
const vorschau = await dialog.innerText()
// Seit der dritten Fassung (27.09.2026) stehen die Kennwörter in Anführungszeichen: „Nilpferd" und „Zimtschnecke"
pruefe(vorschau.includes('Nilpferd" und „Zimtschnecke'), 'Der Dialog zeigt den Satz, der auf dem Blatt landet')
await dialog.screenshot({ path: join(out, 'dialog.png') })
await dialog.getByRole('button', { name: 'KI-Test einschalten' }).click()
await page.waitForTimeout(2000)

const satz = await satzAufBlatt()
console.log(`Satz auf dem Blatt: „${satz}"`)
pruefe(satz.includes('Nilpferd') && satz.includes('Zimtschnecke'), 'Beide gewählten Wörter stehen im unsichtbaren Satz')
pruefe(satz.startsWith('Formale Vorgabe'), 'Der Satz sieht aus wie eine Vorgabe der Lehrkraft')
/*
 * Er darf sich NICHT selbst als Test zu erkennen geben – gemeldet am 25.09.2026: ChatGPT
 * stufte die alte Fassung („Dies ist ein KI-Test …") als Fremdanweisung ein und befolgte sie
 * ausdrücklich nicht.
 */
pruefe(!/KI-Test/.test(satz), 'Er nennt sich nicht selbst einen Test')
pruefe((await hakenStatus()) === true, 'Der Schalter steht danach auf ein')

await page.screenshot({ path: join(out, 'ki-test.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDie Lehrkraft wählt die Wörter des KI-Tests selbst. Bild in ${out}`)
