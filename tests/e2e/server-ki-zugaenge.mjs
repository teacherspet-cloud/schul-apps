// Verwaltung › „Schule & Daten" › KI-Zugänge (10.10.2026) – NUR mit der KI-Attrappe, nie echte KI.
//  - Oben die KI-Nutzung der Lehrkräfte (nur Schlüssel der Schule), grafisch: Zeitraum Woche/Monat/Schuljahr,
//    Kennzahlen, Budget-Ring, Ring je Programm, Säulen der letzten 30 Tage, Verteilung je Lehrkraft ANONYM.
//  - Die Antwort des Servers enthält weder Namen noch Benutzernamen noch Kennungen der Lehrkräfte.
//  - Preise (Schätzung) und Monatsbudget lassen sich eintragen.
//  - Darunter EINE zugeklappte Karte „KI-Zugänge der Schule (n)" mit kompakten Zeilen (Statuspunkt, Schlüssel-Hinweis, ⋯).
//  - Telefonbreite im dunklen Design ohne waagerechtes Scrollen.
// Der Verbindungstest wird NIE gedrückt (er ginge an den echten Anbieter). Am Ende: Schlüssel, Preise, Budget wie vorher,
// Testkonten gelöscht.
// Aufruf: node tests/e2e/server-ki-zugaenge.mjs <Ausgabeordner> [adresse] [admin] [passwort]  (mit SCHULAPPS_KI_ATTRAPPE)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-ki-zugaenge')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 10000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
// Nie echte KI: ohne Attrappe und außerhalb von localhost keine KI-Anfragen
const mitKi = Boolean(process.env.SCHULAPPS_KI_ATTRAPPE) && /^http:\/\/localhost:/.test(A)

const browser = await chromium.launch({ channel: 'msedge' })
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const reiterAuf = async (ctx) => {
  const p = await ctx.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Schule & Daten"]').first().click()
  await p.getByRole('tab', { name: 'KI-Zugänge', exact: true }).click()
  await p.locator('[data-testid="ki-nutzung"]').waitFor({ timeout: 15000 })
  await p.waitForTimeout(600)
  return p
}

