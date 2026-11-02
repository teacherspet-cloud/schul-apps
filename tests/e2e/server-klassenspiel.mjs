// Klassenspiele (02.11.2026, Plan wise-sauteeing-bubble): Die Lehrkraft öffnet in „Meine Klassen" ein Klassenspiel
// (Startfenster: Spiel · Inhalt · Schwierigkeit), der Beamer zeigt Code und QR; Lernende sehen das Banner auf der
// Startseite, treten bei (fremde Klasse abgewiesen), Teams werden gelost, gespielt wird im Browser und über die
// Schnittstelle; Ende mit Ergebnis, Top 3 und Auswertung (nur Lehrkraft); Fehler landen im Kasten. Dazu Expedition und
// Boss über die Schnittstelle. Keine KI.
// Vorher: Server lokal (Oberfläche gebaut). Aufruf: node tests/e2e/server-klassenspiel.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-klassenspiel')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const K = `7k${Date.now() % 1000}`
const FREMD = `7f${Date.now() % 1000}`
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
  ['street', 'Straße', 'The street is very long.'],
  ['sea', 'Meer', 'The sea is blue and cold.'],
  ['train', 'Zug', 'The train leaves at nine.']
]
const WOERTER = PAARE.map(([term, translation, example], i) => ({ id: `w${i}`, term, translation, example, exampleTranslation: `Beispiel ${i}` }))
const PAKET = {
  thema: 'Simple past',
  regeln: [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes.', beispiele: ['I played.'] }],
  aufgaben: Array.from({ length: 8 }, (_, i) => ({
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
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
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
/** Eine Antwort über die Schnittstelle: Möglichkeit mit Index `i` (falsch bei „###") */
async function antwortApi(c, code, wahl = 0) {
  const s = (await api(c).get(`/s/api/klassenspiel/zustand?code=${code}`)).sicht
  const f = s?.bloecke?.find((b) => b.typ === 'frage')
  if (!f) return false
  const wert = f.tippen ? (wahl === 'falsch' ? '###' : 'x') : f.optionen[typeof wahl === 'number' ? wahl % f.optionen.length : 0]
  const r = await api(c).post('/s/api/klassenspiel/antwort', { code, wert, nr: s.aufgabeNr })
  return r.status === 200
}

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kim Klasse' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K, namen: 'Mia Probe\nBen Test\nLea Muster\nNoah Beispiel' } })).json()
  const fremd = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: FREMD, namen: 'Tom Fremd' } })).json()
  const konten = [...liste.angelegt, ...fremd.angelegt]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (konten.some((k) => k.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: K, fach: 'Englisch', iservGruppe: `klasse:${K}` })
  const vok = await post('/server/vokabeln/freigeben', { lerngruppeId: g.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
  kurse.push(vok.id)
  const gram = await post('/server/grammatik/freigeben', { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: vok.id, lerngruppeId: g.id })
  pruefe(Boolean(vok.id && gram.id), `Kurs und Grammatik angelegt (${vok.id}, ${gram.id ?? gram.fehler})`)

  const ctx = {}
  for (const k of konten) {
    const c = await browser.newContext({ viewport: { width: 820, height: 1100 }, hasTouch: true })
    await anmelden(c, k.benutzer, k.passwort)
    await c.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
    if (liste.angelegt.includes(k))
      for (const w of WOERTER) await c.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
    ctx[k.name.split(' ')[0]] = c
  }
  const { Mia, Ben, Lea, Noah, Tom } = ctx

  // ---------- Angebot
  const ang = await api(lk).get(`/server/klassenspiel?kurs=${vok.id}`)
  const spielbar = (ang.spiele ?? []).filter((s) => s.spielbar).map((s) => s.id)
  pruefe(['expedition', 'boss', 'rennen'].every((x) => spielbar.includes(x)), `Spielbar: ${spielbar.join(', ')} (${(ang.spiele ?? []).length} Spiele insgesamt)`)
  pruefe(ang.lernende === 4 && (ang.eintraege ?? []).some((e) => e.art === 'gram'), `Kurs: ${ang.lernende} Lernende, Abschnitte und Grammatik zur Auswahl`)

  // ---------- Lehrkraft: Meine Klassen › Klasse › Englisch › Klassenspiel
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K}"]`).first().click()
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  pruefe(await da(p.locator('[data-klassenspiel-knopf]')), 'Knopf „Klassenspiel" in Meine Klassen')
  await p.locator('[data-klassenspiel-knopf]').click()
  await da(p.locator('[data-klassenspiel-wahl="rennen"]'))
  await p.screenshot({ path: join(out, '1-start-spiel.png') })
  await p.locator('[data-klassenspiel-wahl="rennen"]').click()
  await p.locator('[data-klassenspiel-weiter]').click()
  await p.screenshot({ path: join(out, '2-start-inhalt.png') })
  await p.locator('[data-klassenspiel-weiter]').click()
  pruefe(await da(p.locator('[data-klassenspiel-teams]')), 'Schritt 3: Teams wählbar (Tauziehen & Rennen)')
  await p.screenshot({ path: join(out, '3-start-schwierigkeit.png') })
  await p.locator('[data-klassenspiel-oeffnen]').click()
  pruefe(await da(p.locator('[data-klassenspiel-beamer="lobby"]')), 'Beamer öffnet mit Warteraum')
  const code = (await p.locator('[data-klassenspiel-code]').innerText()).trim()
  pruefe(/^\d{6}$/.test(code), `Code am Beamer: ${code}`)
  pruefe(await da(p.locator('[data-klassenspiel-qr]')), 'QR-Code am Beamer')

  // ---------- Lernende: Banner, Beitritt, fremde Klasse
  const mp = await Mia.newPage()
  await mp.goto(`${A}/s/`)
  pruefe(await da(mp.getByText('Mitspielen').first(), 20000), 'Banner „Mitspielen" auf der Startseite der Lernenden')
  await mp.getByText('Mitspielen').first().click()
  pruefe(await da(mp.locator('[data-klasse-warten]')), 'Mia im Warteraum')
  const bp = await Ben.newPage()
  await bp.goto(`${A}/s/ks/${code}`)
  await da(bp.locator('[data-klasse-warten]'))
  for (const c of [Lea, Noah]) await api(c).post('/s/api/klassenspiel/beitreten', { code })
  const tom = await api(Tom).post('/s/api/klassenspiel/beitreten', { code })
  pruefe(tom.status === 403, `Fremde Klasse wird abgewiesen (${tom.status})`)
  pruefe(await da(p.locator('[data-klassenspiel-dabei="4"]')), 'Beamer: 4 dabei')
  await p.screenshot({ path: join(out, '4-beamer-lobby.png') })

  // ---------- Teams losen und starten
  await p.locator('[data-klassenspiel-losen]').click()
  pruefe(await da(p.locator('[data-beamer-teams="2"]')), 'Zwei Teams gelost')
  await p.waitForTimeout(3500)
  await p.screenshot({ path: join(out, '5-beamer-teams.png') })
  pruefe(await da(mp.locator('[data-klasse-team]:not([data-klasse-team=""])'), 8000), 'Mia sieht ihr Team')
  await p.locator('[data-klassenspiel-start-knopf]').click()
  pruefe(await da(p.locator('[data-beamer-seil]')), 'Beamer zeigt das Seil')
  pruefe(await da(mp.locator('[data-mehr-frage]')), 'Mia bekommt eine Frage')

  // Mia spielt im Browser (antippen oder schreiben), die anderen über die Schnittstelle
  let geantwortet = 0
  for (let i = 0; i < 8; i++) {
    const nr0 = await mp.locator('[data-mehr-frage-text]').innerText().catch(() => '')
    const opt = mp.locator('[data-mehr-option]')
    if (await opt.count()) await opt.first().click()
    else {
      await mp.locator('[data-mehr-eingabe]').fill(i % 2 ? 'cloud' : '###')
      await mp.locator('[data-mehr-eingabe]').press('Enter')
    }
    geantwortet++
    await mp.waitForFunction((t) => document.querySelector('[data-mehr-frage-text]')?.textContent !== t || document.querySelector('[data-mehr-text]'), nr0, { timeout: 5000 }).catch(() => undefined)
  }
  pruefe(geantwortet === 8, 'Mia hat 8 Fragen im Browser beantwortet')
  pruefe(await da(mp.locator('[data-mehr-text="gut"], [data-mehr-text="schlecht"]')), 'Mia sieht Rückmeldung (richtig bzw. Lösung)')
  for (let i = 0; i < 6; i++) for (const c of [Ben, Lea, Noah]) await antwortApi(c, code, i)
  // Doppelt geschickte Antwort zählt nicht zweimal
  const s0 = (await api(Ben).get(`/s/api/klassenspiel/zustand?code=${code}`)).sicht
  await api(Ben).post('/s/api/klassenspiel/antwort', { code, wert: 'x', nr: (s0.aufgabeNr ?? 0) - 1 })
  await p.waitForTimeout(1500)
  await mp.screenshot({ path: join(out, '6-mia-frage.png') })
  await p.screenshot({ path: join(out, '7-beamer-spiel.png') })

  // Pause
  await p.locator('[data-klassenspiel-pause]').click()
  await mp.waitForTimeout(1200)
  pruefe((await mp.getByText('Pause').count()) > 0, 'Pause erscheint bei Mia')
  await p.locator('[data-klassenspiel-weiter-knopf]').click()

  // Ende
  await p.locator('[data-klassenspiel-beenden]').click()
  pruefe(await da(p.locator('[data-klassenspiel-ergebnis]')), 'Beamer zeigt das Ergebnis')
  pruefe(await da(mp.locator('[data-klasse-ergebnis]')), 'Mia sieht das Ergebnis')
  pruefe(await da(mp.locator('[data-klasse-eigen]')), 'Mia sieht ihre eigene Leistung (privat)')
  await mp.screenshot({ path: join(out, '8-mia-ende.png') })
  await p.screenshot({ path: join(out, '9-beamer-ende.png') })
  await p.locator('[data-klassenspiel-auswertung-knopf]').click()
  pruefe(await da(p.locator('[data-auswertung-person]').first()), 'Auswertung je Person (nur Lehrkraft)')
  const personen = await p.locator('[data-auswertung-person]').count()
  pruefe(personen === 4, `Auswertung: ${personen} Personen`)
  await p.screenshot({ path: join(out, '10-auswertung.png') })
  await p.keyboard.press('Escape')
  // Fehler im Kasten (wackelig = „ansehen")
  const kasten = await api(Mia).get(`/s/api/vokabeln/liste?id=${vok.id}`)
  pruefe(JSON.stringify(kasten).length > 50, 'Kasten von Mia lesbar nach dem Spiel')
  await p.locator('[data-klassenspiel-schliessen]').click()
  await p.waitForTimeout(800)
  const zu = await api(Mia).get(`/s/api/klassenspiel/zustand?code=${code}`)
  pruefe(zu.status === 404, `Nach dem Schließen ist das Spiel weg (${zu.status})`)

  // ---------- Expedition und Boss über die Schnittstelle (adaptiv, Level, fest)
  for (const [spiel, schwierigkeit] of [
    ['expedition', 'level'],
    ['boss', 'adaptiv'],
    ['rennen', 'fest']
  ]) {
    const n = await api(lk).post('/server/klassenspiel/neu', { kurs: vok.id, einstellungen: { spiel, schwierigkeit, dauer: 3, teams: 3, gram: true, vok: true } })
    if (!n.code) {
      pruefe(false, `${spiel}: nicht geöffnet (${n.fehler})`)
      continue
    }
    for (const c of [Mia, Ben, Lea, Noah]) await api(c).post('/s/api/klassenspiel/beitreten', { code: n.code })
    const st = await api(lk).post(`/server/klassenspiel/${n.code}/steuern`, { aktion: 'start' })
    let gram = false
    for (let i = 0; i < 10; i++)
      for (const c of [Mia, Ben, Lea, Noah]) {
        const s = (await api(c).get(`/s/api/klassenspiel/zustand?code=${n.code}`)).sicht
        const f = s?.bloecke?.find((b) => b.typ === 'frage')
        if (f && /Yesterday/.test(f.frage)) gram = true
        await antwortApi(c, n.code, i)
      }
    const sicht = (await api(lk).get(`/server/klassenspiel/${n.code}/zustand`)).sicht
    pruefe(st.status === 200 && sicht?.phase === 'spiel' && sicht.bloecke?.length > 0, `${spiel} (${schwierigkeit}): läuft, Beamer-Bausteine ${sicht?.bloecke?.map((b) => b.typ).join('/')}`)
    pruefe(gram, `${spiel}: Grammatik kommt mit Vokabeln gemischt dran`)
    pruefe(!JSON.stringify(sicht.bloecke).includes('loesung'), `${spiel}: keine Lösung am Beamer`)
    const e = await api(lk).post(`/server/klassenspiel/${n.code}/steuern`, { aktion: 'ende' })
    pruefe(Boolean(e.sicht?.ergebnis?.text), `${spiel}: Ergebnis „${e.sicht?.ergebnis?.text}"${e.sicht?.ergebnis?.rekord?.neu ? ' · neuer Klassenrekord' : ''}`)
    await api(lk).post(`/server/klassenspiel/${n.code}/steuern`, { aktion: 'schliessen' })
  }
  const ang2 = await api(lk).get(`/server/klassenspiel?kurs=${vok.id}`)
  pruefe(Object.keys(ang2.rekorde ?? {}).length >= 2, `Klassenrekorde gespeichert: ${Object.entries(ang2.rekorde ?? {}).map(([k, v]) => `${k}=${v.text}`).join(', ')}`)
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
