// Wache: Kein Baustein ragt oben oder unten über den Satzspiegel – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/seitenrand.mjs [Ausgabeordner] [nur=arbeitsblatt,klassenarbeit,lernzielkontrolle,grammatiktest,vokabeltest]
//
// Befund der Lehrkraft (30.09.2026): „Stell noch einmal sicher, dass Bausteine nach unten/oben
// nicht über den sichtbaren Bereich der DIN-A4-Seiten hinausragen. Auf einem Arbeitsblatt war
// z. B. die letzte Zeile einer Tabelle nur halb sichtbar."
//
// Geprüft wird für JEDES Programm mit Blättern an Stress-Blättern (lange Tabellen mit
// mehrzeiligen Zellen, Bausteine knapp am Seitenende, Bilder, Formeln, Protokolle, Lückentexte,
// Notiz-/Korrekturrand, Deckblatt, gemischte Zufallsblätter; im Vokabeltest aufgeblähte Tests):
//   – ANSICHT: Jedes sichtbare Element jeder Seite liegt innerhalb der Inhaltsfläche (`.ws-body`
//     bzw. der Satzspiegel des Vokabeltests), gemessen mit getBoundingClientRect – Schülerblatt
//     und Lösungen.
//   – DRUCK/PDF: Dasselbe im Druck-HTML, das die Ansicht selbst baut (`__selftest.druckHtmlJetzt`),
//     in einem eigenen Fenster mit Druckmedien gesetzt; das PDF (printToPDF) hat genau so viele
//     Seiten wie das Druck-HTML und wie Schülerblatt + Lösungen in der Ansicht.
// Rückmeldung (bl-seite) und Elternbrief (fließender Brief) haben eigene Wachen bzw. keinen
// festen Seitenrahmen und sind hier nicht dabei.
//
// SCHULAPPS_ELECTRON=<Pfad>: eigene Electron-Kopie mit anderem Programmnamen – laufen parallel
// Wachen, die vorher alle „electron.exe" beenden, bleibt diese Wache davon unberührt.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/seitenrand')
const nur = (process.argv[3] ?? '').split(',').filter(Boolean)
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-seitenrand-'))
const problems = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}
const laeuft = (programm) => !nur.length || nur.includes(programm)

/*
 * Die Messung – als Quelltext, damit sie im App-Fenster UND im Druckfenster (ohne Playwright)
 * dieselbe ist. Je Seite: alle sichtbaren Elemente der Inhaltsfläche, beschnitten durch Vorfahren
 * mit `overflow` ≠ visible (was dort abgeschnitten wird, ist schon am Vorfahren sichtbar).
 * Ohne Flächen-Selektor gilt der Satzspiegel aus den Innenabständen einer 297 mm hohen Seite
 * (Vokabeltest) – im Editor wächst die Seite mit, der Rand bleibt trotzdem bei 297 mm.
 * Ausgenommen: Werkzeuge des Editors, frei gezogene Bausteine, Seitenzahl/Figur im Rand.
 */
