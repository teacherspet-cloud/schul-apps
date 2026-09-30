// Wache LÄNDER × SCHULFORMEN × FÄCHER – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/laender-schulformen.mjs <Ausgabeordner>
//
// Auftrag der Lehrkraft (30.09.2026): „Stelle sicher, dass alle Bundesländer, Schulformen und
// Fächer in jeder App verfügbar und vollständig eingepflegt sind – einschließlich bilingualer
// Varianten." Die Einheitstests (tests/laenderSchulformenFaecher.test.ts) prüfen den Katalog;
// hier geht es um das, was nur die laufende App zeigt:
//
// 1. Der Hauptprozess liefert die vervollständigte GER-Tabelle (alle Schulformen aller Länder).
// 2. Rückmeldung: Bundesland und Schulform wählbar (vorher nur aus den Einstellungen) – in allen
//    16 Ländern mit allen Schulformen; Fächer vollständig; Bilingual-Schalter beim Sachfach.
// 3. Klassenarbeit: die neuen Fächer (Gesellschaftslehre, Naturwissenschaften …) wählbar.
//
// Es wird nichts erzeugt und nichts gespeichert: eigenes leeres Profil.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { oeffneLerngruppe, warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/laender-schulformen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-laender-'))

/** Amtliche Schulformen je Land (Anzeigenamen), die auswählbar sein müssen */
const ERWARTET = {
  'Baden-Württemberg': [
    'Werkrealschule/Hauptschule',
    'Realschule',
    'Gemeinschaftsschule',
    'Gymnasium',
    'Berufliches Gymnasium',
    'SBBZ Lernen (Förderschwerpunkt Lernen)'
  ],
  Bayern: ['Mittelschule', 'Realschule', 'Gymnasium', 'Wirtschaftsschule', 'Fachoberschule (FOS)', 'Berufsoberschule (BOS)'],
  Berlin: ['Integrierte Sekundarschule', 'Gemeinschaftsschule', 'Gymnasium'],
  Brandenburg: ['Oberschule', 'Gesamtschule', 'Gymnasium'],
  Bremen: ['Oberschule', 'Gymnasium'],
  Hamburg: ['Stadtteilschule', 'Gymnasium'],
  Hessen: ['Förderstufe', 'Hauptschule', 'Realschule', 'Mittelstufenschule', 'Integrierte Gesamtschule', 'Kooperative Gesamtschule', 'Gymnasium'],
  'Mecklenburg-Vorpommern': ['Regionale Schule', 'Integrierte Gesamtschule', 'Kooperative Gesamtschule', 'Gymnasium', 'Fachgymnasium'],
  Niedersachsen: ['Hauptschule', 'Realschule', 'Oberschule', 'Integrierte Gesamtschule', 'Kooperative Gesamtschule', 'Gymnasium', 'Berufliches Gymnasium'],
  'Nordrhein-Westfalen': ['Hauptschule', 'Realschule', 'Sekundarschule', 'Gesamtschule', 'Gymnasium', 'Berufskolleg (berufliches Gymnasium)'],
  'Rheinland-Pfalz': ['Realschule plus', 'Integrierte Gesamtschule', 'Gymnasium'],
  Saarland: ['Gemeinschaftsschule', 'Gymnasium', 'Berufliches Oberstufengymnasium'],
  Sachsen: ['Oberschule', 'Gemeinschaftsschule', 'Gymnasium'],
  'Sachsen-Anhalt': ['Sekundarschule', 'Gemeinschaftsschule', 'Gesamtschule', 'Gymnasium', 'Fachgymnasium'],
  'Schleswig-Holstein': ['Gemeinschaftsschule', 'Gymnasium'],
  Thüringen: ['Regelschule', 'Gemeinschaftsschule', 'Gesamtschule', 'Gymnasium']
}

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)

  // ---------- 1. GER-Tabelle aus dem Hauptprozess
  const tabelle = await page.evaluate(() => window.api.cefr.get())
  pruefe(tabelle.states.length === 16, `16 Länder in der Tabelle (${tabelle.states.length})`)
  for (const [land, formen] of Object.entries(ERWARTET)) {
    const namen = tabelle.states.find((s) => s.name === land)?.schoolTypes.map((t) => t.name) ?? []
    const fehlt = formen.filter((f) => !namen.includes(f))
    pruefe(!fehlt.length, `${land}: alle Schulformen in der Tabelle${fehlt.length ? ` – es fehlt ${fehlt.join(', ')}` : ''}`)
  }
  const kgs = tabelle.states.find((s) => s.id === 'NI')?.schoolTypes.find((t) => t.id === 'kooperative-gesamtschule')
  pruefe(
    Boolean(kgs?.languages?.[0]?.grades?.['7']?.basis?.includes('nicht gesichert')),
    'Kooperative Gesamtschule NI: Niveaus von der IGS übernommen und als „nicht gesichert" gekennzeichnet'
  )

  // ---------- 2. Rückmeldung
  const sichtbar = (l) => l.filter({ visible: true }).first()
  await page.click('[aria-label="Rückmeldung"]')
  await page.getByText('Rückmeldung ohne Note', { exact: true }).waitFor({ timeout: 15000 })
  await oeffneLerngruppe(page)
  const feld = (name) => sichtbar(page.locator('.mantine-Select-root', { hasText: name }).locator('input'))
  const optionen = async () => page.getByRole('option').filter({ visible: true }).allInnerTexts()
  const waehle = async (name, wert) => {
    const f = feld(name)
    await f.click()
    await page.waitForTimeout(150)
    await page.getByRole('option', { name: wert, exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(250)
  }
  pruefe((await feld('Bundesland').count()) === 1 && (await feld('Schulform').count()) === 1, 'Rückmeldung: Bundesland und Schulform sind wählbar')

  await feld('Bundesland').click()
  await page.waitForTimeout(200)
  const laender = await optionen()
  await page.keyboard.press('Escape')
  pruefe(laender.length === 16, `Rückmeldung: 16 Bundesländer zur Wahl (${laender.length})`)

  for (const [land, formen] of Object.entries(ERWARTET)) {
    await waehle('Bundesland', land)
    await feld('Schulform').click()
    await page.waitForTimeout(200)
    const da = await optionen()
    await page.keyboard.press('Escape')
    const fehlt = formen.filter((f) => !da.includes(f))
    pruefe(
      !fehlt.length && da.some((d) => /Förder|SBBZ/.test(d)),
      `Rückmeldung ${land}: ${da.length} Schulformen${fehlt.length ? ` – es fehlt ${fehlt.join(', ')}` : ''}`
    )
  }
  // Jahrgang folgt der Schulform: Berufliches Gymnasium nur 11–13
  await waehle('Bundesland', 'Niedersachsen')
  await waehle('Schulform', 'Berufliches Gymnasium')
  await feld('Jahrgang').click()
  await page.waitForTimeout(200)
  const jahrgaenge = (await optionen()).filter((o) => /^Klasse \d+$/.test(o))
  await page.keyboard.press('Escape')
  const meta = await page.evaluate(() => window.__selftest.rmJetzt()?.meta)
  pruefe(
    meta?.grade >= 11 && meta?.schoolTypeName === 'Berufliches Gymnasium',
    `Rückmeldung: Jahrgang in die Spanne gezogen (Klasse ${meta?.grade}, ${meta?.schoolTypeName})`
  )
  pruefe(
    jahrgaenge.every((j) => Number(j.replace(/\D/g, '')) >= 11 || j === `Klasse ${meta?.grade}`),
    `Rückmeldung: Jahrgänge der Schulform (${jahrgaenge.join(', ')})`
  )

  // Fächer vollständig
  await feld('Fach').click()
  await page.waitForTimeout(200)
  const faecher = await optionen()
  await page.keyboard.press('Escape')
  const neu = [
    'Niederländisch',
    'Polnisch',
    'Tschechisch',
    'Portugiesisch',
    'Türkisch',
    'Chinesisch',
    'Gesellschaftslehre',
    'Naturwissenschaften (NaWi)',
    'Pädagogik'
  ]
  pruefe(
    neu.every((f) => faecher.includes(f)),
    `Rückmeldung: neue Fächer wählbar (${neu.filter((f) => !faecher.includes(f)).join(', ') || 'alle da'}; insgesamt ${faecher.length})`
  )

  // Bilingual beim Sachfach
  const schalter = () => page.getByRole('switch', { name: 'Bilingual unterrichten' }).filter({ visible: true })
  await waehle('Fach', 'Englisch')
  pruefe((await schalter().count()) === 0, 'Rückmeldung Englisch: kein Bilingual-Schalter')
  await waehle('Fach', 'Geschichte')
  pruefe((await schalter().count()) === 1, 'Rückmeldung Geschichte: Bilingual-Schalter vorhanden')
  if (await schalter().count()) {
    await schalter().scrollIntoViewIfNeeded()
    await schalter().click({ force: true })
    await page.waitForTimeout(500)
    const bi = await page.evaluate(() => window.__selftest.rmJetzt()?.meta?.bilingual)
    pruefe(bi?.an === true && bi?.sprache === 'en', `Rückmeldung: bilingual eingeschaltet (${JSON.stringify(bi)})`)
    await page.screenshot({ path: join(out, 'rueckmeldung-lerngruppe.png') })
  }

  // ---------- 3. Klassenarbeit: neue Fächer
  await page.click('[aria-label="Klassenarbeiten"]')
  const kaFach = sichtbar(page.locator('.mantine-Select-root', { hasText: 'Fach' }).locator('input'))
  await kaFach.waitFor({ timeout: 15000 })
  await kaFach.click()
  await page.waitForTimeout(200)
  const kaFaecher = await optionen()
  await page.keyboard.press('Escape')
  const kaNeu = ['Gesellschaftslehre', 'Naturwissenschaften', 'Arbeitslehre / WAT', 'Pädagogik']
  pruefe(
    kaNeu.every((f) => kaFaecher.includes(f)),
    `Klassenarbeit: neue Fächer wählbar (${kaFaecher.length} Fächer)`
  )
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nLänder, Schulformen, Fächer und Bilingual-Schalter in Ordnung.')
