// Schrittweise Freischaltung mit Ampel (05.10.2026): Nur Aufgabe 1 ist sichtbar; nach KI-Feedback „teilweise"
// erscheint Aufgabe 2; die Lehrkraft schaltet Aufgabe 3 frei; Feedback zu gesperrten Aufgaben lehnt der Server ab.
// Vorher: Server lokal mit KI-Attrappe („blatt_aufgabe_feedback" = teilweise), IServ NICHT eingerichtet.
// Vorlage: jüngstes Arbeitsblatt mit mindestens drei Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt-schrittweise.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-schrittweise')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8s${Date.now() % 1000}`
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
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 3)

// Einstiegskasten vor der ersten Aufgabe und Merkkasten am Ende – nur der Merkkasten wartet aufs Ende (06.10.2026)
const mitKaesten = (payload) => {
  const p = structuredClone(payload)
  const bloecke = p.sheets[0].blocks.filter((b) => b.type !== 'infoBox' && b.type !== 'scaffold')
  const kasten = (id, variant, title, body) => ({ id, type: 'infoBox', variant, title, body, stars: 1 })
  const erste = bloecke.findIndex((b) => b.type === 'task')
  bloecke.splice(erste, 0, kasten('einstieg', 'wissen', 'Einstieg', 'Worum es heute geht.'))
  bloecke.push(kasten('merk', 'merke', 'Merke', 'Das Wichtigste zum Schluss.'))
  // Material direkt hinter Aufgabe 1, auf das keine Aufgabe verweist: erscheint mit Aufgabe 2
  const nachErster = bloecke.findIndex((b) => b.type === 'task') + 1
  bloecke.splice(nachErster, 0, {
    id: 'spaetmat',
    type: 'text',
    title: 'Spätes Material',
    body: 'Erst für die zweite Aufgabe.',
    lineNumbers: false,
    source: '',
    glossary: []
  })
  // Hilfekarten zu Aufgabe 1 (am ?-Symbol), Satzanfänge hinter Aufgabe 2 (gesperrt bis zur Freischaltung)
  const aufgabenIdx = bloecke.map((b, i) => (b.type === 'task' ? i : -1)).filter((i) => i >= 0)
  bloecke.splice(aufgabenIdx[1] + 1, 0, { id: 'satz2', type: 'scaffold', variant: 'satzanfaenge', title: 'Satzanfänge', items: ['Zunächst …', 'Außerdem …'] })
  bloecke.splice(aufgabenIdx[0] + 1, 0, {
    id: 'karten1',
    type: 'scaffold',
    variant: 'hilfekarten',
    title: 'Hilfekarten zu Aufgabe 1',
    items: ['Erste Hilfe', 'Zweite Hilfe', 'Dritte Hilfe']
  })
  p.sheets[0].blocks = bloecke
  return p
}
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
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)
  const miaId = (u0.nutzer ?? []).find((n) => n.benutzer === mia.benutzer)?.id

  // ---------- Lehrkraft: über „Blatt freigeben" mit „schrittweise"
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-schritt', name: 'Blatt-Schritt', stats: { sheetCount: 1 }, payload: mitKaesten(vorlage.payload) }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-Schritt"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.locator('[data-blatt-schrittweise]').check()
  await dlg.getByLabel('Merkkästen erst nach vollständiger Bearbeitung zeigen').check()
  await p.screenshot({ path: join(out, '1-freigabe.png') })
  await dlg.locator('[data-blatt-freigeben]').click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })
  const fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? [])[0]
  pruefe(fr?.einstellungen?.schrittweise === true && fr?.einstellungen?.aufgabenFeedback === true, 'Freigabe ist schrittweise (mit Feedback je Aufgabe)')

  // ---------- Mia: nur Aufgabe 1
  const sm = await browser.newContext({ viewport: { width: 1180, height: 1000 } })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  const blatt = s.frameLocator('iframe').first()
  const gesperrt0 = await blatt.locator('.ws-task.sa-gesperrt:not(.ws-continued)').count()
  const alle = await blatt.locator('.ws-task:not(.ws-continued)').count()
  pruefe(alle >= 3 && gesperrt0 === alle - 1, `Nur Aufgabe 1 sichtbar (${alle - gesperrt0} von ${alle})`)
  pruefe((await s.locator('[data-ampel-nr="1"][data-ampel="rot"]').count()) === 1, 'Ampel von Aufgabe 1 steht auf Rot')
  pruefe((await s.locator('[data-ampel-nr="2"]').count()) === 0, 'Gesperrte Aufgaben haben weder Ampel noch Prüfen-Knopf')
  await s.screenshot({ path: join(out, '2-nur-aufgabe-1.png') })
  const kaesten = await blatt
    .locator('.ws-info')
    .evaluateAll((e) => e.map((x) => [x.textContent?.includes('Einstieg') ? 'einstieg' : 'merk', x.classList.contains('sa-gesperrt')]))
  pruefe(
    kaesten.some(([k, g]) => k === 'einstieg' && !g),
    `Einstiegskasten vor der ersten Aufgabe bleibt sichtbar (${JSON.stringify(kaesten)})`
  )
  pruefe(
    kaesten.some(([k, g]) => k === 'merk' && g),
    'Merkkasten am Ende wartet, bis alle Aufgaben bearbeitet sind'
  )
  // Hilfen (06.10.2026): Satzanfänge zu Aufgabe 2 gesperrt, Hilfekarten-Seite weg, ?-Symbol an Aufgabe 1
  const satz = await blatt
    .locator('[data-hilfe-block="satz2"]')
    .first()
    .evaluate((e) => [e.classList.contains('sa-gesperrt'), e.getAttribute('data-sperre') ?? ''])
  pruefe(satz[0] && /Aufgabe 2/.test(satz[1]), `Satzanfänge zu Aufgabe 2 anfangs gesperrt („${satz[1]}")`)
  const kartenSeite = await blatt.locator('.ws-helpcards-page').count()
  const abgelegt = await blatt.locator('#sa-hilfekarten .ws-scaffold-hilfekarten').count()
  pruefe(kartenSeite === 0 && abgelegt === 1, `Seite „Tipp- und Hilfekarten" digital entfernt, Karten abgelegt (${kartenSeite}/${abgelegt})`)
  pruefe((await s.locator('[data-hilfe-nr="1"]').count()) === 1, '?-Symbol rechts neben Aufgabe 1')
  const [fenster] = await Promise.all([s.waitForEvent('popup', { timeout: 10000 }), s.locator('[data-hilfe-nr="1"]').click()])
  await fenster.waitForLoadState()
  pruefe(
    (await fenster.locator('[data-karte]').count()) === 1 && (await fenster.locator('[data-karte="1"]').innerText()).includes('Erste Hilfe'),
    'Eigenes Fenster: zuerst nur Hilfe 1'
  )
  await fenster.locator('#weiter').click()
  pruefe((await fenster.locator('[data-karte]').count()) === 2, 'Nächste Hilfe öffnet Karte 2')
  await fenster.screenshot({ path: join(out, '2b-hilfefenster.png') })
  await fenster.close()
  await s.waitForTimeout(800)
  const spaet = await blatt
    .locator('.ws-flow[data-fluss="spaetmat"] > .ws-block')
    .first()
    .evaluate((e) => [e.classList.contains('sa-gesperrt'), e.getAttribute('data-sperre') ?? ''])
  pruefe(spaet[0] && /erscheint mit Aufgabe 2/.test(spaet[1]), `Material für Aufgabe 2 ist anfangs gesperrt („${spaet[1]}")`)
  // Gesperrte Aufgabe: Server lehnt Feedback ab
  const gesperrt = await sm.request.post(`${A}/s/api/blatt/aufgabe`, { headers: KOPF, data: { id: fr.id, nr: 3, antworten: {}, felder: [] } })
  pruefe(gesperrt.status() === 403, `Feedback zu gesperrter Aufgabe 3 abgelehnt (${gesperrt.status()})`)
  // Aufgabe 1 bearbeiten, Feedback (Attrappe: „teilweise") → Aufgabe 2 erscheint
  await s.locator('input[data-feld], textarea[data-feld]').first().fill('My first answer')
  await s.locator('[data-aufgabe-pruefen="1"]').click()
  await s.locator('[data-aufgabe-pruefen-los]').click()
  pruefe(await da(s.locator('[data-ampel-nr="1"][data-ampel="gelb"]'), 30000), 'Nach „teilweise" steht Aufgabe 1 auf Gelb')
  await s.waitForTimeout(600)
  const gesperrt1 = await blatt.locator('.ws-task.sa-gesperrt:not(.ws-continued)').count()
  pruefe(gesperrt1 === alle - 2, `Aufgabe 2 ist jetzt freigeschaltet (${alle - gesperrt1} sichtbar)`)
  pruefe(
    !(await blatt
      .locator('.ws-flow[data-fluss="spaetmat"] > .ws-block')
      .first()
      .evaluate((e) => e.classList.contains('sa-gesperrt'))),
    'Mit Aufgabe 2 erscheint auch ihr Material'
  )
  pruefe((await s.locator('[data-ampel-nr="2"][data-ampel="rot"]').count()) === 1, 'Aufgabe 2 hat eine rote Ampel')
  await s.keyboard.press('Escape').catch(() => undefined)
  await s.screenshot({ path: join(out, '3-aufgabe-2-frei.png') })

  // ---------- Lehrkraft: Ampeln je Person, Aufgabe 2 freischalten → Aufgabe 3 sichtbar
  await p.locator('[data-freigabe-oeffnen]').first().click()
  pruefe(await da(p.locator('[data-ampel-reihe] [data-ampel-aufgabe="1"][data-ampel="gelb"]')), 'Lehrkraft sieht Aufgabe 1 gelb')
  await p.locator('[data-ampel-reihe] [data-ampel-aufgabe="2"]').click()
  pruefe(await da(p.locator('[data-ampel-reihe] [data-ampel-aufgabe="2"][data-ampel="gelb"]')), 'Freischalten durch die Lehrkraft: Aufgabe 2 gelb')
  await p.screenshot({ path: join(out, '4-lehrkraft.png') })
  const roh = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  pruefe((roh.freigeschaltet ?? []).includes(2), 'Die Freischaltung kommt bei Mia an')
  await s.reload()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  const gesperrt2 = await s.frameLocator('iframe').first().locator('.ws-task.sa-gesperrt:not(.ws-continued)').count()
  pruefe(gesperrt2 === Math.max(0, alle - 3), `Nach der Freischaltung ist Aufgabe 3 sichtbar (${alle - gesperrt2} sichtbar)`)
  await s.screenshot({ path: join(out, '5-aufgabe-3-frei.png') })
  pruefe(Boolean(miaId), 'Konto von Mia gefunden')
  // Lehrkraft: Hilfekarten in der Auswertung (je Person und je Aufgabe)
  const aw = await (await lk.request.get(`${A}/server/blaetter/${fr.id}/auswertung`, { headers: KOPF })).json()
  const miaA = (aw.personen ?? []).find((x) => x.id === miaId)
  pruefe(
    miaA?.hilfekarten === 2 && miaA.aufgaben.find((x) => x.nr === 1)?.hilfekarten === 2,
    `Auswertung: Mia hat 2 Hilfekarten geöffnet (${miaA?.hilfekarten})`
  )
  pruefe((aw.aufgaben ?? []).find((x) => x.nr === 1)?.hilfekarten === 3, 'Auswertung kennt die 3 Hilfekarten zu Aufgabe 1')
  await lk.request.post(`${A}/server/blaetter/${fr.id}/loeschen`, { headers: KOPF, data: {} })
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
