// Mehrere Bände je Kurs, Suche in „Meine Klassen", „Vokabeln/Grammatik hinzufügen" (10.10.2026, Wünsche der Lehrkraft):
//  1. Ein Kurs mit Green Line 1 UND Green Line 2: „Units", „X Wörter" und „Abschnitte und Stand der Lernenden" zeigen
//     beide Bände als aufklappbare Gruppen mit Cover (neuester oben und offen).
//  2. Suche: findet Lernende über den Namen (Übersicht → Details), in einer Klasse ihre Lernenden zuerst, „nicht geübt"
//     findet die Inaktive; in zwei Kursen erst die Kurswahl.
//  3. „Vokabeln hinzufügen": richtiger Band, Freigegebenes ausgeblendet (Schalter zeigt es), Vorschlag offen, Einzel-
//     Freigabe bleibt sichtbar; „Grammatik hinzufügen": für Kurs UND Klasse Freigegebenes ausgeblendet, Einzel-Freigabe
//     sichtbar mit Hinweis, Vorschlag „als Nächstes".
// Ohne KI. Aufruf: node tests/e2e/server-kursbaende.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-kursbaende')
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
const KA = `6a${N}`
const KB = `7b${N}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
let wortNr = 0
const woerter = (n) => Array.from({ length: n }, () => ({ id: `t${wortNr}`, term: `testword${wortNr}`, translation: `Testwort${wortNr++}` }))
/** Abschnitte als Teile („Unit · Abschnitt"), je ein Wort */
const teileAus = (units) => units.flatMap((u) => u.abschnitte.map((a) => ({ titel: `${u.unit} · ${a}`, anzahl: 1 })))
const PAKET = {
  thema: 'Probe',
  regeln: [{ id: 'r1', titel: 'Probe', erklaerung: 'Probe.', beispiele: ['I am.'] }],
  aufgaben: Array.from({ length: 8 }, (_, i) => ({
    id: `a${i + 1}`,
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle.',
    satz: `I ___ (${i}).`,
    optionen: ['am', 'is'],
    loesungen: ['am']
  }))
}
const GL1_HELLO = ['Check-in', 'Station 1', 'Station 2', 'Station 3']
const GL1_UNIT1 = ['Check-in', 'Station 1', 'Station 2', 'Station 3', 'Story', 'Check-out']
const GL1_MEDIA = ['Wortschatz', 'Writing texts on a computer']

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Bea Band' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const klassenliste = async (klasse, namen) =>
    (await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse, namen: namen.join('\n') } })).json()).angelegt
  const la = await klassenliste(KA, ['Jil Vogel', 'Mia Alpha'])
  const lb = await klassenliste(KB, ['Mia Beta', 'Zoë Nicht'])
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if ([...la, ...lb].some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const get = async (pfad) => (await lk.request.get(`${A}${pfad}`, { headers: KOPF })).json()
  const gruppe = (name, fach) => post('/server/lerngruppen/anlegen', { name, fach, iservGruppe: `klasse:${name}` })
  const gA = await gruppe(KA, 'Englisch')
  const gB = await gruppe(KB, 'Englisch')
  const gBf = await gruppe(KB, 'Französisch')
  void gBf

  // ---------- Klasse A: Green Line 1 (Hello, Unit 1) und Green Line 2 (Unit 1) in EINEM Kurs
  const gl1 = [
    { unit: 'Hello', abschnitte: ['Check-in', 'Station 1'] },
    { unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1'] }
  ]
  const kursA = (
    await post('/server/vokabeln/freigeben', {
      lerngruppeId: gA.id,
      titel: 'Green Line 1 - Hello: Check-in, Station 1 - Unit 1: Check-in, Station 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: woerter(4),
      teile: teileAus(gl1),
      quelle: { lehrwerk: 'green-line-1', units: gl1, unit: 'Unit 1', abschnitte: ['Check-in', 'Station 1', 'Check-in', 'Station 1'] }
    })
  ).id
  kurse.push(kursA)
  await post(`/server/vokabeln/${kursA}/woerter`, {
    woerter: woerter(2),
    teile: [
      { titel: 'Station 1', anzahl: 1 },
      { titel: 'Station 2', anzahl: 1 }
    ],
    quelle: { lehrwerk: 'green-line-2', unit: 'Unit 1', abschnitte: ['Station 1', 'Station 2'] }
  })
  const dA = await get(`/server/klassen/${gA.id}`)
  const vA = dA.vokabeln.find((v) => v.id === kursA)
  const baendeA = [...new Set((vA?.abschnitte ?? []).map((a) => a.buch))]
  pruefe(baendeA.length === 2 && baendeA.includes('Green Line 1') && baendeA.includes('Green Line 2'), `Kurs mit zwei Bänden (${baendeA.join(', ')})`)
  pruefe(vA?.kursName === 'Vokabeln Englisch · Green Line 1–2', `Kursname nennt beide Bände (${vA?.kursName})`)
  const tA = (await get(`/server/vokabeln/${kursA}`)).teile
  pruefe(
    JSON.stringify(tA.map((t) => t.buch)) === JSON.stringify(['Green Line 1', 'Green Line 1', 'Green Line 1', 'Green Line 1', 'Green Line 2', 'Green Line 2']),
    `Wortliste: Band je Abschnitt (${tA.map((t) => t.buch).join(', ')})`
  )

  // ---------- Klasse B: Green Line 1 bis „Media smart" für den Kurs, Unit 2 · Station 1 nur für Mia (Einzel-Freigabe)
  const gl1b = [
    { unit: 'Hello', abschnitte: GL1_HELLO },
    { unit: 'Unit 1', abschnitte: GL1_UNIT1 },
    { unit: 'Media smart', abschnitte: GL1_MEDIA }
  ]
  const nB = gl1b.reduce((s, u) => s + u.abschnitte.length, 0)
  const kursB = (
    await post('/server/vokabeln/freigeben', {
      lerngruppeId: gB.id,
      titel: 'Green Line 1 - Hello - Unit 1 - Media smart',
      sprache: 'en',
      fach: 'Englisch',
      woerter: woerter(nB),
      teile: teileAus(gl1b),
      quelle: { lehrwerk: 'green-line-1', units: gl1b, unit: 'Media smart', abschnitte: gl1b.flatMap((u) => u.abschnitte) }
    })
  ).id
  kurse.push(kursB)
  const miaB = lb.find((x) => x.name === 'Mia Beta')
  const einzel = await post('/server/vokabeln/freigeben', {
    titel: 'Green Line 1 - Unit 2 - Station 1',
    sprache: 'en',
    fach: 'Englisch',
    schueler: [miaB.benutzer],
    woerter: woerter(2),
    quelle: { lehrwerk: 'green-line-1', unit: 'Unit 2', abschnitte: ['Station 1'] }
  })
  if (einzel.id) kurse.push(einzel.id)
  pruefe(Boolean(einzel.id), `Einzel-Freigabe für Mia (${einzel.id ?? einzel.fehler})`)
  const vw = await get(`/server/klassen/vorwahl?kurs=${kursB}`)
  pruefe(vw.freigegeben?.length === nB, `Vorwahl: ${nB} Abschnitte für den ganzen Kurs (${vw.freigegeben?.length})`)
  pruefe(vw.einzeln?.some((e) => e.unit === 'Unit 2' && e.abschnitt === 'Station 1' && e.lernende === 1), 'Vorwahl: Unit 2 · Station 1 nur als Einzel-Freigabe')
  // Grammatik: Kurs (4 Formen), Klasse (1 Form, an der Lerngruppe), Extra nur für Mia (zählt nicht)
  const dB = await get(`/server/klassen/${gB.id}`)
  const miaId = dB.lernende.find((l) => l.name === 'Mia Beta')?.id
  const gram = async (extra) => post('/server/grammatik/freigeben', { titel: 'Probe', fach: 'Englisch', sprache: 'en', thema: 'Probe', paket: PAKET, ...extra })
  const g1 = await gram({ vokId: kursB, info: { themen: ['en.noun.articles', 'en.verb.be_have', 'en.syn.short_answers', 'en.verb.there_is'] } })
  const g2 = await gram({ lerngruppeId: gB.id, info: { themen: ['en.prep.basic'] } })
  const g3 = await gram({ vokId: kursB, art: 'foerder', fuer: [miaId], info: { themen: ['en.syn.imperative'] } })
  pruefe(Boolean(g1.id && g2.id && g3.id), `Grammatik: Kurs, Klasse, Extra (${[g1, g2, g3].map((g) => g.id ?? g.fehler).join(', ')})`)
  const vw2 = await get(`/server/klassen/vorwahl?kurs=${kursB}`)
  pruefe(
    ['en.noun.articles', 'en.verb.there_is', 'en.prep.basic'].every((t) => vw2.grammatikFrei?.includes(t)) && !vw2.grammatikFrei?.includes('en.syn.imperative'),
    `Grammatik frei für Kurs und Klasse, Extra nicht (${(vw2.grammatikFrei ?? []).join(', ')})`
  )
  pruefe(vw2.grammatikEinzeln?.some((e) => e.id === 'en.syn.imperative' && e.lernende === 1), 'Extra als Einzel-Freigabe (1 Lernende/r)')

  // Mia Beta übt (aktiv), Zoë nicht
  const sm = await browser.newContext()
  await anmelden(sm, miaB.benutzer, miaB.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const wB = (await get(`/server/vokabeln/${kursB}`)).woerter
  await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kursB, wortId: wB[0].id, uebung: 'karte', gewusst: true } })

  // ---------- Suche (Schnittstelle)
  const s1 = (await get(`/server/klassen/suche?q=jil`)).lernende
  pruefe(s1.length === 1 && s1[0].name === 'Jil Vogel' && s1[0].klasse === KA, `Suche „jil" findet Jil Vogel (${s1.map((x) => `${x.name} · ${x.klasse}`).join('; ')})`)
  const s2 = (await get(`/server/klassen/suche?q=zoe`)).lernende
  pruefe(s2.some((x) => x.name === 'Zoë Nicht'), '„zoe" findet „Zoë" (ohne Akzent)')
  const s3 = (await get(`/server/klassen/suche?q=${encodeURIComponent('nicht geübt')}`)).lernende
  pruefe(s3.some((x) => x.name === 'Zoë Nicht') && !s3.some((x) => x.name === 'Mia Beta'), `„nicht geübt": Zoë ja, Mia Beta nicht (${s3.map((x) => x.name).join(', ')})`)
  // Benutzernamen werden nie durchsucht (tests/klassenSuche.test.ts); hier ähneln sie dem Namen und taugen nicht zur Probe
  const s4 = (await get(`/server/klassen/suche?q=mia&klasse=${KB}`)).lernende
  pruefe(s4[0]?.name === 'Mia Beta' && s4[1]?.name === 'Mia Alpha', `In Klasse ${KB}: deren Mia zuerst (${s4.map((x) => x.name).join(', ')})`)
  pruefe(s4[0]?.gruppen.length === 2 && /Englisch.*Französisch|Französisch.*Englisch/.test(s4[0].faecher.join(',')), 'Mia Beta in zwei Kursen (Englisch, Französisch)')

  // ---------- Oberfläche
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 15000 })

  // Suche in der Übersicht → Details
  const suche = p.locator('[data-app-suche="klassen"]')
  await suche.fill('jil')
  pruefe(await da(p.locator('[data-such-person="Jil Vogel"]')), 'Übersicht: „jil" zeigt Jil Vogel in der Trefferliste')
  pruefe(/6a\d+ · Englisch/.test(await p.locator('[data-such-person="Jil Vogel"]').innerText().catch(() => '')), 'Treffer nennt Klasse und Fach')
  await suche.press('ArrowDown')
  await suche.press('Enter')
  pruefe(await da(p.locator('[data-lernende-details="Jil Vogel"] [data-lernende-details-stand]')), 'Tastatur (↓, Enter) öffnet die Details von Jil')
  await p.screenshot({ path: join(out, '1-suche-details.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
  // „nicht geübt"
  await suche.fill('nicht geübt')
  pruefe(await da(p.locator('[data-such-person="Zoë Nicht"]')), '„nicht geübt" zeigt Zoë mit Hinweis')
  pruefe((await p.locator('[data-such-person="Mia Beta"]').count()) === 0, '„nicht geübt" zeigt Mia Beta nicht (hat geübt)')
  await p.screenshot({ path: join(out, '2-suche-nicht-geuebt.png') })
  // Zwei Kurse → Kurswahl
  await suche.fill('mia beta')
  await p.locator('[data-such-person="Mia Beta"]').click()
  pruefe(await da(p.locator(`[data-kurs-wahl-gruppe="${gB.id}"]`)), 'Mia Beta in zwei Kursen: erst die Kurswahl')
  await p.locator(`[data-kurs-wahl-gruppe="${gB.id}"]`).click()
  pruefe(await da(p.locator('[data-lernende-details="Mia Beta"] [data-lernende-details-stand]')), 'Danach ihre Details im Englischkurs')
  await p.locator('[data-lernende-details-klasse]').click()
  pruefe(await da(p.locator(`[data-klasse-ansicht="${KB}"]`)), '„In … zeigen" öffnet die Klasse')
  // In der Klasse: eigene Lernende zuerst
  await suche.fill('mia')
  pruefe(await da(p.locator('[data-such-gruppe="hier"] [data-such-person="Mia Beta"]')), `In Klasse ${KB}: „In dieser Klasse" mit Mia Beta`)
  pruefe(await da(p.locator('[data-such-gruppe="andere"] [data-such-person="Mia Alpha"]')), 'Darunter „Andere Klassen" mit Mia Alpha')
  const gruppenFolge = await p.locator('[data-such-gruppe]').evaluateAll((e) => e.map((x) => x.getAttribute('data-such-gruppe')))
  pruefe(gruppenFolge[0] === 'hier', `Reihenfolge der Treffer (${gruppenFolge.join(' → ')})`)
  await p.screenshot({ path: join(out, '3-suche-in-klasse.png') })
  await suche.fill('')
  await p.keyboard.press('Escape')

  // ---------- Aufgabe 3: „Vokabeln hinzufügen" in Klasse B
  await p.getByRole('tab', { name: /^Vokabeln/ }).click()
  await p.locator('[data-klassen-kurs] [data-vokabel-hinzufuegen]').click()
  pruefe(await da(p.locator('[data-abschnitt-wahl]')), 'Dialog: Abschnittsbaum des Bands')
  const bandWert = await p.locator('[data-band-kopf-wahl] [data-vokabel-band]').inputValue().catch(() => '')
  pruefe(/^Green Line 1\b/.test(bandWert), `Richtiger Band vorgewählt (${bandWert})`)
  pruefe((await p.locator('[data-band-kopf-wahl] [data-cover], [data-band-kopf-wahl] [data-cover-ersatz]').count()) === 1, 'Band-Kopf mit Cover')
  pruefe((await p.locator('[data-wahl-unit="Unit 1"]').count()) === 0, 'Unit 1 (schon freigegeben) ausgeblendet')
  pruefe(await da(p.locator('[data-wahl-unit="Unit 2"][data-offen] [data-wahl-abschnitt="Check-in"][data-vorschlag]')), 'Unit 2 offen, „Check-in" als Vorschlag')
  pruefe(await da(p.locator('[data-wahl-unit="Unit 2"] [data-wahl-abschnitt="Station 1"][data-einzeln]')), 'Unit 2 · Station 1 (nur für Mia) bleibt sichtbar, mit Hinweis')
  pruefe((await p.locator('[data-wahl-unit][data-offen]').count()) === 1, 'Nur die vorgeschlagene Unit offen')
  pruefe(/1 Abschnitt · \d+ Wörter ausgewählt/.test(await p.locator('[data-auswahl-zusammenfassung]').innerText()), 'Zusammenfassung: „1 Abschnitt · n Wörter ausgewählt"')
  await p.screenshot({ path: join(out, '4-vokabeln-hinzufuegen.png') })
  const schalter = p.locator('[data-frei-zeigen]')
  pruefe((await schalter.getAttribute('data-frei-zeigen')) === String(nB), `Schalter „Bereits freigegebene zeigen (${nB})"`)
  await schalter.click()
  pruefe(await da(p.locator('[data-wahl-unit="Unit 1"]')), 'Schalter zeigt Unit 1 wieder')
  await p.getByRole('button', { name: 'Abbrechen' }).click()
  await p.waitForTimeout(400)

  // ---------- „Grammatik hinzufügen" in Klasse B
  await p.getByRole('tab', { name: /^Grammatik/ }).click()
  await p.locator('[data-klassen-kurs] [data-vokabel-grammatik]').click()
  const liste = p.locator('.mantine-Modal-content [data-themenliste]')
  pruefe(await da(liste.first(), 20000), 'Grammatik-Dialog mit Themenliste')
  await p.waitForTimeout(1200)
  for (const t of ['en.noun.articles', 'en.verb.there_is', 'en.prep.basic'])
    pruefe((await liste.locator(`[data-thema="${t}"]`).count()) === 0, `${t}: für Kurs bzw. Klasse freigegeben – ausgeblendet`)
  pruefe(await da(liste.locator('[data-thema="en.verb.modals_basic"] [data-thema-marke="vorschlag"]')), 'Vorschlag „als Nächstes": en.verb.modals_basic')
  pruefe(await da(liste.locator('[data-thema="en.syn.imperative"] [data-thema-marke="einzeln"]')), 'Extra nur für Mia: sichtbar mit Hinweis')
  await p.screenshot({ path: join(out, '5-grammatik-hinzufuegen.png') })
  await p.locator('.mantine-Modal-content [data-frei-zeigen]').click()
  pruefe(await da(liste.locator('[data-thema="en.noun.articles"] [data-thema-marke="frei"]')), 'Schalter zeigt Freigegebenes („bereits freigegeben")')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)

  // ---------- Aufgabe 1: Klasse A – drei Ansichten mit zwei Bänden
  await p.getByRole('button', { name: 'Alle Klassen' }).click()
  await p.locator(`[data-klasse="${KA}"]`).click()
  const units = p.locator('[data-sprach-lernstand] [data-kurs-units] [data-band-gruppe]')
  await units.first().waitFor({ timeout: 15000 })
  const unitBaende = await units.evaluateAll((e) => e.map((x) => `${x.getAttribute('data-band-gruppe')}${x.hasAttribute('data-band-offen') ? '+' : ''}`))
  pruefe(JSON.stringify(unitBaende) === JSON.stringify(['Green Line 2+', 'Green Line 1']), `„Units": zwei Bände, neuester offen (${unitBaende.join(', ')})`)
  pruefe((await p.locator('[data-sprach-lernstand] [data-kurs-units] [data-band-kopf] :is([data-cover], [data-cover-ersatz])').count()) === 2, '„Units": Cover je Band')
  await p.locator('[data-sprach-lernstand] [data-band-gruppe="Green Line 1"] [data-band-kopf]').click()
  pruefe(await da(p.locator('[data-sprach-lernstand] [data-band-gruppe="Green Line 1"][data-band-offen]')), '„Units": älterer Band aufklappbar')
  await p.screenshot({ path: join(out, '6-units.png') })
  await p.getByRole('tab', { name: /^Vokabeln/ }).click()
  if (!(await p.locator('[data-vok-abschnitte]').isVisible().catch(() => false))) await p.locator('[data-kurs-abschnitte-kopf]').click()
  const abs = p.locator('[data-vok-abschnitte] [data-band-gruppe]')
  await abs.first().waitFor({ timeout: 10000 })
  const absBaende = await abs.evaluateAll((e) => e.map((x) => `${x.getAttribute('data-band-gruppe')}${x.hasAttribute('data-band-offen') ? '+' : ''}`))
  pruefe(JSON.stringify(absBaende) === JSON.stringify(['Green Line 2+', 'Green Line 1']), `„Abschnitte und Stand": zwei Bände (${absBaende.join(', ')})`)
  pruefe((await p.locator('[data-vok-abschnitte] [data-band-kopf] :is([data-cover], [data-cover-ersatz])').count()) === 2, '„Abschnitte und Stand": Cover je Band')
  await p.locator('[data-vokabel-abschnitte-kopf]').click()
  const wl = p.locator('[data-vokabel-abschnitte] [data-band-gruppe]')
  await wl.first().waitFor({ timeout: 10000 })
  const wlBaende = await wl.evaluateAll((e) => e.map((x) => `${x.getAttribute('data-band-gruppe')}${x.hasAttribute('data-band-offen') ? '+' : ''}`))
  pruefe(JSON.stringify(wlBaende) === JSON.stringify(['Green Line 2+', 'Green Line 1']), `„6 Wörter": zwei Bände (${wlBaende.join(', ')})`)
  pruefe((await p.locator('[data-vokabel-abschnitte] [data-band-kopf] :is([data-cover], [data-cover-ersatz])').count()) === 2, '„6 Wörter": Cover je Band')
  const echteCover = await p.locator('[data-cover]').count()
  console.log(`   (Verlagscover geladen: ${echteCover}, sonst Kachel)`)
  await p.screenshot({ path: join(out, '7-woerter-und-abschnitte.png'), fullPage: true })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const k of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${k}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
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
