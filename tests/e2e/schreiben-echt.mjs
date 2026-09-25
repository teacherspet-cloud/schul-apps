// Prüfdurchlauf der SCHREIBAUFGABE mit ECHTER KI – VERBRAUCHT KONTINGENT.
//
// Aufruf: node tests/e2e/schreiben-echt.mjs <Ausgabeordner>
// Läuft nur auf ausdrückliche Anweisung der Lehrkraft, nie als Teil eines Sammellaufs.
//
// Eigener, wegwerfbarer Datenordner; hineinkopiert werden nur Einstellungen, Zugangsdaten
// und Designvorlagen. So landet nichts vom Testmaterial zwischen den gespeicherten Arbeiten.
//
// Geprüft wird nicht, OB etwas entsteht, sondern OB ES TAUGT – gegen die Vorgaben, die aus
// den amtlichen Abschlussprüfungen und der Vorlage der Lehrkraft stammen:
//   – Situierung, Inhaltspunkte, Umfang und Formvorgaben sind da und stehen auf dem Blatt
//   – der Erwartungshorizont hat je Inhaltspunkt ein übergeordnetes Kriterium mit Punkten
//   – es gibt einen Mustertext in der Zielsprache
//   – das sprachliche Gerüst ist nach Sprachhandlung gegliedert und nimmt keine Inhalte vorweg
//   – Erwartungshorizont und Mustertext stehen NICHT auf dem Schülerblatt
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/schreiben-echt')
mkdirSync(out, { recursive: true })

const live = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-schreiben-'))
for (const file of ['settings.json', 'secrets.json', 'model-cache.json', 'worksheet-designs.json', 'worksheet-designs-version.json']) {
  const from = join(live, file)
  if (existsSync(from)) copyFileSync(from, join(userData, file))
}
console.log(`Eigener Datenordner: ${userData}`)

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.setSize(1600, 1050)
  win.center()
})
await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(800)

