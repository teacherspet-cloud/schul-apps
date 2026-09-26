// Wache für die THEMENBEREICHE (Paket 10b) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/themenbereiche.mjs <Ausgabeordner>
//
// Anlass (26.09.2026), Wunsch der Lehrkraft: Die Bibliotheken ordnen nach Fach › Themenbereich,
// der Jahrgang ist nur ein Filter; alle Materialarten teilen sich die Bereiche. Geprüft wird:
//  1. Vorschlag ab 8 Materialien im Fach (lokal, ohne KI) – ein Klick übernimmt, die Ordner
//     erscheinen; ein danach angelegtes Material wird automatisch einsortiert.
//  2. Bereich von Hand anlegen, eine Karte hineinziehen (Ziehen & Ablegen).
//  3. „Verschieben nach …" im ⋯-Menü (Tastatur/Tablet) und „Rückgängig" im Hinweis.
//  4. Jahrgangsfilter oben (Chips) – gemerkt über einen Neustart der Oberfläche.
//  5. Übergreifende Seite von der Startseite aus: Die Lernzielkontrolle im Bereich öffnet im
//     Programm „Lernzielkontrolle".
// Bildschirmfotos (hell und dunkel): paket10b-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/themenbereiche')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-themen-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

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

const sichtbar = (loc) => loc.filter({ visible: true })
const shot = (name) => page.screenshot({ path: join(out, `paket10b-${name}.png`) })
const ordner = (name) => sichtbar(page.locator(`[data-bereich="${name}"]`))
const karte = (name) => sichtbar(page.locator(`.material-huelle[data-material="${name}"]`))

/** Arbeitsblatt-Eintrag ohne KI: nur die Kopfdaten zählen für die Bibliothek */
const blatt = (id, name, subjectId, subjectLabel, grade, topic = name) => ({
  id,
  name,
  stats: { subjectId, subjectLabel, topic, grade, schoolTypeName: 'Gymnasium', sheetCount: 1, hasBoard: false },
  payload: {}
})

async function arbeitsblattBibliothek() {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(400)
  const knopf = sichtbar(page.getByRole('button', { name: 'Meine Arbeitsblätter', exact: true }))
  if (await knopf.count()) await knopf.click()
  await page.waitForTimeout(900)
}

