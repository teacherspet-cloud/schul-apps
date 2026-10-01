// Wache für Material von einer eigenen Internetadresse in der Klassenarbeit (01.10.2026) – mit
// KI-ATTRAPPE und lokaler Test-Adresse (HTML aus tests/fixtures/artikel-olk.json, ohne Netz).
// (vorher: npm run build)
// Aufruf: node tests/e2e/klausur-material-url.mjs <Ausgabeordner>
//
// Befunde der Lehrkraft:
//  1. Die Adresse rechts unter „Material für die Arbeit" wurde ungekürzt und mit Seitenbeiwerk
//     („News", Datum, Vorspann, „© … Polaris/laif") als Sprachmittlungstext eingesetzt.
//  2. Die Aufgabe trug Hilfen: Kasten „Adressat · Textsorte · Zweck" und Teilpunkte „Outline why …".
//  3. (01.10.2026, später) Das Material hieß „M1 Bewertung: 2" (Bewertungswidget als Schlagzeile), der
//     Text hatte 455 Wörter bei 450–650 („150 Wörter zu kurz"), und unter der Sprachmittlung stand die
//     Operatorenliste mit deutscher Vorbemerkung des Ministeriums und Aufgabenbeispiel.
// Geprüft über die Oberfläche (Englisch, Klasse 12, Sprachmittlung):
//  - der deutsche Text steht gekürzt im Zielbereich (450–650 Wörter), wörtlich, ohne Beiwerk,
//    mit kursivem Einleitungssatz und Quellenzeile „(gekürzt)" samt Medium, Datum und Adresse,
//  - das Schülerblatt hat keinen Hilfekasten und keine Teilpunkte; sie stehen im Erwartungshorizont,
//  - Fixtur MIT Bewertungswidget (artikel-bewertung.json): Titel ist die Schlagzeile, kein Widget im Text,
//  - der Text erreicht mindestens die Mitte des Zielbereichs (550 Wörter) – die KI-Attrappe liefert
//    absichtlich nur rund 505 Wörter, also greift die auffüllende Absatzkürzung,
//  - Operatorenliste (NI, an): eigener Anhang am Ende, knapp, ohne Vorbemerkung und Beispiel; die
//    Vorbemerkung sieht nur die Lehrkraft.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/klausur-material-url')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-material-url-'))
// Olk-Fixtur mit Bewertungswidget über der Schlagzeile und unter dem Text (01.10.2026)
const olk = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'artikel-bewertung.json'), 'utf8'))

