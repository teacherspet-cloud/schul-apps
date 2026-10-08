// Reihenarten (08.10.2026, Plan „Unterrichtsreihe" E1/E4/E5): neue Reihe → drei Karten, „Planung" gewählt; Stunde
// anlegen, Verlauf aus der Vorlage, Phase hinzu, Minuten-Summe gegen die Stundenlänge (zu lang → Angleichen), Hausaufgabe;
// „Mit KI vorschlagen" als Hintergrund-Auftrag (Attrappe „stundenverlauf") ersetzt den Verlauf und speichert ihn;
// kein Zuweisen/keine Schüleransicht, Export „Unterrichtsplanung" (Word/PDF) vorhanden; Wechsel zu „Digital" mit
// Rückfrage – Phasen werden Schritte bzw. Platzhalter „bitte ersetzen"; zugewiesene Reihe kann nicht zurück zu
// „Planung" (Oberfläche gesperrt, Server 409), eine Planungsreihe lässt sich nicht zuweisen (Server 400).
// Vorher: Server lokal mit KI-Attrappe. Der Test trägt seine Antwort selbst in die Attrappe ein und stellt sie danach wieder her.
// Aufruf: node tests/e2e/server-reihe-planung.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-reihe-planung')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const TITEL = `Planungsreihe Probe ${Date.now() % 10000}`

