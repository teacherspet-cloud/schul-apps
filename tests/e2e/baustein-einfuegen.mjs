// Wache für den Arbeitsblatt-Editor und die Gliederung (Paket 6) – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/baustein-einfuegen.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026):
// - Baustein an beliebiger Stelle einfügen (nicht nur am Ende) und duplizieren – in der
//   Gliederung und im Editor, jeweils mit Strg+Z zurücknehmbar.
// - Seltene Aktionen im „⋯“-Menü, KI-Aktionen in einem beschrifteten Menü, Blattoptionen
//   gebündelt; jeder Symbolknopf hat einen Namen für Bildschirmleser.
//
// Die KI-Menüeinträge werden nur geöffnet und gezählt, nie angeklickt.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/baustein-einfuegen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-einfuegen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1400, height: 900 })
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(3))
await page.waitForTimeout(1500)
// Drei Bausteine: Text, Merkkasten, Aufgabe
await page.evaluate(() => {
  const ws = structuredClone(window.__selftest.worksheetJetzt())
  const blocks = ws.sheets[0].blocks
  blocks.push({ id: 'm1', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Merke A: Die Verfassung trat 1919 in Kraft.' })
  blocks.push({
    id: 'a1',
    type: 'task',
    instruction: 'Fasse den Bericht zusammen.',
    operator: 'Fasse zusammen',
    afbReason: '',
    socialForm: 'EA',
    answer: { kind: 'lines', count: 4 },
    parts: [],
    solution: '',
    points: 0,
    minutes: 10
  })
  window.__selftest.setWorksheet(ws)
})
await page.waitForTimeout(2000)

const reihenfolge = () => page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.map((b) => `${b.id}:${b.type}`))
const start = await reihenfolge()
console.log('Anfang:', start.join(' | '))
pruefe(start.length === 3, 'Drei Bausteine zum Start')
await page.screenshot({ path: join(out, 'paket6-editor-start.png') })
console.log('Rahmen:', await page.locator('.ws-editor-pages .editor-block').count())

/** Das „⋯“-Menü des Bausteins öffnen, der diesen Text enthält. */
const menueVon = async (text) => {
  const rahmen = page.locator('.ws-editor-pages .editor-block', { hasText: text }).last()
  await rahmen.hover()
  await rahmen.locator('[aria-label="Weitere Aktionen"]').first().click()
  await page.waitForTimeout(400)
}

// ---------- Duplizieren im Editor ----------
await menueVon('Merke A')
await page.screenshot({ path: join(out, 'paket6-baustein-menue.png') })
await page.getByRole('menuitem', { name: 'Duplizieren' }).click()
await page.waitForTimeout(1200)
let jetzt = await reihenfolge()
console.log('nach Duplizieren:', jetzt.join(' | '))
pruefe(
  jetzt.length === 4 && jetzt[1] === 'm1:infoBox' && jetzt[2].endsWith(':infoBox') && !jetzt[2].startsWith('m1:') && jetzt[3] === 'a1:task',
  'Editor: Die Kopie steht direkt unter dem Original, mit eigener Kennung'
)
const kopieText = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks[2].body)
pruefe(kopieText.includes('Merke A'), 'Editor: Die Kopie hat denselben Inhalt')
await page.locator('.editor-canvas').click({ position: { x: 20, y: 20 } })
await page.keyboard.press('Control+z')
await page.waitForTimeout(1000)
jetzt = await reihenfolge()
pruefe(jetzt.length === 3 && jetzt.join() === start.join(), 'Editor: Strg+Z nimmt das Duplizieren zurück')

// ---------- In der Mitte einfügen ----------
await menueVon('Bericht aus der Versammlung')
// Am Tablet gibt es kein Überfahren – das Untermenü öffnet auch per Klick
await page.getByRole('menuitem', { name: 'Darunter einfügen' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: join(out, 'paket6-einfuegen-untermenue.png') })
await page.locator('.mantine-Menu-item', { hasText: 'Merkkasten' }).last().click()
await page.waitForTimeout(1200)
jetzt = await reihenfolge()
console.log('nach Einfügen:', jetzt.join(' | '))
pruefe(
  jetzt.length === 4 && jetzt[0] === start[0] && jetzt[1].endsWith(':infoBox') && jetzt[2] === 'm1:infoBox',
  'Editor: Der neue Merkkasten steht an zweiter Stelle, nicht am Ende'
)
await page.locator('.editor-canvas').click({ position: { x: 20, y: 20 } })
await page.keyboard.press('Control+z')
await page.waitForTimeout(1000)
pruefe((await reihenfolge()).join() === start.join(), 'Editor: Strg+Z nimmt das Einfügen zurück')

