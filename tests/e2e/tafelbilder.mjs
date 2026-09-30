// Wache für das Programm TAFELBILDER (30.09.2026) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/tafelbilder.mjs <Ausgabeordner>
//
// Erstellen ohne Material (alle vier Formate), Element verschieben, Text ändern, Zauberstab,
// Lückenfassung, Präsentation mit schrittweisem Aufdecken, PDF/PNG/PowerPoint erzeugt,
// Erstellen mit hineingezogenem Material. Alles im WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/tafelbilder')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-tafelbilder-'))
const ablage = join(userData, 'ausgabe')
mkdirSync(ablage, { recursive: true })
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')

const leerDiagramm = { art: 'tabelle', eintraege: [], funktionen: [], bereich: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, schaltplan: '', spalten: [], zeilen: [], xName: '', yName: '' }
const lage = { x: -1, y: -1, w: -1, h: -1 }
const k = (id, titel, punkte, o = {}) => ({ id, titel, punkte, rolle: 'aspekt', farbe: 'grund', symbol: '', zeit: '', niveau: 1, schritt: 2, lueckenWoerter: [], lage, ...o })
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 150,
    protokoll,
    antworten: {
      tafelbild_inhalt: {
        titel: 'Warum scheiterte die Weimarer Republik?',
        struktur: 'netz',
        strukturGrund: 'Mehrere Ursachen um einen Begriff',
        impuls: 'Erläutere die Ursachen mithilfe von M1.',
        knoten: [
          k('k1', 'Scheitern der Republik', [], { rolle: 'zentrum', farbe: 'gelb', schritt: 1 }),
          k('k2', 'Politik', ['Versailler Vertrag', 'Dolchstoßlegende'], { farbe: 'rot', symbol: 'blitz', lueckenWoerter: ['Dolchstoßlegende'] }),
          k('k3', 'Wirtschaft', ['Inflation 1923', 'Weltwirtschaftskrise'], { farbe: 'rot', symbol: 'geld', schritt: 3 }),
          k('k4', 'Verfassung', ['Artikel 48', 'Splitterparteien'], { farbe: 'blau', schritt: 3, niveau: 2, lueckenWoerter: ['Artikel 48'] }),
          k('k5', 'Gesellschaft', ['Demokratie ohne Demokraten'], { farbe: 'blau', schritt: 4, niveau: 3 })
        ],
        beziehungen: [{ von: 'k1', nach: 'k2', beschriftung: 'außen', art: 'linie' }],
        aspekte: [],
        merksatz: { titel: 'Merke!', text: 'Die Republik scheiterte an mehreren Ursachen zugleich.', lueckenWoerter: ['Ursachen'] },
        hausaufgabe: 'Beurteile, welche Ursache am schwersten wog.',
        zeichnungen: [
          {
            art: 'diagramm',
            bezug: '',
            name: '',
            prompt: '',
            tex: '',
            diagramm: { ...leerDiagramm, art: 'zeitstrahl', eintraege: [{ label: 'Gründung', wert: '1919', x: 0, y: 0 }, { label: 'Ende', wert: '1933', x: 0, y: 0 }] },
            beschriftung: '',
            schritt: 1
          }
        ],
        farbLegende: [
          { farbe: 'gelb', bedeutung: 'Fachbegriff' },
          { farbe: 'rot', bedeutung: 'Problem' },
          { farbe: 'blau', bedeutung: 'Struktur' },
          { farbe: 'orange', bedeutung: 'Merksatz' }
        ],
        schritte: [
          { nr: 1, phase: 'Einstieg', impuls: 'Leitfrage stellen' },
          { nr: 2, phase: 'Erarbeitung', impuls: 'Ursachen aus M1 sammeln' }
        ]
      },
      tafelbild_element: {
        titel: 'Wirtschaft',
        text: '• Hyperinflation 1923\n• Weltwirtschaftskrise 1929',
        lueckenWoerter: ['Hyperinflation'],
        symbol: 'geld',
        tex: '',
        prompt: '',
        diagramm: leerDiagramm,
        mitDiagramm: false
      },
      tafelbild_kuerzen: { knoten: [] },
      baustein_wunsch_vorschlaege: { vorschlaege: ['Kürzer', 'Mit Jahreszahl'] }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const anfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
    : []

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000))
// Speichern-Dialoge beantworten: alles in den Ausgabeordner
await app.evaluate(({ dialog }, ordner) => {
  let n = 0
  dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: `${ordner}\\${n++}-${(o ?? _w)?.defaultPath?.split(/[\\/]/).pop() ?? 'datei'}` })
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ordner] })
}, ablage)
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const jetzt = () => page.evaluate(() => window.__selftest.tbJetzt())
const warte = async (bed, ms = 15000) => {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    const t = await jetzt()
    if (bed(t)) return t
    await page.waitForTimeout(250)
  }
  return jetzt()
}

