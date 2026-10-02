// Wache für die VERSCHIEBBARE OPERATORENLISTE der Klausur (01.10.2026) – mit KI-ATTRAPPE und
// Wegwerf-Profil, ohne Netz (vorher: npm run build).
// Aufruf: node tests/e2e/operatoren-ziehen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft: Die Liste stand zu dicht an der Aufgabe, und sie soll sich auf der Seite
// per Ziehen nach oben und unten schieben lassen – die übrigen Bausteine rücken nach, nichts
// überlappt. Geprüft im gesetzten Blatt:
//  - Abstand zwischen Aufgabe und Liste mindestens 6 mm,
//  - Ziehen vor die Aufgabe: die Lage ist gespeichert (meta.operatorenNach), die Liste steht im
//    Blatt an der neuen Stelle und überdeckt keinen Baustein,
//  - „An die vorgesehene Stelle zurück" stellt die Ausgangslage wieder her, Strg+Z ebenso.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/operatoren-ziehen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-op-ziehen-'))
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
  const reihenfolge = () =>
    page.evaluate(() => [...document.querySelectorAll('.ws-editor-pages [data-fluss]')].filter((e) => !e.closest('.ws-measure')).map((e) => e.dataset.fluss))
  /** Senkrechte Lage der Stücke je Seite: Überlappung = ein Stück beginnt, bevor das vorige endet */
  const ueberlappungen = () =>
    page.evaluate(() => {
      const out = []
      for (const seite of document.querySelectorAll('.ws-editor-pages .ws-page')) {
        if (seite.closest('.ws-measure')) continue
        const r = [...seite.querySelectorAll('[data-fluss]')].map((e) => ({ id: e.dataset.fluss, ...e.getBoundingClientRect().toJSON() }))
        for (let i = 1; i < r.length; i++) if (r[i].top < r[i - 1].bottom - 1) out.push(`${r[i - 1].id} / ${r[i].id}`)
      }
      return out
    })
  const vorher = await reihenfolge()
  const op = page.locator('.ws-editor-pages [data-baustein="exam-operatoren"]').first()
  pruefe((await op.count()) > 0, 'Die Operatorenliste steht im Blatt')
  await op.scrollIntoViewIfNeeded()
  // Abstand: zwischen dem Baustein davor und der Liste (in mm über die Seitenbreite 210 mm)
  const abstand = await page.evaluate(() => {
    const alle = [...document.querySelectorAll('.ws-editor-pages [data-fluss]')].filter((e) => !e.closest('.ws-measure'))
    const i = alle.findIndex((e) => e.dataset.fluss === 'exam-operatoren')
    const seite = alle[i].closest('.ws-page').getBoundingClientRect()
    const mm = seite.width / 210
    const kasten = alle[i].querySelector('.ws-info').getBoundingClientRect()
    const davor = alle[i - 1].getBoundingClientRect()
    const danach =
      alle[i + 1] && alle[i + 1].closest('.ws-page') === alle[i].closest('.ws-page') ? alle[i + 1].querySelector('.ws-block')?.getBoundingClientRect() : null
    return { oben: (kasten.top - davor.bottom) / mm, unten: danach ? (danach.top - kasten.bottom) / mm : null }
  })
  pruefe(abstand.oben >= 6, `Abstand über der Liste ${abstand.oben.toFixed(1)} mm (≥ 6)`)
  if (abstand.unten !== null) pruefe(abstand.unten >= 6, `Abstand unter der Liste ${abstand.unten.toFixed(1)} mm (≥ 6)`)
  await page.screenshot({ path: join(out, '1-vorher.png') })

  // Ziehen am Anfassknopf nach OBEN, vor die Aufgabe (direkt hinter die Teilüberschrift) – beides im Bild
  await op.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await op.hover()
  const griff = op.locator('[aria-label="Baustein verschieben"]').first()
  await griff.waitFor({ state: 'visible', timeout: 5000 })
  const g2 = await griff.boundingBox()
  const iVorher = vorher.indexOf('exam-operatoren')
  const ziel = vorher[iVorher - 2]
  const letzt = await page.evaluate((id) => {
    const e = [...document.querySelectorAll(`.ws-editor-pages [data-fluss="${id}"]`)].filter((x) => !x.closest('.ws-measure'))[0]
    const r = e.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.bottom + 2 }
  }, ziel)
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2)
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) await page.mouse.move(g2.x + ((letzt.x - g2.x) * k) / 12, g2.y + ((letzt.y - g2.y) * k) / 12)
  pruefe((await page.locator('[data-fluss-linie]').count()) === 1, 'Beim Ziehen zeigt eine Linie die Zielstelle')
  await page.screenshot({ path: join(out, '2-beim-ziehen.png') })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  pruefe((await page.locator('[data-fluss-linie]').count()) === 0, 'Nach dem Loslassen ist die Linie weg')
  const nachher = await reihenfolge()
  const meta = (await page.evaluate(() => window.__selftest.kaJetzt()))?.meta ?? {}
  pruefe(meta.operatorenNach === ziel, `Lage gespeichert: hinter „${ziel}" (${meta.operatorenNach})`)
  const iOp = nachher.indexOf('exam-operatoren')
  pruefe(
    iOp === nachher.lastIndexOf(ziel) + 1 && iOp < nachher.indexOf(vorher[iVorher - 1]),
    `Im Blatt steht die Liste hinter „${ziel}" und vor der Aufgabe (${nachher.join(' → ')})`
  )
  const ueber = await ueberlappungen()
  pruefe(ueber.length === 0, `Kein Baustein überdeckt einen anderen${ueber.length ? `: ${ueber.join(', ')}` : ''}`)
  await page.locator('.ws-editor-pages [data-baustein="exam-operatoren"]').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '3-nachher.png') })

  // Strg+Z: zurück an die Ausgangslage
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => undefined)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(1200)
  pruefe(JSON.stringify(await reihenfolge()) === JSON.stringify(vorher), 'Strg+Z stellt die Ausgangslage wieder her')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(1200)

  // Menü: an die vorgesehene Stelle zurück
  const op2 = page.locator('.ws-editor-pages [data-baustein="exam-operatoren"]').first()
  await op2.scrollIntoViewIfNeeded()
  await op2.hover()
  await op2.locator('[aria-label="Weitere Aktionen"]').first().click()
  await sichtbar(page.getByRole('menuitem', { name: 'An die vorgesehene Stelle zurück' })).click()
  await page.waitForTimeout(1200)
  pruefe(JSON.stringify(await reihenfolge()) === JSON.stringify(vorher), '„An die vorgesehene Stelle zurück" stellt die Ausgangslage wieder her')
  pruefe(!(await page.evaluate(() => window.__selftest.kaJetzt()))?.meta?.operatorenNach, 'Die gespeicherte Lage ist gelöscht')
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
