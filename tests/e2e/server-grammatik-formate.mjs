// Neue Grammatikformate (28.10.2026, Grammatik-Neubeginn – abgestimmt mit der Lehrkraft): Markieren, Sortieren,
// Mehrfachauswahl (Erkennen), Frage bilden (Bilden), Lückentext mit Kontext und Sätze verbinden (Anwenden). Admin legt
// Bank-Aufgaben an, die Lehrkraft weist die Form einem Kurs zu und sieht sie unter „Aufgaben ansehen“; ein Gast übt alle
// Formate in der Schüler-App und bekommt jeweils „richtig“ – inklusive Kontext-Vorlauf und Begründung nach der Antwort.
// Vorher: Server lokal. Aufruf: node tests/e2e/server-grammatik-formate.mjs <Ausgabe> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-grammatik-formate')
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
const THEMA = 'en.verb.past_progressive'
const SCHLUESSEL = `${THEMA}/gleichzeitig`
const AUFGABEN = [
  {
    uebung: 'erkennen',
    art: 'markieren',
    anweisung: 'Tippe alle Verbformen im past progressive an.',
    satz: 'I was reading while my sister was cooking dinner.',
    zielWoerter: ['was', 'reading', 'cooking'],
    loesungen: [],
    erklaerung: 'past progressive = was/were + -ing'
  },
  {
    uebung: 'erkennen',
    art: 'sortieren',
    anweisung: 'Sortiere die Formen.',
    satz: '',
    gruppen: ['past progressive', 'simple past'],
    elemente: [
      { text: 'was playing', gruppe: 0 },
      { text: 'played', gruppe: 1 },
      { text: 'were running', gruppe: 0 },
      { text: 'ran', gruppe: 1 }
    ],
    loesungen: [],
    erklaerung: 'was/were + -ing ist past progressive.'
  },
  {
    uebung: 'erkennen',
    art: 'mehrfach',
    anweisung: 'Kreuze alle Sätze im past progressive an.',
    satz: '',
    optionen: ['They were swimming.', 'They swam.', 'She was laughing.', 'She laughs.'],
    loesungen: ['They were swimming.', 'She was laughing.'],
    erklaerung: 'was/were + -ing'
  },
  {
    uebung: 'bilden',
    art: 'frage',
    anweisung: 'Bilde die Frage zur Antwort.',
    satz: 'Tom was watching TV at eight.',
    vorgabe: '(What … at eight?)',
    anfang: 'What',
    loesungen: ['What was Tom doing at eight?'],
    erklaerung: 'Frage im past progressive: What was … doing?'
  },
  {
    uebung: 'anwenden',
    art: 'lueckentext',
    anweisung: 'Setze die Verben in der richtigen Zeitform ein.',
    kontext: 'Yesterday evening at seven o’clock …',
    satz: 'Mum ___ the dishes and Dad ___ the newspaper.',
    luecken: [
      { vorgabe: '(wash)', loesungen: ['was washing'] },
      { vorgabe: '(read)', loesungen: ['was reading'] }
    ],
    loesungen: [],
    erklaerung: 'Zwei Handlungen liefen zur selben Zeit: past progressive.'
  },
  {
    uebung: 'anwenden',
    art: 'verbinden',
    anweisung: 'Verbinde die Sätze mit while.',
    satz: 'I was walking home. It was raining.',
    vorgabe: '(while)',
    anfang: 'I was walking home',
    loesungen: ['I was walking home while it was raining.'],
    erklaerung: 'while verbindet zwei gleichzeitige Handlungen.'
  }
]

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let kurs = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const sp = await verwaltung.request.post(`${A}/server/grammatik-bank/speichern`, {
    headers: KOPF,
    data: { sprache: 'en', schluessel: SCHLUESSEL, regel: { titel: 'Gleichzeitige Handlungen', erklaerung: 'was/were + -ing', beispiele: ['I was reading while she was cooking.'] }, aufgaben: AUFGABEN }
  })
  const gespeichert = await sp.json()
  pruefe(gespeichert.aufgaben === AUFGABEN.length, `Bank: alle ${AUFGABEN.length} neuen Formate gespeichert (${gespeichert.aufgaben})`)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Fritz Format' } })).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1300, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (p, d) => (await lk.request.post(`${A}${p}`, { headers: KOPF, data: d })).json()
  kurs = (await post('/server/vokabeln/freigeben', { titel: 'Formate-Kurs', sprache: 'en', fach: 'Englisch', woerter: [], nurGrammatik: true, gaeste: true })).id
  const r = await post('/server/grammatik/aus-bank', { vokId: kurs, formen: [{ thema: THEMA, titel: 'Past progressive', teile: [SCHLUESSEL] }], info: { stufen: ['m'] } })
  const zid = r.ids?.[0]
  pruefe(Boolean(zid), 'Form dem Kurs zugewiesen')
  const paket = (await (await lk.request.get(`${A}/server/grammatik/${zid}`, { headers: KOPF })).json()).paket
  pruefe(paket?.aufgaben?.length === AUFGABEN.length, `Paket hat alle Formate (${paket?.aufgaben?.length})`)

  // ---------- Lehrkraft: „Aufgaben ansehen“ zeigt die neuen Formate wie bei Lernenden
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spat = p.getByRole('button', { name: 'Später einrichten' })
  if (await spat.isVisible().catch(() => false)) await spat.click()
  const zu = p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await zu.count()); i++) await zu.first().click()
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${kurs}"]`).click()
  const reiter = p.locator('[data-kurs-reiter="grammatik"]')
  await reiter.waitFor({ timeout: 15000 })
  await reiter.click()
  for (const j of await p.locator('[data-grammatik-band]:not([data-band-offen]) [data-band-kopf], [data-grammatik-unit][aria-expanded="false"], [data-grammatik-station][aria-expanded="false"]').all())
    await j.click().catch(() => undefined)
  await p.locator(`[data-grammatik-aktionen="${zid}"]`).click()
  await p.locator(`[data-grammatik-ansehen="${zid}"]`).click()
  await da(p.locator('[data-aufgaben-ansicht]'))
  for (const [sel, name] of [
    ['[data-markieren]', 'Markieren'],
    ['[data-sortieren]', 'Sortieren'],
    ['[data-mehrfach]', 'Mehrfachauswahl'],
    ['[data-satzaufgabe="frage"]', 'Frage bilden'],
    ['[data-lueckentext]', 'Lückentext'],
    ['[data-satzaufgabe="verbinden"]', 'Sätze verbinden'],
    ['[data-kontext]', 'Kontext-Vorlauf']
  ])
    pruefe(await da(p.locator(`[data-aufgaben-ansicht] ${sel}`), 5000), `„Aufgaben ansehen“: ${name}`)
  await p.screenshot({ path: join(out, '1-ansehen.png'), fullPage: true })
  await p.keyboard.press('Escape')

  // ---------- Gast übt alle Formate
  const code = (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.find((k) => k.id === kurs)?.code
  const g = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true })
  const h = await g.newPage()
  await h.goto(`${A}/s/vt/${code}`)
  await h.locator('[data-gastname]').fill('Ida F.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  await da(h.locator('[data-wieder-code]'))
  const gesehen = new Map()
  for (let runde = 0; runde < 4 && gesehen.size < AUFGABEN.length; runde++) {
    await h.goto(`${A}/s/g/${zid}`)
    await h.locator('[data-grammatik-start]').click({ timeout: 15000 })
    await h.locator('[data-regel-vorab-los]').click({ timeout: 2500 }).catch(() => undefined)
    await h.locator('[data-sitzung]').waitFor()
    for (let i = 0; i < 12; i++) {
      if (await h.locator('[data-sitzung-fertig]').isVisible().catch(() => false)) break
      const art = await h.locator('[data-aufgabe]').getAttribute('data-aufgabe')
      if (art === 'markieren') {
        await h.locator('[data-markier-wort="was"]').first().click()
        await h.locator('[data-markier-wort="reading"]').click()
        await h.locator('[data-markier-wort="was"]').nth(1).click()
        await h.locator('[data-markier-wort="cooking"]').click()
      } else if (art === 'sortieren') {
        for (const [t, gr] of [['was playing', 'past progressive'], ['played', 'simple past'], ['were running', 'past progressive'], ['ran', 'simple past']]) {
          await h.locator(`[data-sortier-element="${t}"]`).click()
          await h.locator(`[data-sortier-gruppe="${gr}"]`).click()
        }
      } else if (art === 'mehrfach') {
        await h.locator('[data-option="They were swimming."]').click()
        await h.locator('[data-option="She was laughing."]').click()
      } else if (art === 'frage') {
        pruefe(await da(h.locator('[data-satzanfang]', { hasText: 'What' }), 3000), 'Frage bilden: Satzanfang „What“ steht da')
        await h.locator('[data-satz-eingabe]').fill('was Tom doing at eight?')
      } else if (art === 'lueckentext') {
        pruefe(await da(h.locator('[data-kontext]'), 3000), 'Lückentext: Kontext-Vorlauf sichtbar')
        await h.locator('[data-luecke-nr="0"]').fill('was washing')
        await h.locator('[data-luecke-nr="1"]').fill('was reading')
      } else if (art === 'verbinden') {
        await h.locator('[data-satz-eingabe]').fill('while it was raining')
      } else {
        problems.push(`unerwartete Aufgabenart ${art}`)
        break
      }
      await h.locator('[data-pruefen]').filter({ visible: true }).first().click()
      const urteil = await h
        .locator('[data-urteil]')
        .first()
        .getAttribute('data-urteil', { timeout: 8000 })
        .catch(() => null)
      if (!gesehen.has(art)) gesehen.set(art, urteil)
      if (art === 'lueckentext') await h.screenshot({ path: join(out, '2-lueckentext.png'), fullPage: true })
      await h.locator('[data-weiter]').click({ timeout: 8000 }).catch(() => undefined)
      await h.waitForTimeout(400)
    }
  }
  for (const art of ['markieren', 'sortieren', 'mehrfach', 'frage', 'lueckentext', 'verbinden'])
    pruefe(gesehen.get(art) === 'richtig', `Gast: ${art} geübt und richtig gewertet (${gesehen.get(art) ?? 'nicht erschienen'})`)
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  if (kurs && lk) await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => null)
  await verwaltung.request.post(`${A}/server/grammatik-bank/speichern`, { headers: KOPF, data: { sprache: 'en', schluessel: SCHLUESSEL, regel: { titel: 'x', erklaerung: 'x', beispiele: [] }, aufgaben: [] } }).catch(() => null)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
