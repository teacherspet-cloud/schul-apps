// Ordner im Regal auf Tablet und Smartphone (08.10.2026, Auftrag der Lehrkraft): Fachordner auf der Startseite in
// „Mein Lernraum", Aufschlagen und Zuklappen mit Animation – mit Safari-Engine (iPad, iPhone) und Android-Chrome.
// Geprüft je Gerät: Ordner auf der Startseite antippbar, Deckel wächst sichtbar im Bild, Ordnerseite klappt auf und die
// Bühne verschwindet, Zuklappen führt zur Startseite zurück (Herkunft) und der Rücken ist wieder sichtbar, nichts
// ragt seitlich heraus. Bilder der Zwischenstände im Ausgabeordner.
// Ohne leere Seite (09.10.2026, Befund der Lehrkraft): Aufschlagen und Zuklappen wechseln die Seite ohne Neuladen; je Bild
// wird geprüft, dass entweder der deckende Grund der Bühne oder Regal bzw. Ordner zu sehen ist – nie ein leeres Bild –,
// dazu Bildschirmfotos im Wechsel (nicht einfarbig). Der Deckel landet genau auf dem gezeichneten Ordner (Breite, Lage,
// sichtbare Höhe) und beim Zuklappen auf dem Rücken. Dazu ein Desktop-Lauf (Maus).
// Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-ordner-mobil.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium, devices, webkit } from 'playwright-core'
import { mkdirSync } from 'fs'
import { PNG } from 'pngjs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-ordner-mobil')
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

// Zeichnet je Bild Lage und Drehung des Deckels auf (läuft auf jeder Seite ab dem Laden, solange die Seite lebt – seit
// 09.10.2026 gibt es zwischen Regal und Ordner kein Neuladen mehr). Dazu je Bild: Ist etwas zu sehen? (deckender Grund
// der Bühne, Regal oder Ordner) – sonst ein „leeres Bild".
const AUFZEICHNEN = () => {
  window.__deckel = []
  window.__leer = []
  window.__bilder = 0
  const t0 = performance.now()
  const schritt = () => {
    const jetzt = Math.round(performance.now() - t0)
    const d = document.querySelector('.sa-ordner-deckel')
    if (d && window.__deckel.length < 3000) {
      const r = d.getBoundingClientRect()
      window.__deckel.push({ t: jetzt, x: r.x, y: r.y, b: r.width, h: r.height, tr: getComputedStyle(d).transform })
    }
    const grund = document.querySelector('[data-ordner-uebergang] .sa-ordner-grund')
    const deckend = Boolean(grund && parseFloat(getComputedStyle(grund).opacity) > 0.98)
    const inhalt = [...document.querySelectorAll('[data-regal] .rg-ordner, [data-ordner] .og-ordner')].some((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
    })
    window.__bilder++
    // Maß des Deckels und des Ordners im selben Bild (später nachgeladener Inhalt zählt nicht)
    const ziel = document.querySelector('[data-ordner-ziel]')?.getAttribute('data-ordner-ziel')
    const o = document.querySelector('[data-ordner] .og-ordner')
    if (ziel && o) {
      const r = o.getBoundingClientRect()
      const oben = Math.max(0, r.top)
      window.__massPaar = { ziel, ordner: [r.left, oben, r.width, Math.min(innerHeight, r.bottom) - oben].map(Math.round) }
    }
    if (!deckend && !inhalt && window.__leer.length < 200) window.__leer.push({ t: jetzt, pfad: location.pathname, buehne: Boolean(grund) })
    requestAnimationFrame(schritt)
  }
  requestAnimationFrame(schritt)
}

/** Anteil der häufigsten Farbe in einem Bildschirmfoto (1 = ganz einfarbig, also leer) */
const einfarbig = (png) => {
  const b = PNG.sync.read(png)
  const zaehler = new Map()
  let n = 0
  for (let i = 0; i < b.data.length; i += 4 * 13) {
    const k = (b.data[i] >> 3) * 1024 + (b.data[i + 1] >> 3) * 32 + (b.data[i + 2] >> 3)
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1)
    n++
  }
  return Math.max(...zaehler.values()) / n
}

const GERAETE = [
  { name: 'Desktop', typ: chromium, geraet: { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false }, kanal: 'msedge', maus: true },
  { name: 'iPad', typ: webkit, geraet: devices['iPad (gen 7)'] },
  { name: 'iPad quer', typ: webkit, geraet: devices['iPad (gen 7) landscape'] },
  { name: 'iPhone', typ: webkit, geraet: devices['iPhone 13'] },
  { name: 'Android', typ: chromium, geraet: devices['Pixel 7'], kanal: 'msedge' }
]

