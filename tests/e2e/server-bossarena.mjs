// Boss-Arena (17.11.2026, Entwurf mit der Lehrkraft): Lernende wählen im Wartebereich eine Figur (Mehrfachwahl erlaubt),
// der Beamer zeigt die Figuren ohne Namen gegen das Monster; falsche Antworten werden zu Kugeln, der Angriffstakt trifft
// die Klasse (Lebensbalken sinkt), das Gerät zeigt roten Rand und die eigene Figur; die Wahl wird gemerkt. Keine KI.
// Vorher: Server lokal (Oberfläche gebaut). Aufruf: node tests/e2e/server-bossarena.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-bossarena')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const K = `6b${Date.now() % 1000}`
const PAARE = [
  ['weather', 'Wetter'],
  ['sunny', 'sonnig'],
  ['cloud', 'Wolke'],
  ['rain', 'Regen'],
  ['wind', 'Wind'],
  ['snow', 'Schnee'],
  ['storm', 'Sturm'],
  ['dog', 'Hund'],
  ['garden', 'Garten'],
  ['street', 'Straße']
]
const WOERTER = PAARE.map(([term, translation], i) => ({ id: `w${i}`, term, translation, example: `This is about the ${term} today.`, exampleTranslation: `Beispiel ${i}` }))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const warte = (ms) => new Promise((r) => setTimeout(r, ms))

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
/** Tempo-Schutz (17.11.2026): wie echte Lernende erst nach der Lesezeit bzw. Sperre antworten */
async function warteBereit(s) {
  const ms = Math.max(s?.bereitAb ?? 0, s?.sperre?.bis ?? 0) - (s?.jetzt ?? 0)
  if (ms > 0) await new Promise((r) => setTimeout(r, ms + 80))
}
/** Antwort über die Schnittstelle: richtig (erste passende Möglichkeit ist nicht sicher richtig) oder sicher falsch */
async function antwortApi(c, code, falsch) {
  const s = (await api(c).get(`/s/api/klassenspiel/zustand?code=${code}`)).sicht
  const f = s?.bloecke?.find((b) => b.typ === 'frage')
  if (!f) return false
  const wert = falsch ? '###' : f.tippen ? 'x' : f.optionen[0]
  await warteBereit(s)
  return (await api(c).post('/s/api/klassenspiel/antwort', { code, wert, nr: s.aufgabeNr })).status === 200
}

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Bo Boss' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K, namen: 'Mia Probe\nBen Test\nLea Muster\nNoah Beispiel' } })).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((k) => k.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1600, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: K, fach: 'Englisch', iservGruppe: `klasse:${K}` })
  const vok = await post('/server/vokabeln/freigeben', { lerngruppeId: g.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
  kurse.push(vok.id)
  await post(`/server/vokabeln/${vok.id}/spiele`, { frei: true })
  pruefe(Boolean(vok.id), `Kurs angelegt (${vok.id})`)
  const ctx = {}
  for (const k of liste.angelegt) {
    const c = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true })
    await anmelden(c, k.benutzer, k.passwort)
    await c.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
    ctx[k.name.split(' ')[0]] = c
  }
  const { Mia, Ben, Lea, Noah } = ctx

  // ---------- Lehrkraft: Startfenster mit Einstellung „Eigene Figur reagiert auf …"
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K}"]`).first().click()
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  await p.locator('[data-klassenspiel-knopf]').click()
  await p.locator('[data-klassenspiel-wahl="boss"]').click()
  await p.locator('[data-klassenspiel-weiter]').click()
  await p.locator('[data-klassenspiel-weiter]').click()
  pruefe(await da(p.locator('[data-klassenspiel-boss-reaktion]')), 'Startfenster: Einstellung „Eigene Figur vorne reagiert auf …"')
  await p.locator('[data-klassenspiel-boss-reaktion]').getByText('Auch Fehler').click()
  await p.screenshot({ path: join(out, '1-start-einstellung.png') })
  await p.locator('[data-klassenspiel-oeffnen]').click()
  pruefe(await da(p.locator('[data-klassenspiel-beamer="lobby"]')), 'Beamer öffnet mit Warteraum')
  const code = (await p.locator('[data-klassenspiel-code]').innerText()).trim()

  // ---------- Lernende: Figur wählen (Mia im Browser, Ben/Lea über die Schnittstelle, Noah wählt nicht)
  const mp = await Mia.newPage()
  await mp.goto(`${A}/s/ks/${code}`)
  pruefe(await da(mp.locator('[data-klasse-figurwahl]')), 'Mia sieht die Figurenwahl im Wartebereich')
  pruefe(await da(mp.getByText('Choose your character')), 'Figurenwahl in der Zielsprache („Choose your character")')
  const zahl = await mp.locator('[data-klasse-figur]').count()
  pruefe(zahl >= 5, `${zahl} Figuren zur Wahl`)
  await mp.locator('[data-klasse-figur="magier"]').click()
  pruefe(await da(mp.locator('[data-klasse-figurwahl="magier"]')), 'Mia hat den Magier gewählt')
  await mp.screenshot({ path: join(out, '2-mia-figurwahl.png') })
  for (const c of [Ben, Lea, Noah]) await api(c).post('/s/api/klassenspiel/beitreten', { code })
  await api(Ben).post('/s/api/klassenspiel/figur', { code, figur: 'magier' })
  await api(Lea).post('/s/api/klassenspiel/figur', { code, figur: 'ritterin' })
  const boese = await api(Lea).post('/s/api/klassenspiel/figur', { code, figur: 'gibtsnicht' })
  pruefe(boese.status === 400, `Unbekannte Figur abgewiesen (${boese.status})`)
  pruefe(await da(p.locator('[data-klassenspiel-figuren="3"]')), 'Beamer zeigt im Warteraum die drei gewählten Figuren')
  await p.screenshot({ path: join(out, '3-beamer-lobby.png') })

  // ---------- Start: Arena
  await p.locator('[data-klassenspiel-start-knopf]').click()
  pruefe(await da(p.locator('[data-boss-arena]')), 'Beamer zeigt die Arena')
  pruefe(await da(p.locator('[data-boss-figuren="4"]')), 'Vier Figuren vorne (Noah bekam eine zufällige)')
  const arenaText = await p.locator('[data-boss-arena]').innerText()
  pruefe(!/Mia|Ben|Lea|Noah/.test(arenaText), 'Keine Namen in der Arena')
  pruefe((await p.locator('[data-boss-figur="magier"]').count()) >= 2, 'Magier mindestens zweimal vorne (Mehrfachwahl mit Farbring; Noah bekommt eine zufällige)')
  pruefe(await da(mp.locator('[data-klasse-eigene-figur="magier"]')), 'Mia sieht ihre Figur am Gerät')
  pruefe(await da(mp.locator('[data-klasse-leiter]')), 'Mia sieht ihre Stufe der Stufenleiter (Vorgabe)')
  const bild = await p.locator('[data-boss-arena] img').first().evaluate((i) => i.naturalWidth > 0)
  pruefe(bild, 'Figurenbilder laden')

  // Tempo-Schutz: sofort antippen → „Zu schnell", die Antwort zählt nicht
  const opt0 = mp.locator('[data-mehr-option]')
  if (await opt0.count()) {
    // Gültig antworten (nach der Lesezeit), dann die neue Frage sofort antippen. War die gültige Antwort falsch, sperrt
    // erst die Fehlerzeit (Taps zählen nicht) – dann noch einmal versuchen.
    let gesehen = false
    // Schnell und richtig zählt (17.11.2026) – nur schnelles Falsch sperrt; darum mehrere Versuche
    for (let i = 0; i < 14 && !gesehen; i++) {
      await mp.waitForTimeout(3600)
      const text0 = await mp.locator('[data-mehr-frage-text]').innerText().catch(() => '')
      await mp.locator('[data-mehr-option]').first().click({ force: true })
      await mp.waitForFunction((t) => document.querySelector('[data-mehr-frage-text]')?.textContent !== t, text0, { timeout: 5000 }).catch(() => undefined)
      await mp.locator('[data-mehr-option]').first().click({ force: true })
      gesehen = await da(mp.locator('[data-klasse-zu-schnell]'), 1500)
    }
    pruefe(gesehen, 'Sofort getippt: Hinweis „Too fast!" und Sperre')
    await mp.screenshot({ path: join(out, '3b-mia-zu-schnell.png') })
    await mp.waitForTimeout(3300)
  }
  // Mia antwortet falsch im Browser → roter Rand
  const opt = mp.locator('[data-mehr-option]')
  if (await opt.count()) {
    // Falsche Möglichkeit: nicht die erste richtige – am sichersten über die Eingabe; bei Auswahl alle durchprobieren
    await opt.last().click()
  } else {
    await mp.locator('[data-mehr-eingabe]').fill('###')
    await mp.locator('[data-mehr-eingabe]').press('Enter')
  }
  // Mehrere sichere Fehler über die Schnittstelle (Kugeln) – Mias Gerät bekommt den Schlag mit
  for (const c of [Ben, Lea, Noah]) for (let i = 0; i < 3; i++) await antwortApi(c, code, true)
  await warte(1200)
  const kugeln = await p.locator('[data-boss-kugel]').count()
  pruefe(kugeln >= 3, `Beamer zeigt ${kugeln} Angriffskugeln`)
  await p.screenshot({ path: join(out, '4-beamer-kugeln.png') })
  // Angriffstakt (12 s, Kugeln ab 6 s reif)
  let held = 100
  for (let i = 0; i < 20 && held >= 100; i++) {
    await warte(1000)
    held = Number(await p.locator('[data-boss-held]').getAttribute('data-boss-held').catch(() => '100'))
  }
  pruefe(held < 100, `Der Boss trifft die Klasse: Leben ${held}`)
  pruefe(await da(mp.locator('[data-klasse-boss-meldung]'), 5000), 'Mia sieht die Meldung am Gerät')
  await warte(400)
  await p.screenshot({ path: join(out, '5-beamer-schlag.png') })
  await mp.screenshot({ path: join(out, '6-mia-schlag.png') })
  // Richtige Antworten → Treffer
  const hpVorher = Number(await p.locator('[data-boss-arena]').getAttribute('data-beamer-boss'))
  for (let i = 0; i < 4; i++) for (const c of [Ben, Lea, Noah]) await antwortApi(c, code, false)
  await warte(1200)
  const hpNachher = Number(await p.locator('[data-boss-arena]').getAttribute('data-beamer-boss'))
  pruefe(hpNachher <= hpVorher, `Boss-Leben ${hpVorher} → ${hpNachher}`)
  await p.screenshot({ path: join(out, '7-beamer-treffer.png') })

  // Ende und nochmal: Mias Wahl bleibt
  await p.locator('[data-klassenspiel-beenden]').click()
  pruefe(await da(p.locator('[data-klassenspiel-ergebnis]')), 'Ergebnis am Beamer')
  await p.screenshot({ path: join(out, '8-beamer-ende.png') })
  await api(lk).post(`/server/klassenspiel/${code}/steuern`, { aktion: 'schliessen' })
  const n2 = await api(lk).post('/server/klassenspiel/neu', { kurs: vok.id, einstellungen: { spiel: 'boss', dauer: 5 } })
  await api(Mia).post('/s/api/klassenspiel/beitreten', { code: n2.code })
  const m2 = (await api(Mia).get(`/s/api/klassenspiel/zustand?code=${n2.code}`)).sicht
  pruefe(m2?.figurWahl?.gewaehlt === 'magier', `Neues Spiel: Mias Figur gemerkt (${m2?.figurWahl?.gewaehlt})`)
  await api(lk).post(`/server/klassenspiel/${n2.code}/steuern`, { aktion: 'schliessen' })

  // ---------- Mit Rollen (17.11.2026): Wahl mit Obergrenze, Übersicht im Warteraum, Kampfreihe, Wirkung am Gerät
  const n3 = await api(lk).post('/server/klassenspiel/neu', { kurs: vok.id, einstellungen: { spiel: 'boss', dauer: 5, bossRollen: true, bossReaktion: 'erfolge' } })
  for (const c of [Mia, Ben, Lea, Noah]) await api(c).post('/s/api/klassenspiel/beitreten', { code: n3.code })
  await mp.goto(`${A}/s/ks/${n3.code}`)
  pruefe(await da(mp.locator('[data-klasse-rollenwahl]')), 'Rollen: Mia sieht die Rollenwahl')
  pruefe(await da(mp.getByText('Damage Dealer').first()), 'Rollennamen in der Zielsprache („Damage Dealer")')
  await mp.locator('[data-klasse-rolle="heiler"]').click()
  pruefe(await da(mp.locator('[data-klasse-rollenwahl="heiler"]')), 'Rollen: Mia ist Heilerin')
  await mp.screenshot({ path: join(out, '9-mia-rollenwahl.png') })
  const t1 = await api(Ben).post('/s/api/klassenspiel/rolle', { code: n3.code, rolle: 'tank' })
  const t2 = await api(Lea).post('/s/api/klassenspiel/rolle', { code: n3.code, rolle: 'tank' })
  const t3 = await api(Noah).post('/s/api/klassenspiel/rolle', { code: n3.code, rolle: 'tank' })
  pruefe(t1.status === 200 && t2.status === 200 && t3.status === 409, `Obergrenze: 2 von 4 dürfen Tank sein, die dritte Wahl ist voll (${t1.status}/${t2.status}/${t3.status})`)
  const ue = (await api(lk).get(`/server/klassenspiel/${n3.code}/zustand`)).sicht
  pruefe(ue?.rollenUebersicht?.tank?.length === 2 && ue?.rollenUebersicht?.heiler?.length === 1, 'Beamer-Warteraum: Übersicht je Rolle mit Namen')
  // Beamer der Lehrkraft (über „Zum laufenden Spiel")
  await p.goto(A)
  await p.waitForTimeout(2000)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K}"]`).first().click()
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  await p.locator('[data-klassenspiel-knopf]').click()
  await p.locator('[data-klassenspiel-zurueck]').click()
  pruefe(await da(p.locator('[data-klassenspiel-rollen]')), 'Beamer: Rollenübersicht im Warteraum')
  await p.screenshot({ path: join(out, '10-beamer-rollen-lobby.png') })
  await p.locator('[data-klassenspiel-start-knopf]').click()
  pruefe(await da(p.locator('[data-boss-schild]')), 'Arena mit Rollen: Schildbalken der Klasse')
  const sicht3 = (await api(lk).get(`/server/klassenspiel/${n3.code}/zustand`)).sicht
  const fig = sicht3?.bloecke?.find((b) => b.typ === 'boss')?.figuren ?? []
  pruefe(fig.length === 4 && fig.every((f) => ['tank', 'heiler', 'angreifer'].includes(f.rolle)), `Alle Figuren mit Rolle (Noah bekam die kleinste: ${fig.map((f) => f.rolle).join(', ')})`)
  pruefe(!/Mia|Ben|Lea|Noah/.test(await p.locator('[data-boss-arena]').innerText()), 'Im Kampf keine Namen in der Arena')
  pruefe(await da(mp.locator('[data-klasse-eigene-rolle="heiler"]')), 'Gerät: „Deine Rolle“ Heilerin')
  // Ben (Tank) antwortet richtig → Schild wächst
  let schild = 0
  // Erste Möglichkeit ist nicht immer richtig – bis zu 15 Versuche
  for (let i = 0; i < 15 && schild === 0; i++) {
    await antwortApi(Ben, n3.code, false)
    schild = (await api(lk).get(`/server/klassenspiel/${n3.code}/zustand`)).sicht?.bloecke?.find((b) => b.typ === 'boss')?.schild ?? 0
  }
  pruefe(schild > 0, `Tank antwortet richtig → Klassenschild ${schild}`)
  // Mia (Heilerin) antwortet im Browser richtig → Wirkung als Animation
  let wirkung = false
  for (let i = 0; i < 15 && !wirkung; i++) {
    await mp.waitForTimeout(3300)
    await mp.locator('[data-mehr-option]').first().click({ force: true }).catch(() => undefined)
    wirkung = await da(mp.locator('[data-klasse-wirkung="heilung"]'), 1500)
  }
  pruefe(wirkung, 'Gerät: Heilung als Animation sichtbar')
  await mp.screenshot({ path: join(out, '11-mia-wirkung.png') })
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '12-beamer-rollen-arena.png') })
  await api(lk).post(`/server/klassenspiel/${n3.code}/steuern`, { aktion: 'schliessen' })
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
