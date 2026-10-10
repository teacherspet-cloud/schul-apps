// Vokabeln je Sprache (10.10.2026, Entscheidung der Lehrkraft „Option A") – ersetzt die Seite „Mein Vokabelweg":
//  - Fachordner › Vocabulary: aktueller Band zuerst („Green Line 6 · Klasse 10"), Units als Stationen mit Abschnittspunkten,
//    „x von y Abschnitten kennengelernt", EIN Knopf „Heute üben · N Wörter" (eine Runde über alle Kurse der Sprache)
//  - „Frühere Jahre": Bände früherer Schuljahre mit Klasse, Schuljahr, Medaille, sicher/kennengelernt; ruhige Angebote
//  - Tagesrunde: 2–3 wackelige Wörter früherer Bände mit Herkunft („aus Green Line 5 · Unit 1"); Pause vor einem Test
//  - Meine Bücher: „Dieses Jahr" / „Frühere Jahre", Units und Abschnitte zugeklappt mit drei Kreisen (neu/im Aufbau/sicher)
//  - Alphabetisch: „the … the" nicht unter „#", „a/one hundred" einmal, Umschalter „My words | All words" (gemerkt)
//  - Startseite: gleiche Zahl wie im Ordner und im Tipp; „Als Nächstes" am Telefon nie abgeschnitten
//  - Befund „Mustermann": Green Line 6 (dieses Jahr) heißt so – nicht „More words" –, Abschnitte aufsteigend
//  - Freigabe von über 400 Wörtern auf einmal: alle kommen an (vorher still abgeschnitten)
//  - alte Links /s/vw/… führen in den Ordner
// Drei Lernstände: Max (viel geübt), Tom (Lücken, wackelig), Ada (kaum geübt) – je Telefon und iPad mit Bildern.
// Vorher: Server lokal (KI-Attrappe, SCHULAPPS_KALENDER_TESTUHR=1 für die Testzeit). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-vokabelweg.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-vokabelweg')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `10w${Date.now() % 1000}`
const TAG = 86_400_000
const LETZTES_JAHR = Date.UTC(2025, 10, 3)
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const buch = (id) => JSON.parse(readFileSync(`resources/lehrwerke/${id}.json`, 'utf8'))
const gl5 = buch('green-line-5')
const gl6 = buch('green-line-6')
const abschnitt = (b, unit, section) => b.units.find((u) => u.name === unit).sections.find((s) => s.name === section).entries
// Green Line 5: „Across cultures 1" und ganz Unit 1 – über 400 Wörter in EINER Freigabe
const gl5Units = gl5.units.filter((u) => u.name === 'Across cultures 1' || u.name === 'Unit 1').map((u) => ({ unit: u.name, abschnitte: u.sections.filter((s) => s.entries.length).map((s) => s.name) }))
const gl5Woerter = gl5Units.flatMap((u) => u.abschnitte.flatMap((a) => abschnitt(gl5, u.unit, a)))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let kurs = ''
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea T' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Max Stark\nTom Luecke\nAda Wenig' } })).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  const person = (name) => liste.angelegt.find((a) => a.name === name)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })

  // ---------- Letztes Schuljahr: Green Line 5 (über 400 Wörter auf einmal)
  const teile5 = gl5Units.flatMap((u) => u.abschnitte.map((a) => ({ titel: `${u.unit} · ${a}`, anzahl: abschnitt(gl5, u.unit, a).length })))
  const frei = await post('/server/vokabeln/freigeben', {
    lerngruppeId: g.id,
    titel: 'Green Line 5 - Across cultures 1 - Unit 1',
    sprache: 'en',
    fach: 'Englisch',
    woerter: gl5Woerter.map((e, i) => ({ id: `a${i}`, term: e.term, translation: e.translation })),
    teile: teile5,
    quelle: { lehrwerk: 'green-line-5', units: gl5Units, unit: 'Unit 1', abschnitte: gl5Units.flatMap((u) => u.abschnitte) }
  })
  kurs = frei.id
  pruefe(Boolean(kurs) && gl5Woerter.length > 400, `Green Line 5 freigegeben (${gl5Woerter.length} Wörter in einer Freigabe)`)
  const zeit = await post('/server/sprachstand/testzeit', { kurs, teile: teile5.map((_, i) => i), zeit: LETZTES_JAHR })
  pruefe(zeit.ok === true, 'Testzeit: Green Line 5 ins letzte Schuljahr gelegt')

  // ---------- Dieses Schuljahr: Green Line 6 – zuerst Station 1, dann Introduction (nicht in Buchreihenfolge)
  for (const s of ['Station 1', 'Introduction']) {
    const w = abschnitt(gl6, 'Unit 1', s)
    await post(`/server/vokabeln/${kurs}/woerter`, {
      titel: s,
      woerter: w.map((e, i) => ({ id: `n${s[0]}${i}`, term: e.term, translation: e.translation })),
      teile: [{ titel: s, anzahl: w.length }],
      quelle: { lehrwerk: 'green-line-6', unit: 'Unit 1', abschnitte: [s] }
    })
  }

  // ---------- Lernende anmelden (erstes Anmelden: eigenes Passwort)
  const konto = async (name) => {
    const p = person(name)
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 1300 } })
    await anmelden(ctx, p.benutzer, p.passwort)
    await ctx.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
    return ctx
  }
  const max = await konto('Max Stark')
  const tom = await konto('Tom Luecke')
  const ada = await konto('Ada Wenig')
  const kasten = async (ctx, id) => (await ctx.request.get(`${A}/s/api/vokabeln/liste?id=${encodeURIComponent(id)}`, { headers: KOPF })).json()
  const antwort = (ctx, id, data) => ctx.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id, ...data } })
  const alleWoerter = (await kasten(ada, kurs)).woerter
  const alt5 = alleWoerter.filter((v) => v.id.startsWith('a'))
  pruefe(alt5.length === gl5Woerter.length, `Kein stilles Abschneiden: alle ${alt5.length} von ${gl5Woerter.length} Wörtern der Freigabe im Kurs`)

  // Max: Green Line 5 zweimal frei gewusst im Abstand von über einer Woche (sicher); Tom: 60 Wörter mit Fehlern (wackelig)
  // „frei" zählt für „sicher" erst ab Fach 2: Karte (Fach 1), frei (Fach 2), frei (erster Zeitpunkt) … eine Woche später frei
  for (const v of alt5) {
    await antwort(max, kurs, { wortId: v.id, uebung: 'karte', gewusst: true })
    await antwort(max, kurs, { wortId: v.id, uebung: 'frei', antwort: v.term })
    await antwort(max, kurs, { wortId: v.id, uebung: 'frei', antwort: v.term })
  }
  for (const v of alt5.slice(0, 60)) {
    await antwort(tom, kurs, { wortId: v.id, uebung: 'karte', gewusst: true })
    await antwort(tom, kurs, { wortId: v.id, uebung: 'frei', antwort: 'falsch' })
  }
  await post('/server/sprachstand/testzeit', { kurs, staendeTage: 8 })
  for (const v of alt5) await antwort(max, kurs, { wortId: v.id, uebung: 'frei', antwort: v.term })
  // Ein paar Tage später: Toms wackelige Wörter sind fällig
  await post('/server/sprachstand/testzeit', { kurs, staendeTage: 4 })

  // ---------- Sprachstand (Daten)
  const stand = async (ctx) => (await (await ctx.request.get(`${A}/s/api/sprachstand?fach=Englisch`, { headers: KOPF })).json()).sprachen[0]
  const sMax = await stand(max)
  pruefe(sMax?.aktuell?.name === 'Green Line 6' && sMax.aktuell.klasse === 10, `Aktueller Band „Green Line 6 · Klasse 10" (${sMax?.aktuell?.name} · ${sMax?.aktuell?.klasse})`)
  pruefe(JSON.stringify(sMax.aktuell.units.map((u) => u.abschnitte.map((a) => a.name))) === '[["Introduction","Station 1"]]', 'Units mit Abschnitten aufsteigend wie im Buch')
  const f5 = sMax.frueher.find((b) => b.id === 'green-line-5')
  pruefe(f5?.schuljahr === 2025 && f5.klasse === 9 && f5.zahlen.sicher >= alt5.length - 5, `Frühere Jahre: Green Line 5 · Klasse 9 · 2025/26, ${f5?.zahlen?.sicher} sicher`)
  pruefe(sMax.frueher.map((b) => b.id).join() === 'green-line-1,green-line-2,green-line-3,green-line-4,green-line-5', `Frühere Bände 1–5 (${sMax.frueher.map((b) => b.id)})`)
  const sTom = await stand(tom)
  pruefe(sTom.heute.alt >= 2 && sTom.heute.alt <= 3, `Tom: ${sTom.heute.alt} wackelige Wörter aus Green Line 5 in der heutigen Runde`)
  const sAda = await stand(ada)
  pruefe(sAda.heute.anzahl === 10 && sAda.heute.alt === 0, `Ada: Runde = Tagesziel (${sAda.heute.anzahl}), keine Pflicht aus Green Line 5`)

  // ---------- Browser: drei Lernstände, Telefon und iPad
  const geraete = [
    ['tel', { width: 390, height: 844 }],
    ['ipad', { width: 820, height: 1180 }]
  ]
  for (const [name, ctx] of [
    ['max', max],
    ['tom', tom],
    ['ada', ada]
  ])
    for (const [ger, vp] of geraete) {
      const p = await ctx.newPage()
      await p.setViewportSize(vp)
      p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
      const ziel = join(out, `${name}-${ger}`)
      mkdirSync(ziel, { recursive: true })
      await p.goto(`${A}/s/`)
      await p.locator('[data-startseite]').waitFor()
      await p.locator('[data-start-vokabeln]').waitFor({ timeout: 8000 }).catch(() => undefined)
      await p.keyboard.press('Escape').catch(() => undefined)
      await p.waitForTimeout(600)
      await p.screenshot({ path: join(ziel, '01-start.png'), fullPage: true })
      await p.goto(`${A}/s/ordner/Englisch?r=vok`)
      await p.locator('[data-aktueller-band]').waitFor()
      await p.locator('[data-vokabel-kasten]').waitFor()
      await p.waitForTimeout(600)
      await p.screenshot({ path: join(ziel, '03-ordner-vocabulary.png'), fullPage: true })
      await p.goto(`${A}/s/ordner/Englisch?r=wort`)
      await p.locator('[data-buecherbord]').waitFor()
      await p.waitForTimeout(800)
      await p.screenshot({ path: join(ziel, '10-meine-buecher.png'), fullPage: true })
      await p.locator('[data-buch="green-line-6"]').click()
      await p.locator('[data-buch-offen="green-line-6"]').waitFor()
      await p.waitForTimeout(1100)
      await p.screenshot({ path: join(ziel, '11-buch-gl6.png'), fullPage: true })
      await p.goto(`${A}/s/ordner/Englisch?r=abc`)
      await p.locator('[data-abc-leiste]').waitFor()
      await p.waitForTimeout(500)
      await p.screenshot({ path: join(ziel, '12-alphabetisch.png') })
      pruefe(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}/${ger}: kein seitliches Scrollen`)
      await p.close()
    }

  // Runde beenden: im Vollbild über dessen Knopf, sonst „Beenden"
  const beenden = async (pg) => {
    const fokus = pg.locator('[data-fokus-beenden]')
    await pg.locator(`${(await fokus.isVisible()) ? '[data-fokus-beenden]' : '[data-eigenes-beenden]'}`).click()
    await pg.locator('[data-sitzung]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined)
  }
  // ---------- Ordner › Vocabulary (Tom, iPad)
  const p = await tom.newPage()
  await p.setViewportSize({ width: 820, height: 1180 })
  await p.goto(`${A}/s/ordner/Englisch?r=vok`)
  const karte = p.locator('[data-aktueller-band="green-line-6"]')
  pruefe(await da(karte), 'Vocabulary: Karte des aktuellen Bandes')
  pruefe((await p.locator('[data-band-titel]').innerText()).includes('Green Line 6 · Klasse 10'), `Titel „Green Line 6 · Klasse 10" (${await p.locator('[data-band-titel]').innerText()})`)
  pruefe((await p.locator('[data-abschnitte-kennen]').getAttribute('data-abschnitte-kennen')) === '0/2', 'Fortschritt „0 von 2 Abschnitten kennengelernt"')
  pruefe((await p.locator('[data-abschnitt-punkte="2"]').count()) === 1 && (await p.locator('[data-weitere-units]').count()) === 1, 'Abschnittspunkte der aktuellen Unit, „weitere Units folgen" statt Gesperrtem')
  pruefe((await p.locator('[data-frueherer-band="green-line-5"]').count()) === 1, '„Frühere Jahre" mit Green Line 5')
  pruefe((await p.getByText('So funktioniert der Kasten').count()) === 0, 'Erklärtext „So funktioniert der Kasten" entfernt')
  pruefe((await p.getByText('Vokabelweg').count()) === 0, 'Kein „Vokabelweg" mehr')
  const nOrdner = Number(await p.locator('[data-heute-ueben]').first().getAttribute('data-heute-ueben'))
  pruefe(nOrdner === sTom.heute.anzahl, `Knopf „Heute üben · ${nOrdner} Wörter" = Server (${sTom.heute.anzahl})`)
  await p.locator('[data-heute-ueben]').first().click()
  pruefe(await da(p.locator('[data-sitzung]')), 'Heute üben startet die Runde gleich')
  pruefe(await da(p.locator('[data-herkunft="aus Green Line 5 · Unit 1"], [data-herkunft="aus Green Line 5 · Across cultures 1"]'), 5000), 'Wort aus einem früheren Band trägt seine Herkunft')
  await p.screenshot({ path: join(out, 'tom-runde-herkunft.png') })
  await beenden(p)
  // Ruhiges Angebot im früheren Band
  await p.goto(`${A}/s/ordner/Englisch?r=vok`)
  await p.locator('[data-frueherer-band="green-line-5"]').click()
  pruefe(await da(p.locator('[data-band-seite="green-line-5"]')), 'Früherer Band öffnet sich im Ordner')
  pruefe((await p.locator('[data-band-wiederholen]').count()) === 1 && (await p.locator('[data-band-neu]').count()) === 1, 'Angebote „Wiederholen?" und „Noch nicht gelernte Wörter lernen"')
  pruefe((await p.locator('[data-band-seite] .og-zahl, [data-band-seite] [color="red"]').count()) === 0, 'Keine roten Zahlen im früheren Band')
  await p.screenshot({ path: join(out, 'tom-frueherer-band.png'), fullPage: true })
  await p.locator('[data-band-neu]').click()
  pruefe(await da(p.locator('[data-sitzung]')), 'Noch nicht gelernte Wörter: Runde startet (freiwillig)')
  await beenden(p)

  // Test in zwei Tagen: nur Teststoff, kein Anteil früherer Bände
  await post(`/server/vokabeln/${kurs}/termin`, { testTermin: Date.now() + 2 * TAG })
  const pause = await stand(tom)
  pruefe(pause.heute.pause === true && pause.heute.alt === 0, 'Drei Tage vor dem Test: Anteil früherer Bände ruht')
  await p.goto(`${A}/s/ordner/Englisch?r=vok`)
  pruefe(await da(p.locator('[data-test-pause]')), 'Hinweis „heute nur der Teststoff"')
  await post(`/server/vokabeln/${kurs}/termin`, { testTermin: null })

  // ---------- Meine Bücher (Max)
  const m = await max.newPage()
  await m.setViewportSize({ width: 820, height: 1180 })
  await m.goto(`${A}/s/ordner/Englisch?r=wort`)
  await m.locator('[data-buecherbord]').waitFor()
  const jetzt = await m.locator('[data-bord-jahr="jetzt"] [data-buch]').evaluateAll((els) => els.map((e) => e.getAttribute('data-buch')))
  const frueher = await m.locator('[data-bord-jahr="frueher"] [data-buch]').evaluateAll((els) => els.map((e) => e.getAttribute('data-buch')))
  pruefe(JSON.stringify(jetzt) === '["green-line-6"]', `„This year": Green Line 6 – kein „More words" (${jetzt})`)
  pruefe(frueher.join() === 'green-line-1,green-line-2,green-line-3,green-line-4,green-line-5', `„Earlier years": Green Line 1–5 (${frueher})`)
  pruefe((await m.locator('[data-buch="green-line-5"]').innerText()).includes('Year 9 · 2025/26'), 'Cover: „Year 9 · 2025/26"')
  pruefe((await m.locator('[data-buch="green-line-5"] [data-buch-prozent]').count()) === 1, 'Cover früherer Jahre mit % sicher und kennengelernt')
  await m.locator('[data-buch="green-line-6"]').click()
  await m.locator('[data-buch-offen="green-line-6"]').waitFor()
  await m.waitForTimeout(1100)
  const units = m.locator('[data-buch-unit]')
  pruefe((await units.count()) === 1 && (await units.first().getAttribute('data-offen')) === 'false', 'Units zugeklappt')
  pruefe((await m.locator('[data-buch-unit] [data-stand-kreise]').count()) === 1, 'Unit mit drei Kreisen (neu / learning / known)')
  await m.locator('[data-buch-unit] .mb-unit-kopf').click()
  const gruppen = await m.locator('[data-wortliste-gruppe]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-wortliste-gruppe')}:${e.getAttribute('data-offen')}`))
  pruefe(JSON.stringify(gruppen) === '["Unit 1 · Introduction:false","Unit 1 · Station 1:false"]', `Abschnitte in der Unit, aufsteigend, zugeklappt (${gruppen})`)
  pruefe((await m.locator('[data-wortliste-gruppe] [data-stand-kreise]').count()) === 2, 'Abschnitte mit drei Kreisen')
  await m.locator('[data-wortliste-gruppe="Unit 1 · Introduction"] .mb-abschnitt-kopf').click()
  pruefe((await m.locator('[data-wortliste-wort] [data-wort-status]').count()) > 3, 'Wörter mit ihren Punkten')
  await m.screenshot({ path: join(out, 'max-buch-offen.png'), fullPage: true })
  await m.reload()
  await m.locator('[data-buecherbord], [data-buch-offen]').first().waitFor()
  if (await m.locator('[data-buch="green-line-6"]').isVisible()) await m.locator('[data-buch="green-line-6"]').click()
  await m.locator('[data-buch-unit]').first().waitFor()
  pruefe((await m.locator('[data-buch-unit]').first().getAttribute('data-offen')) === 'true', 'Auf/Zu bleibt in derselben Sitzung')

  // ---------- Alphabetisch (Max): „the … the" unter T, „a/one hundred" einmal, Umschalter
  await m.goto(`${A}/s/ordner/Englisch?r=abc`)
  await m.locator('[data-abc-leiste]').waitFor()
  pruefe((await m.locator('[data-abc-umschalter="meine"]').count()) === 1, 'Umschalter „My words | All words" (links gewählt)')
  await m.locator('[data-wortliste-suche]').fill('desto')
  await m.waitForTimeout(300)
  pruefe((await m.locator('[data-abc-wort="the … the"]').count()) === 1 && (await m.locator('[data-abc-kopf="T"]').count()) === 1 && (await m.locator('[data-abc-kopf="#"]').count()) === 0, '„the … the" steht unter T, nicht unter „#"')
  await m.locator('[data-wortliste-suche]').fill('hundred')
  await m.waitForTimeout(300)
  pruefe((await m.locator('[data-abc-wort="a/one hundred"]').count()) === 1, '„a/one hundred" nur einmal (phrase und number zusammengeführt)')
  await m.locator('[data-wortliste-suche]').fill('')
  const meine = Number(await m.locator('[data-wortliste-anzahl]').getAttribute('data-wortliste-anzahl'))
  await m.locator('[data-abc-umschalter] label', { hasText: 'All words' }).click()
  await m.locator('[data-abc-umschalter="alle"]').waitFor()
  await m.waitForFunction((n) => Number(document.querySelector('[data-wortliste-anzahl]')?.getAttribute('data-wortliste-anzahl')) > n, meine, { timeout: 15000 }).catch(() => undefined)
  const alle = Number(await m.locator('[data-wortliste-anzahl]').getAttribute('data-wortliste-anzahl'))
  await m.locator('[data-wortliste-suche]').fill('')
  await m.locator('[data-abc-sprung="Z"]').click().catch(() => undefined)
  await m.waitForTimeout(600)
  pruefe(alle > meine && (await m.locator('[data-abc-nicht-dran]').count()) > 0, `„All words": mehr Wörter (${meine} → ${alle}), noch nicht dran blass`)
  await m.screenshot({ path: join(out, 'max-alle-woerter.png') })
  await m.reload()
  await m.locator('[data-abc-umschalter]').waitFor()
  pruefe((await m.locator('[data-abc-umschalter="alle"]').count()) === 1, 'Wahl bleibt auf dem Gerät')
  await m.locator('[data-abc-umschalter] label', { hasText: 'My words' }).click()

  // ---------- Startseite (Ada, Telefon): gleiche Zahl überall, „Als Nächstes" nicht abgeschnitten
  const s = await ada.newPage()
  await s.setViewportSize({ width: 390, height: 844 })
  await s.goto(`${A}/s/`)
  await s.locator('[data-start-vokabeln]').waitFor()
  const nStart = Number(await s.locator('[data-start-vokabeln] [data-heute-ueben]').getAttribute('data-heute-ueben'))
  await s.locator('[data-naechstes]').waitFor()
  const naechstes = await s.locator('[data-naechstes]').innerText()
  pruefe(nStart === sAda.heute.anzahl && naechstes.includes(`${nStart} Wörter für heute`), `Startseite: „Heute üben · ${nStart}" und „${nStart} Wörter für heute" (Ordner: ${sAda.heute.anzahl})`)
  const tipp = await s.locator('[data-tipp], [data-lerntipp]').first().innerText().catch(() => '')
  const tippZahl = /(\d+) Vokabeln (sind|stehen) heute/.exec(tipp)?.[1]
  pruefe(!tippZahl || Number(tippZahl) === nStart, `Tipp nennt dieselbe Zahl (${tippZahl ?? 'kein Zahl-Tipp'})`)
  const knopf = await s.locator('[data-naechstes-knopf]').evaluate((b) => {
    const l = b.querySelector('.mantine-Button-label') ?? b
    const r = b.getBoundingClientRect()
    return { text: l.textContent, ganz: l.scrollWidth <= l.clientWidth + 1, drin: r.right <= window.innerWidth + 1 && r.left >= -1 }
  })
  pruefe(knopf.text === 'Vokabeln üben' && knopf.ganz && knopf.drin, `Telefon: „Als Nächstes"-Knopf ganz lesbar (${JSON.stringify(knopf)})`)
  await s.screenshot({ path: join(out, 'ada-start-telefon.png'), fullPage: true })
  // EIN Knopf für dieselbe Runde (10.10.2026): „Als Nächstes" hat ihn, Begrüßung und Sprachkarte nicht
  pruefe((await s.locator('[data-begruessung-knopf]').count()) === 0, 'Begrüßung ohne eigenen Runden-Knopf')
  pruefe((await s.locator('[data-start-vokabeln] [data-heute-ohne-knopf]').count()) === 1 && (await s.locator('[data-start-vokabeln] button, [data-start-vokabeln] a.mantine-Button-root').count()) === 0, 'Sprachkarte zeigt nur die Zahl, keinen zweiten Knopf')
  await s.locator('[data-naechstes-knopf]').click()
  pruefe(await da(s.locator('[data-sitzung]')), '„Als Nächstes" öffnet den Ordner und startet die Runde')
  // Alte Links
  await s.goto(`${A}/s/vw/${encodeURIComponent('green-line||en')}`)
  await s.waitForURL(/\/s\/ordner\/Englisch\?r=vok/, { timeout: 10000 }).catch(() => undefined)
  pruefe(/\/s\/ordner\/Englisch\?r=vok/.test(s.url()), `Alter Link /s/vw/… führt in den Ordner (${s.url()})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  if (kurs && lk) await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
