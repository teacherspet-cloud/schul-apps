// Wache für ENTWÜRFE eines Bausteins (vorher: npm run build).
// Aufruf: node tests/e2e/entwuerfe.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026): „mach die inhalte der bausteine im 3. menü auch neu
// generierbar (bewahre aber die möglichkeit, zwischen vorherigen und späteren entwürfen hin
// und herzuwechseln durch pfeile nach links und rechts mit einer nummerierten aufzählung, die
// anzeigt, den wievielten von wievielen entwürfen man gerade ausgewählt hat)."
//
// Beides gab es schon; diese Wache hält es fest. Geprüft wird der ganze Weg: Ist der Knopf
// zum Neu-Erzeugen da, erscheinen bei mehreren Entwürfen die Pfeile mit der Zählung, und
// wechselt der INHALT beim Blättern wirklich? Die Entwürfe werden dafür gesetzt statt von der
// KI erzeugt – ein echter Lauf würde Kontingent verbrauchen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/entwuerfe')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-entwurf-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
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

// --- Neu erzeugen muss angeboten werden (geklickt wird nicht: das riefe die KI)
const neu = page.locator('[aria-label="Mit KI neu erzeugen"]')
pruefe((await neu.count()) > 0, 'Jeder Baustein lässt sich neu erzeugen')
const ueberarbeiten = page.locator('[aria-label="Mit KI überarbeiten"]')
pruefe((await ueberarbeiten.count()) > 0, 'Daneben steht das Überarbeiten mit eigenem Auftrag')

// Ohne zweiten Entwurf gibt es nichts zu blättern
pruefe((await page.locator('.editor-version-bar').count()) === 0, 'Bei nur einem Entwurf erscheinen keine Pfeile')

// --- Zwei Entwürfe setzen, wie sie nach zwei KI-Läufen entstünden
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const block = ws.sheets[0].blocks.find((b) => b.type === 'text')
  const ohne = (b) => {
    const { versions, versionIndex, ...rest } = b
    void versions
    void versionIndex
    return structuredClone(rest)
  }
  const erster = { ...ohne(block), body: 'ERSTER Entwurf des Materials.' }
  const zweiter = { ...ohne(block), body: 'ZWEITER Entwurf des Materials.' }
  Object.assign(block, zweiter, { versions: [erster, zweiter], versionIndex: 1 })
  window.__selftest.setWorksheet(ws)
})
await page.waitForTimeout(2500)

const leiste = page.locator('.editor-version-bar').first()
pruefe((await leiste.count()) > 0, 'Bei mehreren Entwürfen erscheint die Leiste')
const zaehlung = async () => (await leiste.innerText()).replace(/\s+/g, ' ').trim()
const inhalt = async () => page.evaluate(() => document.querySelector('.ws-editor-pages .ws-text')?.innerText ?? '')

console.log(`Anzeige: „${await zaehlung()}"`)
pruefe((await zaehlung()).includes('2 von 2'), `Sie zeigt den wievielten von wie vielen („${await zaehlung()}")`)
pruefe((await inhalt()).includes('ZWEITER'), 'Angezeigt wird der zweite Entwurf')

// --- Zurückblättern
await leiste.locator('[aria-label="Vorheriger Entwurf"]').click()
await page.waitForTimeout(2000)
console.log(`nach links: „${await zaehlung()}"`)
pruefe((await zaehlung()).includes('1 von 2'), 'Nach links steht „Entwurf 1 von 2"')
pruefe((await inhalt()).includes('ERSTER'), 'Der Inhalt wechselt zum ersten Entwurf')

// --- Und wieder vor
await leiste.locator('[aria-label="Nächster Entwurf"]').click()
await page.waitForTimeout(2000)
pruefe((await zaehlung()).includes('2 von 2'), 'Nach rechts steht wieder „Entwurf 2 von 2"')
pruefe((await inhalt()).includes('ZWEITER'), 'Der zweite Entwurf ist zurück')

await page.screenshot({ path: join(out, 'entwuerfe.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nBausteine lassen sich neu erzeugen; zwischen den Entwürfen wird geblättert. Bild in ${out}`)
