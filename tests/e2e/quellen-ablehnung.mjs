// Wache für die Quellenvorschläge (01.10.2026) – mit KI-ATTRAPPE und Archiv-Attrappe, ohne Netz
// (vorher: npm run build).
// Aufruf: node tests/e2e/quellen-ablehnung.mjs <Ausgabeordner>
//
// Gemeldet von der Lehrkraft: Für „German Macbeth Adaptations" schlug die Klassenarbeit wiederholt
// „Die Musikforschung" (Wikisource) und „Friedrich Gundolf" vor – trotz vorheriger Aussortierung.
//
// Die Archiv-Attrappe liefert genau diese beiden Seiten (gekürzte echte Texte samt Kategorien,
// tests/fixtures/quellen-macbeth.json) und dazu eine passende deutsche Theaterkritik als Netzfund.
// Geprüft wird über die Oberfläche der Klassenarbeit (Englisch, Klasse 12):
//  1. In der Quellenauswahl stehen Musikforschung und Gundolf NICHT, die Kritik schon – mit Begründung.
//  2. „Nie wieder vorschlagen" nimmt die Kritik aus der Liste; die Ablehnung steht in der Datei.
//  3. Nach einem NEUSTART (gleiches Profil) gilt sie weiter: Die nächste Arbeit zum Thema legt
//     keine Auswahl mehr vor, der Teil sagt, dass ein abgelehnter Fund ausgeblendet wurde.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/quellen-ablehnung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-quellen-'))
const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quellen-macbeth.json'), 'utf8'))

const KRITIK_URL = 'https://example.org/feuilleton/macbeth-auf-deutschen-buehnen'
const KRITIK = [
  'Macbeth auf deutschen Bühnen: Kaum ein Stück Shakespeares wird an deutschen Theatern so oft neu gedeutet wie Macbeth. Die Tragödie um den schottischen Feldherrn, der aus Ehrgeiz zum Mörder wird, erscheint in jeder Spielzeit an mehreren Häusern.',
  'Die jüngste Inszenierung an einem Stadttheater verlegt die Handlung in ein Großraumbüro. Statt der Hexen flüstern Bildschirme Prophezeiungen, und der Aufstieg Macbeths wird als Karriere in einem Konzern erzählt, die über Leichen geht.',
  'Schon im achtzehnten Jahrhundert haben deutsche Dichter den Stoff bearbeitet. Schillers Fassung für die Weimarer Bühne glättete die Sprache und machte die Hexen zu feierlichen Schicksalsgestalten. Spätere Übersetzungen kehrten zur Härte des Originals zurück.',
  'Heute stehen die deutschen Bearbeitungen von Macbeth meist für eine politische Lesart. Die Regie fragt, wie Macht entsteht und warum Menschen ihr folgen, obwohl sie den Preis kennen. Das Publikum erkennt darin die Gegenwart wieder.',
  'Viele Inszenierungen kürzen den Text stark und ergänzen ihn um neue Szenen. Kritiker streiten darüber, ob das dem Stück schadet oder ob es den Kern freilegt. Sicher ist, dass Macbeth in Deutschland ein lebendiger Stoff geblieben ist, den jede Generation neu befragt.'
].join('\n\n')

const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
const teil = {
  blocks: [
    {
      outlineIndex: 0,
      type: 'task',
      instruction: '**Summarise** the text.',
      operator: 'summarise',
      afb: 'I',
      solution: 'Loesung',
      points: 5,
      answer: { kind: 'lines', lines: 4 }
    }
  ]
}
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 150,
    protokoll,
    bildsuche: [],
    quellen: {
      treffer: ['musikforschung', 'gundolf'].map((k) => ({
        titel: fixture[k].titel,
        url: fixture[k].url,
        herkunft: 'wikisource',
        auszug: fixture[k].text.slice(0, 200),
        kategorien: fixture[k].kategorien
      })),
      texte: {
        [fixture.musikforschung.url]: { titel: fixture.musikforschung.titel, text: fixture.musikforschung.text },
        [fixture.gundolf.url]: { titel: fixture.gundolf.titel, text: fixture.gundolf.text },
        [KRITIK_URL]: { titel: 'Macbeth auf deutschen Bühnen', text: KRITIK }
      }
    },
    websuche: [{ titel: 'Macbeth auf deutschen Bühnen', url: KRITIK_URL, auszug: 'Kaum ein Stück Shakespeares …' }],
    antworten: {
      material_suche: { begriffe: ['Macbeth Rezeption Deutschland', 'Macbeth Inszenierung Theater'], kernbegriffe: ['Macbeth'], gesucht: 'Theaterkritik' },
      material_relevanz: {
        bewertungen: [
          { nummer: 0, passung: 9, art: 'sachtext', sprache: 'de', begruendung: 'Deutscher Sachtext über Macbeth-Bearbeitungen auf deutschen Bühnen.' }
        ]
      },
      exam_part: teil
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

async function starte() {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)
  return { app, page }
}

const sichtbar = (l) => l.filter({ visible: true }).first()

