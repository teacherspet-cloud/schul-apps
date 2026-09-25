// Prüft gespeicherte Materialien gegen die Vorgaben – ohne KI, also ohne Kontingent.
// Aufruf: node tests/e2e/pruefen.mjs <Ausgabeordner> [--sheet <id>] [--exam <id>] [--gtest <id>] [--test <id>]
import { _electron as electron } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/pruefung')
mkdirSync(out, { recursive: true })
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : null
}

const findings = []
const note = (area, ok, text) => {
  findings.push({ area, ok, text })
  console.log(`${ok ? '  ok ' : '  !! '} [${area}] ${text}`)
}

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)

/** Steht die Lösung im Hörtext? Sonst ist die Aufgabe nicht hörend lösbar. */
const coveredBy = (solution, script) => {
  const w = words(solution)
  if (!w.length) return true
  return w.filter((x) => script.includes(x)).length / w.length >= 0.34
}

const hasSolution = (t) => Boolean(String(t.solution ?? '').trim() || (t.parts ?? []).some((p) => String(p.solution ?? '').trim()))

function checkListening(area, audios, tasks) {
  note(area, audios.length >= 1, `${audios.length} Hörtext-Baustein(e)`)
  if (!audios.length) return
  note(
    area,
    audios.every((a) => (a.transcript ?? '').trim().length > 80),
    'Jeder Hörtext hat ein ausformuliertes Skript'
  )
  const lengths = audios.map((a) => (a.transcript ?? '').split(/\s+/).filter(Boolean).length)
  note(area, true, `Skriptlängen: ${lengths.join(', ')} Wörter`)
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
  // Je Hörtext gegen SEIN Skript prüfen, nicht gegen alle zusammen
  const byId = new Map(audios.map((a) => [a.id, (a.transcript ?? '').toLowerCase()]))
  const bad = linked.filter((t) => !coveredBy(t.solution, byId.get(t.audioId) ?? ''))
  note(area, bad.length === 0, bad.length ? `${bad.length} Lösung(en) stehen nicht im zugehörigen Hörtext` : 'Alle Lösungen stehen im zugehörigen Hörtext')
  // Während des Hörens kein freies Schreiben
  const writing = linked.filter((t) => {
    const kinds = [t.answer?.kind, ...(t.parts ?? []).map((p) => p.answer?.kind)]
    return kinds.some((k) => k === 'lines' || k === 'space')
  })
  note(area, writing.length === 0, writing.length ? `${writing.length} Höraufgabe(n) verlangen freies Schreiben` : 'Keine Schreibaufgaben während des Hörens')
  note(area, linked.every(hasSolution), 'Jede Höraufgabe hat eine Lösung')
  // Mehrere Hörtexte: Aufgaben sollen nach Hörtext gruppiert stehen
  if (audios.length > 1) {
    const order = linked.map((t) => t.audioId)
    const grouped = order.every((id, i) => i === 0 || id === order[i - 1] || !order.slice(0, i - 1).includes(id))
    note(area, grouped, grouped ? 'Die Aufgaben stehen nach Hörtext gruppiert' : 'Die Aufgaben springen zwischen den Hörtexten hin und her')
  }
}

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)

const sheetId = arg('--sheet')
if (sheetId) {
  const ws = await page.evaluate(async (id) => (await window.api.sheets.get(id)).payload, sheetId)
  const blocks = (ws.sheets ?? []).flatMap((s) => s.blocks ?? [])
  const tasks = blocks.filter((b) => b.type === 'task')
  const audios = blocks.filter((b) => b.type === 'audio')
  console.log(`\nArbeitsblatt: ${ws.meta.title} (${ws.meta.subjectLabel}, Klasse ${ws.meta.grade}, ${ws.meta.cefrLevel})`)
  console.log(`Bausteine: ${blocks.map((b) => b.type).join(', ')}`)
  checkListening('Hörverstehen', audios, tasks)

  note('Arbeitsblatt', tasks.length >= 3, `${tasks.length} Aufgaben`)
  note('Arbeitsblatt', tasks.every(hasSolution), 'Jede Aufgabe hat eine Lösung')
  // Die Materialnummern vergibt die APP fortlaufend über die Material-Bausteine –
  // sie stehen nicht im Titel. Genauso muss die Prüfung zählen.
  const materialTypes = ['text', 'image', 'table', 'grid', 'audio']
  const refs = new Set()
  let materialNo = 0
  for (const b of blocks) if (materialTypes.includes(b.type)) refs.add(`M${++materialNo}`)
  const used = new Set()
  for (const t of tasks) {
    const text = [t.instruction, ...(t.parts ?? []).map((p) => p.instruction)].join(' ')
    for (const m of String(text).matchAll(/\b([MQB]\s?\d+)\b/g)) used.add(m[1].replace(/\s+/g, ''))
  }
  const dangling = [...used].filter((r) => !refs.has(r))
  note('Arbeitsblatt', dangling.length === 0, dangling.length ? `Verweise ohne Material: ${dangling.join(', ')}` : 'Alle Materialverweise treffen')
  const warned = blocks.filter((b) => (b.warnings ?? []).length)
  note(
    'Arbeitsblatt',
    true,
    warned.length
      ? `${warned.length} Baustein(e) mit Hinweis: ${warned
          .flatMap((b) => b.warnings)
          .slice(0, 4)
          .join(' | ')}`
      : 'Keine offenen Hinweise'
  )
  writeFileSync(join(out, 'arbeitsblatt.json'), JSON.stringify(ws, null, 1), 'utf8')
}

