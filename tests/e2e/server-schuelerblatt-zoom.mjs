// Zoom im Schülerblatt (03.11.2026, Befund der Lehrkraft: zoomt nicht, Markierungen verschoben, Zoom-Knöpfe über
// „Einreichen"): Lernende öffnen ein freigegebenes Blatt am iPad (WebKit, Touch), in Firefox und Edge, ziehen einen
// Marker-Strich, vergrößern; geprüft wird, dass Blatt, Stift-Ebene und Felder gemeinsam wachsen, die Knöpfe in der
// Werkzeugleiste stehen und „Einreichen" frei bleibt.
// „Blatt ansehen“ am iPad (28.10.2026, Befund der Lehrkraft: Zoom am Tablet verschiebt Aufgaben und Schülereingaben – die
// Eingaben liegen in gleicher Größe neben ihren Linien; dazu lädt die Ansicht lange). Nachgestellt mit WebKit (Safari-Engine)
// und Touch: Lernende füllen das Blatt, die Lehrkraft öffnet „Blatt ansehen“, vergrößert mit den Zoom-Knöpfen. Geprüft wird,
// dass jedes Eingabefeld beim Zoomen an derselben Stelle des Blatts bleibt (Abstand zum Blattrand wächst genau mit dem Zoom)
// und dass die Linien im Blatt mitwachsen.
// Vorher: Server lokal. Vorlage: jüngstes Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt-zoom-ipad.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium, webkit, firefox } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-zoom-ipad')
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
const safari = await webkit.launch()
const fuchs = await firefox.launch()
const zuLoeschen = []
const verwaltung = await edge.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

/** Lage der Eingabefelder relativ zur linken oberen Ecke des Blatt-Rahmens (iframe) */
const lagen = (p) =>
  p.evaluate(() => {
    const f = document.querySelector('iframe')
    if (!f) return null
    const r = f.getBoundingClientRect()
    const felder = [...document.querySelectorAll('[data-feld]')].slice(0, 12).map((e) => {
      const b = e.getBoundingClientRect()
      return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height }
    })
    // Linien/Aufgaben im Blatt: Lage in Bildschirm-Pixeln (Rahmen-Koordinaten × Darstellung)
    let innen = []
    try {
      const doc = f.contentDocument
      const wurzelZoom = Number(doc.documentElement.style.zoom || 1)
      innen = [...doc.querySelectorAll('.ws-task-num')].slice(0, 6).map((e) => {
        const b = e.getBoundingClientRect()
        return { x: b.left, y: b.top, wurzelZoom }
      })
    } catch {
      innen = []
    }
    return { rahmen: { w: r.width, h: r.height }, felder, innen }
  })

