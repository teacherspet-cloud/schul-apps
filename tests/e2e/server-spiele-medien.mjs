// Hör-, Bilder- und Verbspiele (07.10.2026, im Plan-Modus abgestimmt): nach geschaffter Tagesrunde die 8 neuen
// Medienspiele und die 4 Verbspiele im Vokabeltraining; Stammformen-Nachfrage; Freigabe „Unregelmäßige Verben" im
// Grammatiktraining mit den Verbspielen dort. Bilder und Aufnahmen setzt der Test selbst (Admin) und entfernt sie danach.
// Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-spiele-medien.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-spiele-medien')
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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAA'
const VERBEN = [
  ['go', 'went', 'gone', 'gehen'],
  ['buy', 'bought', 'bought', 'kaufen'],
  ['cut', 'cut', 'cut', 'schneiden'],
  ['sing', 'sang', 'sung', 'singen'],
  ['see', 'saw', 'seen', 'sehen'],
  ['take', 'took', 'taken', 'nehmen']
]
const NOMEN = [
  ['apple', 'Apfel'],
  ['house', 'Haus'],
  ['tree', 'Baum'],
  ['horse', 'Pferd']
]
const WOERTER = [
  ...VERBEN.map(([inf, , , de], i) => ({ id: `v${i}`, term: `to ${inf}`, translation: de })),
  ...NOMEN.map(([t, de], i) => ({ id: `n${i}`, term: t, translation: de }))
]
const KARTEN = VERBEN.map(([inf, past, pp, de], i) => ({ id: `k${i}`, formen: { inf, past, pp }, de, schluessel: inf }))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const api = async (ctx, channel, ...args) => (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const medienSchluessel = [...WOERTER.map((w) => w.term), ...VERBEN.map((v) => v[0])]
let gid = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  // ---------- Medien: Bild und Aufnahme für jedes Wort, Bild und Formen-Aufnahmen für jedes Verb
  for (const w of WOERTER) {
    await api(verwaltung, 'medien:bild-setzen', 'en', w.term, { dataUrl: PNG, herkunft: 'ki', nachweis: 'Test' })
    await api(verwaltung, 'medien:ton-setzen', 'en', w.term, 'wort', { dataUrl: MP3, stimme: 'probe', text: w.term })
  }
  for (const [inf, past, pp] of VERBEN) {
    await api(verwaltung, 'medien:bild-setzen', 'en', inf, { dataUrl: PNG, herkunft: 'ki', nachweis: 'Test' })
    for (const f of [inf, past, pp]) await api(verwaltung, 'medien:ton-setzen', 'en', inf, 'satz', { dataUrl: MP3, stimme: 'probe', text: f })
  }
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lou T' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Ben Probe' } })).json()
  const ben = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (n.benutzer === ben.benutzer) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const g = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })).json()
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: g.id, titel: 'Medien', sprache: 'en', fach: 'Englisch', woerter: WOERTER, verben: { sprache: 'en', karten: KARTEN } }
    })
  ).json()
  const sm = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await anmelden(sm, ben.benutzer, ben.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const l0 = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()
  pruefe(l0.verben?.karten?.length === 6, `Verben der Liste kommen bei den Lernenden an (${l0.verben?.karten?.length})`)
  // Tagesrunde „geschafft": alle als gewusst → Fach 1
  for (const w of WOERTER) await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })

  const s = await sm.newPage()
  await s.goto(`${A}/s/v/${vok.id}`)
  pruefe(await da(s.locator('[data-spielwahl]')), 'Spielauswahl erscheint')
  await s.waitForTimeout(1500)
  const neu = ['hoermemory', 'richtiggehoert', 'buchstaben', 'hoerbingo', 'bildmemory', 'wasfehlt', 'aufdecken', 'wortbild', 'verbtrio', 'formenblitz', 'bildverb', 'muster']
  const da2 = []
  for (const id of neu) if (await s.locator(`[data-spiel-wahl="${id}"]`).count()) da2.push(id)
  pruefe(da2.length === neu.length, `alle 12 neuen Spiele angeboten (${da2.join(', ')})`)
  await s.screenshot({ path: join(out, '1-spielwahl.png'), fullPage: true })
  const nachTerm = Object.fromEntries(WOERTER.map((w) => [w.term.replace(/^to /, ''), w]))
  const zurueck = async () => {
    pruefe(await da(s.locator('[data-spiel-ergebnis]'), 90000), `${aktuell}: Ergebnis erscheint`)
    await s.getByRole('button', { name: 'Andere Spiele' }).click()
  }
  let aktuell = ''
  const spiele = async (id, fn) => {
    aktuell = id
    await s.locator(`[data-spiel-wahl="${id}"]`).click()
    await fn()
    await s.screenshot({ path: join(out, `2-${id}.png`) })
    await zurueck()
  }
  // Hör-Memory / Bild-Memory: Paare nach Wort-Id
  for (const id of ['hoermemory', 'bildmemory'])
    await spiele(id, async () => {
      const ids = [...new Set(await s.locator('[data-memory-karte]').evaluateAll((e) => e.map((x) => x.getAttribute('data-memory-karte'))))]
      for (const w of ids) {
        await s.locator(`[data-memory-karte="${w}"][data-memory-seite="a"]`).click()
        await s.locator(`[data-memory-karte="${w}"][data-memory-seite="b"]`).click()
        await s.waitForTimeout(150)
      }
    })
  // Buchstaben-Puzzle: das gesprochene Wort ist das aktuelle der Reihe – über die Kacheln legen (Wort aus der Rückmeldung unbekannt: probieren, Fehler zählen nicht)
  await spiele('buchstaben', async () => {
    for (let i = 0; i < 10 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const kacheln = s.locator('[data-kachel]:not([disabled])')
      const felder = await s.locator('[data-gelegt] .vt-raten-feld').count()
      for (let k = 0; k < felder; k++) await kacheln.first().click()
      await s.locator('[data-pruefen]').click()
      await s.waitForTimeout(2000)
    }
  })
  // Hör-Bingo: aufgerufenes Wort antippen
  await spiele('hoerbingo', async () => {
    for (let i = 0; i < 16 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const auf = await s.locator('[data-bingo-aufruf]').getAttribute('data-bingo-aufruf')
      await s.locator(`[data-bingo-feld="${auf}"]`).click()
      await s.waitForTimeout(250)
    }
  })
  // Richtig gehört? – Zeitspiel: einige Runden, dann läuft die Zeit ab
  await spiele('richtiggehoert', async () => {
    for (let i = 0; i < 4; i++) {
      await s.locator('[data-passt]').click()
      await s.waitForTimeout(700)
    }
  })
  // Wort → Bild: richtiges Bild über die Wort-Id
  await spiele('wortbild', async () => {
    for (let i = 0; i < 10 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const wort = (await s.locator('[data-wortbild-wort]').innerText()).trim()
      const w = nachTerm[wort] ?? nachTerm[wort.replace(/^to /, '')] ?? WOERTER.find((x) => x.term === wort)
      await s.locator(`[data-bild-option="${w.id}"]`).click()
      await s.waitForTimeout(800)
    }
  })
  // Was fehlt? – merken überspringen, dann die fehlende Karte über das Fragezeichen bestimmen
  await spiele('wasfehlt', async () => {
    for (let i = 0; i < 5 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const alle = await s.locator('[data-kim-bild]').evaluateAll((e) => e.map((x) => x.getAttribute('data-kim-bild')))
      await s.locator('[data-kim-fertig]').click()
      await s.locator('[data-phase="raten"]').waitFor()
      const sichtbar = await s.locator('[data-kim-bild]:has(img)').evaluateAll((e) => e.map((x) => x.getAttribute('data-kim-bild')))
      const fehlt = alle.find((x) => !sichtbar.includes(x))
      const w = WOERTER.find((x) => x.id === fehlt)
      await s.locator(`[data-option="${w.term}"], [data-option="${w.term.replace(/^to /, '')}"]`).first().click()
      await s.waitForTimeout(1300)
    }
  })
  // Bild aufdecken – gleich raten (alle Bilder sind gleich: erste Möglichkeit)
  await spiele('aufdecken', async () => {
    for (let i = 0; i < 6 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const id = await s.locator('[data-aufdecken-bild]').getAttribute('data-aufdecken-bild')
      const w = WOERTER.find((x) => x.id === id)
      await s.locator(`[data-option="${w.term}"], [data-option="${w.term.replace(/^to /, '')}"]`).first().click()
      await s.waitForTimeout(1300)
    }
  })
  // Stammformen-Trio: Karten je Verb aufdecken
  await spiele('verbtrio', async () => {
    const ids = [...new Set(await s.locator('[data-trio-karte]').evaluateAll((e) => e.map((x) => x.getAttribute('data-trio-karte'))))]
    for (const v of ids) {
      const k = s.locator(`[data-trio-karte="${v}"]`)
      for (let j = 0; j < 3; j++) await k.nth(j).click()
      await s.waitForTimeout(150)
    }
  })
  // Muster sortieren
  const MUSTER = { go: 'ABC', buy: 'ABB', cut: 'AAA', sing: 'IAU', see: 'ABC', take: 'ABC' }
  await spiele('muster', async () => {
    for (let i = 0; i < 8 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const id = await s.locator('[data-muster-verb]').getAttribute('data-muster-verb')
      const k = KARTEN.find((x) => x.id === id)
      await s.locator(`[data-muster="${MUSTER[k.schluessel]}"]`).click()
      await s.waitForTimeout(1000)
    }
  })
  // Bild-Verb (Fach 1: wählen)
  await spiele('bildverb', async () => {
    for (let i = 0; i < 8 && !(await s.locator('[data-spiel-ergebnis]').isVisible()); i++) {
      const id = await s.locator('[data-bildverb-bild]').getAttribute('data-bildverb-bild')
      const k = KARTEN.find((x) => x.id === id)
      await s.locator(`[data-option="${k.formen.inf} – ${k.formen.past} – ${k.formen.pp}"]`).click()
      await s.waitForTimeout(1600)
    }
  })
  // Formen-Blitz – Zeitspiel: einige richtige Antworten
  await spiele('formenblitz', async () => {
    for (let i = 0; i < 3; i++) {
      const form = await s.locator('[data-blitz-form]').getAttribute('data-blitz-form')
      const k = KARTEN.find((x) => Object.values(x.formen).includes(form))
      const spalte = Object.entries(k.formen).find(([, f]) => f === form)[0]
      await s.locator(`[data-spalte="${spalte}"]`).click()
      await s.waitForTimeout(900)
    }
  })
  const rek = (await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()).rekorde
  pruefe(neu.every((id) => rek[id] !== undefined), `Rekorde aller neuen Spiele gespeichert (${Object.keys(rek).length})`)

  // ---------- Grammatiktraining: Freigabe „Unregelmäßige Verben" (Standardliste) in der Oberfläche
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Grammatiktraining"]').click()
  await p.locator('[data-grammatik-freigeben]').click()
  await p.locator('[data-grammatik-fach]').click()
  await p.getByRole('option', { name: 'Englisch', exact: true }).click()
  await p.locator('[data-grammatik-modus]').getByText('Unregelmäßige Verben').click()
  pruefe(await da(p.locator('[data-verb-freigabe]')), 'Freigabe: Verbauswahl erscheint')
  const anzahl = Number(await p.locator('[data-verb-anzahl]').getAttribute('data-verb-anzahl'))
  pruefe(anzahl >= 4, `Standardliste bis zum Lernjahr (${anzahl} Verben)`)
  await p.getByText('Nur per QR-Code').click()
  await p.screenshot({ path: join(out, '3-verbfreigabe.png') })
  await p.locator('[data-grammatik-erstellen]').click()
  pruefe(await da(p.locator('[data-grammatik-entwurf]')), 'Entwurf sofort da (ohne KI)')
  await p.locator('[data-entwurf-ansehen]').click()
  await p.locator('[data-entwurf-freigeben]').click()
  await p.waitForTimeout(1500)
  const zw = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen.find((x) => /Unregelmäßige Verben/.test(x.titel))
  gid = zw?.id ?? ''
  pruefe(Boolean(zw?.code), `Freigegeben mit Code (${zw?.code}, ${zw?.aufgaben} Karten)`)
  const gg = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h = await gg.newPage()
  await h.goto(`${A}/s/gt/${zw.code}`)
  await h.locator('[data-gastname]').fill('Ida V.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  await h.locator('[data-vokabeln-los]').click()
  const paket = (await (await gg.request.get(`${A}/s/api/grammatik/liste?id=${gid}`)).json()).paket
  pruefe(paket.verben?.length === paket.aufgaben.length, `Paket mit Verbkarten (${paket.verben?.length})`)
  // Alle Karten einmal richtig (API) – dann Spiele frei
  for (const a of paket.aufgaben)
    await gg.request.post(`${A}/s/api/grammatik/antwort`, { headers: KOPF, data: { id: gid, aufgabeId: a.id, antwort: JSON.stringify([a.zeilen[0].loesungen]) } })
  await h.reload()
  await h.locator('[data-vokabeln-los]').click().catch(() => undefined)
  const vs = ['verbtrio', 'verbblitz', 'bildverb', 'muster']
  const vda = []
  for (const id of vs) if (await h.locator(`[data-grammatik-spiel="${id}"]`).count()) vda.push(id)
  pruefe(vda.includes('verbtrio') && vda.includes('verbblitz') && vda.includes('muster'), `Verbspiele im Grammatiktraining (${vda.join(', ')})`)
  await h.screenshot({ path: join(out, '4-grammatik-verbspiele.png'), fullPage: true })
  await h.locator('[data-grammatik-spiel="verbtrio"]').click()
  const ids = [...new Set(await h.locator('[data-trio-karte]').evaluateAll((e) => e.map((x) => x.getAttribute('data-trio-karte'))))]
  for (const v of ids) {
    const k = h.locator(`[data-trio-karte="${v}"]`)
    for (let j = 0; j < 3; j++) await k.nth(j).click()
    await h.waitForTimeout(150)
  }
  pruefe(await da(h.locator('[data-spiel-ende]')), 'Stammformen-Trio im Grammatiktraining gelöst')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 3).join(' | ')}`)
} finally {
  if (gid && lk) await lk.request.delete(`${A}/server/grammatik/${gid}`, { headers: KOPF }).catch(() => undefined)
  for (const w of medienSchluessel) {
    await api(verwaltung, 'medien:bild-loeschen', 'en', w).catch(() => undefined)
    await api(verwaltung, 'medien:ton-loeschen', 'en', w, 'wort').catch(() => undefined)
  }
  for (const [inf, past, pp] of VERBEN) for (const f of [inf, past, pp]) await api(verwaltung, 'medien:ton-loeschen', 'en', inf, 'satz', f).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung')