// ---------- KI-Menü: beschriftet, beide Aktionen darin (nicht anklicken!) ----------
const ki = page.locator('.ws-editor-pages [aria-label="KI-Aktionen"]').first()
pruefe((await ki.innerText()).trim() === 'KI', 'Der KI-Knopf ist beschriftet („KI“)')
await ki.click()
await page.waitForTimeout(400)
pruefe((await page.getByRole('menuitem', { name: /Mit KI überarbeiten/ }).count()) > 0, 'Im KI-Menü: „Mit KI überarbeiten …“')
pruefe((await page.getByRole('menuitem', { name: /Mit KI neu erzeugen/ }).count()) > 0, 'Im KI-Menü: „Mit KI neu erzeugen“')
await page.screenshot({ path: join(out, 'paket6-ki-menue.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ---------- Symbolknöpfe haben Namen ----------
const ohneNamen = await page.evaluate(() =>
  [...document.querySelectorAll('.ws-editor-pages .editor-block-toolbar button, .app-toolbar button')]
    .filter((b) => b.offsetParent !== null)
    .filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim()))
    .map((b) => b.outerHTML.slice(0, 80))
)
pruefe(ohneNamen.length === 0, `Jeder Knopf in Leiste und Bausteinleiste hat einen Namen (${ohneNamen.length} ohne: ${ohneNamen.join(' ')})`)
const zahl = await page.evaluate(() => document.querySelector('.ws-editor-pages .editor-block-toolbar')?.querySelectorAll('button').length ?? 0)
console.log(`Knöpfe am ersten Baustein: ${zahl}`)
pruefe(zahl <= 7, `Die Bausteinleiste ist ausgedünnt (${zahl} Knöpfe)`)

// ---------- Blattoptionen ----------
await page.getByRole('button', { name: 'Blattoptionen' }).click()
await page.waitForTimeout(400)
for (const name of ['Korrekturrand', 'Notizrand', 'Blocksatz', 'Deckblatt', 'KI-Test']) {
  pruefe(await page.locator('label', { hasText: name }).first().isVisible(), `Blattoptionen enthalten „${name}“`)
}
await page.screenshot({ path: join(out, 'paket6-blattoptionen.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
// Die Leiste des Editors: die sichtbare mit dem Knopf „Blattoptionen“
const [leiste, breite] = await page.evaluate(() => {
  const l = [...document.querySelectorAll('.app-toolbar')].find((x) => x.offsetParent !== null && x.textContent?.includes('Blattoptionen'))
  return [l?.scrollWidth ?? -1, l?.clientWidth ?? -1]
})
pruefe(breite > 0 && leiste <= breite + 1, `Die Editorleiste passt ohne seitliches Wischen (${leiste} ≤ ${breite})`)
await page.screenshot({ path: join(out, 'paket6-editor-leiste.png') })

// ---------- Gliederung ----------
await page.evaluate(() => {
  const ws = structuredClone(window.__selftest.worksheetJetzt())
  ws.outline = {
    title: 'Weimar',
    minutes: 45,
    learningGoals: ['Die Lernenden ordnen den Bericht ein.'],
    teacherNote: '',
    items: [
      { id: 'g1', type: 'text', purpose: 'Bericht aus der Versammlung', operator: '', socialForm: 'EA', answerKind: 'lines' },
      { id: 'g2', type: 'task', purpose: 'Zusammenfassen', operator: 'Fasse zusammen', socialForm: 'EA', answerKind: 'lines', afb: 'I' },
      { id: 'g3', type: 'task', purpose: 'Beurteilen', operator: 'Beurteile', socialForm: 'EA', answerKind: 'lines', afb: 'III' }
    ]
  }
  window.__selftest.setWorksheet(ws, 1)
})
await page.waitForSelector('text=Gliederung prüfen')
await page.waitForTimeout(800)
const punkte = () => page.evaluate(() => window.__selftest.worksheetJetzt().outline.items.map((i) => `${i.id}:${i.type}`))
const gStart = await punkte()

const stelle = page.locator('[aria-label="Baustein an Stelle 2 einfügen"]')
await stelle.hover()
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, 'paket6-gliederung-einfuegen.png') })
await stelle.click()
await page.waitForTimeout(300)
await page.locator('.mantine-Menu-item', { hasText: 'Merkkasten' }).last().click()
await page.waitForTimeout(600)
let g = await punkte()
console.log('Gliederung nach Einfügen:', g.join(' | '))
pruefe(g.length === 4 && g[0] === 'g1:text' && g[1].endsWith(':infoBox') && g[2] === 'g2:task', 'Gliederung: Einfügen zwischen Punkt 1 und 2')

await page.locator('[aria-label="Baustein duplizieren"]').nth(2).click()
await page.waitForTimeout(600)
g = await punkte()
console.log('Gliederung nach Duplizieren:', g.join(' | '))
pruefe(g.length === 5 && g[2] === 'g2:task' && g[3].endsWith(':task') && !g[3].startsWith('g2:'), 'Gliederung: Duplikat direkt unter dem Original')
const gleich = await page.evaluate(() => {
  const it = window.__selftest.worksheetJetzt().outline.items
  return it[2].purpose === it[3].purpose && it[2].operator === it[3].operator
})
pruefe(gleich, 'Gliederung: Das Duplikat hat dieselbe Beschreibung und denselben Operator')

await page.locator('text=Gliederung prüfen').click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
pruefe((await punkte()).join() === gStart.join(), 'Gliederung: Zweimal Strg+Z stellt den Anfang wieder her')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
