// „Blatt freigeben" direkt in der App „Freigegebene Blätter" (03.10.2026): gespeichertes Blatt im Pop-up wählen,
// einer Lerngruppe bzw. einer einzelnen Person zuordnen. Ohne KI.
// Vorher: Server lokal (IServ NICHT eingerichtet). Vorlage: jüngstes Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt-waehlen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-waehlen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7w${Date.now() % 1000}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 2)

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nTim Test' } })
  ).json()
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  for (const [id, name] of [
    ['blatt-probe', 'Blatt-Probe'],
    ['blatt-andere', 'Ganz anderes Blatt']
  ])
    await lk.request.post(`${A}/api`, {
      headers: KOPF,
      data: { channel: 'sheets:save', args: [{ id, name, stats: { sheetCount: 1 }, payload: vorlage.payload }] }
    })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  pruefe(await da(p.locator('[data-freigaben] [data-blatt-waehlen-knopf]')), 'Knopf „Blatt freigeben" in der App')
  await p.locator('[data-blatt-waehlen-knopf]').click()
  pruefe(await da(p.locator('[data-blatt-wahl]').first()), 'Pop-up listet die gespeicherten Blätter')
  pruefe((await p.locator('[data-blatt-wahl]').count()) === 2, `Zwei Blätter zur Wahl (${await p.locator('[data-blatt-wahl]').count()})`)
  await p.locator('[data-blatt-suche]').fill('probe')
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-blatt-wahl]').count()) === 1, 'Suche grenzt ein')
  await p.screenshot({ path: join(out, '1-auswahl.png') })
  await p.locator('[data-blatt-wahl="Blatt-Probe"]').click()
  pruefe(await da(p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })), 'Freigabe-Dialog für das gewählte Blatt')
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  // Nur eine Person
  await dlg.getByPlaceholder('alle').click()
  await p.getByRole('option', { name: /Mia/ }).click()
  await p.keyboard.press('Escape').catch(() => undefined)
  await p.screenshot({ path: join(out, '2-freigabe.png') })
  await dlg.locator('[data-blatt-freigeben]').click()
  pruefe(
    await da(dlg, 1000).then(() =>
      dlg.waitFor({ state: 'hidden', timeout: 20000 }).then(
        () => true,
        () => false
      )
    ),
    'Dialog schließt nach der Freigabe'
  )
  const freigaben = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? []
  const fr = freigaben[0]
  pruefe(freigaben.length === 1 && fr?.lerngruppe === KLASSE && fr?.schueler === 1, `Freigabe für eine Person der ${KLASSE} (${fr?.titel}, ${fr?.schueler})`)
  pruefe(
    await da(
      p
        .locator('[data-freigaben]')
        .getByText(fr?.titel ?? '§§', { exact: true })
        .first()
    ),
    'Liste der App zeigt das neue Blatt sofort'
  )
  await p.screenshot({ path: join(out, '3-liste.png') })
  // Die gewählte Person sieht das Blatt, die andere nicht
  const sichtbarFuer = async (konto) => {
    const c = await browser.newContext()
    await anmelden(c, konto.benutzer, konto.passwort)
    await c.request.post(`${A}/auth/passwort`, {
      form: { alt: konto.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
      headers: { origin: A },
      maxRedirects: 0
    })
    const d = await (await c.request.get(`${A}/s/api/blaetter`, { headers: KOPF })).json()
    await c.close()
    return JSON.stringify(d).includes(fr?.id ?? '§§')
  }
  const mia = liste.angelegt.find((a) => /Mia/.test(a.name ?? '')) ?? liste.angelegt[0]
  const tim = liste.angelegt.find((a) => a !== mia)
  pruefe(await sichtbarFuer(mia), 'Mia sieht das Blatt')
  pruefe(!(await sichtbarFuer(tim)), 'Tim sieht es nicht')
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
