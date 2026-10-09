// Zusammen spielen (08.10.2026, Plan refactored-wishing-iverson): Lobby mit Einladungscode, Beitritt nur aus demselben
// Kurs, Host entfernt, Schwierigkeit, Team-Match im Browser mit drei Geräten (die richtige Antwort liegt nur auf einem),
// Tauziehen über die Schnittstelle, jedes angebotene Spiel einmal gestartet (Vokabeln und Grammatik), Ergebnis im
// Rekordbuch, Achievement „Erste Teamrunde", Verbindungsabbruch in der Lobby.
// Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet. Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-mehrspieler.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-mehrspieler')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6m${Date.now() % 1000}`
const ANDERE = `6n${Date.now() % 1000}`
const PAARE = [
  ['weather', 'Wetter', 'The weather is nice today.'],
  ['sunny', 'sonnig', 'It is a sunny day in May.'],
  ['cloud', 'Wolke', 'There is a big cloud over the town.'],
  ['rain', 'Regen', 'Do you like the rain in autumn?'],
  ['wind', 'Wind', 'The wind is very strong today.'],
  ['snow', 'Schnee', 'We play in the snow every winter.'],
  ['storm', 'Sturm', 'Is there a storm on the coast?'],
  ['dog', 'Hund', 'My dog runs in the park.'],
  ['garden', 'Garten', 'We have a small garden behind the house.'],
  ['grandma', 'Oma', 'My grandma lives in London.'],
  ['granny', 'Großmutter', 'Granny makes great cakes.'],
  ['street', 'Straße', 'The street is very long.'],
  ['sea', 'Meer', 'The sea is blue and cold.'],
  ['train', 'Zug', 'The train leaves at nine.'],
  ['tent', 'Zelt', 'We sleep in a tent in summer.'],
  ['ticket', 'Fahrkarte', 'I need a ticket for the train.'],
  ['big', 'groß', 'London is a big city.'],
  ['small', 'klein', 'My room is small but nice.'],
  ['sad', 'traurig', 'Why are you so sad today?'],
  ['glad', 'froh', 'I am glad you are here.'],
  ['bridge', 'Brücke', 'The bridge is very old.'],
  ['shop', 'Laden', 'The shop opens at eight.']
]
const WOERTER = PAARE.map(([term, translation, example], i) => ({ id: `w${i}`, term, translation, example, exampleTranslation: `Beispiel ${i}` }))
const DE = Object.fromEntries(WOERTER.map((w) => [w.term, w.translation]))
const FS = Object.fromEntries(WOERTER.map((w) => [w.translation, w.term]))
const PAKET = {
  thema: 'Simple past',
  regeln: [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes.', beispiele: ['I played.'] }],
  aufgaben: Array.from({ length: 11 }, (_, i) => ({
    id: `a${i + 1}`,
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle die richtige Form.',
    satz: `Yesterday I ___ football with friend number ${i}.`,
    optionen: ['played', 'play', 'plays'],
    loesungen: ['played']
  }))
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
const kurse = []
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kai Z' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nBen Test\nLea Muster' } })
  ).json()
  const fremd = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: ANDERE, namen: 'Tom Fremd' } })).json()
  const konten = [...liste.angelegt, ...fremd.angelegt]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (konten.some((k) => k.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })
  const g2 = await post('/server/lerngruppen/anlegen', { name: ANDERE, fach: 'Englisch', iservGruppe: `klasse:${ANDERE}` })
  const vok = await post('/server/vokabeln/freigeben', { lerngruppeId: g.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
  const vok2 = await post('/server/vokabeln/freigeben', { lerngruppeId: g2.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
  kurse.push(vok.id, vok2.id)
  for (const id of [vok.id, vok2.id]) await post(`/server/vokabeln/${id}/spiele`, { frei: true })
  const gram = await post('/server/grammatik/freigeben', { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: vok.id })

  // Lernende: anmelden, Passwort setzen, alle Wörter einmal kennenlernen, Grammatik durcharbeiten
  const ctx = {}
  for (const k of konten) {
    const c = await browser.newContext({ viewport: { width: 820, height: 1100 }, hasTouch: true })
    await anmelden(c, k.benutzer, k.passwort)
    await c.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
    const kurs = liste.angelegt.includes(k) ? vok.id : vok2.id
    for (const w of WOERTER) await c.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kurs, wortId: w.id, uebung: 'karte', gewusst: true } })
    if (liste.angelegt.includes(k) && gram.id)
      for (const a of PAKET.aufgaben) await c.request.post(`${A}/s/api/grammatik/antwort`, { headers: KOPF, data: { id: gram.id, aufgabeId: a.id, antwort: 'played' } })
    ctx[k.name.split(' ')[0]] = c
  }
  const { Mia, Ben, Lea, Tom } = ctx
  const api = (c) => ({
    get: async (pfad) => {
      const r = await c.request.get(`${A}${pfad}`, { headers: KOPF })
      return { status: r.status(), ...(await r.json().catch(() => ({}))) }
    },
    post: async (pfad, data) => {
      const r = await c.request.post(`${A}${pfad}`, { headers: KOPF, data })
      return { status: r.status(), ...(await r.json().catch(() => ({}))) }
    }
  })

  // ---------- Angebot: Kooperativ und Versus für den Kurs
  const angebot = await api(Mia).get(`/s/api/spiel/angebot?bereich=vok&kurs=${vok.id}&stimme=1`)
  const ids = (angebot.spiele ?? []).map((s) => s.id)
  pruefe(angebot.frei === true && ids.includes('teammatch') && ids.includes('tauziehen'), `Angebot für Klasse 6: ${ids.join(', ')}`)
  pruefe(!ids.includes('kollokation') && !ids.includes('umbau'), 'Spiele außerhalb des Jahrgangsbands (Klasse 6 ± 1) ausgeblendet')
  // 09.10.2026: Spielnamen nur in der Zielsprache des Kurses (Englisch)
  const tm = (angebot.spiele ?? []).find((s) => s.id === 'teammatch')
  pruefe(tm?.name === 'Team Match' && !/[äöüß]/.test(tm?.beschreibung ?? ''), `Spielname/Regel auf Englisch (${tm?.name}: ${tm?.beschreibung})`)

  // ---------- Team-Match im Browser: Mia eröffnet über die Spielauswahl
  const mia = await Mia.newPage()
  await mia.goto(`${A}/s/v/${vok.id}`)
  pruefe(await da(mia.locator('[data-mehr-gruppe="koop"]')), 'Spielauswahl zeigt „Kooperativ"')
  pruefe(await da(mia.locator('[data-mehr-gruppe="versus"]')), 'Spielauswahl zeigt „Versus"')
  await mia.locator('[data-spiel-gruppe-kopf="koop"]').click()
  await mia.locator('[data-mehr-wahl="teammatch"]').click()
  await mia.waitForURL(/\/s\/sp\/\d{6}/, { timeout: 15000 })
  const code = /\/s\/sp\/(\d{6})/.exec(mia.url())[1]
  pruefe(await da(mia.locator('[data-mehr-code-anzeige]', { hasText: code })), `Lobby zeigt den Einladungscode ${code}`)
  await mia.screenshot({ path: join(out, '1-lobby.png') })

  // Ben: über „Mit Code öffnen" (Code-Seite), Lea: über das Feld „Einladungscode" in der Spielauswahl
  const ben = await Ben.newPage()
  await ben.goto(`${A}/s/tests?code=${code}`)
  await ben.waitForURL(/\/s\/sp\/\d{6}/, { timeout: 15000 })
  pruefe(await da(ben.locator('[data-mehr-lobby]')), 'Ben: „Mit Code öffnen" erkennt den Spielcode → Lobby')
  const lea = await Lea.newPage()
  await lea.goto(`${A}/s/v/${vok.id}`)
  // Einladungscode ganz oben im Spielbereich, ohne Kooperativ aufzuklappen; Enter tritt bei (09.10.2026)
  await lea.locator('[data-mehr-einladung]').fill(code)
  pruefe((await lea.locator('[data-mehr-einladung]').count()) === 1, 'Ein Feld „Einladungscode" oben im Spielbereich')
  await lea.locator('[data-mehr-einladung]').press('Enter')
  pruefe(await da(lea.locator('[data-mehr-lobby]')), 'Lea: Einladungscode in der Spielauswahl → Lobby')
  pruefe(await da(mia.locator('[data-mehr-spieler]').nth(2)), 'Host sieht drei Beigetretene')
  const namen = await mia.locator('[data-mehr-spieler]').evaluateAll((e) => e.map((x) => x.getAttribute('data-mehr-spieler')))
  pruefe(namen.every((n) => /^\p{L}+ \p{L}{1,3}\.$/u.test(n)), `Kurznamen statt voller Namen (${namen.join(', ')})`)

  // Fremder Kurs wird abgewiesen
  const tom = await api(Tom).post('/s/api/spiel/beitreten', { code })
  pruefe(tom.status === 403, `Lernender aus einem anderen Kurs wird abgewiesen (${tom.status})`)

  // Host entfernt Lea – sie kommt nicht wieder hinein
  await mia.locator('[data-mehr-spieler="Lea M."] [data-mehr-entfernen]').click()
  await mia.waitForTimeout(800)
  pruefe((await mia.locator('[data-mehr-spieler]').count()) === 2, 'Host entfernt eine Person')
  const wieder = await api(Lea).post('/s/api/spiel/beitreten', { code })
  pruefe(wieder.status === 403, 'Entfernte Person kann nicht wieder beitreten')

  // Schwierigkeit „leicht" → Frage in der Fremdsprache, Möglichkeiten auf Deutsch
  await mia.locator('[data-mehr-schwierigkeit]').getByText('Easy').click()
  await mia.waitForTimeout(400)
  await mia.locator('[data-mehr-start]').click()
  pruefe(await da(mia.locator('[data-mehr-frage]')), 'Spiel startet bei allen')
  pruefe(await da(ben.locator('[data-mehr-frage]')), 'Ben sieht dieselbe Frage')
  await mia.screenshot({ path: join(out, '2-teammatch.png') })
  let einmalig = true
  for (let i = 0; i < 20 && !(await mia.locator('[data-mehr-ergebnis]').isVisible()); i++) {
    const frage = (await mia.locator('[data-mehr-frage-text]').innerText().catch(() => '')).trim()
    const richtig = DE[frage] ?? FS[frage]
    const beiMia = await mia.locator(`[data-mehr-option="${richtig}"]`).count()
    const beiBen = await ben.locator(`[data-mehr-option="${richtig}"]`).count()
    if (beiMia + beiBen !== 1) einmalig = false
    await (beiMia ? mia : ben).locator(`[data-mehr-option="${richtig}"]`).click()
    await mia.waitForTimeout(350)
  }
  pruefe(einmalig, 'Die richtige Antwort lag jedes Mal auf genau einem Gerät')
  pruefe(await da(mia.locator('[data-mehr-ergebnis]')), 'Team-Match beendet: Ergebnis')
  pruefe(await mia.getByText('Team goal reached!', { exact: true }).isVisible(), 'Team-Ziel geschafft (keine Fehler, Anzeige auf Englisch)')
  await mia.screenshot({ path: join(out, '3-ergebnis.png') })
  const rekorde = await api(Mia).get('/s/api/rekorde')
  pruefe(JSON.stringify(rekorde).includes('koop:teammatch'), 'Rekordbuch: koop:teammatch eingetragen')
  const ach = await api(Mia).get('/s/api/achievements')
  pruefe((ach.erreicht ?? []).some((a) => a.id === 'zusammen-erste'), 'Achievement „Erste Teamrunde" erreicht')

  // Nochmal → Lobby; Ben schließt die Seite → Verbindung unterbrochen sichtbar
  await mia.locator('[data-mehr-nochmal]').click()
  pruefe(await da(mia.locator('[data-mehr-lobby]')), 'Nochmal: zurück in die Lobby')
  await ben.close()
  await mia.waitForTimeout(6500)
  pruefe((await mia.locator('[data-mehr-spieler="Ben T."] [data-mehr-getrennt]').count()) === 1, 'Verbindungsabbruch wird angezeigt (Platz bleibt)')
  await api(Mia).post('/s/api/spiel/verlassen', { lobby: code })

  // ---------- Tauziehen über die Schnittstelle (Versus): niemand sieht die Lösung vorab
  const sicht = async (c, lobby) => (await api(c).get(`/s/api/spiel/zustand?lobby=${lobby}`)).sicht
  const t = await api(Mia).post('/s/api/spiel/neu', { bereich: 'vok', kurs: vok.id, spiel: 'tauziehen' })
  await api(Ben).post('/s/api/spiel/beitreten', { code: t.code })
  await api(Ben).get(`/s/api/spiel/zustand?lobby=${t.code}`)
  const st = await api(Mia).post('/s/api/spiel/start', { lobby: t.code })
  pruefe(st.status === 200, `Tauziehen gestartet (${st.status} ${st.fehler ?? ''})`)
  let leck = false
  for (let i = 0; i < 60; i++) {
    const s = await sicht(Mia, t.code)
    if (s.phase !== 'spiel') break
    if (/"loesung"/.test(JSON.stringify(s))) leck = true
    const f = s.bloecke.find((b) => b.typ === 'frage')
    if (!f) break
    const wert = DE[f.frage] ?? FS[f.frage] ?? f.optionen[0]
    await api(Mia).post('/s/api/spiel/zug', { lobby: t.code, aktion: 'antwort', wert })
    await api(Ben).get(`/s/api/spiel/zustand?lobby=${t.code}`)
  }
  const ende = await sicht(Mia, t.code)
  const endeBen = await sicht(Ben, t.code)
  pruefe(!leck, 'Keine Sicht enthält eine Lösung vorab')
  pruefe(ende.phase === 'ende' && ende.ergebnis?.eigen?.gewonnen === true, 'Tauziehen: Mia gewinnt (Seil ganz auf ihrer Seite)')
  pruefe(endeBen.ergebnis && !('platz' in (endeBen.ergebnis.eigen ?? {})) && endeBen.ergebnis.sieger.length === 1, 'Versus: nur der Sieg ist öffentlich, kein letzter Platz')
  await api(Mia).post('/s/api/spiel/verlassen', { lobby: t.code })
  await api(Ben).post('/s/api/spiel/verlassen', { lobby: t.code })

  // ---------- Jedes angebotene Spiel einmal starten (Vokabeln und Grammatik)
  const gAngebot = gram.id ? await api(Mia).get(`/s/api/spiel/angebot?bereich=gram&kurs=${gram.id}&stimme=1`) : { spiele: [] }
  const alle = [...(angebot.spiele ?? []).map((s) => ['vok', vok.id, s.id]), ...(gAngebot.spiele ?? []).map((s) => ['gram', gram.id, s.id])]
  const gestartet = []
  for (const [bereich, kurs, spiel] of alle) {
    const n = await api(Mia).post('/s/api/spiel/neu', { bereich, kurs, spiel })
    if (!n.code) {
      pruefe(false, `${bereich}/${spiel}: Runde nicht eröffnet (${n.fehler})`)
      continue
    }
    await api(Ben).post('/s/api/spiel/beitreten', { code: n.code })
    await api(Ben).get(`/s/api/spiel/zustand?lobby=${n.code}`)
    const s = await api(Mia).post('/s/api/spiel/start', { lobby: n.code })
    const sb = await sicht(Ben, n.code)
    if (s.status === 200 && sb?.phase === 'spiel' && sb.bloecke?.length) gestartet.push(`${bereich}/${spiel}`)
    else pruefe(false, `${bereich}/${spiel}: Start fehlgeschlagen (${s.status} ${s.fehler ?? ''})`)
    await api(Ben).post('/s/api/spiel/verlassen', { lobby: n.code })
    await api(Mia).post('/s/api/spiel/verlassen', { lobby: n.code })
  }
  pruefe(gestartet.length === alle.length && gestartet.some((x) => x.startsWith('gram/')), `Alle angebotenen Spiele gestartet (${gestartet.length}): ${gestartet.join(', ')}`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of kurse) await lk?.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
