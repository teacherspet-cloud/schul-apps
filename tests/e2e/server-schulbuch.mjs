// Phase 6b (05.10.2026): Schulbuchseiten erkennen – Arbeitsblatt (Material hochladen) und Zwischenaufgabe der Reihe.
// Bild hochladen → Datenschutz → KI erkennt (Attrappe „schulbuch_erkennung") → Pop-up je Abschnitt → Ergebnis:
// keine Seitenbilder als Material, Text mit Verweis bzw. Übernahme samt Quelle.
// Vorher: Server lokal mit KI-Attrappe. Der Test trägt seine Antwort selbst ein und stellt die Attrappe danach wieder her.
// Aufruf: node tests/e2e/server-schulbuch.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-schulbuch')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
// Ein echtes kleines PNG (Seitenfoto-Ersatz)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const seite = join(out, 'seite-39.png')
writeFileSync(seite, PNG)

const attrappePfad = process.env.SCHULAPPS_KI_ATTRAPPE ?? join(process.env.TEMP ?? '', 'attrappe.json')
const attrappeAlt = readFileSync(attrappePfad, 'utf8')
const attrappe = JSON.parse(attrappeAlt)
attrappe.antworten = {
  ...attrappe.antworten,
  schulbuch_erkennung: {
    istSchulbuch: true,
    titel: 'Geschichte und Geschehen 2',
    verlag: 'Klett',
    seiten: '38–39',
    abschnitte: [
      { kennung: 'VT1', art: 'Verfassertext', titel: 'Der Weg in den Krieg', seite: '38', text: 'Im Sommer 1914 spitzte sich die Lage zu.' },
      { kennung: 'M2', art: 'Quelle', titel: 'Brief eines Soldaten', seite: '39', text: 'Liebe Mutter, wir liegen im Graben.' },
      { kennung: 'Aufgaben', art: 'Aufgaben', titel: '', seite: '39', text: '1. Beschreibe M2.' }
    ]
  }
}
writeFileSync(attrappePfad, JSON.stringify(attrappe, null, 2))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const datenschutz = async (p) => {
  const ok = p.locator('[data-datenschutz-ok]')
  if (
    await ok.waitFor({ timeout: 8000 }).then(
      () => true,
      () => false
    )
  )
    await ok.click()
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Sina Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const p = await lk.newPage()

  // ---------- Arbeitsblatt: Material hochladen
  await p.goto(`${A}/?einzeln=arbeitsblatt`)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  pruefe(await p.locator('[data-app-kopf]').first().isVisible(), 'Gemeinsamer Kopf im Arbeitsblatt')
  const karte = p.locator('.mantine-Card-root', { hasText: 'Eigenes Material (optional)' })
  await karte.locator('input[type=file]').setInputFiles(seite)
  await datenschutz(p)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: join(out, '0-nach-upload.png') })
  await p.locator('.mantine-Modal-content', { hasText: 'Schulbuchseiten erkannt' }).waitFor({ timeout: 20000 })
  pruefe((await p.locator('[data-schulbuch-abschnitt]').count()) === 3, 'Pop-up: drei Abschnitte erkannt')
  pruefe((await p.locator('[data-schulbuch-titel]').inputValue()) === 'Geschichte und Geschehen 2', 'Pop-up: Buchtitel erkannt')
  // M2 übernehmen
  await p.locator('[data-schulbuch-abschnitt="M2"]').getByText('Text übernehmen').click()
  await p.screenshot({ path: join(out, '1-popup.png') })
  await p.locator('[data-schulbuch-ok]').click()
  await p.waitForTimeout(800)
  // Ergebnis im Material: Text statt Seitenbild (Store über die Sicherung in der Ablage nicht nötig – die Liste zeigt „Zeichen")
  const liste = await karte.textContent()
  pruefe(
    /Zeichen/.test(liste ?? '') && !/Seitenbild/.test(liste ?? ''),
    `Material als Text, kein Seitenbild (${(liste ?? '').replace(/\s+/g, ' ').slice(0, 120)})`
  )
  await p.screenshot({ path: join(out, '2-material.png'), fullPage: true })

  // ---------- Zwischenaufgabe in einer Reihe
  const gesp = await (
    await lk.request.post(`${A}/server/reihen/speichern`, {
      headers: KOPF,
      data: {
        reihe: {
          id: '',
          titel: 'Schulbuch-Reihe',
          fachId: 'geschichte',
          fachLabel: 'Geschichte',
          stateId: 'NI',
          schoolTypeId: 'gymnasium',
          grade: 8,
          oberthema: 'Erster Weltkrieg',
          lernziele: [],
          schritte: []
        }
      }
    })
  ).json()
  await p.goto(`${A}/?einzeln=unterrichtsreihe`)
  await p.waitForTimeout(2500)
  await p.locator('[data-reihe-karte="Schulbuch-Reihe"] [data-reihe-oeffnen]').click()
  await p.locator('[data-reihe-editor]').waitFor({ timeout: 15000 })
  await p.locator('[data-schritt-neu]').first().click()
  await p.locator('[data-schritt-art="aufgabe"]').click()
  await p.locator('[data-aufgabe-anweisung]').fill('Erkläre, warum der Krieg ausbrach.')
  const [wahl] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-aufgabe-schulbuch]').click()])
  await wahl.setFiles(seite)
  await datenschutz(p)
  await p.locator('.mantine-Modal-content', { hasText: 'Schulbuchseiten erkannt' }).waitFor({ timeout: 20000 })
  await p.locator('[data-schulbuch-abschnitt="M2"]').getByText('Text übernehmen').click()
  await p.locator('[data-schulbuch-ok]').click()
  await p.waitForTimeout(800)
  const anweisung = await p.locator('[data-aufgabe-anweisung]').inputValue()
  pruefe(
    anweisung.startsWith('Lies VT1 (S. 38) in deinem Schulbuch „Geschichte und Geschehen 2“.'),
    `Leseauftrag vor der Anweisung („${anweisung.slice(0, 90)}“)`
  )
  const material = await p.getByLabel('Material (Lesetext, Hörtext-Skript …)').inputValue()
  pruefe(material.includes('Liebe Mutter') && material.includes('Quelle: Geschichte und Geschehen 2, Klett, S. 39, M2'), 'M2 als Material mit Quellenangabe')
  pruefe(!material.includes('Beschreibe M2'), 'Aufgabenblock des Buchs weggelassen')
  await p.screenshot({ path: join(out, '3-zwischenaufgabe.png'), fullPage: true })
  await lk.request.post(`${A}/server/reihen/${gesp.id}/loeschen`, { headers: KOPF })
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  writeFileSync(attrappePfad, attrappeAlt)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
