// Praxistest der Änderungen vom 26.09.2026 (vorher: npm run build).
// Aufruf: node tests/e2e/praxistest-2026-09-26.mjs <Ausgabeordner>
//
// Geprüft wird an der gebauten App:
//  1. Werkzeugleiste nur am überfahrenen Baustein, mit Nachlauf
//  2. Fassungs-Marke „Fassung 2 / 2 · neu"
//  3. Tipp-/Hilfekarten mit Werkzeugleiste
//  4. Musterlösung auf Rechenkästchen (Lösungsansicht), Skizze inklusive
//  5. Gegliederte KI-Hinweise
//  6. Notenpunkte 0–15 auf der Lehrkraftseite
//  7. Material aus Internetadresse: Webseite und YouTube-Video (braucht Internet)
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/praxistest')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-praxis-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(4))
await page.waitForTimeout(2500)

// ---------- 1. Werkzeugleiste nur beim Überfahren
const sichtbarkeit = async () =>
  page.evaluate(() => {
    const t = document.querySelector('.ws-editor-pages .editor-block-toolbar')
    return t ? getComputedStyle(t).visibility : 'fehlt'
  })
const neutral = await page.locator('.app-toolbar').first().boundingBox()
const weg = async () => page.mouse.move(neutral.x + neutral.width - 10, neutral.y + neutral.height / 2)
await weg()
await page.waitForTimeout(1500)
pruefe((await sichtbarkeit()) === 'hidden', `Ohne Maus ist die Leiste unsichtbar (${await sichtbarkeit()})`)
const block = page.locator('.ws-editor-pages .editor-block').first()
await block.hover()
await page.waitForTimeout(250)
pruefe((await sichtbarkeit()) === 'visible', 'Beim Überfahren erscheint sie')
await weg()
await page.waitForTimeout(300)
pruefe((await sichtbarkeit()) === 'visible', 'Nach dem Verlassen bleibt sie noch kurz stehen (Nachlauf)')
await page.waitForTimeout(1200)
pruefe((await sichtbarkeit()) === 'hidden', 'Nach gut einer Sekunde ist sie wieder weg')
await block.click({ position: { x: 20, y: 5 } })
await weg()
await page.waitForTimeout(1500)
pruefe((await sichtbarkeit()) === 'visible', 'Ein Klick in den Baustein hält sie offen, auch ohne Maus darüber')
await page.mouse.click(neutral.x + neutral.width - 10, neutral.y + neutral.height / 2)
await page.waitForTimeout(1500)
pruefe((await sichtbarkeit()) === 'hidden', 'Ein Klick woanders schließt sie wieder')
const ueberlappung = await page.evaluate(() => {
  const leisten = [...document.querySelectorAll('.ws-editor-pages .editor-block-toolbar')].filter((t) => getComputedStyle(t).visibility === 'visible')
  return leisten.length
})
pruefe(ueberlappung <= 1, `Höchstens eine Leiste zugleich sichtbar (${ueberlappung})`)

// ---------- 2. Fassungs-Marke
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const b = ws.sheets[0].blocks.find((x) => x.type === 'text')
  const { versions, versionIndex, ...rest } = b
  void versions
  void versionIndex
  const erster = { ...rest, body: 'ERSTE Fassung.' }
  const zweiter = { ...rest, body: 'ZWEITE Fassung.' }
  Object.assign(b, { ...zweiter, versions: [erster, zweiter], versionIndex: 1 })
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(1500)
const marke = page.locator('.editor-version-bar').first()
const markeText = (await marke.innerText()).replace(/\s+/g, ' ')
pruefe(markeText.includes('Fassung 2 / 2') && markeText.includes('neu'), `Fassungs-Marke lautet „${markeText}"`)
const markeLinks = await marke.evaluate((el) => {
  const r = el.getBoundingClientRect()
  const p = el.closest('.editor-block').getBoundingClientRect()
  return r.left - p.left < p.width / 3
})
pruefe(markeLinks, 'Sie sitzt links oben am Baustein')

