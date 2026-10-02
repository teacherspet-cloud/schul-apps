// Etappen 3 und 4 des Schülerbereichs (02.10.2026): Onlinetest „nur mit Konto", Rückmeldung an
// einzelne Lernende und an Gäste per QR-Code + Namen, Feedback über das ABO der Lehrkraft.
// Vorher: Server lokal mit KI-Attrappe (Antwort „rueckmeldung_bogen"), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-feedback-freigabe.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-feedback-freigabe')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8q${Date.now() % 1000}`
const R = {
  version: 1,
  meta: { title: 'Mein Hobby', subjectId: 'englisch', subjectLabel: 'Englisch', grade: 8, stateId: 'NI', schoolTypeId: 'gymnasium', schoolTypeName: 'Gymnasium', anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'My hobby', aufgaben: 'Write 80 words about your hobby. Give two reasons why you like it.', erwartung: 'Two reasons, simple present.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const TEST = {
  version: 1,
  header: { title: 'Mini', showName: true, showDate: true, showClass: false, showSchool: false, schoolName: '', showVariant: true, showPoints: true, showGrade: true, subtitle: '' },
  settings: { targetLanguage: 'en', level: 'A2', stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 1, grade: 8, vocabCount: 1, variantCount: 1, variantMode: 'sameVocab', tasks: [], topic: '', pictureSource: 'none', answerKey: true, seed: 1 },
  vocab: [],
  variants: [{ id: 'A', label: 'A', blocks: [{ id: 'g', kind: 'gap', taskType: 'gapSentences', title: 'Gaps', instruction: 'Fill in.', pointsPerItem: 1, wordBank: false, firstLetterHint: false, extraBankWords: [], items: [{ id: 'g1', sentences: [{ before: 'I go to', after: '.' }], answer: 'school' }] }] }],
  fontSize: 12,
  createdAt: new Date().toISOString()
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
/** Konto mit Startpasswort: anmelden und eigenes Passwort setzen */
const schuelerAnmelden = async (ctx, k) => {
  await anmelden(ctx, k.benutzer, k.passwort)
  await ctx.request.post(`${A}/auth/passwort`, { form: { alt: k.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nTom Probe' } })).json()
  const [mia, tom] = ['Mia Probe', 'Tom Probe'].map((n) => liste.angelegt.find((k) => k.name === n))
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if ([mia.benutzer, tom.benutzer].includes(n.benutzer)) zuLoeschen.push(n.id)

  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const abo = await (await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'settings:set', args: [{ ai: { textProvider: 'openai', access: { openai: 'subscription' } } }] } })).json()
  pruefe(abo.ok, 'Lehrkraft nutzt das Abo (ChatGPT)')
  const gruppe = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })).json()

  // ---------- Etappe 3: Onlinetest nur mit Konto
  const test = await (await lk.request.post(`${A}/server/onlinetest/erstellen`, { headers: KOPF, data: { titel: 'Nur Konto', test: TEST, zeitMin: 5, gaeste: false } })).json()
  const g0 = await browser.newContext()
  const gp0 = await g0.newPage()
  await gp0.goto(`${A}/s/t/${test.code}`)
  await gp0.waitForURL(/\/anmelden/, { timeout: 15000 })
  pruefe(true, 'Test „nur mit Konto“: QR-Link führt Gäste zur Anmeldung statt zur Namenseingabe')
  const verweigert = await g0.request.post(`${A}/s/api/gast`, { headers: KOPF, data: { code: test.code, name: 'Max M.' } })
  pruefe(verweigert.status() === 403, `Beitritt mit Namen abgelehnt (${verweigert.status()})`)
  await lk.request.post(`${A}/server/onlinetest/${test.id}/status`, { headers: KOPF, data: { status: 'gaeste' } })
  const erlaubt = await g0.request.post(`${A}/s/api/gast`, { headers: KOPF, data: { code: test.code, name: 'Max M.' } })
  pruefe(erlaubt.ok(), 'Nach dem Umschalten „auch Gäste“ geht es mit Namen')
  await lk.request.post(`${A}/server/onlinetest/${test.id}/status`, { headers: KOPF, data: { status: 'beendet' } })

  // ---------- Etappe 4: Rückmeldung nur für Mia + Gäste
  const mitglieder = await (await lk.request.get(`${A}/server/feedback/mitglieder?gruppe=${gruppe.id}`, { headers: KOPF })).json()
  pruefe(mitglieder.mitglieder?.length === 2, `Mitglieder zur Auswahl: ${mitglieder.mitglieder?.map((m) => m.name).join(', ')}`)
  const fr = await (await lk.request.post(`${A}/server/feedback/freigeben`, { headers: KOPF, data: { rueckmeldung: R, lerngruppeId: gruppe.id, schueler: [mia.benutzer], gaeste: true, runden: 2, titel: 'Mein Hobby' } })).json()
  pruefe(Boolean(fr.code && fr.link?.includes('/s/f/')), `Freigabe mit Gast-Code ${fr.code}`)

  const sm = await browser.newContext()
  await schuelerAnmelden(sm, mia)
  const st = await browser.newContext()
  await schuelerAnmelden(st, tom)
  const fuerMia = (await (await sm.request.get(`${A}/s/api/aufgaben`, { headers: KOPF })).json()).aufgaben ?? []
  const fuerTom = (await (await st.request.get(`${A}/s/api/aufgaben`, { headers: KOPF })).json()).aufgaben ?? []
  pruefe(fuerMia.some((a) => a.id === fr.id), 'Mia (ausgewählt) sieht die Aufgabe')
  pruefe(!fuerTom.some((a) => a.id === fr.id), 'Tom (nicht ausgewählt) sieht sie nicht')

  // Gast am Telefon: QR-Link → Name → Aufgabe → Feedback
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const p = await g.newPage()
  await p.goto(fr.link)
  await p.locator('[data-gastname]').fill('Lina S.')
  await p.getByRole('button', { name: 'Weiter' }).click()
  await p.waitForURL(/\/s\/a\//, { timeout: 15000 })
  pruefe(true, 'Gast mit Namen landet in der Aufgabe')
  await p.locator('textarea').first().fill('My hobby is football. I like it because it is fun and I can meet my friends every week.')
  await p.getByRole('button', { name: 'Feedback anfordern' }).click()
  const bogen = await p.getByText('Du nennst zwei klare Gründe.').waitFor({ timeout: 60000 }).then(() => true, () => false)
  pruefe(bogen, 'Feedback erscheint (über das Abo der Lehrkraft)')
  await p.screenshot({ path: join(out, '1-gast-feedback.png'), fullPage: true })
  // Tom kommt mit Konto über denselben Code hinein (ohne Namen)
  const tp = await st.newPage()
  await tp.goto(fr.link)
  await tp.waitForURL(/\/s\/a\//, { timeout: 15000 })
  pruefe(true, 'Konto über den QR-Code: direkt in die Aufgabe, ohne Namenseingabe')

  const detail = await (await lk.request.get(`${A}/server/feedback/${fr.id}`, { headers: KOPF })).json()
  pruefe(detail.abgaben?.some((a) => a.name === 'Lina S.' && a.fassungen?.[0]?.bogen), 'Lehrkraft sieht die Abgabe des Gastes samt Bogen')
  const lp = await lk.newPage()
  await lp.goto(`${A}/`)
  await lp.waitForTimeout(500)
  const listeLk = await (await lk.request.get(`${A}/server/feedback`, { headers: KOPF })).json()
  const eintrag = listeLk.freigaben.find((f) => f.id === fr.id)
  pruefe(eintrag?.schueler === 1 && Boolean(eintrag?.code), `Liste der Lehrkraft: 1 ausgewählt, Gäste per QR (${JSON.stringify({ s: eintrag?.schueler, c: eintrag?.code })})`)
  await lk.request.post(`${A}/server/feedback/${fr.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser.contexts().flatMap((c) => c.pages()).entries()) await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({ nutzer: [] }))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast' && /^(Lina S\.|Max M\.)$/.test(n.name)) zuLoeschen.push(n.id)
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