const MESSUNG = `(function (seitenSel, flaecheSel) {
  const seiten = [...document.querySelectorAll(seitenSel)].filter((s) => !s.closest('.ws-measure, .vt-measure, [aria-hidden="true"]') && !s.parentElement.closest(seitenSel) && s.getBoundingClientRect().height > 0)
  const aus = []
  const AUSNAHMEN = '.editor-block-toolbar, .ws-free, .editor-block-frei, .ws-zeilen-griff, .ws-spalten-griff, .editor-ai-revise-slot, .vt-page-number, .vt-illu, [data-seitenrand-ignorieren]'
  seiten.forEach((seite, nr) => {
    const s = seite.getBoundingClientRect()
    const mmPx = s.width / 210
    let f
    let wurzel = seite
    if (flaecheSel) {
      wurzel = seite.querySelector(flaecheSel)
      if (!wurzel) return
      f = wurzel.getBoundingClientRect()
    } else {
      const st = getComputedStyle(seite)
      const skala = s.width / seite.offsetWidth
      f = { top: s.top + parseFloat(st.paddingTop) * skala, bottom: s.top + 297 * mmPx - parseFloat(st.paddingBottom) * skala }
    }
    const tol = Math.max(1, mmPx * 0.3)
    const funde = []
    const lauf = (el, clipOben, clipUnten) => {
      for (const kind of el.children) {
        if (kind.matches(AUSNAHMEN)) continue
        const st = getComputedStyle(kind)
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue
        const r = kind.getBoundingClientRect()
        const oben = Math.max(r.top, clipOben)
        const unten = Math.min(r.bottom, clipUnten)
        const sichtbar = r.width > 0.5 && r.height > 0.5 && unten > oben
        if (sichtbar && (unten > f.bottom + tol || oben < f.top - tol)) {
          const text = (kind.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50)
          const klasse = typeof kind.className === 'string' ? kind.className : (kind.className && kind.className.baseVal) || ''
          funde.push({ el: (kind.tagName + '.' + klasse.trim().replace(/\\s+/g, '.')).slice(0, 70), unten: Math.round(((unten - f.bottom) / mmPx) * 10) / 10, oben: Math.round(((f.top - oben) / mmPx) * 10) / 10, text })
        }
        // In SVG nicht hineinsehen: Pfade einer Formel sind kein eigener Baustein
        if (kind instanceof SVGElement) continue
        const beschnitten = st.overflowY !== 'visible'
        lauf(kind, beschnitten ? Math.max(clipOben, r.top) : clipOben, beschnitten ? Math.min(clipUnten, r.bottom) : clipUnten)
      }
    }
    lauf(wurzel, -Infinity, Infinity)
    if (funde.length) aus.push({ seite: nr + 1, anzahl: funde.length, funde: funde.sort((a, b) => Math.max(b.unten, b.oben) - Math.max(a.unten, a.oben)).slice(0, 4) })
  })
  return { seiten: seiten.length, ueberlauf: aus }
})`

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

const beschreibe = (u) =>
  u
    .map((s) => `S.${s.seite}: ${s.funde.map((x) => `${x.el} ${x.unten > 0 ? `+${x.unten} mm unten` : `+${x.oben} mm oben`} „${x.text}"`).join(' | ')}`)
    .join(' ; ')

const sichtbareSeiten = (seitenSel) =>
  page.evaluate(
    (s) => [...document.querySelectorAll(s)].filter((x) => !x.closest('.ws-measure, .vt-measure') && !x.parentElement.closest(s) && x.getBoundingClientRect().height > 0).length,
    seitenSel
  )

/** Warten, bis die Seitenaufteilung steht (dreimal hintereinander dieselbe Seitenzahl) */
async function warteSeiten(seitenSel) {
  let vorher = -1
  let gleich = 0
  for (let i = 0; i < 40 && gleich < 2; i++) {
    await page.waitForTimeout(350)
    const n = await sichtbareSeiten(seitenSel)
    gleich = n > 0 && n === vorher ? gleich + 1 : 0
    vorher = n
  }
  return vorher
}

async function ansichtPruefen(name, seitenSel, flaecheSel) {
  const n = await warteSeiten(seitenSel)
  const m = await page.evaluate(([mess, s, f]) => eval(mess)(s, f), [MESSUNG, seitenSel, flaecheSel])
  pruefe(m.ueberlauf.length === 0, `${name} – Ansicht: ${n} Seiten, nichts ragt über den Satzspiegel${m.ueberlauf.length ? ` → ${beschreibe(m.ueberlauf)}` : ''}`)
  if (m.ueberlauf.length) {
    await page.evaluate(
      ([s, nr]) =>
        [...document.querySelectorAll(s)]
          .filter((x) => !x.closest('.ws-measure, .vt-measure') && !x.parentElement.closest(s) && x.getBoundingClientRect().height > 0)
          [nr - 1]?.scrollIntoView({ block: 'end' }),
      [seitenSel, m.ueberlauf[0].seite]
    )
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, `${datei(name)}-ansicht.png`) })
  }
  return n
}

const datei = (name) => name.replace(/[^\w-]+/g, '_')