// ---------- 3. Hilfekarten mit Werkzeugleiste
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  ws.sheets[0].blocks.push({ id: 'hk1', type: 'scaffold', variant: 'hilfekarten', title: 'Tipp 1', items: ['Erst lesen, dann schreiben.'] })
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(2000)
const hkLeiste = await page.locator('.ws-helpcards-page .editor-block-toolbar').count()
pruefe(hkLeiste > 0, `Die Hilfekarte hat eine Werkzeugleiste (${hkLeiste})`)
await page.locator('.ws-helpcards-page .editor-block').first().hover()
await page.waitForTimeout(300)
await page.locator('.ws-helpcards-page [aria-label="KI-Aktionen"]').first().click()
await page.waitForTimeout(400)
pruefe((await page.getByRole('menuitem', { name: 'Mit KI neu erzeugen' }).count()) > 0, 'Ihr KI-Menü bietet „neu erzeugen"')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ---------- 4. Musterlösung auf Rechenkästchen + 6. Notenpunkte
const KMK = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20, 0]
await page.evaluate((schwellen) => {
  const ws = window.__selftest.worksheetJetzt()
  let t = ws.sheets[0].blocks.find((x) => x.type === 'task')
  if (!t) {
    // Der Prüfstand-Materialtext hat keine Aufgabe – eine Rechenaufgabe mit Kästchen anlegen
    const leer = { kind: 'grid', count: 8, heightMm: 0, gapText: '', left: [], right: [], pairs: [], options: [], correct: [], statements: [], items: [], displayOrder: [], headers: [], rows: [], solutionRows: [], labels: [] }
    const vorbild = ws.sheets[0].blocks[0]
    t = { id: 'praxis-aufgabe', type: 'task', instruction: 'Berechne 3 · 4 + 5.', operator: 'Berechne', afbReason: '', socialForm: 'EA', answer: leer, parts: [], solution: '', points: 0, minutes: 0, ...(vorbild?.stars ? { stars: vorbild.stars } : {}) }
    ws.sheets[0].blocks.splice(1, 0, t)
  }
  t.parts = []
  t.answer = { ...t.answer, kind: 'grid', count: 8 }
  t.modelAnswer = '3 · 4 = 12\n\n12 + 5 = 17'
  t.modelSketch = '<svg viewBox="0 0 170 40" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="20" x2="160" y2="20" stroke="#000" stroke-width="0.5"/><text x="12" y="16" font-size="4">28. Juli</text><script>alert(1)</script></svg>'
  t.solution = '- Rechenweg vollständig\n- Ergebnis 17'
  ws.meta.gradeScale = { groups: [{ label: '', points: 60 }], punkte: { schwellen, hinweis: 'Prüfstand' } }
  ws.meta.teacherNote =
    'Die Planung umfasst eine Aufgabenseite. Originalquelle „Telegramm": Wortlaut gegen die Fundstelle geprueft. Umfang: 236 von 2211 Wörtern (11 % des Originals). Auslassung 1: 179 Wörter ab „Deutsche Regierung …" Ergänzung in eckigen Klammern: „" Originalquellen (3 Textquelle(n)): Die KI gibt Quellen aus dem Gedächtnis wieder – Wortlaut und Quellenangabe vor dem Einsatz prüfen (Hinweise an den Bausteinen).'
  window.__selftest.setWorksheet(structuredClone(ws))
}, KMK)
await page.waitForTimeout(2500)
const vorher = await page.evaluate(() => ({
  bloecke: window.__selftest.worksheetJetzt().sheets[0].blocks.map((b) => `${b.type}${b.stars ? '★' + b.stars : ''}`).join(','),
  gemessen: document.querySelectorAll('.ws-measure .ws-task').length,
  mess: [...document.querySelectorAll('.ws-measure [data-measure-block]')].map((w) => `${w.dataset.measureBlock}:${Math.round(w.getBoundingClientRect().height)}`).join(','),
  plan: (() => {
    const l = window.__selftest.layouts
    if (!l) return 'keine'
    return [...l.entries()].map(([k, pages]) => `${k}=` + pages.map((pg) => pg.items.map((i) => i.id).join('+')).join('|')).join(' ; ')
  })(),
  task: document.querySelectorAll('.ws-editor-pages .ws-task').length,
  grid: document.querySelectorAll('.ws-editor-pages .ws-grid').length
}))
console.log('Schülerblatt:', JSON.stringify(vorher))
pruefe(vorher.grid > 0, 'Auf dem Schülerblatt stehen die Rechenkästchen')
pruefe((await page.locator('.ws-editor-pages .ws-grid-muster').count()) === 0, 'Auf dem Schülerblatt bleiben die Kästchen leer')
await page.locator('.app-toolbar label:has-text("Lösungen")').first().click()
await page.waitForTimeout(2500)
const diagnose = await page.evaluate(() => ({
  ansicht: [...document.querySelectorAll('.app-toolbar .mantine-SegmentedControl-label')].map((l) => `${l.innerText}${l.getAttribute('data-active') !== null ? '*' : ''}`).join(','),
  keySeite: document.querySelectorAll('.ws-editor-pages .editor-sheet-key, .ws-editor-pages .ws-page').length,
  grid: document.querySelectorAll('.ws-editor-pages .ws-grid').length,
  muster: document.querySelectorAll('.ws-editor-pages .ws-grid-muster').length,
  solution: document.querySelectorAll('.ws-editor-pages .ws-solution').length,
  task: document.querySelectorAll('.ws-editor-pages .ws-task').length,
  text: document.querySelector('.ws-editor-pages')?.innerText.replace(/\s+/g, ' ').slice(0, 300)
}))
console.log('Diagnose Lösungsansicht:', JSON.stringify(diagnose))
const muster = page.locator('.ws-editor-pages .ws-grid-muster').first()
pruefe((await muster.count()) > 0, 'In der Lösungsansicht trägt das Kästchenraster die Musterlösung')
const musterText = (await muster.count()) ? (await muster.innerText()).replace(/\s+/g, ' ') : ''
pruefe(musterText.includes('12 + 5 = 17'), `Der Rechenweg steht in den Kästchen („${musterText.slice(0, 60)}")`)
const skizze = (await muster.count())
  ? await muster.evaluate((el) => ({ svg: el.querySelectorAll('svg').length, script: el.querySelectorAll('script').length, raster: getComputedStyle(el).backgroundImage.includes('gradient') }))
  : { svg: 0, script: 0, raster: false }
