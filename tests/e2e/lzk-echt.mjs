// Prüfdurchlauf der Lernzielkontrolle MIT ECHTER KI – VERBRAUCHT KONTINGENT.
//
// Aufruf: node tests/e2e/lzk-echt.mjs <Ausgabeordner>
// Läuft nur auf ausdrückliche Anweisung der Lehrkraft, nie als Teil eines Sammellaufs.
//
// Der Lauf bekommt einen EIGENEN, wegwerfbaren Datenordner; hineinkopiert werden nur
// Einstellungen, Zugangsdaten und Designvorlagen. So kann nichts vom Testmaterial zwischen
// den gespeicherten Arbeiten der Lehrkraft landen – auch nicht bei einem harten Abbruch.
//
// Geprüft wird nicht, OB etwas entsteht, sondern OB ES DEN VORGABEN ENTSPRICHT:
// Umfang zur Zeit, genau ein Operator je Aufgabe, keine Lernhilfen auf dem Blatt,
// Operatoren aus der Landesliste, Lösung zu jeder Aufgabe.
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/lzk-echt')
mkdirSync(out, { recursive: true })

const live = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-lzk-echt-'))
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
await page.click('[aria-label="Lernzielkontrolle"]')
await page.waitForTimeout(800)

const befunde = []
const note = (ok, text) => {
  befunde.push({ ok, text })
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/*
 * Der Anlassfall: dieselbe Aufgabe, an der die vorgelegte KI-Lernzielkontrolle gescheitert
 * ist – Potenzgesetze, Klasse 10, 20 Minuten. Bayern, weil dort die Stegreifaufgabe die
 * engsten belegten Grenzen hat (20 Minuten, Stoff aus höchstens zwei Stunden).
 */
const auftrag = {
  stateId: 'BY',
  fach: 'mathematik',
  grade: 10,
  thema: 'Potenzgesetze',
  stoff: 'Produkt- und Quotientenregel bei gleicher Basis, Potenzieren einer Potenz, Potenzen mit dem Exponenten null',
  minutes: 20
}
console.log(`\nAuftrag: ${auftrag.thema}, Klasse ${auftrag.grade}, ${auftrag.minutes} Minuten, ${auftrag.stateId}`)
console.log('Die KI arbeitet …\n')

let ergebnis
try {
  ergebnis = await page.evaluate((a) => window.__selftest.lzkEcht(a), auftrag)
} catch (e) {
  console.error('Der Durchlauf ist gescheitert:', String(e).slice(0, 400))
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  process.exit(1)
}

console.log(`Dauer: ${ergebnis.sekunden} s · Format: ${ergebnis.format}`)
console.log(`Operatorengrundlage: ${ergebnis.profil}\n`)

const aufgaben = ergebnis.bausteine.filter((b) => b.typ === 'task')
const material = ergebnis.bausteine.filter((b) => b.typ !== 'task')
console.log(`${aufgaben.length} Aufgaben, ${material.length} Materialbausteine:\n`)
for (const [i, b] of ergebnis.bausteine.entries()) {
  console.log(`${i + 1}. [${b.typ}${b.operator ? ` · ${b.operator}` : ''}${b.antwortform ? ` · ${b.antwortform}` : ''}${b.punkte ? ` · ${b.punkte} P.` : ''}]`)
  console.log(`   ${b.text.replace(/\s+/g, ' ').slice(0, 150)}`)
  for (const t of b.teilaufgaben) console.log(`     – ${t.replace(/\s+/g, ' ').slice(0, 130)}`)
  if (b.loesung) console.log(`   Lösung: ${b.loesung.replace(/\s+/g, ' ').slice(0, 120)}`)
}

console.log('\nBefunde der eingebauten Prüfungen:')
if (!ergebnis.befunde.length) console.log('  (keine)')
for (const b of ergebnis.befunde) console.log('  -', b.replace(/\s+/g, ' ').slice(0, 190))

// ---- Was das Ergebnis erfüllen muss ----
console.log('\nBewertung:')

const teilaufgaben = aufgaben.reduce((s, a) => s + Math.max(1, a.teilaufgaben.length), 0)
note(aufgaben.length >= 2 && aufgaben.length <= 5, `${aufgaben.length} Aufgaben (erwartet 2 bis 5 für 20 Minuten)`)
note(teilaufgaben <= 9, `${teilaufgaben} Teilaufgaben (echte bayerische Stegreifaufgaben: 4 bis 9)`)

// Die Bauregel: keine Lernhilfen auf dem Prüfungsblatt
const verboten = ergebnis.bausteine.filter((b) => ['infoBox', 'scaffold', 'learningGoals', 'selfCheck'].includes(b.typ))
note(verboten.length === 0, `keine Lernhilfen auf dem Blatt${verboten.length ? ` (gefunden: ${verboten.map((v) => v.typ).join(', ')})` : ''}`)

// Genau ein Operator je Aufgabenstellung
const ohneOperator = aufgaben.filter((a) => !a.operator)
note(ohneOperator.length === 0, `jede Aufgabe nennt ihren Operator${ohneOperator.length ? ` (${ohneOperator.length} ohne)` : ''}`)

// Zu jeder Aufgabe gehört eine Lösung – sonst ist das Lösungsblatt wertlos
const ohneLoesung = aufgaben.filter((a) => !a.loesung.trim())
note(ohneLoesung.length === 0, `jede Aufgabe trägt eine Lösung${ohneLoesung.length ? ` (${ohneLoesung.length} ohne)` : ''}`)

// Punkte, weil die Voreinstellung sie verlangt
const ohnePunkte = aufgaben.filter((a) => !a.punkte)
note(ohnePunkte.length === 0, `jede Aufgabe trägt Punkte${ohnePunkte.length ? ` (${ohnePunkte.length} ohne)` : ''}`)

// Die eigentliche Frage: Hält sich die KI an die Regeln, die wir ihr mitgeben?
const warnungen = ergebnis.befunde.filter((b) => b.startsWith('[warnung]'))
note(warnungen.length === 0, `${warnungen.length} Warnungen der eingebauten Prüfungen`)

// Das Blatt nummeriert die Teilaufgaben selbst – die KI darf die Buchstaben nicht noch einmal schreiben
const doppelt = aufgaben.flatMap((a) => a.teilaufgaben).filter((t) => /^\s*[a-h]\)/.test(t))
note(
  doppelt.length === 0,
  `keine doppelte Nummerierung in den Teilaufgaben${doppelt.length ? ` (${doppelt.length}×, z. B. „${doppelt[0].slice(0, 30)}")` : ''}`
)

// Formeln gehören gesetzt, nicht als Dollartext
await page.waitForSelector('.ws-editor-pages', { timeout: 20000 })
await page.waitForTimeout(1500)
const darstellung = await page.evaluate(() => {
  const w = document.querySelector('.ws-editor-pages')
  return {
    formeln: w?.querySelectorAll('.rt-math').length ?? 0,
    dollar: (w?.textContent ?? '').match(/\$[^$]{1,30}\$/g) ?? [],
    kopf: (w?.querySelector('.ws-header')?.textContent ?? '').replace(/\s+/g, ' ').trim()
  }
})
note(darstellung.dollar.length === 0, `keine Dollarzeichen auf dem Blatt${darstellung.dollar.length ? ` (${darstellung.dollar.slice(0, 3).join(', ')})` : ''}`)
note(darstellung.formeln > 0, `${darstellung.formeln} gesetzte Formeln`)
note(/Stegreifaufgabe/.test(darstellung.kopf), `Kopfzeile nennt das Landesformat: „${darstellung.kopf.slice(0, 70)}"`)

await page.screenshot({ path: join(out, 'aufgabenblatt.png'), fullPage: false })

/*
 * Bibliothek mit echtem Material: speichern, verwerfen, wieder oeffnen, vergleichen.
 *
 * Der Inhalt laeuft dabei durch JSON. Ein Prueflauf mit einem gebauten Blatt findet hier
 * wenig - die echten Aufgaben tragen Formeln, Teilaufgaben, Loesungen und Punktzahlen, und
 * genau dort faellt ein verlorenes Feld auf.
 */
console.log('\nBibliothek:')
const reise = await page.evaluate(() => window.__selftest.lzkRundreise('Prüflauf ' + new Date().toISOString().slice(0, 16)))
note(reise.zwischendurchLeer, 'der Zustand war zwischendurch wirklich leer')
note(reise.gleich, 'die wieder geöffnete Kontrolle ist inhaltlich identisch')
if (!reise.gleich) {
  console.log('  davor :', JSON.stringify(reise.davor).slice(0, 400))
  console.log('  danach:', JSON.stringify(reise.nachher).slice(0, 400))
}
note(reise.schritt === 1, `das Programm springt in den Editor (Schritt ${reise.schritt})`)
note(Boolean(reise.name), `der Name steht in der Kopfzeile: „${reise.name}"`)

// Die Uebersicht muss den Eintrag zeigen
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Meine Lernzielkontrollen'))
  b?.click()
})
await page.waitForTimeout(900)
/*
 * Die Zahl kommt aus der BIBLIOTHEK, nicht aus dem Fenster.
 *
 * Ein erster Entwurf zaehlte `.mantine-Card-root` ueber `document` – und meldete 26
 * Eintraege in einem frisch angelegten, leeren Datenordner. Gezaehlt hatte er die Karten
 * ALLER Programme, die im Hintergrund geladen bleiben.
 */