// Attrappe ergänzen (und am Ende wiederherstellen)
const attrappePfad = process.env.SCHULAPPS_KI_ATTRAPPE ?? join(process.env.TEMP ?? '', 'attrappe.json')
const attrappeAlt = readFileSync(attrappePfad, 'utf8')
const attrappe = JSON.parse(attrappeAlt)
attrappe.antworten = {
  ...attrappe.antworten,
  stundenverlauf: {
    ziel: 'Die Lernenden erklären die Ursachen der Julikrise.',
    phasen: [
      { phase: 'Einstieg', minuten: 8, geschehen: 'Karikatur deuten · Leitfrage sammeln', sozialform: 'UG', medien: 'Folie' },
      { phase: 'Erarbeitung', minuten: 25, geschehen: 'Quellen in Partnerarbeit auswerten', sozialform: 'PA', medien: 'Buch S. 34' },
      { phase: 'Sicherung', minuten: 10, geschehen: 'Tafelbild Ursachen', sozialform: 'UG', medien: 'Tafel' },
      { phase: 'Hausaufgabe', minuten: 2, geschehen: 'Zeitleiste ergänzen', sozialform: 'EA', medien: '' }
    ],
    hinweise: 'Hilfekarten für die Quellenarbeit bereithalten.'
  }
}
writeFileSync(attrappePfad, JSON.stringify(attrappe, null, 2))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const reihenWeg = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk = null
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Pia Planerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const reiheAmServer = async (id) => (await (await lk.request.get(`${A}/server/reihen/${id}`, { headers: KOPF })).json()).reihe
  const eigene = async () => (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen ?? []

  const p = await lk.newPage()
  p.on('dialog', (d) => void d.accept())
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await p.mouse.move(800, 700)

  // ---------- Neue Reihe: drei Karten, „Planung"
  await p.locator('[data-reihe-neu]').click()
  await p.locator('[data-reihe-art-wahl]').waitFor({ timeout: 15000 })
  pruefe((await p.locator('[data-reihe-art]').count()) === 3, 'Neue Reihe: drei Karten (digital, gemischt, Planung)')
  await p.screenshot({ path: join(out, '1-artwahl.png'), fullPage: true })
  await p.locator('[data-reihe-art="planung"]').click()
  await p.locator('[data-reihe-titel]').fill(TITEL)
  pruefe((await p.locator('[data-reihe-art-plakette="planung"]').count()) >= 1, 'Plakette „Planung“ im Kopf')
  await p.locator('[data-stunde-neu="einzel"]').first().click()
  await p.locator('[data-planung-stunde="0"]').waitFor({ timeout: 10000 })
  pruefe(true, 'Stundenansicht mit Verlauf je Stunde')
  pruefe((await p.locator('[data-reihe-zuweisen]').count()) === 0 && (await p.locator('[data-planung-hinweis]').count()) === 1, 'Kein „Zuweisen“, dafür Hinweis „Planungsreihe“')
  pruefe((await p.locator('[data-ablauf-testen], [data-schuelervorschau]').count()) === 0, 'Keine Schüleransicht / kein Ablauf-Test')

  // ---------- Phasen: Vorlage, Phase hinzu, Minuten-Summe
  const stunde = p.locator('[data-planung-stunde="0"]')
  await stunde.locator('[data-phase-vorlage]').click()
  pruefe((await stunde.locator('[data-phase-zeile]').count()) === 3, 'Vorlage: Einstieg – Erarbeitung – Sicherung')
  pruefe((await stunde.locator('[data-planung-summe]').getAttribute('data-planung-summe')) === '45', 'Vorlage füllt die 45 Minuten')
  await stunde.locator('[data-phase-neu]').click()
  pruefe((await stunde.locator('[data-phase-zeile]').count()) === 4, 'Phase hinzugefügt')
  await stunde.locator('[data-phase-zeile="3"] [data-phase-feld="phase"]').fill('Transfer')
  await stunde.locator('[data-phase-zeile="3"] [data-phase-feld="minuten"]').fill('10')
  await stunde.locator('[data-phase-zeile="0"] [data-phase-feld="geschehen"]').fill('Bildimpuls · Fragen sammeln')
  await p.waitForTimeout(300)
  const summe = await stunde.locator('[data-planung-summe]').getAttribute('data-planung-summe')
  pruefe(summe === '55' && (await stunde.getAttribute('data-ueberlang')) !== null, `Zu lang markiert (${summe} von 45 min)`)
  await stunde.locator('[data-minuten-angleichen]').click()
  pruefe((await stunde.locator('[data-planung-summe]').getAttribute('data-planung-summe')) === '45', 'Angleichen: genau 45 Minuten')
  await stunde.locator('[data-hausaufgabe]').fill('Buch S. 36 lesen')
  await p.screenshot({ path: join(out, '2-verlauf.png'), fullPage: true })
  await p.locator('[data-reihe-speichern]').click()
  await p.waitForTimeout(1500)
  const id = (await eigene()).find((x) => x.titel === TITEL)?.id
  pruefe(Boolean(id), 'Planungsreihe gespeichert')
  if (id) reihenWeg.push(id)
  const r1 = await reiheAmServer(id)
  pruefe(r1.art === 'planung' && r1.verlauf?.['0']?.phasen?.length === 4 && r1.verlauf['0'].hausaufgabe === 'Buch S. 36 lesen', 'Am Server: Art, 4 Phasen, Hausaufgabe')

  // ---------- Export vorhanden
  await p.locator('[data-planung-export]').click()
  // Das Menü öffnet mit einer kurzen Einblendung – erst auf die Einträge warten, dann zählen
  await p.locator('[data-planung-export-art]').first().waitFor({ timeout: 5000 }).catch(() => {})
  pruefe(
    (await p.locator('[data-planung-export-art="word"]').count()) === 1 && (await p.locator('[data-planung-export-art="pdf"]').count()) === 1,
    'Export „Unterrichtsplanung“: Word und PDF'
  )
  await p.keyboard.press('Escape')

  // ---------- KI-Vorschlag als Hintergrund-Auftrag (ersetzt nach Rückfrage)
  await stunde.locator('[data-planung-ki]').click()
  await p.waitForFunction(
    () => [...document.querySelectorAll('[data-planung-stunde="0"] [data-phase-feld="geschehen"]')].some((x) => /Karikatur/.test(x.value)),
    null,
    { timeout: 60000 }
  )
  pruefe((await stunde.locator('[data-phase-zeile]').count()) === 3, 'KI-Verlauf übernommen: drei Phasen (Hausaufgabe als eigenes Feld)')
  pruefe((await stunde.locator('[data-hausaufgabe]').inputValue()) === 'Zeitleiste ergänzen', 'Hausaufgabe aus dem KI-Vorschlag')
  await p.waitForTimeout(1500)
  const r2 = await reiheAmServer(id)
  pruefe(r2.verlauf?.['0']?.phasen?.length === 3 && r2.verlauf['0'].phasen.reduce((n, x) => n + x.minuten, 0) === 45, 'KI-Verlauf gleich gespeichert, 45 Minuten')

  // ---------- Zuweisen einer Planungsreihe: Server lehnt ab
  const zw = await lk.request.post(`${A}/server/reihen/${id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: '', schueler: [], gaeste: true } })
  pruefe(zw.status() === 400, `Planungsreihe nicht zuweisbar (${zw.status()})`)

  // ---------- Wechsel zu „Digital": Phasen ohne Material → Platzhalter „bitte ersetzen", Hausaufgabe → Platzhalter
  await p.locator('[data-reihe-art-plakette]').first().click()
  await p.locator('[data-reihe-art-nach="digital"]').click()
  await p.locator('[data-reihe-art-wechsel="digital"]').waitFor()
  const erklaerung = (await p.locator('[data-reihe-art-wechsel="digital"]').textContent()) ?? ''
  pruefe(/3 Phasen ohne Material werden Platzhalter/.test(erklaerung) && /bitte ersetzen/.test(erklaerung), 'Rückfrage erklärt die Umwandlung')
  await p.screenshot({ path: join(out, '3-wechsel.png'), fullPage: true })
  await p.locator('[data-reihe-art-los]').click()
  await p.locator('[data-reihe-zuweisen]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(1500)
  const r3 = await reiheAmServer(id)
  pruefe(r3.art === 'digital' && !r3.verlauf, `Am Server digital, Verläufe entfallen (${r3.art})`)
  pruefe(r3.schritte.filter((s) => s.ersetzen && s.platzhalter).length === 3, 'Drei Platzhalter „bitte ersetzen“')
  pruefe(r3.schritte.some((s) => s.titel === 'Hausaufgabe' && s.platzhalter), 'Hausaufgabe als Platzhalter')
  pruefe((await p.locator('[data-bitte-ersetzen]').count()) === 3, 'Schrittkarten zeigen „bitte ersetzen“')
  // Digital: kein „Im Unterricht" im Menü
  await p.locator('[data-schritt-neu]').first().click()
  pruefe((await p.locator('[data-schritt-art="praesenz"]').count()) === 0, 'Digital: Menü ohne „Im Unterricht“')
  await p.keyboard.press('Escape')
  await p.screenshot({ path: join(out, '4-digital.png'), fullPage: true })

  // ---------- Zugewiesen → nicht zurück zur Planung
  const zw2 = await (await lk.request.post(`${A}/server/reihen/${id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: '', schueler: [], gaeste: true } })).json()
  pruefe(Boolean(zw2.id), 'Digitale Reihe zugewiesen (Gäste)')
  await p.locator('[data-reihe-art-plakette]').first().click()
  await p.locator('[data-reihe-art-nach="planung"]').click()
  await p.locator('[data-reihe-art-gesperrt]').waitFor({ timeout: 10000 })
  pruefe(await p.locator('[data-reihe-art-los]').isDisabled(), 'Zugewiesen: Wechsel zur Planung gesperrt')
  await p.keyboard.press('Escape')
  const r4 = await reiheAmServer(id)
  const zurueck = await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: { ...r4, art: 'planung' } } })
  pruefe(zurueck.status() === 409, `Server lehnt „Planung“ für zugewiesene Reihe ab (${zurueck.status()})`)
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  writeFileSync(attrappePfad, attrappeAlt)
  if (lk) for (const id of reihenWeg) await lk.request.post(`${A}/server/reihen/${id}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
