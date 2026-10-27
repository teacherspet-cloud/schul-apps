// Schule & Daten › Fächer (27.10.2026, abgestimmt; shared/schulbuecher.ts, server/schulbuecher.ts):
//  1. Der Reiter „Fächer“ steht direkt rechts neben „Nutzer“; die Fächerliste ist aus den Daten vorbelegt, Englisch dabei.
//  2. Der Katalog beginnt mit den Lehrwerksdateien (Green Line 1 … mit ISBN und Cover).
//  3. Admin fügt ein Fach hinzu, legt ein Buch mit ISBN an (Cover aus der ISBN), bearbeitet und entfernt es.
//  4. Fachobleute pflegen die Bücher ihres Fachs über die Schnittstelle, fremde Fächer nicht; Lehrkräfte lesen nur.
// Ohne KI. Aufruf: node tests/e2e/server-faecher.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-faecher')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const seiteAuf = async (ctx, pfad = '/') => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}${pfad}`)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  return p
}
const angelegt = []
let neuesFachGlobal = null
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const start = await (await verwaltung.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()
  pruefe(
    Array.isArray(start.buecher) && start.buecher.some((b) => b.lehrwerkId === 'green-line-1' && b.isbn === '978-3-12-864010-5'),
    'Erstbestand: Green Line 1 aus der Lehrwerksdatei, mit ISBN'
  )
  pruefe(start.faecher.liste.includes('englisch'), `Fächer vorbelegt, Englisch dabei (${start.faecher.liste.join(', ')})`)
  pruefe(start.darf === 'alle', 'Admin darf alle Fächer')

  // ---------- Oberfläche des Admins
  const v = await seiteAuf(verwaltung, '/?einzeln=verwaltung')
  const reiter = await v.getByRole('tab').allTextContents()
  pruefe(reiter.indexOf('Fächer') === reiter.indexOf('Nutzer') + 1, `Reiter „Fächer“ direkt rechts neben „Nutzer“ (${reiter.join(' | ')})`)
  await v.getByRole('tab', { name: 'Fächer', exact: true }).click()
  await v.locator('[data-faecher]').waitFor({ timeout: 10000 })
  pruefe((await v.locator('[data-fach-karte="englisch"]').count()) === 1, 'Karte „Englisch“ steht da')
  // Karten starten zugeklappt (27.10.2026) – zum Prüfen öffnen
  await v.locator('[data-fach-karte="englisch"] [data-klappkopf]').click()
  await v.waitForTimeout(400)
  pruefe((await v.locator('[data-fach-karte="englisch"] [data-buch]').count()) >= 7, 'Englisch zeigt die Green-Line-Bände')
  pruefe((await v.locator('[data-fach-karte="englisch"] [data-buch-reihe]').count()) >= 1, '… nach Schulbuchreihen gruppiert')
  pruefe((await v.locator('[data-fach-karte="englisch"] [data-buch-bild]').count()) >= 1, '… mit Cover-Bild vom Verlag')
  await v.screenshot({ path: join(out, '1-faecher.png'), fullPage: true })

  // Fach hinzufügen: Geschichte (falls schon da, ein anderes)
  // Ein Fach, das noch nicht in der Liste steht (der Testserver behält die Liste zwischen Läufen)
  const KANDIDATEN = {
    geschichte: 'Geschichte',
    physik: 'Physik',
    chemie: 'Chemie',
    biologie: 'Biologie',
    erdkunde: 'Erdkunde',
    musik: 'Musik',
    kunst: 'Kunst'
  }
  const neuesFach = Object.keys(KANDIDATEN).find((f) => !start.faecher.liste.includes(f)) ?? 'geschichte'
  const fachName = KANDIDATEN[neuesFach]
  neuesFachGlobal = neuesFach
  // Mantine Select trägt das data-Attribut am Eingabefeld selbst, MultiSelect am Rahmen (dort das innere input)
  await v.locator('[data-fach-wahl]').click()
  await v.getByRole('option', { name: fachName, exact: true }).click()
  await v.locator('[data-fach-hinzufuegen]').click()
  await v.locator(`[data-fach-karte="${neuesFach}"]`).waitFor({ timeout: 10000 })
  await v.locator(`[data-fach-karte="${neuesFach}"] [data-klappkopf]`).click()
  await v.waitForTimeout(400)
  pruefe(true, `Fach „${fachName}“ hinzugefügt – Liste gilt jetzt als gespeichert`)
  const nachFach = await (await verwaltung.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()
  pruefe(nachFach.faecher.gespeichert === true && nachFach.faecher.liste.includes(neuesFach), '… Server: Liste gespeichert')

  // Buch anlegen mit ISBN (Cornelsen: Cover nach Muster)
  await v.locator(`[data-fach-karte="${neuesFach}"] [data-buch-neu]`).click()
  const f = v.locator('[data-buch-fenster]')
  await f.locator('[data-buch-reihe]').fill('Forum Geschichte')
  await f.locator('[data-buch-band]').fill('2')
  await f.locator('[data-buch-verlag]').fill('Cornelsen')
  await f.locator('[data-buch-ausgabe]').fill('ab 2020')
  await f.locator('[data-buch-isbn]').fill('978-3-06-033311-2')
  pruefe((await f.locator('[data-buch-bild] ').count()) === 1, 'Vorschau: Cover aus der ISBN (Cornelsen-Muster)')
  await f.locator('[data-buch-isbn]').fill('978-3-06-033311-9')
  pruefe((await f.getByText('Keine gültige ISBN').count()) === 1, 'Falsche Prüfziffer wird gemeldet')
  await f.locator('[data-buch-isbn]').fill('978-3-06-033311-2')
  await f.locator('[data-buch-bild-url]').fill('https://example.com/bild.jpg')
  pruefe(await f.locator('[data-buch-speichern]').isDisabled(), 'Fremder Bild-Host sperrt das Speichern')
  await f.locator('[data-buch-bild-url]').fill('')
  await f.locator('[data-buch-speichern]').click()
  await f.waitFor({ state: 'detached', timeout: 10000 })
  const karte = v.locator(`[data-fach-karte="${neuesFach}"]`)
  pruefe(
    (await karte.locator('[data-buch]').count()) === 1 && (await karte.innerText()).includes('Forum Geschichte 2'),
    'Buch „Forum Geschichte 2“ steht in der Karte'
  )
  const buecher = (await (await verwaltung.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()).buecher
  const buch = buecher.find((b) => b.reihe === 'Forum Geschichte')
  angelegt.push(buch?.id)
  pruefe(buch && buch.faecher.includes(neuesFach) && buch.isbn === '978-3-06-033311-2' && buch.geaendert?.von, '… Server: Fach, ISBN, „geändert von“')
  await v.screenshot({ path: join(out, '2-buch.png'), fullPage: true })

  // Bearbeiten: Jahrgänge
  await karte.locator('[data-buch-bearbeiten]').first().click()
  // MultiSelect: das data-Attribut sitzt am versteckten Feld – über die Beschriftung klicken
  await v.locator('[data-buch-fenster] .mantine-InputWrapper-root:has(label:text-is("Jahrgänge")) .mantine-MultiSelect-input').click()
  await v.getByRole('option', { name: 'Klasse 7', exact: true }).click()
  await v.keyboard.press('Escape')
  await v.locator('[data-buch-fenster] [data-buch-speichern]').click()
  await v.locator('[data-buch-fenster]').waitFor({ state: 'detached', timeout: 10000 })
  pruefe((await karte.innerText()).includes('Kl. 7'), 'Bearbeitet: Jahrgang 7 steht am Buch')

  // ---------- Fachobleute über die Schnittstelle: eigenes Fach ja, fremdes nein; Lehrkraft nur lesen
  const konto = async (name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    return { ...k, ctx }
  }
  const obfrau = await konto('Fächer Obfrau')
  await verwaltung.request.post(`${A}/server/fachobleute`, { headers: KOPF, data: { nutzerId: obfrau.id, faecher: [neuesFach] } })
  const sicht = await (await obfrau.ctx.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()
  pruefe(Array.isArray(sicht.darf) && sicht.darf.includes(neuesFach), `Fachobfrau darf „${fachName}“`)
  const eigen = await obfrau.ctx.request.post(`${A}/server/schulbuecher/buch`, {
    headers: KOPF,
    data: { buch: { faecher: [neuesFach], reihe: 'Zeitreise', band: '1', verlag: 'Klett', jahrgaenge: [6] } }
  })
  pruefe(eigen.status() === 200, 'Fachobfrau legt ein Buch ihres Fachs an')
  angelegt.push((await eigen.json()).buch?.id)
  const fremd = await obfrau.ctx.request.post(`${A}/server/schulbuecher/buch`, {
    headers: KOPF,
    data: { buch: { faecher: ['englisch'], reihe: 'Camden Town', band: '1', verlag: 'Westermann' } }
  })
  pruefe(fremd.status() === 403, 'Fremdes Fach: 403')
  const faecherFremd = await obfrau.ctx.request.post(`${A}/server/schulbuecher/faecher`, { headers: KOPF, data: { liste: ['englisch'] } })
  pruefe(faecherFremd.status() === 403, 'Fächerliste nur für die Verwaltung: 403')
  const lehrkraft = await konto('Fächer Lehrkraft')
  const nurLesen = await (await lehrkraft.ctx.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()
  pruefe(
    Array.isArray(nurLesen.darf) && nurLesen.darf.length === 0 && nurLesen.buecher.length > 0,
    'Lehrkraft ohne Fachobleute-Rolle liest den Katalog, pflegt nichts'
  )

  // „Mein Fach“ der Fachobfrau zeigt die Bücher ihres Fachs
  const m = await seiteAuf(obfrau.ctx)
  await m.locator('.app-leiste [aria-label="Einstellungen"]').click()
  const meinFach = m.locator('[data-reiter-mein-fach]')
  if (
    await meinFach.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    )
  ) {
    await meinFach.click()
    await m.locator('[data-mein-fach-buecher]').waitFor({ timeout: 10000 })
    pruefe((await m.locator('[data-mein-fach-buecher] [data-buch]').count()) >= 2, 'Mein Fach: Bücher des Fachs (Forum Geschichte 2, Zeitreise 1)')
    await m.screenshot({ path: join(out, '3-mein-fach.png'), fullPage: true })
  } else pruefe(false, 'Reiter „Mein Fach“ nicht gefunden')

  // Entfernen über die Oberfläche
  v.once('dialog', (d) => void d.accept())
  await karte.locator('[data-buch-loeschen]').first().click()
  await v.waitForTimeout(800)
  pruefe((await karte.locator('[data-buch]').count()) === 1, 'Ein Buch entfernt, das der Fachobfrau bleibt')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
} finally {
  // Aufräumen: Bücher, Fächerliste, Testkonten
  for (const id of angelegt.filter(Boolean))
    await verwaltung.request.post(`${A}/server/schulbuecher/loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  try {
    const jetzt = await (await verwaltung.request.get(`${A}/server/schulbuecher`, { headers: KOPF })).json()
    if (typeof neuesFachGlobal === 'string')
      await verwaltung.request.post(`${A}/server/schulbuecher/faecher`, {
        headers: KOPF,
        data: { liste: jetzt.faecher.liste.filter((f) => f !== neuesFachGlobal) }
      })
  } catch {
    // Aufräumen ist nur Kosmetik
  }
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
