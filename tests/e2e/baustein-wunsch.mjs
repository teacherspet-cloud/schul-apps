// Wache für den ÄNDERUNGSWUNSCH am Baustein und für bearbeitbare Texte – mit KI-ATTRAPPE,
// ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/baustein-wunsch.mjs <Ausgabeordner>
//
// Wünsche der Lehrkraft (30.09.2026):
// - Am Kreis zum Neugenerieren einen Änderungswunsch mit angeben; dazu der Zauberstab
//   „Überarbeiten". Beide teilen ein Feld mit Regel- und KI-Vorschlägen; ein Klick auf einen
//   Vorschlag fügt ihn ein. Das Ergebnis ersetzt den Baustein, Strg+Z holt den alten.
// - Alle Texte eines Bausteins, die auf dem Blatt stehen, sind bearbeitbar – auch die
//   Hinweiszeile (ⓘ) im Vokabeltest und der Kopfkasten des Grammatiktests.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/baustein-wunsch')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-wunsch-'))

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
  minutes: 10,
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
const KI_VORSCHLAEGE = ['Mehr Bezug auf M1', 'Zweite Teilaufgabe mit Transfer', 'Zeitangaben aus dem Bericht nutzen', 'Kürzere Arbeitsanweisung']
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 900,
    protokoll,
    antworten: {
      baustein_wunsch_vorschlaege: { vorschlaege: KI_VORSCHLAEGE },
      worksheet_block: { block: baustein({ instruction: '**Fasse** den Bericht in drei Sätzen zusammen.', operator: 'Fasse zusammen' }) }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const anfragenVon = (schema) => {
  try {
    return readFileSync(protokoll, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((z) => JSON.parse(z))
      .filter((a) => a.schemaName === schema)
  } catch {
    return []
  }
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

  /** Wartet, bis `pruefen` im Fenster wahr ist (höchstens 15 s) */
  const bis = async (pruefen, arg) => {
    const ende = Date.now() + 15000
    while (Date.now() < ende) {
      if (await page.evaluate(pruefen, arg)) return true
      await page.waitForTimeout(250)
    }
    return false
  }
  const rueckgaengig = async () => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.locator('.editor-canvas, .ws-editor-pages').first().click({ position: { x: 5, y: 5 } }).catch(() => undefined)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(700)
  }
  /** Einen bearbeitbaren Text anklicken, ersetzen und verlassen */
  const bearbeite = async (locator, text) => {
    await locator.scrollIntoViewIfNeeded()
    await locator.click()
    const feld = page.locator('textarea.rt-editor, [contenteditable="plaintext-only"]:focus').first()
    await feld.waitFor({ timeout: 3000 })
    if (await page.locator('textarea.rt-editor').count()) await page.locator('textarea.rt-editor').first().fill(text)
    else {
      await page.keyboard.press('Control+a')
      await page.keyboard.type(text)
    }
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(500)
  }

  // ---------- Arbeitsblatt
  console.log('Arbeitsblatt')
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(3))
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const ws = structuredClone(window.__selftest.worksheetJetzt())
    const blocks = ws.sheets[0].blocks
    blocks[0].sourceHeader = { author: 'Friedrich Ebert', textType: 'Rede', date: '1919', found: '' }
    blocks[0].glossary = [{ term: 'Verfassung', explanation: 'Grundordnung eines Staates' }]
    blocks.push({ id: 'w1', type: 'infoBox', variant: 'wissen', title: 'Wissen', body: 'Wissen A: Die Verfassung trat 1919 in Kraft.' })
    blocks.push({
      id: 'a1',
      type: 'task',
      instruction: 'Fasse den Bericht zusammen.',
      operator: 'Fasse zusammen',
      afb: 'I',
      afbReason: 'Wiedergabe des Inhalts',
      socialForm: 'EA',
      answer: { kind: 'lines', count: 4 },
      parts: [],
      solution: '',
      points: 0,
      minutes: 10
    })
    blocks.push({
      id: 'p1',
      type: 'phrases',
      title: 'Nützliche Ausdrücke',
      hint: '',
      groups: [{ label: 'Meinung äußern', items: [{ text: 'Meiner Ansicht nach', german: '' }] }]
    })
    window.__selftest.setWorksheet(ws)
  })
  await page.waitForTimeout(2000)
  const aufgabe = page.locator('.ws-editor-pages .editor-block', { hasText: 'Fasse den Bericht zusammen' }).first()
  await aufgabe.scrollIntoViewIfNeeded()
  await aufgabe.hover()
  await page.waitForTimeout(300)

  // Zauberstab und Kreis an der Aufgabe, dazu das KI-Menü
  const stab = aufgabe.locator('[aria-label="Baustein überarbeiten"]')
  const kreis = aufgabe.locator('[aria-label="Baustein neu erzeugen"]')
  pruefe((await stab.count()) === 1 && (await kreis.count()) === 1, 'Zauberstab „Überarbeiten" und Kreis „Neu erzeugen" am Baustein')
  pruefe((await aufgabe.locator('[aria-label="KI-Aktionen"]').count()) === 1, 'Das KI-Menü für weitere Aktionen bleibt')

  await stab.click()
  const feld = page.locator('[data-ki-wunsch] textarea')
  await feld.waitFor({ timeout: 3000 })
  pruefe(await page.locator('[data-ki-wunsch]', { hasText: 'Baustein überarbeiten' }).isVisible(), 'Der Zauberstab öffnet das Wunschfeld „Baustein überarbeiten"')
  const regel = page.locator('[data-ki-wunsch] [data-vorschlag="regel"]')
  const regelZahl = await regel.count()
  pruefe(regelZahl >= 3, `Regelvorschläge stehen sofort da (${regelZahl})`)
  const regelTexte = await regel.allInnerTexts()
  console.log('   Regel:', regelTexte.join(' | '))
  pruefe(
    regelTexte.includes('Anspruchsvoller (AFB II)'),
    'Die Regelvorschläge passen zur Aufgabe (AFB I → „Anspruchsvoller (AFB II)")'
  )
  const kiDa = await bis(() => document.querySelectorAll('[data-ki-wunsch] [data-vorschlag="ki"]').length >= 4)
  pruefe(kiDa, 'Die KI-Vorschläge werden angehängt, sobald sie da sind')
  const vorschlagAnfrage = anfragenVon('baustein_wunsch_vorschlaege')[0]
  pruefe(Boolean(vorschlagAnfrage?.user.includes('Fasse den Bericht zusammen')), 'Die Vorschlagsanfrage nennt den Inhalt des Bausteins')
  pruefe(Boolean(vorschlagAnfrage?.user.includes('Klasse')), 'Die Vorschlagsanfrage nennt die Lerngruppe')
  await page.screenshot({ path: join(out, 'wunsch-vorschlaege.png') })

  await regel.filter({ hasText: 'Mehr Differenzierung' }).first().click()
  await page.locator('[data-ki-wunsch] [data-vorschlag="ki"]', { hasText: KI_VORSCHLAEGE[0] }).first().click()
  const wunsch = await feld.inputValue()
  pruefe(wunsch === `Mehr Differenzierung (★/★★/★★★), ${KI_VORSCHLAEGE[0]}`, `Klicks fügen die Vorschläge ein und hängen an („${wunsch}")`)
  await feld.fill(`${wunsch}, eigene Ergänzung`)
  await page.locator('[data-ki-wunsch] button', { hasText: 'Überarbeiten' }).click()
  const ersetzt = await bis(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'a1')?.instruction.includes('drei Sätzen'))
  pruefe(ersetzt, 'Die Überarbeitung ersetzt den Baustein')
  const auftrag = anfragenVon('worksheet_block').at(-1)
  pruefe(Boolean(auftrag?.user.includes('eigene Ergänzung') && auftrag.user.includes(KI_VORSCHLAEGE[0])), 'Die Anfrage enthält den Änderungswunsch')
  pruefe(Boolean(auftrag?.user.includes('Überarbeite Baustein')), 'Die Anfrage ist eine Überarbeitung (der Baustein bleibt erkennbar)')
  await page.screenshot({ path: join(out, 'wunsch-ergebnis.png') })
  await rueckgaengig()
  pruefe(
    await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'a1')?.instruction === 'Fasse den Bericht zusammen.'),
    'Strg+Z holt den alten Baustein zurück'
  )

  // Kreis: dasselbe Feld, KI-Vorschläge aus dem Speicher (keine zweite Anfrage)
  await aufgabe.hover()
  await page.waitForTimeout(300)
  await kreis.click()
  await feld.waitFor({ timeout: 3000 })
  pruefe(await page.locator('[data-ki-wunsch]', { hasText: 'Baustein neu erzeugen' }).isVisible(), 'Der Kreis öffnet dasselbe Feld als „Baustein neu erzeugen"')
  await page.waitForTimeout(400)
  pruefe((await page.locator('[data-ki-wunsch] [data-vorschlag="ki"]').count()) >= 4, 'Die KI-Vorschläge stehen sofort wieder da')
  pruefe(anfragenVon('baustein_wunsch_vorschlaege').length === 1, 'Für denselben Baustein wird nicht noch einmal gefragt')
  await feld.fill('Mit Alltagsbezug')
  await page.locator('[data-ki-wunsch] button', { hasText: 'Neu erzeugen' }).click()
  pruefe(
    await bis(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'a1')?.instruction.includes('drei Sätzen')),
    'Neu erzeugen ersetzt den Baustein'
  )
  const neuAuftrag = anfragenVon('worksheet_block').at(-1)
  pruefe(Boolean(neuAuftrag?.user.includes('komplett NEU') && neuAuftrag.user.includes('Mit Alltagsbezug')), 'Neu erzeugen: ganz neuer Entwurf, mit Wunsch')
  await rueckgaengig()

  // ---------- Texte bearbeitbar
  const blockJetzt = (id) => page.evaluate((i) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === i), id)
  await bearbeite(page.locator('.ws-editor-pages .ws-source-header .rt-editable').first(), 'Philipp Scheidemann')
  pruefe((await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks[0].sourceHeader.author)) === 'Philipp Scheidemann', 'Materialkopf: Verfasser bearbeitbar')
  await bearbeite(page.locator('.ws-editor-pages .ws-glossary .rt-editable').first(), 'Reichsverfassung')
  pruefe((await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks[0].glossary[0].term)) === 'Reichsverfassung', 'Worterklärung: Begriff bearbeitbar')
  await bearbeite(page.locator('.ws-editor-pages .ws-info-title.rt-editable, .ws-editor-pages .ws-info-head .rt-editable').first(), 'Hintergrund')
  pruefe((await blockJetzt('w1')).title === 'Hintergrund', 'Wissenskasten (ⓘ): Titel bearbeitbar')
  await bearbeite(page.locator('.ws-editor-pages .ws-phrases-text .rt-editable').first(), 'In meinen Augen')
  pruefe((await blockJetzt('p1')).groups[0].items[0].text === 'In meinen Augen', 'Nützliche Ausdrücke: Eintrag bearbeitbar')
  await bearbeite(page.locator('.ws-editor-pages .ws-task-instruction .rt-editable').first(), 'Fasse den Bericht mit eigenen Worten zusammen.')
  pruefe((await blockJetzt('a1')).instruction === 'Fasse den Bericht mit eigenen Worten zusammen.', 'Arbeitsanweisung bearbeitbar')
  await rueckgaengig()
  pruefe((await blockJetzt('a1')).instruction === 'Fasse den Bericht zusammen.', 'Strg+Z nimmt die Textänderung zurück')

  // In der Lösungsansicht: Arbeitsanweisung und AFB-Begründung bearbeitbar
  await page.getByRole('radio', { name: 'Lösungen' }).first().click().catch(() => page.getByText('Lösungen', { exact: true }).first().click())
  await page.waitForTimeout(1500)
  const loesAnweisung = page.locator('.ws-editor-pages .ws-task-instruction .rt-editable')
  pruefe((await loesAnweisung.count()) > 0, 'Lösungsansicht: die Arbeitsanweisung ist bearbeitbar')
  const begruendung = page.locator('.ws-editor-pages .ws-teacher-note .rt-editable')
  pruefe((await begruendung.count()) > 0, 'Lösungsansicht: die AFB-Begründung ist bearbeitbar')
  if (await begruendung.count()) {
    await bearbeite(begruendung.first(), 'Reine Wiedergabe')
    pruefe((await blockJetzt('a1')).afbReason === 'Reine Wiedergabe', 'Lösungsansicht: die Änderung steht im Dokument')
  }
  await page.screenshot({ path: join(out, 'loesungsansicht.png') })

  // ---------- Vokabeltest: Hinweiszeile (ⓘ) und Zauberstab/Kreis
  console.log('\nVokabeltest')
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.vtMitHinweis('[Prüfung] Test'))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__selftest.vtHinweiszeile('Jedes Wort nur einmal verwenden.'))
  await page.waitForTimeout(800)
  const vtBlock = page.locator('.editor-block').filter({ visible: true }).first()
  await vtBlock.hover()
  await page.waitForTimeout(300)
  pruefe((await vtBlock.locator('[aria-label="Baustein überarbeiten (Aufgabe 1)"]').count()) === 1, 'Vokabeltest: Zauberstab an der Aufgabe')
  pruefe((await vtBlock.locator('[aria-label="Baustein neu erzeugen (Aufgabe 1)"]').count()) === 1, 'Vokabeltest: Kreis an der Aufgabe')
  const hilfe = page.locator('.vt-help .vt-editable').filter({ visible: true })
  pruefe((await hilfe.count()) === 1, 'Vokabeltest: die Hinweiszeile (ⓘ) ist bearbeitbar')
  if (await hilfe.count()) {
    await bearbeite(hilfe.first(), 'Use each word once.')
    pruefe(
      (await page.evaluate(() => window.__selftest.vtJetzt().variants[0].blocks[0].helpText)) === 'Use each word once.',
      'Vokabeltest: die geänderte Hinweiszeile steht im Test'
    )
  }
  await page.screenshot({ path: join(out, 'vokabeltest.png') })

  // ---------- Grammatiktest: Kopfkasten (ⓘ) und Zauberstab
  console.log('\nGrammatiktest')
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.grammarTestSheet())
  await page.evaluate(() => {
    const t = structuredClone(window.__selftest.gtJetzt())
    t.meta.infoBox = true
    window.__selftest.gtSetzen(t)
  })
  await page.waitForTimeout(1500)
  const kopf = page.locator('.ws-editor-pages .ws-info-wissen .rt-editable').filter({ visible: true })
  pruefe((await kopf.count()) >= 2, `Grammatiktest: Titel und Inhalt des Kopfkastens sind bearbeitbar (${await kopf.count()})`)
  if ((await kopf.count()) >= 2) {
    await bearbeite(kopf.nth(1), '- Bearbeitungszeit: 20 Minuten')
    pruefe(
      (await page.evaluate(() => window.__selftest.gtJetzt().meta.kopfText)) === '- Bearbeitungszeit: 20 Minuten',
      'Grammatiktest: der geänderte Kopfkasten steht im Test (meta.kopfText)'
    )
  }
  const gtAufgabe = page.locator('.ws-editor-pages .editor-block').filter({ has: page.locator('.ws-task'), visible: true }).first()
  await gtAufgabe.hover()
  await page.waitForTimeout(300)
  pruefe((await gtAufgabe.locator('[aria-label="Baustein überarbeiten"]').count()) === 1, 'Grammatiktest: Zauberstab an der Aufgabe')
  await page.screenshot({ path: join(out, 'grammatiktest.png') })
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

console.log(problems.length ? `\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