const verwaltungsBrowser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const trainings = []
const verwaltung = await verwaltungsBrowser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const neu = async (rolle, name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle, name } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const lehrer = await neu('lehrkraft', 'Olga O')
  const kind = await neu('schueler', 'Mia Muster')
  lk = await verwaltungsBrowser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}/server/vokabeln/${pfad}`, { headers: KOPF, data })).json()
  const woerter = ['go', 'see', 'take', 'come'].map((t, i) => ({ id: `e${i}`, term: t, translation: `Wort ${i}` }))
  const en = (await post('freigeben', { titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter, schueler: [kind.benutzer] })).id
  const fr = (await post('freigeben', { titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'f1', term: 'le chat', translation: 'die Katze' }], schueler: [kind.benutzer] })).id
  trainings.push(en, fr)
  pruefe(Boolean(en && fr), 'Englisch und Französisch für Mia freigegeben')

  for (const g of GERAETE) {
    console.log(`== ${g.name}`)
    const browser = await g.typ.launch(g.kanal ? { channel: g.kanal } : {})
    try {
      const ctx = await browser.newContext({ ...g.geraet })
      await ctx.addInitScript(AUFZEICHNEN)
      await anmelden(ctx, kind.benutzer, kind.passwort)
      // Hier geht es ums Blättern im Ordner: „Vollbild beim Lernen" aus (eigener Test: server-fokus.mjs, 09.10.2026)
      await ctx.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { modus: 'dunkel', vorgabe0810: true, vollbild: false } })
      const p = await ctx.newPage()
      p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
      await p.goto(`${A}/s/`)
      const ruecken = p.locator('[data-mein-lernraum] [data-regal-ordner="Englisch"]')
      pruefe(await da(ruecken), `${g.name}: Ordner in „Mein Lernraum" auf der Startseite`)
      await ruecken.scrollIntoViewIfNeeded()
      const breit = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      pruefe(breit <= 1, `${g.name}: Startseite ragt nicht seitlich heraus (${breit}px)`)
      await p.screenshot({ path: join(out, `${g.name}-1-start.png`) })

      // Aufschlagen
      const tippe = (l) => (g.maus ? l.click() : l.tap())
      await p.evaluate(() => {
        window.__ohneNeuladen = 'ja'
        window.__massPaar = null
        window.__leer = []
        window.__deckel = []
      })
      const r0 = await ruecken.boundingBox()
      await tippe(ruecken)
      await p.waitForTimeout(250)
      await p.screenshot({ path: join(out, `${g.name}-2-heraus.png`) }).catch(() => undefined)
      // Zwischenstände: kurz vor, beim und nach dem Seitenwechsel – keins davon (fast) einfarbig
      const anteile = []
      for (const [i, ms] of [200, 200, 250].entries()) {
        await p.waitForTimeout(ms)
        const bild = await p.screenshot({ path: join(out, `${g.name}-2${'abc'[i]}-wechsel.png`) }).catch(() => null)
        if (bild) anteile.push(einfarbig(bild))
      }
      pruefe(
        anteile.length > 0 && anteile.every((a) => a < 0.97),
        `${g.name}: Bildschirmfotos im Wechsel nicht leer (häufigste Farbe ${anteile.map((a) => `${Math.round(a * 100)} %`).join(', ')})`
      )
      // Wohin der Deckel rückt (gesetzt, sobald der Ordner gezeichnet ist)
      await p.locator('[data-ordner-ziel]').waitFor({ state: 'attached', timeout: 3000 }).catch(() => undefined)
      const heraus = await p.evaluate(() => window.__deckel ?? []).catch(() => [])
      const vp = g.geraet.viewport
      // Größte Ausdehnung (die Aufzeichnung läuft seit 09.10.2026 weiter, bis in das Aufklappen hinein)
      const letzt = heraus.reduce((m, x) => (!m || x.b > m.b ? x : m), null)
      pruefe(heraus.length > 3, `${g.name}: Deckel wird beim Antippen herausgenommen (${heraus.length} Bilder)`)
      pruefe(Boolean(letzt && letzt.b > r0.width * 1.5), `${g.name}: Deckel wächst (${Math.round(r0.width)} → ${Math.round(letzt?.b ?? 0)} px)`)
      await p.waitForURL(/\/s\/ordner\//, { timeout: 5000 })
      await p.waitForTimeout(350)
      await p.screenshot({ path: join(out, `${g.name}-3-aufklappen.png`) })
      pruefe(await da(p.locator('[data-ordner="Englisch"]')), `${g.name}: Ordner Englisch aufgeschlagen`)
      const weg = await p
        .locator('[data-ordner-uebergang]')
        .waitFor({ state: 'detached', timeout: 4000 })
        .then(
          () => true,
          () => false
        )
      pruefe(weg, `${g.name}: Aufklapp-Bühne verschwindet wieder`)
      const auf = await p.evaluate(() => window.__deckel ?? [])
      const innen = auf.filter((s) => s.b > 0)
      pruefe(innen.length > 5, `${g.name}: Deckel klappt sichtbar auf (${innen.length} Bilder, ${innen.at(-1)?.t ?? 0} ms)`)
      const raus = innen.filter((s) => s.x < -vp.width || s.x > vp.width * 1.5 || s.y > vp.height)
      pruefe(!raus.length, `${g.name}: Deckel bleibt im Bild`)
      const leer = await p.evaluate(() => ({ leer: window.__leer ?? [], bilder: window.__bilder ?? 0, ohne: window.__ohneNeuladen }))
      pruefe(leer.ohne === 'ja', `${g.name}: Aufschlagen ohne Neuladen der Seite`)
      pruefe(leer.bilder > 20 && !leer.leer.length, `${g.name}: kein leeres Bild beim Aufschlagen (${leer.bilder} Bilder, leer: ${JSON.stringify(leer.leer.slice(0, 3))})`)
      // Deckel genau auf dem Ordner: Breite und Lage, Höhe bis zum Bildrand (zuletzt gemessenes Paar während des Aufklappens)
      const paar = await p.evaluate(() => window.__massPaar ?? null)
      const zielDeckel = paar?.ziel ?? ''
      const echt = paar?.ordner ?? []
      const ziel = zielDeckel.split(',').map(Number)
      pruefe(
        ziel.length === 4 && ziel.every((z, i) => Math.abs(z - echt[i]) <= 3),
        `${g.name}: Deckel hat das Maß des Ordners (Deckel ${zielDeckel}, Ordner ${echt.join(',')})`
      )
      const breitO = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      pruefe(breitO <= 1, `${g.name}: Ordnerseite ragt nicht seitlich heraus (${breitO}px)`)
      await p.screenshot({ path: join(out, `${g.name}-4-offen.png`) })

      // Blättern im Ordner (09.10.2026): Vokabelrunde als nächste Seite, Wischen blättert zurück und wieder vor
      const tiefe = async () => Number(await p.locator('[data-ordner-tiefe]').getAttribute('data-ordner-tiefe'))
      const ruhe = () => p.locator('[data-ordner-umblaettern]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined)
      await tippe(p.locator('[data-ordner-kurs-inhalt] [data-vokabel-start]'))
      const umgeblaettert = await da(p.locator('[data-ordner-umblaettern]').first(), 1500)
      await p.waitForTimeout(250)
      await p.screenshot({ path: join(out, `${g.name}-4b-umblaettern.png`) }).catch(() => undefined)
      await ruhe()
      pruefe(umgeblaettert && (await da(p.locator('[data-ordner] [data-sitzung]'))) && (await tiefe()) === 1, `${g.name}: Vokabelrunde als nächste Seite im Ordner (umgeblättert)`)
      const breitU = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      pruefe(breitU <= 1, `${g.name}: nach dem Umblättern ragt nichts seitlich heraus (${breitU}px)`)
      // Wischen über die Zurück-Leiste (in der Übung selbst gehören die Gesten der Aufgabe)
      const wische = (richtung) =>
        p.evaluate((r) => {
          const el = document.querySelector('.og-zurueck-leiste')
          if (!el || typeof Touch !== 'function') return false
          const b = el.getBoundingClientRect()
          const y = b.top + b.height / 2
          const [x0, x1] = r > 0 ? [b.left + 20, b.left + 220] : [b.left + 220, b.left + 20]
          const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y })
          el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x0)], changedTouches: [t(x0)], bubbles: true }))
          el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x1)], bubbles: true }))
          return true
        }, richtung).catch(() => false)
      if (!g.maus && (await wische(1))) {
        await p.waitForTimeout(300)
        await ruhe()
        pruefe((await da(p.locator('[data-ordner-kurs-inhalt] [data-vokabel-kasten]'))) && (await tiefe()) === 0, `${g.name}: Wischen nach rechts blättert zurück`)
        // Wieder vor: Wischen nach links (auf der Registerseite gibt es keine Zurück-Leiste – dort auf dem Blatt)
        await p.evaluate(() => {
          const el = document.querySelector('[data-ordner-tiefe]')
          const b = el.getBoundingClientRect()
          const y = b.top + 40
          const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y })
          el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(b.right - 20)], changedTouches: [t(b.right - 20)], bubbles: true }))
          el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(b.right - 220)], bubbles: true }))
        })
        await p.waitForTimeout(300)
        await ruhe()
        pruefe((await tiefe()) === 1 && (await da(p.locator('[data-ordner] [data-sitzung]'))), `${g.name}: Wischen nach links blättert wieder vor`)
      } else console.log(`   (${g.name}: ohne Touch-Ereignisse in dieser Engine – Wischen nicht geprüft)`)
      await tippe(p.locator('[data-ordner-zurueck]'))
      await ruhe()
      pruefe((await da(p.locator('[data-ordner-kurs-inhalt] [data-vokabel-kasten]'))) && (await tiefe()) === 0, `${g.name}: Zurück-Knopf blättert zurück`)

      // Zuklappen
      await p.evaluate(() => {
        window.__leer = []
        window.__deckel = []
      })
      await tippe(p.locator('[data-ins-regal]'))
      await p.waitForTimeout(300)
      await p.screenshot({ path: join(out, `${g.name}-5-zuklappen.png`) }).catch(() => undefined)
      const zu = await p.evaluate(() => window.__deckel ?? []).catch(() => [])
      pruefe(zu.length > 3, `${g.name}: Deckel klappt beim Zuklappen zu (${zu.length} Bilder)`)
      await p.waitForURL((u) => new URL(u).pathname === '/s/', { timeout: 5000 }).catch(() => undefined)
      pruefe(new URL(p.url()).pathname === '/s/', `${g.name}: Zuklappen führt zur Startseite zurück (${new URL(p.url()).pathname})`)
      pruefe(await da(ruecken), `${g.name}: Rücken wieder im Regal`)
      // Bühne weg (WebKit braucht etwas länger), dann prüfen
      await p.locator('[data-ordner-uebergang]').waitFor({ state: 'detached', timeout: 4000 }).catch(() => undefined)
      await p.waitForTimeout(200)
      const sichtbar = await ruecken.evaluate((e) => getComputedStyle(e).visibility !== 'hidden')
      const buehne = await p.locator('[data-ordner-uebergang]').count()
      pruefe(sichtbar && buehne === 0, `${g.name}: Rücken sichtbar, keine Bühne übrig`)
      const leerZu = await p.evaluate(() => ({ leer: window.__leer ?? [], ohne: window.__ohneNeuladen }))
      pruefe(leerZu.ohne === 'ja' && !leerZu.leer.length, `${g.name}: Zuklappen ohne Neuladen und ohne leeres Bild (${JSON.stringify(leerZu.leer.slice(0, 3))})`)
      // Der Deckel landet zuletzt auf dem Rücken
      const landung = (await p.evaluate(() => window.__deckel ?? [])).at(-1)
      const rz = await ruecken.boundingBox()
      pruefe(
        Boolean(landung && rz && Math.abs(landung.x - rz.x) < 12 && Math.abs(landung.b - rz.width) < 12),
        `${g.name}: Deckel landet auf dem Rücken (${Math.round(landung?.x ?? -1)}/${Math.round(landung?.b ?? -1)} zu ${Math.round(rz?.x ?? -1)}/${Math.round(rz?.width ?? -1)})`
      )
      await p.screenshot({ path: join(out, `${g.name}-6-zurueck.png`) })

      // Zurück-Geste des Browsers nach dem Aufschlagen: nichts bleibt hängen
      await tippe(ruecken)
      await p.waitForURL(/\/s\/ordner\//, { timeout: 5000 })
      await p.waitForTimeout(1600)
      await p.goBack()
      await p.waitForTimeout(800)
      const nachZurueck = await p.locator('[data-ordner-uebergang]').count()
      const sichtbar2 = await ruecken.evaluate((e) => getComputedStyle(e).visibility !== 'hidden').catch(() => false)
      pruefe(nachZurueck === 0 && sichtbar2, `${g.name}: Nach „Zurück" des Browsers keine Bühne, Rücken sichtbar`)
      await p.screenshot({ path: join(out, `${g.name}-7-browser-zurueck.png`) })
    } catch (e) {
      pruefe(false, `${g.name}: Ablauf abgebrochen – ${String(e?.message ?? e).split('\n')[0]}`)
    } finally {
      await browser.close()
    }
  }
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const id of trainings) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Trainings und Konten gelöscht (${zuLoeschen.length})`)
  await verwaltungsBrowser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