const examId = arg('--exam')
if (examId) {
  const ex = await page.evaluate(async (id) => (await window.api.exams.get(id)).payload, examId)
  const parts = ex.parts ?? []
  console.log(`\nKlassenarbeit: ${ex.meta.title || ex.meta.topic} (${ex.meta.subjectLabel}, Klasse ${ex.meta.grade})`)
  note('Klassenarbeit', parts.length >= 2, `${parts.length} Teile: ${parts.map((p) => p.formatId).join(', ')}`)
  const listening = parts.find((p) => p.formatId === 'en-listening')
  if (listening) {
    const lb = listening.blocks ?? []
    checkListening(
      'Hörteil',
      lb.filter((b) => b.type === 'audio'),
      lb.filter((b) => b.type === 'task')
    )
    const la = lb.filter((b) => b.type === 'audio')
    note(
      'Hörteil',
      la.every((a) => (a.plays ?? 0) >= 2),
      'Der Hörtext wird mindestens zweimal gespielt'
    )
  } else {
    note('Hörteil', false, 'Kein Hörverstehensteil vorhanden')
  }
  const off = parts.filter((p) => {
    const sum = (p.blocks ?? []).filter((b) => b.type === 'task').reduce((n, b) => n + (b.points ?? 0), 0)
    return p.points > 0 && sum > 0 && Math.abs(sum - p.points) > 1
  })
  note('Klassenarbeit', off.length === 0, off.length ? `${off.length} Teil(e) mit abweichender Punktsumme` : 'Die Punktsummen der Teile stimmen')
  writeFileSync(join(out, 'klassenarbeit.json'), JSON.stringify(ex, null, 1), 'utf8')
}

const gtestId = arg('--gtest')
if (gtestId) {
  const t = await page.evaluate(async (id) => (await window.api.grammarTests.get(id)).payload, gtestId)
  const tasks = (t.blocks ?? []).filter((b) => b.type === 'task')
  console.log(`\nGrammatiktest: ${t.meta.title || 'ohne Titel'} (Klasse ${t.meta.grade})`)
  note('Grammatiktest', tasks.length >= 2, `${tasks.length} Aufgaben`)
  const sum = tasks.reduce((n, b) => n + (b.points ?? 0), 0)
  note('Grammatiktest', sum === t.meta.points, `Punktsumme ${sum} gegenüber Vorgabe ${t.meta.points}`)
  const tagged = tasks.filter((b) => b.grammar?.error)
  note('Grammatiktest', tagged.length === tasks.length, `${tagged.length} von ${tasks.length} Aufgaben einer Stolperstelle zugeordnet`)
  const texts = (t.blocks ?? []).filter((b) => b.type === 'text')
  note('Grammatiktest', !t.meta.embedded || texts.length >= 1, t.meta.embedded ? `Eingebettet: ${texts.length} Materialtext(e)` : 'Nicht eingebettet')
  note('Grammatiktest', tasks.every(hasSolution), 'Jede Aufgabe hat eine Lösung')
  const teaching = (t.blocks ?? []).filter((b) => (b.type === 'infoBox' && b.id !== 'test-head') || b.type === 'scaffold')
  note('Grammatiktest', teaching.length === 0, teaching.length ? `${teaching.length} Erarbeitungsbaustein(e) im Test` : 'Keine Merkkästen oder Hilfekarten')
  writeFileSync(join(out, 'grammatiktest.json'), JSON.stringify(t, null, 1), 'utf8')
}

const testId = arg('--test')
if (testId) {
  const v = await page.evaluate(async (id) => (await window.api.tests.get(id)).payload, testId)
  console.log(`\nVokabeltest: ${v?.settings?.title ?? 'ohne Titel'}`)
  const blocks = v?.blocks ?? []
  note('Vokabeltest', blocks.length > 0, `${blocks.length} Aufgabenblöcke`)
  writeFileSync(join(out, 'vokabeltest.json'), JSON.stringify(v, null, 1), 'utf8')
}

const bad = findings.filter((f) => !f.ok)
writeFileSync(join(out, 'befunde.json'), JSON.stringify(findings, null, 1), 'utf8')
console.log(`\n${findings.length - bad.length} von ${findings.length} Prüfungen bestanden`)
await app.close()