pruefe(skizze.svg === 1 && skizze.script === 0, `Die Skizze liegt als SVG darauf, Skript entfernt (${JSON.stringify(skizze)})`)
pruefe(skizze.raster, 'Das Kästchenraster bleibt sichtbar')
pruefe((await page.locator('.ws-editor-pages .ws-solution').first().count()) > 0, 'Der Erwartungshorizont steht darunter')

// Notenpunkte auf der Lehrkraftseite
const zeilen = await page.evaluate(() => [...document.querySelectorAll('.ws-editor-pages .ws-teacher-page .ws-gradescale tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
pruefe(zeilen.length === 16, `Die Lehrkraftseite zeigt 16 Punktzeilen (${zeilen.length})`)
pruefe(zeilen[0]?.startsWith('15 1+ 57 – 60'), `Erste Zeile: „${zeilen[0]}"`)
pruefe(zeilen[15]?.startsWith('0 6 0 – 11'), `Letzte Zeile: „${zeilen[15]}"`)

// KI-Menü in der Lösungsansicht bietet die Lösungserzeugung
const aufgabe = page.locator('.ws-editor-pages .editor-block:has(.ws-task)').first()
await aufgabe.hover()
await page.waitForTimeout(300)
await aufgabe.locator('[aria-label="KI-Aktionen"]').first().click()
await page.waitForTimeout(400)
pruefe((await page.getByRole('menuitem', { name: 'Lösung im Erwartungshorizont generieren' }).count()) > 0, 'KI-Menü der Lösungsansicht: „Lösung im Erwartungshorizont generieren"')
pruefe((await page.getByRole('menuitem', { name: 'Beispiellösung in Aufgabe hinzufügen' }).count()) > 0, 'Umbenannt: „Beispiellösung in Aufgabe hinzufügen"')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, 'loesungsansicht.png'), fullPage: false })

