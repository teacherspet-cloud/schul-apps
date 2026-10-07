// Grammatik-Lern-App (06.10.2026): Lehrkraft gibt ein Thema frei (KI-Attrappe erzeugt den Pool im Hintergrund,
// Prüfschritt streicht eine Aufgabe), sichtet den Entwurf, streicht eine Aufgabe, gibt per QR-Code frei.
// Gast am Handy: Name → persönlicher Code → Kasten mit Regelkarten → Tagesration mit allen Aufgabenarten → Spiel.
// Lehrkraft sieht Lernstand. Vorher: Server lokal mit KI-Attrappe (Schemas grammatik_pool / grammatik_pruefung).
// Aufruf: node tests/e2e/server-grammatiktraining.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-grammatiktraining')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const norm = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[.?!]$/, '')

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let zid = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Gina Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)

  // ---------- Lehrkraft: App in der Leiste, Freigeben mit KI im Hintergrund
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Grammatiktraining"]').click()
  pruefe(await da(p.locator('[data-grammatiktraining]')), 'App „Grammatiktraining" in der Leiste')
  await p.locator('[data-grammatik-freigeben]').click()
  await p.locator('[data-grammatik-fach]').click()
  await p.getByRole('option', { name: 'Englisch', exact: true }).click()
  // Themenauswahl wie im Arbeitsblatt (GrammatikAuswahl, 06.10.2026): Liste links, Teilformen rechts
  const themen = await p.locator('[data-grammatik-thema] [data-thema]').count()
  pruefe(themen > 3, `Themen aus dem Lehrplan-Katalog (${themen})`)
  await p.locator('[data-grammatik-thema] [data-thema-wahl]').first().click()
  const teilNamen = await p.locator('[data-grammatik-thema] [data-thema-detail] [data-teilform]').count()
  pruefe(teilNamen >= 3, `Katalogthema bietet Teilformen zur Auswahl (${teilNamen})`)
  await p.getByText('Eigenes Thema statt Katalog').click()
  await p.locator('[data-grammatik-eigenes]').fill('Simple past – Test')
  await p.getByText('Nur per QR-Code').click()
  await p.screenshot({ path: join(out, '1-freigeben.png') })
  await p.locator('[data-grammatik-erstellen]').click()
  pruefe(await da(p.locator('[data-grammatik-entwurf]'), 40000), 'Entwurf erscheint nach der Erzeugung im Hintergrund')
  await p.locator('[data-entwurf-ansehen]').click()
  const anzahl = await p.locator('[data-entwurf-aufgabe]').count()
  pruefe(anzahl === 29, `Pool geprüft: eine Aufgabe vom Prüfschritt gestrichen (${anzahl} von 30)`)
  await p.screenshot({ path: join(out, '2-entwurf.png') })
  await p.locator('[data-entwurf-aufgabe]').first().getByRole('button', { name: 'Aufgabe streichen' }).click()
  pruefe((await p.locator('[data-entwurf-aufgabe]').count()) === 28, 'Lehrkraft streicht eine Aufgabe')
  await p.locator('[data-entwurf-freigeben]').click()
  pruefe(await da(p.locator('[data-grammatik-zuweisung="Simple past – Test"]')), 'Freigegeben und in der Liste')
  pruefe((await p.locator('[data-grammatik-entwurf]').count()) === 0, 'Entwurf danach weg')
  const liste = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen
  const z = liste.find((x) => x.titel === 'Simple past – Test')
  zid = z?.id ?? ''
  pruefe(Boolean(z?.code && z.link?.includes('/s/gt/')) && z.aufgaben === 28, `Code und Link (${z?.code}), 28 Aufgaben`)

  // ---------- Gast am Handy
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h = await g.newPage()
  await h.goto(`${A}/s/gt/${z.code}`)
  await h.locator('[data-gastname]').fill('Mia R.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  pruefe(await da(h.locator('[data-wieder-code]')), 'Gast bekommt einen persönlichen Code')
  await h.locator('[data-vokabeln-los]').click()
  pruefe(await da(h.locator('[data-grammatik-kasten]')), 'Gast sieht den Grammatik-Kasten')
  await h.locator('[data-regelkarten]').click()
  pruefe((await h.locator('[data-regelkarte]').count()) === 2, 'Zwei Regelkarten')
  await h.screenshot({ path: join(out, '3-kasten.png'), fullPage: true })
  const paket = (await (await g.request.get(`${A}/s/api/grammatik/liste?id=${zid}`)).json()).paket
  const nachSatz = (t) => paket.aufgaben.find((a) => a.satz && t.includes(a.satz.split('___')[0].trim()))
  await h.locator('[data-grammatik-start]').click()
  await h.locator('[data-sitzung]').waitFor()
  const arten = new Set()
  let falsch = false
  for (let i = 0; i < 30; i++) {
    if (await h.locator('[data-sitzung-fertig]').isVisible()) break
    const art = await h.locator('[data-aufgabe]').getAttribute('data-aufgabe')
    arten.add(art)
    const text = await h.locator('[data-aufgabe]').innerText()
    if (art === 'luecke') {
      const a = paket.aufgaben.find((x) => x.art === 'luecke' && text.includes(x.satz.split('(').pop()))
      // Einmal absichtlich falsch: dann Regelkarte und Lösung
      await h.locator('[data-luecke-eingabe]').fill(falsch ? (a?.loesungen[0] ?? 'x') : 'goed')
      await h.locator('[data-pruefen]').click()
      if (!falsch) {
        falsch = true
        pruefe(await da(h.locator('[data-urteil="falsch"]')), 'Falsche Antwort: Urteil „falsch"')
        pruefe(await h.locator('[data-regelkarte]').isVisible(), 'Bei Fehler erscheint die Regelkarte')
        await h.screenshot({ path: join(out, '4-falsch.png'), fullPage: true })
      }
    } else if (art === 'auswahl') {
      const a = nachSatz(text)
      await h.locator(`[data-option="${a.loesungen[0]}"]`).click()
    } else if (art === 'umformen') {
      const a = paket.aufgaben.find((x) => x.art === 'umformen' && text.includes(x.satz))
      await h.locator('[data-umformen-eingabe]').fill(a.loesungen[1] ?? a.loesungen[0])
      await h.locator('[data-pruefen]').click()
    } else if (art === 'fehler') {
      const woerter = await h.locator('[data-fehlerwort]').evaluateAll((l) => l.map((e) => e.getAttribute('data-fehlerwort')).join(' '))
      const a = paket.aufgaben.find((x) => x.art === 'fehler' && x.satz.replace(/[.?!,]/g, '') === woerter)
      await h.locator(`[data-fehlerwort="${a.fehlerWort}"]`).click()
      await h.locator('[data-korrektur-eingabe]').fill(a.loesungen[0])
      await h.locator('[data-pruefen]').click()
    } else if (art === 'satzbau') {
      const teile = await h.locator('[data-satzteil]').allInnerTexts()
      const a = paket.aufgaben.find((x) => x.art === 'satzbau' && [...x.teile].sort().join('|') === [...teile].sort().join('|'))
      for (const t of a.teile) await h.locator(`[data-satzteil="${t}"]`).first().click()
      await h.locator('[data-pruefen]').click()
    }
    await h.locator('[data-weiter]').waitFor({ timeout: 8000 })
    if (art !== 'luecke' || i > 0) {
      const u = await h.locator('[data-urteil]').getAttribute('data-urteil')
      if (u !== 'richtig' && !(art === 'luecke')) pruefe(false, `Richtige Antwort bei ${art} nicht als richtig gewertet (${u})`)
    }
    await h.locator('[data-weiter]').click()
  }
  pruefe(await da(h.locator('[data-sitzung-fertig]')), 'Tagesration geschafft')
  pruefe(arten.size >= 3, `Verschiedene Aufgabenarten in der Ration (${[...arten].join(', ')})`)
  await h.screenshot({ path: join(out, '5-fertig.png') })

  // Restliche Aufgaben über die Schnittstelle einführen (damit die Ration leer ist und Spiele frei werden)
  for (let runde = 0; runde < 4; runde++)
    for (const a of paket.aufgaben)
      await g.request.post(`${A}/s/api/grammatik/antwort`, {
        headers: KOPF,
        data: { id: zid, aufgabeId: a.id, antwort: a.loesungen[0], ...(a.art === 'fehler' ? { wort: a.fehlerWort } : {}) }
      })
  await h.goto(`${A}/s/g/${zid}`)
  pruefe(await da(h.locator('[data-grammatik-geschafft]')), 'Ration leer: „Für heute ist alles geübt"')
  // Spiel „Formen-Blitz" (60 s) – zwei Runden spielen, dann abwarten wäre zu lang: Regel zuordnen statt dessen ganz
  await h.locator('[data-grammatik-spiel="regelzuordnen"]').click()
  pruefe(await da(h.locator('[data-spiel="regelzuordnen"]')), 'Spiel „Regel zuordnen" startet')
  for (let i = 0; i < 12; i++) {
    if (await h.locator('[data-spiel-ende]').isVisible()) break
    const satz = await h.locator('[data-spiel] .vt-buehne').innerText()
    const passt = paket.regeln.find((r) => r.beispiele.some((b) => satz.includes(b)))
    const knopf = passt ? h.locator(`[data-regel-option="${passt.id}"]`) : h.locator('[data-regel-option]').first()
    await knopf.click()
    await h.waitForTimeout(1500)
  }
  pruefe(await da(h.locator('[data-spiel-ende]')), 'Spielende mit Ergebnis')
  await h.screenshot({ path: join(out, '6-spiel.png') })
  await h.getByRole('button', { name: 'Zurück zum Kasten' }).click()
  pruefe(await da(h.locator('[data-grammatik-spiel="regelzuordnen"]').getByText(/richtig/)), 'Rekord am Spiel')
  await h.locator('[data-grammatik-spiel="satzbaupuzzle"]').click()
  pruefe(await da(h.locator('[data-spiel="satzbaupuzzle"] [data-satzteil]').first()), 'Satzbau-Puzzle zeigt Satzteile')
  await h.screenshot({ path: join(out, '7-satzbau.png') })

  // ---------- Lehrkraft: Lernstand
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Grammatiktraining"]').click()
  await p.locator('[data-grammatik-zuweisung="Simple past – Test"]').getByText('Simple past – Test').click()
  pruefe(await da(p.locator('[data-grammatik-lernstand]').getByText('Mia R.')), 'Lernstand zeigt den Gast')
  await p.screenshot({ path: join(out, '8-lernstand.png'), fullPage: true })
  // Lernraum-Eintrag (Gaststart) zeigt das Grammatiktraining
  await h.goto(`${A}/s/`)
  pruefe(await da(h.locator('[data-gast-vokabeln="grammatik"]')), 'Gast-Startseite listet das Grammatiktraining')
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  if (zid && lk) await lk.request.post(`${A}/server/grammatik/${zid}/loeschen`, { headers: KOPF, data: {} }).catch(() => null)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
