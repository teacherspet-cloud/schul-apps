// Wache für das ZIEHEN von Bausteinen – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/ziehen.mjs <Ausgabeordner>
//
// Gewünscht von der Lehrkraft (24.09.2026): „es soll überall von hand gehen (drag and drop).
// denk an sinnvolle touch steuerungen fürs tablet, wenn browser verwendet werden".
//
// Geprüft wird, was man nicht sieht, wenn man nur ein Bild anschaut:
//   – der Baustein landet WIRKLICH dort, wo der Zeiger losgelassen wurde
//   – er verlässt den automatischen Satz, der Rest bricht weiter um
//   – „wieder einreihen" holt ihn zurück
//   – langes Drücken zieht ebenfalls, aber NICHT in Textfeldern und nicht beim Wischen
//   – auf dem Tablet sind die Knöpfe fingerbreit
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ziehen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-ziehen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsAnordnung('tabelle', 'left'))
await page.waitForTimeout(2500)

/** Lage eines Bausteins und Anzahl der gesetzten Seiten. */
const lage = async () =>
  page.evaluate(() => {
    const frei = document.querySelector('.ws-free')
    const r = frei?.getBoundingClientRect()
    const body = frei?.closest('.ws-body')?.getBoundingClientRect()
    return {
      freiDa: Boolean(frei),
      x: r && body ? Math.round(((r.left - body.left) / body.width) * 100) : -1,
      y: r && body ? Math.round(((r.top - body.top) / body.height) * 100) : -1,
      // Die Tabelle steht nicht mehr neben der Aufgabe, sobald sie frei liegt
      daneben: document.querySelectorAll('.ws-page:not(.ws-measure *) .ws-side-image').length,
      seiten: [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0).length
    }
  })

const vorher = await lage()
pruefe(!vorher.freiDa, 'Vorher liegt kein Baustein frei')
pruefe(vorher.daneben === 1, `Vorher steht die Tabelle neben der Aufgabe (${vorher.daneben})`)

// ---------------------------------------------------------------- Ziehen mit dem Griff
/*
 * Gezogen wird die TABELLE, die neben der Aufgabe steht – nicht die Aufgabe selbst.
 * Ein Baustein über die volle Blattbreite kann sich ohnehin nur senkrecht bewegen; an ihm
 * würde die Prüfung der waagerechten Lage nichts aussagen.
 *
 * In ZWEI Zügen, wie in Wirklichkeit auch: Der erste kurze Zug nimmt den Baustein aus dem
 * Fluss, wodurch sich das Blatt neu setzt. Erst danach steht fest, wo die Seite liegt –
 * ein in einem Rutsch berechneter Zielpunkt zielte auf die alte Lage.
 */
const griff = page.locator('.ws-side-image [aria-label="Baustein verschieben"]').first()
await griff.scrollIntoViewIfNeeded()
/*
 * Erst den Baustein überfahren: Seit 01.10.2026 rückt die Leiste beim Einblenden an ihren Platz
 * (shared/touch/leistenLage.ts). Vorher gelesen, lag der Knopf noch an der alten Stelle – der
 * Druck traf den Tabellenkopf darunter (gefunden 02.10.2026, auch schon im Stand 0.4.14).
 */
await page.locator('.ws-side-image .editor-block').first().hover()
await page.waitForTimeout(300)
const g = await griff.boundingBox()
if (!g) throw new Error('Der Anfassknopf der Tabelle ist nicht zu finden')

await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
await page.mouse.down()
await page.mouse.move(g.x + g.width / 2 + 20, g.y + g.height / 2 + 20, { steps: 4 })
await page.waitForTimeout(400)

