// Wache für die Startkarte „noch leer – jetzt erzeugen" (Befund der Lehrkraft 01.10.2026) – mit KI-ATTRAPPE.
// Vorher: npm run build. Aufruf: node tests/e2e/erzeugen-start.mjs <Ausgabeordner>
//
// Klassenarbeit: Nach „Weiter zu den Aufgaben" steht der Hauptknopf „Klassenarbeit erzeugen" groß und
// ohne Scrollen sichtbar in einer Karte oben im Inhalt und zusätzlich in der Fußleiste; die kleine
// Option in der Leiste fehlt, solange nichts erzeugt ist. Ein Klick erzeugt die Arbeit mit der Attrappe,
// danach ist die Karte weg und „Neu erzeugen" steht in der Leiste.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/erzeugen-start')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-erzeugen-start-'))
const attrappe = join(userData, 'ki-attrappe.json')
const teil = {
  blocks: [
    { outlineIndex: 0, type: 'text', title: 'Text', body: 'A short text for the check.', lineNumbers: true },
    {
      outlineIndex: 1,
      type: 'task',
      instruction: '**Describe** the situation.',
      operator: 'describe',
      afb: 'I',
      solution: 'Solution',
      points: 5,
      answer: { kind: 'lines', lines: 4 }
    }
  ]
}
writeFileSync(attrappe, JSON.stringify({ verzoegerungMs: 200, protokoll: join(userData, 'ki-protokoll.jsonl'), antworten: { exam_part: teil } }))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1366, 860))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const waehle = async (label, option) => {
  await sichtbar(page.getByLabel(label, { exact: true })).click()
  await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
  await page.waitForTimeout(300)
}

try {
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')
  await waehle('Fach', 'Englisch')
  await waehle('Jahrgang', 'Klasse 8')
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill('Holidays')
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()

  const karte = page.getByTestId('erzeugen-start')
  await karte.waitFor({ timeout: 10000 })
  const knopf = karte.getByRole('button', { name: 'Klassenarbeit erzeugen' })
  const kasten = await knopf.boundingBox()
  const fenster = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  pruefe(Boolean(kasten), 'Startkarte mit Knopf „Klassenarbeit erzeugen“ ist da')
  if (kasten) {
    pruefe(kasten.y >= 0 && kasten.y + kasten.height <= fenster.h, `Knopf ohne Scrollen im sichtbaren Bereich (y ${Math.round(kasten.y)} von ${fenster.h})`)
    pruefe(kasten.height >= 40, `Knopf ist groß (${Math.round(kasten.height)} px hoch)`)
    // Nicht verdeckt: Am Mittelpunkt liegt der Knopf selbst (oder ein Kind davon)
    const frei = await knopf.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return Boolean(oben && el.contains(oben))
    })
    pruefe(frei, 'Knopf ist nicht verdeckt')
  }
  pruefe(await karte.getByRole('button', { name: 'Aufgaben aus Material' }).isVisible(), 'Alternative „Aufgaben aus Material“ steht in der Karte')
  pruefe(await page.getByTestId('erzeugen-fuss').isVisible(), 'Hauptknopf steht auch in der Fußleiste')
  pruefe((await page.getByRole('button', { name: 'Neu erzeugen', exact: true }).count()) === 0, 'Ohne Entwurf kein „Neu erzeugen“ in der Leiste')
  await page.screenshot({ path: join(out, '01-startkarte.png') })

  await knopf.click()
  await page.locator('.ws-editor-pages .ws-page').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  pruefe((await karte.count()) === 0, 'Nach dem Erzeugen ist die Startkarte weg')
  pruefe((await page.getByTestId('erzeugen-fuss').count()) === 0, 'Nach dem Erzeugen ist die Fußleiste weg')
  pruefe(await page.getByRole('button', { name: 'Neu erzeugen', exact: true }).isVisible(), '„Neu erzeugen“ steht danach in der Leiste')
  await page.screenshot({ path: join(out, '02-erzeugt.png') })
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => {})
} finally {
  await app.close().catch(() => {})
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // Electron hält Dateien manchmal noch kurz fest
  }
}

if (problems.length) {
  console.error(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nStartkarte „Klassenarbeit erzeugen“: alles in Ordnung.')
