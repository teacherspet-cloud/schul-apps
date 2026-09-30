// Wache für die Seitenvorgabe (Paket 7) – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/seiten-abweichung.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Wünsche der Lehrkraft (25.09.2026):
//  - Die Seitenzahl ist standardmäßig automatisch; „genau“ und „von–bis“ gelten als Richtwert.
//  - Weicht das fertige Blatt davon ab, steht im Editor sichtbar „2 statt 1 Seite – Grund: …“
//    mit Vorschlägen, die dem Lernziel dienen; umsetzbare über „Vorschlag der App umsetzen“
//    (30.09.2026: ein Knopf, bei mehreren Vorschlägen ein Kreismenü mit Mehrfachauswahl).
//  - Gezählt werden nur Aufgaben- und Materialseiten (nicht die Hilfekarten-Schlussseite).
//
// Die Attrappe liefert ein Blatt, das sicher über eine Seite hinausgeht, und dazu im SELBEN
// Lauf Grund und Vorschlag (Feld `seiten`) – es gibt keinen zusätzlichen KI-Aufruf.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seiten-abweichung')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-seiten-'))

const leer = { kind: 'none', lines: 0, gapText: '', options: [], correctIndex: -1, pairs: [], items: [], rows: [], statements: [], labels: [] }
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: '',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
// Ein langer Sachtext und vier Aufgaben mit viel Schreibraum – das passt nie auf eine Seite
const absatz =
  'Der Igel ist ein Säugetier, das in Gärten, Hecken und Waldrändern lebt. Er frisst vor allem Käfer, Würmer und Schnecken und ist in der Dämmerung und nachts unterwegs. '
const text = Array.from({ length: 5 }, (_, i) => `Abschnitt ${i + 1}. ${absatz.repeat(4)}`).join('\n\n')
const aufgabe = (i, op) =>
  baustein({
    outlineIndex: i,
    instruction: `**${op}** zwei Dinge aus dem Text.`,
    operator: op.toLowerCase(),
    afb: 'I',
    solution: 'Käfer, Würmer',
    // Das Schema nennt die Zahl der Linien `count` (`lines` ist ein Altname)
    answer: { ...leer, kind: 'lines', lines: 12, count: 12 }
  })
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 600,
    protokoll,
    antworten: {
      worksheet_outline: {
        title: 'Der Igel',
        learningGoals: ['Ich kann beschreiben, wie der Igel lebt.'],
        minutes: 45,
        teacherNote: '',
        items: [
          { type: 'text', purpose: 'Sachtext', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          ...['Nenne', 'Beschreibe', 'Erkläre', 'Vergleiche'].map((op) => ({
            type: 'task',
            purpose: 'Aufgabe',
            afb: 'I',
            operator: op.toLowerCase(),
            socialForm: 'EA',
            stars: 0,
            answerKind: 'lines'
          }))
        ]
      },
      worksheet: {
        blocks: [
          baustein({ type: 'text', title: 'Der Igel', body: text }),
          aufgabe(1, 'Nenne'),
          aufgabe(2, 'Beschreibe'),
          aufgabe(3, 'Erkläre'),
          aufgabe(4, 'Vergleiche')
        ],
        seiten: {
          geplant: 2,
          grund: 'Der Sachtext lässt sich nicht kürzen, ohne dass die Aufgaben 2 und 3 ihre Grundlage verlieren.',
          vorschlaege: [
            { richtung: 'weniger', art: 'materialKuerzen', text: 'Den Sachtext auf die Abschnitte 1 bis 3 kürzen – sie tragen alle Aufgaben.', baustein: 0 }
          ]
        }
      },
      worksheet_review: { problems: [] },
      worksheet_block: { block: baustein({ type: 'text', title: 'Der Igel', body: absatz }) }
    }
  })
)

const problems = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
await warteAufOberflaeche(page)
const sichtbar = (loc) => loc.filter({ visible: true }).first()

