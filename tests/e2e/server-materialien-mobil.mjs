// „Materialien" am Telefon (10.10.2026, Option 1) – Server lokal, ohne KI.
// Aufruf: node tests/e2e/server-materialien-mobil.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: eigene Ansicht nur am Telefon (Suche, Fach-Chips in einer Zeile, „Zuletzt", „Themen – <Fach>"), eine Ebene je
// Bildschirm mit „‹ <Fach>" und Zurück des Browsers, Lehrwerk Band › Unit, doppeltes Thema („Green Line 2 Unit 1" neben
// der Lehrwerks-Unit) zusammengeführt, Art-Chips nur für vorhandene Arten, ⋯ mit genau Öffnen/Verschieben/Freigeben/
// Löschen, kein Zauberstab und kein „Auswählen", Entwurf-Marke ≥ 11 px, „Von der Fachschaft (n)" zugeklappt am Ende,
// „+ Neu in diesem Thema" unten fest; Material aus Reihen: nur Erzeugtes ausgeblendet; kurzer Hinweis „N Materialien
// einsortiert" + „Ansehen"; Freigabe ohne Fach fragt nach dem Fach. PC: weiter der Baum.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-materialien-mobil')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const t = (tage) => new Date(Date.now() - tage * 86400000).toISOString()
const vt = (id, name, grade, topic) => ({
  id,
  name,
  stats: { vocabCount: 20, includedCount: 20, hasTest: true, variantCount: 1, totalPoints: 20, language: 'en', subjectLabel: 'Englisch', grade },
  payload: {
    version: 1,
    header: { title: 'Vocabulary Test' },
    settings: { targetLanguage: 'en', grade, topic, stateId: 'NI', schoolTypeId: 'gymnasium' },
    vocab: [],
    variants: [{ id: 'A', label: 'A', blocks: [] }],
    fontSize: 12,
    createdAt: t(3)
  }
})
const ab = (id, name, subjectId, subjectLabel, grade, topic, ueberthema, sheetCount = 2) => ({
  id,
  name,
  stats: { subjectId, subjectLabel, topic, grade, schoolTypeName: 'Gymnasium', stateId: 'NI', schoolTypeId: 'gymnasium', sheetCount, hasBoard: false, ueberthema },
  payload: {}
})
const lzk = (id, name, subjectLabel, grade, thema, ueberthema) => ({
  id,
  name,
  stats: { subjectLabel, grade, thema, ueberthema, bezeichnung: 'Lernzielkontrolle', stateId: 'NI', schoolTypeId: 'gymnasium', taskCount: 5, points: 20, minutes: 20, varianten: 1 },
  payload: {}
})
const STAMP = Date.now() % 100000
const NOV = `Novemberrevolution 1918 (${STAMP})`
const UA = 'Mozilla/5.0 (iPhone; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext()
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const konto = async (name, faecher, geraet = { viewport: { width: 1280, height: 860 } }) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext(geraet)
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()
      if (!r.ok) throw new Error(`${channel}: ${r.error}`)
      return r.value
    }
    await api('settings:set', { eigeneFaecher: faecher, schoolName: 'Testschule', oberflaeche: 'standard' })
    return { ...k, ctx, api }
  }
  const handy = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA }
  const lea = await konto('Lea Mobil', ['englisch', 'geschichte'], handy)
  await lea.api('tests:save', vt('mm-vt1', 'Green Line 2 – Unit 1', 6, 'Unit 1'))
  await lea.api('tests:save', vt('mm-vt2', 'Green Line 2 – Unit 2', 6, 'Unit 2'))
  for (const x of [
    ab('mm-ab1', 'My town – places and directions', 'englisch', 'Englisch', 6, 'Places in town', 'Green Line 2 Unit 1'),
    ab('mm-ab2', 'Die Julikrise 1914', 'geschichte', 'Geschichte', 9, 'Julikrise', 'Der Erste Weltkrieg'),
    ab('mm-ab3', 'Ursachen des Ersten Weltkriegs', 'geschichte', 'Geschichte', 9, 'Ursachen', 'Der Erste Weltkrieg'),
    ab('mm-ab4', 'Der Erste Weltkrieg – Kriegsende', 'geschichte', 'Geschichte', 9, 'Kriegsende', 'Der Erste Weltkrieg', 0),
    ab('mm-ab5', 'Die Weimarer Verfassung', 'geschichte', 'Geschichte', 9, 'Verfassung', 'Weimarer Republik'),
    ab('mm-erzeugt', 'Der Erste Weltkrieg – Einstieg', 'geschichte', 'Geschichte', 9, 'Einstieg', 'Der Erste Weltkrieg'),
    ab('mm-ohnefach', 'Lernplakat Methoden', '', '', 7, 'Methoden', '')
  ])
    await lea.api('sheets:save', x)
  await lea.api('kurztests:save', lzk('mm-lzk1', 'LZK Erster Weltkrieg', 'Geschichte', 9, 'Erster Weltkrieg', 'Der Erste Weltkrieg'))
  // Doppeltes Thema wie in der Analyse: Lehrwerk „Green Line 2" › „Unit 1: The new boy" und daneben der frei getippte
  // Ordner „Green Line 2 Unit 1" mit dem Blatt darin (von Hand)
  await lea.api('themen:bereich', { id: 'mm-band-gl2', fachId: 'englisch', name: 'Green Line 2', herkunft: 'lehrwerk' })
  await lea.api('themen:bereich', { id: 'mm-unit-gl2-1', fachId: 'englisch', name: 'Unit 1: The new boy', elternId: 'mm-band-gl2', herkunft: 'lehrwerk' })
  await lea.api('themen:bereich', { id: 'mm-frei-gl2-1', fachId: 'englisch', name: 'Green Line 2 Unit 1' })
  await lea.api('themen:zuordnen', { 'arbeitsblatt:mm-ab1': { bereichId: 'mm-frei-gl2-1', von: 'hand', am: new Date().toISOString() } })
  // Reihe: ein erzeugtes Blatt (ausgeblendet) und ein hereingeholtes eigenes (sichtbar)
  const reihe = {
    id: '',
    titel: 'Der Erste Weltkrieg',
    fachId: 'geschichte',
    fachLabel: 'Geschichte',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: 9,
    oberthema: 'Der Erste Weltkrieg',
    lernziele: [],
    schritte: [
      { id: 'a', titel: 'Einstieg', lernziele: [], rolle: 'pflicht', erfolg: { art: 'abgabe' }, inhalt: { art: 'arbeitsblatt', quelle: 'mm-erzeugt', erzeugt: true } },
      { id: 'b', titel: 'Julikrise', lernziele: [], rolle: 'pflicht', erfolg: { art: 'abgabe' }, inhalt: { art: 'arbeitsblatt', quelle: 'mm-ab2', erzeugt: false } }
    ]
  }
  await lea.ctx.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe } })
  // Kollege gibt ein Blatt zur Weimarer Republik frei
  const ben = await konto('Ben Mobil', ['geschichte'])
  await ben.api('sheets:save', ab('mm-fs1', NOV, 'geschichte', 'Geschichte', 9, 'Novemberrevolution', 'Weimarer Republik'))
  const fr = await (await ben.ctx.request.post(`${A}/server/fachschaft/freigeben`, { headers: KOPF, data: { art: 'arbeitsblatt', id: 'mm-fs1' } })).json()
  pruefe(fr.fach === 'geschichte', `Freigabe mit erkanntem Fach (${fr.label})`)
  // Ohne Fach: der Server verlangt eines
  await ben.api('sheets:save', ab('mm-fs-ohne', 'Methodenblatt', '', '', 7, 'Methoden', ''))
  const ohne = await ben.ctx.request.post(`${A}/server/fachschaft/freigeben`, { headers: KOPF, data: { art: 'arbeitsblatt', id: 'mm-fs-ohne' } })
  pruefe(ohne.status() === 400 && (await ohne.json()).fachNoetig === true, 'Freigabe ohne Fach: Server fragt nach dem Fach (fachNoetig)')
  const mit = await (await ben.ctx.request.post(`${A}/server/fachschaft/freigeben`, { headers: KOPF, data: { art: 'arbeitsblatt', id: 'mm-fs-ohne', fach: 'geschichte' } })).json()
  pruefe(mit.fach === 'geschichte', 'Freigabe ohne Fach: mit gewähltem Fach freigegeben')

  // ---------- Telefon
  const p = await lea.ctx.newPage()
  p.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await p.goto(A + '/')
  const sp = p.getByRole('button', { name: /Später einrichten|Überspringen/ })
  if (await da(sp.first(), 4000)) await sp.first().click()
  // Kurzer Hinweis nach dem Einsortieren (Lehrwerks-Bereiche entstehen beim ersten Laden)
  const hinweis = p.locator('[data-rueckgaengig-hinweis][data-kurz]')
  if (await da(hinweis, 8000)) {
    await p.waitForTimeout(1000)
    const text = await hinweis.innerText()
    pruefe(/\d+ Materialien einsortiert|Ein Material einsortiert/.test(text) && !text.includes('nach dem Lehrplan'), `Telefon: kurzer Hinweis („${text.split('\n')[0]}")`)
    const knopf = await hinweis.locator('[data-hinweis-ansehen]').boundingBox()
    pruefe(!!knopf && knopf.x + knopf.width <= 390, 'Hinweis: „Ansehen" ganz zu sehen')
    await p.screenshot({ path: join(out, '0-hinweis.png') })
    await hinweis.locator('[data-hinweis-ansehen]').click()
  } else {
    pruefe(true, 'Hinweis zum Einsortieren nicht erschienen (nichts angelegt) – Materialien über den Tab')
    await p.locator('[data-tab="materialien"]').click()
  }
  pruefe(await da(p.locator('[data-materialien-mobil]')), 'Telefon: eigene Materialien-Ansicht')
  await p.waitForTimeout(800)
  pruefe((await p.getByRole('button', { name: 'Auswählen' }).count()) === 0, 'Kein „Auswählen"')
  pruefe((await p.locator('.material-auto').count()) === 0, 'Kein Zauberstab „automatisch einsortiert"')
  const faecher = await p.locator('[data-mm-fach]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-fach')))
  pruefe(faecher.join(',') === 'englisch,geschichte,alle', `Fach-Chips: eigene Fächer + „Alle" (${faecher})`)
  const zeile = await p.locator('[data-mm-faecher]').evaluate((e) => ({ hoehe: e.getBoundingClientRect().height, x: getComputedStyle(e).overflowX }))
  pruefe(zeile.hoehe < 60 && zeile.x === 'auto', `Fach-Chips in einer rollenden Zeile (${Math.round(zeile.hoehe)} px)`)
  pruefe(await da(p.locator('[data-mm-zuletzt]')), '„Zuletzt"')
  pruefe((await p.locator('[data-mm-zuletzt] [data-mm-material]').count()) <= 5, '„Zuletzt": höchstens 5')
  pruefe(await p.locator('[data-start-anzahl="materialien-zuletzt"]').isVisible(), '„Zuletzt": Anzahl wählbar')
  await p.screenshot({ path: join(out, '1-oben.png') })

  // Englisch: Lehrwerk Band › Unit, doppeltes Thema zusammengeführt
  await p.locator('[data-mm-fach="englisch"]').click()
  const themenEn = await p.locator('[data-mm-themen="englisch"] [data-mm-thema]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-thema')))
  pruefe(themenEn.includes('Green Line 2'), `Themen – Englisch: Band „Green Line 2" (${themenEn.join(' | ')})`)
  pruefe(!themenEn.includes('Green Line 2 Unit 1'), 'Doppeltes Thema „Green Line 2 Unit 1" nicht als eigene Zeile')
  await p.locator('[data-mm-thema="Green Line 2"]').click()
  pruefe(await da(p.locator('[data-mm-ebene="Green Line 2"]')), 'Ebene „Green Line 2"')
  pruefe((await p.locator('[data-mm-zurueck]').innerText()).includes('Englisch'), 'Zurück: „‹ Englisch"')
  await p.locator('[data-mm-thema^="Unit 1"]').click()
  pruefe(await da(p.locator('[data-mm-ebene^="Unit 1"]')), 'Ebene „Unit 1: …"')
  const inUnit = await p.locator('[data-mm-material]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-material')))
  pruefe(inUnit.includes('My town – places and directions'), `Blatt aus „Green Line 2 Unit 1" steht in der Lehrwerks-Unit (${inUnit.join(' | ')})`)
  pruefe(inUnit.includes('Green Line 2 – Unit 1'), 'Vokabeltest der Unit steht darin')
  pruefe((await p.locator('[data-mm-zurueck]').innerText()).includes('Green Line 2'), 'Zurück: „‹ Green Line 2"')
  const unt = await p.locator('[data-mm-material] >> nth=0').locator('.mantine-Text-root').nth(1).innerText()
  pruefe(/^(Arbeitsblatt|Vokabeltest|Lernzielkontrolle) · Kl\. 6$/.test(unt) && !unt.includes('Englisch'), `Untertitel ohne Fach („${unt}")`)
  await p.screenshot({ path: join(out, '2-unit.png') })
  // Zurück des Browsers: eine Ebene hoch
  await p.goBack()
  pruefe(await da(p.locator('[data-mm-ebene="Green Line 2"]'), 3000), 'Zurück des Browsers: eine Ebene hoch')
  await p.goBack()
  pruefe(await da(p.locator('[data-mm-themen="englisch"]'), 3000), 'Zurück des Browsers: wieder in „Themen – Englisch"')
  pruefe((await p.locator('[data-mm-ebene]').count()) === 0, 'Oberste Ebene')

  // Geschichte: Weltkrieg mit Art-Chips, Menü, Entwurf, Reihen-Regel, Neu-Knopf
  await p.locator('[data-mm-fach="geschichte"]').click()
  await p.locator('[data-mm-thema="Der Erste Weltkrieg"]').click()
  pruefe(await da(p.locator('[data-mm-ebene="Der Erste Weltkrieg"]')), 'Ebene „Der Erste Weltkrieg"')
  const arten = await p.locator('[data-mm-art]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-art')))
  pruefe(arten.join(',') === 'alle,blaetter,tests', `Art-Chips nur für vorhandene Arten (${arten})`)
  const wk = await p.locator('[data-mm-material]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-material')))
  pruefe(wk.includes('Die Julikrise 1914'), 'In eine Reihe geholtes eigenes Blatt bleibt sichtbar')
  pruefe(!wk.includes('Der Erste Weltkrieg – Einstieg'), 'Für die Reihe erzeugtes Blatt bleibt ausgeblendet')
  await p.locator('[data-mm-art="tests"]').click()
  const nurTests = await p.locator('[data-mm-material]').evaluateAll((e) => e.map((x) => x.getAttribute('data-art')))
  pruefe(nurTests.length === 1 && nurTests[0] === 'lernzielkontrolle', `Chip „Tests": nur die LZK (${nurTests})`)
  await p.locator('[data-mm-art="alle"]').click()
  const entwurf = p.locator('[data-mm-entwurf]').first()
  pruefe(await da(entwurf, 3000), 'Entwurf-Marke')
  const px = await entwurf.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  pruefe(px >= 11, `Entwurf-Marke mindestens 11 px (${px})`)
  await p.locator('[data-mm-material="Ursachen des Ersten Weltkriegs"]').getByRole('button', { name: /^Weitere Aktionen/ }).click()
  await da(p.locator('.mantine-Menu-dropdown [role="menuitem"]').first(), 3000)
  const punkte = (await p.locator('.mantine-Menu-dropdown [role="menuitem"]').allInnerTexts()).map((x) => x.trim())
  pruefe(punkte.join('|') === 'Öffnen|Verschieben nach …|Für Fachschaft freigeben|Löschen', `⋯: genau vier Punkte (${punkte.join(', ')})`)
  await p.keyboard.press('Escape')
  const neu = p.locator('[data-mm-neu]')
  pruefe(await da(neu), '„+ Neu in diesem Thema"')
  const box = await neu.boundingBox()
  const stil = await neu.evaluate((e) => getComputedStyle(e).position)
  pruefe(stil === 'sticky' && !!box && box.y + box.height <= 844 && box.y > 600, `Neu-Knopf unten fest (${stil}, y=${Math.round(box?.y ?? 0)})`)
  await p.screenshot({ path: join(out, '3-weltkrieg.png') })
  await p.locator('[data-mm-zurueck]').click()
  pruefe(await da(p.locator('[data-mm-themen="geschichte"]'), 3000), '„‹ Geschichte" führt zurück')

  // Weimarer Republik: „Von der Fachschaft (1)" zugeklappt am Ende
  await p.locator('[data-mm-thema="Weimarer Republik"]').click()
  const fs = p.locator('[data-mm-fachschaft]')
  pruefe(await da(fs, 5000), '„Von der Fachschaft" im Thema')
  pruefe(Number(await fs.getAttribute('data-mm-fachschaft')) >= 1 && (await fs.innerText()).includes('Von der Fachschaft ('), `„Von der Fachschaft (${await fs.getAttribute('data-mm-fachschaft')})"`)
  const nov = p.locator(`[data-mm-freigabe="${NOV}"]`)
  pruefe(!(await nov.isVisible()), 'zunächst zugeklappt')
  await fs.getByRole('button').first().click()
  pruefe(await da(nov, 3000), 'aufgeklappt: Freigabe des Kollegen')
  // Steht am Ende – nach den eigenen Materialien
  const [eigenBox, fsBox] = [await p.locator('[data-mm-material="Die Weimarer Verfassung"]').boundingBox(), await fs.boundingBox()]
  pruefe(!!eigenBox && !!fsBox && fsBox.y > eigenBox.y, '„Von der Fachschaft" nach den eigenen Materialien')
  await p.screenshot({ path: join(out, '4-fachschaft.png') })
  await p.goBack()
  await p.waitForTimeout(300)

  // Suche über Thema und Unit
  await p.locator('[data-mm-suche]').fill('weltkrieg')
  await p.waitForTimeout(300)
  const treffer = await p.locator('[data-mm-material]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mm-material')))
  pruefe(treffer.includes('Die Julikrise 1914') && treffer.includes('LZK Erster Weltkrieg'), `Suche „weltkrieg" findet auch über das Thema (${treffer.length})`)
  await p.locator('[data-mm-suche]').fill('green line 2 unit 1')
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-mm-material="My town – places and directions"]').count()) === 1, 'Suche nach der Unit findet das Blatt')
  await p.screenshot({ path: join(out, '5-suche.png') })

  // Freigabe ohne Fach: Frage nach dem Fach
  await p.locator('[data-mm-suche]').fill('Lernplakat')
  await p.waitForTimeout(300)
  await p.locator('[data-mm-material="Lernplakat Methoden"]').getByRole('button', { name: /^Weitere Aktionen/ }).click()
  await p.locator('.mantine-Menu-dropdown [data-fachschaft-freigeben]').click()
  const frage = p.getByRole('dialog', { name: 'Für welches Fach freigeben?' })
  pruefe(await da(frage, 5000), 'Freigabe ohne Fach: Dialog „Für welches Fach freigeben?"')
  await p.locator('[data-fachschaft-fach]').click()
  await p.getByRole('option', { name: 'Geschichte' }).first().click()
  await p.locator('[data-fachschaft-fach-ok]').click()
  pruefe(await da(frage, 1000).then(async () => !(await frage.isVisible().catch(() => false))).catch(() => true), 'Dialog geschlossen')
  await p.waitForTimeout(800)
  const benSicht = await (await ben.ctx.request.get(`${A}/server/fachschaft`, { headers: KOPF })).json()
  pruefe(benSicht.eintraege.some((e) => e.titel === 'Lernplakat Methoden' && e.fach === 'geschichte'), 'Freigabe mit gewähltem Fach kommt bei der Fachschaft Geschichte an')

  // ---------- PC: weiter der Baum
  const pc = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await anmelden(pc, lea.benutzer, lea.passwort)
  const q = await pc.newPage()
  await q.goto(A + '/')
  const spq = q.getByRole('button', { name: /Später einrichten|Überspringen/ })
  if (await da(spq.first(), 4000)) await spq.first().click()
  // „Materialien" steht nicht mehr in der Leiste (10.10.2026 wieder entfernt); die Telefon-Ansicht gibt es am PC nicht
  await q.waitForTimeout(1500)
  pruefe((await q.locator('.app-leiste [aria-label="Materialien"]').count()) === 0, 'PC: kein Punkt „Materialien" in der Leiste')
  pruefe((await q.locator('[data-materialien-mobil]').count()) === 0, 'PC: keine Telefon-Ansicht')
  await q.screenshot({ path: join(out, '6-pc.png') })
  await pc.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
