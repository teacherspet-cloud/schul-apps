// Wache für die THEMENBEREICHE (Paket 10b) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/themenbereiche.mjs <Ausgabeordner>
//
// Anlass (26.09.2026), Wunsch der Lehrkraft: Die Bibliotheken ordnen nach Fach › Themenbereich,
// der Jahrgang ist nur ein Filter; alle Materialarten teilen sich die Bereiche. Geprüft wird:
//  1. Vorschlag ab 8 Materialien im Fach (lokal, ohne KI) – ein Klick übernimmt, die Ordner
//     erscheinen; ein danach angelegtes Material wird automatisch einsortiert.
//  2. Bereich von Hand anlegen, eine Karte hineinziehen (Ziehen & Ablegen).
//  3. „Verschieben nach …" im ⋯-Menü (Tastatur/Tablet) und „Rückgängig" im Hinweis.
//  4. Jahrgangsfilter oben (Chips) – gemerkt über einen Neustart der Oberfläche.
//  5. Übergreifende Seite von der Startseite aus: Die Lernzielkontrolle im Bereich öffnet im
//     Programm „Lernzielkontrolle".
//  6. Paket 12: Unterbereiche (Beispiel der Lehrkraft: „Der Erste Weltkrieg" › „Ursachen …" ›
//     „Der Balkan als Krisenherd Europas"), Fächer und Bereiche anfangs zugeklappt und gemerkt,
//     Breadcrumb, Bereich auf Bereich ziehen, Löschen samt Unterbereichen, automatisches
//     Einsortieren in die Hierarchie, Überthema = oberster Bereich.
// Bildschirmfotos (hell und dunkel): paket10b-*.png, paket12-themen-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/themenbereiche')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-themen-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})

const sichtbar = (loc) => loc.filter({ visible: true })
const shot = (name) => page.screenshot({ path: join(out, `paket10b-${name}.png`) })
const ordner = (name) => sichtbar(page.locator(`[data-bereich="${name}"]`))
const karte = (name) => sichtbar(page.locator(`.material-huelle[data-material="${name}"]`))

/** Arbeitsblatt-Eintrag ohne KI: nur die Kopfdaten zählen für die Bibliothek */
const blatt = (id, name, subjectId, subjectLabel, grade, topic = name) => ({
  id,
  name,
  stats: { subjectId, subjectLabel, topic, grade, schoolTypeName: 'Gymnasium', sheetCount: 1, hasBoard: false },
  payload: {}
})

/** Fach aufklappen (Paket 12: anfangs zugeklappt) */
async function aufklappen(fachId) {
  const abschnitt = sichtbar(page.locator(`[data-fach-abschnitt="${fachId}"]`)).first()
  if ((await abschnitt.getAttribute('data-offen')) === 'true') return
  await abschnitt
    .getByRole('button', { name: /aufklappen$/ })
    .first()
    .click()
  await page.waitForTimeout(400)
}
/** Bereich im Baum aufklappen */
async function bereichAuf(name) {
  const knopf = sichtbar(page.getByRole('button', { name: `„${name}“ aufklappen` }))
  if (await knopf.count()) {
    await knopf.first().click()
    await page.waitForTimeout(300)
  }
}

async function arbeitsblattBibliothek() {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(400)
  const knopf = sichtbar(page.getByRole('button', { name: 'Meine Arbeitsblätter', exact: true }))
  if (await knopf.count()) await knopf.click()
  await page.waitForTimeout(900)
}

