// Kurse aus IServ (10.10.2026). Ohne KI, ohne echten IServ.
// Vorher: Server lokal mit SCHULAPPS_ISERV_TESTANMELDUNG=1 (scripts/e2e-parallel.mjs setzt es): /auth/iserv-test spielt
// eine IServ-Anmeldung mit nachgebauten Rollen und Gruppen durch – derselbe Weg wie nach dem echten Rückruf.
// Prüft: Lernende melden sich mit Klassen- und Kursgruppen an; die Lehrkraft bekommt „Französisch 7 (Ktt)" usw. als
// Lerngruppen mit genau den Lernenden der IServ-Gruppe (nicht ganzen Klassen), fremde Kurse nicht; „aus IServ erkannt",
// Ausblenden/Einblenden und Umbenennen in „Meine Klassen"; Lernende sehen die Vokabeln ihres Kurses und ihre Kurse.
// Aufruf: node tests/e2e/server-iserv-kurse.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-iserv-kurse')
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
const gruppe = (name) => ({ act: `e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name })
const SCHUELER = { 'iserv:roles': [{ id: 'ROLE_STUDENT', displayName: 'Schüler' }] }
const LEHRER = { 'iserv:roles': [{ id: 'ROLE_TEACHER', displayName: 'Lehrer' }] }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 950 } })
/** IServ-Anmeldung mit nachgebauten Angaben in einem eigenen Browser-Kontext */
const iserv = async (benutzer, rolle, gruppen, ctx) => {
  const c = ctx ?? (await browser.newContext({ viewport: { width: 1400, height: 950 } }))
  const r = await c.request.post(`${A}/auth/iserv-test`, {
    headers: { 'content-type': 'application/json' },
    data: { sub: `e2e-${benutzer}`, preferred_username: benutzer, name: benutzer, ...rolle, 'iserv:groups': gruppen.map(gruppe) }
  })
  const d = await r.json()
  if (!r.ok()) throw new Error(`Testanmeldung ${benutzer}: ${d.fehler ?? r.status()}`)
  if (!zuLoeschen.includes(d.id)) zuLoeschen.push(d.id)
  return c
}
const seiteAuf = async (ctx) => {
  const p = await ctx.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  return p
}
try {
  await verwaltung.request.post(`${A}/auth/lokal`, { form: { benutzer: admin.benutzer, passwort: admin.passwort, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

  // ---------- Lernende melden sich über IServ an (Klasse + Kurse quer zu den Klassen)
  const anna = await iserv('e2ekurs.anna', SCHUELER, ['Klasse 7b', 'FR 7 Ktt', 'RE 7b/c Ktt'])
  const ben = await iserv('e2ekurs.ben', SCHUELER, ['Klasse 7c', 'FR 7 Ktt', 'WN 7 Abc'])
  const cem = await iserv('e2ekurs.cem', SCHUELER, ['Klasse 7b', 'SN 7 Abc', 'RE 7b/c Ktt'])
  const dora = await iserv('e2ekurs.dora', SCHUELER, ['EN 13 eA Ktt'])

  // ---------- Lehrkraft meldet sich an: ihre Kurse werden Lerngruppen
  const lk = await iserv('k.kurstest', LEHRER, ['Klasse 7b', 'FR 7 Ktt', 'RE 7b/c Ktt', 'EN 13 eA Ktt', 'SN 7 Abc', 'Fachschaft Englisch'])
  const uebersicht = async () => (await (await lk.request.get(`${A}/server/klassen`, { headers: KOPF })).json())
  let u = await uebersicht()
  const namen = u.klassen.map((k) => k.name).sort()
  pruefe(
    JSON.stringify(namen) === JSON.stringify(['Englisch 13 eA (Ktt)', 'Französisch 7 (Ktt)', 'Religion 7b/c (Ktt)']),
    `Lerngruppen aus IServ-Kursen, ohne fremden Kurs „SN 7 Abc" und ohne Fachschaft (${namen.join(', ')})`
  )
  pruefe(u.iservKuerzel?.kuerzel === 'Ktt', `Kürzel erkannt (${u.iservKuerzel?.kuerzel})`)
  const fr = u.klassen.find((k) => k.name === 'Französisch 7 (Ktt)')
  pruefe(fr?.iserv?.roh === 'FR 7 Ktt' && fr?.faecher?.[0]?.fach === 'Französisch', 'Französisch-Kurs: „aus IServ erkannt", Fach Französisch')
  const detail = async (id) => (await (await lk.request.get(`${A}/server/klassen/${id}`, { headers: KOPF })).json())
  const frD = await detail(fr.gruppen[0])
  const frLernende = frD.lernende.map((l) => l.benutzer).sort()
  pruefe(JSON.stringify(frLernende) === JSON.stringify(['e2ekurs.anna', 'e2ekurs.ben']), `Französisch: genau die Lernenden der IServ-Gruppe, nicht die ganze 7b (${frLernende.join(', ')})`)
  const re = u.klassen.find((k) => k.name === 'Religion 7b/c (Ktt)')
  const reLernende = (await detail(re.gruppen[0])).lernende.map((l) => l.benutzer).sort()
  pruefe(JSON.stringify(reLernende) === JSON.stringify(['e2ekurs.anna', 'e2ekurs.cem']), `Religion 7b/c: Anna und Cem (${reLernende.join(', ')})`)
  pruefe(Boolean(frD.klassenKurs), 'Französisch-Kurs hat seinen Kurs in „Sprachenlernen"')

  // ---------- Vokabeln für den Französisch-Kurs: nur dessen Lernende sehen sie
  const frei = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', lerngruppeId: fr.gruppen[0], woerter: [{ id: 'w1', term: 'le chien', translation: 'der Hund' }] }
    })
  ).json()
  pruefe(Boolean(frei.id), 'Vokabeln im Französisch-Kurs freigegeben')
  const listen = async (ctx) => JSON.stringify(await (await ctx.request.get(`${A}/s/api/vokabeln`, { headers: KOPF })).json())
  pruefe((await listen(anna)).includes('le chien') || (await listen(anna)).includes(frei.id), 'Anna (FR-Kurs) sieht die Vokabeln')
  pruefe(!(await listen(cem)).includes(frei.id), 'Cem (Spanisch, gleiche Klasse 7b) sieht sie nicht')
  const annaKurse = await (await anna.request.get(`${A}/s/api/iserv-kurse`, { headers: KOPF })).json()
  pruefe(
    annaKurse.klasse === '7b' && annaKurse.kurse.map((k) => k.name).join('|') === 'Französisch 7 (Ktt)|Religion 7b/c (Ktt)',
    `Anna: Klasse 7b, Kurse ${annaKurse.kurse?.map((k) => k.name).join(', ')}`
  )
  const benKurse = await (await ben.request.get(`${A}/s/api/iserv-kurse`, { headers: KOPF })).json()
  pruefe(benKurse.kurse?.map((k) => k.fach).join('|') === 'Französisch|Werte und Normen', `Ben: Französisch und Werte und Normen (${benKurse.kurse?.map((k) => k.fach).join(', ')})`)

  // ---------- Später angemeldet: gleich im Kurs; zweite Anmeldung der Lehrkraft legt nichts doppelt an
  await iserv('e2ekurs.emil', SCHUELER, ['Klasse 7d', 'FR 7 Ktt'])
  pruefe((await detail(fr.gruppen[0])).lernende.some((l) => l.benutzer === 'e2ekurs.emil'), 'Später angemeldeter Emil ist gleich im Französisch-Kurs')
  await iserv('k.kurstest', LEHRER, ['Klasse 7b', 'FR 7 Ktt', 'RE 7b/c Ktt', 'EN 13 eA Ktt', 'SN 7 Abc'], lk)
  pruefe((await uebersicht()).klassen.length === 3, 'Zweite Anmeldung: weiterhin drei Lerngruppen')

  // ---------- Meine Klassen: Abzeichen, Umbenennen, Ausblenden, Einblenden
  const p = await seiteAuf(lk)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  pruefe(await da(p.locator('[data-klasse="Französisch 7 (Ktt)"] [data-iserv-erkannt="FR 7 Ktt"]')), 'Karte „Französisch 7 (Ktt)" mit „aus IServ erkannt"')
  pruefe(await da(p.locator('[data-iserv-erkennung]')), 'Übersicht: Abschnitt „Aus IServ erkannt" mit Kürzel')
  await p.screenshot({ path: join(out, '1-uebersicht.png') })
  await p.locator('[data-klasse="Englisch 13 eA (Ktt)"]').click()
  await p.locator('[data-iserv-menue]').click()
  await p.locator('[data-iserv-umbenennen]').click()
  await p.locator('[data-iserv-name]').fill('Englisch LK 13')
  await p.locator('[data-iserv-name-ok]').click()
  await p.waitForTimeout(800)
  u = await uebersicht()
  pruefe(u.klassen.some((k) => k.name === 'Englisch LK 13'), 'Umbenannt in „Englisch LK 13"')
  await p.locator('[data-iserv-menue]').click()
  await p.locator('[data-iserv-ausblenden]').click()
  await p.locator('[data-iserv-ausblenden-ok]').click()
  pruefe(await da(p.locator('[data-iserv-ausgeblendet-eintrag="EN 13 eA Ktt"]')), 'Ausgeblendet: steht unter „Ausgeblendet" in der Übersicht')
  pruefe(!(await p.locator('[data-klasse="Englisch LK 13"]').count()), 'Karte ist weg')
  await p.screenshot({ path: join(out, '2-ausgeblendet.png') })
  await iserv('k.kurstest', LEHRER, ['FR 7 Ktt', 'RE 7b/c Ktt', 'EN 13 eA Ktt'], lk)
  pruefe(!(await uebersicht()).klassen.some((k) => /Englisch/.test(k.name)), 'Nächste Anmeldung: der ausgeblendete Kurs entsteht nicht wieder')
  await p.reload()
  await p.waitForTimeout(2000)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click().catch(() => undefined)
  await p.locator('[data-iserv-ausgeblendet-eintrag="EN 13 eA Ktt"] [data-iserv-einblenden]').click()
  pruefe(await da(p.locator('[data-klasse="Englisch 13 eA (Ktt)"]')), 'Wieder eingeblendet (neu angelegt)')
  const doraIn = (await uebersicht()).klassen.find((k) => k.name === 'Englisch 13 eA (Ktt)')
  pruefe(doraIn?.lernende === 1, `Englisch 13 eA: Dora wieder darin (${doraIn?.lernende})`)
  await p.screenshot({ path: join(out, '3-eingeblendet.png') })
  void dora
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
