// „Als Schüler ansehen" (06.10.2026, abgestimmt): Musterschüler-Vorschau der ganzen Klasse aus „Meine Klassen".
// Knopf → eigenes Fenster mit Streifen (Tablet/Handy/PC, Zurücksetzen), Startseite mit den Freigaben der Klasse, gewählter
// Lernstand „erfolgreich" in der Begrüßung; eine Abgabe des Musterschülers taucht in keiner Auswertung auf; der Schlüssel
// gilt nur mit der Sitzung derselben Lehrkraft; die Lehrkraft bleibt in der Haupt-App angemeldet. Ohne KI (Attrappe).
// Vorher: Server lokal (eigener Port), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-vorschau.mjs <Ausgabeordner> [adresse] [admin] [passwort] [ki-protokoll]
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-vorschau')
const A = process.argv[3] ?? 'http://localhost:18491'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
const kiProtokoll = process.argv[6] ?? ''
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const N = Date.now() % 1000
const K7 = `7v${N}`
const BLATT = `Vorschau-Blatt ${N}`
const WOERTER = ['weather', 'sunny', 'cloud', 'rain', 'wind', 'snow', 'storm'].map((t, i) => ({
  id: `w${i}`,
  term: t,
  translation: ['Wetter', 'sonnig', 'Wolke', 'Regen', 'Wind', 'Schnee', 'Sturm'][i]
}))
const VORLAGE = {
  version: 1,
  meta: { title: BLATT, subjectId: 'englisch', subjectLabel: 'Englisch', grade: 7, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: BLATT, aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const kiZeilen = () => (kiProtokoll && existsSync(kiProtokoll) ? readFileSync(kiProtokoll, 'utf8').split('\n').filter(Boolean).length : 0)

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const neuesKonto = async (name) => {
    const n = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(n.id)
    return n
  }
  const lehrer = await neuesKonto('Kai Vorschau')
  const fremd = await neuesKonto('Ada Fremd')
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K7, namen: 'Mia Probe\nBen Test' } })
  ).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const neu = async (name, fach) =>
    (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name, fach, iservGruppe: `klasse:${name}` } })).json()
  const gEn = await neu(K7, 'Englisch')
  const gGe = await neu(K7, 'Geschichte')
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gEn.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  // Blatt in Geschichte (anderes Fach derselben Klasse) – ohne KI-Feedback und ohne Stift
  const blatt = await (
    await lk.request.post(`${A}/server/blaetter/freigeben`, {
      headers: KOPF,
      data: {
        titel: BLATT,
        html: `<!doctype html><html><body><div class="ws-page"><p>${BLATT}</p></div></body></html>`,
        aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
        rueckmeldung: VORLAGE,
        lerngruppeId: gGe.id,
        schueler: [],
        einstellungen: { feedback: false, aufgabenFeedback: false, stift: false }
      }
    })
  ).json()
  pruefe(Boolean(vok.id && blatt.id), 'Vokabeltraining (Englisch) und Blatt (Geschichte) für die Klasse freigegeben')
  const kiVorher = kiZeilen()

  // ---------- Haupt-App: Meine Klassen → Klasse → „Als Schüler ansehen"
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K7}"]`).click()
  await p.locator('[data-fach-leiste] [data-fach]').first().waitFor({ timeout: 10000 })
  const knopf = p.locator('[data-als-schueler]')
  pruefe(await da(knopf), 'Knopf „Als Schüler ansehen“ im Klassenkopf')
  const kb = await knopf.boundingBox()
  const lb = await p.locator('[data-fach-leiste]').boundingBox()
  pruefe(kb && lb && kb.x > lb.x + lb.width - 5 && Math.abs(kb.y - lb.y) < 40, 'Knopf rechts neben der Fach-Leiste')
  await knopf.click()
  await p.locator('[data-vorschau-wahl="erfolgreich"]').click()
  await p.screenshot({ path: join(out, '1-wahl.png') })
  const [fenster] = await Promise.all([lk.waitForEvent('page', { timeout: 15000 }), p.locator('[data-vorschau-oeffnen]').click()])
  await fenster.waitForURL(/\/vorschau\?vs=/, { timeout: 15000 })
  pruefe(true, 'Eigenes Fenster geöffnet')
  const streifen = fenster.locator('[data-vorschau-streifen]')
  pruefe(await da(streifen), 'Streifen im Fenster')
  pruefe(/Vorschau als Musterschüler/.test(await streifen.innerText()) && (await streifen.innerText()).includes(K7), `Streifen nennt die Klasse (${K7})`)
  const schluessel = new URL(fenster.url()).searchParams.get('vs')
  const f = fenster.frameLocator('#ansicht')
  pruefe(await da(f.locator('[data-begruessung]'), 25000), 'Schüler-Startseite in der Vorschau')
  const zustand = await f.locator('[data-begruessung]').getAttribute('data-begruessung')
  pruefe(zustand === 'erfolgreich_fleissig', `Lernstand „erfolgreich“ → Begrüßung ${zustand}`)
  console.log(`        „${(await f.locator('[data-begruessung-text]').innerText().catch(() => '')).trim()}“`)
  const neueste = await f.locator('[data-neues-material]').allInnerTexts().catch(() => [])
  pruefe(await da(f.locator('[data-neues-material="vokabeln"]').filter({ hasText: 'Englisch' }), 5000), `Startseite zeigt das Vokabeltraining der Klasse (Englisch) – ${neueste.map((t) => t.split(String.fromCharCode(10))[0]).join(' | ')}`)
  await fenster.screenshot({ path: join(out, '2-vorschau-tablet.png') })

  // Im Fenster: Aufrufe laufen als Musterschüler (fetch mit Schlüssel) – Blatt aus Geschichte sichtbar, abgeben
  const rahmen = fenster.frame({ url: /\/s\// })
  const ichImRahmen = await rahmen.evaluate(() => window.__schulappsServer)
  pruefe(ichImRahmen?.rolle === 'schueler' && ichImRahmen?.quelle === 'vorschau' && ichImRahmen?.vorschau === true, `Im Fenster angemeldet als Musterschüler (${ichImRahmen?.name})`)
  const blaetter = await rahmen.evaluate(() => fetch('/s/api/blaetter').then((r) => r.json()))
  pruefe((blaetter.blaetter ?? []).some((b) => b.titel === BLATT), 'Blatt des anderen Fachs (Geschichte) ist da – ganze Klasse')
  const abgabe = await rahmen.evaluate(
    (id) =>
      fetch('/s/api/blatt/abgeben', {
        method: 'POST',
        headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
        body: JSON.stringify({ id, antworten: { 'a1-1': 'I like the weather.' } })
      }).then((r) => r.status),
    blatt.id
  )
  pruefe(abgabe === 200, `Musterschüler gibt das Blatt ab (${abgabe})`)
  const antwort = await rahmen.evaluate(
    (id) =>
      fetch('/s/api/vokabeln/antwort', {
        method: 'POST',
        headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
        body: JSON.stringify({ id, wortId: 'w0', uebung: 'karte', gewusst: true })
      }).then((r) => r.status),
    vok.id
  )
  pruefe(antwort === 200, `Musterschüler übt Vokabeln (${antwort})`)

  // ---------- Nichts davon zählt
  const d = await (await lk.request.get(`${A}/server/klassen/${gGe.id}`, { headers: KOPF })).json()
  pruefe(d.lernende.length === 2 && !d.lernende.some((l) => /Muster/.test(l.name)), `Lernende der Klasse ohne Musterschüler (${d.lernende.map((l) => l.name).join(', ')})`)
  const b0 = d.blaetter.find((b) => b.titel === BLATT)
  pruefe(b0 && b0.eingereicht === 0 && b0.begonnen === 0 && b0.gesamt === 2, `Meine Klassen: Blatt 0 eingereicht, 0 begonnen, 2 gesamt (${b0?.eingereicht}/${b0?.begonnen}/${b0?.gesamt})`)
  pruefe(b0 && b0.nichtBegonnen.length === 2, 'Noch nicht begonnen: nur die beiden echten Lernenden')
  const bl = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter.find((b) => b.id === blatt.id)
  pruefe(bl && bl.abgaben === 0 && bl.begonnen === 0 && bl.gesamt === 2, `Blattliste: keine Abgabe gezählt (${bl?.abgaben}, gesamt ${bl?.gesamt})`)
  const bd = await (await lk.request.get(`${A}/server/blaetter/${blatt.id}`, { headers: KOPF })).json()
  pruefe((bd.abgaben ?? []).length === 0, `Blatt-Abgaben der Lehrkraft leer (${(bd.abgaben ?? []).length})`)
  if (bd.rueckmeldungId) {
    const fb = await (await lk.request.get(`${A}/server/feedback/${bd.rueckmeldungId}`, { headers: KOPF })).json()
    pruefe((fb.abgaben ?? []).length === 0, 'Verknüpfte Rückmeldung ohne Abgabe des Musterschülers')
  }
  const dEn = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
  pruefe(dEn.vokabeln[0]?.lernende === 2 && dEn.lernende.length === 2, `Vokabeltraining: 2 Lernende (${dEn.vokabeln[0]?.lernende})`)
  const uebersicht = await (await lk.request.get(`${A}/server/klassen`, { headers: KOPF })).json()
  pruefe(uebersicht.klassen.find((k) => k.name === K7)?.lernende === 2, 'Klassenkarte: 2 Lernende')
  const gruppen = await (await lk.request.get(`${A}/server/lerngruppen`, { headers: KOPF })).json().catch(() => ({}))
  const anzahl = (gruppen.gruppen ?? gruppen.lerngruppen ?? []).filter((g) => g.name === K7).map((g) => g.anzahl)
  pruefe(anzahl.every((n) => n === 2), `Lerngruppen zählen 2 (${anzahl.join(', ')})`)
  const nutzer = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer
  pruefe(!nutzer.some((n) => /^vorschau-/.test(n.benutzer) || n.quelle === 'vorschau'), 'Verwaltung: kein Vorschaukonto in der Nutzerliste')
  pruefe(kiZeilen() === kiVorher, `Keine KI-Anfrage (Lernstand, Tipp, Blatt ohne Feedback): ${kiZeilen() - kiVorher}`)

  // ---------- Schlüssel nur mit der Sitzung derselben Lehrkraft
  const ohne = await browser.newContext()
  const r1 = await ohne.request.get(`${A}/s/api/lernstand`, { headers: { ...KOPF, 'x-schulapps-vorschau': schluessel } })
  pruefe(r1.status() === 403, `Ohne Anmeldung: Schlüssel allein gilt nicht (${r1.status()})`)
  const andere = await browser.newContext()
  await anmelden(andere, fremd.benutzer, fremd.passwort)
  const r2 = await andere.request.get(`${A}/s/api/lernstand`, { headers: { ...KOPF, 'x-schulapps-vorschau': schluessel } })
  pruefe(r2.status() === 403, `Andere Lehrkraft mit dem Schlüssel: abgewiesen (${r2.status()})`)
  const r3 = await andere.request.post(`${A}/server/vorschau/zuruecksetzen`, { headers: KOPF, data: { schluessel, zustand: 'neu' } })
  pruefe(r3.status() === 403, `Andere Lehrkraft kann nicht zurücksetzen (${r3.status()})`)
  const r4 = await andere.request.post(`${A}/server/klassen/${gEn.id}/vorschau`, { headers: KOPF, data: { zustand: 'neu' } })
  pruefe(r4.status() === 404, `Fremde Klasse: keine Vorschau (${r4.status()})`)
  const r5 = await lk.request.post(`${A}/api`, { headers: { ...KOPF, 'x-schulapps-vorschau': schluessel }, data: { channel: 'library:list', args: [] } })
  pruefe(r5.status() === 403, `Mit Schlüssel keine Programme (Rolle bleibt schueler): ${r5.status()}`)
  const r6 = await lk.request.post(`${A}/auth/abmelden`, { headers: { ...KOPF, 'x-schulapps-vorschau': schluessel } })
  pruefe(r6.status() === 200 && (await r6.json()).vorschau === true, 'Abmelden in der Vorschau beendet nicht die Sitzung der Lehrkraft')

  // ---------- Umschalter, Zurücksetzen
  await fenster.locator('.geraete button[data-geraet="handy"]').click()
  await fenster.waitForTimeout(400)
  const breite = await fenster.locator('#ansicht').evaluate((e) => e.getBoundingClientRect().width)
  pruefe(Math.round(breite) === 390, `Handy: Ansicht 390 px breit (${Math.round(breite)})`)
  await fenster.screenshot({ path: join(out, '3-vorschau-handy.png') })
  await fenster.locator('.geraete button[data-geraet="pc"]').click()
  // Lernstand wirkt schon mit der Auswahl (08.10.2026) – ohne Knopf
  await fenster.locator('[data-vorschau-zustand]').selectOption('fleissig')
  await fenster.waitForTimeout(1500)
  await fenster.waitForFunction(() => !document.querySelector('[data-vorschau-zustand]').disabled, null, { timeout: 15000 }).catch(() => undefined)
  pruefe(
    await da(fenster.frameLocator('#ansicht').locator('[data-begruessung]:not([data-begruessung="neu"])'), 20000),
    'Auswahl „fleißig“ ohne Knopf: Begrüßung nicht mehr für Neue'
  )
  await fenster.locator('[data-vorschau-zustand]').selectOption('neu')
  await fenster.waitForTimeout(1500)
  pruefe(await da(fenster.frameLocator('#ansicht').locator('[data-begruessung="neu"]'), 20000), 'Auswahl „neu“ ohne Knopf: Begrüßung für Neue')
  await fenster.locator('[data-vorschau-zuruecksetzen]').click()
  await fenster.waitForTimeout(1500)
  pruefe(await da(f.locator('[data-begruessung="neu"]'), 20000), 'Zurückgesetzt auf „neu“: Begrüßung für Neue')
  const nachReset = await rahmen.evaluate(() => fetch('/s/api/blaetter').then((r) => r.json())).catch(async () =>
    fenster.frame({ url: /\/s\// }).evaluate(() => fetch('/s/api/blaetter').then((r) => r.json()))
  )
  pruefe(!(nachReset.blaetter ?? []).find((b) => b.titel === BLATT)?.genutzt, 'Nach dem Zurücksetzen ist die Abgabe weg')
  await fenster.screenshot({ path: join(out, '4-zurueckgesetzt.png') })

  // ---------- Haupt-App bleibt angemeldet und bedienbar
  const ich = await p.evaluate(() => fetch('/server/ich.js', { cache: 'no-store' }).then((r) => r.text()))
  pruefe(ich.includes(`"benutzer":"${lehrer.benutzer}"`) && ich.includes('"rolle":"lehrkraft"'), 'Haupt-App: weiterhin als Lehrkraft angemeldet')
  await p.getByRole('button', { name: 'Alle Klassen' }).click()
  pruefe(await da(p.locator(`[data-klasse="${K7}"]`)), 'Haupt-App bleibt bedienbar')
  await p.screenshot({ path: join(out, '5-haupt-app.png') })
  await fenster.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
