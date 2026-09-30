// Bedienung mit dem Finger (30.09.2026, src/renderer/src/shared/touch, recherche/mobile-bedienung-2026-09-30.md).
//
// Vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil
// Aufruf: node tests/e2e/mobil-touch.mjs <Ausgabeordner> [wurzel=out/mobil]
//
// Die iPad-/iPhone-App läuft im Browser mit Touch-Emulation (hasTouch, isMobile). Geprüft wird
// auf iPad hochkant, iPad quer und iPhone hochkant:
//  1. Touch-Modus an (html[data-touch]), kein seitliches Rollen der Seite
//  2. Ziele ≥ 44 Punkte und Eingaben ≥ 16 px in jedem Programm (alles Sichtbare außerhalb der Blätter)
//  3. Navigation: iPhone unten mit Schublade „Programme", iPad Seitenleiste ausblendbar (Griff + Schublade)
//  4. Bausteinwerkzeuge per Antippen – fingergroß, auch auf dem verkleinerten Blatt
//  5. Zwei-Finger-Zoom auf dem Blatt und die Knöpfe „+"/„–" als Weg mit einem Finger
//  6. Langer Druck: Menü eines Bibliothekseintrags; auf einem Symbolknopf dessen Beschreibung
//  7. Wischen: Eintrag nach links legt „Kopie"/„Löschen" frei; zwischen den Schritten eines Programms
//  8. Bildschirmtastatur (nachgestellt: das Fenster schrumpft wie in der App): das Feld bleibt sichtbar
import { chromium } from 'playwright-core'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/mobil-touch')
const wurzel = resolve(process.argv[3] ?? 'out/mobil')
mkdirSync(out, { recursive: true })
if (!existsSync(join(wurzel, 'index.html'))) throw new Error(`${wurzel} fehlt – vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil`)

const TYPEN = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain'
}
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const adresse = `http://127.0.0.1:${server.address().port}/?selftest`

const probleme = []
const pruefe = (ok, text) => {
  if (!ok) probleme.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Alles Antippbare außerhalb der Blätter: zu klein? Eingaben unter 16 px? */
const messen = () => {
  const vw = innerWidth
  const vh = innerHeight
  const sichtbar = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null
    // Verdeckt (z. B. hinter der Leiste unten)?
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2))
    const oben = document.elementFromPoint(x, y)
    if (oben && !el.contains(oben) && !oben.contains(el) && !el.closest('label')?.contains(oben)) return null
    return r
  }
  const aufBlatt = (el) => el.closest('.ws-page, .vt-page, .rm-buehne, .tb-buehne, .tb-flaeche, .fit-to-width, .zoom-flaeche')
  const name = (el) =>
    (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const klein = []
  let gesamt = 0
  for (const el of document.querySelectorAll(
    'button, a[href], [role=button], [role=tab], [role=menuitem], [role=switch], [role=radio], [role=checkbox], select, input:not([type=hidden]), .mantine-Stepper-step'
  )) {
    if (aufBlatt(el)) continue
    if (!sichtbar(el)) continue
    // Zählt die Fläche, die den Tipp annimmt: Beschriftung bei Kästchen, Feldrahmen bei Eingaben
    const flaeche = el.closest('label, .mantine-Checkbox-root, .mantine-Radio-root, .mantine-Switch-root, .mantine-Input-wrapper') ?? el
    const r = flaeche.getBoundingClientRect()
    gesamt++
    if (r.width < 43.5 || r.height < 43.5) klein.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
  }
  const eingaben = []
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), textarea, select')) {
    if (aufBlatt(el) || !sichtbar(el)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < 16) eingaben.push(`${name(el)} ${fs}px`)
  }
  const main = document.querySelector('.app-main')
  return {
    gesamt,
    klein,
    eingaben,
    seitwaerts: document.documentElement.scrollWidth > vw + 1 || (main ? main.scrollWidth > main.clientWidth + 1 : false)
  }
}

