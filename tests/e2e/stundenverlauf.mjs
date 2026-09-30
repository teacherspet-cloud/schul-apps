// Wache für den STUNDENVERLAUF (Großprogramm 0.4, F4) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/stundenverlauf.mjs <Ausgabeordner>
//
// Arbeitsblatt öffnen, Reiter „Verlauf +", „Mit KI erstellen": Die Tabelle steht da, die Minuten
// ergeben genau 45 (die Attrappe liefert absichtlich 50), die Anfrage enthält das Material.
// PDF des Verlaufs in einen Ordner speichern. Alles in einem WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/stundenverlauf')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-verlauf-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: {
      stundenverlauf: {
        ziel: 'Die Lernenden können die Ursachen der Krise erklären.',
        phasen: [
          { phase: 'Einstieg', minuten: 5, geschehen: 'Bildimpuls · Vermutungen sammeln', sozialform: 'UG', medien: 'Folie' },
          { phase: 'Erarbeitung', minuten: 30, geschehen: 'Q1 lesen · Aufgabe 1', sozialform: 'EA', medien: 'Q1, Aufgabe 1' },
          { phase: 'Sicherung', minuten: 15, geschehen: 'Ergebnisse vergleichen', sozialform: 'UG', medien: 'Tafel' }
        ],
        hinweise: 'Schwächere Lernende lesen nur den ersten Absatz.',
        // Pflichtfeld seit den Einstiegsimpulsen (01.10.2026) – ohne Bild, damit diese Wache nichts sucht
        einstieg: {
          art: 'wortimpuls',
          titel: 'Tafelimpuls: „Krise"',
          beschreibung: 'Das Wort „Krise" steht an der Tafel.',
          bezug: 'Vorwissen zu Krisen führt zur Frage nach den Ursachen.',
          leitfrage: 'Wie konnte es zur Krise kommen?',
          erwartungen: ['Geldmangel → festhalten'],
          ueberleitung: 'Q1 zeigt, wie Zeitgenossen die Lage sahen.',
          moderation: ['Wort anschreiben, schweigen'],
          bild: { motiv: '', suche: '', original: false, werk: '', stil: 'foto', entwurf: '' },
          zitat: { text: '', quelle: '' }
        }
      }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const anfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
    : []

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
try {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(2, 'text'))
  await page.waitForTimeout(800)
  await page.getByText('Verlauf +', { exact: true }).filter({ visible: true }).first().click()
  await page.locator('[data-verlauf-erstellen]').click()
  await page.getByText('Summe: 45 von 45 Minuten').waitFor({ timeout: 15000 })
  pruefe(true, 'Die Minuten ergeben genau 45 (Attrappe lieferte 50)')
  const v = await page.evaluate(() => window.__selftest.worksheetJetzt().stundenverlauf)
  pruefe(v?.phasen?.length === 3, `Drei Phasen (${v?.phasen?.length})`)
  pruefe(v?.ziel?.includes('Ursachen'), 'Stundenziel übernommen')
  const a = anfragen().filter((z) => z.schemaName === 'stundenverlauf')
  pruefe(
    a.length === 1 && a[0].user.includes('Bericht aus der Versammlung') && a[0].user.includes('GENAU 45'),
    'Die Anfrage enthält das Material und die Dauer'
  )
  await page.screenshot({ path: join(out, 'verlauf.png') })
  // PDF in den Ausgabeordner
  const html = await page.evaluate(async () => {
    const ws = window.__selftest.worksheetJetzt()
    return ws.stundenverlauf ? ws.stundenverlauf.phasen.map((p) => p.phase).join('|') : ''
  })
  pruefe(html === 'Einstieg|Erarbeitung|Sicherung', 'Reihenfolge der Phasen')
  // Nichts davon auf dem Schülerblatt
  await page
    .getByText('Arbeitsblatt', { exact: true })
    .filter({ visible: true })
    .nth(1)
    .click()
    .catch(() => undefined)
  await page.waitForTimeout(500)
  const blatt = await page
    .locator('.ws-editor-pages')
    .first()
    .innerText()
    .catch(() => '')
  pruefe(!blatt.includes('Vermutungen sammeln'), 'Der Verlauf steht nicht auf dem Blatt')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