const befunde = []
const note = (ok, text) => {
  befunde.push({ ok, text })
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/*
 * Der Anlassfall: die Vorlage der Lehrkraft – ein Bericht über eine internationale
 * Jugendkonferenz, Klasse 10, etwa 275 Wörter, mit mehreren Operatoren.
 */
const auftrag = { stateId: 'NI', grade: 10, topic: 'An international youth conference on the cities of the future', textType: 'report', words: 275 }
console.log(`\nAuftrag: ${auftrag.topic}, Klasse ${auftrag.grade}, ${auftrag.textType}, ${auftrag.words} Wörter`)
console.log('Die KI arbeitet …\n')

let e
try {
  e = await page.evaluate((a) => window.__selftest.schreibEcht(a), auftrag)
} catch (err) {
  console.error('Der Durchlauf ist gescheitert:', String(err).slice(0, 400))
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  process.exit(1)
}

console.log(`Dauer: ${e.sekunden} s · ${e.bausteine.length} Bausteine\n`)

const b = e.brief
if (!b) {
  note(false, 'Es ist gar keine Schreibaufgabe mit Vorgaben entstanden')
} else {
  console.log('ARBEITSANWEISUNG')
  console.log(`  ${e.anweisung.replace(/\s+/g, ' ')}`)
  console.log('\nVORGABEN (stehen auf dem Blatt)')
  console.log(`  Situation: ${b.situation.replace(/\s+/g, ' ')}`)
  console.log(`  Adressat:  ${b.audience} · Textsorte: ${b.textType} · Zweck: ${b.purpose}`)
  console.log(`  Umfang:    ${b.words} Wörter`)
  for (const p of b.points) console.log(`  • ${p.replace(/\s+/g, ' ')}`)
  for (const f of b.form ?? []) console.log(`  Form: ${f}`)
  for (const spalte of b.notes ?? []) {
    console.log(`\n  [${spalte.title}]`)
    for (const it of spalte.items) console.log(`    – ${it}`)
    for (const pr of spalte.prompts) console.log(`    ? ${pr}`)
  }

  console.log('\nERWARTUNGSHORIZONT (nur Lehrkraft)')
  for (const x of b.expected ?? []) {
    console.log(`  ${x.aspect} — ${x.points} P.`)
    console.log(`    Kriterium: ${x.criterion.replace(/\s+/g, ' ')}`)
    for (const bsp of x.examples) console.log(`      · ${bsp.replace(/\s+/g, ' ')}`)
  }
  for (const c of b.criteria) console.log(`  Bewertung: ${c}`)
  if (b.model) console.log(`\nMUSTERTEXT (${b.model.split(/\s+/).length} Wörter)\n  ${b.model.replace(/\s+/g, ' ').slice(0, 600)}…`)

  // --- die Vorgaben ---------------------------------------------------------
  note(
    b.situation
      .trim()
      .split(/[.!?]/)
      .filter((s) => s.trim()).length >= 2,
    `Die Situierung hat mehrere Sätze (${b.situation.length} Zeichen)`
  )
  note(Boolean(b.audience && b.textType && b.purpose), `Adressat, Textsorte und Zweck sind gefüllt`)
  note(b.points.length >= 3, `${b.points.length} Inhaltspunkte (erwartet: mindestens 3)`)
  /*
   * Der geplante Umfang folgt dem GER-Niveau des Blattes, nicht dem Thema: B1 ergibt
   * rund 140 Woerter. Die Lehrkraft kann ihn derzeit nicht direkt vorgeben - fuer eine
   * Abschlussaufgabe der Klasse 10 (250-300 Woerter) waere das wuenschenswert.
   */
  note(b.words >= 100, `Umfang ${b.words} Wörter (folgt dem Niveau ${'B1'})`)
  // Jeder Inhaltspunkt soll einen eigenen Auftrag tragen, nicht nur ein Stichwort sein
  const zuKurz = b.points.filter((p) => p.trim().split(/\s+/).length < 3)
  note(zuKurz.length === 0, zuKurz.length ? `Zu knappe Inhaltspunkte: ${zuKurz.join(' | ')}` : 'Alle Inhaltspunkte sind ausformuliert')

  // --- Erwartungshorizont ---------------------------------------------------
  const erw = b.expected ?? []
  note(erw.length >= 3, `${erw.length} Zeilen im Erwartungshorizont`)
  note(erw.length > 0 && erw.every((x) => x.criterion.trim().split(/\s+/).length >= 5), 'Jede Zeile nennt ein ausformuliertes übergeordnetes Kriterium')
  note(
    erw.every((x) => x.points > 0),
    'Jede Zeile trägt eine Punktzahl'
  )
  note(
    erw.every((x) => x.examples.length >= 2),
    `Beispiellösungen je Zeile: ${erw.map((x) => x.examples.length).join('/')} (erwartet: mindestens 2)`
  )
  note(b.criteria.length >= 2, `${b.criteria.length} sprachliche Bewertungskriterien`)
  const musterWorte = (b.model ?? '').split(/\s+/).filter(Boolean).length
  note(musterWorte >= b.words * 0.6, `Mustertext ${musterWorte} Wörter (gefordert waren ${b.words})`)
  // Der Mustertext muss in der Zielsprache sein – ein deutscher wäre für die Lehrkraft wertlos
  const deutsch = /\b(und|nicht|werden|Schülerinnen|wurde|einen|können)\b/.test(b.model ?? '')
  note(!deutsch, deutsch ? 'Der Mustertext ist (teilweise) deutsch' : 'Der Mustertext steht in der Zielsprache')
}

// --- sprachliches Gerüst ----------------------------------------------------
const ph = e.phrases
console.log('\nSPRACHLICHES GERÜST')
if (!ph) {
  note(false, 'Es ist kein sprachliches Gerüst entstanden')
} else {
  console.log(`  ${ph.title} — ${ph.hint}`)
  for (const g of ph.groups) {
    console.log(`  [${g.label}]`)
    for (const it of g.items) console.log(`    ${it.text}${it.german ? `  (${it.german})` : ''}`)
  }
  note(ph.groups.length >= 3, `${ph.groups.length} Gruppen`)
  note(
    ph.groups.every((g) => g.items.length >= 2),
    `Einträge je Gruppe: ${ph.groups.map((g) => g.items.length).join('/')}`
  )
  // Nach Sprachhandlung gegliedert heißt: Die Überschrift benennt ein Tun, kein Thema
  const themenGruppen = ph.groups.filter((g) => /^(Singapur|Singapore|Konferenz|Conference|Stadt|City)/i.test(g.label))
  note(
    themenGruppen.length === 0,
    themenGruppen.length
      ? `Gruppen nach Thema statt Sprachhandlung: ${themenGruppen.map((g) => g.label).join(', ')}`
      : 'Die Gruppen sind nach Sprachhandlung benannt'
  )
  // Das Gerüst darf die Sprache tragen, nicht die Gedanken
  const zuLang = ph.groups.flatMap((g) => g.items).filter((it) => it.text.split(/\s+/).length > 12)
  note(
    zuLang.length === 0,
    zuLang.length
      ? `Zu lange, inhaltlich vorwegnehmende Wendungen: ${zuLang
          .slice(0, 2)
          .map((i) => i.text)
          .join(' | ')}`
      : 'Keine Wendung nimmt den Inhalt vorweg'
  )
}

/*
 * Und die wichtigste Probe: Was gehört der Lehrkraft, steht NICHT auf dem Schülerblatt.
 * Geprüft am tatsächlich gesetzten Blatt, nicht am Datenmodell.
 */
await page.waitForTimeout(1500)
/*
 * Geprueft wird die DRUCKFASSUNG, nicht der Editor.
 *
 * Im Editor stehen rund um das Blatt Bedienelemente und Hinweise, in denen das Wort
 * „Erwartungshorizont" voellig zu Recht vorkommt – eine Suche im DOM schlug dadurch falsch
 * an. Was die Lernenden bekommen, ist das gedruckte Blatt.
 */
const aufDemBlatt = await page.evaluate(() =>
  window.__selftest
    .printHtml()
    // Stilangaben zuerst entfernen: Im Stylesheet steht ein Kommentar
    // „Erwartungshorizont - nur auf dem Loesungsblatt", und die Suche schlug daran an
    .replace(/<(style|script)[\s\S]*?<\/(style|script)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
)
if (e.brief) {
  const musterAnfang = (e.brief.model ?? '').split(/\s+/).slice(0, 6).join(' ')
  const stelle = aufDemBlatt.indexOf('Erwartungshorizont')
  note(stelle < 0, 'Der Erwartungshorizont steht nicht auf dem Schülerblatt')
  if (stelle >= 0) console.log(`    Fundstelle: …${aufDemBlatt.slice(Math.max(0, stelle - 160), stelle + 80).replace(/\s+/g, ' ')}…`)
  note(musterAnfang.length < 8 || !aufDemBlatt.includes(musterAnfang), 'Der Mustertext steht nicht auf dem Schülerblatt')
  note(aufDemBlatt.includes(e.brief.situation.slice(0, 40)), 'Die Situierung steht auf dem Blatt')
  const ersterPunkt = (e.brief.points[0] ?? '').slice(0, 30)
  note(ersterPunkt.length < 8 || aufDemBlatt.includes(ersterPunkt), 'Die Inhaltspunkte stehen auf dem Blatt')
}
await page.screenshot({ path: join(out, 'blatt.png'), fullPage: false })

// Lösungsansicht
await page.evaluate(() => {
  const label = [...document.querySelectorAll('.mantine-SegmentedControl-label')].find((x) => x.textContent?.trim() === 'Lösungen')
  label?.click()
})
await page.waitForTimeout(1200)
await page.screenshot({ path: join(out, 'loesungen.png'), fullPage: false })

writeFileSync(join(out, 'ergebnis.json'), JSON.stringify({ auftrag, ergebnis: e, befunde }, null, 2), 'utf8')

const react = errors.filter((x) => /Maximum update depth|Minified React error|#185|#310/i.test(x))
if (react.length) note(false, `React-Fehler: ${react[0].slice(0, 140)}`)

await app.close()
// Der wegwerfbare Datenordner geht mit – es wird nichts gespeichert
rmSync(userData, { recursive: true, force: true })

const schlecht = befunde.filter((x) => !x.ok)
console.log(`\n${befunde.length - schlecht.length} von ${befunde.length} Punkten erfüllt. Dateien in ${out}`)
if (schlecht.length) process.exit(1)
