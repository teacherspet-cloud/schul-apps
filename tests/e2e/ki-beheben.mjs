// Wache für „Mit KI beheben" (Paket 12, seit Paket 13 in allen fünf Programmen) – mit KI-ATTRAPPE,
// ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/ki-beheben.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Wunsch der Lehrkraft (26.09.2026): an jedem behebbaren Hinweis ein Knopf, der im Hintergrund
// eine gezielte Reparatur holt; Ergebnis als EIN Rückgängig-Schritt, danach neue Prüfung. Reine
// Informationen bleiben ohne Knopf.
//
// Die KI ist die Attrappe (SCHULAPPS_KI_ATTRAPPE, services/ai/attrappe.ts) – sie antwortet auf
// „material_reparatur" mit einer festen Änderung.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ki-beheben')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-beheben-'))

const leer = { kind: 'lines', count: 4, heightMm: 0, gapText: '', options: [], correct: [], pairs: [], items: [], rows: [], statements: [], labels: [] }
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  stars: 0,
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  source: '',
  glossary: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  minutes: 20,
  points: 0,
  solution: 'Erwartungshorizont',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
const attrappe = join(userData, 'ki-attrappe.json')
const protokoll = join(userData, 'ki-protokoll.jsonl')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 1200,
    protokoll,
    antworten: {
      material_reparatur: {
        erklaerung: 'Der Verweis zeigt jetzt auf M1.',
        aenderungen: [
          {
            art: 'ersetzen',
            nummer: 1,
            block: baustein({ instruction: '**Analysiere** den Bericht M1 und ordne ihn in die Zeit ein.', operator: 'Analysiere' })
          }
        ]
      }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
  await warteAufOberflaeche(page)

  // ---------- Arbeitsblatt: Übungsklausur (Aufgabe vorn, Material auf der nächsten Seite)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(4, 'klausur'))
  await page.waitForTimeout(800)
  // Ein echter und ein reiner Informationshinweis an der Aufgabe
  const MANGEL = '[Vollständigkeit] Die Aufgabe verweist auf „M3“, im Material gibt es aber nur M1.'
  const INFO = 'Originalquellen (1 Textquelle(n)): Wortlaut und Quellenangabe vor dem Einsatz prüfen.'
  await page.evaluate(
    ([mangel, info]) => {
      const ws = window.__selftest.worksheetJetzt()
      const a = ws.sheets[0].blocks.find((b) => b.type === 'task')
      a.instruction = '**Analysiere** den Bericht M3.'
      a.warnings = [mangel, info]
      window.__selftest.setWorksheet(ws)
    },
    [MANGEL, INFO]
  )
  await page.waitForTimeout(1500)
  // Die Hinweise stehen in der Werkzeugleiste des Bausteins, die erst beim Überfahren erscheint
  await page.locator('.editor-block', { hasText: 'Analysiere den Bericht M3' }).first().hover()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '2 Hinweise anzeigen' }).first().click()
  await page.waitForTimeout(300)
  const knoepfe = page.locator('[data-ki-beheben]').filter({ visible: true })
  pruefe((await knoepfe.count()) === 1, `Nur der behebbare Hinweis hat „Mit KI beheben" (${await knoepfe.count()})`)
  await page.screenshot({ path: join(shots, 'paket12-ki-beheben-hinweis.png') })
  await knoepfe.first().click()

  // Auftrag läuft im Hintergrund und wird fertig
  const ende = Date.now() + 20000
  let fertig = false
  while (Date.now() < ende) {
    const aufgabe = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
    // Verweise stehen seit dem 27.09.2026 als Kennung M{…} im Text – am neuen Wortlaut erkennen
    if (aufgabe.instruction.includes('ordne ihn in die Zeit ein')) {
      fertig = true
      break
    }
    await page.waitForTimeout(300)
  }
  pruefe(fertig, 'Die Reparatur ist im offenen Blatt angekommen')
  const nachher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
  pruefe(!(nachher.warnings ?? []).some((w) => w.includes('„M3“')), 'Der behobene Hinweis ist weg (Prüfung neu gelaufen)')
  pruefe(!(nachher.warnings ?? []).some((w) => w.includes('verweist auf')), 'Die neue Prüfung findet keinen toten Verweis')

  // Was die KI bekommen hat: Hinweis und Zusammenhang
  const anfragen = readFileSync(protokoll, 'utf8')
    .trim()
    .split('\n')
    .map((z) => JSON.parse(z))
  const reparatur = anfragen.find((a) => a.schemaName === 'material_reparatur' || a.art === 'material_reparatur')
  const text = JSON.stringify(reparatur ?? {})
  pruefe(Boolean(reparatur), 'Genau eine Reparaturanfrage an die (Attrappen-)KI')
  pruefe(text.includes('M3') && text.includes('Geschichte') && text.includes('Weimarer Republik'), 'Die Anfrage enthält Hinweis, Lerngruppe und Thema')
  pruefe(!text.includes('Originalquellen'), 'Der reine Informationshinweis geht nicht mit')

  // Ein Rückgängig-Schritt
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const zurueck = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
  pruefe(zurueck.instruction.includes('M3'), 'Strg+Z holt den alten Stand in einem Schritt zurück')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(shots, 'paket12-ki-beheben-fertig.png') })

  // ---------- Paket 13: dieselbe Wache in den übrigen Programmen – bisher war nur das Arbeitsblatt
  // Ende-zu-Ende geprüft. Je Programm: Mangel einbauen, Knopf drücken, Reparatur kommt im offenen
  // Dokument an, die Prüfung meldet den Mangel nicht mehr, Strg+Z holt den alten Stand.

  /** Antwort der Attrappe für diesen Abschnitt setzen (die Attrappe liest die Datei bei jeder Anfrage neu) */
  const antwort = (antworten) => writeFileSync(attrappe, JSON.stringify({ verzoegerungMs: 800, protokoll, antworten }))
  const anfragenVon = (schema) =>
    readFileSync(protokoll, 'utf8')
      .trim()
      .split('\n')
      .map((z) => JSON.parse(z))
      .filter((a) => a.schemaName === schema)
  /** Wartet, bis `pruefen` im Fenster wahr ist (höchstens 20 s) */
  const bis = async (pruefen, arg) => {
    const ende = Date.now() + 20000
    while (Date.now() < ende) {
      if (await page.evaluate(pruefen, arg)) return true
      await page.waitForTimeout(300)
    }
    return false
  }
  const rueckgaengig = async () => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
  }
  const knopfImHinweis = () => page.locator('[data-hinweis] [data-ki-beheben]').filter({ visible: true })

  // ---------- Grammatiktest: Anrede über dem Blatt
  console.log('\nGrammatiktest')
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.grammarTestSheet())
  await page.evaluate(() => {
    const t = structuredClone(window.__selftest.gtJetzt())
    t.meta.instructionsInGerman = true
    t.blocks.find((b) => b.id === 't1').instruction = 'Setzen Sie die richtige Form ein.'
    window.__selftest.gtSetzen(t)
  })
  await page.waitForTimeout(1500)
  antwort({
    material_reparatur: {
      erklaerung: 'Die Anweisung duzt jetzt.',
      aenderungen: [
        {
          art: 'ersetzen',
          nummer: 2,
          block: baustein({
            instruction: 'Setze die richtige Form ein.',
            operator: 'Setze',
            answer: { ...leer, kind: 'gapText', gapText: 'I [[have lived]] here since 2019.' }
          })
        }
      ]
    }
  })
  pruefe((await knopfImHinweis().count()) >= 1, 'Grammatiktest: „Mit KI beheben" am Anrede-Hinweis')
  await page.screenshot({ path: join(shots, 'paket13-ki-beheben-grammatiktest.png') })
  await knopfImHinweis().first().click()
  pruefe(
    await bis(() => window.__selftest.gtJetzt().blocks.some((b) => b.instruction === 'Setze die richtige Form ein.')),
    'Grammatiktest: Die Reparatur ist im offenen Test angekommen'
  )
  pruefe(
    await bis(() =>
      window.__selftest
        .gtJetzt()
        .blocks.find((b) => b.type === 'task' && /Setze die richtige/.test(b.instruction))
        ?.answer?.gapText?.includes('[[have lived]]')
    ),
    'Grammatiktest: Lückentext der Aufgabe bleibt erhalten'
  )
  await page.waitForTimeout(600)
  pruefe((await knopfImHinweis().count()) === 0, 'Grammatiktest: Der Anrede-Hinweis ist weg (Prüfung neu)')
  pruefe(
    anfragenVon('material_reparatur').some((a) => /Grammatiktest/.test(a.user) && /Setzen Sie/.test(a.user)),
    'Grammatiktest: Anfrage nennt Programm und Stelle'
  )
  await rueckgaengig()
  pruefe(
    await page.evaluate(() => window.__selftest.gtJetzt().blocks.some((b) => b.instruction === 'Setzen Sie die richtige Form ein.')),
    'Grammatiktest: Strg+Z holt den alten Stand'
  )

  // ---------- Klassenarbeit: Anrede über der Arbeit, Änderung im richtigen Teil
  console.log('\nKlassenarbeit')
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.exam())
  await page.evaluate(() => {
    const e = structuredClone(window.__selftest.kaJetzt())
    // Deutschsprachige Aufgaben (Geschichte) – in Englischarbeiten stehen die Anweisungen auf Englisch, dort gibt es keine Anrede-Prüfung
    e.meta.subjectId = 'geschichte'
    e.meta.subjectLabel = 'Geschichte'
    e.meta.grade = 9
    e.parts[1].blocks[0].instruction = '**Beschreiben Sie** Ihre Reise nach York.'
    window.__selftest.kaSetzen(e)
  })
  await page.waitForTimeout(1500)
  antwort({
    material_reparatur: {
      erklaerung: 'Die Aufgabe duzt jetzt.',
      aenderungen: [{ art: 'ersetzen', nummer: 3, block: baustein({ instruction: '**Beschreibe** deine Reise nach York.', operator: 'Beschreibe' }) }]
    }
  })
  pruefe((await knopfImHinweis().count()) >= 1, 'Klassenarbeit: „Mit KI beheben" am Anrede-Hinweis')
  await page.screenshot({ path: join(shots, 'paket13-ki-beheben-klassenarbeit.png') })
  await knopfImHinweis().first().click()
  pruefe(
    await bis(() => window.__selftest.kaJetzt().parts[1].blocks.some((b) => b.instruction === '**Beschreibe** deine Reise nach York.')),
    'Klassenarbeit: Die Reparatur ist im richtigen Teil angekommen'
  )
  const ka = await page.evaluate(() => window.__selftest.kaJetzt())
  pruefe(ka.parts[0].blocks.length === 2 && ka.parts[1].blocks.length === 1, 'Klassenarbeit: Die übrigen Teile bleiben unverändert')
  pruefe(ka.parts[1].blocks[0].points === 3, `Klassenarbeit: Punkte des ersetzten Bausteins bleiben (${ka.parts[1].blocks[0].points})`)
  await page.waitForTimeout(600)
  pruefe((await knopfImHinweis().count()) === 0, 'Klassenarbeit: Der Anrede-Hinweis ist weg')
  await rueckgaengig()
  pruefe(
    await page.evaluate(() => window.__selftest.kaJetzt().parts[1].blocks[0].instruction.includes('Beschreiben Sie')),
    'Klassenarbeit: Strg+Z holt den alten Stand'
  )

  // ---------- Lernzielkontrolle: Befund „Anrede" mit Knopf
  console.log('\nLernzielkontrolle')
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__selftest.lzkSheet('NI', 1))
  await page.evaluate(() => {
    const t = structuredClone(window.__selftest.lzkJetzt())
    t.varianten[0].blocks.find((b) => b.id === 'a4').instruction = '**Entscheiden Sie**, ob die Aussage stimmt, und begründen Sie Ihre Antwort.'
    window.__selftest.lzkSetzen(t)
  })
  await page.waitForTimeout(1500)
  antwort({
    material_reparatur: {
      erklaerung: 'Die Aufgabe duzt jetzt.',
      aenderungen: [
        {
          art: 'ersetzen',
          nummer: 4,
          block: baustein({ instruction: '**Entscheide**, ob die Aussage stimmt, und begründe deine Antwort.', operator: 'Entscheide', points: 0 })
        }
      ]
    }
  })
  const befunde = page.getByText('Was der App aufgefallen ist').filter({ visible: true })
  if (await befunde.count()) {
    await befunde.first().click()
    await page.waitForTimeout(400)
  }
  const lzkKnopf = page.locator('[data-ki-beheben]').filter({ visible: true })
  pruefe((await lzkKnopf.count()) >= 1, `Lernzielkontrolle: „Mit KI beheben" am Befund (${await lzkKnopf.count()})`)
  await page.screenshot({ path: join(shots, 'paket13-ki-beheben-lzk.png') })
  // Der Knopf am Anrede-Befund
  const anredeZeile = page.locator('[data-hinweis]', { hasText: 'Entscheiden Sie' }).filter({ visible: true })
  const ziel = (await anredeZeile.count()) ? anredeZeile.first().locator('[data-ki-beheben]') : lzkKnopf.first()
  await ziel.click()
  pruefe(
    await bis(() => window.__selftest.lzkJetzt().varianten[0].blocks.some((b) => b.instruction?.startsWith('**Entscheide**, ob'))),
    'Lernzielkontrolle: Die Reparatur ist im offenen Test angekommen'
  )
  const lzk = await page.evaluate(() => window.__selftest.lzkJetzt().varianten[0].blocks)
  pruefe(lzk.length === 5 && lzk[3].id === 'a4', 'Lernzielkontrolle: Der Baustein wurde an seiner Stelle ersetzt (Kennung bleibt)')
  pruefe(
    anfragenVon('material_reparatur').some((a) => /Lernzielkontrolle/.test(a.user) && /Baustein \(4\)/.test(a.user)),
    'Lernzielkontrolle: Anfrage nennt die Baustein-Nummer'
  )
  await rueckgaengig()
  pruefe(
    await page.evaluate(() => window.__selftest.lzkJetzt().varianten[0].blocks[3].instruction.includes('Entscheiden Sie')),
    'Lernzielkontrolle: Strg+Z holt den alten Stand'
  )

  // ---------- Vokabeltest: Hinweis an der Aufgabe → Aufgabe ohne das Problem neu
  console.log('\nVokabeltest')
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForTimeout(500)
  const VT_HINWEIS = '[Prüfung] Die Situation im Aufgabentext wiederholt nur das Wort – sie hilft nicht, die Bedeutung zu zeigen.'
  await page.evaluate((h) => window.__selftest.vtMitHinweis(h), VT_HINWEIS)
  await page.waitForTimeout(1500)
  antwort({
    writeSentences: {
      instruction: 'Write a sentence with each word.',
      items: [
        { vocabId: 'e1', prompt: 'to explore – a city you visited', modelAnswer: 'We explored the old town of York.' },
        { vocabId: 'e2', prompt: 'journey – your way to school', modelAnswer: 'My journey to school takes twenty minutes.' },
        { vocabId: 'e3', prompt: 'abroad – your last holiday', modelAnswer: 'Last summer we went abroad.' }
      ]
    }
  })
  // Die Hinweise stehen in der Werkzeugleiste des Bausteins, die erst beim Überfahren erscheint
  await page.locator('.editor-block').filter({ visible: true }).first().hover()
  await page.waitForTimeout(300)
  const vtWarnung = page.getByRole('button', { name: '1 Hinweis anzeigen' }).filter({ visible: true })
  pruefe((await vtWarnung.count()) >= 1, 'Vokabeltest: Hinweis an der Aufgabe sichtbar')
  if (await vtWarnung.count()) {
    await vtWarnung.first().click()
    await page.waitForTimeout(300)
  }
  const vtKnopf = page.locator('[data-ki-beheben]').filter({ visible: true })
  pruefe((await vtKnopf.count()) === 1, 'Vokabeltest: „Mit KI beheben" am Hinweis')
  await page.screenshot({ path: join(shots, 'paket13-ki-beheben-vokabeltest.png') })
  await vtKnopf.first().click()
  pruefe(
    await bis(() => window.__selftest.vtJetzt().variants[0].blocks[0].items?.[0]?.prompt === 'to explore – a city you visited'),
    'Vokabeltest: Die neue Aufgabe ist im offenen Test angekommen'
  )
  const vt = await page.evaluate(() => window.__selftest.vtJetzt().variants[0].blocks[0])
  pruefe(!(vt.warnings ?? []).includes(VT_HINWEIS), 'Vokabeltest: Der behobene Hinweis ist weg')
  pruefe(vt.title && vt.pointsPerItem === 2, 'Vokabeltest: Titel und Punkte der Aufgabe bleiben')
  pruefe(
    anfragenVon('writeSentences').some((a) => a.user.includes('Die Situation im Aufgabentext wiederholt')),
    'Vokabeltest: Anfrage enthält den Hinweis'
  )
  await rueckgaengig()
  pruefe(
    await page.evaluate(() => window.__selftest.vtJetzt().variants[0].blocks[0].items[0].prompt === 'to explore – to explore'),
    'Vokabeltest: Strg+Z holt die alte Aufgabe'
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
console.log(
  '\n„Mit KI beheben" in Arbeitsblatt, Grammatiktest, Klassenarbeit, Lernzielkontrolle und Vokabeltest: Knopf, Reparatur im Hintergrund, ein Rückgängig-Schritt, Prüfung neu.'
)
