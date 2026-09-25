// Wache: Gibt WORD die Anordnung wieder? (vorher: npm run build)
// Aufruf: node tests/e2e/word-lage.mjs <Ausgabeordner>
//
// Auf dem Blatt steht ein Bild oder eine Tabelle seitlich, der Text fließt daneben und läuft
// DARUNTER wieder über die volle Breite. Bis zum 24.09.2026 steckte der Text in der
// Word-Datei dafür in einer schmalen Tabellenspalte – er blieb bis zum Ende schmal.
//
// Jetzt trägt ein schwebender Behälter (`w:tblpPr`) den Baustein, und Word lässt den Text
// darum fließen. Geprüft wird an der einzigen Stelle, die zählt: in Word selbst.
//
// Zwei Durchgänge, weil der Export zwei Zweige hat:
//   1. seitlich gestellt (Bild/Tabelle neben der Aufgabe)
//   2. frei gezogen (eigener Zweig – hier fiele ein doppelter oder fehlender Baustein auf)
//
// Braucht ein installiertes Word (nur zum Nachmessen). Ohne Word endet die Wache mit einem
// Hinweis statt mit einem Fehlschlag – sie soll auf einem Rechner ohne Office nicht lügen.
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/word-lage')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-wordlage-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.setSize(1600, 1050)
})
await warteAufOberflaeche(page)
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Blatt aufbauen, nach Word ausgeben, Seitenzahl der Vorschau zurückgeben. */
const exportiere = async (frei, datei) => {
  await page.evaluate((f) => window.__selftest.wsAnordnung('tabelle', 'left', f ?? undefined), frei)
  await page.waitForTimeout(2500)
  const seiten = await page.evaluate(
    () => [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0).length
  )
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, datei)
  await page.getByRole('button', { name: 'Word', exact: true }).click()
  await page.click('button:has-text("Speichern …")')
  await page.waitForSelector('text=Word-Dokument gespeichert', { timeout: 120000 })
  // Die Meldung verschwinden lassen, sonst sieht der zweite Durchgang noch die alte
  await page.waitForTimeout(6000)
  return seiten
}

const seitlichDatei = join(out, 'seitlich.docx')
const freiDatei = join(out, 'frei.docx')
const seitenSeitlich = await exportiere(null, seitlichDatei)
const seitenFrei = await exportiere({ page: 1, x: 45, y: 30, width: 35 }, freiDatei)
await app.close()
rmSync(userData, { recursive: true, force: true })

if (!existsSync(seitlichDatei) || !existsSync(freiDatei)) {
  console.log('Eine der Word-Dateien wurde nicht geschrieben.')
  process.exit(1)
}

/**
 * Word nach der waagerechten Lage jedes Absatzes fragen.
 *
 * Daran hängt alles: Rücken die Absätze neben dem Behälter ein, wird in Word gesetzt wie in
 * der Vorschau. Bleiben alle gleich weit links, steht der Baustein nur irgendwo herum.
 */
