// Arbeitsblatt NUR per QR-Code freigeben, wenn die Schule IServ eingerichtet hat (03.11.2026, Befund der Lehrkraft:
// „QR-Code angeklickt, trotzdem: Lerngruppe wählen oder QR-Code zulassen"). Mit IServ entstand kein Code; jetzt schon –
// Lernende mit Konto treten bei, Gäste ohne Konto werden an IServ verwiesen. Die IServ-Anbindung wird nur für den Test
// eingetragen und danach wieder geleert.
// Aufruf: node tests/e2e/server-blatt-qr-iserv.mjs <Ausgabeordner> [adresse] [admin] [passwort]
// Aufruf: node tests/e2e/server-blatt-zoom-ipad.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-qr-iserv')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7z${Date.now() % 1000}`

const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).some((b) => b.type === 'task'))

const edge = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await edge.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

let iservGesetzt = false

try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Ida QR' } })).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Tom QR' } })).json()
  const tom = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === tom.benutzer) zuLoeschen.push(n.id)
  // Anmeldungen VOR dem Einrichten von IServ
  const lk = await edge.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const sm = await edge.newContext()
  await anmelden(sm, tom.benutzer, tom.passwort)
  await sm.request.post(`${A}/auth/passwort`, { form: { alt: tom.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
  await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'sheets:save', args: [{ id: 'blatt-qr', name: 'Blatt-QR', stats: { sheetCount: 1 }, payload: vorlage.payload }] } })
  // IServ-Anbindung (nur zum Test – danach wieder leer)
  await verwaltung.request.post(`${A}/server/verwaltung/iserv`, { headers: KOPF, data: { clientId: 'test-client', geheimnis: 'test-geheimnis' } })
  iservGesetzt = true
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  const leiste = p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await leiste.count()); i++) await leiste.first().click()
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-QR"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  const haken = dlg.locator('[data-blatt-gaeste]')
  pruefe(/IServ/.test(await dlg.innerText()), 'Mit IServ: Haken nennt die Anmeldung mit IServ')
  await haken.check()
  await dlg.locator('[data-blatt-freigeben]').click()
  let fr = null
  for (let i = 0; i < 40 && !fr; i++) {
    await p.waitForTimeout(500)
    fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? []).find((b) => b.titel) ?? null
  }
  pruefe(Boolean(fr), 'Nur per QR-Code freigegeben – ohne Lerngruppe, ohne Fehlermeldung')
  pruefe(!(await p.getByText('Bitte eine Lerngruppe').count()), 'Keine Meldung „Bitte eine Lerngruppe wählen …"')
  await p.screenshot({ path: join(out, '1-qr.png') })
  const code = fr?.code
  pruefe(Boolean(code), `QR-Code erzeugt (${code})`)
  // Tom (Konto) tritt über den Code bei; ein Gast ohne Konto wird an IServ verwiesen
  const bei = await sm.request.post(`${A}/s/api/blatt/gast`, { headers: KOPF, data: { code } })
  pruefe(bei.status() === 200, `Lernender mit Konto tritt per Code bei (${bei.status()})`)
  const sl = await (await sm.request.get(`${A}/s/api/blaetter`, { headers: KOPF })).json()
  pruefe((sl.blaetter ?? []).length === 1, 'Tom sieht das Blatt unter „Arbeitsblätter"')
  // Einstellungen der Freigabe nachträglich ändern (03.11.2026): Rückmeldungen je Aufgabe 2 → 4
  // Erst das QR-Code-Fenster nach der Freigabe schließen
  for (let i = 0; i < 3 && (await p.getByRole('dialog').count()); i++) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
  }
  await p.locator('[data-freigabe-oeffnen]').first().click()
  await p.locator('[data-freigabe-detail]').waitFor({ timeout: 15000 })
  await p.locator('[data-freigabe-detail] [data-freigabe-einstellungen]').first().click()
  await p.locator('[data-freigabe-einstellungen-fenster]').waitFor({ timeout: 10000 })
  const feld = p.locator('[data-einst-aufgabenrunden]')
  await feld.fill('4')
  await p.locator('[data-einst-runden]').fill('3')
  await p.screenshot({ path: join(out, '2-einstellungen.png') })
  await p.locator('[data-einst-speichern]').click()
  await p.locator('[data-freigabe-einstellungen-fenster]').waitFor({ state: 'detached', timeout: 10000 })
  const einst = (await (await lk.request.get(`${A}/server/blaetter/${fr.id}/einstellungen`, { headers: KOPF })).json()).einstellungen
  pruefe(einst?.aufgabenRunden === 4 && einst?.runden === 3, `Einstellungen geändert: Rückmeldungen je Aufgabe ${einst?.aufgabenRunden}, Einreichungen ${einst?.runden}`)
  const sb = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  pruefe(sb?.runden === 3 || sb?.einstellungen?.aufgabenRunden === 4 || JSON.stringify(sb).includes('"aufgabenRunden":4'), 'Lernende sehen die neuen Einstellungen')
  const gast = await edge.newContext()
  const g = await gast.request.post(`${A}/s/api/blatt/gast`, { headers: KOPF, data: { code, name: 'Anna K.' } })
  pruefe(g.status() === 403, `Gast ohne Konto: „Bitte mit IServ anmelden" (${g.status()})`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split(String.fromCharCode(10)).slice(0, 4).join(' | ')}`)
} finally {
  if (iservGesetzt) await verwaltung.request.post(`${A}/server/verwaltung/iserv`, { headers: KOPF, data: { clientId: '' } }).catch(() => null)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await edge.close()
}
if (problems.length) {
  console.log(`Probleme: ${problems.join(' | ')}`)
  process.exit(1)
}
console.log('Alles in Ordnung')
