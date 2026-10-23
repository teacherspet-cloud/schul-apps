// App-Freigaben (23.10.2026, abgestimmt; shared/appFreigaben.ts, server/appFreigaben.ts):
//  1. Nur Admins lesen und ändern die Gruppen (Lehrkraft: 403).
//  2. Ohne Freigabe: die App fehlt in /server/ich.js, Änderungen an ihrer Ablage sind gesperrt (403), Lesen bleibt.
//  3. Eine eigene Gruppe gibt die App einzelnen Lehrkräften wieder frei.
//  4. Oberfläche: kein „Tafelbild" für die gesperrte Lehrkraft, ein Link darauf zeigt den Hinweis; der Admin sieht den
//     Reiter „App-Freigaben" mit der Grundgruppe.
// Ohne KI. Aufruf: node tests/e2e/server-app-freigaben.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-app-freigaben')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 900 } })
let vorher = null
const seiteAuf = async (ctx, pfad = '/') => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}${pfad}`)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  return p
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  vorher = (await (await verwaltung.request.get(`${A}/server/app-freigaben`, { headers: KOPF })).json()).gruppen
  pruefe(Array.isArray(vorher) && vorher[0]?.id === 'alle', 'Admin liest die Gruppen, „Alle Lehrkräfte“ steht vorn')

  const konto = async (name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })
      const text = await r.text()
      return { status: r.status(), ...(text.trim() ? JSON.parse(text) : {}) }
    }
    const ich = async () => {
      const t = await (await ctx.request.get(`${A}/server/ich.js`)).text()
      return JSON.parse(t.slice(t.indexOf('=') + 1, t.indexOf(';(function')).replace(/;$/, ''))
    }
    return { ...k, ctx, api, ich, name }
  }
  const lea = await konto('Lea Gesperrt')
  const ben = await konto('Ben Erprobung')

  // ---------- 1. Rechte
  const versuch = await lea.ctx.request.post(`${A}/server/app-freigaben`, { headers: KOPF, data: { gruppen: [] } })
  pruefe(versuch.status() === 403, `Lehrkraft darf die Freigaben nicht ändern (${versuch.status()})`)
  pruefe((await lea.ich()).apps?.includes('tafelbild'), 'Vorher: Tafelbild für alle freigegeben')

  // ---------- 2. Tafelbild nur noch für die Gruppe „Erprobung“
  const alle = vorher[0].apps.filter((a) => a !== 'tafelbild')
  const r = await (
    await verwaltung.request.post(`${A}/server/app-freigaben`, {
      headers: KOPF,
      data: { gruppen: [{ ...vorher[0], apps: alle }, { id: 'erprobung', name: 'Erprobung', apps: ['tafelbild'], mitglieder: [ben.id] }] }
    })
  ).json()
  pruefe(r.gruppen?.length === 2 && r.gruppen[1].mitglieder[0] === ben.id, 'Admin speichert die Gruppe „Erprobung“ mit Ben')
  const ichLea = await lea.ich()
  pruefe(!ichLea.apps.includes('tafelbild') && ichLea.apps.includes('arbeitsblatt'), 'Lea: Tafelbild fehlt in ihren Apps, Arbeitsblatt bleibt')
  pruefe((await ben.ich()).apps.includes('tafelbild'), 'Ben (Erprobung): Tafelbild freigegeben')
  const speichern = await lea.api('tafelbilder:save', { id: 'tb-probe', name: 'Probe', stats: {}, payload: {} })
  pruefe(speichern.status === 403, `Lea: Speichern im Tafelbild gesperrt (${speichern.status})`)
  const lesen = await lea.api('tafelbilder:list')
  pruefe(lesen.status === 200 && lesen.ok === true, 'Lea: eigene Tafelbilder lesen bleibt')
  pruefe((await lea.api('sheets:list')).ok === true, 'Lea: andere Apps unberührt')
  const benSpeichern = await ben.api('tafelbilder:delete', 'gibt-es-nicht')
  pruefe(benSpeichern.status === 200, `Ben: Änderungen im Tafelbild erlaubt (${benSpeichern.status})`)

  // ---------- 3. Oberfläche der Lehrkraft
  // Die Leiste zeigt ihre Gruppen zugeklappt – alle aufklappen, sonst wäre „fehlt“ zu leicht bestanden
  const aufklappen = async (seite) => {
    for (let i = 0; i < 6; i++) {
      const zu = seite.locator('.app-leiste [aria-expanded="false"]')
      if (!(await zu.count())) break
      await zu.first().click()
      await seite.waitForTimeout(300)
    }
  }
  const tafel = (seite) => seite.locator('.app-leiste [aria-label^="Tafelbild"]').count()
  const p = await seiteAuf(lea.ctx)
  await aufklappen(p)
  pruefe((await tafel(p)) === 0 && (await p.locator('.app-leiste [aria-label^="Arbeitsbl"]').count()) > 0, 'Lea: Tafelbild fehlt in der Leiste, Arbeitsblatt steht da')
  await p.screenshot({ path: join(out, 'lea-start.png') })
  const pb = await seiteAuf(ben.ctx)
  await aufklappen(pb)
  pruefe((await tafel(pb)) > 0, 'Gegenprobe: Ben sieht Tafelbild in der Leiste')
  const link = await seiteAuf(lea.ctx, '/?einzeln=tafelbild')
  pruefe(
    await link
      .locator('[data-gesperrte-app="tafelbild"]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Lea: ein Link aufs Tafelbild zeigt „nicht freigegeben“'
  )
  await link.screenshot({ path: join(out, 'lea-link.png') })

  // ---------- 4. Oberfläche des Admins
  const v = await seiteAuf(verwaltung, '/?einzeln=verwaltung')
  await v.getByRole('tab', { name: 'App-Freigaben' }).click()
  const karte = v.locator('[data-app-gruppe="alle"]')
  pruefe(await karte.waitFor({ timeout: 10000 }).then(() => true, () => false), 'Admin: Reiter „App-Freigaben“ mit der Grundgruppe')
  const haken = (id) => karte.locator(`[data-app-freigabe="${id}"]`).first().evaluate((el) => (el.matches('input') ? el : el.querySelector('input')).checked)
  pruefe(!(await haken('tafelbild')) && (await haken('arbeitsblatt')), '… dort ist Tafelbild abgewählt, Arbeitsblatt angehakt')
  pruefe((await v.locator('[data-app-gruppe="erprobung"]').count()) === 1, '… und die Gruppe „Erprobung“ steht darunter')
  const reiter = await v.getByRole('tab').allTextContents()
  pruefe(reiter.indexOf('App-Freigaben') === reiter.indexOf('Nutzer') + 1, `… rechts neben „Nutzer“ (${reiter.join(' | ')})`)
  await v.screenshot({ path: join(out, 'admin-freigaben.png'), fullPage: true })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Freigaben gelten schulweit – zurück auf den Stand davor
  if (vorher) await verwaltung.request.post(`${A}/server/app-freigaben`, { headers: KOPF, data: { gruppen: vorher } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Freigaben zurückgesetzt, Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