/** Klassenarbeit Englisch, Klasse 12, Thema Macbeth – bis zur Quellenauswahl bzw. zum fertigen Blatt */
async function arbeitStarten(page) {
  await page.click('[aria-label="Klassenarbeiten"]')
  // Nach dem Neustart öffnet das Programm die zuletzt bearbeitete Arbeit – dann eine neue anfangen
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
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill('German Macbeth Adaptations')
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).first().click()
}

/** Wartet auf die Quellenauswahl (ggf. über „Auswahl treffen" in der Auftragsleiste) oder das fertige Blatt */
async function warteAufAuswahlOderBlatt(page, ms = 60000) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    if (await page.getByText('Originalquelle auswählen').filter({ visible: true }).count()) return 'auswahl'
    const knopf = page.getByRole('button', { name: 'Auswahl treffen' }).filter({ visible: true })
    if (await knopf.count()) await knopf.first().click()
    if (await page.locator('.ws-editor-pages .ws-page').filter({ visible: true }).count()) return 'blatt'
    await page.waitForTimeout(300)
  }
  return 'nichts'
}

let laufend = null
try {
  // ---------- 1. Erste Arbeit: Auswahl ohne die Fehlvorschläge
  laufend = await starte()
  let { page } = laufend
  await arbeitStarten(page)
  const stand = await warteAufAuswahlOderBlatt(page)
  pruefe(stand === 'auswahl', `Die Quellenauswahl erscheint (${stand})`)
  const dialog = page.locator('.mantine-Modal-content', { hasText: 'Originalquelle auswählen' })
  const liste = await dialog.innerText()
  await page.screenshot({ path: join(out, 'auswahl.png') })
  pruefe(liste.includes('Macbeth auf deutschen Bühnen'), 'Die passende Kritik wird vorgeschlagen')
  pruefe(!liste.includes('Die Musikforschung'), '„Die Musikforschung" wird nicht vorgeschlagen')
  pruefe(!liste.includes('Friedrich Gundolf'), '„Friedrich Gundolf" wird nicht vorgeschlagen')
  pruefe(/Passung 9\/10/.test(liste) && liste.includes('Deutscher Sachtext'), 'Die Begründung der Prüfung steht beim Fund')
  const ki = existsSync(protokoll) ? readFileSync(protokoll, 'utf8') : ''
  pruefe(ki.includes('"schemaName":"material_relevanz"'), 'Die KI prüfte die Relevanz vor dem Vorschlag')
  pruefe(!/material_relevanz[^\n]*Die Musikforschung/.test(ki), 'Musikforschung fiel schon an den festen Regeln heraus (die KI sah sie gar nicht)')

  // ---------- 2. „Nie wieder vorschlagen"
  await dialog.locator('[data-ablehnen="global"]').first().click()
  await sichtbar(page.getByText('Alle Funde sind ausgeblendet.')).waitFor({ timeout: 5000 })
  pruefe(true, 'Der abgelehnte Fund verschwindet sofort aus der Liste')
  const daten = await page.evaluate(() => window.api.sources.ablehnungen())
  pruefe(
    daten.eintraege.some((e) => e.url === KRITIK_URL && e.umfang === 'global' && e.programm === 'klassenarbeit'),
    'Die Ablehnung („nie wieder") ist gespeichert'
  )
  await dialog.getByRole('button', { name: 'Keine davon' }).click()
  // Weitere Teile mit Originaltext legen nichts mehr vor – der einzige passende Fund ist abgelehnt
  pruefe((await warteAufAuswahlOderBlatt(page)) === 'blatt', 'Die Arbeit entsteht ohne weitere Auswahl')
  await laufend.app.close()
  laufend = null

  // ---------- 3. Neustart: Die Ablehnung gilt weiter
  pruefe(existsSync(join(userData, 'quellen-ablehnungen.json')), 'Die Ablehnungsliste liegt als Datei im Profil')
  laufend = await starte()
  page = laufend.page
  const nachNeustart = await page.evaluate(() => window.api.sources.ablehnungen())
  pruefe(
    nachNeustart.eintraege.some((e) => e.url === KRITIK_URL),
    'Nach dem Neustart ist die Ablehnung noch da'
  )
  await arbeitStarten(page)
  const zweiter = await warteAufAuswahlOderBlatt(page)
  pruefe(zweiter === 'blatt', `Keine Auswahl mit abgelehnten Funden (${zweiter})`)
  await page.waitForTimeout(800)
  const exam = await page.evaluate(() => window.__selftest.kaJetzt())
  const hinweis = JSON.stringify(exam?.meta?.teacherNote ?? '') + JSON.stringify(exam?.parts ?? [])
  pruefe(/abgelehnter Fund wurde ausgeblendet/.test(hinweis), 'Der Teil nennt die Ausblendung als Grund')
  await page.screenshot({ path: join(out, 'nach-neustart.png') })
} catch (e) {
  problems.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
  console.error(e)
} finally {
  await laufend?.app.close().catch(() => undefined)
  try {
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    // Wegwerf-Profil – ein gesperrter Rest stört nicht
  }
}

writeFileSync(join(out, 'ergebnis.txt'), problems.length ? problems.join('\n') : 'OK')
if (problems.length) {
  console.error(`\n${problems.length} Problem(e)`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
