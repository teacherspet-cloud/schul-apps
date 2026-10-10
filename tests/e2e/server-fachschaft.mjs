// Für Fachschaft freigeben (02.10.2026) – drei Lehrkräfte, Server lokal, ohne KI.
// Aufruf: node tests/e2e/server-fachschaft.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: freigeben (Fach aus dem Material); sichtbar nur für das Fach (eigene Fächer oder
// IServ-Gruppenordner); öffnen ohne Ändern legt keine sichtbare Kopie an; erste Änderung →
// eigene Kopie „Titel – Kopie Name", die die Fachschaft nicht sieht; das Original bleibt
// unverändert; Oberfläche: „Von der Fachschaft" in der Bibliothek und ⋯ › „Für Fachschaft
// freigeben"; Zurücknehmen beendet die Sichtbarkeit.
// Seit 10.10.2026: Schalter „Nur meine Materialien" | „Auch Fachschaftsmaterial (n)" im Kopf der Bibliothek – Vorgabe nur
// die eigenen, Punkt am Schalter bei Neuem, Wahl je Gerät gemerkt; eine Suche, die nur bei der Fachschaft etwas findet,
// zeigt es trotzdem (mit Hinweis).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-fachschaft')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const DOC = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
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
    level: 'A2',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 7,
    vocabCount: 0,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: 'Weather',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  },
  vocab: [],
  variants: [{ id: 'A', label: 'A', blocks: [] }],
  fontSize: 12,
  createdAt: new Date().toISOString()
}
const STATS = { vocabCount: 0, includedCount: 0, hasTest: true, variantCount: 1, totalPoints: 0, language: 'en', subjectLabel: 'Englisch', grade: 7 }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext()
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const konto = async (name, faecher) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()
      if (!r.ok) throw new Error(`${channel}: ${r.error}`)
      return r.value
    }
    await api('settings:set', { eigeneFaecher: faecher })
    return { ...k, ctx, api, name }
  }
  const lea = await konto('Lea Englisch', ['englisch'])
  const ben = await konto('Ben Englisch', ['englisch'])
  const mia = await konto('Mia Mathe', ['mathematik'])
  const liste = async (wer) => (await (await wer.ctx.request.get(`${A}/server/fachschaft`, { headers: KOPF })).json()).eintraege

  // ---------- Lea gibt frei
  await lea.api('tests:save', { id: 'fs-test-1', name: 'Weather Unit 1', stats: STATS, payload: DOC })
  const fr = await (await lea.ctx.request.post(`${A}/server/fachschaft/freigeben`, { headers: KOPF, data: { art: 'vokabeltest', id: 'fs-test-1' } })).json()
  pruefe(fr.fach === 'englisch', `Fach aus dem Material erkannt: ${fr.label}`)
  const beiBen = await liste(ben)
  pruefe(beiBen.length === 1 && beiBen[0].titel === 'Weather Unit 1' && beiBen[0].vonName === 'Lea Englisch', 'Ben (Englisch) sieht die Freigabe')
  pruefe((await liste(mia)).length === 0, 'Mia (Mathematik) sieht sie nicht')
  await mia.ctx.request.post(`${A}/server/fachschaft/iserv-gruppen`, { headers: KOPF, data: { ordner: ['Klasse 7a', 'Englisch'] } })
  pruefe((await liste(mia)).length === 1, 'mit dem IServ-Gruppenordner „Englisch" sieht Mia sie auch')

  // ---------- Ben öffnet – ohne Änderung keine Kopie
  const auf = await (await ben.ctx.request.post(`${A}/server/fachschaft/oeffnen`, { headers: KOPF, data: { freigabe: beiBen[0].id } })).json()
  pruefe(auf.art === 'vokabeltest' && auf.id && auf.id !== 'fs-test-1', 'Öffnen: eigene Arbeitskopie im Hintergrund')
  pruefe((await ben.api('tests:list')).length === 0, 'unverändert: keine Kopie in Bens Bibliothek')
  const geladen = await ben.api('tests:get', auf.id)
  await ben.api('tests:save', { id: auf.id, name: geladen.name, stats: STATS, payload: geladen.payload })
  pruefe((await ben.api('tests:list')).length === 0, 'Speichern ohne Änderung legt keine Kopie an')
  // ---------- Ben ändert
  await ben.api('tests:save', {
    id: auf.id,
    name: geladen.name,
    stats: STATS,
    payload: { ...geladen.payload, settings: { ...geladen.payload.settings, topic: 'Weather – Ben' } }
  })
  const bens = await ben.api('tests:list')
  pruefe(bens.length === 1 && bens[0].name === 'Weather Unit 1 – Kopie Ben Englisch', `erste Änderung → eigene Kopie: „${bens[0]?.name}"`)
  // Nächstes Speichern unter dem alten Namen (so sendet es die Oberfläche): bleibt die Kopie
  await ben.api('tests:save', {
    id: auf.id,
    name: geladen.name,
    stats: STATS,
    payload: { ...geladen.payload, settings: { ...geladen.payload.settings, topic: 'Weather – Ben 2' } }
  })
  pruefe(
    (await ben.api('tests:list'))[0]?.name === 'Weather Unit 1 – Kopie Ben Englisch',
    'weiteres Speichern unter altem Namen: bleibt „… – Kopie Ben Englisch"'
  )
  const original = await lea.api('tests:get', 'fs-test-1')
  pruefe(original.payload.settings.topic === 'Weather', 'Leas Original bleibt unverändert')
  pruefe(
    (await liste(lea)).filter((e) => !e.eigen).length === 0 && (await liste(mia)).length === 1,
    'Bens Kopie sieht die Fachschaft nicht (nicht freigegeben)'
  )

  // ---------- Oberfläche bei Ben
  const p = await ben.ctx.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  // Seit 09.10.2026 (Entscheidung des Admins) kein Menü „Daten und Material" mehr: Lehrkräfte sehen „Schule & Daten" nicht,
  // die Freigaben stehen in der Bibliothek der App – und die Leiste zählt, was noch nicht angesehen ist
  pruefe((await p.locator('.app-leiste [aria-label="Schule & Daten"]').count()) === 0, 'Lehrkraft: keine App „Schule & Daten"')
  pruefe(
    await p
      .locator('.app-leiste [aria-label="Vokabeltest"] [data-fachschaft-neu]')
      .first()
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Leiste: Zahl „neu von der Fachschaft" am Vokabeltest'
  )
  await p.locator('.app-leiste [aria-label="Vokabeltest"]').click()
  await p
    .getByRole('button', { name: /Meine Vokabeltests/ })
    .first()
    .click()
    .catch(() => undefined)
  const fl = p.locator('[data-fachschaftsliste]').filter({ visible: true })
  const schalter = p.locator('[data-fachschaft-schalter]').filter({ visible: true })
  const kommt = (l) =>
    l.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    )
  pruefe(await kommt(schalter), 'Bibliothek: Schalter „Nur meine Materialien | Auch Fachschaftsmaterial"')
  pruefe((await schalter.getAttribute('data-fachschaft-schalter')) === 'nur', 'Vorgabe: nur die eigenen Materialien')
  pruefe((await schalter.innerText()).includes('Auch Fachschaftsmaterial (1)'), 'Schalter nennt die Zahl: „Auch Fachschaftsmaterial (1)"')
  pruefe((await schalter.locator('[data-fachschaft-schalter-neu]').count()) === 1, 'Punkt am Schalter: Neues von der Fachschaft')
  pruefe((await fl.count()) === 0, 'Vorgabe: „Von der Fachschaft" ausgeblendet')
  await p.screenshot({ path: join(out, '1-bibliothek.png') })
  // ⋯ an Bens Kopie: freigeben
  const eintrag = p.getByText('Weather Unit 1 – Kopie Ben Englisch').first()
  pruefe(await eintrag.isVisible(), 'Bens Kopie steht in seiner Bibliothek')
  // Suche, die nur bei der Fachschaft etwas findet: erscheint trotzdem – mit Hinweis
  const suche = p.getByLabel('Meine Vokabeltests durchsuchen')
  await suche.fill('Lea Englisch')
  pruefe(await kommt(p.locator('[data-nur-fachschaft-treffer]')), 'Suche nur mit Fachschafts-Treffern: Hinweis')
  pruefe((await p.locator('[data-bibliothek-leer]').filter({ visible: true }).count()) === 0, 'Darunter kein „Nichts gefunden“ (10.10.2026)')
  pruefe(await kommt(fl.locator('[data-freigabe-oeffnen]')), '… und der Treffer von der Fachschaft')
  await p.screenshot({ path: join(out, '1b-suche.png') })
  await suche.fill('')
  await p.waitForTimeout(300)
  pruefe((await fl.count()) === 0, 'Suche geleert: wieder ausgeblendet')

  // Einblenden: Liste erscheint aufgeklappt, „neu" verschwindet
  await schalter.locator('[data-fachschaft-schalter-auch]').click()
  pruefe(await kommt(fl), 'Eingeblendet: „Von der Fachschaft"')
  await p.waitForTimeout(300)
  pruefe((await fl.locator('[data-fachschaft-neu]').count()) === 0, 'eingeblendet und aufgeklappt: „neu" verschwindet')
  pruefe((await schalter.locator('[data-fachschaft-schalter-neu]').count()) === 0, '… auch der Punkt am Schalter')
  pruefe(await p.evaluate(() => localStorage.getItem('schulapps-fachschaft-einblenden') === '1'), 'Wahl je Gerät gemerkt')
  pruefe((await p.locator('.app-leiste [aria-label="Vokabeltest"] [data-fachschaft-neu]').count()) === 0, 'aufgeklappt: Zahl in der Leiste verschwindet')
  await fl.locator('[data-freigabe-oeffnen]').first().click()
  await p.waitForTimeout(4000)
  await p.screenshot({ path: join(out, '2-geoeffnet.png') })
  pruefe((await ben.api('tests:list')).length === 1, 'Öffnen und Ansehen in der Oberfläche legt keine weitere Kopie an')

  // ---------- Zurücknehmen
  await lea.ctx.request.post(`${A}/server/fachschaft/zuruecknehmen`, { headers: KOPF, data: { art: 'vokabeltest', id: 'fs-test-1' } })
  pruefe((await liste(ben)).length === 0, 'Zurücknehmen: Ben sieht die Freigabe nicht mehr')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
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
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