try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Ida Zoom' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Tom Zoom' } })
  ).json()
  const tom = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === tom.benutzer) zuLoeschen.push(n.id)

  // ---------- Freigabe (am PC)
  const lk = await edge.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-zoom', name: 'Blatt-Zoom', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  const leiste = p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await leiste.count()); i++) await leiste.first().click()
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.locator('[data-blatt-waehlen-knopf]').click()
  await p.locator('[data-blatt-wahl="Blatt-Zoom"]').click()
  const dlg = p.getByRole('dialog', { name: 'Arbeitsblatt für Lernende freigeben' })
  await dlg.getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await dlg.locator('[data-blatt-freigeben]').click()
  let fr = null
  for (let i = 0; i < 40 && !fr; i++) {
    await p.waitForTimeout(500)
    fr = ((await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter ?? [])[0] ?? null
  }
  pruefe(Boolean(fr), 'Freigabe angelegt')


  // ---------- Tom öffnet das Blatt: Gerät für Gerät
  async function sm_schliessen() {}
  const geraete = [
    ['ipad-webkit', safari, { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['pc-firefox', fuchs, { viewport: { width: 1300, height: 900 } }],
    ['pc-edge', edge, { viewport: { width: 1300, height: 900 } }]
  ]
  let erstes = true
  for (const [name, browser, opts] of geraete) {
    const ctx = await browser.newContext(opts)
    await ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: tom.benutzer, passwort: erstes ? tom.passwort : 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
    if (erstes) {
      await ctx.request.post(`${A}/auth/passwort`, { form: { alt: tom.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' }, headers: { origin: A }, maxRedirects: 0 })
      erstes = false
    }
    const s = await ctx.newPage()
    s.on('pageerror', (e) => console.log(`     [${name}] seitenfehler ${e.message.slice(0, 200)}`))
    await s.goto(`${A}/s/`)
    await s.locator('[data-kachel="blaetter"]').click()
    await s.locator('[data-blatt-oeffnen]').first().click()
    await s.locator('[data-feld]').first().waitFor({ timeout: 30000 })
    await s.waitForTimeout(1500)
    await s.screenshot({ path: join(out, `${name}-1.png`) })
    const knoepfe = await s.locator('[data-zoom-knoepfe]').count()
    console.log(`     [${name}] Zoom-Knöpfe: ${knoepfe}`)
    const mess = () =>
      s.evaluate(() => {
        const f = document.querySelector('iframe')
        const r = f.getBoundingClientRect()
        const c = document.querySelector('canvas')
        const cr = c ? c.getBoundingClientRect() : null
        let num = null
        try {
          const e = f.contentDocument.querySelector('.ws-task-num')
          const b = e.getBoundingClientRect()
          num = { x: b.left, y: b.top }
        } catch {}
        const feld = document.querySelector('[data-feld]').getBoundingClientRect()
        return { rahmen: { x: r.left, y: r.top, w: r.width }, canvas: cr && { x: cr.left, y: cr.top, w: cr.width }, num, feld: { x: feld.left, y: feld.top, w: feld.width } }
      })
    const m0 = await mess()
    // Marker-Strich über der ersten Aufgabennummer (Bildschirm) zeichnen
    const marker = s.locator('[data-werkzeug="marker"]').first()
    if (await marker.count()) {
      await marker.click()
      const c = await s.locator('canvas').first().boundingBox()
      if (c) {
        const x0 = c.x + 120, y0 = c.y + 300
        await s.mouse.move(x0, y0)
        await s.mouse.down()
        await s.mouse.move(x0 + 150, y0, { steps: 8 })
        await s.mouse.up()
      }
      await s.waitForTimeout(500)
    }
    if (knoepfe) {
      for (let i = 0; i < 3; i++) {
        await s.getByRole('button', { name: 'Vergrößern' }).click()
        await s.waitForTimeout(350)
      }
    } else {
      await s.keyboard.down('Control')
      await s.keyboard.press('Equal')
      await s.keyboard.up('Control')
    }
    await s.waitForTimeout(1200)
    const m1 = await mess()
    await s.screenshot({ path: join(out, `${name}-2-gezoomt.png`) })
    console.log(`     [${name}] vorher ${JSON.stringify(m0)}
     [${name}] nachher ${JSON.stringify(m1)}`)
    pruefe(m1.rahmen.w > m0.rahmen.w * 1.2, `[${name}] Blatt wächst beim Vergrößern (${m0.rahmen.w.toFixed(0)} → ${m1.rahmen.w.toFixed(0)})`)
    // Stift-Ebene und Blatt wachsen gemeinsam: Lage der Leinwand und der Aufgabennummer relativ zum Rahmen × Faktor
    const f = m1.rahmen.w / m0.rahmen.w
    if (m0.canvas && m1.canvas) {
      const dx = Math.abs((m1.canvas.x - m1.rahmen.x) - (m0.canvas.x - m0.rahmen.x) * f)
      const dw = Math.abs(m1.canvas.w - m0.canvas.w * f)
      pruefe(dx < 3 && dw < 3, `[${name}] Stift-Ebene wächst mit dem Blatt (dx ${dx.toFixed(1)}, dw ${dw.toFixed(1)})`)
    }
    const fx = Math.abs((m1.feld.x - m1.rahmen.x) - (m0.feld.x - m0.rahmen.x) * f)
    pruefe(fx < 3, `[${name}] Eingabefeld bleibt an seiner Stelle im Blatt (dx ${fx.toFixed(1)})`)
    // Zoom-Knöpfe in der Werkzeugleiste, „Einreichen" frei
    pruefe((await s.locator('[data-werkzeuge] [data-zoom-knoepfe]').count()) === 1, `[${name}] Zoom-Knöpfe in der Werkzeugleiste`)
    // Leiste steht am Blattende, nicht schwebend (03.11.2026)
    pruefe((await s.locator('[data-blatt-leiste="einreichen"]').evaluate((e) => getComputedStyle(e).position)) !== 'sticky', `[${name}] Einreichen-Leiste schwebt nicht über dem Blatt`)
    await s.locator('[data-blatt-einreichen]').scrollIntoViewIfNeeded()
    const frei = await s.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Einreichen/.test(x.textContent || ''))
      if (!b) return 'kein Knopf'
      const r = b.getBoundingClientRect()
      const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return b.contains(oben) ? 'frei' : 'verdeckt'
    })
    pruefe(frei === 'frei', `[${name}] „Einreichen" erreichbar (${frei})`)
    // Zoom an die Stelle unter dem Zeiger (03.11.2026): Strg + Mausrad über einem Feld – es bleibt unter dem Zeiger
    if (name !== 'ipad-webkit') {
      await s.locator('[data-zoom-einpassen]').first().click()
      await s.waitForTimeout(500)
      const ziel = s.locator('[data-feld]').nth(2)
      await ziel.scrollIntoViewIfNeeded()
      await s.waitForTimeout(300)
      const b0 = await ziel.boundingBox()
      const zx = b0.x + 20
      const zy = b0.y + b0.height / 2
      await s.mouse.move(zx, zy)
      await s.keyboard.down('Control')
      for (let i = 0; i < 3; i++) {
        await s.mouse.wheel(0, -120)
        await s.waitForTimeout(150)
      }
      await s.keyboard.up('Control')
      await s.waitForTimeout(700)
      const b1 = await ziel.boundingBox()
      const wuchs = b1.width / b0.width
      // Der Punkt (20 px vom linken Feldrand, Feldmitte) liegt nach dem Zoom bei 20 × Faktor
      const dx = Math.abs(b1.x + 20 * wuchs - zx)
      const dy = Math.abs(b1.y + (b1.height / 2) - zy)
      pruefe(wuchs > 1.2 && dx < 12 && dy < 12, `[${name}] Strg + Mausrad zoomt an die Stelle unter dem Zeiger (Faktor ${wuchs.toFixed(2)}, Abweichung ${dx.toFixed(0)}/${dy.toFixed(0)} px)`)
    }
    // ---------- Notizrand (03.11.2026, abgestimmt): nur in Edge am PC
    if (name === 'pc-edge') {
      await s.locator('[data-zoom-einpassen]').first().click()
      await s.waitForTimeout(400)
      const innen = () => s.evaluate(() => {
        const e = document.querySelector('iframe').contentDocument.querySelector('.ws-task-num')
        return e ? Math.round(e.getBoundingClientRect().left) + '/' + Math.round(e.getBoundingClientRect().top) : ''
      })
      const vorRand = await innen()
      await s.locator('[data-notizrand-schalter]').click()
      await s.waitForTimeout(600)
      pruefe(await s.locator('[data-notizrand="0"]').isVisible(), '[Notizrand] Streifen neben der ersten Seite')
      pruefe((await innen()) === vorRand, `[Notizrand] Blatt im Rahmen unverändert gesetzt (${vorRand} → ${await innen()})`)
      // Mit dem Stift in den Rand schreiben
      await s.locator('[data-werkzeug="stift"]').first().click()
      const r = await s.locator('[data-notizrand="0"]').boundingBox()
      // Sichtbarer Teil des Streifens (unter der mitlaufenden Werkzeugleiste)
      const sy = Math.max(r.y + 40, 300)
      await s.mouse.move(r.x + 30, sy)
      await s.mouse.down()
      await s.mouse.move(r.x + 140, sy + 15, { steps: 8 })
      await s.mouse.up()
      await s.waitForTimeout(3500)
      await s.screenshot({ path: join(out, `${name}-3-notizrand.png`) })
      // Ausblenden: Fähnchen, Vorschau, wieder einblenden
      await s.locator('[data-notizrand-schalter]').click()
      await s.waitForTimeout(800)
      pruefe((await s.locator('[data-notizrand]').count()) === 0, '[Notizrand] ausgeblendet')
      const fahne = s.locator('[data-notiz-faehnchen]').first()
      pruefe(await fahne.isVisible().catch(() => false), '[Notizrand] Fähnchen zeigt die ausgeblendete Notiz')
      if (await fahne.isVisible().catch(() => false)) {
        await fahne.click()
        await s.waitForTimeout(400)
        await s.screenshot({ path: join(out, `${name}-4-faehnchen.png`) })
        await s.locator('[data-notizrand-einblenden]').click()
        await s.waitForTimeout(600)
        pruefe(await s.locator('[data-notizrand="0"]').isVisible(), '[Notizrand] „Notizrand einblenden" aus dem Fähnchen')
      }
      await s.waitForTimeout(3000)
      await s.reload()
      await s.locator('[data-feld]').first().waitFor({ timeout: 30000 })
      await s.waitForTimeout(1500)
      pruefe(await s.locator('[data-notizrand="0"]').isVisible().catch(() => false), '[Notizrand] nach dem Neuladen weiter eingeblendet')
      const tinte = await s.evaluate(() => {
        const c = document.querySelector('canvas[data-tinte="41"]')
        if (!c) return 0
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let k = 3; k < d.length; k += 16) if (d[k] > 30) n++
        return n
      })
      pruefe(tinte > 20, `[Notizrand] Stift-Notiz im Rand gespeichert (${tinte} Punkte)`)
    }
    await ctx.close()
  }

  await sm_schliessen()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 4).join(' | ')}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await edge.close()
  await safari.close()
  await fuchs.close()
}
if (problems.length) {
  console.log(`Probleme: ${problems.join(' | ')}`)
  process.exit(1)
}
console.log('Alles in Ordnung')