/** Druck-HTML der Ansicht in einem unsichtbaren Fenster mit Druckmedien messen und als PDF ausgeben */
async function druckPruefen(name, seitenSel, flaecheSel) {
  const html = await page.evaluate(() => window.__selftest.druckHtmlJetzt())
  const pfad = join(userData, `${datei(name)}.html`)
  writeFileSync(pfad, html, 'utf8')
  const erg = await app.evaluate(
    async ({ BrowserWindow }, [p, messung, s, f]) => {
      const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true } })
      try {
        await win.loadFile(p)
        win.webContents.debugger.attach('1.3')
        await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
        const druck = await win.webContents.executeJavaScript(`${messung}(${JSON.stringify(s)}, ${JSON.stringify(f)})`)
        win.webContents.debugger.detach()
        const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
        return { druck, pdf: pdf.toString('base64') }
      } finally {
        win.destroy()
      }
    },
    [pfad, MESSUNG, seitenSel, flaecheSel]
  )
  const pdf = Buffer.from(erg.pdf, 'base64')
  writeFileSync(join(out, `${datei(name)}.pdf`), pdf)
  const pdfSeiten = (await PDFDocument.load(pdf)).getPageCount()
  const d = erg.druck
  pruefe(d.ueberlauf.length === 0, `${name} – Druck: ${d.seiten} Seiten, nichts ragt über den Satzspiegel${d.ueberlauf.length ? ` → ${beschreibe(d.ueberlauf)}` : ''}`)
  pruefe(pdfSeiten === d.seiten, `${name} – PDF hat ${pdfSeiten} Seiten wie das Druck-HTML (${d.seiten})`)
  return { ...d, pdfSeiten }
}

/** Ansicht im Umschalter der Editorleiste wählen (Arbeitsblatt / Lösungen …) */
async function ansichtWaehlen(name) {
  await page.locator('.mantine-SegmentedControl-root').filter({ visible: true, hasText: 'Lösungen' }).first().getByText(name, { exact: true }).click()
  await page.waitForTimeout(300)
}

/** Schülerblatt + Lösungen in der Ansicht, dann Druck; Seitenzahlen müssen zusammenpassen */
async function blattPruefen(name, mitLoesungsansicht) {
  const schueler = await ansichtPruefen(name, '.ws-page', '.ws-body')
  let loesung = 0
  if (mitLoesungsansicht) {
    await ansichtWaehlen('Lösungen')
    pruefe((await page.locator('.editor-sheet-key').filter({ visible: true }).count()) > 0, `${name} – Lösungsansicht ist offen`)
    loesung = await ansichtPruefen(`${name} Lösungen`, '.ws-page', '.ws-body')
    await ansichtWaehlen('Arbeitsblatt')
    await warteSeiten('.ws-page')
  }
  const d = await druckPruefen(name, '.ws-page', '.ws-body')
  if (mitLoesungsansicht) pruefe(schueler + loesung === d.seiten, `${name} – Ansicht ${schueler} + ${loesung} Seiten = Druck ${d.seiten} = PDF ${d.pdfSeiten}`)
}

/** Stress-Bausteine für die anderen Programme (eindeutige Kennungen je Teil) */
const stressBloecke = (art, seed, praefix) => page.evaluate(([a, s, p]) => window.__selftest.seitenrandBlatt(a, s, 0, p).sheets[0].blocks, [art, seed, praefix])