try {
  // ---------- Strg+7 öffnet die Tafelbilder (vor Elternbriefen und Vokabellisten)
  await page.keyboard.press('Control+7')
  await page.getByText('Thema & Einstellungen', { exact: true }).first().waitFor({ timeout: 10000 })
  pruefe(true, 'Strg+7 öffnet „Tafelbilder"')

  // ---------- Erstellen ohne Material, alle vier Formate
  await sichtbar(page.locator('[data-tb-thema]')).fill('Scheitern der Weimarer Republik')
  for (const f of ['Whiteboard / digitale Tafel (16:9)', 'Flipchart / Plakat (hochkant)']) await sichtbar(page.getByText(f, { exact: true })).click()
  await page.screenshot({ path: join(out, '01-einrichten.png') })
  await sichtbar(page.locator('[data-tb-erstellen]')).click()
  let t = await warte((x) => x?.tafeln?.length === 4)
  pruefe(t?.tafeln?.length === 4, `Vier Formate gesetzt (${t?.tafeln?.map((x) => x.format).join(', ')})`)
  const a = anfragen().filter((z) => z.schemaName === 'tafelbild_inhalt')
  pruefe(a.length === 1 && /Leitfrage/.test(a[0].system ?? '') && /FESTER Bedeutung/.test(a[0].system ?? ''), 'Systemauftrag enthält die Gestaltungsregeln der Recherche')
  pruefe(a.length === 1 && a[0].user.includes('Scheitern der Weimarer Republik') && /höchstens etwa \d+ Wörter/.test(a[0].user), 'Auftrag nennt Thema und Textmenge')
  await page.locator('[data-tb-flaeche]').first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(600)
  const ueberlappt = (t?.pruefung ?? []).filter((b) => b.art === 'ueberlappung')
  pruefe(ueberlappt.length === 0, `Keine Überlappung nach dem Layout (${ueberlappt.map((b) => b.text).join(' | ')})`)
  for (const [i, f] of ['klapptafel', 'whiteboard', 'flipchart', 'heft'].entries()) {
    const seg = page.locator('[data-tb-formate] label').nth(i)
    await seg.click()
    await page.waitForTimeout(400)
    const flaeche = page.locator(`[data-tb-flaeche="${f}"]`)
    pruefe((await flaeche.count()) === 1, `Format ${f} wird gezeigt`)
    await page.screenshot({ path: join(out, `02-${f}.png`) })
  }
  await page.locator('[data-tb-formate] label').nth(0).click()
  await page.waitForTimeout(300)

  // ---------- Element verschieben
  t = await jetzt()
  const tafel = t.tafeln.find((x) => x.format === 'klapptafel')
  const kasten = tafel.elemente.find((e) => e.typ === 'kasten' && e.titel === 'Wirtschaft')
  const treffer = page.locator(`[data-tb-flaeche="klapptafel"] [data-element="${kasten.id}"]`)
  const box = await treffer.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 12, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  t = await jetzt()
  const verschoben = t.tafeln.find((x) => x.format === 'klapptafel').elemente.find((e) => e.id === kasten.id)
  pruefe(verschoben.x > kasten.x + 0.001, `Element verschoben (x ${kasten.x.toFixed(3)} → ${verschoben.x.toFixed(3)})`)
  // Rückgängig nimmt die ganze Geste in EINEM Schritt zurück
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  t = await jetzt()
  pruefe(Math.abs(t.tafeln.find((x) => x.format === 'klapptafel').elemente.find((e) => e.id === kasten.id).x - kasten.x) < 1e-6, 'Strg+Z nimmt das Verschieben zurück')

  // ---------- Text ändern im Eigenschaftsfeld
  await treffer.click()
  await sichtbar(page.locator('[data-tb-text]')).fill('• Inflation 1923\n• Weltwirtschaftskrise 1929')
  await page.waitForTimeout(300)
  t = await jetzt()
  pruefe(t.tafeln[0].elemente.find((e) => e.id === kasten.id).text.includes('1929'), 'Text direkt geändert')
  await page.screenshot({ path: join(out, '03-auswahl.png') })

  // ---------- Zauberstab am Element
  await sichtbar(page.locator('[data-tb-eigenschaften] .editor-ai-ueberarbeiten')).click()
  await sichtbar(page.locator('[data-ki-wunsch] textarea')).fill('Mit Jahreszahlen')
  await sichtbar(page.locator('[data-ki-wunsch]').getByRole('button', { name: 'Überarbeiten' })).click()
  t = await warte((x) => x?.tafeln?.[0]?.elemente?.find((e) => e.id === kasten.id)?.text?.includes('Hyperinflation'))
  const neu = t.tafeln[0].elemente.find((e) => e.id === kasten.id)
  pruefe(neu.text.includes('Hyperinflation'), 'Zauberstab: Element überarbeitet')
  const inAllen = t.tafeln.every((x) => x.elemente.some((e) => e.knoten === kasten.knoten && e.text.includes('Hyperinflation')))
  pruefe(inAllen, 'Zauberstab: dieselbe Änderung in allen Formaten')
  const el = anfragen().filter((z) => z.schemaName === 'tafelbild_element')
  pruefe(el.length === 1 && el[0].user.includes('Mit Jahreszahlen'), 'Zauberstab: Wunsch geht an die KI')

  // ---------- Lückenfassung
  await page.locator('[data-tb-flaeche] .tb-overlay').first().click({ position: { x: 5, y: 5 } })
  await sichtbar(page.locator('[data-tb-ansicht]')).click()
  await sichtbar(page.getByRole('option', { name: 'Lückenfassung' })).click()
  await page.waitForTimeout(500)
  const svgText = await page.locator('[data-tb-flaeche] .tb-svg').first().innerHTML()
  pruefe(svgText.includes('__________') && svgText.includes('Wortspeicher'), 'Lückenfassung mit Lücken und Wortspeicher')
  await page.screenshot({ path: join(out, '04-lueckenfassung.png') })
  await sichtbar(page.locator('[data-tb-ansicht]')).click()
  await sichtbar(page.getByRole('option', { name: 'Tafelbild' })).click()

  // ---------- Präsentation
  await sichtbar(page.locator('[data-tb-praesentieren]')).click()
  const p = page.locator('[data-tb-praesentation]')
  await p.waitFor({ timeout: 5000 })
  pruefe((await p.getAttribute('data-schritt')) === '1', 'Präsentation beginnt bei Schritt 1')
  await page.screenshot({ path: join(out, '05-praesentation-schritt1.png') })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  pruefe((await p.getAttribute('data-schritt')) === '3', 'Pfeil rechts deckt Schritt für Schritt auf')
  await page.screenshot({ path: join(out, '06-praesentation-schritt3.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  pruefe((await p.count()) === 0, 'Esc schließt die Präsentation')

  // ---------- Ausgaben: PDF, PNG, PowerPoint
  await sichtbar(page.locator('[data-tb-ausgabe]')).click()
  await sichtbar(page.locator('[data-tb-pdf]')).click()
  await page.waitForTimeout(4000)
  await sichtbar(page.locator('[data-tb-pptx]')).click()
  await page.waitForTimeout(6000)
  await sichtbar(page.locator('[data-tb-png]')).click()
  await page.waitForTimeout(6000)
  const dateien = readdirSync(ablage)
  const lies = (endung) => dateien.filter((d) => d.endsWith(endung)).map((d) => readFileSync(join(ablage, d)))
  const pdf = lies('.pdf')
  pruefe(pdf.length === 1 && pdf[0].subarray(0, 4).toString() === '%PDF' && pdf[0].length > 20000, `PDF erzeugt (${pdf[0]?.length ?? 0} Bytes)`)
  const pptx = lies('.pptx')
  pruefe(pptx.length === 1 && pptx[0][0] === 0x50 && pptx[0][1] === 0x4b && pptx[0].includes(Buffer.from('ppt/slides/slide3.xml')), 'PowerPoint erzeugt, mehrere Folien')
  const png = lies('.png')
  pruefe(png.length >= 4 && png.every((b) => b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47), `PNG erzeugt (${png.length} Bilder)`)
  // Ein PNG zum Ansehen ablegen
  const klapp = dateien.find((d) => d.endsWith('.png') && d.includes('Klapptafel') && !d.includes('Lücken'))
  if (klapp) writeFileSync(join(out, '07-export-klapptafel.png'), readFileSync(join(ablage, klapp)))
  const whiteb = dateien.find((d) => d.endsWith('.png') && d.includes('Whiteboard') && !d.includes('Lücken'))
  if (whiteb) writeFileSync(join(out, '08-export-whiteboard.png'), readFileSync(join(ablage, whiteb)))
  await page.keyboard.press('Escape')

  // ---------- Erstellen MIT Material
  await sichtbar(page.getByRole('button', { name: 'Neues Tafelbild' })).click()
  await page.getByText('Thema & Einstellungen', { exact: true }).first().waitFor({ timeout: 10000 })
  const material = join(userData, 'Quelle Inflation.txt')
  writeFileSync(material, 'M1: Die Hyperinflation 1923 vernichtete die Ersparnisse des Mittelstands. Ein Brot kostete im November 1923 über 200 Milliarden Mark.')
  // Nur die Ablagefläche des sichtbaren Programms (die übrigen Programme bleiben im Hintergrund geladen)
  await sichtbar(page.locator('.mantine-Dropzone-root')).locator('input[type="file"]').setInputFiles(material)
  const ok = page.locator('[data-datenschutz-ok]')
  if (await ok.isVisible({ timeout: 4000 }).catch(() => false)) await ok.click()
  await sichtbar(page.getByText('Quelle Inflation.txt')).waitFor({ timeout: 10000 })
  await sichtbar(page.locator('[data-tb-erstellen]')).click()
  t = await warte((x) => x?.tafeln?.length >= 1)
  const b = anfragen().filter((z) => z.schemaName === 'tafelbild_inhalt')
  pruefe(b.length === 2 && b[1].user.includes('MATERIAL DER LEHRKRAFT') && b[1].user.includes('200 Milliarden'), 'Mit Material: Text geht ausgewertet an die KI')
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, '09-mit-material.png') })
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
}

console.log(problems.length ? `\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
