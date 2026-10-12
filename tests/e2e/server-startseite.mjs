// Startseite und Leiste der Lehrkraft (03.10.2026): Schnellzugriff, Gruppen in der Leiste, Apps
// (10.10.2026: Smartphone mit Anzahl je Karte, Kursen ohne Testtermin und Kasten „Meine Klassen“; Fachrelevanz: Onlinetest
// für Geschichte, Karte „Termine" ohne Vokabeln, Admin sieht alle Apps auch mit eigenen Fächern)
// „Laufende Reihen" und „Freigegebene Blätter". Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-startseite.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus, kartenAuf } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-startseite')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6s${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const TEST = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
    themenbereich: 'Englisch › Green Line 2 › Unit 3',
    showName: true,
    showDate: true,
    showClass: false,
    showSchool: false,
    schoolName: '',
    showVariant: true,
    showPoints: true,
    showGrade: true,
    subtitle: ''
  },
  settings: {
    targetLanguage: 'en',
    level: 'A1',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 6,
    vocabCount: 1,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  },
  vocab: [],
  variants: [
    {
      id: 'A',
      label: 'A',
      blocks: [
        {
          id: 'g',
          kind: 'gap',
          taskType: 'gapSentences',
          title: 'Gaps',
          instruction: 'Fill in.',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: false,
          extraBankWords: [],
          items: [{ id: 'g1', sentences: [{ before: 'I go to', after: '.' }], answer: 'school' }]
        }
      ]
    }
  ],
  fontSize: 12,
  createdAt: new Date().toISOString()
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const api = (ctx) => async (channel, ...args) => {
  const r = await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()
  if (!r.ok) throw new Error(`${channel}: ${r.error}`)
  return r.value
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nTim Test' } })
  ).json()
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  const lk = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  // Daten: eine Reihe (zugewiesen), ein geplanter Onlinetest, Vokabeln mit Testtermin
  const reihe = {
    id: '',
    titel: 'My town',
    fachId: 'englisch',
    fachLabel: 'Englisch',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: 6,
    oberthema: 'Places in town',
    lernziele: [],
    schritte: [
      {
        id: 'a',
        titel: 'Places',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        inhalt: { art: 'lernkarten', karten: [{ vorne: 'park', hinten: 'Park' }] }
      },
      {
        id: 'b',
        titel: 'Besprechung',
        lernziele: [],
        rolle: 'pflicht',
        halt: { art: 'freigabe' },
        erfolg: { art: 'abgabe' },
        inhalt: { art: 'reflexion', frage: 'Was war schwer?' },
        // Stunde 2 – mit den Stundenterminen bekommt der Haltepunkt ein Datum („Demnächst", 10.10.2026)
        stunde: 1
      }
    ],
    stunden: ['einzel', 'einzel'],
    stundenTermine: { beginn: new Date().toISOString().slice(0, 10), tage: [1, 2, 3, 4, 5] }
  }
  const r = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe } })).json()
  await lk.request.post(`${A}/server/reihen/${r.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: gruppe.id } })
  await lk.request.post(`${A}/server/onlinetest/erstellen`, {
    headers: KOPF,
    data: { titel: `${KLASSE} – Unit 3 Test`, test: TEST, lerngruppeId: gruppe.id, zeitMin: 10 }
  })
  const kursMitTermin = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: {
          lerngruppeId: gruppe.id,
          titel: 'Unit 3 words',
          sprache: 'en',
          fach: 'Englisch',
          woerter: [
            { id: 'w1', term: 'park', translation: 'Park' },
            { id: 'w2', term: 'hello', translation: 'hallo' }
          ],
          // Weitester Abschnitt (10.10.2026): „Hello" kommt zuletzt, Unit 2 ist im Buch weiter
          teile: [
            { titel: 'Green Line 1 - Unit 2 - Station 2', anzahl: 1 },
            { titel: 'Green Line 1 - Hello - Check-in', anzahl: 1 }
          ],
          testTermin: Date.now() + 3 * 864e5
        }
      })
    ).json()
  ).id
  // Ein Material für die Suche auf der Startseite (Suchergebnis direkt unter dem Suchfeld, 10.10.2026)
  await api(lk)('tests:save', {
    id: `such-${KLASSE}`,
    name: `Suchprobe ${KLASSE}`,
    stats: { vocabCount: 0, includedCount: 0, hasTest: true, variantCount: 1, totalPoints: 0, language: 'en', subjectLabel: 'Englisch', grade: 6 },
    payload: TEST
  })
  // Zweites Fach der Klasse mit einem Kurs OHNE Testtermin (10.10.2026: fehlte auf der Startseite)
  const gruppeFr = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Französisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  const kursOhneTermin = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: {
          lerngruppeId: gruppeFr.id,
          titel: 'Découvertes 2 - Unité 1 - Atelier A',
          sprache: 'fr',
          fach: 'Französisch',
          woerter: [{ id: 'f1', term: 'la ville', translation: 'die Stadt' }]
        }
      })
    ).json()
  ).id

  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  // Leiste (10.10.2026): zu Beginn jeder Sitzung sind alle Gruppen zugeklappt
  await da(p.locator('.app-leiste [data-leiste-gruppe-kopf]').first())
  pruefe(
    (await p.locator('.app-leiste [data-leiste-gruppe-kopf]').count()) > 0 &&
      (await p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="true"]').count()) === 0,
    'Leiste: zu Beginn der Sitzung alle Gruppen zugeklappt'
  )
  await expertenmodus(p)
  pruefe(await da(p.locator('[data-schnellzugriff-raster]')), 'Startseite: Schnellzugriff')
  // Kästen (12.10.2026): zunächst zugeklappt, Kurzfassung im Kopf; Auf/Zu dauerhaft gemerkt
  pruefe(
    (await p.locator('[data-klappkarte^="start-"]').count()) >= 4 && (await p.locator('[data-klappkarte^="start-"][data-offen="true"]').count()) === 0,
    'Startseite: alle Kästen zunächst zugeklappt'
  )
  pruefe(await da(p.locator('[data-start-kurz="termine"]'), 8000), 'Zugeklappt: Kurzfassung im Kopf von „Termine"')
  pruefe(/^\d+ Termine? · \d+ Kurse?$/.test(((await p.locator('[data-start-kurz="termine"]').innerText().catch(() => '')) ?? '').trim()), 'Kurzfassung „n Termine · n Kurse"')
  await kartenAuf(p)
  pruefe(await da(p.locator('[data-start-anzahl="reihen"]')), 'PC: Anzahl-Wahl auch am PC (Vorgabe 5)')
  pruefe(await da(p.locator('[data-schnellzugriff="reihen"] [data-laufende-reihe]')), 'Laufende Reihe auf der Startseite')
  pruefe(await p.locator('[data-schnellzugriff="tests"]').getByText('geplant').isVisible(), 'Geplanter Onlinetest auf der Startseite')
  // Termine & Vokabeltraining (10.10.2026, zweite Fassung): EINE Zeile je Kurs mit EINEM Abzeichen, darunter „Demnächst"
  const termineP = p.locator('[data-schnellzugriff="termine"]')
  const zeileEn = termineP.locator(`[data-start-kurs="${kursMitTermin}"]`)
  pruefe(await da(zeileEn), 'Kurszeile des Kurses mit Testtermin')
  pruefe((await zeileEn.innerText()).includes(`${KLASSE} · Englisch`), `Kurszeile „${KLASSE} · Englisch"`)
  // Weitester Abschnitt in Buchreihenfolge mit Fortschritt aus dem Lehrwerk (10.10.2026); Platzhalter-Lehrwerk ohne Fortschritt
  const abschnittEn = (await zeileEn.innerText()).replace(/\s+/g, ' ')
  pruefe(abschnittEn.includes('Green Line 1 · Unit 2 (Abschnitt 3 von 7)'), `Kurszeile: weitester Abschnitt „Green Line 1 · Unit 2 (Abschnitt 3 von 7)" (${abschnittEn})`)
  const abschnittFr = (await termineP.locator(`[data-start-kurs="${kursOhneTermin}"]`).innerText()).replace(/\s+/g, ' ')
  pruefe(abschnittFr.includes('Découvertes 2 · Unité 1') && !abschnittFr.includes('Abschnitt'), `Kurszeile Platzhalter-Lehrwerk ohne Fortschritt (${abschnittFr})`)
  pruefe(/\d+ %/.test(await zeileEn.innerText()), 'Kurszeile mit „n %" (sicher)')
  const badgeEn = (await zeileEn.locator('[data-start-badge]').allInnerTexts()).map((x) => x.trim())
  pruefe(badgeEn.length === 1 && /^Test (heute|morgen|Mo|Di|Mi|Do|Fr|Sa|So)$/.test(badgeEn[0]), `Genau ein Abzeichen „Test …" (${badgeEn.join(' | ')})`)
  const zeilenAnzahl = await termineP.locator('[data-start-kurs]').count()
  const abzeichenAnzahl = await termineP.locator('[data-start-kurs] [data-start-badge]').count()
  pruefe(zeilenAnzahl >= 2 && abzeichenAnzahl === zeilenAnzahl, `Jede Kurszeile genau ein Abzeichen (${zeilenAnzahl} Zeilen, ${abzeichenAnzahl} Abzeichen)`)
  const termineText = await termineP.innerText()
  pruefe(!/heute geübt/.test(termineText) && (await termineP.locator('[data-start-hinweis], [data-start-grammatik]').count()) === 0, 'Keine Zeile „heute geübt", keine Hinweis-/Grammatikzeilen')
  const bald = (await termineP.locator('[data-start-demnaechst]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
  pruefe(bald.some((x) => new RegExp(`^(Mo|Di|Mi|Do|Fr|Sa|So) \\d\\d\\.\\d\\d\\. Vokabeltest ${KLASSE} – Unit 2`).test(x)), `Demnächst: Vokabeltest mit Datum und weitester Unit (${bald.join(' | ')})`)
  pruefe(bald.some((x) => new RegExp(`^(Mo|Di|Mi|Do|Fr) \\d\\d\\.\\d\\d\\. Haltepunkt „Besprechung" \\(${KLASSE}\\)`).test(x)), 'Demnächst: Haltepunkt mit Datum und Klasse')
  const tage = bald.map((x) => x.match(/^\S+ (\d\d)\.(\d\d)\./)).filter(Boolean).map((m) => Number(m[2]) * 100 + Number(m[1]))
  pruefe(tage.every((t, i) => i === 0 || t >= tage[i - 1]), 'Demnächst zeitlich geordnet')
  pruefe((await p.getByText('Programme', { exact: true }).count()) === 0, 'Keine Programmliste mehr auf der Startseite')
  // Rahmen (10.10.2026): Kopfleiste über die volle Breite, mit der Seitenleiste EIN Stück; Datum und Info-Chips rechts
  const kopfP = p.locator('[data-rahmen-kopf="gross"]')
  pruefe(await da(kopfP), 'PC: Kopfleiste des Rahmens')
  // Kopf-Kasten wie in den Apps (12.10.2026, Wunsch der Lehrkraft) – genau einer, der alte Startseiten-Kopf bleibt weg
  pruefe(
    (await p.locator('.home-hero, [data-home-kopf]').count()) === 0 && (await p.locator('[data-startseite] [data-start-begruessung]').count()) === 1,
    'PC: Kopf-Kasten wie in den Apps (einmal, nichts doppelt)'
  )
  const datumP = ((await kopfP.locator('[data-rahmen-datum]').innerText().catch(() => '')) ?? '').trim()
  pruefe(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d\d\.\d\d\.$/.test(datumP), `PC: Datum im Kopf („${datumP}")`)
  const farben = await p.evaluate(() => {
    const kopf = document.querySelector('.rahmen-kopf')
    const leiste = document.querySelector('.app-leiste')
    const kb = kopf?.getBoundingClientRect()
    return { verlauf: kopf ? getComputedStyle(kopf).backgroundImage : '', leiste: leiste ? getComputedStyle(leiste).backgroundColor : '', breite: kb?.width ?? 0, links: kb?.left ?? -1 }
  })
  pruefe(/linear-gradient/.test(farben.verlauf) && farben.breite >= 1400 && farben.links === 0, `PC: Kopf mit Verlauf über die volle Breite (${Math.round(farben.breite)} px)`)
  pruefe(Boolean(farben.leiste) && farben.verlauf.startsWith(`linear-gradient(90deg, ${farben.leiste}`), `PC: Kopf und Leiste teilen den Grund – Ecke nahtlos (Leiste ${farben.leiste})`)
  pruefe(await da(kopfP.locator('[data-rahmen-chip="geplant"]'), 8000), 'PC: Chip „1 Test geplant" im Kopf')
  const chipGeplant = (await kopfP.locator('[data-rahmen-chip="geplant"]').innerText().catch(() => '')).trim()
  pruefe(chipGeplant === '1 Test geplant', `PC: Chip-Text „${chipGeplant}"`)
  pruefe((await kopfP.locator('[data-rahmen-chip="vokabeltest"]').getAttribute('data-anzahl').catch(() => null)) === '1', 'PC: Chip „1 Vokabeltest bald" (Testtermin in 3 Tagen)')
  const chips = await kopfP.locator('[data-rahmen-chip]').evaluateAll((e) => e.map((x) => Number(x.getAttribute('data-anzahl'))))
  pruefe(chips.length > 0 && chips.every((n) => n > 0), `PC: nur Chips mit Zahl > 0 (${chips.join(', ')})`)
  const kachel = await kopfP.locator('[data-rahmen-logo-kachel]').boundingBox()
  const leisteB = await p.locator('.app-leiste').boundingBox()
  pruefe(kachel && leisteB && kachel.x + kachel.width <= leisteB.width + 1, 'PC: Logo-Kachel in der Ecke über der Leiste')
  await p.screenshot({ path: join(out, '0-rahmen-pc.png'), clip: { x: 0, y: 0, width: 1440, height: 420 } })
  // Schmal: passen die Chips nicht, stehen sie in „N Hinweise ▾"
  await p.setViewportSize({ width: 720, height: 1000 })
  const hinweise = p.locator('[data-rahmen-kopf="gross"] [data-rahmen-hinweise]')
  pruefe(await da(hinweise, 5000), 'Schmal: Chips eingeklappt in „N Hinweise ▾"')
  if (await hinweise.isVisible().catch(() => false)) {
    await hinweise.click()
    pruefe(await da(p.locator('[data-rahmen-hinweise-liste] [data-rahmen-chip="geplant"]'), 3000), 'Schmal: „Hinweise" zeigt die Chips')
    await p.waitForTimeout(400)
    await p.screenshot({ path: join(out, '0b-rahmen-schmal.png'), clip: { x: 0, y: 0, width: 720, height: 420 } })
    await hinweise.click()
  }
  await p.setViewportSize({ width: 1440, height: 1000 })
  await p.screenshot({ path: join(out, '1-startseite.png'), fullPage: true })
  await termineP.screenshot({ path: join(out, '1b-termine-pc.png') })
  // Suche (10.10.2026): das Suchergebnis steht direkt unter dem Suchfeld, über dem Schnellzugriff
  const sucheP = p.locator('[data-home-suche]')
  if (await da(sucheP, 8000)) {
    await sucheP.fill(`Suchprobe ${KLASSE}`)
    const titelSuche = p.getByRole('heading', { name: 'Suchergebnis' })
    pruefe(await da(titelSuche, 5000), 'Suche: Titel „Suchergebnis"')
    pruefe(await da(p.getByText(`Suchprobe ${KLASSE}`).first(), 5000), 'Suche: Material gefunden')
    const [fb, tb, rb] = [await sucheP.boundingBox(), await titelSuche.boundingBox(), await p.locator('[data-schnellzugriff-raster]').boundingBox()]
    pruefe(fb && tb && rb && tb.y >= fb.y + fb.height && tb.y - (fb.y + fb.height) < 120 && tb.y < rb.y, `Suchergebnis direkt unter dem Suchfeld und über dem Schnellzugriff (Feld ${fb?.y}, Titel ${tb?.y}, Raster ${rb?.y})`)
    await p.screenshot({ path: join(out, '1c-suche.png') })
    await sucheP.fill('')
  } else pruefe(false, 'Suche: Suchfeld auf der Startseite')
  // Leiste: vier Gruppen, aufklappbar
  const gruppen = await p.locator('.app-leiste [data-gruppe]').evaluateAll((e) => e.map((x) => x.getAttribute('data-gruppe')))
  pruefe(gruppen.join(',') === 'unterricht,planung,pruefung,verwaltung', `Gruppen in der Leiste: ${gruppen.join(', ')}`)
  await p.locator('.app-leiste [data-gruppe="pruefung"] [aria-label="Tests"]').first().click()
  pruefe((await p.locator('.app-leiste [aria-label="Vokabeltest"]').count()) === 0, 'Gruppe zugeklappt: Apps verborgen')
  // Neu laden in derselben Anmeldung ist keine neue Sitzung: zugeklappt bleibt zu, aufgeklappt auf
  await p.reload()
  await da(p.locator('.app-leiste [data-gruppe="pruefung"]'))
  await p.waitForTimeout(500)
  pruefe(
    (await p.locator('.app-leiste [aria-label="Vokabeltest"]').count()) === 0 &&
      (await p.locator('.app-leiste [data-gruppe="unterricht"] [data-leiste-gruppe-kopf][data-offen="true"]').count()) === 1,
    'Neu geladen (gleiche Sitzung): Auf/Zu der Gruppen bleibt'
  )
  await p.locator('.app-leiste [data-gruppe="pruefung"] [aria-label="Tests"]').first().click()
  pruefe((await p.locator('.app-leiste [aria-label="Vokabeltest"]').count()) === 1, 'Gruppe aufgeklappt: Apps wieder da')
  // Laufende Reihen → Übersicht der Reihe
  await p.locator('.app-leiste [aria-label="Laufende Reihen"]').click()
  pruefe(await da(p.locator('[data-laufende-reihen] [data-laufende-reihe]')), 'App „Laufende Reihen" mit Karte')
  // Der Rahmen steht auf jeder Seite – mit denselben Chips
  pruefe(await da(p.locator('[data-rahmen-kopf="gross"] [data-rahmen-chip="geplant"]'), 5000), 'Andere App: Kopfleiste mit Chips bleibt')
  await p.screenshot({ path: join(out, '2-laufende-reihen.png'), fullPage: true })
  await p.locator('[data-laufende-reihen] [data-reihe-oeffnen-uebersicht]').first().click()
  pruefe(await da(p.locator('[data-reihe-uebersicht]')), 'Sprung in die Übersicht der Reihe')
  // Freigegebene Blätter (ohne Freigabe: leerer Zustand)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  pruefe(await da(p.locator('[data-freigaben]')), 'App „Freigegebene Blätter"')
  await p.screenshot({ path: join(out, '3-freigaben.png') })
  await lk.request.post(`${A}/server/reihen/${r.id}/loeschen`, { headers: KOPF, data: {} })

  // ---------- Smartphone-Kopf (10.10.2026): Logo freigestellt links, „Schul-Apps" + Schulname rechts, „Meine Klassen"-Zeile
  const vorher = await (await verwaltung.request.get(`${A}/server/schule`, { headers: KOPF })).json()
  const logoSeite = await verwaltung.newPage()
  await logoSeite.goto(`${A}/anmelden`)
  // Testlogo: weißer Hintergrund, roter Kreis
  const testLogo = await logoSeite.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 80
    c.height = 80
    const k = c.getContext('2d')
    k.fillStyle = '#ffffff'
    k.fillRect(0, 0, 80, 80)
    k.fillStyle = '#c0392b'
    k.beginPath()
    k.arc(40, 40, 28, 0, Math.PI * 2)
    k.fill()
    return c.toDataURL('image/png')
  })
  await logoSeite.close()
  if (!vorher.schule) await verwaltung.request.post(`${A}/server/schule`, { headers: KOPF, data: { name: 'Probe-Gymnasium', stateId: 'NI', schulformen: ['gymnasium'] } })
  await verwaltung.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: testLogo } })
  const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await anmelden(handy, lehrer.benutzer, lehrer.passwort)
  const h = await handy.newPage()
  await h.goto(`${A}/`)
  pruefe(await da(h.locator('[data-rahmen-kopf="handy"]')), 'Smartphone: schmale Kopfleiste')
  pruefe(!(await h.getByText('Material für den Unterricht und').isVisible().catch(() => false)), 'Smartphone: ohne Untertitel')
  pruefe((await h.locator('.app-leiste').count()) === 0 && (await h.locator('.mobil-tabs').count()) === 1, 'Smartphone: keine Seitenleiste, Tabs unten')
  pruefe(await da(h.locator('[data-rahmen-logo]')), 'Smartphone: Schullogo links im Kopf')
  const ecke = await h.locator('[data-rahmen-logo]').evaluate(
    (img) =>
      new Promise((ok) => {
        const pruef = () => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const k = c.getContext('2d')
          k.drawImage(img, 0, 0)
          ok([k.getImageData(1, 1, 1, 1).data[3], k.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3]])
        }
        img.complete ? pruef() : (img.onload = pruef)
      })
  )
  pruefe(ecke[0] === 0 && ecke[1] === 255, `Smartphone: Logo-Hintergrund durchsichtig, Logo deckend (${ecke})`)
  pruefe(await da(h.locator('[data-home-meineklassen]')), 'Smartphone: Zeile „Meine Klassen"')
  const suche = h.locator('[data-home-suche]')
  if (await suche.isVisible().catch(() => false)) {
    const [mk, su] = [await h.locator('[data-home-meineklassen]').boundingBox(), await suche.boundingBox()]
    pruefe(mk && su && mk.y < su.y, '„Meine Klassen" steht über der Materialsuche')
  }
  // Kopf (10.10.2026): Logo auf weißer Kachel, Schulname gekürzt, Chips in „Heute ▾"
  const kopfH = h.locator('[data-rahmen-kopf="handy"]')
  pruefe(
    (await kopfH.locator('[data-rahmen-logo-kachel]').evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '')) === 'rgb(255, 255, 255)',
    'Smartphone: Logo auf weißer Kachel'
  )
  const kopfHB = await kopfH.boundingBox()
  pruefe(kopfHB && kopfHB.height <= 56, `Smartphone: Kopfleiste kompakt (${kopfHB?.height} px)`)
  const heute = kopfH.locator('[data-rahmen-hinweise]')
  if (await da(heute, 8000)) {
    pruefe((await heute.innerText()).startsWith('Heute'), 'Smartphone: Knopf „Heute ▾"')
    await heute.click()
    pruefe(await da(h.locator('[data-rahmen-hinweise-liste] [data-rahmen-chip="geplant"]'), 3000), 'Smartphone: „Heute" zeigt die Chips')
    await h.screenshot({ path: join(out, '4a-handy-heute.png') })
    await heute.click()
    await h.locator('[data-rahmen-hinweise-liste]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined)
  } else pruefe(false, 'Smartphone: „Heute ▾" im Kopf')
  const breiteH = await h.evaluate(() => document.documentElement.scrollWidth)
  pruefe(breiteH <= 390, `Smartphone: kein waagerechtes Scrollen (${breiteH})`)
  await h.screenshot({ path: join(out, '4-handy-kopf.png') })

  // ---------- Termine & Vokabeltraining (10.10.2026): auch ein laufender Kurs OHNE Testtermin (Kästen seit 12.10.2026 zunächst zu)
  await kartenAuf(h)
  const termine = h.locator('[data-schnellzugriff="termine"]')
  pruefe(await da(termine.locator(`[data-start-kurs="${kursOhneTermin}"]`)), 'Smartphone: Kurs ohne Testtermin in „Termine & Vokabeltraining"')
  const zeileFr = termine.locator(`[data-start-kurs="${kursOhneTermin}"]`)
  const textFr = await zeileFr.innerText()
  pruefe(textFr.includes(`${KLASSE} · Französisch`) && /\d+ %/.test(textFr) && !/heute geübt/.test(textFr), `Smartphone: Kurszeile „${KLASSE} · Französisch" mit „n %", ohne „heute geübt"`)
  pruefe((await zeileFr.locator('[data-start-badge]').count()) === 1, `Smartphone: Kurszeile mit genau einem Abzeichen (${await zeileFr.getAttribute('data-start-abzeichen')})`)
  pruefe((await termine.locator('[data-start-demnaechst]').count()) >= 1, 'Smartphone: „Demnächst" unter den Kursen')
  // Weitester Abschnitt (10.10.2026): auch am Smartphone in EINER Zeile (gekürzt mit „…"), voller Text im Tooltip
  const kopfEnH = termine.locator(`[data-start-kurs="${kursMitTermin}"] button[title] > p`).first()
  const hoeheEnH = (await kopfEnH.boundingBox().catch(() => null))?.height ?? 0
  pruefe(
    hoeheEnH > 0 && hoeheEnH < 28 && (await termine.locator(`[data-start-kurs="${kursMitTermin}"] button[title]`).getAttribute('title')) === 'Green Line 1 · Unit 2 (Abschnitt 3 von 7)',
    `Smartphone: Kurszeile einzeilig (${hoeheEnH} px), voller Abschnitt im Tooltip`
  )
  const unitFrH = termine.locator(`[data-start-kurs="${kursOhneTermin}"] [data-start-unit]`)
  pruefe(
    await unitFrH.evaluate((e) => e.textContent.includes('Unité 1') && e.scrollWidth <= e.clientWidth + 1).catch(() => false),
    'Smartphone: die Unit bleibt ungekürzt (zuerst kürzt der Band)'
  )
  // Hinweis „Schuldaten übernehmen?" verdeckt sonst die Karte im Bild
  const neinDanke = h.getByRole('button', { name: 'Nein, danke' })
  if (await neinDanke.isVisible().catch(() => false)) await neinDanke.click()
  await termine.scrollIntoViewIfNeeded()
  await termine.screenshot({ path: join(out, '4b-handy-termine.png') })

  // ---------- Anzahl je Karte (10.10.2026): Vorgabe 5, Wahl bleibt dauerhaft je Gerät
  const wahlTermine = h.locator('[data-start-anzahl="termine"]')
  pruefe(await da(wahlTermine), 'Smartphone: Anzahl-Wahl an „Termine & Vokabeltraining"')
  pruefe((await wahlTermine.innerText()).trim().startsWith('5'), `Anzahl-Vorgabe 5 (${(await wahlTermine.innerText()).trim()})`)
  pruefe(await h.locator('[data-start-anzahl="tests"]').isVisible(), 'Anzahl-Wahl auch an „Onlinetests"')
  await wahlTermine.click()
  await h.locator('[data-start-anzahl-wahl="10"]').click()
  await h.waitForTimeout(300)
  pruefe((await wahlTermine.innerText()).trim().startsWith('10'), 'Anzahl 10 gewählt')
  await h.reload()
  pruefe(await da(h.locator('[data-start-anzahl="termine"]')), 'Nach dem Neuladen: Anzahl-Wahl da')
  pruefe((await h.locator('[data-start-anzahl="termine"]').innerText()).trim().startsWith('10'), 'Nach dem Neuladen: weiterhin 10')
  pruefe((await h.locator('[data-start-anzahl="tests"]').innerText()).trim().startsWith('5'), 'Andere Karte: weiterhin 5 (Wahl je Karte)')
  // Neue Sitzung im selben Gerät (gleicher Speicher): die Wahl bleibt (Ansichtswunsch, kein Auf/Zu)
  const handy2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    storageState: await handy.storageState()
  })
  const h2 = await handy2.newPage()
  await h2.goto(`${A}/`)
  pruefe(await da(h2.locator('[data-start-anzahl="termine"]')), 'Neuer Kontext mit gleichem Speicher: Anzahl-Wahl da')
  pruefe((await h2.locator('[data-start-anzahl="termine"]').innerText()).trim().startsWith('10'), 'Neuer Kontext mit gleichem Speicher: weiterhin 10')
  await handy2.close()

  // ---------- Kasten „Meine Klassen" (10.10.2026): zugeklappt, aufgeklappt mit Klassen, Tipp öffnet die Klasse
  const kasten = h.locator('[data-home-meineklassen]')
  pruefe((await kasten.getAttribute('data-offen')) === 'false' && !(await h.locator('[data-home-meineklassen-liste]').isVisible()), 'Kasten „Meine Klassen" zunächst zugeklappt')
  // Zugeklappt: kurze Übersicht im Kopf (zweite Fassung, 10.10.2026)
  pruefe(await da(h.locator('[data-home-meineklassen-uebersicht]')), 'Zugeklappt: Übersicht im Kopf')
  const ueb = (await h.locator('[data-home-meineklassen-uebersicht]').innerText()).trim()
  pruefe(/^\d+ Klassen? · \d+ Kurse?$/.test(ueb), `Zugeklappt: Übersicht „n Klassen · n Kurse" (${ueb})`)
  await kasten.screenshot({ path: join(out, '5a-handy-klassen-zu.png') })
  await h.locator('[data-home-meineklassen-kopf]').click()
  pruefe(await da(h.locator(`[data-home-meineklassen-liste] [data-home-klasse="${KLASSE}"]`)), 'Aufgeklappt: die Klasse steht darin')
  pruefe(await h.locator('[data-home-alle-klassen]').isVisible(), 'Aufgeklappt: „Alle Klassen"')
  pruefe(!(await h.locator('[data-home-meineklassen-uebersicht]').isVisible().catch(() => false)), 'Aufgeklappt: keine Übersicht im Kopf')
  // Eine Zeile je Klasse: volle Breite, mindestens 48 px hoch, Fächer als Chips; „Alle Klassen" als gleich breite Zeile
  const zeile = h.locator(`[data-home-klasse="${KLASSE}"]`)
  const [zb, kb, ab] = [await zeile.boundingBox(), await kasten.boundingBox(), await h.locator('[data-home-alle-klassen]').boundingBox()]
  pruefe(zb && kb && ab && zb.height >= 48 && zb.width >= kb.width - 4 && Math.abs(ab.width - zb.width) < 2 && ab.height >= 48, `Klassenzeile und „Alle Klassen" volle Breite, ≥ 48 px hoch (${zb?.width}×${zb?.height}, ${ab?.width}×${ab?.height})`)
  pruefe((await zeile.locator('[data-home-klasse-fach]').count()) === 2, 'Klassenzeile: beide Fächer als Chips')
  await kasten.screenshot({ path: join(out, '5-handy-klassen-kasten.png') })
  // Auch im hellen Schema ein Bild zum Ansehen (Schema nur kurz umgeschaltet)
  const schema = await h.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))
  await h.evaluate(() => document.documentElement.setAttribute('data-mantine-color-scheme', 'light'))
  await kasten.screenshot({ path: join(out, '5b-handy-klassen-hell.png') })
  await h.evaluate((c) => document.documentElement.setAttribute('data-mantine-color-scheme', c), schema ?? 'dark')
  await zeile.locator('button').first().click({ position: { x: (zb?.width ?? 300) - 24, y: 12 } })
  pruefe(await da(h.locator(`[data-klasse-ansicht="${KLASSE}"]`), 10000), 'Tipp auf die Klasse öffnet sie in „Meine Klassen"')
  await h.screenshot({ path: join(out, '6-handy-klasse.png') })
  await handy.close()
  // PC/Tablet (10.10.2026): derselbe Kopf mit Logo und Schulname, ohne Untertitel
  const gross = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await anmelden(gross, lehrer.benutzer, lehrer.passwort)
  const gp = await gross.newPage()
  await gp.goto(`${A}/`)
  pruefe(await da(gp.locator('[data-rahmen-kopf="gross"] [data-rahmen-logo-kachel] [data-rahmen-logo]'), 15000), 'PC: Schullogo auf der Kachel im Kopf')
  pruefe(!(await gp.getByText('Material für den Unterricht und').isVisible().catch(() => false)), 'PC: ohne Untertitel')
  pruefe(((await gp.locator('[data-rahmen-schule]').innerText().catch(() => '')) ?? '').trim().length > 0, 'PC: Schulname im Kopf')
  await gp.screenshot({ path: join(out, '4c-pc-kopf.png') })
  // Rahmen in weiteren Farbschemata zum Ansehen (Testkonto, wird gelöscht): Lila hell, Orange hell, Rot dunkel – PC, iPad-Breite, Telefon
  for (const [theme, colorScheme] of [['grape', 'light'], ['orange', 'light'], ['red', 'dark']]) {
    await api(gross)('settings:set', { appearance: { colorScheme, theme, dunkelVorgabe: false } })
    await gp.reload()
    await da(gp.locator('[data-rahmen-kopf="gross"] [data-rahmen-chip]'), 10000)
    await gp.screenshot({ path: join(out, `4d-rahmen-${theme}-${colorScheme}.png`) })
    await gp.setViewportSize({ width: 1024, height: 768 })
    await gp.waitForTimeout(300)
    await gp.screenshot({ path: join(out, `4e-rahmen-ipad-${theme}-${colorScheme}.png`) })
    await gp.setViewportSize({ width: 390, height: 844 })
    await da(gp.locator('[data-rahmen-kopf="handy"]'), 5000)
    await gp.screenshot({ path: join(out, `4f-rahmen-handy-${theme}-${colorScheme}.png`) })
    await gp.setViewportSize({ width: 1280, height: 860 })
  }
  // Breite Leiste: Namen ausgeklappt, „Schul-Apps" steht in der Ecke über der Leiste
  const breitKnopf = gp.locator('.app-leiste [aria-label="Leiste mit Namen ausklappen"]')
  if (await breitKnopf.isVisible().catch(() => false)) {
    await breitKnopf.click()
    await gp.waitForTimeout(300)
    await gp.screenshot({ path: join(out, '4g-rahmen-breit.png') })
    await gp.locator('.app-leiste [aria-label="Namen einklappen"]').click()
  }
  // Ein Chip führt in die passende App; der Rahmen bleibt stehen
  const chipT = gp.locator('[data-rahmen-kopf="gross"] [data-rahmen-chip="geplant"]')
  if (await da(chipT, 8000)) {
    await chipT.click()
    pruefe(
      await gp.locator('[data-schnellzugriff-raster]').waitFor({ state: 'detached', timeout: 8000 }).then(
        () => true,
        () => false
      ),
      'Chip „Test geplant" öffnet die App Onlinetest (Startseite verlassen)'
    )
    pruefe(await gp.locator('[data-rahmen-kopf="gross"]').isVisible(), 'Onlinetest: Kopfleiste des Rahmens bleibt')
    await gp.screenshot({ path: join(out, '4h-chip-onlinetest.png') })
  } else pruefe(false, 'PC: Chip „Test geplant" nach dem Farbwechsel')
  await gross.close()
  await verwaltung.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: null } })
  if (vorher.schule) await verwaltung.request.post(`${A}/server/schule`, { headers: KOPF, data: vorher.schule })

  // ---------- Fachrelevanz (10.10.2026): Geschichte ohne Sprache – Onlinetest sichtbar, Karte „Termine" ohne Vokabeln
  const ge = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Gero Geschichte' } })).json()
  zuLoeschen.push(ge.id)
  const geCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await anmelden(geCtx, ge.benutzer, ge.passwort)
  await api(geCtx)('settings:set', { eigeneFaecher: ['geschichte'] })
  const g = await geCtx.newPage()
  await g.goto(A)
  await g.waitForTimeout(2000)
  const spG = g.getByRole('button', { name: 'Später einrichten' })
  if (await spG.isVisible().catch(() => false)) await spG.click()
  pruefe(await da(g.locator('[data-schnellzugriff-raster]')), 'Geschichte: Schnellzugriff')
  await g.locator('.app-leiste [data-gruppe="unterricht"] [data-leiste-gruppe-kopf]').click()
  pruefe(await da(g.locator('.app-leiste [aria-label="Onlinetest"]'), 5000), 'Geschichte: Onlinetest in der Leiste (alle Fächer)')
  pruefe((await g.locator('.app-leiste [aria-label="Sprachenlernen"]').count()) === 0, 'Geschichte: kein Sprachenlernen')
  pruefe(await g.locator('[data-schnellzugriff="tests"]').isVisible(), 'Geschichte: Karte „Onlinetests"')
  const termineG = g.locator('[data-schnellzugriff="termine"]')
  pruefe(await da(termineG), 'Geschichte: Karte „Termine"')
  pruefe((await termineG.innerText()).includes('Termine') && !(await termineG.innerText()).includes('Vokabeltraining'), 'Geschichte: Titel „Termine" ohne „Vokabeltraining"')
  pruefe((await termineG.locator('[data-start-kurs], [data-start-grammatik]').count()) === 0, 'Geschichte: keine Kurse/Grammatik in „Termine"')
  pruefe((await g.locator('.app-leiste [aria-label="Materialien"]').count()) === 0, 'Leiste: kein eigener Punkt „Materialien" (10.10.2026 wieder entfernt)')
  await g.screenshot({ path: join(out, '7-geschichte-start.png') })
  // „Neuer Onlinetest": ohne Sprache nur die Lernzielkontrolle
  await g.locator('.app-leiste [aria-label="Onlinetest"]').click()
  const neuOT = g.getByRole('button', { name: /Neuer Onlinetest/ }).first()
  if (await da(neuOT, 8000)) {
    await neuOT.click()
    await g.waitForTimeout(800)
    pruefe((await g.locator('[data-onlinetest-art]').count()) === 0, 'Geschichte: „Neuer Onlinetest" ohne Wahl Vokabel-/Grammatiktest')
    pruefe(await g.getByText(/Welche Lernzielkontrolle soll online/).isVisible(), 'Geschichte: „Neuer Onlinetest" mit Lernzielkontrollen')
    await g.keyboard.press('Escape')
  } else pruefe(false, 'Onlinetest: Knopf „Neuer Onlinetest"')
  await geCtx.close()

  // ---------- Admin sieht alles – auch mit eigenen Fächern (10.10.2026)
  const adminApi = api(verwaltung)
  const adminVorher = (await adminApi('settings:get')).eigeneFaecher ?? []
  await adminApi('settings:set', { eigeneFaecher: ['geschichte'] })
  try {
    const a = await verwaltung.newPage()
    await a.setViewportSize({ width: 1440, height: 1000 })
    await a.goto(A)
    await a.waitForTimeout(2000)
    const spA = a.getByRole('button', { name: 'Später einrichten' })
    if (await spA.isVisible().catch(() => false)) await spA.click()
    await da(a.locator('.app-leiste [data-gruppe="pruefung"] [data-leiste-gruppe-kopf]'))
    for (const gr of ['unterricht', 'pruefung']) {
      const kopf = a.locator(`.app-leiste [data-gruppe="${gr}"] [data-leiste-gruppe-kopf]`)
      if ((await kopf.getAttribute('data-offen')) !== 'true') await kopf.click()
    }
    pruefe(await da(a.locator('.app-leiste [aria-label="Vokabeltest"]'), 5000), 'Admin mit Fach Geschichte: Vokabeltest bleibt sichtbar')
    pruefe(await da(a.locator('.app-leiste [aria-label="Sprachenlernen"]'), 3000), 'Admin mit Fach Geschichte: Sprachenlernen bleibt sichtbar')
    await a.screenshot({ path: join(out, '8-admin-alles.png') })
    await a.close()
  } finally {
    await adminApi('settings:set', { eigeneFaecher: adminVorher })
  }
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
