// Wache: Bausteine werden an natürlichen Stellen geteilt – weniger Seiten, ohne dass eine Aufgabenstellung allein am Seitenende steht.
// OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/seiten-sparen.mjs [Ausgabeordner] [Vergleichsbericht.json, Standard: seiten-sparen-vorher.json]
//
// Wunsch der Lehrkraft (01.10.2026): „Es tritt das Problem auf, dass die Bausteine von Seitenumbrüchen
// betroffen sind, wenn sie nicht vollständig auf die Seite passen. Dadurch benötigt man im Druck deutlich
// mehr Seiten als vom Inhalt eigentlich notwendig wären … Beachte dabei, dass die Aufgabenstellung nicht
// einzeln vom Rest der Aufgabe getrennt werden sollte."
//
// Je Stress-Blatt (selftestSeitenrand.ts) und Fassung (Schülerblatt, Lösungen) wird im Messbereich der App
// gelesen:
//   – SEITEN: so viele Fluss-Seiten hat der Umbruch gesetzt (ohne Hilfsblatt/Hilfekarten/Nachweise).
//   – UNTERGRENZE: so viele Seiten bräuchte der Inhalt, wenn man ihn beliebig zerschneiden dürfte
//     (Summe der gemessenen Bausteinhöhen ÷ Satzspiegel). Weniger geht nicht.
//   – ALLEIN: Endet eine Seite mit dem ersten Stück eines geteilten Bausteins, muss darin mindestens eine
//     Einheit Inhalt stehen, und die letzte Einheit darf nicht an die folgende gebunden sein
//     (`data-bindet`: Aufgabenstellung, Kopf einer Teilaufgabe, gelöstes Beispiel, Vorgaben einer
//     Schreibaufgabe).
// Mit einem Vergleichsbericht (Ausgabe eines früheren Laufs) wird zusätzlich geprüft, dass kein Blatt mehr
// Seiten braucht als vorher und alle zusammen weniger. Bilder der Seitenübergänge landen im Ausgabeordner.
//
// SCHULAPPS_ELECTRON=<Pfad>: eigene Electron-Kopie (siehe seitenrand.mjs).
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seiten-sparen')
// Ohne Angabe: der Stand VOR dem Teilen an natürlichen Stellen (gemessen am 01.10.2026)
const vergleichsDatei = process.argv[3] ?? new URL('./seiten-sparen-vorher.json', import.meta.url)
const vergleich = existsSync(vergleichsDatei) ? JSON.parse(readFileSync(vergleichsDatei, 'utf8')) : null
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-seiten-sparen-'))
const problems = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}

/** Messung im Messbereich (`.ws-measure`) – die Seitenpläne sind dort wirklich gesetzt (`data-pruefung`) */
const MESSUNG = (schluessel) => {
  const lay = document.querySelector(`.ws-measure [data-layout="${schluessel}"]`)
  if (!lay) return null
  const pruefung = lay.querySelector('[data-pruefung]')
  if (!pruefung) return null
  const rahmen = [...lay.querySelectorAll('.ws-page')].filter((p) => !p.closest('[data-pruefung]') && p.querySelector('.ws-body'))
  const platz = (p) => {
    const body = p?.querySelector('.ws-body')
    if (!body) return 1000
    return body.getBoundingClientRect().height - (parseFloat(getComputedStyle(body).paddingTop) || 0)
  }
  const erste = platz(rahmen[0])
  const weitere = platz(rahmen[1])
  const summe = [...lay.querySelectorAll('[data-measure-block]')]
    .filter((b) => !b.closest('[data-pruefung]'))
    .reduce((a, b) => a + b.getBoundingClientRect().height, 0)
  const untergrenze = summe <= erste ? 1 : 1 + Math.ceil((summe - erste) / weitere - 1e-6)
  const seiten = [...pruefung.querySelectorAll('.ws-page')]
  const fluss = seiten.filter((s) => s.querySelector('.ws-flow'))
  const allein = []
  let geteilt = 0
  fluss.forEach((s, i) => {
    const naechste = fluss[i + 1]
    if (!naechste) return
    const letzte = [...s.querySelectorAll('.ws-flow')].pop()
    const erstes = naechste.querySelector('.ws-flow')
    if (!letzte || !erstes || !erstes.querySelector('.ws-continued')) return
    geteilt++
    const einheiten = [...letzte.querySelectorAll('[data-unit]')]
    const text = (letzte.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!einheiten.length) allein.push(`S.${i + 1}: Stück ohne Inhalt „${text}"`)
    else if (einheiten[einheiten.length - 1].hasAttribute('data-bindet')) allein.push(`S.${i + 1}: endet mit gebundener Einheit „${text}"`)
  })
  return {
    seiten: fluss.length,
    alle: seiten.length,
    untergrenze,
    geteilt,
    allein,
    fuellung: Math.round((summe / (erste + weitere * Math.max(0, fluss.length - 1))) * 100)
  }
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' },
  ...(process.env.SCHULAPPS_ELECTRON ? { executablePath: process.env.SCHULAPPS_ELECTRON } : {})
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.setSize(1600, 1050)
  win?.center()
})
await warteAufOberflaeche(page)

