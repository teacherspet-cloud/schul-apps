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
//  9. Textauswahl-Menü: langer Druck auf ein Wort im Material öffnet das Kreismenü (01.10.2026)
// 10.–15. Befunde vom iPad (01.10.2026): Bausteinleiste antippen und neben dem Blatt, Beschriftung
//     ziehen, lange Listen rollen, Zahlenfelder leeren, Auftragsleiste – dazu ein Lauf in WebKit
//     (Safari-Engine) und einer am PC mit Maus
import { chromium, webkit } from 'playwright-core'
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

/*
 * ---------- Befunde vom iPad (01.10.2026) ----------
 * 10. Knöpfe der Bausteinleiste lassen sich antippen (Zauberstab öffnet sein Feld)
 * 11. Die Leiste ist auch neben dem Blatt ganz zu sehen und zu treffen (auch am PC, s. pcLauf)
 * 12. Beschriftung: Punkt und Schild mit dem Finger ziehen – nicht Bild oder Text
 * 13. Lange Liste (Baustein hinzufügen) mit dem Finger rollen
 * 14. Zahlenfeld „Bearbeitungszeit": leeren, 45 tippen, leer verlassen = Standard
 * 15. Auftragsleiste: Klick auf den Auftrag führt zu Programm, Dokument und Baustein
 * Gemeinsam für Chromium (mit Fingerzügen über CDP) und WebKit (nur Antippen).
 */

/** Knöpfe der sichtbaren Leiste eines Bausteins: im Fenster? treffbar? neben dem Blatt? */
const leistenBefund = (block) => {
  const t = block.querySelector(':scope > .editor-block-toolbar')
  if (!t || getComputedStyle(t).visibility !== 'visible') return { alle: 0, getroffen: 0, imFenster: 0, daneben: 0 }
  const seite = block.closest('.ws-page').getBoundingClientRect()
  const knoepfe = [...t.querySelectorAll('button')].filter((k) => k.getBoundingClientRect().width > 0)
  const je = knoepfe.map((k) => {
    const r = k.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const oben = document.elementFromPoint(x, y)
    return { trifft: k.contains(oben), imFenster: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, daneben: r.right > seite.right + 4 }
  })
  return {
    alle: je.length,
    getroffen: je.filter((e) => e.trifft).length,
    imFenster: je.filter((e) => e.imFenster).length,
    daneben: je.filter((e) => e.daneben).length
  }
}

const BILD_LABELS = [
  { id: 'a', text: 'Zellkern', x: 30, y: 30 },
  { id: 'b', text: 'Zellwand', x: 60, y: 55 }
]
/** Bildbaustein mit Beschriftungen ins offene Blatt (wie beschriftungZiehen.mjs) */
const bildEinfuegen = (labels) => {
  const ws = window.__selftest.worksheetJetzt()
  const c = document.createElement('canvas')
  c.width = 800
  c.height = 600
  const g = c.getContext('2d')
  g.fillStyle = '#eef3ee'
  g.fillRect(0, 0, 800, 600)
  g.strokeStyle = '#686'
  g.lineWidth = 6
  g.strokeRect(60, 60, 680, 480)
  ws.sheets[0].blocks.splice(1, 0, {
    id: 'zelle',
    type: 'image',
    role: 'material',
    side: 'none',
    description: 'Pflanzenzelle',
    caption: 'Pflanzenzelle',
    widthPercent: 80,
    image: { dataUrl: c.toDataURL('image/png'), source: 'own', credit: 'Prüfstand' },
    labels
  })
  window.__selftest.setWorksheet(structuredClone(ws))
}

/**
 * Die Prüfungen 10–15. `h`: page, name, telefon, bild, sichtbar, oeffne, offen und – nur Chromium –
 * `zug(von, dx, dy)` für einen Fingerzug.
 */
