// Vollbild beim Lernen (09.10.2026): Vorgabe an – die laufende Übung füllt den Bildschirm (Kopfzeile und Ordner
// verschwinden), echtes Vollbild des Browsers beim Start per Klick, „Vollbild aus/an" nur für diese Übung, Zurück-Geste,
// Ende der Runde → vorige Ansicht (auch im Fachordner), Arbeitsblatt bleibt nach dem Einreichen offen bis „×",
// Einstellung aus → normale Ansicht mit „Vollbild an".
// Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-fokus.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-fokus')
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
const VORLAGE = {
  version: 1,
  meta: { title: 'Fokusprobe', subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 7, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'Fokusprobe', aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const WOERTER = [
  { id: 'w1', term: 'river', translation: 'Fluss' },
  { id: 'w2', term: 'bridge', translation: 'Brücke' },
  { id: 'w3', term: 'forest', translation: 'Wald' },
  { id: 'w4', term: 'island', translation: 'Insel' },
  { id: 'w5', term: 'mountain', translation: 'Berg' }
]
// Nach der Tagesrunde: „Freiwillig weiter üben" statt „Los"
const START = '[data-vokabel-start], [data-freiwillig-ueben]'

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let vokId = ''
let blattId = ''

/** Zustand der Seite: Fokusansicht, Kopfzeile sichtbar, echtes Vollbild, eigener Eintrag im Verlauf */
const lage = (s) =>
  s.evaluate(() => {
    const f = document.querySelector('.sa-fokus[data-fokus="an"]')
    const kopf = document.querySelector('[data-schueler-kopf]')
    return {
      fokus: f?.getAttribute('data-fokus-name') ?? null,
      kopf: Boolean(kopf && getComputedStyle(kopf).visibility === 'visible'),
      vollbild: Boolean(document.fullscreenElement),
      eintrag: Boolean(window.history.state?.saFokus),
      deckt: f ? f.getBoundingClientRect().top <= 0 && f.getBoundingClientRect().height >= window.innerHeight - 1 : false
    }
  })

/** Eine Vokabelrunde zu Ende spielen (neue Wörter: Lernkarte „gewusst") */
const rundeSpielen = async (s) => {
  for (let i = 0; i < 60; i++) {
    if (
      await s
        .locator('[data-sitzung-fertig]')
        .isVisible()
        .catch(() => false)
    )
      return true
    if (
      await s
        .locator('[data-lernkarte]')
        .isVisible()
        .catch(() => false)
    ) {
      await s.locator('[data-lernkarte]').click()
      await s.waitForTimeout(150)
      await s.locator('[data-karte-gewusst]').click()
      await s.waitForTimeout(250)
    } else if (
      await s
        .locator('[data-weiter]')
        .isVisible()
        .catch(() => false)
    )
      await s.locator('[data-weiter]').click()
    else if (
      await s
        .locator('[data-sitzung] .vt-buehne button:not([disabled])')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await s.locator('[data-sitzung] .vt-buehne button:not([disabled])').first().click()
      await s.waitForTimeout(250)
    } else await s.waitForTimeout(300)
  }
  return false
}

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Vera Vollbild' } })).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, { headers: KOPF, data: { titel: 'Fokuswörter', sprache: 'en', fach: 'Englisch', gaeste: true, woerter: WOERTER } })
  ).json()
  vokId = vok.id
  const code = (await (await lk.request.get(`${A}/server/vokabeln/${vok.id}`, { headers: KOPF })).json()).code
  const gc = await browser.newContext({ viewport: { width: 1100, height: 820 } })
  pruefe(Boolean(vokId && code) && (await gc.request.post(`${A}/s/api/vokabeln/gast`, { headers: KOPF, data: { code, name: 'Finn F.' } })).ok(), 'Gast „Finn F." tritt dem Vokabeltraining bei')
  const s = await gc.newPage()
  s.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))

  // ---------- Einstellung: Vorgabe an
  await s.goto(`${A}/s/einstellungen`)
  await s.locator('[data-bereich-kachel="lernen"]').click()
  const schalter = s.locator('input[data-vollbild], [data-vollbild] input').first()
  pruefe((await da(schalter, 8000)) && (await schalter.isChecked()), 'Einstellungen › Lernen: „Vollbild beim Lernen" ist an (Vorgabe)')

  // ---------- Vokabelrunde (eigene Seite)
  await s.goto(`${A}/s/v/${vokId}`)
  await s.locator('[data-vokabel-start]').waitFor()
  let l = await lage(s)
  pruefe(l.kopf && !l.fokus, 'Kasten: normale Ansicht mit Kopfzeile')
  await s.locator('[data-vokabel-start]').click()
  await s.locator('[data-sitzung]').waitFor()
  await s.waitForTimeout(300)
  l = await lage(s)
  pruefe(l.fokus === 'vokabelrunde' && !l.kopf && l.deckt, `Runde: nur die Übung zu sehen, Kopfzeile weg (${JSON.stringify(l)})`)
  pruefe(l.vollbild, 'Runde per Klick gestartet: echtes Vollbild des Browsers')
  pruefe(l.eintrag, 'Eigener Eintrag im Verlauf (Zurück verlässt das Vollbild, nicht die Seite)')
  pruefe(await s.locator('[data-fokus-beenden]').isVisible(), '„× Beenden" oben rechts')
  await s.screenshot({ path: join(out, '1-runde-vollbild.png') })

  // „Vollbild aus" nur für diese Übung
  await s.locator('[data-fokus-umschalten="aus"]').click()
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(!l.fokus && l.kopf && !l.vollbild && !l.eintrag, `„Vollbild aus": normale Ansicht, Vollbild und Eintrag weg (${JSON.stringify(l)})`)
  pruefe((await s.locator('[data-sitzung]').isVisible()) && (await s.locator('[data-fokus-umschalten="an"]').isVisible()), 'Die Runde läuft weiter, mit „Vollbild an"')
  const gespeichert = (await (await gc.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung
  pruefe(gespeichert?.vollbild !== false, 'Die Einstellung bleibt unverändert')
  await s.screenshot({ path: join(out, '2-runde-normal.png') })
  await s.locator('[data-fokus-umschalten="an"]').click()
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(l.fokus === 'vokabelrunde' && l.vollbild && l.eintrag, '„Vollbild an": wieder Vollbild (im Klick angefordert)')
  // Zurück-Geste: verlässt nur die Fokusansicht
  await s.goBack()
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(!l.fokus && l.kopf && !l.vollbild && (await s.locator('[data-sitzung]').isVisible()) && s.url().includes(`/s/v/${vokId}`), 'Zurück-Geste: normale Ansicht, Runde und Seite bleiben')
  await s.locator('[data-fokus-umschalten="an"]').click()
  await s.waitForTimeout(300)
  // Echtes Vollbild vom Browser verlassen: Fokusansicht bleibt, „×" und „Ganzer Bildschirm" sichtbar
  await s.evaluate(() => document.exitFullscreen())
  // Länger als die Esc-Sperre nach dem Verlassen des Vollbilds (400 ms) warten – sonst Wettlauf
  await s.waitForTimeout(800)
  l = await lage(s)
  pruefe(l.fokus === 'vokabelrunde' && !l.vollbild && (await s.locator('[data-fokus-ganz]').isVisible()), 'Browser verlässt das Vollbild: Fokusansicht bleibt (mit „Ganzer Bildschirm")')
  // Esc außerhalb des echten Vollbilds beendet die Übung
  await s.keyboard.press('Escape')
  pruefe(await da(s.locator('[data-vokabel-start]'), 5000), 'Esc: zurück zum Kasten (Stand gespeichert)')
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(!l.fokus && l.kopf && !l.eintrag, `Nach Esc: normale Ansicht, kein Eintrag im Verlauf übrig (${JSON.stringify(l)})`)

  // Runde bis zum Ende: „Geschafft!" in der normalen Ansicht, Vollbild beendet
  await s.locator('[data-vokabel-start]').click()
  await s.locator('[data-sitzung]').waitFor()
  pruefe(await rundeSpielen(s), 'Runde zu Ende gespielt')
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(!l.fokus && l.kopf && !l.vollbild && !l.eintrag, `Ende der Runde: Vollbild endet von selbst (${JSON.stringify(l)})`)
  await s.screenshot({ path: join(out, '3-geschafft.png') })
  await s.locator('[data-sitzung-zurueck]').click()

  // Spiel: läuft im Vollbild, × → zurück zur Spielauswahl
  await s.locator('[data-spiel-gruppe-kopf]').first().waitFor({ timeout: 8000 }).catch(() => undefined)
  if (!(await s.locator('[data-spiel-wahl]:not([disabled])').first().isVisible().catch(() => false)))
    await s.locator('[data-spiel-gruppe]:not([data-offen]) [data-spiel-gruppe-kopf]').first().click().catch(() => undefined)
  const spiel = s.locator('[data-spiel-wahl]:not([disabled])').first()
  if (await da(spiel, 5000)) {
    await spiel.click()
    await s.locator('[data-spiel-laeuft]').waitFor()
    await s.waitForTimeout(300)
    l = await lage(s)
    pruefe(l.fokus === 'spiel' && !l.kopf && l.vollbild, 'Spiel: im Vollbild')
    await s.screenshot({ path: join(out, '4-spiel.png') })
    await s.locator('[data-fokus-beenden]').click()
    await s.waitForTimeout(500)
    l = await lage(s)
    pruefe(!l.fokus && l.kopf && !l.vollbild && (await s.locator('[data-spiel-wahl]').first().isVisible()), '× im Spiel: zurück zur Spielauswahl')
  } else pruefe(false, 'Spielauswahl nach der Runde')

  // ---------- Im Fachordner: Runde als Seite, Ende → zurückblättern
  await s.goto(`${A}/s/`)
  const ordner = s.locator('[data-regal-ordner="Englisch"]')
  if (await da(ordner, 8000)) {
    await ordner.click()
    await s.waitForURL(/\/s\/ordner\//)
    await s.locator('[data-ordner="Englisch"]').waitFor()
    await s.locator('[data-ordner]').locator(START).first().waitFor()
    await s.waitForTimeout(800)
    const tiefe = async () => Number(await s.locator('[data-ordner-tiefe]').getAttribute('data-ordner-tiefe'))
    await s.locator('[data-ordner]').locator(START).first().click()
    await s.locator('[data-ordner] [data-sitzung]').waitFor()
    await s.waitForTimeout(700)
    l = await lage(s)
    const ordnerSichtbar = await s.evaluate(() => getComputedStyle(document.querySelector('[data-ordner]')).visibility === 'visible')
    pruefe(l.fokus === 'vokabelrunde' && !ordnerSichtbar && !l.kopf && l.deckt && (await tiefe()) === 1, `Im Ordner: Runde im Vollbild, Ordner ausgeblendet (${JSON.stringify(l)})`)
    pruefe(!l.eintrag, 'Im Ordner: kein eigener Eintrag (die Runde ist schon eine Ordnerseite)')
    await s.screenshot({ path: join(out, '5-ordner-runde.png') })
    await s.locator('[data-fokus-beenden]').click()
    await s.waitForTimeout(900)
    l = await lage(s)
    pruefe(!l.fokus && (await tiefe()) === 0 && (await s.locator('[data-ordner]').locator(START).first().isVisible()), '× im Ordner: blättert zurück zum Kasten')
    // Zurück-Geste im Ordner: blättert zurück (Runde beendet)
    await s.locator('[data-ordner]').locator(START).first().click()
    await s.locator('[data-ordner] [data-sitzung]').waitFor()
    await s.waitForTimeout(600)
    await s.goBack()
    await s.waitForTimeout(900)
    l = await lage(s)
    pruefe(!l.fokus && !l.vollbild && (await tiefe()) === 0, 'Zurück-Geste im Ordner: zurückgeblättert, Vollbild beendet')
  } else pruefe(false, 'Regal mit dem Ordner Englisch')

  // ---------- Einstellung aus: normale Ansicht, „Vollbild an" holt es für diese Übung
  const alt = (await (await gc.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung ?? {}
  await gc.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { ...alt, vollbild: false } })
  await s.evaluate(() => localStorage.removeItem('schulapps-darstellung'))
  await s.goto(`${A}/s/v/${vokId}`)
  await s.waitForTimeout(800)
  await s.locator(START).first().click()
  await s.locator('[data-sitzung]').waitFor()
  await s.waitForTimeout(300)
  l = await lage(s)
  pruefe(!l.fokus && l.kopf && !l.vollbild && (await s.locator('[data-fokus-umschalten="an"]').isVisible()), 'Einstellung aus: normale Ansicht mit „Vollbild an"')
  await s.locator('[data-fokus-umschalten="an"]').click()
  await s.waitForTimeout(400)
  l = await lage(s)
  pruefe(l.fokus === 'vokabelrunde' && l.vollbild, '„Vollbild an" bei ausgeschalteter Einstellung: Vollbild für diese Übung')
  const danach = (await (await gc.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung
  pruefe(danach?.vollbild === false, 'Einstellung bleibt aus')
  await s.locator('[data-fokus-beenden]').click()
  await s.locator(START).first().waitFor()
  await s.locator(START).first().click()
  await s.locator('[data-sitzung]').waitFor()
  await s.waitForTimeout(300)
  pruefe(!(await lage(s)).fokus, 'Nächste Übung folgt wieder der Einstellung (aus)')

  // ---------- Arbeitsblatt: bleibt nach dem Einreichen offen, schließt nur mit ×
  const b = await (
    await lk.request.post(`${A}/server/blaetter/freigeben`, {
      headers: KOPF,
      data: {
        titel: 'Fokusprobe',
        html: '<!doctype html><html><body><div class="ws-page"><p>Aufgabe 1: Schreibe einen Satz.</p></div></body></html>',
        aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
        rueckmeldung: VORLAGE,
        lerngruppeId: '',
        schueler: [],
        gaeste: true,
        einstellungen: { feedback: false }
      }
    })
  ).json()
  blattId = b.id
  const bc = await browser.newContext({ viewport: { width: 1100, height: 820 } })
  pruefe(Boolean(b.id && b.code) && (await bc.request.post(`${A}/s/api/blatt/gast`, { headers: KOPF, data: { code: b.code, name: 'Lia L.' } })).ok(), 'Blatt freigegeben, Gast „Lia L." beigetreten')
  const w = await bc.newPage()
  w.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await w.goto(`${A}/s/b/${b.id}`)
  await w.locator('[data-blatt-ausfuellen]').waitFor()
  await w.waitForTimeout(1200)
  l = await lage(w)
  pruefe(l.fokus === 'arbeitsblatt' && !l.kopf && l.deckt, `Arbeitsblatt im Vollbild (${JSON.stringify(l)})`)
  // Ohne Klick lehnen echte Browser das Vollbild ab (Playwright erlaubt es) – dann bietet „Ganzer Bildschirm" es an
  if (l.vollbild) {
    await w.evaluate(() => document.exitFullscreen())
    await w.waitForTimeout(400)
  }
  pruefe((await lage(w)).fokus === 'arbeitsblatt' && (await w.locator('[data-fokus-ganz]').isVisible()), 'Ohne echtes Vollbild: Fokusansicht mit „Ganzer Bildschirm"')
  await w.locator('[data-fokus-ganz]').click()
  await w.waitForTimeout(300)
  pruefe((await lage(w)).vollbild, '„Ganzer Bildschirm": echtes Vollbild')
  await w.screenshot({ path: join(out, '6-blatt.png') })
  const einreichen = w.locator('[data-blatt-einreichen]')
  if (await da(einreichen, 8000)) {
    w.once('dialog', (dlg) => void dlg.accept())
    await einreichen.click()
    pruefe(await da(w.getByText('1× eingereicht'), 10000), 'Blatt eingereicht')
    await w.waitForTimeout(800)
    l = await lage(w)
    pruefe(l.fokus === 'arbeitsblatt' && !l.kopf, 'Nach dem Einreichen bleibt das Blatt im Vollbild offen')
    await w.screenshot({ path: join(out, '7-blatt-eingereicht.png') })
  } else pruefe(false, '„Einreichen" am Blatt')
  await w.locator('[data-fokus-beenden]').click()
  await w.waitForURL((u) => !u.pathname.startsWith('/s/b/'), { timeout: 8000 }).catch(() => undefined)
  pruefe(!w.url().includes('/s/b/'), `× verlässt das Blatt (${w.url()})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  if (lk && vokId) await lk.request.post(`${A}/server/vokabeln/${vokId}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  if (lk && blattId) await lk.request.post(`${A}/server/blaetter/${blattId}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Training, Blatt und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
