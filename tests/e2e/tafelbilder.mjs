// Wache für das Programm TAFELBILDER (30.09.2026) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/tafelbilder.mjs <Ausgabeordner>
//
// Erstellen ohne Material (alle vier Formate), Element verschieben, Text ändern, Zauberstab,
// Lückenfassung, Präsentation mit schrittweisem Aufdecken, PDF/PNG/PowerPoint erzeugt,
// Erstellen mit hineingezogenem Material. Alles im WEGWERF-Profil.
// Nachbesserung (30.09.2026): automatische Kürzung bei zu kleiner Schrift, „Vorschlag der App
// umsetzen" (Elemente zusammenfassen, Text kürzen), PDF klein trotz Kreidetextur, PowerPoint mit
// bearbeitbarem Text und Sprechernotizen.
// Wünsche der Lehrkraft (30.09.2026, dritte Runde): Lernziele vorschlagen (KI) im Einrichten-Schritt,
// Zoom der Zeichenfläche (Knöpfe, Strg + Mausrad, zwei Finger; Ziehen bleibt beim Zoom genau),
// Zeitleiste aus UNGEORDNETEN Ereignissen mit fehlendem Datum: Korrekturanfrage, chronologisch,
// jeder Verbinder an seiner Marke – auf allen vier Formaten.
import { _electron as electron } from 'playwright-core'
import { strFromU8, unzipSync } from 'fflate'
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
      tafelbild_inhalt: { folge: [] },
      tafelbild_netz: {
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
      baustein_wunsch_vorschlaege: { vorschlaege: ['Kürzer', 'Mit Jahreszahl'] },
      tafelbild_lernziele: {
        vorschlaege: [
          { text: 'die Ursachen des Scheiterns der Weimarer Republik erläutern', operator: 'erläutern', afb: 'II', bereich: 'Sachkompetenz' },
          { text: 'zentrale Ereignisse 1918–1933 beschreiben', operator: 'beschreiben', afb: 'I', bereich: 'Sachkompetenz' },
          { text: 'die Bedeutung von Artikel 48 beurteilen', operator: 'beurteilen', afb: 'III', bereich: 'Urteilskompetenz' },
          { text: 'die Weimarer Republik verstehen', operator: 'verstehen', afb: 'I', bereich: '' }
        ]
      },
      // Zeitleiste: Ereignisse durcheinander, ein Datum fehlt (Korrekturanfrage)
      tafelbild_zeitleiste: {
        titel: 'Wie verlief die Weimarer Republik?',
        struktur: 'zeitleiste',
        strukturGrund: 'Chronologie',
        impuls: '',
        knoten: [
          k('z5', 'Hitlerputsch', ['Putschversuch in München'], { rolle: 'ereignis', zeit: '9. November 1923' }),
          k('z1', 'Novemberrevolution', ['Ausrufung der Republik'], { rolle: 'ereignis', zeit: '9. November 1918', farbe: 'gelb' }),
          k('z7', 'Weltwirtschaftskrise', ['Massenarbeitslosigkeit'], { rolle: 'ereignis', zeit: '1929', farbe: 'rot' }),
          k('z3', 'Kapp-Putsch', ['Generalstreik'], { rolle: 'ereignis', zeit: '' }),
          k('z2', 'Weimarer Verfassung', ['Artikel 48'], { rolle: 'ereignis', zeit: '11. August 1919' }),
          k('z8', 'Ernennung Hitlers', ['Ende der Republik'], { rolle: 'ereignis', zeit: '30. Januar 1933', farbe: 'rot' }),
          k('z4', 'Hyperinflation', ['Geld wertlos'], { rolle: 'ereignis', zeit: '1923', farbe: 'rot' })
        ],
        beziehungen: [],
        aspekte: [],
        merksatz: { titel: 'Merke!', text: 'Die Republik scheiterte an Krisen und Gegnern.', lueckenWoerter: [] },
        hausaufgabe: '',
        zeichnungen: [],
        farbLegende: [
          { farbe: 'gelb', bedeutung: 'Beginn' },
          { farbe: 'rot', bedeutung: 'Krise' },
          { farbe: 'orange', bedeutung: 'Merksatz' }
        ],
        schritte: []
      },
      tafelbild_korrektur: { knoten: [{ id: 'z3', titel: '', zeit: 'März 1920', punkte: [] }] }
    }
  })
)