async function befundeIpad(h) {
  const { page, name, telefon, bild, sichtbar, oeffne } = h
  const tippe = (p) => page.touchscreen.tap(p.x, p.y)
  const mitte = async (loc) => {
    const b = await loc.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const editor = '.module-container:not([hidden]) .ws-editor-pages'

  // ---------- 10. Zauberstab antippen
  await oeffne('Arbeitsblatt')
  await page.evaluate(() => window.__selftest.mathSheet())
  await page.waitForTimeout(1500)
  const block = page.locator(`${editor} .editor-block`).filter({ visible: true }).nth(2)
  const antippen = async () => {
    await block.scrollIntoViewIfNeeded()
    const bb = await block.boundingBox()
    await page.touchscreen.tap(bb.x + 4, bb.y + Math.min(bb.height / 2, 16))
    await page.waitForTimeout(500)
  }
  await antippen()
  const stab = block.locator(':scope > .editor-block-toolbar [aria-label="Baustein überarbeiten"]')
  const stabTrifft = await stab.evaluate((b) => {
    const r = b.getBoundingClientRect()
    return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
  })
  await tippe(await mitte(stab))
  await page.waitForTimeout(700)
  const feldDa = await page
    .locator('[data-ki-wunsch]')
    .isVisible()
    .catch(() => false)
  await bild('10-zauberstab')
  pruefe(stabTrifft && feldDa, `${name}: Zauberstab der Bausteinleiste antippbar – öffnet sein Feld (trifft ${stabTrifft}, Feld ${feldDa})`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---------- 11. Leiste neben dem Blatt (nicht auf dem Telefon: dort steht sie unten)
  if (!telefon) {
    for (let i = 0; i < 3; i++) {
      await sichtbar('[aria-label="Verkleinern"]').tap()
      await page.waitForTimeout(250)
    }
    await antippen()
    const b = await block.evaluate(leistenBefund)
    await bild('11-leiste-neben-blatt')
    pruefe(
      b.alle > 0 && b.getroffen === b.alle && b.imFenster === b.alle && b.daneben > 0,
      `${name}: Leiste neben dem Blatt ganz sichtbar und treffbar (${b.getroffen}/${b.alle} getroffen, ${b.imFenster} im Fenster, ${b.daneben} neben dem Blatt)`
    )
    await sichtbar('[data-zoom-wert]').tap()
    await page.waitForTimeout(400)
  }
  // Am Fensterrand (Blatt füllt die Breite): die Leiste rückt ins Bild
  await antippen()
  const rand = await block.evaluate(leistenBefund)
  // Telefon: Die Leiste steht unten und rollt seitwärts – dort zählt, dass jeder sichtbare Knopf trifft
  pruefe(
    rand.alle > 0 && rand.getroffen === (telefon ? rand.imFenster : rand.alle) && (telefon || rand.imFenster === rand.alle),
    `${name}: Leiste im Fenster und treffbar (${rand.getroffen} getroffen, ${rand.imFenster} von ${rand.alle} im Fenster)`
  )

  // ---------- 12. Beschriftung mit dem Finger ziehen (Fingerzüge nur über CDP)
  if (h.zug) {
    await page.evaluate(bildEinfuegen, BILD_LABELS)
    await page.waitForTimeout(2000)
    const fig = page.locator(`${editor} .ws-image:has([data-griff])`).first()
    await fig.scrollIntoViewIfNeeded()
    const label = (id) => page.evaluate((i) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'zelle').labels.find((l) => l.id === i), id)
    const punkt = fig.locator('[data-griff="punkt"][data-label-id="a"]').first()
    const pm = await mitte(punkt)
    const vorher = await label('a')
    // Bewusst neben den kleinen Punkt (9/7 Punkte daneben): die Fingerfläche zählt
    await h.zug({ x: pm.x + 9, y: pm.y + 7 }, 50, 35)
    const nachher = await label('a')
    const zustand = await page.evaluate(() => ({
      markiert: window.getSelection()?.toString() ?? '',
      frei: Boolean(window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'zelle').free)
    }))
    await bild('12-beschriftung')
    pruefe(
      nachher.x > vorher.x + 2 && nachher.y > vorher.y + 2 && !zustand.frei && !zustand.markiert,
      `${name}: Punkt der Beschriftung mit dem Finger gezogen (${vorher.x}/${vorher.y} → ${nachher.x}/${nachher.y}; Bild verschoben ${zustand.frei}, markiert „${zustand.markiert}")`
    )
    const schild = fig.locator('[data-griff="schild"][data-label-id="b"]').first()
    const sVorher = (await label('b')).schild?.y
    await h.zug(await mitte(schild), 0, 40)
    const sNachher = (await label('b')).schild?.y
    pruefe(sNachher !== undefined && sNachher !== sVorher, `${name}: Schild der Beschriftung mit dem Finger gezogen (${sVorher} → ${sNachher})`)
  }

  // ---------- 13. Lange Liste rollen
  const hinzu = sichtbar('.module-container:not([hidden]) button:has-text("Baustein hinzufügen")')
  await hinzu.scrollIntoViewIfNeeded()
  await hinzu.tap()
  await page.waitForTimeout(600)
  const liste = sichtbar('.mantine-Menu-dropdown')
  const roll = await liste.evaluate((d) => ({ hoehe: d.scrollHeight, sicht: d.clientHeight, unten: d.getBoundingClientRect().bottom <= innerHeight + 1 }))
  if (h.zug) {
    const lm = await mitte(liste)
    await h.zug({ x: lm.x, y: lm.y + 80 }, 0, -220)
    const oben = await liste.evaluate((d) => d.scrollTop)
    await bild('13-liste-rollen')
    pruefe(
      roll.unten && (roll.hoehe <= roll.sicht + 1 || oben > 20),
      `${name}: „Baustein hinzufügen" passt ins Fenster und rollt mit dem Finger (Inhalt ${roll.hoehe}, sichtbar ${roll.sicht}, gerollt ${Math.round(oben)})`
    )
  } else pruefe(roll.unten && (roll.hoehe <= roll.sicht + 1 || roll.sicht > 100), `${name}: „Baustein hinzufügen" passt ins Fenster (Inhalt ${roll.hoehe}, sichtbar ${roll.sicht})`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---------- 14. Zahlenfeld leeren
  await sichtbar('.module-container:not([hidden]) .mantine-Stepper-step').tap()
  await page.waitForTimeout(800)
  const zeit = page.locator('.module-container:not([hidden])').getByLabel('Bearbeitungszeit (Min.)').filter({ visible: true }).first()
  await zeit.scrollIntoViewIfNeeded()
  await zeit.tap()
  await zeit.press('ControlOrMeta+a')
  await zeit.press('Backspace')
  const leer = await zeit.inputValue()
  await zeit.pressSequentially('45')
  const getippt = await zeit.inputValue()
  await zeit.press('ControlOrMeta+a')
  await zeit.press('Backspace')
  await page.locator('.module-container:not([hidden]) h4, .module-container:not([hidden]) .mantine-Title-root').filter({ visible: true }).first().tap()
  await page.waitForTimeout(300)
  const danach = await zeit.inputValue()
  const minuten = await page.evaluate(() => window.__selftest.worksheetJetzt().meta.minutes)
  await bild('14-zeitfeld')
  pruefe(leer === '', `${name}: Bearbeitungszeit lässt sich leeren („${leer}")`)
  pruefe(getippt === '45', `${name}: danach „45" getippt ergibt 45 („${getippt}")`)
  pruefe(danach === '45' && minuten === 45, `${name}: leer verlassen setzt den Standard 45 („${danach}", gespeichert ${minuten})`)

  // ---------- 15. Auftragsleiste: zum Auftrag springen
  await page.evaluate(() => window.__selftest.setWorksheet(window.__selftest.worksheetJetzt()))
  await page.waitForTimeout(800)
  const zielId = await page.evaluate(() => {
    const bl = window.__selftest.worksheetJetzt().sheets[0].blocks
    return bl[bl.length - 1].id
  })
  await page.evaluate((id) => (window.__probe = window.__selftest.auftragProbe('Probeauftrag Touch', `raster-${id}`)), zielId)
  const zumAuftrag = async (wann) => {
    await oeffne('Startseite')
    await page.waitForTimeout(400)
    if (!(await page.locator('.auftrags-liste').isVisible().catch(() => false))) await sichtbar('.auftrags-pille').tap()
    await page.waitForTimeout(400)
    await sichtbar('[data-auftrag-ziel]').tap()
    await page.waitForTimeout(1500)
    const lage = await page.evaluate((id) => {
      const el = document.querySelector(`.module-container:not([hidden]) [data-baustein="${id}"]`)
      if (!el) return 'fehlt'
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.bottom > 0 && r.top < innerHeight ? 'im Bild' : 'außerhalb'
    }, zielId)
    await bild(`15-auftrag-${wann}`)
    pruefe(lage === 'im Bild', `${name}: Klick auf den ${wann === 'laufend' ? 'laufenden' : 'fertigen'} Auftrag öffnet Blatt und Baustein (${lage})`)
  }
  await zumAuftrag('laufend')
  await page.evaluate(() => window.__probe.fertig())
  await page.waitForTimeout(600)
  await zumAuftrag('fertig')
  // Aufräumen: Erledigte entfernen – die Liste verdeckte sonst die Navigation unten
  await oeffne('Startseite')
  if (!(await page.locator('.auftrags-liste').isVisible().catch(() => false))) await sichtbar('.auftrags-pille').tap()
  await sichtbar('.auftrags-liste button:has-text("Erledigte entfernen")').tap()
  await page.waitForTimeout(400)
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

    // ---------- 9. Textauswahl-Menü (01.10.2026): langer Druck auf ein Wort im Material öffnet das Kreismenü
    await oeffne('Arbeitsblatt')
    await page.evaluate(() => window.__selftest.wsMaterialtext(3))
    await page.waitForTimeout(1500)
    const wortLage = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.module-container:not([hidden]) .ws-editor-pages .ws-paragraph[data-absatz="0"]')].find(
        (e) => e.getBoundingClientRect().height > 0
      )
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const gang = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = gang.nextNode(); n; n = gang.nextNode()) {
        const i = n.data.indexOf('Versammlung')
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(n, i + 2)
        r.setEnd(n, i + 3)
        const b = r.getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
      }
      return null
    })
    if (wortLage) {
      await langerDruck(wortLage)
      await page.waitForTimeout(600)
      const eintrag = page.locator('[data-textmenue] [data-textaktion="fussnote"]')
      pruefe(await eintrag.isVisible().catch(() => false), `${name}: langer Druck auf ein Wort im Material öffnet das Textauswahl-Menü`)
      const wort = await page
        .locator('.textmenue-wort')
        .innerText()
        .catch(() => '')
      pruefe(wort.includes('Versammlung'), `${name}: das Wort unter dem Finger ist markiert (${wort})`)
      await bild('9-textauswahl')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } else pruefe(false, `${name}: Materialtext für das Textauswahl-Menü nicht gefunden`)

    // ---------- 10.–15. Befunde vom iPad (01.10.2026)
    await befundeIpad({ page, name, telefon, bild, sichtbar, oeffne, zug: wischen })

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