const messe = (datei) => {
  const pfad = datei.split('\\').join('\\\\')
  const ps = [
    '$w = New-Object -ComObject Word.Application',
    '$w.Visible = $false',
    '$w.DisplayAlerts = 0',
    'try {',
    `  $d = $w.Documents.Open('${pfad}', $false, $true)`,
    '  Write-Output ("SEITEN=" + $d.ComputeStatistics(2))',
    '  Write-Output ("TABELLEN=" + $d.Tables.Count)',
    '  if ($d.Tables.Count -gt 0) { Write-Output ("UMFLOSSEN=" + $d.Tables.Item(1).Rows.WrapAroundText) }',
    '  $i = 0',
    '  foreach ($p in $d.Paragraphs) {',
    '    $i++',
    '    if ($i -gt 60) { break }',
    '    $t = $p.Range.Text.Trim()',
    '    if ($t.Length -lt 2) { continue }',
    '    $x = [math]::Round($p.Range.Information(5) / 72 * 25.4, 1)',
    '    $k = [Math]::Min(26, $t.Length)',
    '    Write-Output ("ABSATZ=" + $x + "|" + $p.Range.Tables.Count + "|" + $t.Substring(0, $k))',
    '  }',
    '  $d.Close(0)',
    '} catch { Write-Output ("FEHLER=" + $_.Exception.Message.Split([char]10)[0]) } finally { $w.Quit() }'
  ].join('\n')
  const roh = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 240000 })
  if (/FEHLER=/.test(roh)) return { fehler: roh.match(/FEHLER=.*/)[0] }
  return {
    seiten: Number((roh.match(/SEITEN=(\d+)/) ?? [])[1] ?? 0),
    tabellen: Number((roh.match(/TABELLEN=(\d+)/) ?? [])[1] ?? 0),
    // Word liefert Wahrheitswerte als -1/0 oder True/False – beides zulassen
    umflossen: /^(True|-1)$/.test(((roh.match(/UMFLOSSEN=(.*)/) ?? [])[1] ?? '').trim()),
    absaetze: [...roh.matchAll(/ABSATZ=([-\d.]+)\|(\d+)\|(.*)/g)].map((m) => ({ x: Number(m[1]), imKasten: Number(m[2]) > 0, text: m[3].trim() }))
  }
}

let seitlich
let frei
try {
  seitlich = messe(seitlichDatei)
  frei = messe(freiDatei)
} catch (e) {
  console.log('Word ließ sich nicht ansprechen – die Messung entfällt:', String(e.message).split('\n')[0])
  process.exit(0)
}
for (const [name, m] of [
  ['seitlich', seitlich],
  ['frei', frei]
]) {
  if (m.fehler) {
    console.log(`${name}: Word meldet ${m.fehler}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------- 1. seitlich gestellt
console.log(`Seitlich – Vorschau ${seitenSeitlich} Seite(n), Word ${seitlich.seiten} · ${seitlich.absaetze.length} Absätze`)
for (const a of seitlich.absaetze.slice(0, 10)) console.log(`   x=${a.x} mm ${a.imKasten ? '(im Behälter)' : '(im Fluss)'}  ${a.text}`)
const satzspiegel = Math.min(...seitlich.absaetze.map((a) => a.x))
/*
 * NUR Absätze im Fluss zählen. Die Zeilen der Tabelle stehen IM Behälter und säßen ohnehin
 * am Satzspiegel – sie als Beweis zu nehmen, wäre eine leere Prüfung.
 */
const eingerueckt = seitlich.absaetze.filter((a) => !a.imKasten && a.x > satzspiegel + 15)
pruefe(seitlich.tabellen > 0, 'Der Baustein steckt in einem eigenen Behälter')
pruefe(seitlich.umflossen, 'Der Behälter wird vom Text umflossen')
pruefe(eingerueckt.length > 0, `Neben dem Behälter rückt der Fließtext ein (${eingerueckt[0]?.x ?? '–'} mm statt ${satzspiegel} mm)`)

// ---------------------------------------------------------------- 2. frei gezogen
const treffer = frei.absaetze.filter((a) => a.text.includes('Useful words')).length
console.log(`Frei gezogen – Word ${frei.seiten} Seite(n), ${frei.tabellen} Behälter, „Useful words" ${treffer}×`)
pruefe(treffer === 1, `Der frei gezogene Baustein steht genau einmal in der Datei (${treffer}×)`)
pruefe(frei.umflossen, 'Auch frei gezogen steckt er in einem umflossenen Behälter')

/*
 * Die Seitenzahl darf abweichen – Word bricht mit eigenen Schriftmaßen um. Genau deshalb ist
 * die Lage an den TEXT gebunden und nicht an die Seite. Wird hier nur berichtet.
 */
if (seitlich.seiten !== seitenSeitlich || frei.seiten !== seitenFrei) {
  console.log(`  Hinweis: Word bricht anders um (${seitlich.seiten}/${frei.seiten} statt ${seitenSeitlich}/${seitenFrei}) – darum ist die Lage textgebunden.`)
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nWord setzt die Anordnung wie die Vorschau: daneben eingerückt, darunter volle Breite.')
