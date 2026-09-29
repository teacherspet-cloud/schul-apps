// Wache für den Baustein VERSUCHSPROTOKOLL (29.09.2026; vorher: npm run build).
// Aufruf: node tests/e2e/versuchsprotokoll.mjs <Ausgabeordner>
//
// Ein Chemie-Blatt mit Protokoll (Chemikalien mit GHS, Schutzmaßnahmen, Skizze, Messtabelle,
// Checkliste): Schülerblatt ohne Muster, Lösungsansicht mit Muster, Raster und Sicherheitsvermerk;
// Baustein-Einstellungen; Karte „Versuch mit Protokoll" im ersten Schritt nur bei Versuchsfächern.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/versuchsprotokoll')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-versuchsprotokoll-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const problems = []
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${String(e).slice(0, 300)}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1100))
await warteAufOberflaeche(page)
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

try {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(1))
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const ws = window.__selftest.worksheetJetzt()
    ws.meta.subjectId = 'chemie'
    ws.meta.subjectLabel = 'Chemie'
    ws.meta.grade = 7
    const a = (id, titel, form, extra = {}) => ({ id, titel, form, ...extra })
    ws.sheets[0].blocks = [
      {
        id: 'prot',
        type: 'protocol',
        title: 'Versuchsprotokoll: Verbrennung von Kerzenwachs',
        art: 'versuch',
        stufe: 'vorstrukturiert',
        stil: 'praesens',
        abschnitte: [
          a('kopf', 'Protokoll', 'kopf'),
          a('frage', 'Fragestellung', 'linien', { vorgabe: 'Was entsteht, wenn eine Kerze brennt?', muster: 'Was entsteht, wenn eine Kerze brennt?' }),
          a('vermutung', 'Vermutung', 'linien', { leitfrage: 'Was wird wahrscheinlich passieren – und warum?', satzanfaenge: ['Vermutlich …, weil …'], zeilen: 2, muster: 'Es entsteht ein Gas.' }),
          a('material', 'Material und Geräte', 'liste', { vorgabe: '- Teelicht\n- Becherglas 250 ml' }),
          a('chemikalien', 'Chemikalien', 'liste'),
          a('sicherheit', 'Gefahren und Schutzmaßnahmen', 'liste'),
          a('aufbau', 'Versuchsaufbau (Skizze)', 'skizze', { hoeheMm: 45, muster: 'Becherglas umgedreht über dem Teelicht' }),
          a('beobachtung', 'Beobachtung', 'linien', { vorgabe: 'Das Glas ___, das Kalkwasser wird ___.', muster: 'Das Glas beschlägt, das Kalkwasser wird trüb.' }),
          a('messwerte', 'Messwerte', 'tabelle', { spalten: ['Zeit t in s', 'Temperatur ϑ in °C'], tabellenZeilen: 3 }),
          a('auswertung', 'Auswertung (Deutung)', 'linien', { zeilen: 3, muster: 'Es entstehen Wasser und Kohlenstoffdioxid.\nWachs + Sauerstoff → Kohlenstoffdioxid + Wasser' })
        ],
        chemikalien: [{ name: 'Kalkwasser', menge: '10 ml', ghs: ['GHS05', 'GHS07'], signalwort: 'Gefahr', hSaetze: 'H318', pSaetze: 'P280' }],
        schutz: ['brille', 'haare'],
        sicherheitZuPruefen: true,
        checkliste: ['Überschrift, Datum und Name stehen oben.', 'Beobachtung und Deutung sind getrennt.'],
        raster: [{ kriterium: 'Beobachtung', erwartung: 'Nur Wahrnehmbares' }]
      },
      ...ws.sheets[0].blocks
    ]
    window.__selftest.setWorksheet(structuredClone(ws))
  })
  await page.waitForTimeout(2500)
  const prot = page.locator('.ws-editor-pages .ws-protokoll').first()
  await prot.waitFor({ timeout: 10000 })
  pruefe(true, 'Das Protokoll steht im Editor')
  pruefe((await page.locator('.ws-editor-pages .ws-protokoll .ws-ghs svg').count()) >= 2, 'GHS-Piktogramme gezeichnet')
  pruefe((await page.locator('.ws-editor-pages .ws-protokoll .ws-protokoll-vorgabe').filter({ hasText: '___' }).count()) === 1, 'Lückentext im Editor bearbeitbar (Lücken als ___)')
  pruefe((await page.locator('.ws-editor-pages .ws-protokoll [data-sicherheit-pruefen]').count()) === 1, 'Im Editor: Sicherheitsangaben als „zu prüfen" markiert')
  pruefe((await page.locator('.ws-editor-pages .ws-protokoll .ws-protokoll-muster').count()) === 0, 'Schülerblatt ohne Musterlösung')
  await prot.screenshot({ path: join(out, 'protokoll-schueler.png') })

  await page.locator('.app-toolbar label:has-text("Lösungen")').first().click()
  await page.waitForTimeout(1500)
  pruefe((await page.locator('.ws-editor-pages .ws-protokoll .ws-protokoll-muster').count()) >= 3, 'Lösungsansicht mit Musterprotokoll')
  pruefe((await page.getByText('Bewertungsraster', { exact: true }).filter({ visible: true }).count()) >= 1, 'Lösungsansicht mit Bewertungsraster')
  await page.locator('.ws-editor-pages .ws-protokoll').first().screenshot({ path: join(out, 'protokoll-loesung.png') })
  await page.locator('.app-toolbar label:has-text("Arbeitsblatt")').first().click()
  await page.waitForTimeout(800)

  // Karte im ersten Schritt: bei Chemie da, bei Deutsch nicht
  await page.getByText('Thema & Lerngruppe', { exact: true }).filter({ visible: true }).first().click()
  await page.waitForTimeout(1000)
  pruefe((await page.locator('[data-versuch-karte]').filter({ visible: true }).count()) === 1, 'Karte „Versuch mit Protokoll" bei Chemie')
  await page.locator('[data-versuch-an]').filter({ visible: true }).first().check()
  await page.waitForTimeout(400)
  const setup = await page.evaluate(() => window.__selftest.worksheetJetzt()?.meta?.versuch ?? null)
  pruefe(setup?.aktiv === true && setup?.stufe === 'vorstrukturiert' && setup?.stil === 'praesens', 'Vorschlag für Klasse 7: vorstrukturiert, Präsens')
  await page.locator('[data-versuch-karte]').filter({ visible: true }).first().screenshot({ path: join(out, 'versuch-karte.png') })
  await page.evaluate(() => {
    const ws = window.__selftest.worksheetJetzt()
    ws.meta.subjectId = 'deutsch'
    ws.meta.subjectLabel = 'Deutsch'
    window.__selftest.setWorksheet(structuredClone(ws))
  })
  await page.waitForTimeout(800)
  pruefe((await page.locator('[data-versuch-karte]').filter({ visible: true }).count()) === 0, 'Keine Karte bei Deutsch')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
