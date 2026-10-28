// Unterthemen der Grammatik im Kurs (28.10.2026, Wunsch der Lehrkraft: bei den Modalverben in Klasse 5 nur can/can't
// freischalten). Lehrkraft weist „Modalverben (Grundinventar)" aus der Aufgabenbank zu, wählt im Optionsmenü
// „Unterthemen wählen …" nur can/can't – das Paket enthält danach nur deren Aufgaben, die Aufgabenbank bleibt gleich.
// Im Optionsmenü steht nur noch „Entfernen" (kein „Endgültig löschen"). Im Dialog „Grammatik hinzufügen" stehen die
// Teilformen im Kurs auch im Standardmodus zur Wahl.
// Vorher: Server lokal (Grundbestand der Aufgabenbank). Aufruf: node tests/e2e/server-grammatik-unterthemen.mjs <Ausgabe> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { readFileSync } from 'fs'
import { kursKaestenAuf, kursReiter, leisteApp } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-grammatik-unterthemen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  console.log(`${ok ? 'ok' : '!!'} ${text}`)
  if (!ok) problems.push(text)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 15000) =>
  l
    .first()
    .waitFor({ timeout: ms })
    .then(() => true)
    .catch(() => false)
const THEMA = 'en.verb.modals_basic'
const CAN = `${THEMA}/can`

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let kurs = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Uta Unterthema' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)

  // Testserver laufen ohne Grundbestand (SCHULAPPS_GRUNDBESTAND=0): drei Teilbereiche der Modalverben anlegen, falls leer
  const vorhanden = (await (await lk.request.get(`${A}/server/grammatik-bank?sprache=en`, { headers: KOPF })).json()).zahlen ?? {}
  for (const [teil, wort, falsch] of [
    ['can', 'can', 'cans'],
    ['must', 'must', 'musts'],
    ['mustnt', "mustn't", 'not must']
  ]) {
    const k = `${THEMA}/${teil}`
    if (vorhanden[k]) continue
    const aufgaben = ['erkennen', 'bilden', 'anwenden'].flatMap((uebung) =>
      [1, 2, 3].map((i) => ({
        art: 'auswahl',
        uebung,
        anweisung: 'Wähle die richtige Form.',
        satz: `Satz ${uebung} ${i}: I ___ swim.`,
        optionen: [wort, falsch],
        loesungen: [wort]
      }))
    )
    const r0 = await verwaltung.request.post(`${A}/server/grammatik-bank/speichern`, {
      headers: KOPF,
      data: { sprache: 'en', schluessel: k, regel: { titel: wort, erklaerung: `Regel zu ${wort}.`, beispiele: [`I ${wort} swim.`] }, aufgaben }
    })
    if (!r0.ok()) console.log('!! Bank anlegen:', r0.status(), await r0.text())
  }
  const zahlen = (await (await lk.request.get(`${A}/server/grammatik-bank?sprache=en`, { headers: KOPF })).json()).zahlen ?? {}
  const kern = (k) => ['erkennen', 'bilden', 'anwenden'].reduce((n, u) => n + (zahlen[k]?.[u] ?? 0), 0)
  const teile = Object.keys(zahlen).filter((k) => k.startsWith(`${THEMA}/`))
  pruefe(kern(CAN) > 0 && teile.length >= 3, `Aufgabenbank hat Modalverben mit Teilbereichen (${teile.length}, can: ${kern(CAN)})`)
  const bankVorher = teile.reduce((n, k) => n + kern(k), 0)

  kurs = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: { titel: 'Unterthemen-Kurs', sprache: 'en', fach: 'Englisch', woerter: [], nurGrammatik: true, gaeste: true }
      })
    ).json()
  ).id
  // Ein Vokabelabschnitt aus Green Line 1, Unit 1 – damit der Kasten „Units“ im Überblick die Unit (mit der Grammatik) zeigt
  {
    const gl1 = JSON.parse(readFileSync('resources/lehrwerke/green-line-1.json', 'utf8'))
    const u1 = gl1.units.find((u) => u.name === 'Unit 1') ?? gl1.units[1]
    const sec = u1.sections.find((x) => x.entries.length)
    await lk.request.post(`${A}/server/vokabeln/${kurs}/woerter`, {
      headers: KOPF,
      data: {
        titel: sec.name,
        woerter: sec.entries.slice(0, 8).map((e, i) => ({ id: `u${i}`, term: e.term, translation: e.translation })),
        teile: [{ titel: sec.name, anzahl: Math.min(8, sec.entries.length) }],
        quelle: { lehrwerk: 'green-line-1', unit: u1.name, abschnitte: [sec.name] }
      }
    })
  }
  const r = await (
    await lk.request.post(`${A}/server/grammatik/aus-bank`, {
      headers: KOPF,
      data: { vokId: kurs, formen: [{ thema: THEMA, titel: 'Modalverben (Grundinventar)', teile }], info: { jahrgang: 5 } }
    })
  ).json()
  const zid = r.ids?.[0] ?? ''
  if (!zid) console.log('!! aus-bank:', kurs, JSON.stringify(r), JSON.stringify(Object.keys(zahlen)))
  pruefe(Boolean(zid), 'Modalverben aus der Aufgabenbank zugewiesen')
  const zeile = async () => (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen.find((z) => z.id === zid)
  const vorher = await zeile()
  pruefe(vorher?.bank && vorher.teile?.length === teile.length, `Liste nennt die Teilbereiche (${vorher?.teile?.length})`)

  // ---------- Oberfläche im Standardmodus
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await (await leisteApp(p, 'Sprachenlernen')).click()
  await p.locator(`[data-vokabel-zuweisung="${kurs}"]`).click()
  await kursKaestenAuf(p)
  pruefe(await da(p.locator(`[data-grammatik-zeile="${zid}"]`)), 'Grammatik in der Tabelle des Kurses')
  await p.locator(`[data-grammatik-aktionen="${zid}"]`).click()
  pruefe(await da(p.locator('[data-grammatik-entfernen]')), 'Optionsmenü: „Entfernen"')
  pruefe((await p.locator('[data-grammatik-loeschen]').count()) === 0, 'Optionsmenü ohne „Endgültig löschen"')
  await p.locator(`[data-grammatik-unterthemen="${zid}"]`).click()
  pruefe(await da(p.locator('[data-unterthemen-fenster]')), 'Fenster „Unterthemen" öffnet')
  const kaestchen = p.locator('[data-unterthemen-fenster] [data-unterthema]')
  await da(kaestchen)
  pruefe((await kaestchen.count()) >= teile.length, `alle Teilbereiche der Form zur Wahl (${await kaestchen.count()})`)
  await p.locator('[data-unterthemen-keine]').click()
  pruefe(await p.locator('[data-unterthemen-speichern]').isDisabled(), 'Ohne Auswahl lässt sich nicht speichern')
  await p.locator(`[data-unterthema="${CAN}"]`).check()
  // Abgewählte Unterthemen ohne hinterlegte Aufgaben lassen sich wieder anhaken (Befund der Lehrkraft 28.10.2026)
  const ohne = p.locator('[data-unterthemen-fenster] [data-unterthema]').last()
  await ohne.check()
  pruefe(await ohne.isChecked(), 'Unterthema ohne Aufgaben wieder anhakbar')
  await ohne.uncheck()
  await p.waitForTimeout(400)
  pruefe((await p.locator('[data-unterthemen-fenster] [data-unterthema]:checked').count()) === 1, 'nur ein Häkchen gesetzt')
  await p.screenshot({ path: join(out, '1-unterthemen.png') })
  await p.locator('[data-unterthemen-speichern]').click()
  await p.waitForTimeout(1500)
  const nachher = await zeile()
  pruefe(nachher?.teile?.length === 1 && nachher.teile[0] === CAN, `nur can/can't gewählt (${nachher?.teile?.join(', ')})`)
  pruefe(nachher && vorher && nachher.aufgaben < vorher.aufgaben, `weniger Aufgaben im Kurs (${vorher?.aufgaben} → ${nachher?.aufgaben})`)
  const paket = (await (await lk.request.get(`${A}/server/grammatik/${zid}`, { headers: KOPF })).json()).paket
  pruefe(paket?.regeln?.length === 1, `Paket hat nur die Regelkarte von can/can't (${paket?.regeln?.length})`)
  const zahlen2 = (await (await lk.request.get(`${A}/server/grammatik-bank?sprache=en`, { headers: KOPF })).json()).zahlen ?? {}
  const bankNachher = teile.reduce((n, k) => n + ['erkennen', 'bilden', 'anwenden'].reduce((m, u) => m + (zahlen2[k]?.[u] ?? 0), 0), 0)
  pruefe(bankNachher === bankVorher, `Aufgabenbank unverändert (${bankVorher} → ${bankNachher})`)
  // Fremde Teilbereiche werden abgewiesen
  const fremd = await lk.request.post(`${A}/server/grammatik/${zid}/teilbereiche`, { headers: KOPF, data: { teile: ['en.verb.past_simple/fragen'] } })
  pruefe(fremd.status() === 400, `Teilbereich einer anderen Form abgewiesen (${fremd.status()})`)

  // ---------- „Aufgaben ansehen": alle Aufgaben des Kurses wie bei Lernenden, mit Lösung, ohne „Prüfen"
  await p.locator(`[data-grammatik-aktionen="${zid}"]`).click()
  await p.locator(`[data-grammatik-ansehen="${zid}"]`).click()
  pruefe(await da(p.locator('[data-aufgaben-ansicht] [data-ansicht-aufgabe]')), 'Fenster „Aufgaben ansehen" zeigt Aufgaben')
  const gezeigt = await p.locator('[data-aufgaben-ansicht] [data-ansicht-aufgabe]').count()
  pruefe(gezeigt === nachher?.aufgaben, `alle Aufgaben des Kurses untereinander (${gezeigt} von ${nachher?.aufgaben})`)
  pruefe((await p.locator('[data-aufgaben-ansicht] [data-ansicht-loesung]').count()) === gezeigt, 'jede Aufgabe mit Lösung')
  pruefe((await p.locator('[data-aufgaben-ansicht] [data-pruefen]').filter({ visible: true }).count()) === 0, 'kein „Prüfen" in der Ansicht')
  pruefe((await p.locator('[data-aufgaben-ansicht] [data-ansicht-etappe]').count()) >= 3, 'nach Etappen gegliedert')
  pruefe((await p.locator('[data-aufgaben-ansicht] [data-aufgabe="auswahl"] button').count()) > 0, 'Auswahl-Knöpfe wie bei Lernenden')
  await p.screenshot({ path: join(out, '1b-ansehen.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)

  // ---------- Entfernen aktualisiert den Kasten „Units“ ohne Neuladen (Befund der Lehrkraft 28.10.2026)
  await kursReiter(p, 'ueberblick')
  const imUnitMenue = async () => {
    const knopf = p.locator('[data-kurs-units] [data-unit-abschnitt-aktionen]').first()
    if (!(await da(knopf, 8000))) return false
    await knopf.click()
    const da2 = await da(p.locator('[data-unit-grammatik-entfernen="Modalverben (Grundinventar)"]'), 2000)
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
    return da2
  }
  const warDa = await imUnitMenue()
  await kursReiter(p, 'grammatik')
  await p.locator(`[data-grammatik-aktionen="${zid}"]`).click()
  await p.locator('[data-grammatik-entfernen]').click()
  await p.locator('[data-grammatik-bestaetigen="entfernen"]').click()
  await p.waitForTimeout(1200)
  await kursReiter(p, 'ueberblick')
  await p.waitForTimeout(800)
  const nochDa = await imUnitMenue()
  pruefe(warDa && !nochDa, `„Units“: entfernte Grammatik verschwindet ohne Neuladen (vorher ${warDa}, danach ${nochDa})`)
  await p.screenshot({ path: join(out, '1c-units-nach-entfernen.png') })
  // Wieder in den Kurs holen (für die folgenden Schritte)
  await lk.request.post(`${A}/server/grammatik/${zid}/wiederherstellen`, { headers: KOPF, data: {} })
  await kursReiter(p, 'grammatik')

  // ---------- „Grammatik hinzufügen": Teilformen auch im Standardmodus
  await p.locator('[data-vokabel-grammatik]').first().click()
  const fach = p.locator('[data-grammatik-fach]')
  if (await fach.isVisible().catch(() => false)) {
    await fach.click()
    await p.getByRole('option', { name: 'Englisch', exact: true }).click()
  }
  await da(p.locator('[data-grammatik-thema] [data-thema]'), 20000)
  await p.locator('[data-grammatik-thema] [data-thema]').first().click()
  pruefe(await da(p.locator('[data-grammatik-thema] [data-thema-detail]')), 'Im Kurs: Teilformen rechts auch im Standardmodus')
  await p.screenshot({ path: join(out, '2-hinzufuegen.png') })
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  if (kurs && lk) {
    const l = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json().catch(() => ({ zuweisungen: [] }))).zuweisungen ?? []
    for (const z of l.filter((x) => x.vokId === kurs)) await lk.request.post(`${A}/server/grammatik/${z.id}/loeschen`, { headers: KOPF, data: {} }).catch(() => null)
    await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => null)
  }
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
