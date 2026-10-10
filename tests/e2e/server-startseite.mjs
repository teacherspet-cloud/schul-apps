// Startseite und Leiste der Lehrkraft (03.10.2026): Schnellzugriff, Gruppen in der Leiste, Apps
// „Laufende Reihen" und „Freigegebene Blätter". Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-startseite.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

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
        inhalt: { art: 'reflexion', frage: 'Was war schwer?' }
      }
    ]
  }
  const r = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe } })).json()
  await lk.request.post(`${A}/server/reihen/${r.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: gruppe.id } })
  await lk.request.post(`${A}/server/onlinetest/erstellen`, {
    headers: KOPF,
    data: { titel: `${KLASSE} – Unit 3 Test`, test: TEST, lerngruppeId: gruppe.id, zeitMin: 10 }
  })
  await lk.request.post(`${A}/server/vokabeln/freigeben`, {
    headers: KOPF,
    data: {
      lerngruppeId: gruppe.id,
      titel: 'Unit 3 words',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [{ id: 'w1', term: 'park', translation: 'Park' }],
      testTermin: Date.now() + 3 * 864e5
    }
  })

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
  pruefe(await da(p.locator('[data-schnellzugriff="reihen"] [data-laufende-reihe]')), 'Laufende Reihe auf der Startseite')
  pruefe(await p.locator('[data-schnellzugriff="tests"]').getByText('geplant').isVisible(), 'Geplanter Onlinetest auf der Startseite')
  pruefe(
    await p
      .locator('[data-schnellzugriff="termine"]')
      .getByText(/Test in 3 Tagen/)
      .isVisible(),
    'Vokabeltest-Termin mit Prognose'
  )
  pruefe(await p.locator('[data-schnellzugriff="termine"]').getByText('Haltepunkt: Besprechung').isVisible(), 'Haltepunkt der Reihe')
  pruefe((await p.getByText('Programme', { exact: true }).count()) === 0, 'Keine Programmliste mehr auf der Startseite')
  await p.screenshot({ path: join(out, '1-startseite.png'), fullPage: true })
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
  pruefe(await da(h.locator('[data-home-kopf="handy"]')), 'Smartphone: eigener Kopf der Startseite')
  pruefe(!(await h.getByText('Material für den Unterricht und').isVisible().catch(() => false)), 'Smartphone: ohne Untertitel')
  pruefe(await da(h.locator('[data-home-logo]')), 'Smartphone: Schullogo links im Kopf')
  const ecke = await h.locator('[data-home-logo]').evaluate(
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
  await h.screenshot({ path: join(out, '4-handy-kopf.png') })
  await h.locator('[data-home-meineklassen]').click()
  pruefe(await da(h.locator('[data-klassen-liste], [data-klassen-leer]').first(), 10000), 'Zeile öffnet „Meine Klassen"')
  await handy.close()
  await verwaltung.request.post(`${A}/server/schule/logo`, { headers: KOPF, data: { logo: null } })
  if (vorher.schule) await verwaltung.request.post(`${A}/server/schule`, { headers: KOPF, data: vorher.schule })
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
