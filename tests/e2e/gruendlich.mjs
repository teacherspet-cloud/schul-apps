// Gründlicher Durchlauf mit echter KI: Arbeitsblatt (mit Hörverstehen), Grammatiktest und
// Klassenarbeit (mit Hörteil). Geprüft wird nicht nur, ob etwas entsteht, sondern ob es den
// Vorgaben entspricht.
//
// Aufruf: node tests/e2e/gruendlich.mjs <Ausgabeordner>
//
// Der Lauf bekommt einen EIGENEN, wegwerfbaren Datenordner. Hineinkopiert werden nur die
// Einstellungen, die Zugangsdaten und die Designvorlagen – alles andere bleibt leer.
//
// Grund: Zwei Instanzen auf demselben Datenordner vertragen sich nicht; wer die App während
// eines Laufs öffnete, sah ein schwarzes Fenster. Außerdem kann so nichts vom Testmaterial
// zwischen den gespeicherten Arbeitsblättern der Lehrkraft landen – auch nicht bei einem
// harten Abbruch, bei dem keine Aufräumfunktion mehr läuft.
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { resolve, join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/gruendlich')
mkdirSync(out, { recursive: true })

/** Welche Phasen laufen sollen – so kostet ein erneuter Lauf nur das Nötige. */
const only = process.argv.filter((a) => /^--(blatt|gtest|arbeit)$/.test(a)).map((a) => a.slice(2))
const run = (name) => only.length === 0 || only.includes(name)

const findings = []
const note = (area, ok, text) => {
  findings.push({ area, ok, text })
  console.log(`${ok ? '  ok ' : '  !! '} [${area}] ${text}`)
}

/** Eigener Datenordner mit den nötigen Angaben aus dem echten – der bleibt unangetastet. */
const live = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-pruefung-'))
for (const file of ['settings.json', 'secrets.json', 'model-cache.json', 'worksheet-designs.json', 'worksheet-designs-version.json']) {
  const from = join(live, file)
  if (existsSync(from)) copyFileSync(from, join(userData, file))
}
console.log(`Eigener Datenordner: ${userData}`)

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
/*
 * Das ECHTE Fenster vergrößern, nicht den emulierten Darstellungsbereich.
 *
 * `page.setViewportSize()` ändert bei Electron nur die Emulation: Der Rest der Fensterfläche
 * bleibt unbemalt und damit schwarz. Die Bildschirmabzüge sehen trotzdem richtig aus, weil sie
 * den emulierten Bereich zeigen – wer danebensitzt, sieht ein schwarzes Fenster.
 */
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.setSize(1500, 1000)
  win.center()
})
await page.waitForTimeout(300)
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
const field = (name) => page.getByLabel(name).filter({ visible: true }).first()
const pick = async (label, option) => {
  await field(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.waitForTimeout(250)
}

/** Was vor dem Durchlauf schon da war – nur Neues wird hinterher entfernt. */
const before = await page.evaluate(async () => ({
  sheets: (await window.api.sheets.list()).map((x) => x.id),
  exams: (await window.api.exams.list()).map((x) => x.id),
  grammarTests: (await window.api.grammarTests.list()).map((x) => x.id),
  tests: (await window.api.tests.list()).map((x) => x.id)
}))
console.log(
  `Vorher vorhanden: ${before.sheets.length} Arbeitsblätter, ${before.exams.length} Klassenarbeiten, ${before.grammarTests.length} Grammatiktests, ${before.tests.length} Vokabeltests`
)

/** Entfernt alles, was dieser Durchlauf angelegt hat. Läuft auch bei einem Abbruch. */
const cleanup = async () => {
  try {
    const removed = await page.evaluate(async (known) => {
      const apis = { sheets: window.api.sheets, exams: window.api.exams, grammarTests: window.api.grammarTests, tests: window.api.tests }
      const result = {}
      for (const [key, api] of Object.entries(apis)) {
        const fresh = (await api.list()).filter((x) => !known[key].includes(x.id))
        for (const x of fresh) await api.delete(x.id)
        result[key] = fresh.length
      }
      return result
    }, before)
    console.log(
      `Aufgeräumt: ${removed.sheets} Arbeitsblätter, ${removed.exams} Klassenarbeiten, ${removed.grammarTests} Grammatiktests, ${removed.tests} Vokabeltests`
    )
  } catch (e) {
    console.error('Aufräumen fehlgeschlagen:', e.message)
  }
}

process.on('uncaughtException', async (e) => {
  console.error('Abgebrochen:', e.message)
  await cleanup()
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  process.exit(1)
})

const ai = await page.evaluate(() => window.api.ai.status())
console.log(`KI: Text ${ai.hasTextKey ? 'bereit' : 'fehlt'} · Stimme ${ai.hasTts ? 'bereit' : 'fehlt'}`)
if (!ai.hasTextKey) {
  console.log('Kein KI-Zugang – Durchlauf abgebrochen.')
  await app.close()
  process.exit(1)
}

const hasSolution = (t) => Boolean(String(t.solution ?? '').trim() || (t.parts ?? []).some((p) => String(p.solution ?? '').trim()))

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)

