// Per QR-Code beigetretene Gäste aus freigegebenem Material entfernen (05.10.2026). Ohne KI.
// Vorher: Server lokal (IServ NICHT eingerichtet).
// Aufruf: node tests/e2e/server-gast-entfernen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-gast-entfernen')
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
  meta: { title: 'Gastprobe', subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 7, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'Gastprobe', aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}

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

  // ---------- Arbeitsblatt mit Gästen
  const fr = await (
    await lk.request.post(`${A}/server/blaetter/freigeben`, {
      headers: KOPF,
      data: {
        titel: 'Gastprobe',
        html: '<!doctype html><html><body><div class="ws-page"><p>Aufgabe 1</p></div></body></html>',
        aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
        rueckmeldung: VORLAGE,
        lerngruppeId: '',
        schueler: [],
        gaeste: true,
        einstellungen: { feedback: false }
      }
    })
  ).json()
  pruefe(Boolean(fr.id && fr.code), `Blatt mit QR-Code freigegeben (${fr.code})`)
  const gast = await browser.newContext()
  const beitritt = await gast.request.post(`${A}/s/api/blatt/gast`, { headers: KOPF, data: { code: fr.code, name: 'Lina S.' } })
  pruefe(beitritt.ok(), 'Gast „Lina S." tritt per Code bei')
  const vorher = await gast.request.get(`${A}/s/api/blaetter`, { headers: KOPF })
  pruefe(vorher.ok() && JSON.stringify(await vorher.json()).includes(fr.id), 'Der Gast sieht das Blatt')

  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-freigabe-oeffnen]').first().click()
  pruefe(await da(p.locator('[data-gast-entfernen="Lina S."]')), 'Beigetretener Gast steht in der Liste (auch ohne Einträge) mit „Entfernen"')
  await p.screenshot({ path: join(out, '1-liste.png') })
  await p.locator('[data-gast-entfernen="Lina S."]').click()
  await p.locator('[data-gast-entfernen-bestaetigen]').click()
  await p.waitForTimeout(1200)
  pruefe((await p.locator('[data-gast-entfernen="Lina S."]').count()) === 0, 'Nach dem Entfernen ist der Gast aus der Liste verschwunden')
  await p.screenshot({ path: join(out, '2-entfernt.png') })
  const nachher = await gast.request.get(`${A}/s/api/blaetter`, { headers: KOPF })
  pruefe(nachher.status() === 401, `Der Gast ist sofort abgemeldet (Konto gelöscht, Status ${nachher.status()})`)
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  pruefe(!(u.nutzer ?? []).some((n) => n.quelle === 'gast' && n.name === 'Lina S.'), 'Das Gastkonto gibt es nicht mehr')
  await lk.request.post(`${A}/server/blaetter/${fr.id}/loeschen`, { headers: KOPF, data: {} })

  // ---------- Vokabeltraining mit Gästen
  const vk = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { titel: 'Gastwörter', sprache: 'en', fach: 'Englisch', gaeste: true, woerter: [{ id: 'w1', term: 'park', translation: 'Park' }] }
    })
  ).json()
  const vd0 = await (await lk.request.get(`${A}/server/vokabeln/${vk.id}`, { headers: KOPF })).json()
  const code = vd0.code
  pruefe(Boolean(vk.id && code), `Vokabeln mit QR-Code freigegeben (${code})`)
  const vgast = await browser.newContext()
  pruefe(
    (await vgast.request.post(`${A}/s/api/vokabeln/gast`, { headers: KOPF, data: { code, name: 'Tom R.' } })).ok(),
    'Gast „Tom R." tritt dem Vokabeltraining bei'
  )
  const vd = await (await lk.request.get(`${A}/server/vokabeln/${vk.id}`, { headers: KOPF })).json()
  const tom = (vd.lernende ?? []).find((l) => l.name === 'Tom R.')
  pruefe(Boolean(tom?.perCode), 'Im Lernstand als „per Code" gekennzeichnet')
  const weg = await lk.request.post(`${A}/server/vokabeln/${vk.id}/gast-entfernen`, { headers: KOPF, data: { id: tom?.id } })
  pruefe(weg.ok(), 'Entfernen im Vokabeltraining gelingt')
  const vd2 = await (await lk.request.get(`${A}/server/vokabeln/${vk.id}`, { headers: KOPF })).json()
  pruefe(!(vd2.lernende ?? []).some((l) => l.name === 'Tom R.'), 'Tom ist nicht mehr unter den Lernenden')
  // Fremde Personen lassen sich so nicht entfernen
  const fremd = await lk.request.post(`${A}/server/vokabeln/${vk.id}/gast-entfernen`, { headers: KOPF, data: { id: lehrer.id } })
  pruefe(fremd.status() === 404, 'Wer nicht per Code beigetreten ist, lässt sich so nicht entfernen')
  await lk.request.post(`${A}/server/vokabeln/${vk.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({}))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast' && ['Lina S.', 'Tom R.'].includes(n.name)) zuLoeschen.push(n.id)
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
