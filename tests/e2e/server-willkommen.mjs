// Willkommens-Assistent der Lernenden (09.10.2026): erscheint beim ersten Besuch einmal je Konto (nicht je Gerät),
// Farbe/Modus/Stimme/Vollbild wirken sofort und werden am Konto gespeichert, „Überspringen" und Esc merken es auch,
// zweite Anmeldung ohne Assistent, „Willkommens-Tour erneut ansehen" in den Einstellungen.
// In automatisierten Browsern erscheint er nur, wenn „schulapps-e2e-willkommen" = „1" gesetzt ist (andere Skripte
// bleiben so ungestört) – das wird hier für die Prüf-Kontexte gesetzt und für einen Kontext bewusst nicht.
// Vorher: Server lokal (KI wird nicht gebraucht), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-willkommen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-willkommen')
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
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
/** Bleibt der Assistent weg? (die Darstellung kommt erst vom Server – etwas warten) */
const bleibtWeg = async (s, ms = 2500) => {
  await s.waitForTimeout(ms)
  return (await s.locator('[data-willkommen-inhalt]').count()) === 0
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
/** Kontext für Lernende; mitAssistent = Prüfskript will den Assistenten sehen */
const lernKontext = async (mitAssistent, telefon = false) => {
  const ctx = await browser.newContext(
    telefon ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }
  )
  if (mitAssistent) await ctx.addInitScript(() => localStorage.setItem('schulapps-e2e-willkommen', '1'))
  return ctx
}
/** Erste Anmeldung mit Pflicht-Passwortwechsel */
const ersteAnmeldung = async (ctx, konto, neu) => {
  await anmelden(ctx, konto.benutzer, konto.passwort)
  await ctx.request.post(`${A}/auth/passwort`, { form: { neu, neu2: neu, ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
}
const darstellung = async (ctx) => (await (await ctx.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Nora Probe\nOle Probe\nPia Probe' } })
  ).json()
  const [nora, ole, pia] = liste.angelegt
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if ([nora.benutzer, ole.benutzer, pia.benutzer].includes(n.benutzer)) zuLoeschen.push(n.id)

  // ---------- Nora: alle drei Schritte, Wahl wirkt sofort und wird gespeichert
  const cn = await lernKontext(true)
  await ersteAnmeldung(cn, nora, 'NoraPasswort-11')
  const s = await cn.newPage()
  await s.goto(`${A}/s/`)
  pruefe(await da(s.locator('[data-willkommen-inhalt]')), 'Neues Konto: Assistent erscheint nach dem Passwortwechsel')
  pruefe((await s.locator('[data-willkommen-schritt="1"]').count()) === 1, 'Beginnt mit Schritt 1 (Farben)')
  pruefe((await s.locator('[data-willkommen-inhalt] [data-farbe]').count()) === 10, 'Zehn Farben als Kacheln')
  const fokusDrin = await s.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))
  pruefe(fokusDrin, 'Fokus liegt im Dialog')
  await s.locator('[data-willkommen-inhalt] [data-farbe="ozean"]').click()
  await s.locator('[data-willkommen-modus]').getByText('Hell', { exact: true }).click()
  await s.waitForTimeout(400)
  const schema = await s.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))
  pruefe(schema === 'light', `Hell wirkt sofort hinter dem Assistenten (${schema})`)
  await s.screenshot({ path: join(out, '1-farben.png') })
  await s.locator('[data-willkommen-weiter="weiter"]').click()
  pruefe(await da(s.locator('[data-willkommen-schritt="2"]')), 'Schritt 2: Stimme und Vollbild')
  await s.locator('[data-willkommen-stimme]').getByText('Weiblich', { exact: true }).click()
  pruefe((await s.locator('[data-willkommen-probe]').count()) <= 1, 'Probe-Knopf (falls das Gerät sprechen kann)')
  const vb = s.locator('[data-willkommen-vollbild] input, input[data-willkommen-vollbild]').first()
  pruefe(await vb.isChecked(), 'Vollbild beim Lernen: Vorgabe an')
  await vb.setChecked(false, { force: true })
  await s.screenshot({ path: join(out, '2-hoeren.png') })
  await s.locator('[data-willkommen-weiter="weiter"]').click()
  pruefe(await da(s.locator('[data-willkommen-schritt="3"]')), 'Schritt 3: kurze Tour')
  pruefe((await s.locator('[data-willkommen-karte]').count()) === 4, `Vier Karten (${await s.locator('[data-willkommen-karte]').count()})`)
  pruefe(await da(s.getByText('später in den Einstellungen ändern')), 'Hinweis: alles später in den Einstellungen änderbar')
  await s.screenshot({ path: join(out, '3-tour.png') })
  await s.locator('[data-willkommen-weiter="fertig"]').click()
  pruefe(await bleibtWeg(s, 800), '„Fertig" schließt den Assistenten')
  await s.waitForTimeout(800)
  const dn = await darstellung(cn)
  pruefe(
    dn?.farbe === 'ozean' && dn?.modus === 'hell' && dn?.aussprache === 'w' && dn?.vollbild === false && dn?.willkommenErledigt === true,
    `Wahl am Konto gespeichert (${JSON.stringify({ farbe: dn?.farbe, modus: dn?.modus, aussprache: dn?.aussprache, vollbild: dn?.vollbild, erledigt: dn?.willkommenErledigt })})`
  )
  await s.goto(`${A}/s/`)
  pruefe(await bleibtWeg(s), 'Neu geladen: kein Assistent mehr')

  // Zweites Gerät (ohne lokale Kopie): nicht noch einmal – gemerkt am Konto
  const cn2 = await lernKontext(true, true)
  await anmelden(cn2, nora.benutzer, 'NoraPasswort-11')
  const s2 = await cn2.newPage()
  await s2.goto(`${A}/s/`)
  pruefe(await bleibtWeg(s2), 'Zweite Anmeldung (anderes Gerät): kein Assistent')
  // Ein Gerät mit alter Kopie ohne das Feld speichert die Darstellung – das Feld bleibt am Konto
  await cn2.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { ...dn, willkommenErledigt: undefined, farbe: 'teal' } })
  pruefe((await darstellung(cn2))?.willkommenErledigt === true, 'Speichern ohne das Feld setzt es nicht zurück')

  // „Willkommens-Tour erneut ansehen" in den Einstellungen, Esc = Überspringen
  await s2.goto(`${A}/s/einstellungen`)
  await s2.locator('[data-willkommen-ansehen]').click()
  pruefe(await da(s2.locator('[data-willkommen-inhalt]')), 'Einstellungen: Tour erneut ansehen öffnet den Assistenten')
  await s2.screenshot({ path: join(out, '4-erneut-telefon.png') })
  await s2.keyboard.press('Escape')
  pruefe(await bleibtWeg(s2, 800), 'Esc schließt den Assistenten')

  // ---------- Ole: Überspringen gleich zu Beginn
  const co = await lernKontext(true, true)
  await ersteAnmeldung(co, ole, 'OlePasswort-22')
  const so = await co.newPage()
  await so.goto(`${A}/s/`)
  pruefe(await da(so.locator('[data-willkommen-inhalt]')), 'Ole (Telefon): Assistent erscheint')
  await so.screenshot({ path: join(out, '5-telefon-start.png') })
  await so.locator('[data-willkommen-ueberspringen]').click()
  pruefe(await bleibtWeg(so, 800), '„Überspringen" schließt sofort')
  await so.waitForTimeout(800)
  pruefe((await darstellung(co))?.willkommenErledigt === true, 'Überspringen wird am Konto gemerkt')
  await so.goto(`${A}/s/`)
  pruefe(await bleibtWeg(so), 'Nach dem Überspringen: kein Assistent mehr')

  // ---------- Pia: automatisierter Browser ohne Wunsch des Skripts – kein Assistent (andere Prüfskripte bleiben ungestört)
  const cp = await lernKontext(false)
  await ersteAnmeldung(cp, pia, 'PiaPasswort-33')
  const sp = await cp.newPage()
  await sp.goto(`${A}/s/`)
  pruefe(await bleibtWeg(sp), 'Automatisierter Browser ohne Kennzeichen: kein Assistent')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
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