/** Gemeinsame Prüfungen für Hörverstehen – auf dem Blatt wie in der Arbeit. */
function checkListening(area, audios, tasks) {
  note(area, audios.length >= 1, `${audios.length} Hörtext-Baustein(e)`)
  if (!audios.length) return
  note(
    area,
    audios.every((a) => (a.transcript ?? '').trim().length > 80),
    `Skriptlängen: ${audios.map((a) => (a.transcript ?? '').split(/\s+/).filter(Boolean).length).join(', ')} Wörter`
  )
  note(
    area,
    audios.every((a) => (a.plays ?? 0) >= 1),
    `Wiedergaben je Hörtext: ${audios.map((a) => a.plays ?? 0).join(', ')}`
  )
  const linked = tasks.filter((t) => t.audioId)
  note(area, linked.length > 0, `${linked.length} von ${tasks.length} Aufgaben sind einem Hörtext zugeordnet`)
  const ids = new Set(audios.map((a) => a.id))
  note(
    area,
    linked.every((t) => ids.has(t.audioId)),
    'Alle Zuordnungen zeigen auf einen vorhandenen Hörtext'
  )
  // Je Aufgabe gegen IHR Skript prüfen – nicht gegen alle zusammen
  const byId = new Map(audios.map((a) => [a.id, (a.transcript ?? '').toLowerCase()]))
  const unsolvable = linked.filter((t) => {
    const script = byId.get(t.audioId) ?? ''
    const w = words(t.solution)
    if (!w.length) return false
    return w.filter((x) => script.includes(x)).length / w.length < 0.34
  })
  note(
    area,
    unsolvable.length === 0,
    unsolvable.length ? `${unsolvable.length} Lösung(en) stehen nicht im zugehörigen Hörtext` : 'Alle Lösungen stehen im zugehörigen Hörtext'
  )
  const writing = linked.filter((t) => {
    const kinds = [t.answer?.kind, ...(t.parts ?? []).map((p) => p.answer?.kind)]
    return kinds.some((k) => k === 'lines' || k === 'space')
  })
  note(area, writing.length === 0, writing.length ? `${writing.length} Höraufgabe(n) verlangen freies Schreiben` : 'Keine Schreibaufgaben während des Hörens')
  note(area, linked.every(hasSolution), 'Jede Höraufgabe hat eine Lösung')
  if (audios.length > 1) {
    const order = linked.map((t) => t.audioId)
    const grouped = order.every((id, i) => i === 0 || id === order[i - 1] || !order.slice(0, i - 1).includes(id))
    note(area, grouped, grouped ? 'Die Aufgaben stehen nach Hörtext gruppiert' : 'Die Aufgaben springen zwischen den Hörtexten')
  }
}

/**
 * Wartet auf den fertigen Editor – oder bricht sofort ab, wenn die App einen Fehler meldet.
 * Vorher lief das Skript in solchen Fällen zehn Minuten in eine Zeitüberschreitung.
 */
