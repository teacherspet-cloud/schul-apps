// Wache für Paket 13 – Schulsuche, Vorgabe-Logo, Themenbaum nach Lehrplan NI – OHNE KI
// (vorher: npm run build). Aufruf: node tests/e2e/schulsuche.mjs <Ausgabeordner> [Bildschirmfotos]
//
// Wünsche der Lehrkraft (26.09.2026):
//  1. Beim Feld „Schulname" (Einrichtungsassistent und Einstellungen › Schule) Schulen aus dem
//     Verzeichnis der Länder vorschlagen – „Heine" findet Heinrich-Heine-Schulen, „Weserm" das
//     Gymnasium Wesermünde, mit Ort; Bundesland/Schulform unaufdringlich zur Übernahme anbieten;
//     Quellen und Lizenzen auffindbar.
//  2. Das mitgelieferte Logo des Gymnasiums Wesermünde wird bei dessen Wahl gesetzt – ohne
//     Rückfrage nur, wenn noch kein Logo da ist; sonst nach kurzer Rückfrage.
//  3. Themenbereiche nach der Lehrplandatei NI: Bereichsnamen ohne Kompetenzsätze, Wortlaut als
//     Tooltip, Oberstufe getrennt von der Sek I.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/schulsuche')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-schulsuche-'))
const vorgabeLogo = `data:image/png;base64,${readFileSync(resolve('resources/schulen/logos/NI-67052.png')).toString('base64')}`

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 1000))
  await warteAufOberflaeche(page, 3, { assistent: true })
  const sichtbar = (loc) => loc.filter({ visible: true })
  const feld = () => sichtbar(page.locator('input[data-schulsuche]')).first()
  const optionen = () => sichtbar(page.locator('[role="option"]'))

  // ---------- 1) Im Einrichtungsassistenten: „Heine"
  console.log('\nSchulsuche im Einrichtungsassistenten')
  const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
  await page.waitForTimeout(1500)
  pruefe((await assistent.count()) > 0, 'Einrichtungsassistent ist da')
  // Am PC steht IServ als erster Schritt vorn (seit „IServ first in the setup") – zum Schritt „Schule" wechseln
  if (!(await feld().count())) await assistent.locator('.mantine-Stepper-step', { hasText: 'Schule' }).first().click()
  await page.waitForTimeout(400)
  pruefe((await feld().count()) === 1, 'Der Assistent zeigt das Feld mit Schulsuche')
  pruefe(Boolean(await page.evaluate(() => window.api.branding.getLogo())) === false, 'Anfangs ist kein Logo gesetzt')
  await feld().click()
  await feld().fill('Heine')
  await page.waitForTimeout(900)
  const heine = await optionen().allInnerTexts()
  pruefe(heine.length >= 10 && heine.length <= 30, `„Heine": ${heine.length} Treffer (höchstens 30)`)
  pruefe(heine.filter((t) => /Heinrich.Heine/.test(t)).length >= 8, 'Darunter Heinrich-Heine-Schulen')
  pruefe(
    heine.every((t) => /\d{5}|·/.test(t)),
    'Jeder Treffer nennt Ort bzw. PLZ'
  )
  await page.screenshot({ path: join(shots, 'paket13-schulsuche-heine.png') })

  // Eine Hamburger Schule wählen: Land weicht von NI ab → Übernahme wird angeboten
  const hh = optionen().filter({ hasText: 'Hamburg' }).first()
  if (await hh.count()) {
    await hh.click()
    await page.waitForTimeout(700)
    const hinweis = sichtbar(page.locator('[data-schule-uebernehmen]'))
    pruefe((await hinweis.count()) === 1 && /Hamburg/.test(await hinweis.innerText()), 'Abweichendes Bundesland wird zur Übernahme angeboten')
    pruefe(
      (await page.evaluate(() => window.api.settings.get().then((s) => s.defaults.stateId))) === 'NI',
      'Ohne Klick bleibt das Bundesland unverändert (unaufdringlich)'
    )
  } else pruefe(false, '„Heine" findet eine Hamburger Schule')

  // ---------- 2) „Weserm" → Gymnasium Wesermünde samt Logo (noch keins gesetzt → ohne Rückfrage)
  console.log('\nGymnasium Wesermünde')
  await feld().fill('Weserm')
  await page.waitForTimeout(900)
  const weserm = optionen().filter({ hasText: 'Gymnasium Wesermünde' })
  pruefe((await weserm.count()) === 1, '„Weserm" findet das Gymnasium Wesermünde')
  pruefe(
    /27570 Bremerhaven/.test(await weserm.first().innerText()) && /logo/i.test(await weserm.first().innerText()),
    'Treffer mit PLZ, Ort und Logo-Kennzeichen'
  )
  await weserm.first().click()
  await page.waitForTimeout(1500)
  const einst = await page.evaluate(() => window.api.settings.get())
  pruefe(einst.schoolName === 'Gymnasium Wesermünde', `Schulname gesetzt („${einst.schoolName}")`)
  pruefe((await page.evaluate(() => window.api.branding.getLogo())) === vorgabeLogo, 'Das Vorgabe-Logo ist ohne Rückfrage gesetzt (vorher keins)')
  pruefe((await sichtbar(page.locator('[data-schule-uebernehmen]')).count()) === 0, 'NI/Gymnasium stimmen – kein Übernahme-Hinweis')
  // Anschrift (09.10.2026): Die Hamburger Schule hat die leeren Felder gefüllt; die zweite Wahl überschreibt sie
  // nicht still, sondern bietet „Daten aus dem Schulverzeichnis übernehmen" an
  pruefe(Boolean(einst.briefkopf?.plz) && einst.briefkopf.plz !== '27570', `Anschrift der ersten Wahl bleibt (PLZ ${einst.briefkopf?.plz})`)
  const abweichung = sichtbar(page.locator('[data-verzeichnis-abweichung]'))
  pruefe((await abweichung.count()) === 1 && /27570/.test(await abweichung.innerText()), 'Abweichende Anschrift wird zur Übernahme angeboten')
  if (await abweichung.count()) {
    await abweichung.locator('[data-verzeichnis-uebernehmen]').click()
    await page.waitForTimeout(700)
    const nach = await page.evaluate(() => window.api.settings.get())
    pruefe(nach.briefkopf?.plz === '27570' && nach.briefkopf?.ort === 'Bremerhaven', 'Nach dem Klick: Anschrift aus dem Verzeichnis')
  }
  await page.screenshot({ path: join(shots, 'paket13-schulsuche-wesermuende.png') })
  await assistent.getByRole('button', { name: 'Später einrichten' }).click()
  await page.waitForTimeout(800)

  // ---------- In den Einstellungen: anderes Logo → Rückfrage; Freitext bleibt möglich; Quellen
  console.log('\nEinstellungen › Schule')
  // Ein anderes (eigenes) Logo: 1×1-PNG
  const eigenes = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  await page.evaluate((png) => window.api.branding.setLogo(png), eigenes)
  await page.reload()
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Einstellungen"]')
  await page.waitForTimeout(800)
  await feld().click()
  await feld().fill('wesermuende')
  await page.waitForTimeout(900)
  await optionen().filter({ hasText: 'Gymnasium Wesermünde' }).first().click()
  await page.waitForTimeout(1200)
  const frage = sichtbar(page.locator('[data-logo-frage]'))
  pruefe((await frage.count()) === 1, 'Mit eigenem Logo: Rückfrage „Logo der Schule übernehmen?"')
  pruefe((await page.evaluate(() => window.api.branding.getLogo())) === eigenes, 'Das eigene Logo bleibt bis zur Antwort unangetastet')
  await frage.getByRole('button', { name: 'Übernehmen' }).click()
  await page.waitForTimeout(800)
  pruefe((await page.evaluate(() => window.api.branding.getLogo())) === vorgabeLogo, 'Nach „Übernehmen" ist das Schullogo gesetzt')

  // Freie Eingabe
  await feld().fill('Gymnasium Wesermünde – Außenstelle Langen')
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(600)
  pruefe(
    (await page.evaluate(() => window.api.settings.get().then((s) => s.schoolName))) === 'Gymnasium Wesermünde – Außenstelle Langen',
    'Freier Wortlaut wird gespeichert'
  )

  // Quellen und Lizenzen
  await sichtbar(page.getByRole('button', { name: 'Quellen und Lizenzen' }))
    .first()
    .click()
  await page.waitForTimeout(800)
  const quellen = sichtbar(page.locator('[data-schulquellen]'))
  const qText = (await quellen.count()) ? await quellen.first().innerText() : ''
  pruefe(/OpenStreetMap/.test(qText) && /Landesamt für Statistik Niedersachsen/.test(qText) && /CC BY/.test(qText), 'Quellenvermerk mit Lizenzen')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await sichtbar(page.getByRole('tab', { name: 'Wartung' })).click()
  await page.waitForTimeout(800)
  pruefe((await sichtbar(page.locator('[data-quellen-karte] [data-schulquellen]')).count()) === 1, 'Quellen auch unter Einstellungen › Wartung')

  // Netz-/Tablet-Modus: die Aufrufe sind freigegeben (nur lesend)
  const netz = await page.evaluate(() => window.api.schulen.suche('Weserm', { land: 'NI' }).then((t) => t.map((x) => x.id)))
  pruefe(netz.includes('NI-67052'), 'Suche über die Programmschnittstelle')

  // ---------- 3) Themenbaum nach Lehrplan NI (Automatik)
  console.log('\nThemenbaum nach Lehrplan NI')
  const blatt = (id, name, subjectId, subjectLabel, grade, topic, stateId = 'NI') => ({
    id,
    name,
    stats: { subjectId, subjectLabel, topic, grade, schoolTypeName: 'Gymnasium', stateId, schoolTypeId: 'gymnasium', sheetCount: 1, hasBoard: false },
    payload: {}
  })
  await page.evaluate(
    async (blaetter) => {
      for (const b of blaetter) await window.api.sheets.save(b)
    },
    [
      blatt('p13g0001', 'Julikrise 1914', 'geschichte', 'Geschichte', 8, 'Erster Weltkrieg'),
      blatt('p13g0002', 'Erster Weltkrieg – Materialschlachten', 'geschichte', 'Geschichte', 8, 'Erster Weltkrieg'),
      blatt('p13g0003', 'Krisenjahr 1923', 'geschichte', 'Geschichte', 9, 'Weimarer Republik'),
      blatt('p13g0004', 'Weimarer Verfassung', 'geschichte', 'Geschichte', 9, 'Weimarer Republik'),
      blatt('p13g0005', 'Krisenherd Balkan', 'geschichte', 'Geschichte', 12, 'Der Balkan vor 1914'),
      blatt('p13m0001', 'Lineare Gleichungen lösen', 'mathematik', 'Mathematik', 8, 'Lineare Gleichungen'),
      blatt('p13m0002', 'Lineare Funktionen – Steigung', 'mathematik', 'Mathematik', 8, 'Lineare Zusammenhänge'),
      blatt('p13m0003', 'Lineare Zusammenhänge im Alltag', 'mathematik', 'Mathematik', 8, 'Lineare Zusammenhänge'),
      blatt('p13b0001', 'Zellatmung', 'biologie', 'Biologie', 12, 'Leben und Energie'),
      blatt('p13b0002', 'Fotosynthese', 'biologie', 'Biologie', 12, 'Leben und Energie')
    ]
  )
  await page.reload()
  await warteAufOberflaeche(page)
  await page.waitForTimeout(2500)
  const d = await page.evaluate(() => window.api.themen.list())
  const namen = d.bereiche.map((b) => b.name)
  console.log(`  Bereiche: ${namen.join(' | ')}`)
  pruefe(
    namen.includes('Weimarer Republik') && namen.includes('Der Erste Weltkrieg') && namen.includes('Krisenherd Balkan'),
    'Geschichte: Bereiche aus dem KC, Q-Phase mit Pfad'
  )
  pruefe(namen.includes('Lineare Zusammenhänge') && namen.includes('Lineare Gleichungen'), 'Mathematik: Bereiche aus dem KC')
  pruefe(namen.includes('Leben und Energie'), 'Biologie: Inhaltsbereich der Q-Phase')
  pruefe(
    !namen.some((n) => /analysieren|lösen|anwenden|\(|Inhaltsbereich/.test(n) || n.split(/\s+/).length > 8),
    'Keine Kompetenzsätze, Klammern oder Nummern-Vorsätze als Namen'
  )
  const weimar = d.bereiche.find((b) => b.name === 'Weimarer Republik')
  pruefe(weimar?.wortlaut === 'Weimarer Republik – Chancen und Belastungen', `Wortlaut bleibt erhalten (${weimar?.wortlaut})`)

  // Ansicht: Themenbereiche der Arbeitsblätter, Geschichte und Mathematik aufgeklappt
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(400)
  const knopf = sichtbar(page.getByRole('button', { name: 'Meine Arbeitsblätter', exact: true }))
  if (await knopf.count()) await knopf.click()
  await page.waitForTimeout(900)
  for (const fach of ['geschichte', 'mathematik', 'biologie']) {
    const abschnitt = sichtbar(page.locator(`[data-fach-abschnitt="${fach}"]`)).first()
    if ((await abschnitt.count()) && (await abschnitt.getAttribute('data-offen')) !== 'true') {
      await abschnitt
        .getByRole('button', { name: /aufklappen$/ })
        .first()
        .click()
      await page.waitForTimeout(300)
    }
  }
  for (const name of ['Der Erste Weltkrieg', 'Ursachen und Anlass des Ersten Weltkrieges', 'Lineare Zusammenhänge', 'Elementare Termumformungen']) {
    const auf = sichtbar(page.getByRole('button', { name: `„${name}“ aufklappen` }))
    if (await auf.count()) {
      await auf.first().click()
      await page.waitForTimeout(250)
    }
  }
  const tooltipZiel = sichtbar(page.locator('[data-wortlaut^="Weimarer Republik –"]'))
  pruefe((await tooltipZiel.count()) >= 1, 'Gekürzter Name trägt den Wortlaut als Tooltip')
  if (await tooltipZiel.count()) {
    await tooltipZiel.first().hover()
    await page.waitForTimeout(900)
  }
  await page.screenshot({ path: join(shots, 'paket13-themenbaum-ni.png') })
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nSchulsuche, Vorgabe-Logo und Themenbaum nach Lehrplan NI in Ordnung.')