try {
  await page.click('[aria-label="Arbeitsblatt"]')
  const thema = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema.waitFor({ timeout: 15000 })
  await thema.fill('Der Igel')
  // Standard: automatisch – dann umstellen auf „genau 1“
  pruefe(
    (await sichtbar(page.locator('[data-testid="seiten-hinweis"]')).innerText()).includes('legt die Seitenzahl selbst fest'),
    'Seitenzahl ist anfangs automatisch'
  )
  await sichtbar(page.getByText('genau', { exact: true })).click()
  const zahl = sichtbar(page.getByRole('textbox', { name: 'Seitenzahl' }))
  await zahl.fill('1')
  await zahl.blur()
  await page.waitForTimeout(300)
  pruefe(
    (await sichtbar(page.locator('[data-testid="seiten-hinweis"]')).innerText()).includes('eine Seite mehr oder weniger'),
    'Bei „genau“ gilt die Zahl als Richtwert (mehr oder weniger)'
  )

  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  await sichtbar(page.getByText('Gliederung prüfen')).waitFor({ timeout: 30000 })
  await sichtbar(page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' })).click()
  await sichtbar(page.getByText('Bearbeiten & Export')).waitFor({ timeout: 30000 })
  const hinweis = sichtbar(page.locator('[data-testid="seiten-hinweis-editor"]'))
  await hinweis.waitFor({ timeout: 15000 })
  const inhalt = await hinweis.innerText()
  pruefe(/\d+ statt 1 Seite/.test(inhalt), `Editor zeigt „… statt 1 Seite“ (${inhalt.split('\n')[0]})`)
  pruefe(inhalt.includes('Grund: Der Sachtext lässt sich nicht kürzen'), 'Der Grund der KI steht im Hinweis')
  pruefe(inhalt.includes('Den Sachtext auf die Abschnitte 1 bis 3 kürzen'), 'Der Vorschlag der KI steht im Hinweis')
  pruefe(inhalt.includes('nicht Hilfekarten'), 'Der Hinweis sagt, was gezählt wird')
  await hinweis.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(shots, 'paket7-seitenhinweis.png') })

  // Im Auftrag an die KI stand die Vorgabe und die Bitte um Grund und Vorschläge – im selben Lauf
  const anfragen = readFileSync(protokoll, 'utf-8')
    .trim()
    .split('\n')
    .map((z) => JSON.parse(z))
  const blatt = anfragen.find((a) => a.schemaName === 'worksheet')
  pruefe(Boolean(blatt?.user?.includes('SEITEN: Vorgabe 1 Seite(n) als RICHTWERT')), 'Der Auftrag nennt die Vorgabe als Richtwert')
  pruefe(Boolean(blatt?.user?.includes('ohne Hilfekarten')), 'Der Auftrag sagt, dass Hilfekarten nicht mitzählen')
  pruefe(!anfragen.some((a) => /seiten/i.test(a.schemaName) && a.schemaName !== 'worksheet'), 'Kein zusätzlicher KI-Aufruf für Grund und Vorschläge')

  // „Vorschlag der App umsetzen" (30.09.2026): mehrere umsetzbare Vorschläge → Kreismenü
  const seitenJetzt = async () => {
    const titel = await hinweis.innerText().catch(() => '')
    const m = /(\d+) statt 1 Seite/.exec(titel)
    return m ? Number(m[1]) : 1
  }
  const knopf = hinweis.getByTestId('vorschlag-umsetzen')
  pruefe((await knopf.innerText()).includes('Vorschlag der App umsetzen'), `Knopf „Vorschlag der App umsetzen" (${await knopf.innerText()})`)
  const kreisWahl = async (namen) => {
    // Mit nur EINEM umsetzbaren Vorschlag setzt der Knopf ihn sofort um – hier stehen immer mehrere zur Wahl
    if (!(await hinweis.getByTestId('vorschlag-umsetzen').innerText()).includes('zur Wahl')) throw new Error('Nur ein Vorschlag übrig')
    await hinweis.getByTestId('vorschlag-umsetzen').click()
    await page.locator('[data-kreismenue-umsetzen]').waitFor({ timeout: 3000 })
    for (const n of namen) await page.getByRole('menuitemcheckbox', { name: n }).click()
  }
  await kreisWahl(['Schreibraum knapper'])
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(shots, 'vorschlag-kreismenue.png') })
  const eintraege = await page.getByRole('menuitemcheckbox').allInnerTexts()
  pruefe(eintraege.length >= 2, `Kreismenü zeigt ${eintraege.length} Vorschläge (${eintraege.join(' | ')})`)
  // Schreibraum: lokal, ein Klick – so oft, bis eine Seite weniger gesetzt wird (höchstens dreimal)
  const vorher = await seitenJetzt()
  await page.locator('[data-kreismenue-umsetzen]').click()
  let nachher = vorher
  for (let runde = 0; runde < 3; runde++) {
    const ende = Date.now() + 4000
    while (Date.now() < ende && (nachher = await seitenJetzt()) >= vorher) await page.waitForTimeout(250)
    if (nachher < vorher) break
    await kreisWahl(['Schreibraum knapper'])
    await page.locator('[data-kreismenue-umsetzen]').click()
  }
  pruefe(nachher < vorher, `Schreibraum knapper → weniger Seiten (${vorher} → ${nachher})`)
  await page.screenshot({ path: join(shots, 'vorschlag-umgesetzt.png') })
  // Strg+Z nimmt den Schritt zurück
  await page.keyboard.press('Control+z')
  const endeZ = Date.now() + 4000
  let zurueck = nachher
  while (Date.now() < endeZ && (zurueck = await seitenJetzt()) <= nachher) await page.waitForTimeout(250)
  pruefe(zurueck > nachher, `Strg+Z stellt den Schreibraum wieder her (${nachher} → ${zurueck})`)

  // Inhaltlicher Vorschlag der KI: der Baustein wird als Hintergrund-Auftrag überarbeitet
  await kreisWahl(['Material kürzen (KI)'])
  await page.locator('[data-kreismenue-umsetzen]').click()
  await page.locator('.auftrags-pille, .auftrags-liste').first().waitFor({ timeout: 5000 })
  pruefe(true, '„Material kürzen (KI)" startet einen Auftrag (Baustein überarbeiten)')
  // Die Attrappe liefert einen kurzen Text: „Abschnitt 5“ verschwindet vom Blatt
  const lang = () => page.locator('.ws-page').filter({ visible: true }).filter({ hasText: 'Abschnitt 5.' }).count()
  const ende = Date.now() + 20000
  while (Date.now() < ende && (await lang()) > 0) await page.waitForTimeout(500)
  pruefe((await lang()) === 0, 'Der gekürzte Sachtext steht im Blatt (Umsetzen hat gewirkt)')
  // Ausblenden
  await hinweis
    .getByRole('button', { name: 'Hinweis zur Seitenzahl ausblenden' })
    .click()
    .catch(() => undefined)
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
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
