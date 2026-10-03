// Startseite und Leiste der Lehrkraft (03.10.2026): Schnellzugriff, Gruppen in der Leiste, Apps
// „Laufende Reihen" und „Freigegebene Blätter". Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-startseite.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

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
  await p.locator('.app-leiste [data-gruppe="pruefung"] [aria-label="Leistungsüberprüfungen"]').first().click()
  pruefe((await p.locator('.app-leiste [aria-label="Vokabeltest"]').count()) === 0, 'Gruppe zugeklappt: Apps verborgen')
  await p.locator('.app-leiste [data-gruppe="pruefung"] [aria-label="Leistungsüberprüfungen"]').first().click()
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
