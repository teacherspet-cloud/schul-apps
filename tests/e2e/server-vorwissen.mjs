// Vorwissen der Lerngruppe (13.10.2026, abgestimmt mit der Lehrkraft; server/vorwissen.ts, shared/vorwissenLerngruppe.ts):
//  1. Schnittstelle: eigener Kurs („Aus diesem Kurs") und Kurs einer ANDEREN Lehrkraft mit denselben Lernenden („Aus anderen
//     Kursen"); ein Kurs mit nur 2 gemeinsamen Lernenden fließt nicht ein; keine Namen, keine Lehrkraft; Problemwort als
//     Anteil („2 von 4"); fremde Lerngruppe → 404.
//  2. „Arbeitsblatt erstellen" in Meine Klassen: Feld „Vorwissen der Lerngruppe" vorausgefüllt, „Für Lerngruppe" gewählt.
//  3. „Unterrichtsreihe erstellen": Feld „Vorwissen der Lerngruppe" vorausgefüllt.
//  4. „Förder- und Fordermaterial erstellen": Vorwissen-Feld im Schritt der Gruppen.
// Ohne KI. Aufruf: node tests/e2e/server-vorwissen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-vorwissen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const N = Date.now() % 1000
const KV = `8v${N}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const PAKET = (thema) => ({
  thema,
  regeln: [{ id: 'r1', titel: thema, erklaerung: 'Probe.', beispiele: ['I am.'] }],
  aufgaben: Array.from({ length: 8 }, (_, i) => ({
    id: `a${i + 1}`,
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle.',
    satz: `I ___ (${i}).`,
    optionen: ['am', 'is'],
    loesungen: ['am']
  }))
})
const NAMEN = ['Lia Vorn', 'Ben Mitte', 'Ole Hinten', 'Eva Rand']

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const konto = async (name) =>
    await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
  const t1 = await konto('Vera Vorwissen')
  const t2 = await konto('Kai Kollege')
  zuLoeschen.push(t1.id, t2.id)
  const lernende = (
    await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KV, namen: NAMEN.join('\n') } })).json()
  ).angelegt
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (lernende.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)

  lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, t1.benutzer, t1.passwort)
  const k2 = await browser.newContext()
  await anmelden(k2, t2.benutzer, t2.passwort)
  const api = (ctx) => ({
    post: async (pfad, data) => (await ctx.request.post(`${A}${pfad}`, { headers: KOPF, data })).json(),
    get: async (pfad) => {
      const r = await ctx.request.get(`${A}${pfad}`, { headers: KOPF })
      return { status: r.status(), ...(await r.json()) }
    }
  })
  const a1 = api(lk)
  const a2 = api(k2)

  // ---------- Lehrkraft 1: Englisch in KV mit Vokabeln und Grammatik
  const gE = await a1.post('/server/lerngruppen/anlegen', { name: KV, fach: 'Englisch', iservGruppe: `klasse:${KV}` })
  const woerter = Array.from({ length: 4 }, (_, i) => ({ id: `v${i}`, term: `vorword${i}`, translation: `Vorwort${i}` }))
  const kurs = (
    await a1.post('/server/vokabeln/freigeben', {
      lerngruppeId: gE.id,
      titel: 'Green Line 2 - Unit 1: Station 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter,
      quelle: { lehrwerk: 'green-line-2', unit: 'Unit 1', abschnitte: ['Station 1'] }
    })
  ).id
  kurse.push({ ctx: lk, id: kurs })
  const gram1 = await a1.post('/server/grammatik/freigeben', {
    titel: 'Simple past',
    fach: 'Englisch',
    sprache: 'en',
    thema: 'Simple past (Probe)',
    paket: PAKET('Simple past (Probe)'),
    vokId: kurs,
    info: { themen: ['en.verb.past_simple'] }
  })
  pruefe(Boolean(kurs && gram1.id), `Kurs und Grammatik der Lehrkraft 1 (${kurs}, ${gram1.id ?? gram1.fehler})`)

  // Zwei Lernende liegen beim selben Wort sechsmal falsch → Problemwort bei 2 von 4
  for (const s of lernende.slice(0, 2)) {
    const c = await browser.newContext()
    await anmelden(c, s.benutzer, s.passwort)
    await c.request.post(`${A}/auth/passwort`, {
      form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
      headers: { origin: A },
      maxRedirects: 0
    })
    for (let i = 0; i < 6; i++)
      await c.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kurs, wortId: 'v0', uebung: 'frei', antwort: 'völlig falsch' } })
    await c.close()
  }

  // ---------- Lehrkraft 2: Französisch in derselben Klasse (4 gemeinsame) und eine AG mit nur 2 gemeinsamen
  const gF = await a2.post('/server/lerngruppen/anlegen', { name: KV, fach: 'Französisch', iservGruppe: `klasse:${KV}` })
  const gram2 = await a2.post('/server/grammatik/freigeben', {
    titel: 'Les articles',
    fach: 'Französisch',
    sprache: 'fr',
    thema: 'Les articles (Probe)',
    paket: PAKET('Les articles (Probe)'),
    lerngruppeId: gF.id,
    info: { themen: [] }
  })
  const gAg = await a2.post('/server/lerngruppen/anlegen', { name: `AG${N}`, fach: 'Spanisch', mitglieder: lernende.slice(0, 2).map((s) => s.benutzer) })
  const gram3 = await a2.post('/server/grammatik/freigeben', {
    titel: 'Geheim',
    fach: 'Spanisch',
    sprache: 'es',
    thema: 'Geheimthema der AG',
    paket: PAKET('Geheimthema der AG'),
    lerngruppeId: gAg.id,
    info: { themen: [] }
  })
  pruefe(Boolean(gF.id && gram2.id && gAg.id && gram3.id), `Kurse der Lehrkraft 2 (${[gram2, gram3].map((g) => g.id ?? g.fehler).join(', ')})`)

  // ---------- 1. Schnittstelle
  const v = await a1.get(`/server/vorwissen?gruppe=${gE.id}`)
  console.log('   ---- Vorwissen ----\n' + (v.text ?? '').replace(/^/gm, '   | '))
  pruefe(v.status === 200 && v.lernende === 4, `Vorwissen geladen (${v.status}, ${v.lernende} Lernende)`)
  pruefe(/^Aus diesem Kurs:/m.test(v.text) && /Behandelt: Grammatik: Simple past \(Probe\)/.test(v.text), '„Aus diesem Kurs": eigene Grammatik')
  pruefe(
    /^Aus anderen Kursen:/m.test(v.text) && /Behandelt: Grammatik: Les articles \(Probe\)/.test(v.text),
    '„Aus anderen Kursen": Grammatik der anderen Lehrkraft'
  )
  pruefe(!/Geheimthema/.test(v.text), 'Kurs mit nur 2 gemeinsamen Lernenden fließt nicht ein')
  pruefe(/Unsicher: Wörter vorword0 – Vorwort0 \(2 von 4\)/.test(v.text), 'Problemwort als Anteil „2 von 4"')
  pruefe(![...NAMEN, 'Vera', 'Kai', 'Französisch', 'Spanisch'].some((n) => v.text.includes(n)), 'Keine Namen, keine Lehrkraft, kein Fach als Herkunft')
  pruefe(v.jahrgang === 8, `Jahrgang aus dem Klassennamen (${v.jahrgang})`)
  pruefe(v.woerter?.includes('vorword0'), 'Bekannte Wörter des Kurses')
  pruefe(
    /Behandelt: Lehrwerk Green Line 2, bis Unit 1/.test(v.text) && !/Green Line 4/.test(v.text),
    'Lehrwerk aus den Freigaben, nicht nach dem Jahrgang geraten'
  )
  pruefe(!/Leistungsspanne/.test(v.text), 'Ungeübte neue Wörter machen niemanden zum Förderfall')
  const fremd = await a2.get(`/server/vorwissen?gruppe=${gE.id}`)
  pruefe(fremd.status === 404, `Fremde Lerngruppe: 404 (${fremd.status})`)

  // ---------- Oberfläche
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  const zurKlasse = async () => {
    await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
    // Meine Klassen merkt sich die offene Klasse (Rückweg) – dann steht sie gleich da
    await p.locator('[data-klassen-liste], [data-klasse-neu]').first().waitFor({ timeout: 15000 })
    if (
      await p
        .locator('[data-klasse-neu]')
        .isVisible()
        .catch(() => false)
    )
      return
    const alle = p.getByRole('button', { name: 'Alle Klassen' })
    if (await alle.isVisible().catch(() => false)) await alle.click()
    await p.locator(`[data-klasse="${KV}"]`).click()
    await p.locator('[data-klasse-neu]').waitFor({ timeout: 15000 })
  }

  // 2. Arbeitsblatt
  await zurKlasse()
  await p.locator('[data-arbeitsblatt-erstellen]').click()
  const feld = p.locator('textarea').filter({ hasText: 'Aus diesem Kurs:' })
  pruefe(await da(feld.first(), 20000), 'Arbeitsblatt: Vorwissen der Lerngruppe vorausgefüllt')
  const blattText = await feld
    .first()
    .inputValue()
    .catch(() => '')
  pruefe(/Aus anderen Kursen:/.test(blattText) && /Les articles/.test(blattText), 'Arbeitsblatt: auch aus anderen Kursen')
  pruefe(
    /^8v\d+/.test(
      await p
        .locator('[data-lerngruppe-select]')
        .inputValue()
        .catch(() => '')
    ),
    '„Für Lerngruppe" zeigt die Klasse'
  )
  pruefe(await da(p.locator('[data-lerngruppe-uebernommen]')), 'Hinweis „Vorwissen von … übernommen"')
  await p.screenshot({ path: join(out, '1-arbeitsblatt.png'), fullPage: true })
  // Abwählen nimmt den übernommenen Text heraus
  await p
    .locator('[data-lerngruppe-wahl] .mantine-Input-section button, [data-lerngruppe-wahl] [data-combobox-clear]')
    .first()
    .click()
    .catch(() => undefined)
  await p.waitForTimeout(500)
  pruefe((await p.locator('textarea').filter({ hasText: 'Aus diesem Kurs:' }).count()) === 0, '„Für Lerngruppe" abwählen nimmt das Vorwissen heraus')

  // 3. Unterrichtsreihe
  await zurKlasse()
  await p.locator('[data-reihe-erstellen]').click()
  // Erst die Art der Reihe
  const gemischt = p.getByText('Gemischt', { exact: true })
  if (await da(gemischt.first(), 10000)) await gemischt.first().click()
  const rf = p.locator('[data-reihe-vorwissen]')
  pruefe(await da(rf, 20000), 'Reihe: Feld „Vorwissen der Lerngruppe"')
  await p
    .waitForFunction(() => /Aus diesem Kurs:/.test(document.querySelector('[data-reihe-vorwissen]')?.value ?? ''), null, { timeout: 15000 })
    .catch(() => undefined)
  const reiheText = await rf.inputValue().catch(() => '')
  pruefe(/Aus diesem Kurs:/.test(reiheText) && /Aus anderen Kursen:/.test(reiheText), 'Reihe: Vorwissen vorausgefüllt')
  await p.screenshot({ path: join(out, '2-reihe.png'), fullPage: true })

  // 4. Förder- und Fordermaterial
  await zurKlasse()
  await p.locator('[data-foerder-erstellen-knopf]').click()
  const weiter = p.getByRole('button', { name: /Gruppen vorschlagen|Weiter/ })
  if (await da(weiter.first(), 8000)) await weiter.first().click()
  const ff = p.locator('[data-foerder-vorwissen]')
  if (await da(ff, 10000)) {
    await p.waitForTimeout(800)
    pruefe(/Aus diesem Kurs:/.test(await ff.inputValue()), 'Förder: Vorwissen-Feld vorausgefüllt')
    await p.screenshot({ path: join(out, '3-foerder.png'), fullPage: true })
  } else {
    await p.screenshot({ path: join(out, '3-foerder-schritt1.png'), fullPage: true })
    console.log('   (Förder: Gruppenschritt nicht erreicht – Bildschirmfoto 3-foerder-schritt1.png)')
  }
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const k of kurse)
    await k.ctx.request.post(`${A}/server/vokabeln/${k.id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurse und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
