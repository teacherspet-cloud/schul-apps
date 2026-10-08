// „Lernende einer Klasse zuordnen" (08.10.2026): Eingetragene Lernende eines Kurses (Gäste mit persönlichem Anmeldecode)
// werden zusätzlich Mitglieder einer Lerngruppe aus „Meine Klassen". Prüft: Dialog im Kurs (Lernende-Karte), Server-Route,
// Anmeldung mit dem alten Code, danach sieht der Gast auch einen weiteren Kurs der Lerngruppe, „Meine Klassen" zeigt ihn
// mit „mit Anmeldecode". Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht. Räumt alles wieder ab.
// Aufruf: node tests/e2e/server-klasse-zuordnen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-klasse-zuordnen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const WOERTER = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
let gid = ''
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kara K' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}/server/${pfad}`, { headers: KOPF, data })).json()
  const get = async (pfad) => (await lk.request.get(`${A}/server/${pfad}`, { headers: KOPF })).json()

  // ---------- Klasse 5b (Meine Klassen) und ein Kurs „5b - Englisch" mit eingetragenen Lernenden
  gid = (await post('lerngruppen/anlegen', { name: '5b', fach: 'Englisch' })).id
  pruefe(Boolean(gid), 'Lerngruppe 5b angelegt')
  const vid = (await post('vokabeln/freigeben', { lerngruppeId: gid, titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: WOERTER, gaeste: true })).id
  kurse.push(vid)
  const ein = await post(`vokabeln/${vid}/eintragen`, { namen: ['Ben S.', 'Ida K.'] })
  const codes = ein.eingetragen ?? []
  pruefe(codes.length === 2, `Zwei Lernende mit Anmeldecode eingetragen (${codes.map((c) => c.name).join(', ')})`)
  // Ein zweiter Kurs nur für die Lerngruppe (ohne Code) – den sehen die Gäste erst nach dem Zuordnen
  const vid2 = (await post('vokabeln/freigeben', { lerngruppeId: gid, titel: 'Unit 2', sprache: 'en', fach: 'Englisch', woerter: WOERTER })).id
  kurse.push(vid2)

  const ben = codes.find((c) => c.name === 'Ben S.')
  const gast = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const vorher = await gast.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: ben.zugang } })
  pruefe(vorher.status() === 200, 'Ben meldet sich mit seinem Code an')
  const listeVorher = (await (await gast.request.get(`${A}/s/api/vokabeln`, { headers: KOPF })).json()).listen ?? []
  pruefe(listeVorher.length === 1 && listeVorher[0].id === vid, `Vorher: nur der eigene Kurs (${listeVorher.length})`)

  // ---------- Lehrkraft: Dialog im Kurs
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  await p.locator('[data-klasse-zuordnen-knopf]').click()
  pruefe(await da(p.locator('[data-klasse-zuordnen]')), 'Dialog „Lernende einer Klasse zuordnen" offen')
  // Vorauswahl: die Lerngruppe des Kurses
  pruefe(await da(p.locator('[data-zuordnen-liste]')), 'Lerngruppe des Kurses vorausgewählt, Liste der Lernenden da')
  pruefe((await p.locator('[data-zuordnen-liste] tr').count()) === 2, 'Beide Lernenden in der Liste')
  pruefe(await da(p.locator('[data-zuordnen-liste]').getByText('mit Anmeldecode').first()), 'Gekennzeichnet „mit Anmeldecode"')
  pruefe((await p.locator('[data-kurs-verbinden]').count()) === 0, 'Kein „verbinden" – der Kurs gehört schon zur 5b')
  await p.screenshot({ path: join(out, '1-dialog.png') })
  await p.locator('[data-zuordnen-los]').click()
  const zu = await p
    .locator('[data-klasse-zuordnen]')
    .waitFor({ state: 'detached', timeout: 10000 })
    .then(
      () => true,
      () => false
    )
  pruefe(zu, 'Zugeordnet, Dialog geschlossen')

  const g = await get(`klassen/${gid}`)
  const gl = (g.lernende ?? []).filter((l) => l.gast)
  pruefe(gl.length === 2 && gl.every((l) => !l.benutzer), `Meine Klassen: 2 Gäste in der 5b, ohne interne Kennung (${gl.map((l) => l.name).join(', ')})`)
  const nochmal = await post(`vokabeln/${vid}/klasse-zuordnen`, { lerngruppeId: gid })
  pruefe(nochmal.dazu === 0 && nochmal.schon === 2, 'Zweites Zuordnen: keine Doppelten')
  const st = await get(`vokabeln/${vid}`)
  pruefe(st.lernende.filter((l) => l.gast && /^[A-Z2-9]{8}$/.test(l.zugang ?? '')).length === 2, 'Codes unverändert lesbar')

  // ---------- Meine Klassen zeigt die Gäste
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 10000 })
  const karte = p.locator('[data-klasse]', { hasText: '5b' }).first()
  if (await karte.isVisible().catch(() => false)) {
    await karte.click()
    await p.waitForTimeout(1000)
    const reiter = p.getByRole('tab', { name: /Lernende/ })
    if (await reiter.isVisible().catch(() => false)) await reiter.click()
    pruefe(await da(p.locator('[data-mit-anmeldecode]').first()), 'Meine Klassen: Kennzeichen „mit Anmeldecode"')
    await p.screenshot({ path: join(out, '2-meine-klassen.png') })
  } else pruefe(false, 'Meine Klassen: Karte 5b nicht gefunden')

  // ---------- Gast: alter Code geht weiter, jetzt mit dem Kurs der Lerngruppe
  const neu = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const an = await neu.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: ben.zugang } })
  pruefe(an.status() === 200, 'Anmeldung mit dem bisherigen Code geht weiter')
  const liste = (await (await neu.request.get(`${A}/s/api/vokabeln`, { headers: KOPF })).json()).listen ?? []
  pruefe(liste.some((x) => x.id === vid) && liste.some((x) => x.id === vid2), `Danach: eigener Kurs und Kurs der Lerngruppe (${liste.length})`)
  const sp2 = await neu.newPage()
  await sp2.goto(`${A}/s/`)
  await sp2.waitForTimeout(2500)
  await sp2.screenshot({ path: join(out, '3-gast-start.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Kurse löschen (nimmt die Gastkonten mit), Lerngruppe, dann die Lehrkraft
  for (const id of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  if (gid && lk) await lk.request.post(`${A}/server/lerngruppen/loeschen`, { headers: KOPF, data: { id: gid } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurse, Gäste, Lerngruppe und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