// Jetzt erst den Zielpunkt bestimmen – und nur dorthin, wo wirklich Blatt zu sehen ist
const ziel = await page.evaluate(() => {
  const seite = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)[0]
  const r = seite.getBoundingClientRect()
  const unten = Math.min(r.bottom - 40, window.innerHeight - 40)
  return { x: r.left + r.width * 0.45, y: Math.max(r.top + 60, unten - 120) }
})
await page.mouse.move(ziel.x, ziel.y, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(900)

const danach = await lage()
console.log(`Nach dem Ziehen: frei=${danach.freiDa} bei x=${danach.x}% y=${danach.y}%`)
pruefe(danach.freiDa, 'Der Baustein liegt jetzt frei auf der Seite')
/*
 * Der eigentliche Punkt: Er liegt DORT, wo losgelassen wurde. Eine Umsetzung, die nur
 * „irgendwohin" schiebt, bestünde die Prüfung „liegt frei" ebenfalls.
 */
pruefe(danach.x > 25 && danach.x < 70, `Er liegt waagerecht dort, wo losgelassen wurde (${danach.x} %, erwartet 25–70)`)
pruefe(danach.y > 20, `Er liegt senkrecht dort, wo losgelassen wurde (${danach.y} %, erwartet über 20)`)
// Aus dem Fluss genommen: Er steht nicht mehr neben der Aufgabe
pruefe(danach.daneben === 0, `Er steht nicht mehr im Fluss neben der Aufgabe (${danach.daneben})`)
await page.screenshot({ path: join(out, '1-gezogen.png') })

// ---------------------------------------------------------------- Wieder einreihen
await page.locator('[aria-label="Wieder einreihen"]').first().click()
await page.waitForTimeout(900)
const zurueck = await lage()
pruefe(!zurueck.freiDa, 'Nach „wieder einreihen" liegt nichts mehr frei')
pruefe(zurueck.daneben === 1, `Die Tabelle steht wieder neben der Aufgabe (${zurueck.daneben})`)

// ---------------------------------------------------------------- Langes Drücken
/*
 * Der zweite Weg fürs Tablet. Zwei Dinge müssen stimmen: Es zieht – aber NICHT, wenn der
 * Finger auf einem Textfeld oder einem Knopf liegt. Sonst ließe sich nichts mehr schreiben.
 */
const aufgabe = page.locator('.editor-block').filter({ hasText: 'Describe' }).last()
const ab = await aufgabe.boundingBox()
// Weit unten im Baustein: dort stehen Schreiblinien, kein Text und keine Knöpfe
const druckX = ab.x + ab.width * 0.3
// Der Baustein reicht mit den aufgefüllten Linien über das Fenster hinaus – außerhalb
// findet die Treffersuche nichts, und das lange Drücken liefe ins Leere.
const sichtbar = await page.evaluate(() => window.innerHeight)
const druckY = Math.min(ab.y + ab.height - 40, sichtbar - 60)
await page.mouse.move(druckX, druckY)
await page.mouse.down()
await page.waitForTimeout(650)
await page.mouse.move(druckX + 40, druckY - 150, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(800)
const langDruck = await lage()
pruefe(langDruck.freiDa, 'Langes Drücken auf den Baustein zieht ihn ebenfalls')
if (langDruck.freiDa) {
  await page.locator('[aria-label="Wieder einreihen"]').first().click()
  await page.waitForTimeout(700)
}

/*
 * WISCHEN darf nicht ziehen: Wer mit dem Finger über das Blatt fährt, will rollen.
 * Deshalb bricht das lange Drücken ab, sobald der Finger vorher mehr als acht Punkte wandert.
 */
await page.mouse.move(druckX, druckY)
await page.mouse.down()
await page.mouse.move(druckX, druckY - 60, { steps: 4 })
await page.waitForTimeout(650)
await page.mouse.move(druckX, druckY - 200, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(700)
pruefe(!(await lage()).freiDa, 'Wischen über den Baustein zieht NICHT – es rollt')

/*
 * KLICKEN IN EINEN TEXT DARF NICHT VERSCHIEBEN.
 *
 * Gemeldet am 25.09.2026: „Ich habe im Menü ‚Bearbeiten & Export' in ein Textfeld geklickt
 * (ohne etwas zu ändern darin)" – danach stand das ganze Blatt auf EINER Seite übereinander.
 *
 * Zwei Fehler trafen zusammen: Langes Drücken legte die freie Lage sofort an, ohne dass sich
 * der Zeiger bewegt hatte, und die Sicherung für Textfelder griff bei formatiertem Text
 * nicht, weil der im Ruhezustand kein `contenteditable` trägt. Ein frei gelegter Baustein
 * wird aus der Seitenberechnung genommen – er hat danach keine gemessene Höhe mehr.
 *
 * Geprüft wird mit einem langen Materialtext, denn nur dort fällt der Schaden auf.
 */
await page.evaluate(() => window.__selftest.wsMaterialtext(24))
await page.waitForTimeout(2500)

const textLage = async () =>
  page.evaluate(() => {
    const seiten = [...document.querySelectorAll('.ws-editor-pages .ws-page')]
    return {
      frei: document.querySelectorAll('.ws-free').length,
      seiten: seiten.length,
      ueberstand: Math.max(
        0,
        ...seiten.map((p) => {
          const r = p.querySelector('.ws-content')
          if (!r) return 0
          const unten = r.getBoundingClientRect().bottom
          const teile = [...r.querySelectorAll('.ws-paragraph, .ws-block')]
          // Zeilenweise geteilter Absatz (02.10.2026): nur der sichtbare Teil im Rahmen zählt
          const sichtbarUnten = (t) => {
            const s = t.closest('.ws-zeilen-schnitt')
            return s ? Math.min(t.getBoundingClientRect().bottom, s.getBoundingClientRect().bottom) : t.getBoundingClientRect().bottom
          }
          return Math.round(Math.max(0, ...teile.map(sichtbarUnten)) - unten)
        })
      )
    }
  })

const vorKlick = await textLage()
pruefe(vorKlick.seiten > 1 && vorKlick.frei === 0, `Der Materialtext steht auf ${vorKlick.seiten} Seiten im Fluss`)

// In den Text klicken und dabei deutlich länger halten als die 400 ms des langen Drückens
const absatz = page.locator('.ws-editor-pages .ws-text .ws-paragraph').first()
const kasten = await absatz.boundingBox()
await page.mouse.move(kasten.x + kasten.width / 2, kasten.y + 10)
await page.mouse.down()
await page.waitForTimeout(900)
await page.mouse.up()
await page.waitForTimeout(2000)

const nachKlick = await textLage()
console.log(`nach dem Halten im Text: frei=${nachKlick.frei} · ${nachKlick.seiten} Seiten · Überstand ${nachKlick.ueberstand}`)
pruefe(nachKlick.frei === 0, 'Gedrückthalten im Text legt den Baustein NICHT frei')
pruefe(nachKlick.seiten === vorKlick.seiten, `Die Seitenaufteilung bleibt (${nachKlick.seiten} statt ${vorKlick.seiten})`)
pruefe(nachKlick.ueberstand <= 2, `Nichts läuft aus der Seite heraus (${nachKlick.ueberstand} px)`)

// ---------------------------------------------------------------- Fingergrößen
const fingerbreit = await page.evaluate(() => {
  // Wie auf einem Tablet: grober Zeiger
  const knopf = document.querySelector('[aria-label="Baustein verschieben"]')
  if (!knopf) return { breite: 0, touchAction: '' }
  const cs = getComputedStyle(knopf)
  return { breite: Math.round(knopf.getBoundingClientRect().width), touchAction: cs.touchAction }
})
/*
 * `touch-action: none` ist der Unterschied zwischen „lässt sich ziehen" und „rollt die
 * Seite weg". Es steht bewusst NUR auf dem Griff.
 */
pruefe(fingerbreit.touchAction === 'none', `Der Griff fängt die Wischgeste ab (touch-action: ${fingerbreit.touchAction})`)

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nBausteine lassen sich von Hand ziehen und wieder einreihen. Bilder in ${out}`)
