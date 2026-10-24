// App „Sprechprüfungen" (19.10.2026, Organisation): Karten je Jahrgang im schulweiten Pool – ohne KI:
//  1. Lehrkraft öffnet die App, Jahrgang 7 › „Von Hand" eine Dialogkarte und ein Interview-Set anlegen.
//  2. „Fehlende Inhalte ergänzen" (24.10.2026, KI-Attrappe): Hilfen + dritte Dialogrolle, Marke „nicht durchgesehen",
//     vorherige Fassung wiederherstellen, einzelne Karte ergänzen, „Geprüft".
//  3. Kachel zeigt die Ampel je Teil; Druckdialog für ein Prüfungsset.
//  4. Sprechtraining der Lernenden (Klasse 7…) nutzt die Pool-Karte des Jahrgangs.
//  5. Karte löschen.
// Aufruf: node tests/e2e/server-sprechpruefungen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-sprechpruefungen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7p${Date.now() % 1000}`
const TITEL = `Planning a school trip ${Date.now() % 1000}`
// Gruppen und Untergruppen sind anfangs zugeklappt (21.10.2026): alle zugeklappten einer Spalte aufklappen
const aufklappen = async (p, spalte) => {
  for (let i = 0; i < 20; i++) {
    const zu = p.locator(`[data-sprech-spalte="${spalte}"] button[aria-expanded="false"]`)
    if (!(await zu.count())) return
    await zu.first().click()
    await p.waitForTimeout(150)
  }
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Paul Pool' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Pia Probe' } })).json()
  const pia = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer ?? [])
    if (n.benutzer === pia.benutzer) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()

  // ---------- App öffnen
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  const knopf = p.locator('.app-leiste [aria-label="Sprechprüfungen"]').filter({ visible: true }).first()
  pruefe(await da(knopf), 'App „Sprechprüfungen" in der Leiste (Organisation)')
  await knopf.click()
  await p.locator('[data-sprechpruefungen]').filter({ visible: true }).first().waitFor()
  pruefe((await p.locator('[data-sprech-jahrgang-kachel]').count()) === 9, 'Englisch: Jahrgänge 5–13 als Kacheln')
  await p.screenshot({ path: join(out, '1-kacheln.png') })
  await p.locator('[data-sprech-jahrgang-kachel="7"]').click()
  await p.locator('[data-sprech-jahrgang="7"]').waitFor()

  // ---------- Von Hand: Dialogkarte
  await p.locator('[data-sprech-spalte="dialog"]').getByRole('button', { name: 'Von Hand' }).click()
  const dlg = p.getByRole('dialog')
  await dlg.getByLabel('Titel').fill(TITEL)
  await dlg.getByLabel('Situation (Text der Karte)').fill('Your class wants to go on a trip. Talk about the ideas and agree on one.')
  await dlg.getByLabel('Rolle Schüler/in').fill('You are a student.')
  await dlg.getByLabel(/Rolle der Partnerin/).fill('You are a classmate.')
  await dlg.getByLabel(/Punkte \/ Optionen/).fill('zoo\nmuseum\nbeach\nclimbing park')
  await dlg.getByLabel('Ziel').fill('Agree on one trip.')
  await dlg.locator('[data-sprechkarte-speichern]').click()
  pruefe(await da(p.locator('[data-sprech-spalte="dialog"] [data-sprech-gruppe] button[aria-expanded="false"]').first()), 'Gruppen anfangs zugeklappt')
  await aufklappen(p, 'dialog')
  pruefe(await da(p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL })), 'Dialogkarte im Pool')
  // Interview-Set
  await p.locator('[data-sprech-spalte="interview"]').getByRole('button', { name: 'Von Hand' }).click()
  await p.getByRole('dialog').getByLabel('Thema').fill('Free time')
  await p.getByRole('dialog').getByLabel(/Fragen/).fill('What do you do after school?\nTell me about your hobby.\nWhy do you like it?\nWhat did you do last weekend?')
  await p.getByRole('dialog').locator('[data-sprechkarte-speichern]').click()
  await p.locator('[data-sprech-spalte="interview"] [data-sprech-gruppe]').first().waitFor()
  await aufklappen(p, 'interview')
  pruefe(await da(p.locator('[data-sprech-spalte="interview"] [data-sprechkarte="interview"]')), 'Interview-Set im Pool')
  await p.screenshot({ path: join(out, '2-jahrgang.png'), fullPage: true })
  // Blättern im Kartenfenster (21.10.2026): zweites Interview-Set, Pfeile, „x von 2", Taste →
  await p.locator('[data-sprech-spalte="interview"]').getByRole('button', { name: 'Von Hand' }).click()
  await p.getByRole('dialog').getByLabel('Thema').fill('School life')
  await p.getByRole('dialog').getByLabel(/Fragen/).fill('What is your favourite subject?\nWhy?\nTell me about your teachers.\nWhat would you change?')
  await p.getByRole('dialog').locator('[data-sprechkarte-speichern]').click()
  await p.waitForTimeout(400)
  await aufklappen(p, 'interview')
  await p.locator('[data-sprech-spalte="interview"] [data-sprechkarte="interview"]', { hasText: 'Free time' }).locator('button').first().click()
  const pos = p.getByRole('dialog').locator('[data-sprech-position]')
  const vorher = (await da(pos)) ? await pos.textContent() : ''
  pruefe(/^[12] von 2$/.test(vorher ?? ''), `Kartenfenster: Position „${vorher}"`)
  await p.screenshot({ path: join(out, '2b-blaettern.png') })
  await pos.click()
  await p.keyboard.press(vorher?.startsWith('1') ? 'ArrowRight' : 'ArrowLeft')
  await p.waitForTimeout(400)
  const nachher = await p.getByRole('dialog').locator('[data-sprech-position]').textContent()
  pruefe(nachher !== vorher && /von 2$/.test(nachher ?? ''), `Taste blättert zur Nachbarkarte („${nachher}")`)
  await p.keyboard.press('Escape')

  // ---------- Fehlende Inhalte ergänzen (24.10.2026): ein Knopf für alle Karten der Sprache, KI-Attrappe
  const poolKarte = async () => (await (await lk.request.get(`${A}/server/sprech-bank?sprache=en`)).json()).karten.find((x) => x.karte.titel === TITEL)
  const warteStatus = async (status, ms = 60000) => {
    for (let t = 0; t < ms; t += 1000) {
      const x = await poolKarte()
      if ((x?.karte.hilfenStatus ?? '') === status) return x
      await p.waitForTimeout(1000)
    }
    return null
  }
  pruefe(await da(p.locator('[data-sprech-ergaenzen-alle]')), 'Knopf „Fehlende Inhalte ergänzen" je Sprache')
  await p.locator('[data-sprech-ergaenzen-alle]').click()
  await p.locator('[data-sprech-ergaenzen-start]').click()
  let k = await warteStatus('ki')
  pruefe(Boolean(k), 'Karten von der KI ergänzt (Marke „noch nicht durchgesehen")')
  pruefe(k?.karte.hilfen?.rollen?.length === 3 && k?.vorher === true, 'Dialogkarte hat drei Rollen, vorherige Fassung gesichert')
  pruefe(k?.karte.titel === TITEL && k?.karte.rolleSchueler === k?.karte.hilfen?.rollen?.[0]?.karte, 'Titel bleibt; Rolle 1 ist die Schülerrolle')
  const inter = (await (await lk.request.get(`${A}/server/sprech-bank?sprache=en`)).json()).karten.filter((x) => x.teil === 'interview')
  for (let t = 0; t < 30 && !inter.every((x) => x.karte.hilfen); t++) {
    await p.waitForTimeout(1000)
    inter.splice(0, inter.length, ...(await (await lk.request.get(`${A}/server/sprech-bank?sprache=en`)).json()).karten.filter((x) => x.teil === 'interview'))
  }
  pruefe(inter.length === 2 && inter.every((x) => x.karte.hilfen?.nachfragen?.length && x.karte.hilfen?.wortschatz?.length), 'Beide Interview-Sets haben Nachfragen und Wortschatz')
  await p.waitForTimeout(1200)
  await aufklappen(p, 'dialog')
  const dk = p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL })
  pruefe(await da(dk.locator('[data-sprech-hilfen-ki]')), 'Kachel zeigt „KI, nicht durchgesehen"')
  await dk.locator('button').first().click()
  pruefe(await da(p.getByRole('dialog').locator('[data-sprech-rolle-feld="3"]')), 'Editor: dritte Rolle als Feld, Vorschläge und Wortschatz')
  await p.screenshot({ path: join(out, '2c-hilfen.png') })
  await p.getByRole('dialog').locator('[data-sprech-hilfen-zurueck]').click()
  k = await warteStatus('')
  pruefe(Boolean(k) && !k.karte.hilfen && k.vorher === false, 'Vorherige Fassung wiederhergestellt (zwei Rollen, ohne Hilfen)')
  // Einzelne Karte per KI ergänzen und bestätigen
  await p.waitForTimeout(1200)
  await aufklappen(p, 'dialog')
  await dk.locator('button').first().click()
  await p.getByRole('dialog').locator('[data-sprech-hilfen-ergaenzen]').click()
  k = await warteStatus('ki')
  pruefe(k?.karte.hilfen?.rollen?.length === 3, 'Einzelne Karte per KI ergänzt')
  await p.waitForTimeout(1200)
  await aufklappen(p, 'dialog')
  await dk.locator('button').first().click()
  await p.getByRole('dialog').locator('[data-sprech-hilfen-geprueft]').click()
  k = await warteStatus('geprueft')
  pruefe(Boolean(k) && k.vorher === false, 'Hilfen als durchgesehen bestätigt')
  await p.waitForTimeout(1200)
  pruefe(((await p.locator('[data-sprech-inhalte-stand]').textContent()) ?? '').includes('Alle Karten vollständig'), 'Stand: alle Karten vollständig')
  // Druckdialog
  await p.locator('[data-pruefungsset-knopf]').click()
  pruefe(await da(p.locator('[data-pruefungsset-drucken]')), 'Druckdialog für ein Prüfungsset')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Alle Jahrgänge' }).click()
  pruefe(await da(p.locator('[data-sprech-jahrgang-kachel="7"] [data-ampel="dialog:1"]')), 'Kachel: Ampel je Teil (Dialog 1)')

  // ---------- Training nutzt die Pool-Karte des Jahrgangs
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })
  const kurs = (await post('/server/vokabeln/freigeben', { lerngruppeId: g.id, titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'trip', translation: 'Ausflug' }] })).id
  kurse.push(kurs)
  await post('/server/sprechen/freigeben', { kurs, teile: ['dialog'], tage: 14, minutenWoche: 30, nurSchulzeit: false })
  const sm = await browser.newContext({ viewport: { width: 1100, height: 1000 } })
  await anmelden(sm, pia.benutzer, pia.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { alt: pia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const s = await sm.newPage()
  await s.goto(`${A}/s/ordner/Englisch?r=sprech`)
  await s.locator('[data-sprech-ueben="dialog"]').click()
  await s.locator('[data-sprech-start]').click()
  pruefe(await da(s.locator('[data-sprech-karte]', { hasText: TITEL })), 'Training zeigt die Pool-Karte des Jahrgangs')
  await s.screenshot({ path: join(out, '3-training.png') })

  // ---------- Löschen
  await p.locator('[data-sprech-jahrgang-kachel="7"]').click()
  await p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL }).getByRole('button', { name: 'Löschen' }).click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-sprech-spalte="dialog"] [data-sprechkarte="dialog"]', { hasText: TITEL }).count()) === 0, 'Karte gelöscht')
  // Aufräumen: Interview-Set
  for (const b of await p.locator('[data-sprech-spalte="interview"] [data-sprechkarte]').getByRole('button', { name: 'Löschen' }).all()) await b.click().catch(() => undefined)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split(String.fromCharCode(10)).slice(0, 6).join(' | ')}`)
} finally {
  for (const k of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${k}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurse und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