/** Gemeinsame Helfer für die Läufe außerhalb von `lauf` (WebKit, PC) */
function helfer(page, name) {
  const sichtbar = (sel) => page.locator(sel).filter({ visible: true }).first()
  const bild = (n) => page.screenshot({ path: join(out, `${name}-${n}.png`) })
  const oeffne = async (label) => {
    const direkt = page.locator(`.app-leiste [aria-label="${label}"], .mobil-tabs [aria-label="${label}"]`).filter({ visible: true })
    if (await direkt.count()) await direkt.first().click({ timeout: 8000 })
    await page.waitForTimeout(600)
  }
  return { sichtbar, bild, oeffne }
}

async function starten(page) {
  await page.goto(adresse)
  await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  await spaeter.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined)
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await page.waitForTimeout(500)
}

/**
 * WebKit (die Engine von Safari auf dem iPad): Antippen, Leiste, Zahlenfeld und Auftragsleiste.
 * Fingerzüge gibt es hier nicht (kein CDP) – die prüft der Chromium-Lauf.
 */
async function webkitLauf(name, breite, hoehe) {
  console.log(`\n=== ${name} (WebKit, ${breite}×${hoehe}) ===`)
  let browser
  try {
    browser = await webkit.launch()
  } catch (e) {
    console.log(`       WebKit nicht verfügbar: ${e.message.split('\n')[0]} – übersprungen`)
    return
  }
  const kontext = await browser.newContext({ viewport: { width: breite, height: hoehe }, hasTouch: true, deviceScaleFactor: 1 })
  const page = await kontext.newPage()
  const fehler = []
  page.on('pageerror', (e) => fehler.push(e.message))
  const h = helfer(page, name)
  try {
    await starten(page)
    pruefe(await page.evaluate(() => document.documentElement.hasAttribute('data-touch')), `${name}: Touch-Modus an`)
    await befundeIpad({ page, name, telefon: false, ...h })
    pruefe(fehler.length === 0, `${name}: keine Fehler im Fenster${fehler.length ? ` – ${fehler.slice(0, 3).join(' | ')}` : ''}`)
  } catch (e) {
    await h.bild('abbruch').catch(() => undefined)
    pruefe(false, `${name}: Abbruch – ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
}

/** Am PC mit Maus: Die Leiste ist auch über der leeren Fläche neben dem Blatt ganz zu sehen und zu treffen */
async function pcLauf() {
  const name = 'pc'
  console.log(`\n=== ${name} (Maus, 1600×1000) ===`)
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })).newPage()
  const h = helfer(page, name)
  try {
    await starten(page)
    // Die Web-Fassung ist für das iPad gebaut und schaltet den Touch-Modus immer ein – hier gilt die Darstellung für die Maus
    await page.evaluate(() => document.documentElement.removeAttribute('data-touch'))
    await h.oeffne('Arbeitsblatt')
    await page.evaluate(() => window.__selftest.mathSheet())
    // Schmaler Seitenrand (12 mm, das Mindestmaß der Designvorlagen): Die Leiste reicht über das Blatt hinaus
    await page.evaluate(() => {
      const ws = window.__selftest.worksheetJetzt()
      ws.design.page.marginMm = 12
      window.__selftest.setWorksheet(structuredClone(ws))
    })
    await page.waitForTimeout(1500)
    for (let i = 0; i < 3; i++) {
      await h.sichtbar('[aria-label="Verkleinern"]').click()
      await page.waitForTimeout(250)
    }
    const block = page.locator('.module-container:not([hidden]) .ws-editor-pages .editor-block').filter({ visible: true }).nth(2)
    await block.scrollIntoViewIfNeeded()
    await block.hover({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(400)
    const b = await block.evaluate(leistenBefund)
    await h.bild('11-leiste-neben-blatt')
    pruefe(
      b.alle > 0 && b.getroffen === b.alle && b.imFenster === b.alle && b.daneben > 0,
      `${name}: Leiste neben dem Blatt ganz sichtbar und treffbar (${b.getroffen}/${b.alle} getroffen, ${b.daneben} neben dem Blatt)`
    )
    // Den Knopf neben dem Blatt wirklich anklicken: „Weitere Aktionen" öffnet sein Menü
    await block.locator(':scope > .editor-block-toolbar [aria-label="Weitere Aktionen"]').click()
    await page.waitForTimeout(400)
    pruefe(await h.sichtbar('.mantine-Menu-dropdown').isVisible().catch(() => false), `${name}: „Weitere Aktionen" neben dem Blatt öffnet das Menü`)
    await h.sichtbar('[data-zoom-wert]').click()
  } catch (e) {
    await h.bild('abbruch').catch(() => undefined)
    pruefe(false, `${name}: Abbruch – ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
}

// MOBIL_TOUCH_NUR=pc|webkit|ipad-hoch|ipad-quer|iphone: nur dieser Lauf
const nur = process.env.MOBIL_TOUCH_NUR
if (!nur || nur === 'ipad-hoch') await lauf('ipad-hoch', 1024, 1366)
if (!nur || nur === 'ipad-quer') await lauf('ipad-quer', 1366, 1024)
if (!nur || nur === 'iphone') await lauf('iphone', 390, 844)
if (!nur || nur === 'webkit') await webkitLauf('webkit-ipad', 1180, 820)
if (!nur || nur === 'pc') await pcLauf()
server.close()

if (probleme.length) {
  console.log(`\n${probleme.length} Problem(e):\n - ${probleme.join('\n - ')}`)
  process.exit(1)
}
console.log('\nBedienung mit dem Finger: alles in Ordnung.')
