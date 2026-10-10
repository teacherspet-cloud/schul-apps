// Runde 08.10.2026 abends: Regal mit Fachordnern (Gäste), Register „My Books" (Bücherbord: frühere Bände ganz, aktueller Band mit
// freigegebenen Abschnitten, „Weitere Wörter"; Cover schlägt auf) und „Alphabetical list" (A–Z-Leiste, Fundstellen, Fenster-Zeichnen) (09.10.2026),
// eigene Reihenfolge per Ziehen (am Konto gemerkt), A–Z,
// Ordner aufschlagen mit Registern, Blättern im Ordner (Unterseiten, Zurück/Vorwärts, Neuladen; 09.10.2026), Wahl „Liste" als Rückfall; Verbspiele erst
// nach Freischaltung; „Lege das Wort" mit Tippen und Handschrift (Erkennung auf dem Gerät).
// Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-regal.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-regal')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const PAKET = {
  thema: 'Simple past',
  regeln: [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes mit -ed.', beispiele: ['I played.'] }],
  aufgaben: Array.from({ length: 8 }, (_, i) => ({
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle die richtige Form.',
    satz: `Yesterday I ___ (play ${i}).`,
    optionen: ['played', 'play'],
    loesungen: ['played']
  }))
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const trainings = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Rita R' } })).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}/server/vokabeln/${pfad}`, { headers: KOPF, data })).json()
  const woerter = ['go', 'see', 'take', 'come', 'quokka', 'kumquat'].map((t, i) => ({ id: `e${i}`, term: t, translation: `Wort ${i}` }))
  const en = (await post('freigeben', { titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter, gaeste: true })).id
  const fr = (await post('freigeben', { titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'f1', term: 'le chat', translation: 'die Katze' }], gaeste: true })).id
  trainings.push(en, fr)
  const ben = (await post(`${en}/eintragen`, { namen: ['Ben S.'] })).eingetragen[0]
  const g = await (
    await lk.request.post(`${A}/server/grammatik/freigeben`, {
      headers: KOPF,
      // Klasse beim Freigeben (08.10.2026): Grammatik-Register nach Schuljahren – „Year 5"
      data: { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: en, info: { themen: [], teilformen: [], jahrgang: 5 } }
    })
  ).json()
  pruefe(Boolean(en && fr && ben?.zugang && g.id), `Englisch (mit Grammatik) und Französisch freigegeben, Ben eingetragen (${JSON.stringify(g).slice(0, 200)})`)

  // ---------- Gast Ben: anmelden, in Französisch beitreten
  const gc = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  await gc.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: ben.zugang } })
  // Ben auch in Französisch eintragen (gleicher Name bei derselben Lehrkraft = gleiches Konto)
  await post(`${fr}/eintragen`, { namen: ['Ben S.'] })

  // ---------- Verbspiele: ohne bekannte Vergangenheit keine Verben, nach Freischaltung schon
  const liste = async () => (await (await gc.request.get(`${A}/s/api/vokabeln/liste?id=${en}`, { headers: KOPF })).json()).verben
  pruefe((await liste()) === null, 'Ohne bekannte Vergangenheit: keine unregelmäßigen Verben für Ben')
  await post(`${en}/verbspiele`, { wert: 'an' })
  const v = await liste()
  pruefe(Boolean(v?.karten?.length), `Nach „jetzt freischalten“: Verben da (${v?.karten?.length ?? 0})`)
  await post(`${en}/verbspiele`, { wert: '' })
  // Kurs aus dem Lehrwerk (09.10.2026, „My Books"): Green Line 3, Unit 1 – Check-in und Station 1 freigegeben
  const gl = (
    await post('freigeben', {
      titel: 'Green Line 3 - Unit 1 - Check-in, Station 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [
        { id: 'g1', term: 'to attend', translation: 'teilnehmen, besuchen' },
        { id: 'g2', term: 'comfort zone', translation: 'Komfortzone' }
      ],
      quelle: { lehrwerk: 'green-line-3', unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1'] },
      gaeste: true
    })
  ).id
  trainings.push(gl)
  await post(`${gl}/eintragen`, { namen: ['Ben S.'] })

  // ---------- Regal
  const p = await gc.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}/s/`)
  pruefe(await da(p.locator('[data-regal]')), 'Gast sieht das Regal')
  const reihe = async () => p.locator('[data-regal-ordner]').evaluateAll((els) => els.map((e) => e.getAttribute('data-regal-ordner')))
  await p.locator('[data-regal-ordner]').first().waitFor()
  pruefe(JSON.stringify(await reihe()) === JSON.stringify(['Englisch', 'Französisch']), `A–Z: English vor Français (${await reihe()})`)
  const rueckenText = await p.locator('[data-regal-ordner="Englisch"]').innerText()
  pruefe(/English/.test(rueckenText) && /Vocabulary/.test(rueckenText) && /Grammar/.test(rueckenText), `Rücken in der Fremdsprache: ${rueckenText.replace(/\s+/g, ' ')}`)
  await p.screenshot({ path: join(out, '1-regal-dunkel.png') })
  // Ziehen: Français vor English
  const quelle = await p.locator('[data-regal-ordner="Französisch"]').boundingBox()
  const ziel = await p.locator('[data-regal-ordner="Englisch"]').boundingBox()
  await p.mouse.move(quelle.x + quelle.width / 2, quelle.y + quelle.height / 2)
  await p.mouse.down()
  await p.mouse.move(quelle.x + quelle.width / 2 - 20, quelle.y + quelle.height / 2, { steps: 4 })
  await p.mouse.move(ziel.x + 8, ziel.y + ziel.height / 2, { steps: 8 })
  await p.mouse.up()
  await p.waitForTimeout(600)
  pruefe((await reihe())[0] === 'Französisch', `Nach dem Ziehen: Français vorn (${await reihe()})`)
  pruefe(p.url().endsWith('/s/'), 'Ziehen öffnet keinen Ordner')
  await p.reload()
  await p.locator('[data-regal-ordner]').first().waitFor()
  pruefe((await reihe())[0] === 'Französisch', 'Eigene Reihenfolge bleibt nach dem Neuladen (am Konto)')
  await p.locator('[data-regal-az]').click()
  await p.waitForTimeout(300)
  pruefe((await reihe())[0] === 'Englisch', 'A–Z wiederhergestellt')

  // ---------- Ordner aufschlagen
  await p.locator('[data-regal-ordner="Englisch"]').click()
  pruefe(await da(p.locator('[data-ordner-uebergang]'), 3000), 'Animation: Ordner wird herausgenommen')
  await p.waitForURL(/\/s\/ordner\//)
  pruefe(await da(p.locator('[data-ordner="Englisch"]')), 'Ordner Englisch aufgeschlagen')
  await p.waitForTimeout(700)
  pruefe(
    JSON.stringify(await p.locator('[data-lasche]').evaluateAll((els) => els.map((e) => e.getAttribute('data-lasche')))) === '["vok","wort","abc","gram"]',
    'Register: Vocabulary, My Books, Alphabetical list und Grammar (ohne Materialien)'
  )
  await p.screenshot({ path: join(out, '2-ordner-vok.png') })
  await p.locator('[data-lasche="gram"]').click()
  pruefe(await da(p.locator('[data-ordner-kurs="grammatik"]')), 'Register Grammar zeigt das Grammatiktraining')
  pruefe(
    (await p.locator('[data-ordner-jahrgang="5"][data-offen="true"]').textContent().catch(() => ''))?.includes('Year 5'),
    'Grammar nach Schuljahren: „Year 5" (neuestes Jahr) aufgeklappt'
  )
  await p.screenshot({ path: join(out, '3-ordner-gram.png') })
  // My Books (09.10.2026): Bücherbord – Green Line 1 und 2 ganz, Green Line 3 nur mit den freigegebenen Abschnitten,
  // dazu „Weitere Wörter" (Liste ohne Lehrwerk); keine Gruppen „Vokabelweg …"
  await p.locator('[data-lasche="wort"]').click()
  pruefe((await p.locator('[data-lasche="wort"]').innerText()).includes('My Books'), 'Lasche „My Books" in der Fremdsprache')
  pruefe(await da(p.locator('[data-buecherbord]')), 'My Books zeigt das Bücherbord')
  const buecher = await p.locator('[data-buch]').evaluateAll((els) => els.map((e) => e.getAttribute('data-buch')))
  // Nach Schuljahren (10.10.2026): „This year" (GL 3, Weitere Wörter), dann „Earlier years" (GL 1, GL 2)
  pruefe(JSON.stringify(buecher) === '["green-line-3","__weitere","green-line-1","green-line-2"]', `Bord: GL 3 und Weitere Wörter, dann GL 1 und GL 2 (${buecher})`)
  pruefe(
    (await p.locator('[data-bord-jahr="jetzt"]').textContent()).includes('This year') && (await p.locator('[data-bord-jahr="frueher"]').textContent()).includes('Earlier years'),
    'Bord-Abschnitte „This year" / „Earlier years" in der Fremdsprache'
  )
  pruefe((await p.locator('[data-buch-aktuell]').getAttribute('data-buch')) === 'green-line-3', 'Green Line 3 ist der aktuelle Band')
  pruefe((await p.locator('[data-buch] [data-cover], [data-buch] [data-cover-ersatz], [data-buch] .mb-ersatz').count()) === 4, 'Je Buch ein Cover (oder Ersatzkachel)')
  pruefe((await p.getByText('Vokabelweg').count()) === 0, 'Keine Gruppen „Vokabelweg …" mehr')
  pruefe(
    (await p.locator('[data-buch="__weitere"]').textContent()).includes('More words') && (await p.locator('[data-buch-aktuell]').textContent()).includes('so far'),
    'Bord-Texte in der Fremdsprache („More words", „so far")'
  )
  await p.screenshot({ path: join(out, '2b-meine-buecher.png') })
  const anzahl = async () => Number(await p.locator('[data-wortliste-anzahl]').getAttribute('data-wortliste-anzahl'))
  // Suche über alle Bücher
  await p.locator('[data-wortliste-suche]').fill('KOMFORTZONE')
  await p.waitForTimeout(250)
  pruefe(
    (await anzahl()) >= 1 && (await p.locator('[data-wortliste-gruppe^="Green Line 3"] [data-wortliste-wort="comfort zone"]').isVisible()),
    `Suche in allen Büchern (groß/klein egal): „comfort zone" aus GL 3 (${await anzahl()} Treffer)`
  )
  await p.locator('[data-wortliste-suche]').fill('überrascht')
  await p.waitForTimeout(250)
  pruefe((await anzahl()) >= 2, `Suche auf Deutsch findet „surprised" in GL 1 und GL 2 (${await anzahl()})`)
  await p.locator('[data-wortliste-suche]').fill('xyzq')
  await p.waitForTimeout(200)
  // Texte in der Fremdsprache (09.10.2026): „Nothing found", „More words", „so far"
  pruefe((await anzahl()) === 0 && (await p.getByText('Nothing found').isVisible()), 'Ohne Treffer: „Nothing found" (in der Fremdsprache)')
  await p.locator('[data-wortliste-suche]').fill('')
  // Buch aufschlagen: Cover wächst und schlägt auf, darunter Units/Abschnitte
  await p.locator('[data-buch="green-line-3"]').click()
  pruefe(await da(p.locator('[data-buch-aufschlagen]'), 1500), 'Cover schlägt auf')
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(out, '2c-buch-aufschlagen.png') })
  await p.locator('[data-buch-aufschlagen]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
  // Units und Abschnitte zugeklappt (10.10.2026), je mit drei Kreisen; Abschnitte IN ihrer Unit
  pruefe((await da(p.locator('[data-buch-offen="green-line-3"]'))) && (await p.locator('[data-buch-unit][data-offen="false"]').count()) === 1, 'GL 3: Unit zugeklappt')
  await p.locator('[data-buch-unit="Unit 1"] .mb-unit-kopf').click()
  const gruppen = await p.locator('[data-wortliste-gruppe]').evaluateAll((els) => els.map((e) => e.getAttribute('data-wortliste-gruppe')))
  pruefe(JSON.stringify(gruppen) === '["Unit 1 · Check-in","Unit 1 · Station 1"]', `GL 3 nur mit den freigegebenen Abschnitten, aufsteigend (${gruppen})`)
  pruefe((await p.locator('[data-buch-unit] [data-stand-kreise]').count()) === 3, 'Drei Kreise an Unit und Abschnitten')
  await p.locator('[data-wortliste-gruppe="Unit 1 · Check-in"] .mb-abschnitt-kopf').click()
  pruefe((await p.locator('[data-wortliste-wort] [data-wort-status="neu"]').count()) >= 5 && /\?r=wort&buch=green-line-3/.test(p.url()), `Wörter mit Stand, Adresse nennt das Buch (${p.url()})`)
  await p.screenshot({ path: join(out, '2d-buch-gl3.png') })
  await p.locator('[data-ordner-zurueck]').click()
  pruefe(await da(p.locator('[data-buecherbord]')), 'Zurück blättert zum Bord')
  await p.locator('[data-buch="green-line-1"]').click()
  await p.locator('[data-buch-offen="green-line-1"]').waitFor()
  pruefe((await p.locator('[data-buch-unit]').count()) > 5, `GL 1 vollständig (${await p.locator('[data-buch-unit]').count()} Units)`)
  await p.goBack()
  await p.locator('[data-buecherbord]').waitFor()
  await p.locator('[data-buch="__weitere"]').click()
  await p.locator('[data-buch-inhalt="__weitere"] .mb-abschnitt-kopf').first().click()
  pruefe(await da(p.locator('[data-wortliste-wort="quokka"]')), 'Weitere Wörter: die Liste ohne Lehrwerk')
  pruefe((await p.locator('[data-wortliste-wort]').count()) === 6, `Alle 6 Wörter der Liste (${await p.locator('[data-wortliste-wort]').count()})`)
  await p.locator('[data-ordner-zurueck]').click()
  // Alphabetical list (09.10.2026)
  await p.locator('[data-lasche="abc"]').click()
  pruefe((await p.locator('[data-lasche="abc"]').innerText()).includes('Alphabetical list'), 'Lasche „Alphabetical list"')
  pruefe(await da(p.locator('[data-abc-leiste]')), 'Sprungleiste A–Z')
  const gesamt = await anzahl()
  const gezeichnet = Number(await p.locator('[data-abc-liste]').getAttribute('data-abc-gezeichnet'))
  pruefe(gesamt > 2000 && gezeichnet < 300, `Alle Wörter (${gesamt}), gezeichnet nur der sichtbare Ausschnitt (${gezeichnet})`)
  const erste = await p.locator('[data-abc-wort]').evaluateAll((els) => els.slice(0, 40).map((e) => e.getAttribute('data-abc-wort')))
  pruefe(erste.length > 10, `Liste beginnt alphabetisch (${erste.slice(0, 6).join(', ')} …)`)
  const buchstaben = await p.locator('[data-abc-sprung]').evaluateAll((els) => els.map((e) => e.getAttribute('data-abc-sprung')))
  pruefe(buchstaben.includes('A') && buchstaben.includes('S') && new Set(buchstaben).size === buchstaben.length, `Leiste mit den vorhandenen Buchstaben (${buchstaben.join('')})`)
  await p.locator('[data-abc-sprung="S"]').click()
  await p.waitForTimeout(900)
  const kopfS = await p.locator('[data-abc-kopf="S"]').boundingBox()
  const leisteBox = await p.locator('[data-abc-leiste]').boundingBox()
  pruefe(Boolean(kopfS && leisteBox && kopfS.y >= leisteBox.y + leisteBox.height - 4 && kopfS.y < 300), `Sprung zu „S": Überschrift oben unter der Leiste (${Math.round(kopfS?.y ?? -1)})`)
  pruefe((await p.locator('[data-abc-sprung="S"]').getAttribute('aria-current')) === 'true', 'Leiste zeigt den aktuellen Buchstaben')
  await p.screenshot({ path: join(out, '2e-alphabetisch-s.png') })
  await p.locator('[data-wortliste-suche]').fill('surprised')
  await p.waitForTimeout(300)
  const quellen = await p.locator('[data-abc-wort="surprised"] [data-abc-quelle]').evaluateAll((els) => els.map((e) => e.getAttribute('data-abc-quelle')))
  pruefe(quellen.includes('GL 1 · U1') && quellen.includes('GL 2 · U1') && (await p.locator('[data-abc-wort="surprised"]').count()) === 1, `Gleiches Wort einmal mit allen Fundstellen (${quellen})`)
  await p.locator('[data-wortliste-suche]').fill('attend')
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-abc-wort="to attend"]').count()) === 1, '„to attend" unter A (ohne „to ")')
  // Doppelte (10.10.2026): „a/one hundred" (GL 1, phrase und number) nur einmal
  await p.locator('[data-wortliste-suche]').fill('hundred')
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-abc-wort="a/one hundred"]').count()) === 1, '„a/one hundred" nur einmal')
  // Umschalter „My words | All words": rechts auch „the … the" (GL 3 Unit 2, noch nicht freigegeben) – unter T, blass
  await p.locator('[data-abc-umschalter] label', { hasText: 'All words' }).click()
  await p.locator('[data-wortliste-suche]').fill('desto')
  await p.locator('[data-abc-wort="the … the"]').waitFor({ timeout: 15000 }).catch(() => undefined)
  pruefe(
    (await p.locator('[data-abc-wort="the … the"][data-abc-nicht-dran]').count()) === 1 && (await p.locator('[data-abc-kopf="#"]').count()) === 0,
    '„All words": „the … the" unter T (nicht „#"), als noch nicht dran'
  )
  await p.locator('[data-abc-umschalter] label', { hasText: 'My words' }).click()
  await p.screenshot({ path: join(out, '2f-alphabetisch-suche.png') })
  await p.locator('[data-wortliste-suche]').fill('')
  // Register Vocabulary zeigt den Kurs direkt (08.10.2026): Karteikasten ohne eigenen Rückweg
  await p.locator('[data-lasche="vok"]').click()
  pruefe(await da(p.locator('[data-ordner-kurs-inhalt] [data-vokabel-kasten]')), 'Vocabulary zeigt den Karteikasten direkt im Ordner')
  pruefe((await p.locator('[data-ordner-kurs-inhalt] [data-zurueck-lernen]').count()) === 0, 'Eingebettet ohne eigenen Zurück-Knopf')
  // Blättern im Ordner (09.10.2026): Grammatikform → Training → Übung als nächste Seiten IM Ordner, mit Umblättern;
  // Zurück (Knopf, Browser) blättert zurück, Vorwärts wieder vor, Neuladen bleibt auf der Ebene
  const umblaettern = async () => {
    // „attached": Beim Start einer Übung im Vollbild (09.10.2026) liegt das Umblättern unsichtbar unter der Übung
    const sah = await p
      .locator('[data-ordner-umblaettern]')
      .first()
      .waitFor({ state: 'attached', timeout: 1500 })
      .then(
        () => true,
        () => false
      )
    await p.locator('[data-ordner-umblaettern]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
    return sah
  }
  const tiefe = async () => Number(await p.locator('[data-ordner-tiefe]').getAttribute('data-ordner-tiefe'))
  await p.locator('[data-lasche="gram"]').click()
  await p.locator('[data-ordner-kurs="grammatik"]').click()
  pruefe(await umblaettern(), 'Grammatikform öffnen: die Seite schlägt um')
  pruefe(await da(p.locator('[data-ordner="Englisch"] [data-ordner-unterseite="grammatik"] [data-grammatik-kasten]')), 'Grammatiktraining IM Ordner (nicht als eigene Seite)')
  pruefe(/\/s\/ordner\/Englisch\?r=gram&g=[a-f0-9]+/.test(p.url()) && (await tiefe()) === 1, `Adresse nennt die Ebene (${p.url()})`)
  pruefe((await p.locator('[data-zurueck-lernen]').count()) === 0 && (await p.locator('[data-ordner-zurueck]').isVisible()), 'Im Ordner: „Zurück“ des Ordners statt eigenem Rückweg')
  await p.screenshot({ path: join(out, '3b-ordner-grammatik.png') })
  // Übung als weitere Seite
  await p.locator('[data-grammatik-start]').click()
  pruefe((await umblaettern()) && (await da(p.locator('[data-ordner] [data-sitzung]'))) && (await tiefe()) === 2, 'Übung: noch eine Seite weiter (Ebene 2)')
  // Vollbild beim Lernen (09.10.2026): die Übung verdeckt den Ordner – „× Beenden" blättert zurück wie „Zurück"
  await p.locator((await p.locator('[data-fokus-beenden]').isVisible()) ? '[data-fokus-beenden]' : '[data-ordner-zurueck]').click()
  pruefe((await umblaettern()) && (await da(p.locator('[data-grammatik-kasten]'))) && (await tiefe()) === 1, 'Zurück-Knopf blättert zurück zum Training')
  // Zurück des Browsers: zur Grammatikliste; Vorwärts: wieder ins Training
  await p.goBack()
  pruefe((await umblaettern()) && (await da(p.locator('[data-ordner-kurs="grammatik"]'))) && (await tiefe()) === 0, 'Zurück des Browsers blättert zur Liste')
  pruefe(/\?r=gram$/.test(p.url()), `Adresse wieder auf dem Register (${p.url()})`)
  await p.goForward()
  pruefe((await umblaettern()) && (await da(p.locator('[data-grammatik-kasten]'))) && (await tiefe()) === 1, 'Vorwärts des Browsers blättert wieder vor')
  // Neuladen: bleibt im Training, darunter liegt die Liste
  await p.reload()
  pruefe((await da(p.locator('[data-ordner-unterseite="grammatik"] [data-grammatik-kasten]'))) && (await tiefe()) === 1, 'Neuladen: Training im Ordner bleibt offen')
  await p.locator('[data-ordner-zurueck]').click()
  pruefe((await da(p.locator('[data-ordner-kurs="grammatik"]'))) && (await tiefe()) === 0, 'Nach dem Neuladen: Zurück führt zur Liste')
  // Registerwechsel mit offener Seite: alles zu, dann das andere Register
  await p.locator('[data-ordner-kurs="grammatik"]').click()
  await umblaettern()
  await p.locator('[data-lasche="vok"]').click()
  pruefe((await da(p.locator('[data-ordner-register="vok"]'))) && (await tiefe()) === 0 && /\?r=vok$/.test(p.url()), `Registerwechsel schließt offene Seiten (${p.url()})`)
  // Ruhige Darstellung: kein Umblättern
  await p.emulateMedia({ reducedMotion: 'reduce' })
  await p.locator('[data-lasche="gram"]').click()
  await p.locator('[data-ordner-kurs="grammatik"]').click()
  await p.locator('[data-grammatik-kasten]').waitFor()
  pruefe((await p.locator('[data-ordner-umblaettern]').count()) === 0, 'Reduzierte Bewegung: ohne Umblättern')
  await p.emulateMedia({ reducedMotion: 'no-preference' })
  await p.locator('[data-ordner-zurueck]').click()
  pruefe(await da(p.locator('[data-ordner="Englisch"] [data-ordner-kurs="grammatik"]')), 'Zurück im Ordner')

  // ---------- Hell und Telefon
  const darst = async (felder) => {
    const alt = (await (await gc.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung ?? {}
    await gc.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { ...alt, ...felder } })
    await p.evaluate(() => localStorage.removeItem('schulapps-darstellung'))
  }
  await darst({ modus: 'hell' })
  await p.goto(`${A}/s/`)
  await p.locator('[data-regal-ordner]').first().waitFor()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '4-regal-hell.png') })
  await p.setViewportSize({ width: 390, height: 844 })
  await p.goto(`${A}/s/ordner/Englisch`)
  await p.locator('[data-ordner="Englisch"]').waitFor()
  await p.screenshot({ path: join(out, '5-ordner-telefon.png'), fullPage: true })
  const breit = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  pruefe(breit, 'Telefon: kein seitliches Scrollen im Ordner')
  await p.goto(`${A}/s/ordner/Englisch?r=wort`)
  await p.locator('[data-buch]').first().waitFor()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '5b-meine-buecher-telefon.png'), fullPage: true })
  pruefe(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Telefon: My Books ohne seitliches Scrollen')
  await p.locator('[data-buch="green-line-2"]').click()
  await p.locator('[data-buch-offen="green-line-2"]').waitFor()
  await p.waitForTimeout(1100)
  await p.screenshot({ path: join(out, '5c-buch-telefon.png') })
  pruefe(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Telefon: Buch ohne seitliches Scrollen')
  await p.goto(`${A}/s/ordner/Englisch?r=abc`)
  await p.locator('[data-abc-leiste]').waitFor()
  await p.locator('[data-abc-sprung="M"]').click()
  await p.waitForTimeout(900)
  await p.screenshot({ path: join(out, '5d-alphabetisch-telefon.png') })
  pruefe(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Telefon: Alphabetical list ohne seitliches Scrollen')
  pruefe(await p.locator('[data-abc-kopf="M"]').isVisible(), 'Telefon: Sprung zu „M"')

  // ---------- Rückfall: Liste
  await darst({ materialien: 'liste' })
  await p.goto(`${A}/s/`)
  pruefe(await da(p.locator('[data-gast-start]')), 'Wahl „Liste“: bisherige Seite „Meine Materialien“')
  await darst({ materialien: 'regal' })

  // ---------- Lege das Wort: Tippen und Schreiben
  const hw = (await post('freigeben', { titel: 'Handschrift', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'h1', term: 'oil', translation: 'Öl' }], gaeste: true })).id
  trainings.push(hw)
  await post(`${hw}/eintragen`, { namen: ['Ben S.'] })
  const t = await gc.newPage()
  // Zufall fest: nach der Lernkarte kommt „Lege das Wort“
  await t.addInitScript(() => {
    Math.random = () => 0.9
  })
  await t.setViewportSize({ width: 900, height: 900 })
  await t.goto(`${A}/s/v/${hw}`)
  await t.locator('[data-vokabel-start]').click()
  await t.locator('[data-sitzung]').waitFor()
  for (let i = 0; i < 6 && !(await t.locator('[data-buchstabe]').count()); i++) {
    await t.waitForTimeout(300)
    if (await t.locator('[data-lernkarte]').isVisible()) {
      await t.locator('[data-lernkarte]').click()
      // „Nicht gewusst": Das Wort kommt in dieser Runde in anderer Form wieder
      await t.locator('[data-karte-nicht]').click()
    }
  }
  pruefe(await da(t.locator('[data-buchstabe]').first(), 5000), '„Lege das Wort“ erscheint')
  // Tippen: getippte Buchstaben verbrauchen Plättchen, falsche werden abgewiesen
  await t.locator('[data-lege-art]').getByText('Tippen').click()
  await t.locator('[data-lege-tippen]').fill('ox')
  pruefe((await t.locator('[data-lege-tippen]').inputValue()) === '', 'Tippen: „x“ ist kein Plättchen – abgewiesen')
  await t.locator('[data-lege-tippen]').fill('oi')
  pruefe((await t.locator('[data-buchstabe]:disabled').count()) === 2, 'Tippen: zwei Plättchen verbraucht')
  await t.locator('[data-lege-tippen]').fill('')
  // Schreiben: o, i, l mit der Maus zeichnen
  await t.locator('[data-lege-art]').getByText('Schreiben').click()
  const c = await t.locator('[data-lege-schreiben]').boundingBox()
  const strich = async (punkte) => {
    await t.mouse.move(c.x + punkte[0][0], c.y + punkte[0][1])
    await t.mouse.down()
    for (const [x, y] of punkte.slice(1)) await t.mouse.move(c.x + x, c.y + y)
    await t.mouse.up()
  }
  await strich(Array.from({ length: 33 }, (_, k) => [120 + 32 * Math.cos((k / 32) * 2 * Math.PI), 105 + 38 * Math.sin((k / 32) * 2 * Math.PI)]))
  await t.waitForTimeout(1100)
  await strich([
    [120, 80],
    [120, 110],
    [120, 150]
  ])
  await strich([
    [120, 52],
    [121, 53]
  ])
  await t.waitForTimeout(1100)
  await strich([
    [120, 25],
    [120, 90],
    [120, 160]
  ])
  await t.waitForTimeout(1100)
  const gelegt = (await t.locator('[data-gelegt]').innerText()).replace(/\s/g, '')
  await t.screenshot({ path: join(out, '6-handschrift.png') })
  pruefe(gelegt === 'oil', `Handschrift erkannt: „${gelegt}“`)
  await t.locator('[data-pruefen]').click()
  pruefe(await da(t.locator('[data-urteil]'), 5000), 'Geprüft')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of trainings) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Trainings, Gäste und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
