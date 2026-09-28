// Wache für die Klassenarbeit nach Paket 5 – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/klassenarbeit-fassungen.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Entscheidungen der Lehrkraft (25.09.2026): Das Blatt ist direkt bearbeitbar, mit Umschalter
// „Arbeit / Erwartungshorizont" und Speicheranzeige; „Varianten (A/B)" erzeugt echte Fassungen;
// Material-Dateien lassen sich hineinziehen; der tote dritte Schritt ist weg.
//
// Geprüft wird am ERGEBNIS, nicht an Einstellungen – das Feld „Varianten (A/B)" stand lange im
// Formular und bewirkte nichts:
//  1. Material-Datei in den Rahmen ziehen (Fixture) – sie steht in der Liste.
//  2. Arbeit mit zwei Fassungen erzeugen – die Attrappe liefert für A und B verschiedene Texte;
//     ihr Protokoll zeigt, dass die Datei im Auftrag stand und B mit A als Vorlage entstand.
//  3. Umschalter Gruppe A / Gruppe B zeigt den jeweils anderen Text.
//  4. Text direkt im Blatt ändern, Strg+Z nimmt es zurück.
//  5. Erwartungshorizont-Ansicht zeigt die Lösungen der Fassung.
//  6. „Gespeichert: …" in der Leiste; Drucken fragt nach den Fassungen.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/klassenarbeit-fassungen')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-ka-fassungen-'))
const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'ka-unterlagen.txt')

// ---------- Die Attrappe: Fassung A und B abwechselnd, jede Anfrage ins Protokoll
const aufgabe = (fassung) => ({
  outlineIndex: 1,
  type: 'task',
  instruction: `**Tick** the correct answer (${fassung}).`,
  operator: 'tick',
  afb: 'I',
  solution: `Loesung ${fassung}: a)`,
  points: 3,
  answer: { kind: 'multipleChoice', options: ['a', 'b', 'c'], correct: [0] }
})
const teil = (fassung) => ({
  blocks: [{ outlineIndex: 0, type: 'text', title: 'Text', body: `Airport story of version ${fassung}.`, lineNumbers: true }, aufgabe(fassung)]
})
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(attrappe, JSON.stringify({ verzoegerungMs: 300, protokoll, antworten: { exam_part: { folge: [teil('A'), teil('B')] } } }))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const blattText = () => page.locator('.ws-editor-pages').first().innerText()

