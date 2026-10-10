// Schulkalender und Schuljahreswechsel (10.10.2026). Ohne KI, ohne Netz.
// Vorher: Server lokal mit SCHULAPPS_KALENDER_DATEI=tests/fixtures/openholidays-ni.json und SCHULAPPS_KALENDER_TESTUHR=1
// (scripts/e2e-parallel.mjs setzt beides).
// Prüft: Verwaltung › Schule zeigt den Kalender; „erster Schultag" per Testuhr → Klassen rücken auf, Lernstand bleibt,
// Lehrkraft sieht den Hinweis in „Meine Klassen" und nimmt ihn zurück.
// Aufruf: node tests/e2e/server-schuljahr.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-schuljahr')
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
const KLASSE = '5q'

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
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
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const neu = async (rolle, name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle, name } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const lehrer = await neu('lehrkraft', 'Lea Jahreswechsel')
  const mia = await neu('schueler', 'Mia Jahreswechsel')
  const tom = await neu('schueler', 'Tom Jahreswechsel')
  // Klasse aus der Klassenliste der Verwaltung
  for (const s of [mia, tom]) await verwaltung.request.post(`${A}/server/verwaltung/nutzer`, { headers: KOPF, data: { id: s.id, klasse: KLASSE } })

  // ---------- Verwaltung › Schule: Schulkalender
  const kal = await (await verwaltung.request.get(`${A}/server/schulkalender`, { headers: KOPF })).json()
  pruefe(kal.daten?.quelle === 'datei' && kal.daten?.land === 'NI', `Server hat den Kalender aus der Datei (${kal.daten?.quelle}, ${kal.daten?.land})`)
  pruefe(kal.wechsel?.schuljahr === 2026, `Erster Start: Schuljahr 2026/27 gilt als laufend (${JSON.stringify(kal.wechsel)})`)
  const v = await seiteAuf(verwaltung)
  await v.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await v.getByRole('tab', { name: 'Schule', exact: true }).click()
  pruefe(await da(v.locator('[data-schulkalender] [data-kalender-quelle="datei"]')), 'Verwaltung › Schule: Karte „Schulkalender" mit Quelle')
  pruefe((await v.locator('[data-kalender-ferien] tbody tr').count()) >= 6, 'Ferien stehen in der Liste (nur lesen)')
  pruefe((await v.locator('[data-kalender-schuljahre]').innerText()).includes('13.8.2026'), 'Erster Schultag 2026/27: 13.8.2026')
  await v.locator('[data-schulkalender]').scrollIntoViewIfNeeded()
  await v.screenshot({ path: join(out, '1-schulkalender.png') })

  // ---------- Lehrkraft: Klasse mit Kurs, Lernende üben
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  pruefe(Boolean(gruppe.id), `Lerngruppe ${KLASSE} (Klassenliste) angelegt`)
  const kurs = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: {
        titel: `Englisch ${KLASSE}`,
        sprache: 'en',
        fach: 'Englisch',
        lerngruppeId: gruppe.id,
        woerter: [
          { id: 'w1', term: 'dog', translation: 'Hund' },
          { id: 'w2', term: 'cat', translation: 'Katze' }
        ]
      }
    })
  ).json()
  pruefe(Boolean(kurs.id), 'Kurs freigegeben')
  const miaCtx = await browser.newContext()
  await anmelden(miaCtx, mia.benutzer, mia.passwort)
  for (let i = 0; i < 2; i++)
    await miaCtx.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kurs.id, wortId: 'w1', uebung: 'karte', gewusst: true } })
  const vorher = await (await miaCtx.request.get(`${A}/s/api/vokabeln/liste?id=${kurs.id}`, { headers: KOPF })).json()
  pruefe(Boolean(vorher.staende?.w1), 'Mia hat Lernstand im Kurs')

  // ---------- Elternbrief: Warnung bei Terminen in den Ferien (Herbstferien Niedersachsen 12.–24.10.2026)
  const eb = await seiteAuf(lk)
  const sichtbar = (l) => l.filter({ visible: true }).first()
  await sichtbar(eb.locator('.app-leiste [aria-label="Elternbriefe"]')).click()
  const anlass = sichtbar(eb.getByText('Anlass & Stichpunkte', { exact: true }))
  const neuerBrief = sichtbar(eb.getByRole('button', { name: 'Neuer Elternbrief' }))
  await Promise.race([anlass.waitFor({ timeout: 10000 }), neuerBrief.waitFor({ timeout: 10000 })]).catch(() => undefined)
  if (!(await anlass.isVisible().catch(() => false)) && (await neuerBrief.isVisible().catch(() => false))) await neuerBrief.click()
  await sichtbar(eb.locator('[data-eb-termin]')).fill('2026-10-14')
  pruefe(await da(eb.locator('[data-kalender-hinweis="ferien"]')), 'Elternbrief: Termin in den Herbstferien wird angemerkt')
  pruefe((await eb.locator('[data-kalender-hinweis]').first().innerText()).includes('Herbstferien'), 'Hinweis nennt die Ferien')
  await eb.screenshot({ path: join(out, '0-elternbrief.png') })
  await sichtbar(eb.locator('[data-eb-termin]')).fill('2026-10-08')
  await eb.waitForTimeout(400)
  pruefe((await eb.locator('[data-kalender-hinweis]').count()) === 0, 'Schultag: kein Hinweis')
  await eb.close()

  // ---------- Unterrichtsreihe: Stunden mit Datum, Ferien übersprungen
  const ur = await seiteAuf(lk)
  ur.on('dialog', (d) => void d.accept())
  await ur.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await ur.mouse.move(800, 700)
  await ur.locator('[data-reihe-neu]').click()
  await ur.locator('[data-reihe-art-wahl]').waitFor({ timeout: 15000 })
  await ur.locator('[data-reihe-art="planung"]').click()
  await ur.locator('[data-reihe-titel]').fill('Kalenderprobe')
  for (let i = 0; i < 3; i++) await ur.locator('[data-stunde-neu="einzel"]').first().click()
  await ur.locator('[data-planung-stunde="2"]').waitFor({ timeout: 10000 })
  await ur.locator('[data-termine-beginn]').fill('2026-10-08')
  await ur.locator('[data-termine-tag="4"]').locator('xpath=..').click()
  await ur.waitForTimeout(400)
  const st = await Promise.all([0, 1, 2].map((i) => ur.locator(`[data-planung-stunde="${i}"]`).first().innerText()))
  pruefe(st[0].includes('Do., 8.10.') && st[1].includes('Do., 29.10.') && st[2].includes('Do., 5.11.'), `Stunden-Termine überspringen die Herbstferien (${st.map((t) => t.split(String.fromCharCode(10))[0]).join(' | ')})`)
  pruefe((await ur.locator('[data-termine-hinweis]').innerText()).includes('Ferien und Feiertage'), 'Hinweis: Ferien und Feiertage übersprungen')
  await ur.screenshot({ path: join(out, '0-stundentermine.png') })
  await ur.locator('[data-reihe-speichern]').click()
  await ur.waitForTimeout(1500)
  const reihen = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen ?? []
  const rid = reihen.find((x) => x.titel === 'Kalenderprobe')?.id
  const rd = rid ? (await (await lk.request.get(`${A}/server/reihen/${rid}`, { headers: KOPF })).json()).reihe : null
  pruefe(rd?.stundenTermine?.beginn === '2026-10-08' && rd?.stundenTermine?.tage?.join() === '4', `Termine gespeichert (${JSON.stringify(rd?.stundenTermine)})`)
  if (rid) await lk.request.post(`${A}/server/reihen/${rid}/loeschen`, { headers: KOPF, data: {} })
  await ur.close()

  // ---------- Erster Schultag 2027/28 (Testuhr)
  const uhr = await (await verwaltung.request.post(`${A}/server/schulkalender/testuhr`, { headers: KOPF, data: { heute: '2027-08-19' } })).json()
  pruefe(uhr.ergebnis?.art === 'gewechselt', `Erster Schultag: Schuljahreswechsel läuft (${uhr.ergebnis?.art})`)
  const zweimal = await (await verwaltung.request.post(`${A}/server/schulkalender/testuhr`, { headers: KOPF, data: { heute: '2027-08-20' } })).json()
  pruefe(zweimal.ergebnis?.art === 'schon', `Nie doppelt: zweiter Tag ändert nichts (${zweimal.ergebnis?.art})`)
  const nachher = await (await miaCtx.request.get(`${A}/s/api/vokabeln/liste?id=${kurs.id}`, { headers: KOPF })).json()
  pruefe(JSON.stringify(nachher.staende) === JSON.stringify(vorher.staende), 'Mias Lernstand ist nach dem Wechsel unverändert (gleicher Kurs)')
  const listen = await (await miaCtx.request.get(`${A}/s/api/vokabeln`, { headers: KOPF })).json()
  pruefe(JSON.stringify(listen).includes(kurs.id), 'Mia sieht ihren Kurs weiter')
  const gruppen = await (await lk.request.get(`${A}/server/lerngruppen`, { headers: KOPF })).json()
  const g = (gruppen.gruppen ?? gruppen).find?.((x) => x.id === gruppe.id)
  pruefe(g?.name === '6q', `Lerngruppe heißt jetzt 6q (${g?.name})`)
  const kd = await (await lk.request.get(`${A}/server/vokabeln/${kurs.id}`, { headers: KOPF })).json()
  pruefe(kd.titel === 'Englisch 6q', `Kurstitel mit der Klasse umbenannt („${kd.titel}")`)
  const proto = await (await verwaltung.request.get(`${A}/server/verwaltung/protokoll?anzahl=50`, { headers: KOPF })).json()
  pruefe(JSON.stringify(proto).includes('Schuljahreswechsel 2027/28'), 'Server-Protokoll nennt den Schuljahreswechsel')

  // ---------- Meine Klassen: Hinweis und Rückgängig
  const p = await seiteAuf(lk)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  pruefe(await da(p.locator('[data-schuljahr-hinweis="aktiv"]')), 'Meine Klassen: Hinweis „Neues Schuljahr 2027/28"')
  const text = await p.locator('[data-schuljahr-hinweis]').innerText()
  pruefe(text.includes(`${KLASSE} → 6q`), `Zuordnung alt → neu steht da („${text.split('\n').find((z) => z.includes('→')) ?? ''}")`)
  pruefe(await da(p.locator('[data-klasse="6q"]')), 'Klassenkarte heißt 6q')
  await p.screenshot({ path: join(out, '2-hinweis.png') })
  p.once('dialog', (d) => void d.accept())
  await p.locator('[data-schuljahr-rueckgaengig]').click()
  pruefe(await da(p.locator('[data-schuljahr-hinweis="rueckgaengig"]')), 'Nach „Rückgängig": Hinweis meldet die Rücknahme')
  pruefe(await da(p.locator(`[data-klasse="${KLASSE}"]`)), `Klassenkarte heißt wieder ${KLASSE}`)
  await p.screenshot({ path: join(out, '3-rueckgaengig.png') })
  const miaWieder = await (await miaCtx.request.get(`${A}/s/api/vokabeln/liste?id=${kurs.id}`, { headers: KOPF })).json()
  pruefe(JSON.stringify(miaWieder.staende) === JSON.stringify(vorher.staende), 'Lernstand auch nach „Rückgängig" unverändert')
  const kd2 = await (await lk.request.get(`${A}/server/vokabeln/${kurs.id}`, { headers: KOPF })).json()
  pruefe(kd2.titel === `Englisch ${KLASSE}`, `Kurstitel wieder „Englisch ${KLASSE}" (${kd2.titel})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Testuhr zurück auf heute
  await verwaltung.request.post(`${A}/server/schulkalender/testuhr`, { headers: KOPF, data: { heute: null } }).catch(() => undefined)
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