/** Warten, bis Umbruch und Prüfung nach dem Setzen zur Ruhe gekommen sind */
async function warteRuhe(schluessel) {
  let vorher = ''
  let gleich = 0
  for (let i = 0; i < 60 && gleich < 3; i++) {
    await page.waitForTimeout(300)
    const m = JSON.stringify(await page.evaluate(MESSUNG, schluessel))
    gleich = m !== 'null' && m === vorher ? gleich + 1 : 0
    vorher = m
  }
  return JSON.parse(vorher)
}

const datei = (name) => name.replace(/[^\w-]+/g, '_')

/** Bilder der Seitenübergänge in der Ansicht: unteres Drittel der Seite i und oberes Drittel der Seite i+1 */
async function uebergaengeAblichten(name, hoechstens) {
  const n = await page.evaluate(
    () => [...document.querySelectorAll('.ws-page')].filter((x) => !x.closest('.ws-measure') && x.getBoundingClientRect().height > 0).length
  )
  const bilder = []
  for (let i = 0; i < Math.min(n - 1, hoechstens); i++) {
    const box = await page.evaluate((k) => {
      const seiten = [...document.querySelectorAll('.ws-page')].filter((x) => !x.closest('.ws-measure') && x.getBoundingClientRect().height > 0)
      seiten[k].scrollIntoView({ block: 'end' })
      window.scrollBy(0, 0)
      const a = seiten[k].getBoundingClientRect()
      return { h: a.height }
    }, i)
    await page.waitForTimeout(250)
    const lage = await page.evaluate((k) => {
      const seiten = [...document.querySelectorAll('.ws-page')].filter((x) => !x.closest('.ws-measure') && x.getBoundingClientRect().height > 0)
      const a = seiten[k].getBoundingClientRect()
      // Den Übergang mittig ins Fenster holen
      const mitte = a.bottom - window.innerHeight / 2
      let el = seiten[k].parentElement
      while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement
      if (el) el.scrollTop += mitte
      else window.scrollBy(0, mitte)
      const b = seiten[k].getBoundingClientRect()
      return { x: b.left, y: b.bottom, w: b.width }
    }, i)
    await page.waitForTimeout(250)
    const hoehe = Math.min(900, box.h * 0.66)
    const pfad = join(out, `${datei(name)}-uebergang-${i + 1}-${i + 2}.png`)
    await page
      .screenshot({ path: pfad, clip: { x: Math.max(0, lage.x), y: Math.max(0, lage.y - hoehe / 2), width: lage.w, height: hoehe } })
      .catch(() => undefined)
    bilder.push(pfad)
  }
  return bilder
}

const bericht = { erstellt: new Date().toISOString(), blaetter: {} }

try {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  const ARTEN = [
    ['teilbar', 1, 0],
    ['teilbar', 2, 1],
    ['teilbar', 3, 2],
    ['tabellen', 1, 0],
    ['knapp', 1, 1],
    ['raender', 1, 2],
    ['protokoll', 1, 3],
    ['gemischt', 11, 0],
    ['gemischt', 23, 1],
    ['gemischt', 37, 4],
    ['gemischt', 51, 7]
  ]
  for (const [art, seed, design] of ARTEN) {
    const name = `${art} ${seed} (Design ${design})`
    await page.evaluate(([a, s, d]) => window.__selftest.wsSeitenrand(a, s, d), [art, seed, design])
    for (const fassung of ['print', 'key']) {
      const m = await warteRuhe(`s1:${fassung}`)
      if (!m) {
        pruefe(false, `${name} ${fassung}: keine Messung`)
        continue
      }
      const k = `${name} ${fassung === 'key' ? 'Lösungen' : 'Schülerblatt'}`
      bericht.blaetter[k] = m
      const alt = vergleich?.blaetter?.[k]
      pruefe(
        m.allein.length === 0,
        `${k}: ${m.seiten} Seiten (Untergrenze ${m.untergrenze}, Füllung ${m.fuellung} %, ${m.geteilt} Übergänge geteilt)${
          alt ? ` – vorher ${alt.seiten}` : ''
        }${m.allein.length ? ` → ${m.allein.join(' ; ')}` : ''}`
      )
      if (alt) pruefe(m.seiten <= alt.seiten, `${k}: nicht mehr Seiten als vorher (${alt.seiten} → ${m.seiten})`)
    }
    if (art === 'teilbar' && seed === 1) bericht.bilder = await uebergaengeAblichten(name, 12)
  }
  const summe = (b) => Object.values(b).reduce((a, m) => a + m.seiten, 0)
  const unten = Object.values(bericht.blaetter).reduce((a, m) => a + m.untergrenze, 0)
  bericht.summe = summe(bericht.blaetter)
  bericht.untergrenze = unten
  console.log(`\nSeiten gesamt: ${bericht.summe} (Untergrenze ${unten})${vergleich ? `, vorher ${vergleich.summe}` : ''}`)
  if (vergleich) pruefe(bericht.summe < vergleich.summe, `Alle Blätter zusammen brauchen weniger Seiten: ${vergleich.summe} → ${bericht.summe}`)
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  writeFileSync(join(out, 'bericht.json'), JSON.stringify(bericht, null, 2), 'utf8')
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log(`\nBericht: ${join(out, 'bericht.json')}`)
