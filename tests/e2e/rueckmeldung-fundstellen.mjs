// Wache FUNDSTELLEN DER RÜCKMELDUNG – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/rueckmeldung-fundstellen.mjs [Ausgabeordner]
//
// Befund der Lehrkraft (23.10.2026): Erwartungshorizont und Bewertungstabelle der Rückmeldung blieben
// allgemein; Zeilenangaben müssen aus dem Material stammen, wie die Lernenden es bekommen. Geprüft:
// Die Rückmeldung liest ein gespeichertes Arbeitsblatt frisch und setzt es unsichtbar – ihre „Z. n:“-
// Zeilen stimmen mit den Zeilennummern überein, die das Blatt im Editor zeigt (über zwei Seiten). Dabei
// fiel auf: Absätze, die mit „12." beginnen (Listen), ließen die gedruckten Nummern wandern (ws.css).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/rueckmeldung-fundstellen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-fundstellen-'))
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const wort = (s) => (s ?? '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setSize(1600, 1050)
    win?.center()
  })
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)

  // Langes Material mit Zeilennummern über zwei Seiten – im Editor und gespeichert
  await page.evaluate(async () => {
    const ws = window.__selftest.fussnotenBlatt('endnoten')
    delete ws.meta.anmerkungen
    window.__selftest.setWorksheet(ws)
    await window.api.sheets.save({ id: 'fund-probe', name: 'Fundstellen-Probe', stats: { sheetCount: 1 }, payload: ws })
  })
  await page.waitForFunction(() => document.querySelectorAll('.ws-text-numbered .ws-line-numbers small').length >= 4, null, { timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(out, 'editor.png') })

  // Gezeigt: zu jeder Zeilennummer das erste Wort der Zeile daneben
  const gezeigt = await page.evaluate(async () => {
    const aus = {}
    for (const block of document.querySelectorAll('.ws-text-numbered')) {
      if (!block.getClientRects().length) continue
      const body = block.querySelector('.ws-text-body')
      const zeile = parseFloat(getComputedStyle(body).lineHeight) || 24
      const links = body.querySelector('[data-absatz]')?.getBoundingClientRect().left ?? body.getBoundingClientRect().left
      for (const span of block.querySelectorAll('.ws-line-numbers span')) {
        const n = Number(span.textContent.trim())
        // Nur Sichtbares lässt sich abtasten
        span.scrollIntoView({ block: 'center' })
        await new Promise((ok) => setTimeout(ok, 120))
        const y = span.getBoundingClientRect().top + zeile / 2
        const r = document.caretRangeFromPoint(links + 2, y)
        if (!r || r.startContainer.nodeType !== 3) continue
        const t = r.startContainer.textContent
        let a = r.startOffset
        while (a > 0 && !/\s/.test(t[a - 1])) a--
        // Ab der Stelle, an der die Zeile beginnt (bei getrennten Wörtern der Rest nach dem Trennstrich)
        const vorne = r.startOffset > a && /[­-]/.test(t.slice(a, r.startOffset)) ? t.slice(a, r.startOffset).replace(/^.*[­-]/, '') + t.slice(r.startOffset) : t.slice(a)
        aus[n] = vorne.replace(/­/g, '').trim().split(/\s+/)[0]
      }
    }
    return aus
  })
  await page.locator('.ws-line-numbers span').filter({ hasText: '15' }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'zeile15.png') })
  const summe = await page.evaluate(() => {
    let n = 0
    // Nur der Schülerteil – der Lösungsteil zählt dasselbe Material noch einmal
    for (const [k, plaene] of window.__selftest.layouts?.entries?.() ?? []) if (k.endsWith(':print')) for (const s of plaene) for (const it of s.items ?? []) if (it.id === 'fn-material') n += it.lineCount ?? 0
    return n
  })

  // Gelesen: die Rückmeldung holt das Material frisch und misst es selbst
  const text = await page.evaluate(() => window.__selftest.rmFundstellen('arbeitsblatt', 'fund-probe'))
  writeFileSync(join(out, 'fundstellen.txt'), text)
  const zeilen = Object.fromEntries([...text.matchAll(/^Z\. (\d+): (.*)$/gm)].map((m) => [Number(m[1]), m[2]]))
  const anzahl = Object.keys(zeilen).length
  pruefe(/M1 Text .* MIT ZEILENNUMMERN/.test(text), 'Das Material steht mit Materialnummer und Zeilennummern im Text für die KI')
  pruefe(text.includes('Erkläre') && text.includes('M1'), 'Die Aufgabe steht dabei')
  pruefe(anzahl > 20 && anzahl === summe, `So viele Zeilen wie im Editor gezählt (${anzahl} gelesen, ${summe} gesetzt)`)
  const nummern = Object.keys(gezeigt).map(Number)
  pruefe(nummern.length >= 4 && nummern.some((n) => n > 25), `Zeilennummern auf mehreren Seiten gezeigt (${nummern.join(', ')})`)
  const abweichend = nummern.filter((n) => wort(zeilen[n]?.split(/\s+/)[0]) !== wort(gezeigt[n]))
  pruefe(
    abweichend.length === 0,
    `Jede gezeigte Zeilennummer beginnt mit demselben Wort wie die gelesene Zeile${abweichend.length ? ` (abweichend: ${abweichend.map((n) => `${n}: „${gezeigt[n]}“ ≠ „${zeilen[n]}“`).join('; ')})` : ''}`
  )
  pruefe(!/\[\^f/.test(text) && !/^Z\. \d+: \d+$/m.test(text), 'Keine Fußnotenmarken oder einzelne hochgestellte Ziffern als eigene Zeile')

  // Gelöschtes Material: kein Fehler, nur kein frischer Text
  const weg = await page.evaluate(() => window.__selftest.rmFundstellen('arbeitsblatt', 'gibt-es-nicht'))
  pruefe(weg === '', 'Fehlt das Material, bleibt es beim hinterlegten Text (kein Abbruch)')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