/*
 * Wartezeiten: Der Test darf NIE vor der App aufgeben.
 *
 * Die App lässt einem CLI-Anbieter 12 Minuten (`TIMEOUT_MS` in services/ai/cli.ts, dazu
 * `--print-timeout 11m`). Ein Test, der nach 10 Minuten abbricht, meldet „hängt" für etwas,
 * das noch arbeitet – und verbrennt das Kontingent für nichts. Deshalb liegt die Geduld hier
 * ueber der der App.
 */
const APP_TIMEOUT_MS = 12 * 60 * 1000
const WAIT_MS = APP_TIMEOUT_MS + 2 * 60 * 1000

async function waitForEditor(timeout) {
  const editor = page.waitForSelector('.ws-editor-pages:visible', { timeout })
  const failure = page
    .waitForSelector('.mantine-Notification-root', { timeout })
    .then(async (el) => {
      const text = (await el.textContent()) ?? ''
      // Erfolgsmeldungen sind harmlos – nur auf Fehler reagieren
      if (/fehlgeschlagen|konnte nicht|Fehler/i.test(text)) throw new Error(`Die App meldet: ${text.trim().slice(0, 200)}`)
      return editor
    })
    .catch((e) => {
      throw e
    })
  return Promise.race([editor, failure])
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Arbeitsblatt Englisch mit zwei Hörtexten
// ─────────────────────────────────────────────────────────────────────────────
if (run('blatt')) {
  console.log('\n1) Arbeitsblatt Englisch, Hörverstehen, zwei Hörtexte')
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  const neu = page.getByRole('button', { name: 'Neues Arbeitsblatt' }).filter({ visible: true }).first()
  if (await neu.count()) await neu.click()
  await page.waitForSelector('text=Thema & Lerngruppe', { timeout: 20000 })

  await pick('Fach', 'Englisch')
  await field('Thema').fill('A weekend trip to Edinburgh')
  await pick('Jahrgang', 'Klasse 8')
  await pick('Kompetenzschwerpunkt', 'Hörverstehen (Listening)')
  await page.waitForTimeout(400)
  await page
    .getByRole('checkbox', { name: /Hörtext von der KI schreiben lassen/ })
    .filter({ visible: true })
    .first()
    .check()
  await page.waitForTimeout(400)
  await pick('Zahl der Hörtexte', 'zwei Hörtexte')
  await shot('1a-einstellungen')

  await page.getByRole('button', { name: 'Gliederung planen' }).click()
  await page.waitForSelector('text=Gliederung prüfen', { timeout: WAIT_MS })
  await shot('1b-gliederung')
  await page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' }).click()
  // Auf die echten Seiten warten – die Schrittbeschriftung steht immer da und taugt nicht
  await waitForEditor(WAIT_MS)
  await page.waitForTimeout(4000)
  await shot('1c-arbeitsblatt')

  const sheet = await page.evaluate(async (known) => {
    const fresh = (await window.api.sheets.list()).find((s) => !known.includes(s.id))
    return fresh ? (await window.api.sheets.get(fresh.id)).payload : null
  }, before.sheets)

  if (!sheet) {
    note('Arbeitsblatt', false, 'Kein Arbeitsblatt gespeichert')
  } else {
    const blocks = (sheet.sheets ?? []).flatMap((s) => s.blocks ?? [])
    const tasks = blocks.filter((b) => b.type === 'task')
    const audios = blocks.filter((b) => b.type === 'audio')
    console.log(`   „${sheet.meta.title}" – Bausteine: ${blocks.map((b) => b.type).join(', ')}`)
    checkListening('Hörverstehen', audios, tasks)
    note('Arbeitsblatt', tasks.length >= 3, `${tasks.length} Aufgaben`)
    note('Arbeitsblatt', tasks.every(hasSolution), 'Jede Aufgabe hat eine Lösung')
    const materialTypes = ['text', 'image', 'table', 'grid', 'audio']
    const refs = new Set()
    let no = 0
    for (const b of blocks) if (materialTypes.includes(b.type)) refs.add(`M${++no}`)
    const used = new Set()
    for (const t of tasks)
      for (const m of [t.instruction, ...(t.parts ?? []).map((p) => p.instruction)].join(' ').matchAll(/\b([MQB]\s?\d+)\b/g)) used.add(m[1].replace(/\s+/g, ''))
    const dangling = [...used].filter((r) => !refs.has(r))
    note('Arbeitsblatt', dangling.length === 0, dangling.length ? `Verweise ohne Material: ${dangling.join(', ')}` : 'Alle Materialverweise treffen')
    const warned = blocks.flatMap((b) => b.warnings ?? [])
    note('Arbeitsblatt', true, warned.length ? `Hinweise der App: ${warned.slice(0, 4).join(' | ')}` : 'Keine offenen Hinweise')
    writeFileSync(join(out, 'arbeitsblatt.json'), JSON.stringify(sheet, null, 1), 'utf8')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Grammatiktest Englisch
// ─────────────────────────────────────────────────────────────────────────────
if (run('gtest')) {
  console.log('\n2) Grammatiktest Englisch')
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(600)
  const neuTest = page.getByRole('button', { name: 'Neuer Test' }).filter({ visible: true }).first()
  if (await neuTest.count()) await neuTest.click()
  await page.waitForSelector('text=Geprüfte Formen', { timeout: 20000 })

  await pick('Jahrgang', 'Klasse 8')
  await page.waitForTimeout(300)
  const form = page
    .getByRole('checkbox', { name: /Perfekt vs\. einfache Vergangenheit/ })
    .filter({ visible: true })
    .first()
  if (await form.count()) await form.check()
  else
    await page
      .getByRole('checkbox', { name: /Einfache Vergangenheit/ })
      .filter({ visible: true })
      .first()
      .check()
  await page.waitForTimeout(400)
  await shot('2a-einstellungen')
  await page.getByRole('button', { name: 'Test erstellen' }).click()
  await waitForEditor(WAIT_MS)
  await page.waitForTimeout(3000)
  await shot('2b-grammatiktest')

  const gtest = await page.evaluate(async (known) => {
    const fresh = (await window.api.grammarTests.list()).find((t) => !known.includes(t.id))
    return fresh ? (await window.api.grammarTests.get(fresh.id)).payload : null
  }, before.grammarTests)

  if (!gtest) {
    note('Grammatiktest', false, 'Kein Grammatiktest gespeichert')
  } else {
    const tasks = (gtest.blocks ?? []).filter((b) => b.type === 'task')
    const texts = (gtest.blocks ?? []).filter((b) => b.type === 'text')
    note('Grammatiktest', tasks.length >= 2, `${tasks.length} Aufgaben`)
    const sum = tasks.reduce((n, b) => n + (b.points ?? 0), 0)
    note('Grammatiktest', sum === gtest.meta.points, `Punktsumme ${sum} gegenüber Vorgabe ${gtest.meta.points}`)
    const tagged = tasks.filter((b) => b.grammar?.error)
    note('Grammatiktest', tagged.length === tasks.length, `${tagged.length} von ${tasks.length} Aufgaben einer Stolperstelle zugeordnet`)
    note('Grammatiktest', !gtest.meta.embedded || texts.length >= 1, gtest.meta.embedded ? `Eingebettet: ${texts.length} Materialtext(e)` : 'Nicht eingebettet')
    note('Grammatiktest', tasks.every(hasSolution), 'Jede Aufgabe hat eine Lösung')
    const teaching = (gtest.blocks ?? []).filter((b) => (b.type === 'infoBox' && b.id !== 'test-head') || b.type === 'scaffold')
    note('Grammatiktest', teaching.length === 0, teaching.length ? `${teaching.length} Erarbeitungsbaustein(e) im Test` : 'Keine Merkkästen oder Hilfekarten')
    writeFileSync(join(out, 'grammatiktest.json'), JSON.stringify(gtest, null, 1), 'utf8')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Klassenarbeit Englisch mit Hörteil
// ─────────────────────────────────────────────────────────────────────────────
if (run('arbeit')) {
  console.log('\n3) Klassenarbeit Englisch mit Hörverstehensteil')
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(800)
  // Nur aus der Bibliothek heraus neu anfangen: Steht das Formular schon da, wuerde der Klick
  // es bloss zuruecksetzen. Danach auf das Feld warten statt auf eine geratene Zeitspanne.
  const bibliothek = page.getByRole('button', { name: 'Meine Klassenarbeiten' }).filter({ visible: true })
  if (!(await bibliothek.count())) {
    const neuArbeit = page.getByRole('button', { name: 'Neue Klassenarbeit' }).filter({ visible: true }).first()
    if (await neuArbeit.count()) await neuArbeit.click()
  }
  await field('Thema').waitFor({ state: 'visible', timeout: 30000 })

  await field('Thema').fill('Growing up in the UK')
  await pick('Jahrgang', 'Klasse 8')
  await page.waitForTimeout(500)
  const addPart = page.getByLabel('Weiteren Teil hinzufügen').filter({ visible: true }).first()
  if (await addPart.count()) {
    await addPart.click()
    const listening = page.getByRole('option', { name: /Listening comprehension/ }).first()
    if (await listening.count()) await listening.click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await shot('3a-rahmen')
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).click()
  await page.waitForSelector('button:has-text("Neu erzeugen")', { timeout: 2 * WAIT_MS })
  await page.waitForTimeout(3000)
  await shot('3b-klassenarbeit')

  const exam = await page.evaluate(async (known) => {
    const fresh = (await window.api.exams.list()).find((e) => !known.includes(e.id))
    return fresh ? (await window.api.exams.get(fresh.id)).payload : null
  }, before.exams)

  if (!exam) {
    note('Klassenarbeit', false, 'Keine Klassenarbeit gespeichert')
  } else {
    const parts = exam.parts ?? []
    const tasks = parts.flatMap((p) => (p.blocks ?? []).filter((b) => b.type === 'task'))
    // Dieser Durchlauf stellt genau einen Teil ein (den Hörteil) – mehr zu verlangen waere
    // eine Erwartung an das Skript, nicht an die App.
    note('Klassenarbeit', parts.length >= 1, `${parts.length} Teil(e): ${parts.map((p) => p.formatId).join(', ')}`)
    note('Klassenarbeit', tasks.length >= 2, `${tasks.length} Aufgaben insgesamt`)
    const listeningPart = parts.find((p) => p.formatId === 'en-listening')
    if (!listeningPart) {
      note('Hörteil', false, 'Kein Hörverstehensteil in der Arbeit')
    } else {
      const lb = listeningPart.blocks ?? []
      const la = lb.filter((b) => b.type === 'audio')
      checkListening(
        'Hörteil',
        la,
        lb.filter((b) => b.type === 'task')
      )
      note(
        'Hörteil',
        la.every((a) => (a.plays ?? 0) >= 2),
        'Der Hörtext wird mindestens zweimal gespielt'
      )
    }
    const off = parts.filter((p) => {
      const sum = (p.blocks ?? []).filter((b) => b.type === 'task').reduce((n, b) => n + (b.points ?? 0), 0)
      return p.points > 0 && sum > 0 && Math.abs(sum - p.points) > 1
    })
    note('Klassenarbeit', off.length === 0, off.length ? `${off.length} Teil(e) mit abweichender Punktsumme` : 'Die Punktsummen der Teile stimmen')
    writeFileSync(join(out, 'klassenarbeit.json'), JSON.stringify(exam, null, 1), 'utf8')
  }
}

await cleanup()

const bad = findings.filter((f) => !f.ok)
writeFileSync(join(out, 'befunde.json'), JSON.stringify({ findings, errors }, null, 1), 'utf8')
console.log(`\n${findings.length - bad.length} von ${findings.length} Prüfungen bestanden`)
if (bad.length) console.log('Offen:', bad.map((f) => `[${f.area}] ${f.text}`).join(' · '))
console.log('Konsolenfehler:', errors.length ? errors.slice(0, 5) : 'keine')
await app.close()
rmSync(userData, { recursive: true, force: true })