try {
  // ------------------------------------------------------------------ Arbeitsblatt
  if (laeuft('arbeitsblatt')) {
    await page.click('[aria-label="Arbeitsblatt"]')
    await page.waitForTimeout(600)
    const ARTEN = [
      ['tabellen', 1, 0],
      ['knapp', 1, 1],
      ['raender', 1, 2],
      ['protokoll', 1, 3],
      // Teilbare Antwortformen, Lernziele, Merkkasten, Selbsteinschätzung … (01.10.2026, seiten-sparen.mjs)
      ['teilbar', 1, 0],
      ['teilbar', 2, 5],
      ['gemischt', 11, 0],
      ['gemischt', 23, 1],
      ['gemischt', 37, 4],
      ['gemischt', 51, 7]
    ]
    for (const [art, seed, design] of ARTEN) {
      const name = `Arbeitsblatt ${art}${art === 'gemischt' ? ` ${seed}` : ''} (Design ${design})`
      await page.evaluate(([a, s, d]) => window.__selftest.wsSeitenrand(a, s, d), [art, seed, design])
      await blattPruefen(name, true)
    }
  }

  // ------------------------------------------------------------------ Klassenarbeit
  if (laeuft('klassenarbeit')) {
    await page.click('[aria-label="Klassenarbeiten"]')
    await page.waitForTimeout(600)
    for (const [art, seed] of [
      ['tabellen', 1],
      ['teilbar', 2],
      ['gemischt', 23]
    ]) {
      const name = `Klassenarbeit ${art}${art === 'gemischt' ? ` ${seed}` : ''}`
      await page.evaluate(() => window.__selftest.exam())
      const teil1 = await stressBloecke(art, seed, 'k1-')
      const teil2 = await stressBloecke('knapp', 1, 'k2-')
      await page.evaluate(
        ([b1, b2]) => {
          const e = structuredClone(window.__selftest.kaJetzt())
          e.parts[0].blocks = b1
          e.parts[1].blocks = b2
          window.__selftest.kaSetzen(e)
        },
        [teil1, teil2]
      )
      await blattPruefen(name, false)
    }
  }

  // ------------------------------------------------------------------ Lernzielkontrolle
  if (laeuft('lernzielkontrolle')) {
    await page.click('[aria-label="Lernzielkontrolle"]')
    await page.waitForTimeout(600)
    for (const [art, seed] of [
      ['tabellen', 1],
      ['teilbar', 3],
      ['gemischt', 37]
    ]) {
      const name = `Lernzielkontrolle ${art}${art === 'gemischt' ? ` ${seed}` : ''}`
      await page.evaluate(() => window.__selftest.lzkSheet('BY', 3))
      const bloecke = await stressBloecke(art, seed, 'l-')
      await page.evaluate((b) => {
        const t = structuredClone(window.__selftest.lzkJetzt())
        t.varianten[0].blocks = b
        window.__selftest.lzkSetzen(t)
      }, bloecke)
      await blattPruefen(name, false)
    }
  }

  // ------------------------------------------------------------------ Grammatiktest
  if (laeuft('grammatiktest')) {
    await page.click('[aria-label="Grammatiktest"]')
    await page.waitForTimeout(600)
    for (const [art, seed] of [
      ['knapp', 1],
      ['gemischt', 51]
    ]) {
      const name = `Grammatiktest ${art}${art === 'gemischt' ? ` ${seed}` : ''}`
      await page.evaluate(() => window.__selftest.grammarTestSheet())
      const bloecke = await stressBloecke(art, seed, 'g-')
      await page.evaluate((b) => {
        const t = structuredClone(window.__selftest.gtJetzt())
        t.blocks = b
        delete t.blocksB
        window.__selftest.gtSetzen(t)
      }, bloecke)
      await blattPruefen(name, false)
    }
  }

  // ------------------------------------------------------------------ Vokabeltest (eigene Seiten)
  if (laeuft('vokabeltest')) {
    await page.click('[aria-label="Vokabeltest"]')
    await page.waitForTimeout(600)
    for (const [basis, faktor] of [
      ['vtMitHinweis', 7],
      ['vtLatein', 5]
    ]) {
      const name = `Vokabeltest ${basis} x${faktor}`
      await page.evaluate(([b]) => (b === 'vtMitHinweis' ? window.__selftest.vtMitHinweis('Seitenrand') : window.__selftest.vtLatein()), [basis])
      await page.waitForTimeout(500)
      await page.evaluate((f) => window.__selftest.vtSeitenrand(f), faktor)
      const n = await ansichtPruefen(name, '.vt-page', '')
      const d = await druckPruefen(name, '.vt-page', '')
      pruefe(d.seiten >= n && n > 1, `${name} – Ansicht ${n} Seiten, Druck ${d.seiten} (mit Lösungen), PDF ${d.pdfSeiten}`)
    }
  }
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
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
console.log(`\nKein Element ragt über den Satzspiegel. Ergebnisse in ${out}`)