try {
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')
  pruefe((await page.locator('.mantine-Stepper-step').filter({ visible: true }).count()) === 2, 'Zwei Schritte: Rahmen und Bearbeiten & Export')

  await page.getByPlaceholder('z. B. Going abroad').fill('Wache Fassungen Airport')
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.getByRole('radiogroup', { name: 'Fassungen' }).getByText('A / B', { exact: true }).click()

  // ---------- 1. Material-Datei hineinziehen (über das Dateifeld der Ablagefläche)
  // Nur die Fläche der Klassenarbeit – die übrigen Programme liegen mit ihren Dateifeldern im Hintergrund
  await page.locator('.mantine-Dropzone-root', { hasText: 'Material aus dem Unterricht' }).locator('input[type=file]').setInputFiles(fixture)
  // Datenschutzhinweis beim ersten Hochladen bestätigen (Großprogramm 0.4)
  await page.locator('[data-datenschutz-ok]').click({ timeout: 10000 })
  await page.getByText('ka-unterlagen.txt', { exact: true }).waitFor({ timeout: 10000 })
  pruefe(true, 'Die Datei steht in der Liste der Unterlagen')
  await page.screenshot({ path: join(shots, 'paket5-rahmen.png') })

  // ---------- 2. Erzeugen
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).click()
  await page.locator('.ws-editor-pages .ws-page').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  const zeilen = existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .map((z) => JSON.parse(z))
    : []
  pruefe(zeilen.length === 4, `Vier Anfragen: je Teil Fassung A und B (${zeilen.length})`)
  pruefe(
    zeilen.every((z) => z.user.includes('Past progressive: was/were + -ing')),
    'Die hineingezogene Datei steht in jeder Anfrage'
  )
  pruefe(
    zeilen.filter((z) => z.user.includes('PARALLELFASSUNG B') && z.user.includes('VORLAGE – FASSUNG A')).length === 2,
    'Fassung B entsteht je Teil mit A als Vorlage'
  )

  // ---------- 3. Umschalter
  const gruppeB = page.getByText('Gruppe B', { exact: true })
  pruefe(await gruppeB.isVisible(), 'Umschalter „Gruppe A / Gruppe B" ist da')
  pruefe((await blattText()).includes('version A'), 'Angezeigt ist zuerst Fassung A')
  await gruppeB.click()
  await page.waitForTimeout(600)
  const textB = await blattText()
  pruefe(textB.includes('version B') && !textB.includes('version A'), 'Nach dem Umschalten steht Fassung B da')
  pruefe(textB.includes('Group B'), 'Das Blatt trägt „Group B"')
  await page.screenshot({ path: join(shots, 'paket5-fassung-b.png') })

  // ---------- 4. Direkt bearbeiten und Strg+Z
  await page.locator('.ws-editor-pages .rt-editable', { hasText: 'Airport story of version B' }).first().click()
  const feld = page.locator('.ws-editor-pages textarea.rt-editor').first()
  await feld.waitFor({ timeout: 3000 })
  await feld.press('End')
  await feld.type(' Geaendert im Blatt.')
  await page.getByText(/direkt im Blatt ändern/).click()
  await page.waitForTimeout(500)
  pruefe((await blattText()).includes('Geaendert im Blatt.'), 'Der Text lässt sich direkt im Blatt ändern')
  await page.getByText('Gruppe A', { exact: true }).click()
  await page.waitForTimeout(300)
  pruefe(!(await blattText()).includes('Geaendert im Blatt.'), 'Die Änderung betrifft nur Fassung B')
  await gruppeB.click()
  await page.waitForTimeout(300)
  await page.getByText(/direkt im Blatt ändern/).click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const nachUndo = await blattText()
  pruefe(!nachUndo.includes('Geaendert im Blatt.') && nachUndo.includes('version B'), 'Strg+Z nimmt die Änderung zurück')

  // ---------- 5. Erwartungshorizont
  pruefe(!nachUndo.includes('Loesung B'), 'In der Arbeit stehen keine Lösungen')
  await page.getByText('Erwartungshorizont', { exact: true }).click()
  await page.waitForTimeout(600)
  const key = await blattText()
  pruefe(key.includes('Loesung B'), 'Die Ansicht „Erwartungshorizont" zeigt die Lösungen der Fassung B')
  await page.screenshot({ path: join(shots, 'paket5-erwartungshorizont.png') })
  await page.getByText('Arbeit', { exact: true }).click()

  // ---------- 6. Speicheranzeige und Drucken
  // Seit 27.09.2026 steht die Sicherung wie beim Arbeitsblatt in der Editor-Leiste („gesichert HH:MM"), der Name im Feld daneben
  await page
    .getByTestId('gesichert')
    .filter({ hasText: /^gesichert \d/ })
    .waitFor({ timeout: 8000 })
  pruefe(true, '„gesichert HH:MM" steht in der Leiste')
  pruefe((await page.getByLabel('Name in der App').inputValue()).length > 0, 'Der Name der Arbeit steht in der Leiste')
  await page.getByRole('button', { name: 'Drucken' }).click()
  const alle = page.getByRole('radio', { name: 'Alle in einer Datei' })
  await alle.waitFor({ timeout: 5000 })
  pruefe(await alle.isVisible(), 'Drucken fragt: nur die angezeigte oder alle Fassungen')
  await page.screenshot({ path: join(shots, 'paket5-drucken.png') })
  await page.keyboard.press('Escape')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  // Temporären Datenordner wegräumen – nichts bleibt liegen
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