try {
  await warteAufOberflaeche(page)
  /*
   * Seit Paket 12 sortiert die Automatik von selbst ein – auch nach der Lehrplandatei des Landes,
   * die die Recherche laufend ergänzt. Für die Abläufe 1–5 (Vorschlag, Ziehen, Verschieben) muss
   * der Bestand ungeordnet beginnen; die Automatik prüft Teil 6 eigens.
   */
  await page.evaluate(async () => {
    await window.api.themen.automatik('biologie', false)
    await window.api.themen.automatik('mathematik', false)
    await window.api.themen.automatik('geschichte', false)
  })
  // Neu laden: Die Oberfläche hält die Themenbereiche im Speicher und liest sie sonst nicht neu
  await page.reload()
  await warteAufOberflaeche(page)
  // ---------- Bestand: eine echte Lernzielkontrolle (Mathematik) und Arbeitsblätter
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.evaluate(() => window.__selftest.lzkSpeichern('Prüflauf Potenzen'))
  await page.evaluate(
    async (blaetter) => {
      for (const b of blaetter) await window.api.sheets.save(b)
    },
    [
      blatt('bio00001', 'Fotosynthese', 'biologie', 'Biologie', 7),
      blatt('bio00002', 'Photosynthese – Versuch mit Wasserpest', 'biologie', 'Biologie', 7),
      blatt('bio00003', 'Die Zelle', 'biologie', 'Biologie', 7),
      blatt('bio00004', 'Zellatmung und Gärung', 'biologie', 'Biologie', 7),
      blatt('bio00005', 'Zellorganellen im Überblick', 'biologie', 'Biologie', 7),
      blatt('bio00006', 'Ökosystem Wald', 'biologie', 'Biologie', 7),
      blatt('bio00007', 'Ökosysteme im Vergleich', 'biologie', 'Biologie', 7),
      blatt('bio00008', 'Verdauung beim Menschen', 'biologie', 'Biologie', 7),
      blatt('mat00001', 'Potenzen üben', 'mathematik', 'Mathematik', 10, 'Potenzgesetze'),
      blatt('mat00002', 'Lineare Funktionen', 'mathematik', 'Mathematik', 8)
    ]
  )

  // ---------- 1) Vorschlag ab 8 Materialien
  console.log('\nVorschlag')
  await arbeitsblattBibliothek()
  // Anfangs ist alles zugeklappt (Paket 12)
  const zu = await page.evaluate(() =>
    [...document.querySelectorAll('[data-fach-abschnitt]')].filter((x) => x.offsetParent).map((x) => x.getAttribute('data-offen'))
  )
  pruefe(zu.length > 0 && zu.every((x) => x === 'false'), `Fächer anfangs zugeklappt (${zu.join(', ')})`)
  await page.screenshot({ path: join(out, 'paket12-themen-zugeklappt.png') })
  const hinweis = sichtbar(page.locator('[data-vorschlag="biologie"]'))
  pruefe((await hinweis.count()) === 1, 'Biologie (8 Blätter): Vorschlag erscheint')
  const text = (await hinweis.count()) ? await hinweis.innerText() : ''
  pruefe(/Zelle \(3\)/.test(text) && /Fotosynthese \(2\)/.test(text), `Vorschau nennt „Zelle (3)" und „Fotosynthese (2)" (${text.split('\n')[0]})`)
  pruefe((await sichtbar(page.locator('[data-vorschlag="mathematik"]')).count()) === 0, 'Mathematik (3 Materialien): kein Vorschlag')
  await shot('vorschlag-hell')
  await hinweis.getByRole('button', { name: 'Ansehen und auswählen' }).click()
  await page.waitForTimeout(200)
  // Einen Vorschlag abwählen
  await hinweis.getByRole('checkbox', { name: /^Ökosystem/ }).uncheck()
  await hinweis.getByRole('button', { name: '2 Bereiche übernehmen' }).click()
  await page.waitForTimeout(900)
  await aufklappen('biologie')
  pruefe((await ordner('Zelle').count()) === 1 && (await ordner('Fotosynthese').count()) === 1, 'Ordner „Zelle" und „Fotosynthese" angelegt')
  pruefe((await ordner('Ökosystem').count()) === 0, 'Der abgewählte Vorschlag „Ökosystem" bleibt weg')
  pruefe((await ordner('Zelle').innerText()).includes('3 Materialien'), '„Zelle" enthält 3 Materialien')

  // Ein neues Blatt wird automatisch einsortiert
  await page.evaluate((b) => window.api.sheets.save(b), blatt('bio00009', 'Zellteilung', 'biologie', 'Biologie', 7))
  // Neu laden: Die Bibliothek holt ihre Liste beim Öffnen (so wie nach einem Neustart)
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await page.waitForTimeout(600)
  pruefe((await ordner('Zelle').innerText()).includes('4 Materialien'), 'Neues Blatt „Zellteilung" automatisch in „Zelle" einsortiert')
  const zuordnung = await page.evaluate(async () => (await window.api.themen.list()).zuordnungen['arbeitsblatt:bio00009'])
  pruefe(zuordnung?.von === 'auto', `… mit Kennzeichen „automatisch" (${JSON.stringify(zuordnung)})`)

  // ---------- 2) Bereich anlegen und hineinziehen
  console.log('\nAnlegen und Ziehen')
  const mathe = sichtbar(page.locator('[data-fach-abschnitt="mathematik"]'))
  await mathe.getByRole('button', { name: 'Themenbereich', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('textbox', { name: 'Name des neuen Themenbereichs' }).fill('Potenzen')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  pruefe((await ordner('Potenzen').count()) === 1, 'Bereich „Potenzen" in Mathematik angelegt')
  await karte('Potenzen üben').dragTo(ordner('Potenzen'))
  await page.waitForTimeout(800)
  pruefe((await ordner('Potenzen').innerText()).includes('1 Material'), '„Potenzen üben" per Ziehen in „Potenzen" abgelegt')
  const hand = await page.evaluate(async () => (await window.api.themen.list()).zuordnungen['arbeitsblatt:mat00001'])
  pruefe(hand?.von === 'hand', '… mit Kennzeichen „von Hand"')
  await shot('bibliothek-hell')

  // Mehrfachauswahl mit Strg-Klick, dann „Verschieben nach …" in einen neuen Bereich
  await karte('Ökosystem Wald').click({ modifiers: ['Control'] })
  await karte('Ökosysteme im Vergleich').click({ modifiers: ['Control'] })
  await page.waitForTimeout(200)
  const leiste = sichtbar(page.locator('.themen-auswahl'))
  pruefe(
    (await leiste.count()) === 1 && (await leiste.innerText()).includes('2 Materialien ausgewählt'),
    'Strg-Klick wählt zwei Karten aus (statt sie zu öffnen)'
  )
  await leiste.getByRole('button', { name: 'Verschieben nach …' }).click()
  const dialog = sichtbar(page.locator('[data-verschieben-dialog]'))
  await dialog.getByRole('textbox', { name: 'Neuer Themenbereich in Biologie' }).fill('Ökologie')
  await dialog.getByRole('button', { name: 'Anlegen und verschieben' }).click()
  await page.waitForTimeout(800)
  pruefe(
    (await ordner('Ökologie').count()) === 1 && (await ordner('Ökologie').innerText()).includes('2 Materialien'),
    'Beide in den neuen Bereich „Ökologie" verschoben'
  )

  // ---------- 3) „Verschieben nach …" mit der Lernzielkontrolle (andere Materialart)
  console.log('\nVerschieben nach …')
  await sichtbar(page.locator('.mantine-SegmentedControl-label', { hasText: 'alle Materialien' })).click()
  await page.waitForTimeout(800)
  pruefe((await karte('Prüflauf Potenzen').count()) === 1, '„alle Materialien" zeigt die Lernzielkontrolle in der Arbeitsblatt-Bibliothek')
  const lzk = karte('Prüflauf Potenzen')
  pruefe((await lzk.getAttribute('data-art')) === 'lernzielkontrolle', '… als Karte der Materialart Lernzielkontrolle (getönt)')
  await lzk.getByRole('button', { name: 'Weitere Aktionen für „Prüflauf Potenzen“' }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach …' }).click()
  await page.waitForTimeout(300)
  await shot('verschieben-hell')
  await sichtbar(page.locator('[data-verschieben-dialog]')).getByRole('button', { name: 'Potenzen' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Potenzen').innerText()).includes('2 Materialien'), 'Über „Verschieben nach …" liegt die Kontrolle jetzt auch in „Potenzen"')
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Potenzen').innerText()).includes('1 Material'), '„Rückgängig" holt sie wieder heraus')
  await karte('Prüflauf Potenzen').getByRole('button', { name: 'Weitere Aktionen für „Prüflauf Potenzen“' }).click()
  await page.getByRole('menuitem', { name: 'Verschieben nach …' }).click()
  await sichtbar(page.locator('[data-verschieben-dialog]')).getByRole('button', { name: 'Potenzen' }).click()
  await page.waitForTimeout(700)

  // ---------- 4) Jahrgangsfilter
  console.log('\nJahrgang')
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Klasse 8' })).click()
  await page.waitForTimeout(500)
  pruefe((await karte('Lineare Funktionen').count()) === 1, 'Klasse 8: „Lineare Funktionen" sichtbar')
  pruefe((await karte('Die Zelle').count()) === 0 && (await ordner('Zelle').count()) === 0, 'Klasse 8: Biologie (Klasse 7) ausgeblendet')
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  pruefe((await karte('Lineare Funktionen').count()) === 1 && (await karte('Die Zelle').count()) === 0, 'Der Filter bleibt nach dem Neuladen gemerkt')
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Alle Jahrgänge' })).click()
  await page.waitForTimeout(400)

  // Bereich löschen: Rückfrage direkt am Ordner, Materialien nach „Ohne Themenbereich", Rückgängig
  console.log('\nLöschen')
  await ordner('Fotosynthese').getByRole('button', { name: 'Weitere Aktionen für den Themenbereich „Fotosynthese“' }).click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await page.waitForTimeout(200)
  const rueckfrage = sichtbar(page.locator('[data-bereich-loeschen]'))
  pruefe((await rueckfrage.count()) === 1, 'Löschen fragt direkt am Ordner nach')
  await rueckfrage.getByRole('button', { name: 'Löschen' }).click()
  await page.waitForTimeout(700)
  pruefe((await ordner('Fotosynthese').count()) === 0 && (await karte('Fotosynthese').count()) === 1, 'Ordner weg, das Blatt steht unter „Ohne Themenbereich"')
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(800)
  pruefe(
    (await ordner('Fotosynthese').count()) === 1 && (await ordner('Fotosynthese').innerText()).includes('2 Materialien'),
    '„Rückgängig" stellt den Bereich samt Inhalt wieder her'
  )

  // ---------- 5) Übergreifende Seite von der Startseite: Kontrolle öffnet im richtigen Programm
  console.log('\nÜbergreifend')
  await page.click('[aria-label="Startseite"]')
  await page.waitForTimeout(700)
  // Seit 03.10.2026 ohne eigenen Abschnitt: über die Suche der Startseite (Treffer „Themenbereich")
  await sichtbar(page.getByLabel('Materialien durchsuchen')).fill('Potenzen')
  await page.waitForTimeout(400)
  const bereichTreffer = sichtbar(page.locator('button', { hasText: 'Potenzen' }).filter({ hasText: 'Themenbereich' }))
  pruefe((await bereichTreffer.count()) === 1, 'Startseite: Themenbereich über die Suche')
  await bereichTreffer.click()
  await page.waitForTimeout(800)
  pruefe(
    (await karte('Prüflauf Potenzen').count()) === 1 && (await karte('Potenzen üben').count()) === 1,
    'Bereich „Potenzen" zeigt Arbeitsblatt und Lernzielkontrolle zusammen'
  )
  await shot('uebergreifend-hell')
  await karte('Prüflauf Potenzen')
    .getByRole('button', { name: /„Prüflauf Potenzen“ öffnen/ })
    .click()
  await page.waitForTimeout(1200)
  const aktiv = await page.evaluate(() => document.querySelector('.app-leiste [data-active="true"]')?.getAttribute('aria-label'))
  pruefe(aktiv === 'Lernzielkontrolle', `Klick öffnet im Programm „Lernzielkontrolle" (aktiv: ${aktiv})`)
  // Seit 27.09.2026 steht der Name im Feld der Editor-Leiste (wie beim Arbeitsblatt)
  pruefe((await page.getByLabel('Name in der App').inputValue()) === 'Prüflauf Potenzen', '… mit genau dieser Kontrolle')

  // Suche auf der Startseite findet den Bereich
  await page.click('[aria-label="Startseite"]')
  await page.waitForTimeout(500)
  await page.getByRole('textbox', { name: 'Materialien durchsuchen' }).fill('potenzen')
  await page.waitForTimeout(300)
  pruefe((await sichtbar(page.locator('[data-home-bereich="Potenzen"]')).count()) === 1, 'Startseiten-Suche findet den Themenbereich')

  // ---------- 6) Hierarchie (Paket 12)
  console.log('\nUnterbereiche')
  await arbeitsblattBibliothek()
  await page.evaluate(
    async (blaetter) => {
      for (const b of blaetter) await window.api.sheets.save(b)
    },
    [
      blatt('ges00001', 'Ursachen des Ersten Weltkriegs – Bündnisse', 'geschichte', 'Geschichte', 9),
      blatt('ges00002', 'Der Balkan als Krisenherd Europas', 'geschichte', 'Geschichte', 9)
    ]
  )
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await aufklappen('geschichte')
  const geschichte = sichtbar(page.locator('[data-fach-abschnitt="geschichte"]'))
  await geschichte.getByRole('button', { name: 'Themenbereich', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name des neuen Themenbereichs' }).fill('Der Erste Weltkrieg')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  /*
   * Wie eine Lehrkraft: Menüpunkt wählen und einfach lostippen – OHNE `fill()`, das den Fokus
   * selbst ins Feld holt. Anlass (26.09.2026): Das Menü holte den Fokus 10 ms nach dem Schließen
   * auf seinen ⋯-Knopf zurück; getippt wurde ins Leere, Enter öffnete das Menü von Neuem, und die
   * Wache brach je nach Rechnerlast hier ab (shared/menueFokus.ts).
   */
  const perMenue = async (oben, punkt) => {
    await ordner(oben)
      .getByRole('button', { name: `Weitere Aktionen für den Themenbereich „${oben}“` })
      .first()
      .click()
    await page.getByRole('menuitem', { name: punkt }).click()
    await page.waitForTimeout(300)
    return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
  }
  const unterAnlegen = async (oben, name) => {
    const fokus = await perMenue(oben, 'Unterbereich anlegen')
    pruefe(fokus === 'Name des neuen Unterbereichs', `„Unterbereich anlegen": der Fokus steht im Namensfeld (${fokus})`)
    await page.keyboard.type(name)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    pruefe((await ordner(name).count()) === 1, `„${name}" sofort sichtbar (Oberbereich aufgeklappt)`)
    pruefe((await ordner(name).first().getAttribute('data-neu')) === 'true', `… und hervorgehoben`)
  }
  await unterAnlegen('Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs')
  await unterAnlegen('Ursachen des Ersten Weltkriegs', 'Der Balkan als Krisenherd Europas')
  pruefe((await ordner('Der Balkan als Krisenherd Europas').count()) === 1, 'Drei Ebenen angelegt, der Unterbereich ist aufgeklappt sichtbar')
  // Umbenennen im Baum ebenso: Früher schloss der zurückgeholte Fokus das Feld sofort (onBlur)
  const fokusUm = await perMenue('Der Balkan als Krisenherd Europas', 'Umbenennen')
  pruefe(fokusUm === 'Neuer Name des Themenbereichs', `„Umbenennen": das Feld bleibt offen und hat den Fokus (${fokusUm})`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const tiefe = await page.evaluate(() =>
    document.querySelector('[data-bereich="Der Balkan als Krisenherd Europas"]')?.closest('[data-baum-tiefe]')?.getAttribute('data-baum-tiefe')
  )
  pruefe(tiefe === '2', `„Der Balkan …" steht auf der dritten Ebene (Tiefe ${tiefe})`)

  // Automatik einschalten: vorhandene Blätter kommen in den passenden (tiefsten) Unterbereich
  await geschichte.getByRole('button', { name: 'Einstellungen der Themenbereiche in Geschichte' }).click()
  await page.getByRole('menuitem', { name: 'Neue Materialien automatisch einsortieren' }).click()
  await page.waitForTimeout(300)
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await page.waitForTimeout(800)
  const z = await page.evaluate(async () => {
    const d = await window.api.themen.list()
    const name = (id) => d.bereiche.find((b) => b.id === id)?.name
    return [name(d.zuordnungen['arbeitsblatt:ges00001']?.bereichId), name(d.zuordnungen['arbeitsblatt:ges00002']?.bereichId)]
  })
  pruefe(
    z[0] === 'Ursachen des Ersten Weltkriegs' && z[1] === 'Der Balkan als Krisenherd Europas',
    `Automatisch in die Hierarchie einsortiert (${z.join(' / ')})`
  )
  // Aufgeklappt bleibt aufgeklappt – auch nach dem Neuladen
  pruefe((await ordner('Der Balkan als Krisenherd Europas').count()) === 1, 'Aufgeklappte Fächer und Bereiche sind gemerkt')
  pruefe((await ordner('Der Erste Weltkrieg').innerText()).includes('2 Materialien'), 'Der Oberbereich zählt die Materialien seiner Unterbereiche mit')
  await page.screenshot({ path: join(out, 'paket12-themen-baum.png') })

  // Zuklappen und aufklappen
  await page.getByRole('button', { name: '„Der Erste Weltkrieg“ zuklappen' }).first().click()
  await page.waitForTimeout(300)
  pruefe((await ordner('Ursachen des Ersten Weltkriegs').count()) === 0, 'Zugeklappt verschwinden die Unterbereiche')
  await bereichAuf('Der Erste Weltkrieg')

  // Geöffneter Bereich: ganzer Pfad als Breadcrumb
  await ordner('Der Balkan als Krisenherd Europas').getByRole('button', { name: 'Themenbereich „Der Balkan als Krisenherd Europas“ öffnen' }).click()
  await page.waitForTimeout(500)
  const pfad = await sichtbar(page.locator('[data-pfad]')).first().getAttribute('data-pfad')
  pruefe(pfad === 'Der Erste Weltkrieg › Ursachen des Ersten Weltkriegs › Der Balkan als Krisenherd Europas', `Breadcrumb mit dem ganzen Pfad (${pfad})`)
  await page.screenshot({ path: join(out, 'paket12-themen-pfad.png') })
  await sichtbar(page.getByRole('button', { name: 'Der Erste Weltkrieg', exact: true }))
    .first()
    .click()
  await page.waitForTimeout(400)
  pruefe((await sichtbar(page.locator('[data-offener-bereich="Der Erste Weltkrieg"]')).count()) === 1, 'Ein Klick im Pfad führt zum Oberbereich')
  pruefe((await sichtbar(page.locator('[data-unterbereiche]')).count()) === 1, '… der seine Unterbereiche zeigt')
  await sichtbar(page.getByRole('button', { name: 'Alle Fächer' }))
    .first()
    .click()
  await page.waitForTimeout(400)

  // Bereich auf Bereich ziehen: „Der Balkan …" unter einen neuen Bereich „Imperialismus"
  // – angelegt bei eingeschaltetem Jahrgangsfilter: Der leere neue Bereich darf nicht verschwinden
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Klasse 9' })).click()
  await page.waitForTimeout(400)
  await geschichte.getByRole('button', { name: 'Themenbereich', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name des neuen Themenbereichs' }).fill('Imperialismus')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  pruefe((await ordner('Imperialismus').count()) === 1, 'Neuer (leerer) Bereich bleibt trotz Jahrgangsfilter sichtbar')
  await sichtbar(page.locator('.mantine-Chip-label', { hasText: 'Alle Jahrgänge' })).click()
  await page.waitForTimeout(400)
  // Beide Zeilen ins Bild holen: Scrollt Playwright erst während des Ziehens zum Ziel, bricht Chromium das Ziehen ab
  await ordner('Der Balkan als Krisenherd Europas')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await ordner('Der Balkan als Krisenherd Europas').first().dragTo(ordner('Imperialismus').first())
  await page.waitForTimeout(800)
  const neuePfad = await page.evaluate(async () => {
    const d = await window.api.themen.list()
    const b = d.bereiche.find((x) => x.name === 'Der Balkan als Krisenherd Europas')
    return d.bereiche.find((x) => x.id === b?.elternId)?.name
  })
  pruefe(neuePfad === 'Imperialismus', `Bereich per Ziehen unter einen anderen gehängt (jetzt unter „${neuePfad}")`)
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(700)
  const zurueck = await page.evaluate(async () => {
    const d = await window.api.themen.list()
    const b = d.bereiche.find((x) => x.name === 'Der Balkan als Krisenherd Europas')
    return d.bereiche.find((x) => x.id === b?.elternId)?.name
  })
  pruefe(zurueck === 'Ursachen des Ersten Weltkriegs', '„Rückgängig" hängt ihn zurück')

  // Löschen samt Unterbereichen, Rückgängig stellt alles wieder her
  await ordner('Der Erste Weltkrieg').getByRole('button', { name: 'Weitere Aktionen für den Themenbereich „Der Erste Weltkrieg“' }).first().click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await page.waitForTimeout(200)
  const frage = sichtbar(page.locator('[data-bereich-loeschen]'))
  pruefe((await frage.innerText()).includes('samt 2 Unterbereichen'), 'Die Rückfrage nennt die Unterbereiche')
  await frage.getByRole('button', { name: 'Löschen' }).click()
  await page.waitForTimeout(700)
  pruefe(
    (await ordner('Der Erste Weltkrieg').count()) === 0 && (await karte('Der Balkan als Krisenherd Europas').count()) === 1,
    'Gelöscht; das Blatt steht unter „Ohne Themenbereich"'
  )
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(900)
  const wieder = await page.evaluate(async () => {
    const d = await window.api.themen.list()
    const name = (id) => d.bereiche.find((b) => b.id === id)?.name
    return name(d.zuordnungen['arbeitsblatt:ges00002']?.bereichId)
  })
  pruefe(
    wieder === 'Der Balkan als Krisenherd Europas' && (await ordner('Der Erste Weltkrieg').count()) === 1,
    '„Rückgängig" stellt alle drei Ebenen samt Zuordnung wieder her'
  )

  // Überthema im Kopf = der OBERSTE Bereich
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  // Aus der Bibliothek zurück in den Editor
  const zurueckZu = sichtbar(page.getByRole('button', { name: /^Zurück zu/ }))
  if (await zurueckZu.count()) await zurueckZu.first().click()
  await page.evaluate(() => window.__selftest.wsMaterialtext(6))
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.__selftest.inUnterbereich('arbeitsblatt', ['Die Weimarer Republik', 'Krisenjahre'], 'geschichte'))
  await page.waitForTimeout(1200)
  const fachzeile = await page.evaluate(() => {
    const seite = [...document.querySelectorAll('.ws-editor-pages .ws-page')].find(
      (p) => p.getBoundingClientRect().width > 0 && !p.classList.contains('ws-cover')
    )
    // Ohne weiche Trennstriche (Silbentrennung im Blatt)
    return (seite?.querySelector('.ws-header .ws-subject')?.textContent ?? '').replace(/\u00ad/g, '')
  })
  pruefe(fachzeile.includes('Geschichte › Die Weimarer Republik') && !fachzeile.includes('Krisenjahre'), `Überthema ist der oberste Bereich („${fachzeile}")`)

  // ---------- Dunkelmodus
  await page.evaluate(() => window.api.settings.set({ appearance: { colorScheme: 'dark' } }))
  await page.reload()
  await warteAufOberflaeche(page)
  await arbeitsblattBibliothek()
  await aufklappen('mathematik')
  await shot('bibliothek-dunkel')
  await ordner('Potenzen').getByRole('button', { name: 'Themenbereich „Potenzen“ öffnen' }).click()
  await page.waitForTimeout(600)
  await shot('bereich-dunkel')
  // Je Materialart eine Tönung: gleiche Art gleich, verschiedene Arten verschieden (wie viele Arten im Bereich liegen, ist egal)
  const flaechen = await page.evaluate(() =>
    [...document.querySelectorAll('.material-huelle')].map((h) => [h.getAttribute('data-art'), getComputedStyle(h.querySelector('.mantine-Card-root')).backgroundColor])
  )
  const jeArt = new Map()
  for (const [art, farbe] of flaechen) jeArt.set(art, new Set([...(jeArt.get(art) ?? []), farbe]))
  const farbenJeArt = [...jeArt.values()].map((x) => [...x][0])
  pruefe(
    jeArt.size >= 2 && [...jeArt.values()].every((x) => x.size === 1) && new Set(farbenJeArt).size === jeArt.size,
    `Dunkel: jede Materialart eigen getönt (${[...jeArt.entries()].map(([a, f]) => `${a}: ${[...f].join('/')}`).join(' · ')})`
  )
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