// ---------- 5. Gegliederte KI-Hinweise
await page.locator('[aria-label="Hinweise für die Lehrkraft anzeigen"]').click()
await page.waitForTimeout(800)
const gruppen = await page.evaluate(() => [...document.querySelectorAll('.mantine-Modal-content [data-hinweis-gruppe]')].map((g) => g.dataset.hinweisGruppe))
pruefe(gruppen.join(',') === 'blatt,quelle,quellen', `Hinweise in Gruppen gegliedert (${gruppen.join(', ')})`)
const modalText = (await page.locator('.mantine-Modal-content').innerText()).replace(/\s+/g, ' ')
pruefe(modalText.includes('Auszug: 236 von 2211'), 'Der Umfang steht als eine Zeile')
pruefe(!modalText.includes('Klammern: „"'), 'Die leere Klammer-Ergänzung ist weg')
pruefe(modalText.includes('Einzelheiten anzeigen'), 'Auslassungen sind eingeklappt')
await page.screenshot({ path: join(out, 'hinweise.png') })
await page.locator('.mantine-Modal-content').getByRole('button', { name: 'Schließen', exact: true }).click()
await page.waitForTimeout(400)

// ---------- 7. Material aus Internetadresse (Netz)
const seite = await page.evaluate(() => window.api.sources.laden('https://de.wikipedia.org/wiki/Photosynthese').catch((e) => ({ fehler: String(e) })))
pruefe(!seite.fehler && seite.text.length > 2000, `Webseite geladen: ${seite.titel ?? '?'} (${seite.text?.length ?? 0} Zeichen${seite.fehler ? `, ${seite.fehler}` : ''})`)
const video = await page.evaluate(() => window.api.sources.video('https://www.youtube.com/watch?v=dQw4w9WgXcQ').catch((e) => ({ fehler: String(e) })))
console.log(`Video: Titel „${video.titel}", Kanal „${video.kanal}", ${video.dauerSekunden} s, Transkript ${video.transkript?.length ?? 0} Zeichen (${video.transkriptSprache}${video.automatisch ? ', automatisch' : ''})${video.fehler ? ` – ${video.fehler}` : ''}`)
pruefe(Boolean(video.titel), 'Video: Titel gelesen')
pruefe((video.transkript?.length ?? 0) > 500, 'Video: Transkript aus den Untertiteln gelesen')

// Über die Oberfläche: Adresse im Schritt „Thema" eintragen
await page.getByRole('button', { name: 'Gliederung', exact: true }).click()
await page.waitForTimeout(600)
const zurueck = page.getByRole('button', { name: /Thema|Zurück/ }).first()
if (await zurueck.count()) {
  await zurueck.click()
  await page.waitForTimeout(600)
}
const feld = page.locator('[aria-label="Internetadresse als Material"]').first()
if (await feld.count()) {
  await feld.fill('https://de.wikipedia.org/wiki/Zellatmung')
  await feld.press('Enter')
  await page.waitForSelector('text=Zellatmung', { timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  const quellen = await page.evaluate(() => window.__selftest.worksheetJetzt()?.sources.map((s) => `${s.kind}:${s.fileName}:${s.text.length}`) ?? [])
  pruefe(quellen.some((q) => q.startsWith('web:')), `Die Adresse liegt als Material in der Liste (${quellen.join(' | ')})`)
  await page.screenshot({ path: join(out, 'url-material.png') })
} else {
  pruefe(false, 'Das Adressfeld für Material wurde im Schritt „Thema" nicht gefunden')
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