/** Wörtlicher Ausschnitt aus den Absätzen, Lücken mit […] – so, wie eine gute KI kürzen würde */
const ausschnitt = (indizes) => {
  const teile = []
  indizes.forEach((i, k) => {
    if (k > 0 && i !== indizes[k - 1] + 1) teile.push('[…]')
    teile.push(olk.absaetze[i])
  })
  return teile.join('\n\n')
}
const woerter = (t) => (t.replace(/\[\s*(?:…|\.\.\.)\s*\]/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length

const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
const aufgabe = {
  outlineIndex: 0,
  type: 'task',
  skill: 'mediation',
  instruction:
    "You are contributing to the website of your British partner school, whose drama group is preparing a Shakespeare festival. **Write** an article for the partner school's website based on M{quelle}, presenting the expert's view on why Shakespeare's plays still matter today.",
  operator: 'write',
  afb: 'III',
  solution: 'Sinngemäße Wiedergabe zählt.',
  points: 20,
  answer: { kind: 'lines', lines: 20 },
  brief: {
    situation: '',
    audience: "The British partner school's drama group and website readers",
    textType: 'Website article',
    purpose: 'To inform readers about why Shakespeare is still relevant',
    words: 250,
    points: [
      'Outline why the plays are still performed',
      'Explain why the texts stay open',
      'Present how theatre reinvents them',
      'Evaluate what they offer young people'
    ],
    criteria: ['Content', 'Language'],
    expected: [],
    model: 'Shakespeare still matters …'
  }
}
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 120,
    protokoll,
    bildsuche: [],
    // Lokale Test-Adresse: die Seite als HTML – sie läuft durch dieselbe Fließtext-Extraktion wie im Betrieb
    quellen: { treffer: [], texte: { [olk.url]: { titel: olk.seitentitel, html: olk.html } } },
    websuche: [],
    antworten: {
      material_quellenangabe: {
        urheber: 'Claudia Olk',
        titel: 'Shakespeares Werke: Betörend, verstörend',
        publikationsort: 'EINSICHTEN. Das Forschungsmagazin der LMU München',
        datum: '10.03.2025'
      },
      // Rund 505 Wörter: im Bereich 450–650, aber unter der Mitte – gilt jetzt als zu kurz
      material_zuschnitt: {
        gekuerzt: ausschnitt([0, 1, 3, 4, 5, 7]),
        begruendung: 'Macht, Offenheit und junges Publikum – passend zur Sprachmittlung.',
        worthilfen: []
      },
      material_artikelpruefung: { nurArtikeltext: true, fremd: [] },
      material_einleitung: {
        einleitung: 'Am 10.03.2025 erklärt die LMU-Anglistin Claudia Olk im Magazin EINSICHTEN, warum Shakespeares Dramen bis heute lebendig wirken:',
        angaben: []
      },
      material_suche: { begriffe: ['Shakespeare heute Theater'], kernbegriffe: ['Shakespeare'], gesucht: 'Artikel' },
      material_relevanz: { bewertungen: [] },
      exam_part: { blocks: [aufgabe] }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const sichtbar = (l) => l.filter({ visible: true }).first()

let app = null
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe } })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)

  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(1500)
  if (!(await page.getByText('Rahmen der Arbeit').filter({ visible: true }).count())) {
    await sichtbar(page.getByRole('button', { name: 'Neue Klassenarbeit' })).click()
  }
  await page.waitForSelector('text=Rahmen der Arbeit')
  const waehle = async (label, option) => {
    await sichtbar(page.getByLabel(label, { exact: true })).click()
    await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
    await page.waitForTimeout(300)
  }
  await waehle('Fach', 'Englisch')
  await waehle('Jahrgang', 'Klasse 12')
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill('Shakespeare today')
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.waitForTimeout(600)

  // Eigene Adresse im Kasten „Material für die Arbeit" (rechts)
  const karte = page.locator('.mantine-Card-root', { hasText: 'Material für die Arbeit' })
  await karte.scrollIntoViewIfNeeded()
  await karte.getByLabel('Internetadresse als Material').fill(olk.url)
  await karte.getByRole('button', { name: 'Laden' }).click()
  await karte
    .getByText(/Shakespeares Werke/)
    .first()
    .waitFor({ timeout: 15000 })
  pruefe(true, 'Die Adresse ist als Material eingetragen')
  // Operatorenliste: in der Oberstufe vorgesehen
  const opSchalter = page.getByRole('switch', { name: 'Operatorenliste anhängen' })
  if (await opSchalter.count()) {
    if (!(await opSchalter.isChecked())) await opSchalter.check({ force: true })
    pruefe(await opSchalter.isChecked(), 'Operatorenliste ist angeschaltet')
  }
  // Der Schalter „Hilfen für Lernende" ist in der Klassenarbeit aus
  const schalter = page.getByTestId('lernhilfen-schalter')
  if (await schalter.count()) pruefe(!(await schalter.isChecked()), '„Hilfen für Lernende" ist standardmäßig aus')
  await page.screenshot({ path: join(out, '1-rahmen-mit-adresse.png') })

  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).first().click()
  const ende = Date.now() + 90000
  while (Date.now() < ende) {
    const knopf = page.getByRole('button', { name: 'Auswahl treffen' }).filter({ visible: true })
    if (await knopf.count()) await knopf.first().click()
    const keine = page.getByRole('button', { name: 'Keine davon' }).filter({ visible: true })
    if (await keine.count()) await keine.first().click()
    if (await page.locator('.ws-editor-pages .ws-page').filter({ visible: true }).count()) break
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(2500)
  const exam = await page.evaluate(() => window.__selftest.kaJetzt())
  const bloecke = (exam?.parts ?? []).flatMap((p) => p.blocks)
  const material = bloecke.find((b) => b.type === 'text' && b.zuschnitt)
  pruefe(Boolean(material), 'Der Sprachmittlungstext stammt aus der Adresse (mit gespeichertem Original)')
  if (material) {
    const n = woerter(material.body)
    pruefe(n >= 450 && n <= 650, `Gekürzt auf den Zielbereich 450–650 Wörter (${n} Wörter, Original ${woerter(material.zuschnitt.original)})`)
    pruefe(n >= 550, `Mindestens die Mitte des Zielbereichs (${n} ≥ 550 Wörter)`)
    pruefe(!/Bewertung|★/.test(material.title), `Titel ohne Bewertungswidget: „${material.title}"`)
    for (const m of ['Bewertung', '★', 'Kommentare', 'hilfreich', 'Jetzt bewerten', 'von 5 Sternen'])
      pruefe(!material.body.includes(m), `Kein Bewertungswidget im Text: „${m}"`)
    pruefe(material.language === 'de', 'Der Ausgangstext der Sprachmittlung bleibt deutsch')
    pruefe(material.lineNumbers === true, 'Zeilennummern sind an')
    for (const m of ['News', '10.03.2025', 'Aus dem Magazin', '©', 'Polaris/laif', 'Mehr zum Thema'])
      pruefe(!material.body.includes(m), `Kein Seitenbeiwerk im Text: „${m}"`)
    pruefe(
      /Shakespeares Werke/.test(material.title) && !material.body.includes('Betörend, verstörend'),
      'Die Schlagzeile ist der Titel des Materials, nicht Teil des Textes'
    )
    pruefe(/Claudia Olk/.test(material.intro ?? '') && (material.intro ?? '').endsWith(':'), `Einleitungssatz vorhanden: „${material.intro}"`)
    pruefe(/\(gekürzt\)/.test(material.source), 'Quellenzeile mit „(gekürzt)"')
    pruefe(
      ['Claudia Olk', 'EINSICHTEN', '10.03.2025', olk.url, 'abgerufen am'].every((x) => material.source.includes(x)),
      `Quellenzeile vollständig: ${material.source}`
    )
  }
  const aufgaben = bloecke.filter((b) => b.type === 'task' && b.skill === 'mediation')
  pruefe(aufgaben.length > 0 && aufgaben.every((a) => (a.brief?.points ?? []).length === 4), 'Die Teilpunkte liegen im Erwartungshorizont (brief.points)')

  const blatt = await page.locator('.ws-editor-pages').first().innerText()
  pruefe(blatt.includes('You are contributing to the website'), 'Die Aufgabe steht auf dem Schülerblatt')
  pruefe(!blatt.includes('Website article'), 'Kein Kasten „Adressat · Textsorte · Zweck" auf dem Schülerblatt')
  pruefe(!blatt.includes('Outline why') && !blatt.includes('Evaluate what'), 'Keine Teilpunkte auf dem Schülerblatt')
  pruefe(blatt.includes('Am 10.03.2025 erklärt die LMU-Anglistin'), 'Der Einleitungssatz steht über dem Text')
  const kursiv = await page
    .locator('.ws-editor-pages [data-testid="material-einleitung"]')
    .first()
    .evaluate((el) => getComputedStyle(el).fontStyle)
    .catch(() => '')
  pruefe(kursiv === 'italic', `Einleitungssatz kursiv (${kursiv})`)
  const einleitung = page.locator('.ws-editor-pages [data-testid="material-einleitung"]').first()
  if (await einleitung.count()) await einleitung.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '2-schuelerblatt-material.png') })
  const aufgabeAufBlatt = page.locator('.ws-editor-pages').getByText('You are contributing to the website').first()
  if (await aufgabeAufBlatt.count()) await aufgabeAufBlatt.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '3-schuelerblatt-aufgabe.png') })

  const quelle = page.locator('.ws-editor-pages').getByText('(gekürzt)').first()
  if (await quelle.count()) {
    await quelle.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(out, '4-quellenzeile.png') })
  }
  pruefe(blatt.includes('(gekürzt)'), 'Die Quellenzeile mit „(gekürzt)" steht auf dem Blatt')
  pruefe(!/M\d+\s*Bewertung/.test(blatt), 'Keine Materialüberschrift „M1 Bewertung …"')

  // Operatorenliste: knapp, in der Zielsprache, als Anhang hinter dem Material – nicht unter der Aufgabe
  pruefe(blatt.includes('Operators used in this test'), 'Die Operatorenliste steht auf dem Blatt')
  pruefe(blatt.includes('produce a text with specific features'), 'Operator mit Erläuterung der Liste')
  for (const m of ['situativen Rahmen', 'Es ist erforderlich', 'Example', 'Using the information in the input article', 'level III'])
    pruefe(!blatt.includes(m), `Nichts aus Vorbemerkung/Beispiel auf dem Schülerblatt: „${m}"`)
  pruefe(blatt.indexOf('Operators used in this test') > blatt.lastIndexOf('(gekürzt)'), 'Die Liste steht hinter dem Material, nicht zwischen Aufgabe und M1')
  pruefe(blatt.includes('Appendix'), 'Eigene Überschrift „Appendix" über der Liste')
  const lehrkraft = page.getByTestId('operatoren-hinweis')
  const hinweisText = (await lehrkraft.count()) ? await lehrkraft.first().innerText() : ''
  pruefe(hinweisText.includes('situativen Rahmen') && hinweisText.includes('nur für die Lehrkraft'), 'Die Vorbemerkung der Liste sieht nur die Lehrkraft')
  const liste = page.locator('.ws-editor-pages').getByText('Operators used in this test').first()
  if (await liste.count()) {
    await liste.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(out, '4b-operatorenliste.png') })
  }

  // Erwartungshorizont: Situierung und Teilpunkte stehen dort
  await sichtbar(page.getByText('Erwartungshorizont', { exact: true })).click()
  const situierung = page.getByTestId('eh-situierung').first()
  await situierung.waitFor({ timeout: 15000 }).catch(() => undefined)
  const eh = (await situierung.count()) ? await situierung.innerText() : ''
  pruefe(eh.includes('Website article') && eh.includes('Outline why'), 'Im Erwartungshorizont: Adressat · Textsorte · Zweck und die Teilpunkte')
  if (eh) await situierung.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '5-erwartungshorizont.png') })

  const ki = existsSync(protokoll) ? readFileSync(protokoll, 'utf8') : ''
  const zuschnitt = ki.split('\n').find((z) => z.includes('"schemaName":"material_zuschnitt"')) ?? ''
  pruefe(zuschnitt.includes('ROTER FADEN') && zuschnitt.includes('Shakespeare today'), 'Der Zuschnitt richtet sich am roten Faden der Arbeit aus')
  pruefe(/PRÜFUNGSFORMAT – KEINE HILFEN/.test(ki), 'Der Teilauftrag verbietet Hilfekästen und Teilpunkte')
} catch (e) {
  problems.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
  console.error(e)
} finally {
  await app?.close().catch(() => undefined)
  try {
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    // Wegwerf-Profil
  }
}

writeFileSync(join(out, 'ergebnis.txt'), problems.length ? problems.join('\n') : 'OK')
if (problems.length) {
  console.error(`\n${problems.length} Problem(e)`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
