// Freischaltungen planen (09.10.2026, abgestimmt): Die Lehrkraft plant einen Vokabelabschnitt und ein Arbeitsblatt
// gut eine Minute voraus. Vorher sehen die Lernenden nur „Demnächst" im Fachordner (ohne Inhalt), danach den Inhalt und
// einmal „Neu freigeschaltet". In „Meine Klassen" steht die Zeitleiste „Geplant" (verschieben, jetzt, absagen).
// Ohne KI. Vorher: Server lokal, IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-planen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-planen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const N = Date.now() % 1000
const K = `6p${N}`
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const VORLAGE = {
  version: 1,
  meta: { title: 'Mein Zimmer', subjectId: 'englisch', subjectLabel: 'Englisch', grade: 6, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'Mein Zimmer', aufgaben: 'Aufgabe 1: Beschreibe dein Zimmer.', erwartung: 'Drei Sätze.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const WOERTER = ['house', 'garden', 'kitchen', 'room'].map((t, i) => ({ id: `w${i}`, term: t, translation: ['Haus', 'Garten', 'Küche', 'Zimmer'][i] }))
/** Zeitpunkt der geplanten Freischaltung: gut eine Minute voraus (Uhrzeit auf die Minute) */
const AB = Math.ceil((Date.now() + 75_000) / 60_000) * 60_000

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let kurs = ''
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Pia Plan' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K, namen: 'Mia Plan' } })).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const g = await post('/server/lerngruppen/anlegen', { name: K, fach: 'Englisch', iservGruppe: `klasse:${K}` })

  // ---------- Lehrkraft plant: Abschnitt 2 eines Kurses und ein Arbeitsblatt
  const v = await post('/server/vokabeln/freigeben', {
    lerngruppeId: g.id,
    titel: `${K} - Englisch`,
    sprache: 'en',
    fach: 'Englisch',
    woerter: WOERTER,
    teile: [
      { titel: 'Unit 1 · Station 1', anzahl: 2 },
      { titel: 'Unit 1 · Station 2', anzahl: 2 }
    ],
    plan: { teile: [null, AB] }
  })
  kurs = v.id
  pruefe(Boolean(kurs) && v.geplant === true, `Kurs mit geplantem Abschnitt freigegeben (${JSON.stringify(v).slice(0, 120)})`)
  const b = await post('/server/blaetter/freigeben', {
    titel: 'Mein Zimmer',
    html: '<!doctype html><html><body><div class="ws-page"><p>Mein Zimmer</p></div></body></html>',
    aufgaben: [{ nr: 1, anweisung: 'Beschreibe dein Zimmer.', erwartung: 'Drei Sätze.' }],
    rueckmeldung: VORLAGE,
    fach: 'Englisch',
    lerngruppeId: g.id,
    schueler: [],
    einstellungen: { feedback: false },
    plan: { ab: AB }
  })
  pruefe(Boolean(b.id) && b.geplantAb === AB, `Arbeitsblatt geplant ab ${new Date(AB).toLocaleTimeString('de-DE')} (${JSON.stringify(b).slice(0, 120)})`)
  const geplant = await (await lk.request.get(`${A}/server/planen?gruppe=${g.id}`, { headers: KOPF })).json()
  pruefe(
    JSON.stringify(geplant.eintraege.map((e) => e.typ).sort()) === JSON.stringify(['blatt', 'vok']),
    `Zeitleiste „Geplant“: ${geplant.eintraege.map((e) => `${e.typ}:${e.titel}`).join(', ')}`
  )

  // ---------- Lehrkraft-Oberfläche: „Geplant" in Meine Klassen, Kennzeichen am Blatt
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K}"]`).click()
  pruefe(await da(p.locator('[data-geplant-karte]')), 'Meine Klassen: Karte „Geplant“')
  pruefe(
    (await p.locator('[data-geplant-karte] [data-geplant]').count()) === 2 &&
      (await p.locator('[data-geplant-karte] [data-geplant-titel="Mein Zimmer"]').count()) === 1,
    'Zeitleiste mit Abschnitt und Blatt'
  )
  pruefe(
    /geplant ab/.test((await p.locator('[data-material-titel="Mein Zimmer"]').innerText().catch(() => '')) ?? ''),
    'Blatt in der Materialliste mit „geplant ab …“'
  )
  await p.screenshot({ path: join(out, '1-geplant-lehrkraft.png') })

  // ---------- Lernende vor dem Zeitpunkt: nur „Demnächst"
  const mia = liste.angelegt[0]
  const sm = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  const blaetter = async () => (await (await sm.request.get(`${A}/s/api/blaetter`, { headers: KOPF })).json()).blaetter ?? []
  const woerter = async () => (await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${kurs}`, { headers: KOPF })).json()).woerter ?? []
  pruefe((await blaetter()).length === 0, 'Vorher: kein Arbeitsblatt für Mia')
  pruefe((await woerter()).length === 2, `Vorher: nur die Wörter von Station 1 (${(await woerter()).length})`)
  const s = await sm.newPage()
  s.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await s.goto(`${A}/s/ordner/Englisch?r=vok`)
  pruefe(await da(s.locator('[data-demnaechst]')), 'Fachordner: grauer Hinweis „Demnächst“')
  const text = (await s.locator('[data-demnaechst]').innerText().catch(() => '')) ?? ''
  pruefe(/Ab .*: Unit 1 · Station 2/.test(text), `„Demnächst“ nennt Datum und Abschnitt (${text.replace(/\s+/g, ' ')})`)
  await s.screenshot({ path: join(out, '2-demnaechst.png') })
  // Noch kein Register „Materialien" im Ordner: das kommende Blatt steht im ersten Register mit
  if (await s.locator('[data-lasche="mat"]').count()) await s.locator('[data-lasche="mat"]').click()
  pruefe(/Mein Zimmer/.test((await s.locator('[data-demnaechst]').innerText().catch(() => '')) ?? ''), '„Demnächst: Mein Zimmer“ (ohne Link)')
  pruefe((await s.locator('a[href*="/s/b/"]').count()) === 0, 'Kein Link zum Blatt vor dem Zeitpunkt')

  // ---------- Warten bis zum Zeitpunkt (kein Zeitplaner: der nächste Abruf entscheidet)
  const warten = AB - Date.now() + 1500
  console.log(`  …  warte ${Math.round(warten / 1000)} s bis zur Freischaltung`)
  if (warten > 0) await s.waitForTimeout(warten)
  pruefe((await blaetter()).some((x) => x.titel === 'Mein Zimmer'), 'Danach: das Blatt ist da')
  pruefe((await woerter()).length === 4, `Danach: alle Wörter (${(await woerter()).length})`)
  await s.goto(`${A}/s/`)
  pruefe(await da(s.locator('[data-neu-freigeschaltet]')), 'Beim nächsten Öffnen: „Neu freigeschaltet“')
  const neu = await s.locator('[data-neu-eintrag]').evaluateAll((e) => e.map((x) => x.getAttribute('data-neu-eintrag')))
  pruefe(neu.includes('Mein Zimmer') && neu.includes('Unit 1 · Station 2'), `Hinweis nennt Blatt und Abschnitt (${neu.join(', ')})`)
  await s.screenshot({ path: join(out, '3-neu-freigeschaltet.png') })
  await s.locator('[data-neu-ok]').click()
  await s.reload()
  await s.waitForTimeout(2500)
  pruefe((await s.locator('[data-neu-freigeschaltet]').count()) === 0, 'Nur einmal: nach „Alles klar“ kein Hinweis mehr')
  await s.goto(`${A}/s/ordner/Englisch?r=vok`)
  await s.waitForTimeout(1500)
  pruefe((await s.locator('[data-demnaechst]').count()) === 0, 'Kein „Demnächst“ mehr')
  const nachher = await (await lk.request.get(`${A}/server/planen?gruppe=${g.id}`, { headers: KOPF })).json()
  pruefe(nachher.eintraege.length === 0, 'Zeitleiste der Lehrkraft leer')

  // ---------- Absagen: geplante Freigabe verschwindet ganz
  const b2 = await post('/server/blaetter/freigeben', {
    titel: 'Später',
    html: '<!doctype html><html><body><div class="ws-page"><p>Später</p></div></body></html>',
    aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
    rueckmeldung: VORLAGE,
    lerngruppeId: g.id,
    schueler: [],
    einstellungen: { feedback: false },
    plan: { ab: Date.now() + 86_400_000 }
  })
  const weg = await post('/server/planen/absagen', { typ: 'blatt', id: b2.id })
  const liste2 = await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()
  pruefe(weg.ok === true && !liste2.blaetter.some((x) => x.id === b2.id), 'Absagen löscht die geplante Freigabe')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  if (lk && kurs) await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
