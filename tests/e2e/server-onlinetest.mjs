// Onlinetest auf dem Schul-Apps-Server – zwei Browser (Lehrkraft, Schüler), KI-Attrappe (02.10.2026).
// Vorher: Server lokal mit SCHULAPPS_KI_ATTRAPPE starten (Antwort „onlinetest_bewertung" hinterlegt).
// Aufruf: node tests/e2e/server-onlinetest.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: Lerngruppe mit Testschüler, Onlinetest erstellen (Code, Link), Schülerfassung ohne
// Lösungen, Ablauf am Gerät (Regeln → Start → Antworten), Seite verlassen → sofort abgegeben,
// sofortige Auswertung des Eindeutigen, KI-Auswertung des Offenen, Überstimmen durch die
// Lehrkraft, Historie der Lerngruppe; zum Schluss alle Testkonten samt Daten gelöscht.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-onlinetest')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }

const TEST = {
  version: 1,
  header: { title: 'Unit 1 – Probe', showName: true, showDate: true, showClass: false, showSchool: false, schoolName: '', showVariant: true, showPoints: true, showGrade: true, subtitle: '' },
  settings: { targetLanguage: 'en', level: 'A2', stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 1, grade: 7, vocabCount: 2, variantCount: 1, variantMode: 'sameVocab', tasks: [], topic: '', pictureSource: 'none', answerKey: true, seed: 1 },
  vocab: [],
  variants: [
    {
      id: 'A',
      label: 'A',
      blocks: [
        { id: 'g', kind: 'gap', taskType: 'gapSentences', title: 'Gaps', instruction: 'Fill in the gaps.', pointsPerItem: 1, wordBank: false, firstLetterHint: true, extraBankWords: [], items: [{ id: 'g1', sentences: [{ before: 'I go to', after: 'every day.' }], answer: 'school' }, { id: 'g2', sentences: [{ before: 'My', after: 'is called Rex.' }], answer: 'dog' }] },
        { id: 'o', kind: 'open', taskType: 'mediation', title: 'Say it in English', instruction: 'Express the sentence in English. Use the word in brackets.', pointsPerItem: 2, items: [{ id: 'o1', prompt: 'Neue Schüler integrieren sich leichter. (to integrate)', modelAnswer: 'New students integrate more easily.', lines: 2 }] }
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
  const konto = async (rolle) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle, name: rolle === 'schueler' ? 'Kim Testschülerin' : 'Lea Testlehrerin' } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const lehrer = await konto('lehrkraft')
  const schueler = await konto('schueler')
  pruefe(Boolean(lehrer.benutzer && schueler.benutzer), `Testkonten: ${lehrer.benutzer} (Lehrkraft), ${schueler.benutzer} (Schüler)`)

  // ---------- Lehrkraft: Lerngruppe und Test
  const lk = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '7a Englisch', fach: 'Englisch', mitglieder: [schueler.benutzer] } })).json()
  pruefe(Boolean(gruppe.id), 'Lerngruppe mit Testschüler angelegt')
  const neu = await (await lk.request.post(`${A}/server/onlinetest/erstellen`, { headers: KOPF, data: { titel: 'Unit 1 – Probe', test: TEST, lerngruppeId: gruppe.id, zeitMin: 10 } })).json()
  pruefe(/^[A-Z2-9]{6}$/.test(neu.code ?? '') && neu.link?.endsWith(`/s/t/${neu.code}`), `Onlinetest erstellt (Code ${neu.code})`)

  // ---------- Schüler am „iPad"
  const sk = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })
  const s = await sk.newPage()
  await s.goto(neu.link)
  pruefe(s.url().includes('/anmelden'), 'Link ohne Anmeldung → Anmeldeseite')
  await s.evaluate(() => {
    const d = document.querySelector('details')
    if (d) d.open = true
  })
  await s.fill('#benutzer', schueler.benutzer)
  await s.fill('#passwort', schueler.passwort)
  await s.click('button[type=submit]')
  await s.getByRole('button', { name: 'Test beginnen' }).waitFor({ timeout: 20000 })
  pruefe(s.url().endsWith(`/s/t/${neu.code}`), 'nach der Anmeldung zurück zum Test')
  pruefe(await s.getByText('sofort endgültig abgegeben').isVisible(), 'Regel „Seite verlassen = Abgabe" wird gezeigt')
  const quelltext = await s.evaluate(async (code) => JSON.stringify(await (await fetch('/s/api/beitreten', { method: 'POST', headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json()), neu.code)
  pruefe(!quelltext.includes('school') && !quelltext.includes('integrate more easily') && !quelltext.includes('"answer"'), 'Das Gerät bekommt keine Lösungen')
  await s.screenshot({ path: join(out, '1-regeln.png') })
  await s.getByRole('button', { name: 'Test beginnen' }).click()
  const felder = s.locator('input:not([type=radio]):not([type=hidden]), textarea')
  await felder.nth(0).fill('school')
  await felder.nth(1).fill('Dog')
  await felder.nth(2).fill('New pupils integrate more easily.')
  pruefe((await felder.nth(0).getAttribute('autocorrect')) === 'off' && (await felder.nth(0).getAttribute('spellcheck')) === 'false', 'Felder ohne Autokorrektur und Rechtschreibprüfung')
  await s.waitForTimeout(2600)
  await s.screenshot({ path: join(out, '2-test.png') })
  // Seite verlassen (anderer Tab / andere App)
  await s.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await s.getByText('automatisch abgegeben').waitFor({ timeout: 10000 })
  pruefe(true, 'Seite verlassen → sofort abgegeben, Meldung am Gerät')
  await s.screenshot({ path: join(out, '3-abgegeben.png') })

  // ---------- Lehrkraft: Stand, KI, Überstimmen
  const detail = async () => (await lk.request.get(`${A}/server/onlinetest/${neu.id}`, { headers: KOPF })).json()
  let d = await detail()
  const t = d.teilnahmen[0]
  pruefe(t?.verlassen === true && t.abgabe, 'Lehrkraft sieht: abgegeben durch Verlassen der Seite')
  pruefe(t?.punkte === 1 && t.max === 4 && t.offen === 1, `sofort bewertet: 1/4, 1 offen (${t?.punkte}/${t?.max}, offen ${t?.offen})`)
  const hinweis = Object.values(t.bewertung).find((b) => b.hinweis)
  pruefe(Boolean(hinweis?.hinweis?.includes('Groß')), '„Dog" statt „dog": falsch, aber zur Prüfung markiert')
  const ki = await (await lk.request.post(`${A}/server/onlinetest/${neu.id}/auswerten`, { headers: KOPF, timeout: 120000 })).json()
  pruefe(ki.ok && ki.bewertet === 1, `KI-Auswertung: ${ki.bewertet} Antwort(en), ${ki.anfragen} Anfrage(n)`)
  d = await detail()
  pruefe(d.teilnahmen[0].punkte === 3 && d.teilnahmen[0].offen === 0, `nach der KI: ${d.teilnahmen[0].punkte}/4, nichts offen`)
  const gap2 = d.fassungen[0].einheiten.find((e) => e.id.includes('g2'))
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/korrektur`, { headers: KOPF, data: { teilnahme: t.id, einheit: gap2.id, richtig: true } })
  d = await detail()
  pruefe(d.teilnahmen[0].punkte === 4 && d.teilnahmen[0].note === 1, `Lehrkraft überstimmt „Dog" → 4/4, Note ${d.teilnahmen[0].note}`)

  // Oberfläche der Lehrkraft
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await p.getByRole('button', { name: /Onlinetest/ }).first().click()
  await p.getByText('Unit 1 – Probe').first().click()
  await p.getByText('Kim Testschülerin').waitFor({ timeout: 10000 })
  pruefe(await p.getByText('bitte die Abgaben trotzdem prüfen').isVisible(), 'Hinweis „Abgaben trotzdem prüfen" in der App')
  await p.screenshot({ path: join(out, '4-lehrkraft.png') })
  await p.getByRole('tab', { name: 'Lerngruppen' }).click()
  await p.getByText('7a Englisch').click()
  await p.getByText('Ø Note').first().waitFor({ timeout: 10000 })
  pruefe(await p.getByRole('cell', { name: 'Kim Testschülerin' }).isVisible(), 'Historie der Lerngruppe mit Schülerdurchschnitt')
  await p.screenshot({ path: join(out, '5-historie.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Testkonten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
