// Einstellungen (03.10.2026): Lernende ändern Darstellung und Passwort, Lehrkraft ändert ihr Passwort.
// 09.10.2026: Farbkonzept „Helle, ruhige Flächen + Akzentfarbe" (10 Farben mit Vorschau hell/dunkel, getönter Grund,
// weiße Karten, Kopfband in der Farbe, hell/dunkel wirklich überall) und „Konto" nur für Konten mit eigenem Passwort
// (nicht für Gäste mit Code und die Musterschüler-Vorschau; IServ verwaltet es selbst).
// 10.10.2026 Fehlerlog: fehlgeschlagene Anmeldungen zählen nicht als Fehler (eigener Abschnitt), Warnung nur bei
// möglichem Rateversuch (≥ 10 für dasselbe Konto in 15 Minuten), „Fehlerlog leeren" setzt die Zahl auf 0.
// Vorher: Server lokal (KI wird nicht gebraucht), IServ NICHT eingerichtet. Der Server muss mit SCHULAPPS_WEICHE=1
// laufen (scripts/e2e-parallel.mjs): Die Fehlversuche kommen mit erfundenen Adressen (X-Real-IP, 192.0.2.x) – sonst
// sperrte die Sperre nach 10 Fehlversuchen localhost für alle anderen Tests auf demselben Server.
// Aufruf: node tests/e2e/server-einstellungen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-einstellungen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `9e${Date.now() % 1000}`
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
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

  // ---------- Mia: Darstellung
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'ErstesPasswort-11', neu2: 'ErstesPasswort-11', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-einstellungen-knopf]').click()
  pruefe(await da(s.locator('[data-schueler-einstellungen]')), 'Schüler: Einstellungen erreichbar')
  await s.locator('[data-modus]').getByText('Dunkel').click()
  await s.locator('[data-schrift]').getByText('Groß', { exact: true }).click()
  await s.locator('[data-farbe="teal"]').click()
  await s.waitForTimeout(800)
  const schema = await s.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))
  const schrift = await s.evaluate(() => document.documentElement.style.fontSize)
  pruefe(schema === 'dark' && schrift === '112.5%', `Dunkel und große Schrift wirken sofort (${schema}, ${schrift})`)
  await s.screenshot({ path: join(out, '1-einstellungen-dunkel.png'), fullPage: true })
  const gesp = await (await sm.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()
  pruefe(gesp.darstellung?.modus === 'dunkel' && gesp.darstellung?.farbe === 'teal', 'Darstellung am Konto gespeichert')
  // Zweites Gerät: gleiche Darstellung ohne lokale Kopie
  const sm2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await anmelden(sm2, mia.benutzer, 'ErstesPasswort-11')
  const s2 = await sm2.newPage()
  await s2.goto(`${A}/s/`)
  await s2.waitForTimeout(1500)
  pruefe((await s2.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'))) === 'dark', 'Darstellung folgt auf das zweite Gerät')
  await s2.screenshot({ path: join(out, '2-start-dunkel-telefon.png'), fullPage: true })
  await s.goto(`${A}/s/`)
  await s.waitForTimeout(1200)
  await s.screenshot({ path: join(out, '3-start-dunkel.png'), fullPage: true })

  // ---------- Farbkonzept (09.10.2026)
  await s.goto(`${A}/s/einstellungen`)
  pruefe((await s.locator('[data-farbe]').count()) === 10, `Zehn Farben zur Wahl (${await s.locator('[data-farbe]').count()})`)
  for (const w of ['lavendel', 'koralle', 'salbei', 'ozean']) pruefe((await s.locator(`[data-farbe="${w}"]`).count()) === 1, `Neue Farbe ${w}`)
  const farben = async () =>
    s.evaluate(() => {
      const css = (sel, prop) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el)[prop] : ''
      }
      return {
        schema: document.documentElement.getAttribute('data-mantine-color-scheme'),
        grund: getComputedStyle(document.body).backgroundColor,
        karte: css('[data-bereich="aussehen"]', 'backgroundColor'),
        knopf: css('[data-vorschau] button', 'backgroundColor'),
        kopf: css('.sl-kopf', 'backgroundImage')
      }
    })
  const hell = (rgb) => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number)
    return (r + g + b) / 3
  }
  const bilder = []
  for (const [farbe, name] of [
    ['teal', 'tuerkis'],
    ['koralle', 'koralle'],
    ['lavendel', 'lavendel']
  ]) {
    await s.goto(`${A}/s/einstellungen`)
    await s.locator(`[data-farbe="${farbe}"]`).click()
    for (const modus of ['Hell', 'Dunkel']) {
      await s.goto(`${A}/s/einstellungen`)
      await s.locator('[data-modus]').getByText(modus, { exact: true }).click()
      await s.waitForTimeout(400)
      const f = await farben()
      if (modus === 'Hell')
        pruefe(
          f.schema === 'light' && hell(f.grund) > 225 && hell(f.grund) < 255 && f.karte === 'rgb(255, 255, 255)' && f.grund !== f.karte,
          `${farbe} hell: getönter heller Grund ${f.grund}, weiße Karten ${f.karte}, Knopf ${f.knopf}`
        )
      else pruefe(f.schema === 'dark' && hell(f.grund) < 45 && hell(f.karte) > hell(f.grund), `${farbe} dunkel: Grund ${f.grund}, Karten heller ${f.karte}`)
      bilder.push(f.knopf)
      await s.screenshot({ path: join(out, `farbe-${name}-${modus.toLowerCase()}-einstellungen.png`), fullPage: true })
      await s.goto(`${A}/s/`)
      await s.waitForTimeout(1200)
      const st = await farben()
      pruefe(modus !== 'Hell' || (hell(st.grund) > 225 && !/rgb\(\s*(5|11|30), /.test(st.kopf)), `${farbe} ${modus}: Startseite ohne dunklen Grund/dunkles Band (${st.grund})`)
      await s.screenshot({ path: join(out, `farbe-${name}-${modus.toLowerCase()}-start.png`), fullPage: true })
    }
  }
  pruefe(new Set(bilder).size === 3, `Knopffarbe folgt der Wahl (${[...new Set(bilder)].join(' | ')})`)
  // „Wie das Gerät": hell bzw. dunkel nach dem System
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-modus]').getByText('Wie das Gerät').click()
  await s.emulateMedia({ colorScheme: 'light' })
  await s.waitForTimeout(300)
  const sysHell = await farben()
  await s.emulateMedia({ colorScheme: 'dark' })
  await s.waitForTimeout(300)
  const sysDunkel = await farben()
  pruefe(sysHell.schema === 'light' && sysDunkel.schema === 'dark' && hell(sysHell.grund) > 225 && hell(sysDunkel.grund) < 45, `„Wie das Gerät" wechselt mit dem System (${sysHell.grund} / ${sysDunkel.grund})`)
  await s.locator('[data-modus]').getByText('Dunkel', { exact: true }).click()
  pruefe(await da(s.locator('[data-bereich="konto"]')), 'Konto mit eigenem Passwort: Bereich „Konto" da')

  // ---------- Mia: Passwort
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('falsch-falsch-1')
  await s.locator('[data-pw-neu] input, input[data-pw-neu]').first().fill('ZweitesPasswort-22')
  await s.locator('[data-pw-neu2] input, input[data-pw-neu2]').first().fill('ZweitesPasswort-22')
  await s.locator('[data-pw-speichern]').click()
  pruefe(await da(s.getByText('Das bisherige Passwort stimmt nicht.')), 'Falsches bisheriges Passwort wird abgelehnt')
  await s.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('ErstesPasswort-11')
  await s.locator('[data-pw-speichern]').click()
  pruefe(await da(s.locator('[data-passwort-ok]')), 'Schüler: Passwort geändert')
  // Das andere Gerät ist abgemeldet, dieses nicht
  const r2 = await sm2.request.get(`${A}/s/api/darstellung`, { headers: KOPF })
  const r1 = await sm.request.get(`${A}/s/api/darstellung`, { headers: KOPF })
  pruefe(r2.status() !== 200 && r1.status() === 200, `Andere Geräte abgemeldet, dieses bleibt angemeldet (${r2.status()}, ${r1.status()})`)
  const neuCtx = await browser.newContext()
  const login = await anmelden(neuCtx, mia.benutzer, 'ZweitesPasswort-22')
  pruefe(login.status() === 303 && !(login.headers().location ?? '').includes('fehler'), 'Anmeldung mit dem neuen Passwort')

  // ---------- Lehrkraft: Passwort in den Einstellungen
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)

  // ---------- Kein „Konto" für Gäste mit Code und die Musterschüler-Vorschau (09.10.2026)
  const kurs = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: { titel: 'Probe', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'dog', translation: 'Hund' }], schueler: [mia.benutzer] }
      })
    ).json()
  ).id
  try {
    const ein = await (await lk.request.post(`${A}/server/vokabeln/${kurs}/eintragen`, { headers: KOPF, data: { namen: ['Gina G.'] } })).json()
    const gast = await browser.newContext({ viewport: { width: 1024, height: 1000 } })
    const anm = await gast.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: ein.eingetragen?.[0]?.zugang } })
    const gs = await gast.newPage()
    await gs.goto(`${A}/s/einstellungen`)
    const gDa = anm.ok() && (await da(gs.locator('[data-bereich="aussehen"]')))
    await gs.screenshot({ path: join(out, '5-gast-einstellungen.png'), fullPage: true })
    pruefe(gDa && (await gs.locator('[data-bereich="konto"], [data-bereich-kachel="konto"]').count()) === 0, `Gast mit Code: kein Bereich „Konto" (Anmeldung ${anm.status()}, Seite ${gDa})`)
    const gpw = await gast.request.post(`${A}/konto/passwort`, { headers: KOPF, data: { alt: 'x', neu: 'y'.repeat(12), neu2: 'y'.repeat(12) } })
    pruefe(gpw.status() >= 400, `Gast: Passwort ändern abgelehnt (${gpw.status()})`)
    const gr = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', mitglieder: [mia.benutzer] } })).json()
    const vs = (await (await lk.request.post(`${A}/server/klassen/${gr.id}/vorschau`, { headers: KOPF, data: { zustand: 'neu' } })).json()).schluessel
    const vp = await lk.newPage()
    await vp.goto(`${A}/s/einstellungen?vs=${encodeURIComponent(vs)}`)
    pruefe((await da(vp.locator('[data-bereich="aussehen"]'))) && (await vp.locator('[data-bereich="konto"], [data-bereich-kachel="konto"]').count()) === 0, 'Vorschau: kein Bereich „Konto"')
    const vpw = await lk.request.post(`${A}/konto/passwort`, { headers: { ...KOPF, 'x-schulapps-vorschau': vs }, data: { alt: 'x', neu: 'y'.repeat(12), neu2: 'y'.repeat(12) } })
    pruefe(vpw.status() === 400, `Vorschau: Passwort ändern abgelehnt (${vpw.status()})`)
    await vp.close()
  } finally {
    await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  }
  await lk.request.post(`${A}/auth/passwort`, {
    form: { alt: lehrer.passwort, neu: 'LehrerPasswort-33', neu2: 'LehrerPasswort-33', ziel: '/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Einstellungen"]').click()
  await p.locator('[data-passwort-knopf]').click()
  await p.locator('[data-pw-alt] input, input[data-pw-alt]').first().fill('LehrerPasswort-33')
  await p.locator('[data-pw-neu] input, input[data-pw-neu]').first().fill('LehrerPasswort-44')
  await p.locator('[data-pw-neu2] input, input[data-pw-neu2]').first().fill('LehrerPasswort-44')
  await p.screenshot({ path: join(out, '4-lehrkraft-passwort.png') })
  await p.locator('[data-pw-speichern]').click()
  pruefe(await da(p.locator('[data-passwort-ok]')), 'Lehrkraft: Passwort geändert')
  const lk2 = await browser.newContext()
  const l2 = await anmelden(lk2, lehrer.benutzer, 'LehrerPasswort-44')
  pruefe(l2.status() === 303 && !(l2.headers().location ?? '').includes('fehler'), 'Lehrkraft: Anmeldung mit dem neuen Passwort')
  // Ohne Kopfzeile kein Ändern (Schutz vor untergeschobenen Formularen)
  const ohne = await lk.request.post(`${A}/konto/passwort`, { data: { alt: 'LehrerPasswort-44', neu: 'x'.repeat(12), neu2: 'x'.repeat(12) } })
  pruefe(ohne.status() === 403, `Ohne Kopfzeile abgelehnt (${ohne.status()})`)

  // ---------- Verwaltung (09.10.2026, Befunde der Oberflächenprüfung)
  // Fachfarben der Schule: GET wurde vom Fachordner (/server/fach…) mit 405 abgefangen
  const ff = await verwaltung.request.get(`${A}/server/fachfarben`, { headers: KOPF })
  pruefe(ff.status() === 200 && typeof (await ff.json()).farben === 'object', `GET /server/fachfarben antwortet (${ff.status()})`)
  pruefe((await verwaltung.request.get(`${A}/server/fach`, { headers: KOPF })).status() === 200, 'Fachordner /server/fach antwortet weiter')
  // „Schule & Daten" › „Server": Ampel erscheint (die Antwort hat einen Abschnitt „fehler" – galt als Fehler, „[object Object]")
  const v = await verwaltung.newPage()
  await v.setViewportSize({ width: 1400, height: 950 })
  await v.goto(A)
  await v.waitForTimeout(2500)
  const vSpaeter = v.getByRole('button', { name: 'Später einrichten' })
  if (await vSpaeter.isVisible().catch(() => false)) await vSpaeter.click()
  await expertenmodus(v)
  await v.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await v.getByRole('tab', { name: 'Server', exact: true }).click()
  pruefe(await da(v.locator('[data-server-reiter] [data-server-ampel]').first(), 15000), 'Verwaltung › Server: Ampel erscheint')

  // ---------- Fehlerlog (10.10.2026): Fehlversuche bei der Anmeldung, Rateversuch, Leeren
  const zustand = async () => (await verwaltung.request.get(`${A}/server/verwaltung/zustand`, { headers: KOPF })).json()
  const rateWarnung = (z) => z.gesundheit.some((b) => b.art === 'anmeldungen')
  const z0 = await zustand()
  const fremd = await browser.newContext()
  const falsch = (b, ip) =>
    fremd.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: 'ganz-falsch-123', ziel: '/' }, headers: { origin: A, 'x-real-ip': ip }, maxRedirects: 0 })
  const stamm = `e2e.raten${Date.now() % 100000}`
  for (let i = 0; i < 3; i++) await falsch(`${stamm}.a`, '192.0.2.10')
  const z1 = await zustand()
  pruefe(z1.anmeldungen.letzte24h >= z0.anmeldungen.letzte24h + 3, `3 Fehlversuche im Abschnitt „Anmeldungen" (${z0.anmeldungen.letzte24h} → ${z1.anmeldungen.letzte24h})`)
  pruefe(!rateWarnung(z1), '3 Fehlversuche: keine Warnung in der Ampel')
  pruefe(z1.fehler.letzte24h === z0.fehler.letzte24h, `Fehlversuche zählen nicht als Fehler (${z0.fehler.letzte24h} → ${z1.fehler.letzte24h})`)
  // 11 schnell hintereinander für ein Konto (von wechselnden Adressen): der 11. wird wegen der Sperre abgewiesen
  await Promise.all(Array.from({ length: 11 }, (_, i) => falsch(`${stamm}.b`, `192.0.2.${20 + i}`)))
  const z2 = await zustand()
  pruefe(rateWarnung(z2), '11 Fehlversuche für ein Konto: Ampel warnt vor einem Rateversuch')
  pruefe(
    z2.anmeldungen.verdacht.some((x) => x.art === 'konto' && x.anzahl >= 10) && !z2.anmeldungen.verdacht.some((x) => x.art === 'adresse'),
    `Verdacht für dasselbe Konto, nicht für eine Adresse (${JSON.stringify(z2.anmeldungen.verdacht.map((x) => [x.art, x.anzahl]))})`
  )
  pruefe(z2.fehler.letzte24h === z0.fehler.letzte24h, `Auch dann keine Fehler (${z2.fehler.letzte24h})`)
  const protokollText = JSON.stringify((await (await verwaltung.request.get(`${A}/server/verwaltung/protokoll?anzahl=50`, { headers: KOPF })).json()).eintraege)
  pruefe(!protokollText.includes(stamm) && !protokollText.includes('192.0.2.'), 'Protokoll ohne Benutzername und Adresse im Klartext')
  await fremd.close()
  // Oberfläche: Reiter neu öffnen (lädt beim Sichtbarwerden)
  await v.getByRole('tab', { name: 'Schule', exact: true }).click()
  await v.getByRole('tab', { name: 'Server', exact: true }).click()
  pruefe(await da(v.locator('[data-server-ampel] [data-befund-art="anmeldungen"]'), 15000), 'Ampel zeigt den möglichen Rateversuch')
  pruefe(await da(v.locator('[data-anmeldungen] [data-anmelde-verdacht]')), 'Abschnitt „Anmeldungen" nennt den Rateversuch')
  await v.locator('[data-anmeldungen]').scrollIntoViewIfNeeded()
  await v.screenshot({ path: join(out, '5a-server-anmeldungen.png') })
  // Leeren (mit Rückfrage)
  v.once('dialog', (d) => void d.accept())
  await v.locator('[data-fehler-leeren]').click()
  pruefe(await da(v.locator('[data-fehler-geleert]')), 'Fehlerlog geleert: „Geleert am …" erscheint')
  pruefe(await da(v.locator('[data-fehler-zahl="0"]')), 'Nach dem Leeren: 0 Fehler')
  const z3 = await zustand()
  pruefe(z3.fehler.letzte24h === 0 && !rateWarnung(z3) && z3.fehler.geleert.ab, `Nach dem Leeren: Zahl 0, keine Warnung (${z3.fehler.letzte24h}, ${rateWarnung(z3)})`)
  pruefe(!(await v.locator('[data-server-ampel] [data-befund-art="anmeldungen"]').count()), 'Ampel ohne Rateversuch nach dem Leeren')
  // „Ältere anzeigen": nichts gelöscht
  await v.locator('[data-fehler-aeltere]').click()
  pruefe(await da(v.locator('[data-anmeldungen] [data-anmelde-verdacht]')), '„Ältere anzeigen" bringt die ausgeblendeten Einträge zurück')
  await v.screenshot({ path: join(out, '5b-server-geleert.png') })
  await v.getByRole('tab', { name: 'Schule', exact: true }).click()
  await v.waitForTimeout(1500)
  const meldungen = (await v.locator('.mantine-Notification-root').allInnerTexts()).join(' | ')
  pruefe(!/object Object|Nicht erlaubt/.test(meldungen), `Verwaltung: keine Fehlermeldung („${meldungen}")`)
  await v.screenshot({ path: join(out, '5-verwaltung-schule.png') })
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
