// Vokabelspiele (03.10.2026, abgestimmt): nach geschaffter Tagesrunde acht Spiele, eigener Rekord, Kasten unverändert.
// Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet. Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-vokabelspiele.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-vokabelspiele')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7g${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter', example: 'The weather is nice today.' },
  { id: 'w2', term: 'sunny', translation: 'sonnig', example: 'It is a sunny day.' },
  { id: 'w3', term: 'cloud', translation: 'Wolke', example: 'There is a big cloud.' },
  { id: 'w4', term: 'rain', translation: 'Regen' },
  { id: 'w5', term: 'wind', translation: 'Wind' },
  { id: 'w6', term: 'snow', translation: 'Schnee' },
  { id: 'w7', term: 'storm', translation: 'Sturm' }
]
const nachDe = Object.fromEntries(WOERTER.map((w) => [w.translation, w.term]))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

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
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: g.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1100 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  // Tagesrunde „geschafft": alle Wörter als Lernkarte gewusst → Fach 1, morgen fällig
  for (const w of WOERTER)
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
  const vorher = JSON.stringify((await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()).staende)

  const s = await sm.newPage()
  await s.goto(`${A}/s/v/${vok.id}`)
  pruefe(await da(s.locator('[data-spielwahl]')), 'Tagesrunde geschafft: Spielauswahl erscheint')
  // Bereiche sind seit 08.10.2026 aufklappbar: alle zugeklappten öffnen
  const zu = s.locator('[data-spiel-gruppe]:not([data-offen]) [data-spiel-gruppe-kopf]')
  for (let i = 0; i < 10 && (await zu.count()); i++) await zu.first().click()
  await s.waitForTimeout(300)
  const spielzahl = await s.locator('[data-spiel-wahl]').count()
  pruefe(
    // „Hören & Schreiben" braucht eine Vorlesestimme – der Test-Browser ohne Bildschirm hat keine (dann ausgeblendet)
    spielzahl >= 10 && (await s.locator('[data-spiel-wahl="duell"]').count()) === 1,
    `Spiele zur Auswahl, mit Wortduell und Hören & Schreiben (${spielzahl})`
  )
  await s.screenshot({ path: join(out, '1-spielwahl.png'), fullPage: true })

  // Memory: Paare nacheinander aufdecken
  await s.locator('[data-spiel-wahl="memory"]').click()
  const ids = [...new Set(await s.locator('[data-memory-karte]').evaluateAll((e) => e.map((x) => x.getAttribute('data-memory-karte'))))]
  for (const id of ids) {
    const k = s.locator(`[data-memory-karte="${id}"]`)
    await k.nth(0).click()
    await k.nth(1).click()
    await s.waitForTimeout(150)
  }
  pruefe(await da(s.locator('[data-spiel-ergebnis]')), `Memory gelöst (${ids.length} Paare)`)
  pruefe(await s.getByText('Neuer Rekord!').isVisible(), 'Erster Durchgang ist ein Rekord')
  await s.screenshot({ path: join(out, '2-memory-ergebnis.png') })
  await s.getByRole('button', { name: 'Andere Spiele' }).click()
  pruefe(await da(s.locator('[data-spiel-wahl="memory"]').getByText(/Rekord: \d+ Züge/)), 'Rekord steht am Spiel')

  // Zuordnen: links ein Wort, rechts dieselbe ID
  await s.locator('[data-spiel-wahl="zuordnen"]').click()
  for (let i = 0; i < 12 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
    const l = s.locator('[data-zuordnen="l"]').first()
    if (!(await l.count())) break
    const id = await l.getAttribute('data-wid')
    await l.click()
    await s.locator(`[data-zuordnen="r"][data-wid="${id}"]`).click()
    await s.waitForTimeout(80)
  }
  pruefe(await da(s.locator('[data-spiel-ergebnis]')), 'Zuordnen gegen die Uhr gelöst')
  await s.getByRole('button', { name: 'Andere Spiele' }).click()

  // Satzpuzzle: Teile in ursprünglicher Reihenfolge legen
  await s.locator('[data-spiel-wahl="satz"]').click()
  // Ein gelegtes Wort antippen nimmt es wieder heraus
  await s.locator('[data-satz-teil="0"]').click()
  await s.locator('[data-satz-gelegtes="0"]').click()
  pruefe(
    (await s.locator('[data-satz-gelegtes]').count()) === 0 && (await s.locator('[data-satz-teil="0"]').isEnabled()),
    'Satzpuzzle: gelegtes Wort antippen nimmt es heraus'
  )
  for (let i = 0; i < 6 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
    const n = await s.locator('[data-satz-teil]').count()
    for (let k = 0; k < n; k++) await s.locator(`[data-satz-teil="${k}"]`).click()
    await s.locator('[data-satz-pruefen]').click()
    await s.locator('[data-satz-weiter]').click()
  }
  pruefe((await da(s.locator('[data-spiel-ergebnis]'))) && (await s.locator('[data-spiel-ergebnis]').getByText(/\d+/).first().isVisible()), 'Satzpuzzle gelöst')
  await s.getByRole('button', { name: 'Andere Spiele' }).click()

  // Wortraten: die Buchstaben des gesuchten Worts tippen
  await s.locator('[data-spiel-wahl="wortraten"]').click()
  for (let i = 0; i < 8 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
    const hinweis = await s.locator('[data-spiel="wortraten"] .mantine-Text-root[data-size="lg"]').innerText()
    const wort = nachDe[hinweis.trim()] ?? ''
    if (i === 0) {
      // Ganzes Wort eintippen (Bildschirmtastatur am Telefon)
      await s.locator('[data-wortraten-eingabe]').fill(wort)
      await s.keyboard.press('Enter')
      pruefe(await s.getByText('Erraten!').isVisible(), 'Wortraten: ganzes Wort über die Tastatur gelöst')
    } else {
      // Buchstaben direkt über die Tastatur, ohne Feld
      await s.locator('[data-spiel="wortraten"]').click({ position: { x: 5, y: 5 } })
      for (const c of [...new Set(wort.toLowerCase())]) await s.keyboard.press(c)
      if (i === 1) pruefe(await s.getByText('Erraten!').isVisible(), 'Wortraten: Buchstaben über die Tastatur')
    }
    await s.keyboard.press('Enter')
    await s.waitForTimeout(150)
  }
  pruefe(await da(s.locator('[data-spiel-ergebnis]')), 'Wortraten durchgespielt')
  await s.getByRole('button', { name: 'Andere Spiele' }).click()

  // Buchstabensalat: Wörter im Gitter suchen (erste und letzte Zelle tippen)
  await s.locator('[data-spiel-wahl="suchsel"]').click()
  await s.locator('[data-such]').first().waitFor()
  const gitter = await s.locator('[data-such]').allInnerTexts()
  const n = Math.round(Math.sqrt(gitter.length))
  const finde = (wort) => {
    for (let i = 0; i < gitter.length; i++)
      for (const st of [1, n, n + 1]) {
        const zellen = [...wort].map((_, k) => i + k * st)
        if (zellen.every((z, k) => z < gitter.length && gitter[z] === wort[k] && (st === n || Math.floor(z / n) - Math.floor(i / n) === (st === 1 ? 0 : k))))
          return zellen
      }
    return null
  }
  for (const w of WOERTER) {
    const z = finde(w.term.toUpperCase())
    if (!z) continue
    await s.locator(`[data-such="${z[0]}"]`).click()
    await s.locator(`[data-such="${z[z.length - 1]}"]`).click()
  }
  pruefe(await da(s.locator('[data-spiel-ergebnis]')), 'Buchstabensalat gelöst')
  await s.getByRole('button', { name: 'Andere Spiele' }).click()

  // Fallende Wörter: ein fallendes Wort übersetzen
  await s.locator('[data-spiel-wahl="fallend"]').click()
  const fall = s.locator('[data-fallwort]').first()
  await fall.waitFor({ timeout: 8000 })
  const fid = await fall.getAttribute('data-fallwort')
  await s.locator('[data-fallend-eingabe]').fill(WOERTER.find((w) => w.id === fid).term)
  pruefe(await da(s.getByText('1 geschafft'), 3000), 'Fallende Wörter: Übersetzung tippen löst das Wort')
  await s.screenshot({ path: join(out, '3-fallend.png') })
  await s.getByRole('button', { name: 'Beenden' }).last().click()

  // Kreuzworträtsel und Blitzrunde: starten und bedienen
  await s.locator('[data-spiel-wahl="kreuzwort"]').click()
  pruefe((await s.locator('[data-kreuz]').count()) > 8 && (await s.getByText('Waagerecht').isVisible()), 'Kreuzworträtsel mit Gitter und deutschen Hinweisen')
  await s.screenshot({ path: join(out, '4-kreuzwort.png') })
  await s.getByRole('button', { name: 'Beenden' }).last().click()
  await s.locator('[data-spiel-wahl="blitz"]').click()
  for (let i = 0; i < 5; i++) await s.locator('[data-blitz-option]').first().click()
  pruefe(await s.getByText(/\d+ richtig/).isVisible(), 'Blitzrunde läuft')
  await s.getByRole('button', { name: 'Beenden' }).last().click()

  // Neue Spiele (06.10.2026)
  const termZu = (deutsch) => WOERTER.find((w) => w.translation === deutsch.trim())?.term ?? ''
  await s.locator('[data-spiel-wahl="duell"]').click()
  // Mit kurzer Pause (09.10.2026): blindes Schnellklicken zählt nicht mehr (shared/schnellKlick.ts)
  for (let i = 0; i < 20 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
    await s.waitForTimeout(750)
    await s.locator('[data-duell-passt]').click()
  }
  pruefe((await da(s.locator('[data-spiel-ergebnis]'))) && (await s.locator('[data-spiel-ergebnis]').getByText(/\d+ s/).first().isVisible()), 'Wortduell: 20 Runden, Zeit als Ergebnis')
  await s.getByRole('button', { name: 'Andere Spiele' }).click()
  // Nur mit Vorlesestimme (der Test-Browser ohne Bildschirm hat keine)
  if (await s.locator('[data-spiel-wahl="diktat"]').count()) {
    await s.locator('[data-spiel-wahl="diktat"]').click()
    const bedeutung = (await s.getByText(/^Bedeutung: /).innerText()).replace('Bedeutung: ', '')
    await s.locator('[data-diktat-eingabe]').fill(termZu(bedeutung))
    await s.locator('[data-pruefen]').click()
    pruefe(await da(s.getByText('Richtig!'), 3000), `Hören & Schreiben: Wort geschrieben (${termZu(bedeutung)})`)
    await s.screenshot({ path: join(out, '4b-diktat.png') })
    await s.getByRole('button', { name: 'Beenden' }).last().click()
  }
  if (await s.locator('[data-spiel-wahl="satzluecke"]:not([disabled])').count()) {
    await s.locator('[data-spiel-wahl="satzluecke"]').click()
    const gesucht = (await s.getByText(/^Gesucht: /).innerText()).replace('Gesucht: ', '')
    await s.locator('[data-luecke-eingabe]').fill(termZu(gesucht).replace(/^to /, ''))
    await s.locator('[data-pruefen]').click()
    pruefe(await da(s.getByText(/Richtig!|Richtig wäre/), 3000), 'Satz-Lücke: Wort im Beispielsatz eingesetzt')
    await s.screenshot({ path: join(out, '4c-satzluecke.png') })
    await s.getByRole('button', { name: 'Beenden' }).last().click()
  }

  // Farbschema des Fachs (Kopfband): Englisch Dunkelblau, Französisch Violett; Hell/Dunkel; eigenes Design.
  // Seit der Dunkel-Vorgabe (05.10.2026) zuerst ausdrücklich „Hell" wählen – die Prüfungen beziehen sich auf hell
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-modus]').getByText('Hell').click()
  await s.getByText(/gespeichert/).waitFor({ timeout: 8000 })
  await s.goto(`${A}/s/v/${vok.id}`)
  await s.locator('[data-vokabel-kasten]').waitFor()
  const akzent = () => s.locator('[data-vt-akzent]').first().getAttribute('data-vt-akzent')
  pruefe((await akzent()) === '#1d4e89', `Englisch in der Fachfarbe Dunkelblau (${await akzent()})`)
  const fr = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: g.id, titel: 'Le temps', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'f1', term: 'le soleil', translation: 'die Sonne' }] }
    })
  ).json()
  await s.goto(`${A}/s/v/${fr.id}`)
  await s.locator('[data-vokabel-kasten]').waitFor()
  pruefe((await akzent()) === '#5f3dc4', `Französisch in der Fachfarbe Violett (${await akzent()})`)
  await s.screenshot({ path: join(out, '5-franzoesisch-hell.png'), fullPage: true })
  await s.locator('[data-modus-knopf]').click()
  await s.waitForTimeout(300)
  pruefe((await s.locator('[data-vt-dunkel]').count()) > 0, 'Dunkle Darstellung über den Schalter in der Kopfzeile')
  const seitenGrund = await s.evaluate(() => getComputedStyle(document.body).backgroundColor)
  pruefe(seitenGrund !== 'rgb(255, 255, 255)', `Seitenhintergrund wird mit dunkel (${seitenGrund})`)
  await s.screenshot({ path: join(out, '6-franzoesisch-dunkel.png'), fullPage: true })
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-design]').getByText('Meine Farbe').click()
  await s.getByText(/gespeichert/).waitFor({ timeout: 8000 })
  await s.goto(`${A}/s/v/${fr.id}`)
  await s.locator('[data-vokabel-kasten]').waitFor()
  const eigen = await akzent()
  pruefe(
    eigen !== '#5f3dc4' && eigen !== '#8c73d5' && (await s.locator('[data-vt-dunkel]').count()) > 0,
    `Design wechselbar: eigene Farbe (${eigen}), dunkel bleibt`
  )
  await s.screenshot({ path: join(out, '7-eigene-farbe-dunkel.png'), fullPage: true })
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-design]').getByText('Farbe des Fachs').click()
  await s.locator('[data-modus]').getByText('Hell').click()
  await s.getByText(/gespeichert/).waitFor({ timeout: 8000 })
  // Gäste haben den Schalter auch
  const gc = await browser.newContext()
  const gp = await gc.newPage()
  await gp.goto(`${A}/s/`)
  pruefe(await da(gp.locator('[data-modus-knopf]')), 'Hell/Dunkel-Schalter auch ohne Konto')
  await gc.close()
  await lk.request.post(`${A}/server/vokabeln/${fr.id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } })

  // Kasten unverändert, Rekorde gespeichert
  const nachher = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()
  // Seit 06.10.2026: Treffer befördern nichts; Fehler machen das Wort fällig (sichere ein Fach zurück)
  const alt = JSON.parse(vorher)
  const befoerdert = Object.keys(nachher.staende).filter((id) => (nachher.staende[id]?.fach ?? 0) > (alt[id]?.fach ?? 0))
  const fehlerWoerter = (nachher.ansehen ?? []).filter((id) => alt[id]?.fach >= 1)
  pruefe(befoerdert.length === 0, `Spiele befördern kein Wort im Kasten (${befoerdert.length})`)
  pruefe(
    fehlerWoerter.every((id) => nachher.staende[id].faellig <= Date.now()),
    `Fehler im Spiel: Wort kommt gleich wieder dran (${fehlerWoerter.length} Wörter)`
  )
  pruefe(
    ['memory', 'zuordnen', 'satz', 'wortraten', 'suchsel'].every((k) => nachher.rekorde[k] !== undefined),
    `Rekorde gespeichert (${Object.keys(nachher.rekorde).join(', ')})`
  )
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } })
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