try {
  await warteAufOberflaeche(page)
  // ---------- Bestand: eine echte Lernzielkontrolle (Mathematik) und Arbeitsblätter
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.evaluate(() => window.__selftest.lzkSpeichern('Prüflauf Potenzen'))
  await page.evaluate(
    async (blaetter) => {
      for (const b of blaetter) await window.api.sheets.save(b)
    },
    [
      blatt('bio00001', 'Fotosynthese', 'biologie', 'Biologie', 7),
      blatt('bio00002', 'Photosynthese – Versuch mit Wasserpest', 'biologie', 'Biologie', 7),
      blatt('bio00003', 'Die Zelle', 'biologie', 'Biologie', 7),
      blatt('bio00004', 'Zellatmung und Gärung', 'biologie', 'Biologie', 7),
      blatt('bio00005', 'Zellorganellen im Überblick', 'biologie', 'Biologie', 7),
      blatt('bio00006', 'Ökosystem Wald', 'biologie', 'Biologie', 7),
      blatt('bio00007', 'Ökosysteme im Vergleich', 'biologie', 'Biologie', 7),
      blatt('bio00008', 'Verdauung beim Menschen', 'biologie', 'Biologie', 7),
      blatt('mat00001', 'Potenzen üben', 'mathematik', 'Mathematik', 10, 'Potenzgesetze'),
      blatt('mat00002', 'Lineare Funktionen', 'mathematik', 'Mathematik', 8)
    ]
  )

  // ---------- 1) Vorschlag ab 8 Materialien
  console.log('\nVorschlag')
  await arbeitsblattBibliothek()
  const hinweis = sichtbar(page.locator('[data-vorschlag="biologie"]'))
  pruefe((await hinweis.count()) === 1, 'Biologie (8 Blätter): Vorschlag erscheint')
  const text = (await hinweis.count()) ? await hinweis.innerText() : ''
  pruefe(/Zelle \(3\)/.test(text) && /Fotosynthese \(2\)/.test(text), `Vorschau nennt „Zelle (3)" und „Fotosynthese (2)" (${text.split('\n')[0]})`)
  pruefe((await sichtbar(page.locator('[data-vorschlag="mathematik"]')).count()) === 0, 'Mathematik (3 Materialien): kein Vorschlag')
  await shot('vorschlag-hell')
  await hinweis.getByRole('button', { name: 'Ansehen und auswählen' }).click()
  await page.waitForTimeout(200)
  // Einen Vorschlag abwählen
  await hinweis.getByRole('checkbox', { name: /^Ökosystem/ }).uncheck()
  await hinweis.getByRole('button', { name: '2 Bereiche übernehmen' }).click()
  await page.waitForTimeout(900)
  pruefe((await ordner('Zelle').count()) === 1 && (await ordner('Fotosynthese').count()) === 1, 'Ordner „Zelle" und „Fotosynthese" angelegt')
  pruefe((await ordner('Ökosystem').count()) === 0, 'Der abgewählte Vorschlag „Ökosystem" bleibt weg')
  pruefe((await ordner('Zelle').innerText()).includes('3 Materialien'), '„Zelle" enthält 3 Materialien')

  // Ein neues Blatt wird automatisch einsortiert
  await page.evaluate((b) => window.api.sheets.save(b), blatt('bio00009', 'Zellteilung', 'biologie', 'Biologie', 7))
  // Neu laden: Die Bibliothek holt ihre Liste beim Öffnen (so wie nach einem Neustart)
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await page.waitForTimeout(600)
  pruefe((await ordner('Zelle').innerText()).includes('4 Materialien'), 'Neues Blatt „Zellteilung" automatisch in „Zelle" einsortiert')
  const zuordnung = await page.evaluate(async () => (await window.api.themen.list()).zuordnungen['arbeitsblatt:bio00009'])
  pruefe(zuordnung?.von === 'auto', `… mit Kennzeichen „automatisch" (${JSON.stringify(zuordnung)})`)

  // ---------- 2) Bereich anlegen und hineinziehen
  console.log('\nAnlegen und Ziehen')
  const mathe = sichtbar(page.locator('[data-fach-abschnitt="mathematik"]'))
  await mathe.getByRole('button', { name: 'Themenbereich', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name des neuen Themenbereichs' }).fill('Potenzen')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  pruefe((await ordner('Potenzen').count()) === 1, 'Bereich „Potenzen" in Mathematik angelegt')
  await karte('Potenzen üben').dragTo(ordner('Potenzen'))
  await page.waitForTimeout(800)
  pruefe((await ordner('Potenzen').innerText()).includes('1 Material'), '„Potenzen üben" per Ziehen in „Potenzen" abgelegt')
  const hand = await page.evaluate(async () => (await window.api.themen.list()).zuordnungen['arbeitsblatt:mat00001'])
  pruefe(hand?.von === 'hand', '… mit Kennzeichen „von Hand"')
  await shot('bibliothek-hell')

  // Mehrfachauswahl mit Strg-Klick, dann „Verschieben nach …" in einen neuen Bereich
  await karte('Ökosystem Wald').click({ modifiers: ['Control'] })
  await karte('Ökosysteme im Vergleich').click({ modifiers: ['Control'] })
  await page.waitForTimeout(200)
  const leiste = sichtbar(page.locator('.themen-auswahl'))
  pruefe(
    (await leiste.count()) === 1 && (await leiste.innerText()).includes('2 Materialien ausgewählt'),
    'Strg-Klick wählt zwei Karten aus (statt sie zu öffnen)'
  )
  await leiste.getByRole('button', { name: 'Verschieben nach …' }).click()
  const dialog = sichtbar(page.locator('[data-verschieben-dialog]'))
  await dialog.getByRole('textbox', { name: 'Neuer Themenbereich in Biologie' }).fill('Ökologie')
  await dialog.getByRole('button', { name: 'Anlegen und verschieben' }).click()
  await page.waitForTimeout(800)
  pruefe(
    (await ordner('Ökologie').count()) === 1 && (await ordner('Ökologie').innerText()).includes('2 Materialien'),
    'Beide in den neuen Bereich „Ökologie" verschoben'
  )

  // ---------- 3) „Verschieben nach …" mit der Lernzielkontrolle (andere Materialart)
  console.log('\nVerschieben nach …')
  await sichtbar(page.locator('.mantine-SegmentedControl-label', { hasText: 'alle Materialien' })).click()
  await page.waitForTimeout(800)
  pruefe((await karte('Prüflauf Potenzen').count()) === 1, '„alle Materialien" zeigt die Lernzielkontrolle in der Arbeitsblatt-Bibliothek')
  const lzk = karte('Prüflauf Potenzen')
  pruefe((await lzk.getAttribute('data-art')) === 'lernzielkontrolle', '… als Karte der Materialart Lernzielkontrolle (getönt)')
  await lzk.getByRole('button', { name: 'Weitere Aktionen für „Prüflauf Potenzen“' }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach …' }).click()
  await page.waitForTimeout(300)
  await shot('verschieben-hell')
  await sichtbar(page.locator('[data-verschieben-dialog]')).getByRole('button', { name: 'Potenzen' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Potenzen').innerText()).includes('2 Materialien'), 'Über „Verschieben nach …" liegt die Kontrolle jetzt auch in „Potenzen"')
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Potenzen').innerText()).includes('1 Material'), '„Rückgängig" holt sie wieder heraus')
  await karte('Prüflauf Potenzen').getByRole('button', { name: 'Weitere Aktionen für „Prüflauf Potenzen“' }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach …' }).click()
  await sichtbar(page.locator('[data-verschieben-dialog]')).getByRole('button', { name: 'Potenzen' }).click()
  await page.waitForTimeout(700)

  // ---------- 4) Jahrgangsfilter
  console.log('\nJahrgang')
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Klasse 8' })).click()
  await page.waitForTimeout(500)
  pruefe((await karte('Lineare Funktionen').count()) === 1, 'Klasse 8: „Lineare Funktionen" sichtbar')
  pruefe((await karte('Die Zelle').count()) === 0 && (await ordner('Zelle').count()) === 0, 'Klasse 8: Biologie (Klasse 7) ausgeblendet')
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  pruefe((await karte('Lineare Funktionen').count()) === 1 && (await karte('Die Zelle').count()) === 0, 'Der Filter bleibt nach dem Neuladen gemerkt')
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Alle Jahrgänge' })).click()
  await page.waitForTimeout(400)

  // Bereich löschen: Rückfrage direkt am Ordner, Materialien nach „Ohne Themenbereich", Rückgängig
  console.log('\nLöschen')
  await ordner('Fotosynthese').getByRole('button', { name: 'Weitere Aktionen für den Themenbereich „Fotosynthese“' }).click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await page.waitForTimeout(200)
  const rueckfrage = sichtbar(page.locator('[data-bereich-loeschen]'))
  pruefe((await rueckfrage.count()) === 1, 'Löschen fragt direkt am Ordner nach')
  await rueckfrage.getByRole('button', { name: 'Löschen' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Fotosynthese').count()) === 0 && (await karte('Fotosynthese').count()) === 1, 'Ordner weg, das Blatt steht unter „Ohne Themenbereich"')
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(800)
  pruefe(
    (await ordner('Fotosynthese').count()) === 1 && (await ordner('Fotosynthese').innerText()).includes('2 Materialien'),
    '„Rückgängig" stellt den Bereich samt Inhalt wieder her'
  )

  // ---------- 5) Übergreifende Seite von der Startseite: Kontrolle öffnet im richtigen Programm
  console.log('\nÜbergreifend')
  await page.click('[aria-label="Startseite"]')
  await page.waitForTimeout(700)
  const themenAbschnitt = sichtbar(page.locator('[data-home-themen]'))
  pruefe((await themenAbschnitt.count()) === 1, 'Startseite: Abschnitt „Themenbereiche"')
  await themenAbschnitt.getByRole('button', { name: /Mathematik/ }).click()
  await page.waitForTimeout(800)
  await ordner('Potenzen').getByRole('button', { name: 'Themenbereich „Potenzen“ öffnen' }).click()
  await page.waitForTimeout(600)
  pruefe(
    (await karte('Prüflauf Potenzen').count()) === 1 && (await karte('Potenzen üben').count()) === 1,
    'Bereich „Potenzen" zeigt Arbeitsblatt und Lernzielkontrolle zusammen'
  )
  await shot('uebergreifend-hell')
  await karte('Prüflauf Potenzen')
    .getByRole('button', { name: /„Prüflauf Potenzen“ öffnen/ })
    .click()
  await page.waitForTimeout(1200)
  const aktiv = await page.evaluate(() => document.querySelector('.app-leiste [data-active="true"]')?.getAttribute('aria-label'))
  pruefe(aktiv === 'Lernzielkontrolle', `Klick öffnet im Programm „Lernzielkontrolle" (aktiv: ${aktiv})`)
  pruefe((await sichtbar(page.getByText('Gespeichert: Prüflauf Potenzen')).count()) === 1, '… mit genau dieser Kontrolle')

  // Suche auf der Startseite findet den Bereich
  await page.click('[aria-label="Startseite"]')
  await page.waitForTimeout(500)
  await page.getByRole('textbox', { name: 'Materialien durchsuchen' }).fill('potenzen')
  await page.waitForTimeout(300)
  pruefe((await sichtbar(page.locator('[data-home-bereich="Potenzen"]')).count()) === 1, 'Startseiten-Suche findet den Themenbereich')

  // ---------- Dunkelmodus
  await page.evaluate(() => window.api.settings.set({ appearance: { colorScheme: 'dark' } }))
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await shot('bibliothek-dunkel')
  await ordner('Potenzen').getByRole('button', { name: 'Themenbereich „Potenzen“ öffnen' }).click()
  await page.waitForTimeout(600)
  await shot('bereich-dunkel')
  const flaechen = await page.evaluate(() =>
    [...document.querySelectorAll('.material-huelle > .mantine-Card-root')].map((k) => getComputedStyle(k).backgroundColor)
  )
  pruefe(new Set(flaechen).size === 2, `Dunkel: Arbeitsblatt und Kontrolle unterschiedlich getönt (${[...new Set(flaechen)].join(' / ')})`)
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

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