const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const zuLoeschen = []
let vorher = null
let mistralVorher = null
const NAMEN = ['Kira Kostentest', 'Olaf Obertest']
const konten = []
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const holeNutzung = async (zeitraum) => (await (await verwaltung.request.get(`${A}/server/verwaltung/ki-zugaenge?zeitraum=${zeitraum}`, { headers: KOPF })).json()).nutzung
  vorher = await holeNutzung('monat')
  mistralVorher = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).schluessel.find((s) => s.name === 'mistral')

  // ---------- Nutzung erzeugen (Attrappe): Schlüssel der Schule für Mistral, zwei Lehrkräfte
  if (mitKi) {
    if (!mistralVorher?.hinterlegt) await verwaltung.request.post(`${A}/server/verwaltung/schluessel`, { headers: KOPF, data: { name: 'mistral', wert: 'attrappe-e2e-schluessel' } })
    await verwaltung.request.post(`${A}/server/verwaltung/schluessel`, { headers: KOPF, data: { name: 'mistral', fuerAlle: true } })
    for (const name of NAMEN) {
      const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
      zuLoeschen.push(k.id)
      const ctx = await browser.newContext()
      await anmelden(ctx, k.benutzer, k.passwort)
      konten.push({ ...k, ctx, name })
    }
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
    const anfrage = (k, schemaName) =>
      k.ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'ai:structured', args: [{ system: 'Test', user: 'Test', schemaName, schema, provider: 'mistral' }] } })
    for (const s of ['grammatik_pool', 'elternbrief_probe', 'ich_kann']) await anfrage(konten[0], s)
    await anfrage(konten[1], 'grammatik_pool')

    const w = await holeNutzung('woche')
    const neu = w.lehrkraefte
    pruefe(neu.length >= 2 && neu.every((z, i) => z.bezeichnung === `Lehrkraft ${String.fromCharCode(65 + i)}`), `Je Lehrkraft nur „Lehrkraft A, B …" (${neu.map((z) => z.bezeichnung).join(', ')})`)
    pruefe(neu.some((z) => z.anfragen === 3) && neu.some((z) => z.anfragen === 1), `Anfragen je Lehrkraft gezählt (${neu.map((z) => z.anfragen).join(', ')})`)
    pruefe(neu.every((z) => Object.keys(z).sort().join() === 'anfragen,anteil,bezeichnung,euro,tokens'), 'Einträge je Lehrkraft ohne weitere Felder')
    const roh = JSON.stringify(await (await verwaltung.request.get(`${A}/server/verwaltung/ki-zugaenge?zeitraum=schuljahr`, { headers: KOPF })).text())
    const verboten = [...NAMEN, ...NAMEN.map((n) => n.split(' ')[1]), ...konten.flatMap((k) => [k.id, k.benutzer])]
    pruefe(
      verboten.every((v) => !roh.includes(v)),
      'Antwort des Servers enthält keine Namen, Benutzernamen oder Kennungen'
    )
    const w2 = await holeNutzung('woche')
    pruefe(JSON.stringify(w2.lehrkraefte) === JSON.stringify(w.lehrkraefte), 'Buchstaben im selben Zeitraum stabil')
    pruefe(w.jeArt.grammatik?.a >= 2 && w.jeArt.elternbrief?.a >= 1, 'Anteil je Programm: Grammatik und Elternbrief gezählt')
  } else console.log('  –   Ohne KI-Attrappe: keine Anfragen erzeugt (nur Oberfläche geprüft)')

  // ---------- Oberfläche: Nutzung oben, Zugänge darunter zugeklappt
  const v = await reiterAuf(verwaltung)
  const yNutzung = (await v.locator('[data-testid="ki-nutzung"]').boundingBox())?.y ?? 9999
  const karte = v.locator('[data-klappkarte="verwaltung-ki-zugaenge"]')
  const yKarte = (await karte.boundingBox())?.y ?? 0
  pruefe(yNutzung < yKarte, 'KI-Nutzung steht über den Zugängen')
  pruefe((await karte.getAttribute('data-offen')) === 'false', 'Karte „KI-Zugänge der Schule" ist zu Beginn zu')
  pruefe(/KI-Zugänge der Schule \(\d+\)/.test(await karte.innerText()), `Kopf mit Anzahl: „${(await karte.innerText()).split('\n')[0]}"`)
  pruefe((await v.locator('[data-ki-kennzahlen] > *').count()) === 4, 'Vier Kennzahlen (Anfragen, Token, Kosten, aktive Lehrkräfte)')
  for (const sel of ['[data-ki-budget]', '[data-ki-ring]', '[data-ki-saeulen]', '[data-ki-monate]', '[data-klappkarte="verwaltung-ki-preise"]'])
    pruefe(await v.locator(sel).first().isVisible(), `Sichtbar: ${sel}`)
  if (mitKi) {
    pruefe(await da(v.locator('[data-ki-lehrkraft="Lehrkraft A"]')), 'Balken „Lehrkraft A" sichtbar')
    const text = await v.locator('[data-testid="ki-nutzung"]').innerText()
    pruefe(NAMEN.every((n) => !text.includes(n) && !text.includes(n.split(' ')[1])), 'Keine Namen in der Übersicht')
    pruefe((await v.locator('[data-ki-saeulen] svg').count()) > 0, 'Säulen je Tag gezeichnet')
    pruefe((await v.locator('[data-ki-ring] [role="img"]').count()) > 0, 'Ring je Programm gezeichnet')
  }
  await v.screenshot({ path: join(out, '1-nutzung.png'), fullPage: true })

  // Zeitraum umschalten
  const antwort = v.waitForResponse((r) => r.url().includes('/server/verwaltung/ki-zugaenge?zeitraum=schuljahr'))
  await v.locator('[data-ki-zeitraum]').getByText('Schuljahr', { exact: true }).click()
  await antwort
  await v.waitForTimeout(400)
  pruefe((await v.locator('[data-ki-zeitraum]').getAttribute('data-ki-zeitraum')) === 'schuljahr', 'Zeitraum „Schuljahr" gewählt')
  pruefe(/dieses Schuljahr/.test(await v.locator('[data-testid="ki-nutzung"]').innerText()), 'Hinweis nennt den Zeitraum')
  await v.locator('[data-ki-saeulen]').getByText('nach Programm', { exact: true }).click()
  await v.waitForTimeout(300)

  // ---------- Preise und Budget
  await v.locator('[data-klappkopf="verwaltung-ki-preise"]').click()
  const zeile = v.locator('[data-ki-preis="mistral"]')
  if (await da(zeile, 4000)) {
    await zeile.locator('input').nth(0).fill('2')
    await zeile.locator('input').nth(1).fill('6,5')
    await v.locator('[data-ki-preise-speichern]').click()
    await v.waitForTimeout(1200)
    const n1 = await holeNutzung('monat')
    pruefe(n1.preise.mistral?.ein === 2 && n1.preise.mistral?.aus === 6.5 && n1.hatPreise, `Preise gespeichert (${JSON.stringify(n1.preise.mistral)})`)
    pruefe(/€/.test(await v.locator('[data-ki-kennzahlen]').innerText()), 'Kennzahl „Kosten (Schätzung)" in Euro')
  } else pruefe(!mitKi, 'Preiszeile für Mistral vorhanden')
  await v.locator('[data-ki-budget]').getByRole('button', { name: /Festlegen|Ändern/ }).click()
  await v.locator('[data-ki-budget] input[data-ki-budget-wert], [data-ki-budget] [data-ki-budget-wert] input').first().fill('1000000')
  await v.locator('[data-ki-budget]').getByRole('button', { name: 'Speichern' }).click()
  await v.waitForTimeout(1200)
  const n2 = await holeNutzung('monat')
  pruefe(n2.budget?.art === 'token' && n2.budget?.wert === 1000000, `Monatsbudget gespeichert (${JSON.stringify(n2.budget)})`)
  pruefe((await v.locator('[data-ki-budget]').getAttribute('data-ki-budget')) === 'ok', 'Budget-Ring: unter 80 %')
  await v.screenshot({ path: join(out, '2-preise-budget.png'), fullPage: true })

  // ---------- Kompakte Zugänge in der großen Karte
  await v.locator('[data-klappkopf="verwaltung-ki-zugaenge"]').click()
  await v.waitForTimeout(300)
  const zeilen = v.locator('[data-ki-zugang]')
  const anzahl = await zeilen.count()
  pruefe(anzahl >= 5, `Zugänge als Zeilen (${anzahl})`)
  const hoehe = (await zeilen.first().boundingBox())?.height ?? 999
  pruefe(hoehe < 60, `Eine Zeile je Zugang (Höhe ${Math.round(hoehe)} px)`)
  if (mitKi) {
    const m = v.locator('[data-ki-zugang="mistral"]')
    pruefe((await m.getAttribute('data-status')) === 'aktiv', 'Mistral: Statuspunkt „aktiv"')
    await v.locator('[data-ki-menue="mistral"]').click()
    pruefe(await da(v.getByRole('menuitem', { name: 'Bearbeiten' }), 3000), 'Menü ⋯: Bearbeiten')
    pruefe(await v.getByRole('menuitem', { name: 'Verbindung testen' }).isVisible(), 'Menü ⋯: Verbindung testen (nicht gedrückt)')
    pruefe(await v.getByRole('menuitem', { name: 'Entfernen' }).isVisible(), 'Menü ⋯: Entfernen')
    await v.getByRole('menuitem', { name: 'Bearbeiten' }).click()
    await v.waitForTimeout(400)
    pruefe((await m.getAttribute('data-offen')) === 'true' && (await m.getByText('Für alle Lehrkräfte freigeben').isVisible()), 'Bearbeiten klappt die Zeile auf')
  }
  await v.screenshot({ path: join(out, '3-zugaenge.png'), fullPage: true })

  // ---------- Telefon, dunkles Design
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', storageState: await verwaltung.storageState() })
  const t = await reiterAuf(tel)
  const breite = await t.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  pruefe(breite[0] <= breite[1] + 1, `Telefon: kein waagerechtes Scrollen (${breite[0]} ≤ ${breite[1]})`)
  await t.screenshot({ path: join(out, '4-telefon-dunkel.png'), fullPage: true })
  await tel.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Wie vorher: Preise, Budget, Mistral-Schlüssel; Testkonten weg
  if (vorher) {
    await verwaltung.request.post(`${A}/server/verwaltung/ki-preise`, { headers: KOPF, data: { preise: vorher.preise ?? {} } }).catch(() => undefined)
    await verwaltung.request.post(`${A}/server/verwaltung/ki-budget`, { headers: KOPF, data: { budget: vorher.budget ?? null } }).catch(() => undefined)
  }
  if (mitKi && mistralVorher) {
    const zurueck = { name: 'mistral', fuerAlle: Boolean(mistralVorher.fuerAlle), ...(mistralVorher.hinterlegt ? {} : { wert: '' }) }
    await verwaltung.request.post(`${A}/server/verwaltung/schluessel`, { headers: KOPF, data: zurueck }).catch(() => undefined)
  }
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  if (vorher) {
    const nachher = await (await verwaltung.request.get(`${A}/server/verwaltung/ki-zugaenge`, { headers: KOPF })).json()
    pruefe(JSON.stringify(nachher.nutzung.preise) === JSON.stringify(vorher.preise) && JSON.stringify(nachher.nutzung.budget) === JSON.stringify(vorher.budget), 'Preise und Budget wie vorher')
  }
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nVerwaltung › KI-Zugänge: Alles in Ordnung.')
