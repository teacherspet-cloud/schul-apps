// Runde 03.10.2026 abends: App „Vokabeltraining" (Lernzeitraum, QR-Code für Gäste mit persönlichem
// Wiedereinstiegs-Code), „Freigegebene Blätter" nach Lerngruppe + Liste leeren, Verwaltung für Lehrkräfte,
// QR-Beitritt mit angemeldeter Lehrkraft am Handy.
// Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet. Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-vokabeltraining.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-vokabeltraining')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7v${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter' },
  { id: 'w2', term: 'sunny', translation: 'sonnig' },
  { id: 'w3', term: 'cloud', translation: 'Wolke' }
]
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const BLATT = '<html><head></head><body><div class="ws-page"><div class="ws-content"><div class="ws-body"><p>Probe</p></div></div></div></body></html>'

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
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()

  // ---------- Vokabeltraining nur per QR-Code, mit Lernzeitraum
  const bis = Date.now() + 30 * 864e5
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: '', schueler: [], gaeste: true, bis, titel: 'Weather words', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  pruefe(Boolean(vok.id), 'Vokabeltraining nur per QR-Code freigegeben')
  const kurz = (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.find((z) => z.id === vok.id)
  pruefe(Boolean(kurz?.code && kurz.link?.includes('/s/vt/')) && kurz.bis === bis, `Code, Link und Zeitraum (${kurz?.code})`)

  // Lehrkraft: eigene App in der Leiste, kein Reiter mehr im Onlinetest
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Onlinetest"]').click()
  await p.waitForTimeout(600)
  pruefe((await p.getByRole('tab', { name: 'Vokabeltraining' }).count()) === 0, 'Onlinetest ohne Reiter „Vokabeltraining"')
  await p.locator('.app-leiste [aria-label="Vokabeltraining"]').click()
  pruefe(await da(p.locator('[data-vokabel-zuweisung]', { hasText: 'Weather words' })), 'App „Vokabeltraining" mit der Freigabe')
  await p.screenshot({ path: join(out, '1-app.png') })

  // ---------- Gast am Handy: Name → persönlicher Code → Trainer
  const g1 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h = await g1.newPage()
  await h.goto(`${A}/s/vt/${kurz.code}`)
  await h.locator('[data-gastname]').fill('Ben T.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  pruefe(await da(h.locator('[data-wieder-code]')), 'Gast bekommt einen persönlichen Code')
  const wieder = (await h.locator('[data-wieder-code]').innerText()).trim()
  await h.screenshot({ path: join(out, '2-code.png') })
  await h.locator('[data-vokabeln-los]').click()
  pruefe(await da(h.locator('[data-vokabel-kasten]')), 'Gast lernt im Karteikasten')
  const cookie = (await g1.cookies()).find((c) => c.name === 'sa_sitzung')
  pruefe(Boolean(cookie && cookie.expires * 1000 > Date.now() + 20 * 864e5), 'Gast bleibt über Wochen angemeldet (bis zum Ende des Zeitraums)')

  // Anderes Gerät: falscher, dann richtiger Code
  const g2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h2 = await g2.newPage()
  await h2.goto(`${A}/s/vt/${kurz.code}`)
  await h2.locator('[data-schon-dabei]').click()
  await h2.locator('[data-gastname]').fill('Ben T.')
  await h2.locator('[data-wieder-eingabe]').fill('AAAAAA')
  await h2.getByRole('button', { name: 'Weiterlernen' }).click()
  pruefe(await da(h2.getByText('passen nicht zusammen')), 'Falscher persönlicher Code wird abgelehnt')
  await h2.locator('[data-wieder-eingabe]').fill(wieder)
  await h2.getByRole('button', { name: 'Weiterlernen' }).click()
  pruefe(await da(h2.locator('[data-vokabel-kasten]')), 'Mit Name + persönlichem Code auf dem zweiten Gerät weiter')

  // Lehrkraft sieht den Gast im Lernstand, QR-Knopf
  await p.locator('[data-vokabel-zuweisung]', { hasText: 'Weather words' }).click()
  pruefe(await da(p.locator('[data-lernstand]').getByText('Ben T.')), 'Gast im Lernstand der Lehrkraft')
  await p.locator('[data-vokabel-qr-zeigen]').click()
  pruefe(await da(p.getByRole('dialog').getByText(`/s/vt/${kurz.code}`)), 'QR-Code mit Code im Lernstand')
  await p.screenshot({ path: join(out, '3-lernstand-qr.png') })
  await p.keyboard.press('Escape')

  // Zeitraum abgelaufen → abgeschlossen, Gast kommt nicht mehr hinein
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/zeitraum`, { headers: KOPF, data: { bis: Date.now() - 1000 } })
  const zu = await g2.request.get(`${A}/s/api/vokabeln/zugang?code=${kurz.code}`)
  pruefe(zu.status() === 404, 'Nach Ablauf des Zeitraums kein Zugang mehr')
  // Löschen nimmt die Gastkonten mit
  const vorher = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer.length
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/loeschen`, { headers: KOPF, data: {} })
  const nachher = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer.length
  pruefe(nachher === vorher - 1, `Löschen entfernt das Gastkonto (${vorher} → ${nachher})`)

  // ---------- Freigegebene Blätter: nach Lerngruppe, Liste leeren
  const frei = async (lerngruppeId, titel) =>
    (
      await lk.request.post(`${A}/server/blaetter/freigeben`, {
        headers: KOPF,
        data: { lerngruppeId, gaeste: !lerngruppeId, html: BLATT, aufgaben: [], rueckmeldung: { grundlage: { art: 'text', text: 'x' }, meta: {} }, titel }
      })
    ).json()
  const b1 = await frei(gruppe.id, 'Blatt A')
  const b2 = await frei('', 'Blatt B')
  pruefe(Boolean(b1.id && b2.id), `Zwei Blätter freigegeben (${b1.fehler ?? ''}${b2.fehler ?? ''})`)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  pruefe(await da(p.locator(`[data-freigabe-gruppe="${KLASSE}"]`)), 'Gruppiert nach Lerngruppe')
  pruefe(await da(p.locator('[data-freigabe-gruppe="gaeste"]')), 'Eigene Gruppe „Gäste per QR-Code"')
  await p.screenshot({ path: join(out, '4-freigaben.png') })
  // Teacher am Handy: QR-Link des Blatts zeigt das Namensfeld
  const lkHandy = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await lk.storageState() })
  const ph = await lkHandy.newPage()
  const liste = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  const mitCode = liste.find((x) => x.id === b2.id)
  await ph.goto(`${A}/s/w/${mitCode.code}`)
  pruefe(await da(ph.locator('[data-gastname]')), 'Lehrkraft am Handy: QR-Link zeigt das Namensfeld')
  pruefe(await ph.locator('[data-lehrkraft-hinweis]').isVisible(), 'Hinweis für die angemeldete Lehrkraft')
  await ph.screenshot({ path: join(out, '5-handy-lehrkraft.png') })
  // Beide beenden, Liste der abgeschlossenen leeren
  for (const b of [b1, b2]) await lk.request.post(`${A}/server/blaetter/${b.id}/status`, { headers: KOPF, data: { status: 'beendet' } })
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.getByText('Abgeschlossen', { exact: true }).click()
  await p.locator('[data-abgeschlossene-leeren]').click()
  await p.locator('[data-leeren-bestaetigen]').click()
  await p.waitForTimeout(1200)
  const rest = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  pruefe(rest.length === 0, `Liste geleert (${rest.length} übrig)`)

  // ---------- Verwaltung für Lehrkräfte: Daten und Material
  await p.locator('.app-leiste .leiste-gruppe-apps [aria-label="Verwaltung"]').click()
  pruefe(await da(p.locator('[data-datenverwaltung]')), 'Verwaltung (Daten und Material) für Lehrkräfte')
  await p.screenshot({ path: join(out, '6-verwaltung.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
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