const liste = await page.evaluate(() => window.__selftest.lzkBibliothek())
const sichtbar = await page.evaluate(() => ({
  text: (document.body.textContent ?? '').includes('Meine Lernzielkontrollen'),
  format: (document.body.textContent ?? '').includes('Stegreifaufgabe')
}))
note(liste.anzahl === 1, `die Bibliothek enthält ${liste.anzahl} Eintrag/Einträge (erwartet genau 1)`)
note(sichtbar.text, 'die Übersicht „Meine Lernzielkontrollen" ist offen')
note(sichtbar.format, 'die Zeile nennt das Landesformat')
await page.screenshot({ path: join(out, 'bibliothek.png'), fullPage: false })

// Formeln muessen auch nach dem Wiederoeffnen gesetzt sein
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Öffnen')
  b?.click()
})
await page.waitForTimeout(2000)
const nachOeffnen = await page.evaluate(() => {
  const w = document.querySelector('.ws-editor-pages')
  return { formeln: w?.querySelectorAll('.rt-math').length ?? 0, dollar: (w?.textContent ?? '').match(/\$[^$]{1,30}\$/g) ?? [] }
})
note(nachOeffnen.formeln > 0, `${nachOeffnen.formeln} gesetzte Formeln nach dem Wiederöffnen`)
note(nachOeffnen.dollar.length === 0, 'keine Dollarzeichen nach dem Wiederöffnen')
await page.screenshot({ path: join(out, 'wieder-geoeffnet.png'), fullPage: false })

const weg = await page.evaluate((id) => window.__selftest.lzkLoeschen(id), reise.id)
note(weg.anzahl === 0, `nach dem Löschen sind ${weg.anzahl} Einträge übrig`)
// Auf die Lösungsansicht umschalten: das Etikett mit dem Wort, nicht die x-te Schaltflaeche
await page.evaluate(() => {
  const label = [...document.querySelectorAll('.mantine-SegmentedControl-label')].find((e) => e.textContent?.trim() === 'Lösungen')
  label?.click()
})
await page.waitForTimeout(1200)
await page.screenshot({ path: join(out, 'loesungen.png'), fullPage: false })

writeFileSync(join(out, 'ergebnis.json'), JSON.stringify({ auftrag, ergebnis, befunde }, null, 2), 'utf8')

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) note(false, `React-Fehler: ${react[0].slice(0, 140)}`)

await app.close()
// Der wegwerfbare Datenordner geht mit – es wird nichts gespeichert
rmSync(userData, { recursive: true, force: true })

const schlecht = befunde.filter((b) => !b.ok)
console.log(`\n${befunde.length - schlecht.length} von ${befunde.length} Punkten erfüllt. Dateien in ${out}`)
if (schlecht.length) process.exit(1)
