// Material aus Unterrichtsreihen in den Bibliotheken (09.10.2026, shared/reiheMaterial.ts): zunächst ausgeblendet
// (Bibliothek, „Zuletzt bearbeitet"), Schalter „Material aus Unterrichtsreihen einblenden (n)" im Kopf, Marke
// „Reihe: <Titel>", Suche mit nur Reihen-Treffern zeigt sie mit Hinweis; Reihe löschen mit Rückfrage „Zugehöriges
// Material ebenfalls löschen? (n Dokumente)" – „Nur die Reihe löschen" macht das Material wieder sichtbar,
// „Reihe und Material löschen" entfernt es aus der Ablage. Ohne KI.
// Seit 10.10.2026: Ausgeblendet wird nur, was FÜR die Reihe entstanden ist (Marke `inhalt.erzeugt`, Altbestand am Namen
// „<Reihe> – <Schritt>"); ein eigenes Blatt, das in eine Reihe geholt wurde, bleibt sichtbar (mit Marke „Reihe: …").
// Vorher: Server lokal (KI-Attrappe genügt).
// Aufruf: node tests/e2e/server-reihe-material.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-reihe-material')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const N = Date.now() % 10000
const R1 = `Weltkrieg Probe ${N}`
const R2 = `Julikrise Probe ${N}`
const BLATT = {
  aus1: { id: `rm-a-${N}`, name: `${R1} – Ursachen` },
  aus2: { id: `rm-c-${N}`, name: `${R2} – Attentat` },
  eigen: { id: `rm-b-${N}`, name: `Eigenes Blatt ${N}` },
  // In die Reihe geholt (Marke erzeugt: false) bzw. Altbestand ohne Marke mit eigenem Namen – beide bleiben sichtbar
  geholt: { id: `rm-d-${N}`, name: `Quellenarbeit ${N}` },
  altEigen: { id: `rm-e-${N}`, name: `Karikaturen ${N}` }
}
const payload = (titel) => ({
  version: 1,
  meta: { title: titel, topic: titel, subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 },
  design: {},
  outline: null,
  sheets: [],
  sources: [],
  createdAt: new Date().toISOString()
})
const schritt = (id, quelle, extra = {}) => ({
  id,
  titel: `Blatt ${id}`,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: { art: 'abgabe' },
  inhalt: { art: 'arbeitsblatt', quelle, titel: 'Blatt', html: '', aufgaben: [], vorlage: null, runden: 1, stift: false, ...extra }
})
const reihe = (titel, quelle, weitere = [], extra = {}) => ({
  id: '',
  titel,
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 9,
  oberthema: 'Erster Weltkrieg',
  lernziele: [],
  art: 'digital',
  schritte: [schritt('a', quelle, extra), ...weitere]
})

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const reihenWeg = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk = null
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Rea Reihenprobe' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const api = async (channel, args = []) =>
    JSON.parse((await (await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).text()).trim()).value
  for (const b of Object.values(BLATT)) await api('sheets:save', [{ id: b.id, name: b.name, stats: { sheetCount: 0 }, payload: payload(b.name) }])
  // R1: Altbestand ohne Marke (Name „R1 – Ursachen" = erzeugt), dazu ein hereingeholtes und ein unklares eigenes Blatt
  const r1 = await (
    await lk.request.post(`${A}/server/reihen/speichern`, {
      headers: KOPF,
      data: { reihe: reihe(R1, BLATT.aus1.id, [schritt('b', BLATT.geholt.id, { erzeugt: false }), schritt('c', BLATT.altEigen.id)]) }
    })
  ).json()
  // R2: mit Marke „erzeugt"
  const r2 = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: reihe(R2, BLATT.aus2.id, [], { erzeugt: true }) } })).json()
  reihenWeg.push(r1.id, r2.id)
  const liste = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen
  pruefe(
    liste.find((r) => r.id === r1.id)?.material?.[0]?.docId === BLATT.aus1.id,
    'Liste der Reihen nennt das verknüpfte Material (Zuordnung aus den Schritten)'
  )
  const m1 = liste.find((r) => r.id === r1.id)?.material ?? []
  pruefe(
    m1.find((m) => m.docId === BLATT.geholt.id)?.erzeugt === false && m1.find((m) => m.docId === BLATT.altEigen.id)?.erzeugt === undefined,
    'Liste nennt die Herkunft: hereingeholt (false), Altbestand ohne Marke (offen)'
  )
  pruefe(liste.find((r) => r.id === r2.id)?.material?.[0]?.erzeugt === true, 'Liste nennt die Herkunft: erzeugt (true)')

  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  // Startseite: „Zuletzt bearbeitet" ohne Material aus Reihen
  await da(p.locator('.home-material').first())
  await p.waitForTimeout(1500)
  const zuletzt = await p.locator('.home-material').allInnerTexts()
  pruefe(zuletzt.some((t) => t.includes(BLATT.eigen.name)), '„Zuletzt bearbeitet“ zeigt das eigene Blatt')
  pruefe(zuletzt.some((t) => t.includes(BLATT.geholt.name)), '„Zuletzt bearbeitet“ zeigt das in die Reihe geholte eigene Blatt')
  pruefe(!zuletzt.some((t) => t.includes(BLATT.aus1.name) || t.includes(BLATT.aus2.name)), '„Zuletzt bearbeitet“ ohne Material aus Reihen')
  // Nur die Reihe als Ganzes (09.10.2026) – auch wenn Reihen-Material eingeblendet ist
  pruefe(zuletzt.some((t) => t.includes(R1)), '„Zuletzt bearbeitet“ zeigt die Reihe als Ganzes')
  await expertenmodus(p)

  // ---------- Bibliothek: ausgeblendet, Schalter (2), Marke
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p
    .getByRole('button', { name: /Meine Arbeitsblätter/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  await da(p.locator(`[data-bibliothek-eintrag="${BLATT.eigen.name}"]`))
  pruefe((await p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"]`).count()) === 0, 'Bibliothek: Blatt aus Reihe zunächst ausgeblendet')
  pruefe((await p.locator(`[data-bibliothek-eintrag="${BLATT.aus2.name}"]`).count()) === 0, 'Bibliothek: erzeugtes Blatt (Marke) ausgeblendet')
  // Eigenes Blatt, in die Reihe geholt: bleibt sichtbar – mit Marke „Reihe: …"
  const geholt = p.locator(`[data-bibliothek-eintrag="${BLATT.geholt.name}"]`)
  pruefe(await da(geholt), 'Bibliothek: in die Reihe geholtes eigenes Blatt bleibt sichtbar')
  pruefe((await geholt.locator(`[data-reihe-marke="${R1}"]`).count()) === 1, '… mit Marke „Reihe: …“')
  pruefe(await da(p.locator(`[data-bibliothek-eintrag="${BLATT.altEigen.name}"]`)), 'Bibliothek: Altbestand ohne Marke mit eigenem Namen bleibt sichtbar')
  const schalter = p.getByText('Material aus Unterrichtsreihen einblenden (2)')
  pruefe(await da(schalter), 'Schalter „Material aus Unterrichtsreihen einblenden (2)“ im Kopf')
  await p.screenshot({ path: join(out, '1-ausgeblendet.png'), fullPage: true })
  // Suche, die nur Reihen-Material findet: erscheint mit Hinweis
  await p.getByLabel('Meine Arbeitsblätter durchsuchen').fill(R1)
  pruefe(await da(p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"]`)), 'Suche mit nur Reihen-Treffern zeigt das Blatt')
  pruefe(await da(p.locator('[data-nur-reihe-treffer]')), '… mit Hinweis „Nur Treffer aus Unterrichtsreihen“')
  await p.getByLabel('Meine Arbeitsblätter durchsuchen').fill('')
  // Mantine-Schalter: das (unsichtbare) Eingabefeld liegt über der Beschriftung – direkt umschalten
  const schalterFeld = p.locator('[data-reihe-material-schalter]')
  await schalterFeld.check()
  pruefe(await da(p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"]`)), 'Eingeblendet: Blatt aus Reihe sichtbar')
  pruefe(await da(p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"] [data-reihe-marke="${R1}"]`)), `Marke „Reihe: ${R1}“ am Blatt`)
  await p.screenshot({ path: join(out, '2-eingeblendet.png'), fullPage: true })
  // Zurück auf „aus" (gilt je Gerät für alle Bibliotheken)
  await schalterFeld.uncheck()
  await p.waitForTimeout(300)
  pruefe((await p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"]`).count()) === 0, 'Wieder ausgeblendet')

  // ---------- Reihe löschen: Rückfrage mit drei Wegen
  const loeschen = async (titel) => {
    await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
    await p.mouse.move(800, 700)
    const karte = p.locator(`[data-reihe-karte="${titel}"]`)
    await karte.waitFor({ timeout: 15000 })
    await karte.getByRole('button', { name: 'Mehr' }).click()
    await p.locator('[data-reihe-loeschen]').click()
    await p.getByRole('dialog').waitFor({ timeout: 5000 })
  }
  await loeschen(R1)
  pruefe(await da(p.getByRole('dialog').getByText('Zugehöriges Material ebenfalls löschen? (1 Dokument)')), 'Rückfrage nennt das Material (1 Dokument)')
  pruefe((await p.locator('[data-reihe-loeschen-mit-material]').count()) === 1, 'Weg „Reihe und Material löschen“')
  pruefe((await p.locator('[data-reihe-loeschen-abbrechen]').count()) === 1, 'Weg „Abbrechen“')
  await p.screenshot({ path: join(out, '3-loeschen.png') })
  await p.locator('[data-reihe-loeschen-nur-reihe]').click()
  await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 })
  const nachher1 = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen
  pruefe(!nachher1.some((r) => r.id === r1.id), '„Nur die Reihe löschen“: Reihe weg')
  pruefe(((await api('sheets:list')) ?? []).some((b) => b.id === BLATT.aus1.id), '… Blatt bleibt in der Ablage')
  pruefe(((await api('sheets:list')) ?? []).some((b) => b.id === BLATT.geholt.id), '… hereingeholtes Blatt ebenso')

  await loeschen(R2)
  await p.locator('[data-reihe-loeschen-mit-material]').click()
  await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 })
  const nachher2 = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen
  pruefe(!nachher2.some((r) => r.id === r2.id), '„Reihe und Material löschen“: Reihe weg')
  pruefe(!((await api('sheets:list')) ?? []).some((b) => b.id === BLATT.aus2.id), '… Blatt aus der Ablage gelöscht')

  // Bibliothek: das Blatt der nur gelöschten Reihe ist gewöhnliches Material, kein Schalter mehr
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p
    .getByRole('button', { name: /Meine Arbeitsblätter/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  pruefe(await da(p.locator(`[data-bibliothek-eintrag="${BLATT.aus1.name}"]`)), 'Blatt der gelöschten Reihe wieder sichtbar')
  pruefe((await p.locator('[data-reihe-material-schalter]').count()) === 0, 'Ohne Reihen-Material kein Schalter')
  await p.screenshot({ path: join(out, '4-nachher.png'), fullPage: true })
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  if (lk) {
    for (const id of reihenWeg) await lk.request.post(`${A}/server/reihen/${id}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
    for (const b of Object.values(BLATT))
      await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'sheets:delete', args: [b.id] } }).catch(() => undefined)
  }
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