{
  // Netz, Netz mit Material, Zeitleiste – der Reihe nach (Attrappe: „folge")
  const d = JSON.parse(readFileSync(attrappe, 'utf-8'))
  d.antworten.tafelbild_inhalt = { folge: [d.antworten.tafelbild_netz, d.antworten.tafelbild_netz, d.antworten.tafelbild_zeitleiste] }
  writeFileSync(attrappe, JSON.stringify(d))
}

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

  // ---------- Lernziele vorschlagen (KI) – wie im Arbeitsblatt, mehrere zum Anklicken
  await sichtbar(page.locator('[data-tb-lernziele-vorschlagen]')).click()
  const lzVorschlag = page.locator('[data-tb-lernziel-vorschlag]').filter({ visible: true })
  await lzVorschlag.first().waitFor({ timeout: 10000 })
  const zahlVorschlaege = await lzVorschlag.count()
  pruefe(zahlVorschlaege === 3, `Lernziele: ${zahlVorschlaege} Vorschläge (Operator „verstehen" nicht in der Landesliste – fällt weg)`)
  const la = anfragen().filter((z) => z.schemaName === 'tafelbild_lernziele')
  pruefe(
    la.length === 1 && la[0].user.includes('Scheitern der Weimarer Republik') && /erläutern \(AFB II\)/.test(la[0].system ?? '') && /AFB III/.test(la[0].system ?? ''),
    'Lernziele: Auftrag mit Thema, Operatoren der Landesliste und AFB'
  )
  const afbTexte = await lzVorschlag.allInnerTexts()
  pruefe(['AFB I', 'AFB II', 'AFB III'].every((a) => afbTexte.some((t) => t.includes(a))), `Lernziele: AFB-Mischung (${afbTexte.map((t) => t.split('\n').pop()).join(', ')})`)
  await lzVorschlag.nth(0).click()
  await lzVorschlag.nth(2).click()
  await page.waitForTimeout(300)
  let lz = (await jetzt())?.meta?.lernziel ?? ''
  pruefe(lz.includes('Ursachen des Scheiterns') && lz.includes('Artikel 48') && lz.split('\n').length === 2, `Lernziele: zwei Vorschläge übernommen (${lz.replace(/\n/g, ' | ')})`)
  await lzVorschlag.nth(2).click()
  await page.waitForTimeout(300)
  lz = (await jetzt())?.meta?.lernziel ?? ''
  pruefe(!lz.includes('Artikel 48'), 'Lernziele: zweiter Klick nimmt einen Vorschlag wieder heraus')
  await page.screenshot({ path: join(out, '01-lernziele.png') })
  for (const f of ['Whiteboard / digitale Tafel (16:9)', 'Flipchart / Plakat (hochkant)']) await sichtbar(page.getByText(f, { exact: true })).click()
  await page.screenshot({ path: join(out, '01-einrichten.png') })
  await sichtbar(page.locator('[data-tb-erstellen]')).click()
  let t = await warte((x) => x?.tafeln?.length === 4)
  pruefe(t?.tafeln?.length === 4, `Vier Formate gesetzt (${t?.tafeln?.map((x) => x.format).join(', ')})`)
  const a = anfragen().filter((z) => z.schemaName === 'tafelbild_inhalt')
  pruefe(a.length === 1 && /Leitfrage/.test(a[0].system ?? '') && /FESTER Bedeutung/.test(a[0].system ?? ''), 'Systemauftrag enthält die Gestaltungsregeln der Recherche')
  pruefe(a.length === 1 && a[0].user.includes('Scheitern der Weimarer Republik') && /höchstens etwa \d+ Wörter/.test(a[0].user), 'Auftrag nennt Thema und Textmenge')
  pruefe(a.length === 1 && a[0].user.includes('LERNZIELE (verbindlich)') && a[0].user.includes('Ursachen des Scheiterns'), 'Gewählte Lernziele steuern den Auftrag (Merksatz sichert sie)')
  await page.locator('[data-tb-flaeche]').first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(600)
  // Schrift unter der Empfehlung (Whiteboard, Flipchart): die KI kürzt beim Erzeugen einmal von selbst
  const kurz = anfragen().filter((z) => z.schemaName === 'tafelbild_kuerzen')
  pruefe(kurz.length === 1, `Automatische Kürzung beim Erzeugen (${kurz.length} Anfrage)`)
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

  // ---------- Zoom: Knöpfe, Strg + Mausrad, zwei Finger; Ziehen bleibt genau
  const buehne = sichtbar(page.locator('.tb-buehne'))
  const zoomJetzt = async () => Number(await buehne.getAttribute('data-tb-zoom'))
  const flaecheBreite = async () => (await sichtbar(page.locator('[data-tb-flaeche]')).boundingBox()).width
  const breite100 = await flaecheBreite()
  pruefe((await zoomJetzt()) === 1, `Zoom beginnt bei 100 % (Tafel eingepasst, ${breite100.toFixed(0)} px breit)`)
  const rahmen = sichtbar(page.locator('.tb-flaechen-rahmen'))
  await rahmen.getByRole('button', { name: 'Vergrößern' }).click()
  await rahmen.getByRole('button', { name: 'Vergrößern' }).click()
  await page.waitForTimeout(300)
  const z2 = await zoomJetzt()
  const breite2 = await flaecheBreite()
  pruefe(z2 > 1.2 && Math.abs(breite2 / breite100 - z2) < 0.03, `Knopf „+": ${Math.round(z2 * 100)} %, Tafel ${breite2.toFixed(0)} px breit`)
  pruefe((await rahmen.locator('[data-zoom-wert]').innerText()).includes(`${Math.round(z2 * 100)} %`), 'Prozentanzeige stimmt')
  await page.screenshot({ path: join(out, '02b-zoom-knopf.png') })
  // Ziehen im Zoom: das Element folgt dem Zeiger genau (Zoomfaktor in der Umrechnung)
  {
    const t0 = await jetzt()
    const kl = t0.tafeln.find((x) => x.format === 'klapptafel')
    const ziel = kl.elemente.find((e) => e.typ === 'kasten' && e.titel === 'Politik')
    const treffer0 = page.locator(`[data-tb-flaeche="klapptafel"] [data-element="${ziel.id}"]`)
    await treffer0.scrollIntoViewIfNeeded()
    const b0 = await treffer0.boundingBox()
    const fb = await sichtbar(page.locator('[data-tb-flaeche]')).boundingBox()
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2)
    await page.mouse.down()
    await page.mouse.move(b0.x + b0.width / 2 + 60, b0.y + b0.height / 2, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const t1 = await jetzt()
    const nachher = t1.tafeln.find((x) => x.format === 'klapptafel').elemente.find((e) => e.id === ziel.id)
    const erwartet = 60 / fb.width
    const ist = nachher.x - ziel.x
    // Einrasten an Kanten darf höchstens um den Fangabstand (7 px) abweichen
    pruefe(Math.abs(ist - erwartet) <= 8 / fb.width, `Ziehen bei ${Math.round(z2 * 100)} %: Δx ${(ist * fb.width).toFixed(1)} px statt 60 px`)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)
  }
  // Strg + Mausrad (auch Aufziehen auf dem Trackpad)
  const bb = await buehne.boundingBox()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -400)
  await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  const z3 = await zoomJetzt()
  pruefe(z3 > z2 + 0.05, `Strg + Mausrad vergrößert (${Math.round(z2 * 100)} % → ${Math.round(z3 * 100)} %)`)
  // Einpassen
  await rahmen.getByRole('button', { name: 'Breite einpassen' }).click()
  await page.waitForTimeout(300)
  pruefe((await zoomJetzt()) === 1 && Math.abs((await flaecheBreite()) - breite100) < 2, '„Einpassen" zeigt wieder die ganze Tafel')
  // Zwei Finger (echte Touch-Ereignisse über CDP)
  {
    const cdp = await page.context().newCDPSession(page)
    const mx = bb.x + bb.width / 2
    const my = bb.y + bb.height / 2
    const zwei = (d) => [
      { x: mx - d, y: my, id: 1, radiusX: 6, radiusY: 6, force: 1 },
      { x: mx + d, y: my, id: 2, radiusX: 6, radiusY: 6, force: 1 }
    ]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: zwei(60) })
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: zwei(60 + i * 9) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(400)
    const z4 = await zoomJetzt()
    pruefe(z4 > 1.3, `Zwei Finger aufziehen: ${Math.round(z4 * 100)} %`)
    await page.screenshot({ path: join(out, '02c-zoom-zwei-finger.png') })
    await rahmen.getByRole('button', { name: 'Breite einpassen' }).click()
    await page.waitForTimeout(300)
  }

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
  // Kreidetextur als Muster statt Filter: vorher 2,3 MB
  pruefe(pdf.length === 1 && pdf[0].length < 900000, `PDF mit Kreidetafel bleibt klein (${Math.round((pdf[0]?.length ?? 0) / 1024)} KB)`)
  const pptx = lies('.pptx')
  pruefe(pptx.length === 1 && pptx[0][0] === 0x50 && pptx[0][1] === 0x4b && pptx[0].includes(Buffer.from('ppt/slides/slide3.xml')), 'PowerPoint erzeugt, mehrere Folien')
  if (pptx.length === 1) {
    const z = unzipSync(new Uint8Array(pptx[0]))
    const folien = Object.keys(z).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    const letzte = folien.map((n) => strFromU8(z[n])).find((x) => x.includes('<a:t>Merke!</a:t>')) ?? ''
    pruefe(letzte.includes('<p:txBody>') && letzte.includes('<a:t>Politik</a:t>') && letzte.includes('<p:cxnSp>'), 'PowerPoint: Text bearbeitbar (Textfelder, Linien statt Bild)')
    const notiz = strFromU8(z['ppt/notesSlides/notesSlide1.xml'] ?? new Uint8Array())
    pruefe(/Schritt 1 von \d/.test(notiz) && notiz.includes('Merksatz:'), 'PowerPoint: Sprechernotizen mit Schritt und Merksatz')
    writeFileSync(join(out, '10-tafelbild.pptx'), pptx[0])
  }
  const png = lies('.png')
  pruefe(png.length >= 4 && png.every((b) => b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47), `PNG erzeugt (${png.length} Bilder)`)
  // Ein PNG zum Ansehen ablegen
  const klapp = dateien.find((d) => d.endsWith('.png') && d.includes('Klapptafel') && !d.includes('Lücken'))
  if (klapp) writeFileSync(join(out, '07-export-klapptafel.png'), readFileSync(join(ablage, klapp)))
  const whiteb = dateien.find((d) => d.endsWith('.png') && d.includes('Whiteboard') && !d.includes('Lücken'))
  if (whiteb) writeFileSync(join(out, '08-export-whiteboard.png'), readFileSync(join(ablage, whiteb)))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---------- Vorschlag der App umsetzen: Schrift unter der Empfehlung (Whiteboard)
  await page.locator('[data-tb-formate] label').nth(1).click()
  await page.waitForTimeout(400)
  await page.locator('[data-tb-flaeche] .tb-overlay').first().click({ position: { x: 5, y: 5 } })
  const vorschlag = sichtbar(page.getByTestId('tb-vorschlag-umsetzen'))
  const daVorschlag = await vorschlag.waitFor({ timeout: 5000 }).then(
    () => true,
    () => false
  )
  pruefe(daVorschlag && (await vorschlag.innerText()).includes('zur Wahl'), `Befund „Schrift" bietet „Vorschlag der App umsetzen" (${daVorschlag ? await vorschlag.innerText() : 'fehlt'})`)
  if (daVorschlag) {
    const knotenVorher = (await jetzt()).inhalt.knoten.length
    await vorschlag.click()
    await page.locator('[data-kreismenue-umsetzen]').waitFor({ timeout: 3000 })
    const eintraege = await page.getByRole('menuitemcheckbox').allInnerTexts()
    pruefe(eintraege.some((e) => /Text kürzen/.test(e)) && eintraege.some((e) => /zusammenfassen/.test(e)), `Kreismenü: ${eintraege.join(' | ')}`)
    await page.getByRole('menuitemcheckbox', { name: 'Elemente zusammenfassen' }).click()
    await page.screenshot({ path: join(out, '09-vorschlag-kreismenue.png') })
    await page.locator('[data-kreismenue-umsetzen]').click()
    t = await warte((x) => x?.inhalt?.knoten?.length === knotenVorher - 1)
    pruefe(t.inhalt.knoten.length === knotenVorher - 1 && t.inhalt.knoten.some((k) => k.titel.includes(' / ')), `Zwei Kästen zusammengefasst (${knotenVorher} → ${t.inhalt.knoten.length} Knoten)`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(out, '09-vorschlag-zusammengefasst.png') })
    await page.keyboard.press('Control+z')
    t = await warte((x) => x?.inhalt?.knoten?.length === knotenVorher)
    pruefe(t.inhalt.knoten.length === knotenVorher, 'Strg+Z nimmt das Zusammenfassen zurück')
    // Text kürzen (KI): ein Hintergrund-Auftrag mit der Kürzungs-Anfrage
    const vorherKurz = anfragen().filter((z) => z.schemaName === 'tafelbild_kuerzen').length
    await page.locator('[data-tb-flaeche] .tb-overlay').first().click({ position: { x: 5, y: 5 } })
    await sichtbar(page.getByTestId('tb-vorschlag-umsetzen')).click()
    await page.locator('[data-kreismenue-umsetzen]').waitFor({ timeout: 3000 })
    await page.getByRole('menuitemcheckbox', { name: 'Text kürzen (KI)' }).click()
    await page.locator('[data-kreismenue-umsetzen]').click()
    const ende = Date.now() + 10000
    while (Date.now() < ende && anfragen().filter((z) => z.schemaName === 'tafelbild_kuerzen').length === vorherKurz) await page.waitForTimeout(250)
    pruefe(anfragen().filter((z) => z.schemaName === 'tafelbild_kuerzen').length === vorherKurz + 1, 'Text kürzen (KI): Auftrag an die KI')
    await page.waitForTimeout(1200)
  }

  // ---------- Erstellen MIT Material
  await sichtbar(page.getByRole('button', { name: 'Neues Tafelbild' })).click()
  await page.getByText('Thema & Einstellungen', { exact: true }).first().waitFor({ timeout: 10000 })
  const material = join(userData, 'Quelle Inflation.txt')
  writeFileSync(material, 'M1: Die Hyperinflation 1923 vernichtete die Ersparnisse des Mittelstands. Ein Brot kostete im November 1923 über 200 Milliarden Mark.')
  // Nur die Ablagefläche des sichtbaren Programms (die übrigen Programme bleiben im Hintergrund geladen)
  await sichtbar(page.locator('.mantine-Dropzone-root')).locator('input[type="file"]').setInputFiles(material)
  const ok = page.locator('[data-datenschutz-ok]')
  if (
    await ok.waitFor({ state: 'visible', timeout: 6000 }).then(
      () => true,
      () => false
    )
  )
    await ok.click()
  await sichtbar(page.getByText('Quelle Inflation.txt')).waitFor({ timeout: 10000 })
  await sichtbar(page.locator('[data-tb-erstellen]')).click()
  t = await warte((x) => x?.tafeln?.length >= 1)
  const b = anfragen().filter((z) => z.schemaName === 'tafelbild_inhalt')
  pruefe(b.length === 2 && b[1].user.includes('MATERIAL DER LEHRKRAFT') && b[1].user.includes('200 Milliarden'), 'Mit Material: Text geht ausgewertet an die KI')
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, '09-mit-material.png') })

  // ---------- Zeitleiste: ungeordnet, ein Datum fehlt → Korrektur, chronologisch, Verbinder an ihrer Marke
  await sichtbar(page.getByRole('button', { name: 'Neues Tafelbild' })).click()
  await page.getByText('Thema & Einstellungen', { exact: true }).first().waitFor({ timeout: 10000 })
  await sichtbar(page.locator('[data-tb-thema]')).fill('Weimarer Republik 1918–1933')
  for (const f of ['Whiteboard / digitale Tafel (16:9)', 'Flipchart / Plakat (hochkant)']) await sichtbar(page.getByText(f, { exact: true })).click()
  await sichtbar(page.locator('[data-tb-struktur]')).click()
  await sichtbar(page.getByRole('option', { name: 'Zeitleiste' })).click()
  await sichtbar(page.locator('[data-tb-erstellen]')).click()
  t = await warte((x) => x?.inhalt?.struktur === 'zeitleiste' && x?.tafeln?.length === 4, 20000)
  const korr = anfragen().filter((z) => z.schemaName === 'tafelbild_korrektur')
  pruefe(korr.length === 1 && korr[0].user.includes('Kapp-Putsch') && korr[0].user.includes('kein Datum'), 'Zeitleiste: fehlendes Datum → Korrekturanfrage an die KI')
  const reihe = (t?.inhalt?.knoten ?? []).map((x) => x.id).join(' ')
  pruefe(reihe === 'z1 z2 z3 z4 z5 z7 z8', `Zeitleiste chronologisch (${reihe})`)
  for (const tf of t?.tafeln ?? []) {
    const achse = tf.elemente.find((e) => e.diagramm?.art === 'zeitstrahl')
    const falsch = []
    for (const kn of t.inhalt.knoten) {
      const kasten = tf.elemente.find((e) => e.knoten === kn.id && e.typ === 'kasten')
      const v = tf.elemente.find((e) => e.typ === 'verbinder' && e.von === kasten?.id)
      const marke = achse?.diagramm?.eintraege?.[v?.marke ?? -1]
      const jahr = (x) => /\d{4}/.exec(x ?? '')?.[0]
      if (!marke || v.nach !== achse.id || !jahr(marke.wert) || jahr(marke.wert) !== jahr(kn.zeit))
        falsch.push(`${kn.titel}→${marke?.wert ?? '?'}`)
    }
    const lage = achse?.diagramm?.eintraege?.map((e) => e.x ?? e.y) ?? []
    const steigend = lage.every((v, i) => !i || v >= lage[i - 1])
    const befunde = (t.pruefung ?? []).filter((b) => b.format === tf.format && (b.art === 'ueberlappung' || /kreuzen sich|läuft durch/.test(b.text)))
    pruefe(achse && !falsch.length && steigend && !befunde.length, `Zeitleiste ${tf.format}: jeder Verbinder an seiner Marke, Marken steigend, keine Kreuzung (${[...falsch, ...befunde.map((b) => b.text)].join(' | ') || 'ok'})`)
  }
  await page.locator('[data-tb-flaeche]').first().waitFor({ timeout: 10000 })
  for (const [i, f] of ['klapptafel', 'whiteboard', 'flipchart', 'heft'].entries()) {
    await page.locator('[data-tb-formate] label').nth(i).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(out, `11-zeitleiste-${f}.png`) })
  }
  // Abstände wählbar: gleiche Abstände
  await page.locator('[data-tb-flaeche] .tb-overlay').first().click({ position: { x: 5, y: 5 } })
  const za = sichtbar(page.locator('[data-tb-zeitachse]'))
  if (await za.isVisible().catch(() => false)) {
    await za.getByText('Gleiche Abstände', { exact: true }).click()
    t = await warte((x) => x?.meta?.zeitachse === 'gleich')
    const heft = t.tafeln.find((x) => x.format === 'heft')
    pruefe(t.meta.zeitachse === 'gleich' && Boolean(heft?.elemente?.some((e) => e.diagramm?.art === 'zeitstrahl')), 'Zeitleiste: Abstände wählbar (gleiche Abstände), neu gesetzt')
    await page.screenshot({ path: join(out, '12-zeitleiste-gleich.png') })
  } else pruefe(false, 'Zeitleiste: Auswahl der Abstände fehlt im Seitenfeld')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
}

console.log(problems.length ? `\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
