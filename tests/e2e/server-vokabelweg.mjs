// Vokabelweg (03.10.2026, abgestimmt): Lehrwerk-Leiter, Freischalten ab 80 % in Fach 2, gemeinsamer Kasten.
// Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet. Es wird keine KI gebraucht.
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
const KLASSE = `6w${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const buch = JSON.parse(readFileSync('resources/lehrwerke/green-line-2.json', 'utf8'))
const abschnitte = buch.units.flatMap((u) => u.sections.filter((s) => s.entries.length).map((s) => ({ unit: u.name, section: s.name, entries: s.entries })))
const [a0, a1] = abschnitte

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea T' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)
  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const g = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  // Lehrkraft gibt den ersten Abschnitt frei – wie der Dialog, mit Herkunft
  const zu = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: {
        lerngruppeId: g.id,
        titel: `Green Line 2 - ${a0.unit} - ${a0.section}`,
        sprache: 'en',
        fach: 'Englisch',
        woerter: a0.entries.map((e, i) => ({ id: `w${i}`, term: e.term, translation: e.translation })),
        quelle: { lehrwerk: 'green-line-2', unit: a0.unit, abschnitte: [a0.section] }
      }
    })
  ).json()
  pruefe(Boolean(zu.id), `Abschnitt freigegeben (${a0.unit} · ${a0.section}, ${a0.entries.length} Wörter)`)

  const sm = await browser.newContext({ viewport: { width: 1024, height: 1100 } })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const weg = async () => (await (await sm.request.get(`${A}/s/api/vokabelweg`, { headers: KOPF })).json()).wege[0]
  let w = await weg()
  pruefe(Boolean(w) && w.band === 'Green Line 2', `Vokabelweg Green Line 2 (${w?.stufen?.length} Abschnitte)`)
  pruefe(w.stufen[0].frei && w.stufen[0].grund === 'zugewiesen' && !w.stufen[1].frei, 'Zugewiesener Abschnitt frei, der nächste gesperrt')

  // Leiter im Browser, erster Besuch (merkt sich den Stand)
  const s = await sm.newPage()
  await s.goto(`${A}/s/lernen`)
  pruefe(await da(s.locator('[data-vokabelweg-karte]')), 'Lernraum zeigt den Vokabelweg')
  await s.locator('[data-vokabelweg-karte]').first().click()
  pruefe(await da(s.locator('[data-vokabelweg]')), 'Freischalt-Leiste im Kasten')
  pruefe(
    (await s.locator('[data-vw-stufe="zu"]').count()) >= 1 && (await s.locator('[data-vw-aktuell]').count()) === 1,
    'Gesperrte Abschnitte und aktueller Abschnitt'
  )
  await s.screenshot({ path: join(out, '1-weg.png'), fullPage: true })

  // Lernen: jedes Wort einmal als Karte gewusst (Fach 1), dann frei geschrieben (Fach 2)
  const key = `lb:${w.key}`
  const kasten = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${encodeURIComponent(key)}`, { headers: KOPF })).json()
  const zugewiesene = kasten.woerter.filter((v) => v.id.startsWith('z:'))
  pruefe(zugewiesene.length === a0.entries.length, `Gemeinsamer Kasten enthält die zugewiesenen Wörter (${zugewiesene.length})`)
  for (const v of zugewiesene) {
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: key, wortId: v.id, uebung: 'karte', gewusst: true } })
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: key, wortId: v.id, uebung: 'frei', antwort: v.term } })
  }
  w = await weg()
  pruefe(w.stufen[0].gelernt && w.stufen[1].frei && w.stufen[1].grund === 'gelernt', `Gelernt → ${a1.unit} · ${a1.section} freigeschaltet`)
  const kasten2 = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${encodeURIComponent(key)}`, { headers: KOPF })).json()
  pruefe(
    kasten2.woerter.some((v) => v.id.startsWith('b:')),
    `Neue Wörter aus dem freigeschalteten Abschnitt im Kasten (${kasten2.woerter.filter((v) => v.id.startsWith('b:')).length})`
  )
  // Lehrwerkswort lernen: Stand des Vokabelwegs
  const b = kasten2.woerter.find((v) => v.id.startsWith('b:'))
  const r = await (
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: key, wortId: b.id, uebung: 'karte', gewusst: true } })
  ).json()
  pruefe(r.urteil === 'richtig' && r.stand.fach === 1, 'Lehrwerkswort im Vokabelweg geübt')
  // Die Zuweisung selbst zählt mit (gleicher Stand in der Liste)
  const listeStand = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${zu.id}`, { headers: KOPF })).json()
  pruefe(
    Object.values(listeStand.staende).every((x) => x.fach >= 2),
    'Übung im Weg zählt in der zugewiesenen Liste mit'
  )

  // Zweiter Besuch: Feier für den neu freigeschalteten Abschnitt
  await s.goto(`${A}/s/vw/${encodeURIComponent(w.key)}`)
  pruefe(await da(s.locator('[data-vw-neu]')), 'Neu freigeschaltet wird gefeiert')
  await s.screenshot({ path: join(out, '2-freigeschaltet.png'), fullPage: true })
  await lk.request.post(`${A}/server/vokabeln/${zu.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