async function lauf(name, breite, hoehe) {
  console.log(`\n=== ${name} (${breite}×${hoehe}) ===`)
  const browser = await chromium.launch({ channel: 'msedge' })
  const kontext = await browser.newContext({ viewport: { width: breite, height: hoehe }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  const page = await kontext.newPage()
  const cdp = await kontext.newCDPSession(page)
  const fehler = []
  page.on('pageerror', (e) => fehler.push(e.message))
  const telefon = breite <= 700
  const bild = (n) => page.screenshot({ path: join(out, `${name}-${n}.png`) })
  const sichtbar = (sel) => page.locator(sel).filter({ visible: true }).first()

  // Finger über CDP (Playwright kennt nur das einfache Tippen)
  const finger = (type, punkte) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punkte.map((p, i) => ({ x: p.x, y: p.y, id: i })) })
  const mitte = async (loc) => {
    const b = await loc.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const langerDruck = async (p) => {
    await finger('touchStart', [p])
    await page.waitForTimeout(750)
    await finger('touchEnd', [])
  }
  const wischen = async (von, dx, dy = 0) => {
    await finger('touchStart', [von])
    for (let i = 1; i <= 6; i++) {
      await finger('touchMove', [{ x: von.x + (dx * i) / 6, y: von.y + (dy * i) / 6 }])
      await page.waitForTimeout(16)
    }
    await finger('touchEnd', [])
    await page.waitForTimeout(400)
  }

  /** Programm öffnen – über die Seitenleiste bzw. auf dem iPhone über „Programme" (ein zweiter Versuch, falls der erste Tipp nur etwas schloss) */
  const offen = (label) =>
    page.evaluate(
      (l) => Boolean(document.querySelector(`.app-leiste [aria-label="${l}"][data-active="true"], .mobil-tabs [aria-label="${l}"][data-aktiv="true"]`)),
      label
    )
  const oeffne = async (label) => {
    for (let versuch = 0; versuch < 2; versuch++) {
      const direkt = page.locator(`.app-leiste [aria-label="${label}"], .mobil-tabs [aria-label="${label}"]`).filter({ visible: true })
      if (await direkt.count()) await direkt.first().tap({ timeout: 8000 })
      else {
        await sichtbar('[data-programme-knopf], [data-leiste-griff]').tap()
        await sichtbar(`.mobil-programm[aria-label="${label}"]`).tap()
      }
      await page.waitForTimeout(600)
      // Auf dem iPhone steht nicht jedes Programm unten – dann genügt ein Versuch
      if (await offen(label)) return
      if (!(await page.locator(`.app-leiste [aria-label="${label}"], .mobil-tabs [aria-label="${label}"]`).count())) return
    }
  }

  try {
    await page.goto(adresse)
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    const spaeter = page.getByRole('button', { name: 'Später einrichten' })
    await spaeter.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)

    // ---------- 7. Wischen zwischen den Schritten (Einrichtung: sechs Schritte, alle antippbar)
    const schritt = () =>
      page.evaluate(() => [...document.querySelectorAll('.mantine-Modal-root .mantine-Stepper-step')].findIndex((s) => s.hasAttribute('data-progress')))
    const text = sichtbar('.mantine-Modal-root .mantine-Modal-body p')
    if (await text.count()) {
      const tm = await mitte(text)
      const s0 = await schritt()
      await wischen({ x: Math.min(breite - 40, tm.x + 100), y: tm.y }, -180)
      const s1 = await schritt()
      await bild('7-schritt-weiter')
      await wischen({ x: Math.max(40, tm.x - 100), y: tm.y }, 180)
      const s2 = await schritt()
      pruefe(s0 === 0 && s1 === 1 && s2 === 0, `${name}: Wischen wechselt die Schritte der Einrichtung (${s0} → ${s1} → ${s2})`)
    } else pruefe(false, `${name}: Einrichtung nicht erschienen`)
    if (await spaeter.isVisible().catch(() => false)) await spaeter.tap()
    await page.waitForTimeout(500)

    // ---------- 1. Touch-Modus
    pruefe(await page.evaluate(() => document.documentElement.hasAttribute('data-touch')), `${name}: Touch-Modus an`)
    await bild('1-start')

    // ---------- 3. Navigation
    if (telefon) {
      pruefe((await page.locator('.app-leiste').count()) === 0, `${name}: keine Seitenleiste auf dem iPhone`)
      pruefe(await sichtbar('.mobil-tabs').isVisible(), `${name}: Navigation unten`)
      await sichtbar('[data-programme-knopf]').tap()
      await page.waitForTimeout(500)
      const schublade = sichtbar('.mobil-programme')
      pruefe(await schublade.isVisible(), `${name}: „Programme" öffnet die Programmliste`)
      await bild('3-programme')
      await sichtbar('.mobil-programm[aria-label="Vokabeltest"]').tap()
      await page.waitForTimeout(600)
      pruefe(await page.locator('.module-container:not([hidden]) >> text=Vokabelliste').first().isVisible(), `${name}: Programm aus der Schublade geöffnet`)
    } else {
      pruefe(await sichtbar('.app-leiste').isVisible(), `${name}: Seitenleiste da`)
      await sichtbar('[data-leiste-ausblenden]').tap()
      await page.waitForTimeout(400)
      pruefe(
        (await page.locator('.app-leiste').count()) === 0 && (await sichtbar('[data-leiste-griff]').isVisible()),
        `${name}: Seitenleiste ausgeblendet, Griff unten links`
      )
      await bild('3-ohne-leiste')
      // Wischen vom linken Rand öffnet die Programmliste
      await wischen({ x: 6, y: Math.round(hoehe / 2) }, 160)
      pruefe(await sichtbar('.mobil-programme').isVisible(), `${name}: Wischen vom Rand öffnet die Programmliste`)
      await bild('3-schublade')
      await sichtbar('.mobil-programm[aria-label="Vokabeltest"]').tap()
      await page.waitForTimeout(600)
      await sichtbar('[data-leiste-griff]').tap()
      await page.getByRole('button', { name: 'Seitenleiste wieder einblenden' }).tap()
      await page.waitForTimeout(500)
      pruefe(await sichtbar('.app-leiste').isVisible(), `${name}: Seitenleiste wieder eingeblendet`)
    }

    // ---------- 2. Ziele und Eingaben je Programm
    for (const [label, n] of [
      ['Startseite', 'start'],
      ['Einstellungen', 'einstellungen'],
      ['Arbeitsblatt', 'arbeitsblatt'],
      ['Vokabeltest', 'vokabeltest'],
      ['Grammatiktest', 'grammatiktest'],
      ['Lernzielkontrolle', 'lzk'],
      ['Klassenarbeiten', 'klassenarbeit'],
      ['Rückmeldung', 'rueckmeldung'],
      ['Tafelbilder', 'tafelbild'],
      ['Elternbriefe', 'elternbrief'],
      ['Vokabellisten', 'vokabelliste']
    ]) {
      await oeffne(label)
      const m = await page.evaluate(messen)
      await bild(`2-${n}`)
      pruefe(m.klein.length === 0, `${name}/${n}: alle ${m.gesamt} Ziele ≥ 44 Punkte${m.klein.length ? ` – zu klein: ${m.klein.slice(0, 6).join(' | ')}` : ''}`)
      pruefe(m.eingaben.length === 0, `${name}/${n}: Eingaben ≥ 16 px${m.eingaben.length ? ` – ${m.eingaben.slice(0, 4).join(' | ')}` : ''}`)
      pruefe(!m.seitwaerts, `${name}/${n}: kein seitliches Rollen`)
    }

    // ---------- 4. Bausteinwerkzeuge per Antippen
    await oeffne('Arbeitsblatt')
    await page.evaluate(() => window.__selftest.mathSheet())
    await page.waitForTimeout(1500)
    const kopf = page.locator('.editor-block').filter({ visible: true }).nth(1)
    await kopf.scrollIntoViewIfNeeded()
    // Auf den Rand des Bausteins tippen (nicht in ein Textfeld)
    const kb = await kopf.boundingBox()
    await page.touchscreen.tap(kb.x + 4, kb.y + kb.height / 2)
    await page.waitForTimeout(500)
    const leiste = kopf.locator('.editor-block-toolbar')
    const leisteDa = await leiste.evaluate((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
    pruefe(leisteDa, `${name}: Antippen zeigt die Werkzeuge des Bausteins`)
    const groessen = await leiste
      .locator('button')
      .evaluateAll((bs) =>
        bs
          .filter((b) => b.getBoundingClientRect().width > 0)
          .map((b) => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))
      )
    pruefe(groessen.length > 0 && Math.min(...groessen) >= 40, `${name}: Werkzeuge fingergroß (${groessen.join('/')})`)
    await bild('4-werkzeuge')

    // Daneben tippen (auf den aktuellen Schritt oben): Die Leiste geht wieder, die Zoom-Knöpfe kommen zurück
    await sichtbar('.module-container:not([hidden]) .mantine-Stepper-step[data-progress]').tap()
    await page.waitForTimeout(400)
    pruefe((await page.locator('[data-zoom-wert]').filter({ visible: true }).count()) > 0, `${name}: nach dem Antippen daneben sind die Zoom-Knöpfe wieder da`)

    // ---------- 5. Zwei-Finger-Zoom
    const wert = () => page.locator('[data-zoom-wert]').filter({ visible: true }).last().innerText()
    const vorher = parseInt(await wert(), 10)
    const flaeche = page.locator('.fit-to-width').filter({ visible: true }).last()
    const fm = await mitte(flaeche)
    const y = Math.min(fm.y, hoehe / 2)
    await finger('touchStart', [
      { x: fm.x - 40, y },
      { x: fm.x + 40, y }
    ])
    for (let i = 1; i <= 8; i++) {
      await finger('touchMove', [
        { x: fm.x - 40 - i * 12, y },
        { x: fm.x + 40 + i * 12, y }
      ])
      await page.waitForTimeout(20)
    }
    await finger('touchEnd', [])
    await page.waitForTimeout(500)
    const nachPinch = parseInt(await wert(), 10)
    pruefe(nachPinch > vorher * 1.5, `${name}: Zwei-Finger-Zoom vergrößert das Blatt (${vorher} % → ${nachPinch} %)`)
    await bild('5-gezoomt')
    await page.locator('[data-zoom-wert]').filter({ visible: true }).last().tap()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Vergrößern' }).filter({ visible: true }).last().tap()
    await page.waitForTimeout(300)
    const nachKnopf = parseInt(await wert(), 10)
    pruefe(nachKnopf > vorher, `${name}: Knopf „Vergrößern" als Weg mit einem Finger (${vorher} % → ${nachKnopf} %)`)
    await page.locator('[data-zoom-wert]').filter({ visible: true }).last().tap()

    // ---------- 6. Langer Druck auf einen Symbolknopf: Beschreibung
    const undo = page.getByRole('button', { name: 'Rückgängig' }).filter({ visible: true }).first()
    if (await undo.count()) {
      await langerDruck(await mitte(undo))
      await page.waitForTimeout(500)
      const tipp = await page.locator('.touch-tipp, .mantine-Tooltip-tooltip').filter({ visible: true }).count()
      pruefe(tipp > 0, `${name}: langer Druck auf ein Symbol zeigt seine Beschreibung`)
      await bild('6-beschreibung')
    }

    // ---------- 5b. Druckvorschau: Zwei-Finger-Zoom auf den Seitenbildern
    await sichtbar('.editor-leiste button:has-text("Drucken")').tap()
    // Vorfrage zu den Lösungen (Arbeitsblatt)
    const weiter = page.getByRole('button', { name: 'Weiter zur Druckvorschau' })
    await weiter.waitFor({ timeout: 5000 }).catch(() => undefined)
    if (await weiter.isVisible().catch(() => false)) await weiter.tap()
    const seitenbild = page.locator('.mantine-Modal-root img[data-print-page]').first()
    // Im Browser entstehen keine PDF-Seiten (nur in der App) – dann meldet die Vorschau das, und die Prüfung entfällt
    const ohnePdf = page.locator('.mantine-Modal-root >> text=nur in der iPad-App')
    await Promise.race([seitenbild.waitFor({ timeout: 60000 }), ohnePdf.waitFor({ timeout: 60000 })]).catch(() => undefined)
    if (await seitenbild.isVisible().catch(() => false)) {
      await page.waitForTimeout(500)
      const vb = await seitenbild.boundingBox()
      const vx = vb.x + vb.width / 2
      const vy = vb.y + Math.min(vb.height / 2, 150)
      const breiteVorher = vb.width
      await finger('touchStart', [
        { x: vx - 30, y: vy },
        { x: vx + 30, y: vy }
      ])
      for (let i = 1; i <= 8; i++) {
        await finger('touchMove', [
          { x: vx - 30 - i * 10, y: vy },
          { x: vx + 30 + i * 10, y: vy }
        ])
        await page.waitForTimeout(20)
      }
      await finger('touchEnd', [])
      await page.waitForTimeout(500)
      const breiteNachher = (await seitenbild.boundingBox()).width
      pruefe(
        breiteNachher > breiteVorher * 1.4,
        `${name}: Zwei-Finger-Zoom in der Druckvorschau (${Math.round(breiteVorher)} → ${Math.round(breiteNachher)} Punkte)`
      )
      pruefe((await page.locator('.mantine-Modal-root [data-zoom-knoepfe]').filter({ visible: true }).count()) > 0, `${name}: Zoom-Knöpfe in der Druckvorschau`)
    } else console.log(`       ${name}: Druckvorschau ohne Seitenbilder (Browser ohne PDF) – Zoom dort nicht geprüft`)
    await bild('5-druckvorschau')
    await sichtbar('.mantine-Modal-root button:has-text("Abbrechen")').tap()
    await page.waitForTimeout(600)

    // ---------- 6./7. Bibliothek: langer Druck = Menü, Wischen = Kopie/Löschen
    await oeffne('Lernzielkontrolle')
    await page.evaluate(() => window.__selftest.lzkSheet())
    await page.evaluate(() => window.__selftest.lzkSpeichern('Touch-Probe'))
    await page.waitForTimeout(500)
    await sichtbar('button:has-text("Meine Lernzielkontrollen")').tap()
    await page.waitForTimeout(800)
    const eintrag = sichtbar('[data-bibliothek-eintrag="Touch-Probe"]')
    await eintrag.waitFor({ timeout: 5000 })
    const em = await mitte(eintrag)
    await langerDruck({ x: em.x - 60, y: em.y })
    await page.waitForTimeout(400)
    pruefe(
      await sichtbar('.mantine-Menu-dropdown >> text=Umbenennen')
        .isVisible()
        .catch(() => false),
      `${name}: langer Druck öffnet das Menü des Eintrags`
    )
    await bild('6-menue')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await wischen({ x: em.x + 40, y: em.y }, -200)
    const loeschen = page.locator('[data-wisch-zeile][data-offen] .wisch-zeile-aktionen button').filter({ visible: true })
    pruefe((await loeschen.count()) >= 1, `${name}: nach links wischen legt „Kopie"/„Löschen" frei (${await loeschen.allInnerTexts()})`)
    await bild('7-wischen')

    // ---------- 8. Bildschirmtastatur (nachgestellt wie in der App: das Fenster wird niedriger)
    await oeffne('Einstellungen')
    const feld = page.locator('.module-container:not([hidden]) input[type=text], .mantine-AppShell-main input[type=text]').filter({ visible: true }).last()
    await feld.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const f = [...document.querySelectorAll('.mantine-AppShell-main input[type=text]')].filter((e) => e.getBoundingClientRect().height > 0).pop()
      const scroller =
        f &&
        [
          ...(function* () {
            for (let e = f.parentElement; e; e = e.parentElement) yield e
          })()
        ].find((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY))
      // Das Feld an den unteren Rand rollen – dorthin, wo die Tastatur gleich aufgeht
      if (f && scroller) scroller.scrollTop -= innerHeight - 120 - f.getBoundingClientRect().bottom
    })
    await feld.tap()
    await page.setViewportSize({ width: breite, height: Math.round(hoehe * 0.55) })
    await page.waitForTimeout(900)
    const r = await feld.boundingBox()
    const sichtHoehe = Math.round(hoehe * 0.55)
    pruefe(
      r && r.y >= 0 && r.y + r.height <= sichtHoehe,
      `${name}: das Feld bleibt über der Tastatur sichtbar (${Math.round(r?.y ?? -1)}…${Math.round((r?.y ?? 0) + (r?.height ?? 0))} von ${sichtHoehe})`
    )
    await bild('8-tastatur')
    await page.setViewportSize({ width: breite, height: hoehe })

    pruefe(fehler.length === 0, `${name}: keine Fehler im Fenster${fehler.length ? ` – ${fehler.slice(0, 3).join(' | ')}` : ''}`)
  } catch (e) {
    await bild('abbruch').catch(() => undefined)
    pruefe(false, `${name}: Abbruch – ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
}

await lauf('ipad-hoch', 1024, 1366)
await lauf('ipad-quer', 1366, 1024)
await lauf('iphone', 390, 844)
server.close()

if (probleme.length) {
  console.log(`\n${probleme.length} Problem(e):\n - ${probleme.join('\n - ')}`)
  process.exit(1)
}
console.log('\nBedienung mit dem Finger: alles in Ordnung.')
