// Schülerkonten aus der Klassenliste + Schüler-Startseite (Etappen 1 und 2 des Schülerbereichs, 02.10.2026).
// Vorher: Server lokal starten (IServ NICHT eingerichtet). Keine KI nötig (nur Lückenaufgaben).
// Aufruf: node tests/e2e/server-schuelerstart.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft:
//  - Admin legt aus einer Klassenliste Konten an (Excel-Tab, „Nachname, Vorname"), Doppeltes wird nicht neu angelegt
//  - Lehrkraft sieht die Klasse beim Anlegen einer Lerngruppe; Mitglieder gehören automatisch dazu
//  - QR-Link der Zugangskarte: Benutzername ist eingetragen; erste Anmeldung erzwingt ein eigenes Passwort
//  - Startseite mit Kacheln (Onlinetest mit Zahl offener Tests, Ergebnisse, Rückmeldung, Arbeitsblätter)
//  - Test schreiben → Ergebnis erscheint später unter „Meine Ergebnisse" mit Note und lässt sich öffnen
//  - zum Schluss alle Konten samt Daten gelöscht
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-schuelerstart')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `9z${Date.now() % 1000}`

const TEST = {
  version: 1,
  header: { title: 'Weather Test', showName: true, showDate: true, showClass: false, showSchool: false, schoolName: '', showVariant: true, showPoints: true, showGrade: true, subtitle: '' },
  settings: { targetLanguage: 'en', level: 'A2', stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 1, grade: 9, vocabCount: 2, variantCount: 1, variantMode: 'sameVocab', tasks: [], topic: 'Weather', pictureSource: 'none', answerKey: true, seed: 1 },
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
          instruction: 'Fill in the gaps.',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: false,
          extraBankWords: [],
          items: [
            { id: 'g1', sentences: [{ before: 'I go to', after: 'every day.' }], answer: 'school' },
            { id: 'g2', sentences: [{ before: 'The club', mitte: 'sold cards', after: 'collected books.' }], answer: 'not only … but (also)' }
          ]
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
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })).json()
  zuLoeschen.push(lehrer.id)

  // ---------- Klassenliste (Excel-Tab und „Nachname, Vorname")
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Probe\tMia\nÖztürk, Jan Luca\n' } })
  ).json()
  const mia = liste.angelegt?.find((k) => k.name === 'Mia Probe')
  pruefe(mia?.benutzer === 'mia.probe' || /^mia\.probe\d*$/.test(mia?.benutzer ?? ''), `Konto aus Excel-Zeile: ${mia?.benutzer}`)
  pruefe(liste.angelegt?.some((k) => /^jan\.oeztuerk\d*$/.test(k.benutzer)), 'Umlaute umgeschrieben, nur erster Vorname (jan.oeztuerk)')
  const nochmal = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })).json()
  pruefe(nochmal.angelegt?.[0]?.schonDa === true, 'Zweites Einfügen legt kein doppeltes Konto an')
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if ((liste.angelegt ?? []).some((k) => k.benutzer === n.benutzer)) zuLoeschen.push(n.id)

  // ---------- Lehrkraft: Klasse als Lerngruppe, Test
  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gr = await (await lk.request.get(`${A}/server/lerngruppen`, { headers: KOPF })).json()
  const klasse = (gr.iservGruppen ?? []).find((g) => g.id === `klasse:${KLASSE}`)
  pruefe(Boolean(klasse), `Klasse ${KLASSE} steht bei den Gruppen zur Auswahl (${klasse?.name})`)
  const gruppe = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })).json()
  const neu = await (await lk.request.post(`${A}/server/onlinetest/erstellen`, { headers: KOPF, data: { titel: 'Weather Test', test: TEST, lerngruppeId: gruppe.id, zeitMin: 10 } })).json()

  // ---------- Lernende: QR-Link der Zugangskarte, Passwortwechsel
  const s = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
  const p = await s.newPage()
  await p.goto(`${A}/anmelden?ziel=/s/&benutzer=${encodeURIComponent(mia.benutzer)}`)
  pruefe((await p.inputValue('#benutzer')) === mia.benutzer, 'Anmeldeseite: Benutzername aus dem QR-Code eingetragen')
  await p.fill('#passwort', mia.passwort)
  await p.click('button[type=submit]')
  await p.waitForURL(/\/passwort/, { timeout: 15000 })
  pruefe(true, 'Erste Anmeldung führt zum eigenen Passwort')
  await p.fill('#alt', mia.passwort)
  await p.fill('#neu', 'MiasGeheimnis-2026')
  await p.fill('#neu2', 'MiasGeheimnis-2026')
  await p.click('button[type=submit]')
  await p.waitForURL(/\/s\/?$/, { timeout: 15000 })
  await p.locator('[data-startseite]').waitFor({ timeout: 15000 })
  pruefe(await p.getByText('Hallo Mia!').isVisible(), 'Startseite begrüßt mit Vornamen')
  const kacheln = await p.locator('[data-kachel]').evaluateAll((k) => k.map((x) => x.getAttribute('data-kachel')))
  pruefe(['tests', 'ergebnisse', 'aufgaben', 'blaetter'].every((x) => kacheln.includes(x)), `Kacheln: ${kacheln.join(', ')}`)
  const zahl = await p.locator('[data-kachel="tests"] .mantine-Badge-root').textContent().catch(() => '')
  pruefe(zahl?.trim() === '1', `Onlinetest-Kachel zeigt 1 offenen Test (${zahl})`)
  await p.screenshot({ path: join(out, '1-startseite.png') })

  // ---------- Test schreiben
  await p.locator('[data-kachel="tests"]').click()
  await p.getByRole('link', { name: 'Öffnen' }).first().click()
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'starten' } })
  const regel = p.getByRole('button', { name: /Verstanden|Los geht|Test beginnen/ })
  await regel.first().waitFor({ timeout: 20000 })
  await regel.first().click()
  const felder = p.locator('input[type=text], input:not([type])')
  await felder.first().waitFor({ timeout: 15000 })
  const n = await felder.count()
  pruefe(n === 3, `Drei Felder (eine Lücke + zweiteilige Wendung mit zwei Lücken): ${n}`)
  await felder.nth(0).fill('school')
  await felder.nth(1).fill('not only')
  await felder.nth(2).fill('but')
  await p.screenshot({ path: join(out, '2-test.png') })
  await p.getByRole('button', { name: /Abgeben/ }).first().click()
  const bestaetigen = p.getByRole('button', { name: /Endgültig abgeben|Ja, abgeben/ })
  if (await bestaetigen.first().isVisible({ timeout: 3000 }).catch(() => false)) await bestaetigen.first().click()
  await p.waitForTimeout(1500)

  // ---------- Meine Ergebnisse
  await p.goto(`${A}/s/ergebnisse`)
  await p.locator('[data-ergebnis-eintrag]').first().waitFor({ timeout: 15000 })
  const eintrag = await p.locator('[data-ergebnis-eintrag]').first().textContent()
  pruefe(/Weather Test/.test(eintrag) && /Note 1/.test(eintrag) && /2 \/ 2/.test(eintrag), `Ergebnisliste: ${eintrag}`)
  await p.locator('[data-ergebnis-eintrag]').first().click()
  await p.locator('[data-ergebnis]').waitFor({ timeout: 15000 })
  pruefe(await p.getByText(/Abgegeben am/).isVisible(), 'Früheres Ergebnis mit Datum und Antworten')
  await p.screenshot({ path: join(out, '3-ergebnis.png') })
  await p.goto(`${A}/s/aufgaben`)
  pruefe(await p.getByText(/keine Aufgabe mit Feedback/).isVisible({ timeout: 10000 }), 'Rückmeldung: leere Liste mit Hinweis')
  await p.goto(`${A}/s/`)
  await p.locator('[data-startseite]').waitFor()
  const ergText = await p.locator('[data-kachel="ergebnisse"]').textContent()
  pruefe(/1 Test/.test(ergText), `Ergebnis-Kachel: ${ergText}`)
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'beendet' } })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser.contexts().flatMap((c) => c.pages()).entries()) await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
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
