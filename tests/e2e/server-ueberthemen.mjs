// Überthemen (19.10.2026, abgestimmt mit der Lehrkraft):
//  1. Lehrkraft, „Meine Klassen" › Geschichte (NI, Gymnasium, Jahrgang 8): „Lernstand in Reihen & Blättern" ordnet Blätter
//     den Lehrplan-Themen zu („Industrialisierung und Soziale Frage"), Unpassendes unter „Weitere Materialien"; das Blatt
//     der Mitlehrkraft (gleicher Kurs) steht mit „von …" dabei; Stift benennt um (nur diese Lerngruppe); Umhängen.
//     „Reihen & Blätter" als Zeitleiste.
//  2. Mitlehrkraft öffnet das Blatt der Kollegin: nur ansehen.
//  3. Lernende/r: „Materialien" nach Überthemen (mit dem Namen der Lehrkraft); Reiter „Alle Jahrgänge" mit Jahrgang 8
//     und 7 (Blatt aus dem Vorjahr), Suche.
//  4. Vorschau beim Erstellen (Q-Phase): Geschichte 12 – „Die Große Pest und die Folgen" → Rahmenthema 1, Wahlmodul.
// Ohne KI. Aufruf: node tests/e2e/server-ueberthemen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-ueberthemen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8u${Date.now() % 1000}`
const INDUSTRIE = 'Industrialisierung und Soziale Frage'
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let schuleVorher = null
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  schuleVorher = (await (await verwaltung.request.get(`${A}/server/schule`, { headers: KOPF })).json()).schule
  const s = await verwaltung.request.post(`${A}/server/schule`, { headers: KOPF, data: { name: 'Testschule Überthemen', stateId: 'NI', schulformen: ['gymnasium'] } })
  pruefe(s.ok(), `Schule: Niedersachsen, Gymnasium (${s.status()})`)
  const konto = async (name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const la = await konto('Ute Thema')
  const lb = await konto('Max Mitlehrer')
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Ida Probe' } })).json()
  const ida = liste.angelegt[0]
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer ?? [])
    if (n.benutzer === ida.benutzer) zuLoeschen.push(n.id)

  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(ctxA, la.benutzer, la.passwort)
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(ctxB, lb.benutzer, lb.passwort)
  const post = async (ctx, pfad, data) => (await ctx.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const gA = await post(ctxA, '/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Geschichte', iservGruppe: `klasse:${KLASSE}` })
  const gB = await post(ctxB, '/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Geschichte', iservGruppe: `klasse:${KLASSE}` })
  const blatt = (ctx, g, titel, thema) =>
    post(ctx, '/server/blaetter/freigeben', {
      lerngruppeId: g.id,
      titel,
      fach: 'Geschichte',
      thema,
      html: '<div class="ws-page"><p>Probe</p></div>',
      aufgaben: [{ nr: 1, anweisung: 'Beschreibe.', erwartung: 'Etwas.' }],
      rueckmeldung: { grundlage: 'Probe' }
    })
  const b1 = await blatt(ctxA, gA, 'Arbeit in der Fabrik', 'Industrialisierung in England')
  const b2 = await blatt(ctxA, gA, 'Klassenfahrt-Infos', '')
  const b3 = await blatt(ctxA, gA, 'Die Revolution von 1789', 'Französische Revolution')
  const b4 = await blatt(ctxB, gB, 'Kinderarbeit', 'Soziale Frage im 19. Jahrhundert')
  pruefe(Boolean(b1.id && b2.id && b3.id && b4.id), 'Vier Blätter freigegeben (eins von der Mitlehrkraft)')
  // Mitlehrkraft nur per Einladung (23.10.2026): gleicher Kurs allein zeigt nichts
  const ohne = await ctxB.request.get(`${A}/server/blaetter/${b1.id}`, { headers: KOPF })
  pruefe(ohne.status() === 404, `Ohne Einladung sieht Max das Blatt der Kollegin nicht (${ohne.status()})`)
  const ohneThemen = await (await ctxA.request.get(`${A}/server/themen/${gA.id}`, { headers: KOPF })).json()
  pruefe(!ohneThemen.themen.some((x) => x.materialien.some((m) => m.id === b4.id)), 'Ohne Einladung kein Material der anderen Lehrkraft in den Überthemen')
  const fremd = await ctxB.request.post(`${A}/server/themen/${gA.id}/mitlehrkraefte`, { headers: KOPF, data: { ids: [lb.id] } })
  pruefe(fremd.status() === 404, `Max kann sich nicht selbst in Utes Lerngruppe einladen (${fremd.status()})`)
  const einl = await post(ctxA, `/server/themen/${gA.id}/mitlehrkraefte`, { ids: [lb.id] })
  pruefe(einl.eingeladen?.[0] === lb.id, 'Ute lädt Max ein')
  await post(ctxB, `/server/themen/${gB.id}/mitlehrkraefte`, { ids: [la.id] })
  // Blatt 3 ins Vorjahr (Testweg): Jahrgang 7
  const vorjahr = Date.parse(`${new Date().getFullYear() - (new Date().getMonth() >= 7 ? 1 : 2)}-11-10T10:00:00Z`)
  const tz = await ctxA.request.post(`${A}/server/themen/testzeit`, { headers: KOPF, data: { id: b3.id, zeit: vorjahr } })
  pruefe(tz.ok(), 'Blatt „Die Revolution von 1789" ins Vorjahr datiert')

  // ---------- Server: Zuordnung
  const t = await (await ctxA.request.get(`${A}/server/themen/${gA.id}`, { headers: KOPF })).json()
  const jetzt = t.themen.filter((x) => x.schuljahr === t.schuljahr)
  const ind = jetzt.find((x) => x.original === INDUSTRIE)
  pruefe(Boolean(ind && ind.materialien.some((m) => m.id === b1.id)), `„Arbeit in der Fabrik" → ${INDUSTRIE} (${jetzt.map((x) => x.name).join(' | ')})`)
  pruefe(Boolean(ind && ind.materialien.some((m) => m.id === b4.id && m.von === 'Max Mitlehrer')), 'Blatt der Mitlehrkraft mit „von Max Mitlehrer"')
  pruefe(Boolean(jetzt.find((x) => x.schluessel === 'weitere')?.materialien.some((m) => m.id === b2.id)), '„Klassenfahrt-Infos" unter „Weitere Materialien"')
  pruefe(!t.themen.some((x) => x.materialien.some((m) => m.art === 'rueckmeldung')), 'Rückmeldung zum Blatt ist kein eigenes Material (kein Doppelbalken)')
  const alt = t.themen.find((x) => x.materialien.some((m) => m.id === b3.id))
  pruefe(Boolean(alt && alt.schuljahr === t.schuljahr - 1 && alt.jahrgang === 7), `Vorjahr: Jahrgang 7 (${alt?.name}, ${alt?.jahrgang})`)

  // ---------- Oberfläche der Lehrkraft
  const p = await ctxA.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${KLASSE}"]`).click()
  await p.locator('[data-fach-leiste] [data-fach="Geschichte"]').click().catch(() => undefined)
  const kasten = p.locator('[data-fach-lernstand-kasten]')
  pruefe(await da(kasten.locator(`[data-ueberthema="${INDUSTRIE}"]`)), `Kasten: Überthema „${INDUSTRIE}"`)
  pruefe(await da(kasten.locator(`[data-ueberthema="${INDUSTRIE}"] [data-thema-material="blatt:${b4.id}"]`)), 'Kasten: Blatt der Mitlehrkraft dabei')
  pruefe(await da(p.locator('[data-fach-reihen-blaetter] [data-zeitleiste] [data-fach-eintrag="blatt"]').first()), '„Reihen & Blätter" als Zeitleiste')
  await p.screenshot({ path: join(out, '1-lehrkraft.png') })
  // Stift: umbenennen
  await kasten.locator(`[data-ueberthema="${INDUSTRIE}"] [data-ueberthema-stift]`).click()
  const feld = kasten.locator('[data-ueberthema-name-feld]')
  await feld.fill('Dampf und Fabrik')
  await feld.press('Enter')
  pruefe(await da(kasten.locator(`[data-ueberthema="${INDUSTRIE}"] [data-ueberthema-name]`, { hasText: 'Dampf und Fabrik' })), 'Stift: umbenannt in „Dampf und Fabrik"')
  // Umhängen: Klassenfahrt → Industrialisierung
  const weitere = kasten.locator('[data-ueberthema="Weitere Materialien"]')
  if (!(await weitere.locator('[data-ueberthema-materialien]').count())) await weitere.locator('[data-ueberthema-name]').click()
  await weitere.locator(`[data-thema-material="blatt:${b2.id}"] [data-umhaengen]`).click()
  await p.locator(`[data-umhaengen-ziel="${INDUSTRIE}"]`).click()
  pruefe(await da(kasten.locator(`[data-ueberthema="${INDUSTRIE}"] [data-thema-material="blatt:${b2.id}"]`)), 'Umhängen: „Klassenfahrt-Infos" jetzt unter dem Überthema')
  await p.screenshot({ path: join(out, '2-umbenannt.png') })
  // Zeitleiste: Klick öffnet das Blatt (Freigabe), nicht nur den Reiter
  await p.locator('[data-fach-reihen-blaetter] [data-zeitleiste] [data-fach-eintrag="blatt"]').first().click()
  pruefe(await da(p.locator('[data-zurueck="meineklassen"]')), 'Zeitleiste: Klick öffnet die Freigabe des Blatts (mit Rückweg)')
  await p.screenshot({ path: join(out, '2b-blatt-geoeffnet.png') })

  // Suche im Reiter „Unterrichtsreihen & Blätter" (19.10.2026)
  await p.goto(A)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${KLASSE}"]`).click()
  await p.locator('[data-reihen-suche]').fill('Fabrik')
  await p.waitForTimeout(300)
  const gefunden = await p.locator('[data-zeitleiste-liste] [data-material-titel]').evaluateAll((l) => l.map((x) => x.getAttribute('data-material-titel')))
  pruefe(gefunden.length === 1 && gefunden[0] === 'Arbeit in der Fabrik', `Suche filtert Reihen und Blätter (${gefunden.join(', ')})`)
  // ---------- Mitlehrkraft: Blatt der Kollegin nur ansehen
  const d = await ctxB.request.get(`${A}/server/blaetter/${b1.id}`, { headers: KOPF })
  pruefe(d.ok() && (await d.json()).nurLesen === true, 'Mitlehrkraft sieht das Blatt der Kollegin (nur ansehen)')
  const aendern = await ctxB.request.post(`${A}/server/blaetter/${b1.id}/status`, { headers: KOPF, data: { status: 'beendet' } })
  pruefe(aendern.status() === 404, `Mitlehrkraft kann es nicht beenden (${aendern.status()})`)

  // ---------- Lernende
  const sm = await browser.newContext({ viewport: { width: 1100, height: 1000 } })
  await anmelden(sm, ida.benutzer, ida.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { alt: ida.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const s0 = await sm.newPage()
  await s0.goto(`${A}/s/ordner/Geschichte?r=mat`)
  const th = s0.locator('[data-ordner-ueberthema="Dampf und Fabrik"]')
  pruefe(await da(th), 'Lernende: „Materialien" mit dem Namen der Lehrkraft')
  const inTh = await th.locator('.og-karte').allInnerTexts()
  pruefe(
    inTh.some((x) => x.includes('Arbeit in der Fabrik')) && inTh.some((x) => x.includes('Kinderarbeit')) && inTh.some((x) => x.includes('Klassenfahrt')),
    `Im Überthema: eigene, umgehängte und Blätter der Mitlehrkraft (${inTh.length})`
  )
  pruefe(!(await s0.locator('[data-ordner-register="mat"]').innerText()).includes('Die Revolution von 1789'), '„Materialien": nur das laufende Schuljahr')
  await s0.screenshot({ path: join(out, '3-lernende-materialien.png'), fullPage: true })
  pruefe(await da(s0.locator('[data-lasche="jahre"]')), 'Reiter „Alle Jahrgänge" (es gibt ein früheres Schuljahr)')
  await s0.locator('[data-lasche="jahre"]').click()
  await s0.locator('[data-ordner-alle-jahrgaenge]').waitFor()
  const jahrgaenge = await s0.locator('[data-ordner-jahrgang]').evaluateAll((l) => l.map((x) => x.getAttribute('data-ordner-jahrgang')))
  pruefe(JSON.stringify(jahrgaenge) === JSON.stringify(['8', '7']), `Jahrgänge absteigend (${jahrgaenge.join(', ')})`)
  await s0.locator('[data-ordner-jahrgang="7"] .og-jahr').click()
  pruefe(await da(s0.locator('[data-ordner-jahrgang="7"] .og-karte', { hasText: 'Die Revolution von 1789' })), 'Jahrgang 7: Blatt aus dem Vorjahr')
  await s0.locator('[data-ordner-suche]').fill('Revolution')
  await s0.waitForTimeout(300)
  const treffer = await s0.locator('[data-ordner-alle-jahrgaenge] .og-karte').allInnerTexts()
  pruefe(treffer.length === 1 && treffer[0].includes('Revolution'), `Suche filtert (${treffer.length})`)
  await s0.screenshot({ path: join(out, '4-alle-jahrgaenge.png'), fullPage: true })

  // ---------- Vorschau beim Erstellen (Q-Phase)
  const v = await (await ctxA.request.get(`${A}/server/themen/vorschau?fach=geschichte&jahrgang=12&thema=${encodeURIComponent('Die Große Pest und die Folgen')}`, { headers: KOPF })).json()
  pruefe(/^Rahmenthema 1/.test(v.ueberthema ?? '') && v.modul === 'Die Große Pest und die Folgen' && v.module.length > 10, `Q-Phase: ${v.semester ?? ''} ${v.ueberthema} › ${v.modul}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  if (schuleVorher) await verwaltung.request.post(`${A}/server/schule`, { headers: KOPF, data: schuleVorher }).catch(() => undefined)
  pruefe(true, `Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
