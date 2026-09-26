// Wache für Paket 15 A und B (Themenbereiche) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/themen-einsortieren.mjs <Ausgabeordner>
//
// Wünsche der Lehrkraft vom 26.09.2026:
//  A) ⋯ am Fach: „Alle Materialien automatisch einsortieren" – mit Rückfrage (Standard: nur
//     automatisch und nicht Zugeordnetes; wahlweise alle, dann gelten sie als automatisch),
//     Zusammenfassung „… einsortiert, … verschoben" und EINEM Rückgängig-Schritt.
//  B) „nur <Art>": nur Bereiche mit Materialien dieser Art (auch in Unterbereichen, samt
//     Oberbereichen), Zähler nur dieser Art; eben angelegte, leere Bereiche bleiben in dieser
//     Sitzung sichtbar. „alle Materialien" wie bisher. In allen Bibliotheken.
// Bildschirmfotos: paket15-themen-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/themen-einsortieren')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-einsortieren-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})

const sichtbar = (loc) => loc.filter({ visible: true })
const shot = (name) => page.screenshot({ path: join(out, `paket15-themen-${name}.png`) })
const ordner = (name) => sichtbar(page.locator(`[data-bereich="${name}"]`))

const blatt = (id, name) => ({
  id,
  name,
  stats: { subjectId: 'biologie', subjectLabel: 'Biologie', topic: name, grade: 7, schoolTypeName: 'Gymnasium', sheetCount: 1, hasBoard: false },
  payload: {}
})

async function aufklappen(fachId) {
  const abschnitt = sichtbar(page.locator(`[data-fach-abschnitt="${fachId}"]`)).first()
  if ((await abschnitt.getAttribute('data-offen')) === 'true') return
  await abschnitt
    .getByRole('button', { name: /aufklappen$/ })
    .first()
    .click()
  await page.waitForTimeout(400)
}
async function bibliothek(modul, knopf) {
  await page.click(`[aria-label="${modul}"]`)
  await page.waitForTimeout(500)
  const k = sichtbar(page.getByRole('button', { name: knopf, exact: true }))
  if (await k.count()) await k.first().click()
  await page.waitForTimeout(900)
}
const umfang = async (label) => {
  await sichtbar(page.locator('.mantine-SegmentedControl-label', { hasText: label }))
    .first()
    .click()
  await page.waitForTimeout(600)
}
const stand = () => page.evaluate(async () => await window.api.themen.list())
/** Zuordnungen vergleichbar machen – die Reihenfolge der Schlüssel ändert sich beim Wiederherstellen */
const gleich = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

try {
  await warteAufOberflaeche(page)
  // Bestand: Bereiche in Biologie, Blätter teils automatisch, teils von Hand zugeordnet, eine Klassenarbeit
  await page.evaluate(
    async ({ blaetter }) => {
      const api = window.api
      await api.themen.automatik('biologie', false)
      const am = new Date().toISOString()
      await api.themen.bereich({ id: 'zelle001', fachId: 'biologie', name: 'Zelle' })
      await api.themen.bereich({ id: 'organ001', fachId: 'biologie', name: 'Zellorganellen', elternId: 'zelle001' })
      await api.themen.bereich({ id: 'sonst001', fachId: 'biologie', name: 'Sonstiges' })
      await api.themen.bereich({ id: 'genet001', fachId: 'biologie', name: 'Genetik' })
      await api.themen.bereich({ id: 'pruef001', fachId: 'biologie', name: 'Prüfungen' })
      for (const b of blaetter) await api.sheets.save(b)
      await api.exams.save({
        id: 'ka000001',
        name: 'Klassenarbeit Halbjahr',
        stats: { subjectLabel: 'Biologie', grade: 7, topic: 'Halbjahr', partCount: 1, hasTasks: true, minutes: 45 },
        payload: {}
      })
      await api.themen.zuordnen({
        'arbeitsblatt:bio00001': { bereichId: 'sonst001', von: 'auto', am },
        'arbeitsblatt:bio00003': { bereichId: 'sonst001', von: 'hand', am },
        'arbeitsblatt:bio00004': { bereichId: 'sonst001', von: 'hand', am },
        'arbeitsblatt:bio00005': { bereichId: 'organ001', von: 'hand', am },
        'klassenarbeit:ka000001': { bereichId: 'pruef001', von: 'hand', am }
      })
    },
    {
      blaetter: [
        blatt('bio00001', 'Die Zelle'),
        blatt('bio00002', 'Zellatmung und Gärung'),
        blatt('bio00003', 'Ökosystem Wald'),
        blatt('bio00004', 'Exkursion ins Moor'),
        blatt('bio00005', 'Zellorganellen im Überblick')
      ]
    }
  )
  await page.reload()
  await warteAufOberflaeche(page)

  // ---------- B) „nur Arbeitsblätter"
  console.log('\nB) nur eine Materialart')
  await bibliothek('Arbeitsblatt', 'Meine Arbeitsblätter')
  await umfang('nur Arbeitsblätter')
  await aufklappen('biologie')
  pruefe((await ordner('Zelle').count()) === 1 && (await ordner('Sonstiges').count()) === 1, 'Bereiche mit Arbeitsblättern sichtbar („Zelle", „Sonstiges")')
  pruefe((await ordner('Genetik').count()) === 0, 'Leerer Bereich „Genetik" ausgeblendet')
  pruefe((await ordner('Prüfungen').count()) === 0, 'Bereich „Prüfungen" (nur eine Klassenarbeit) ausgeblendet')
  pruefe(
    (await ordner('Zelle').innerText()).includes('1 Material'),
    `„Zelle" zählt das Blatt im Unterbereich („${(await ordner('Zelle').innerText()).replace(/\s+/g, ' ')}")`
  )
  await sichtbar(page.getByRole('button', { name: '„Zelle“ aufklappen' }))
    .first()
    .click()
  await page.waitForTimeout(300)
  pruefe((await ordner('Zellorganellen').count()) === 1, 'Aufgeklappt: der Unterbereich mit dem Blatt')
  await shot('nur-art')
  await umfang('alle Materialien')
  pruefe((await ordner('Genetik').count()) === 1 && (await ordner('Prüfungen').count()) === 1, '„alle Materialien": alle Bereiche wie bisher')
  await umfang('nur Arbeitsblätter')
  // Eben angelegt, noch leer: bleibt sichtbar
  await sichtbar(page.locator('[data-fach-abschnitt="biologie"]')).getByRole('button', { name: 'Themenbereich', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name des neuen Themenbereichs' }).fill('Evolution')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  pruefe((await ordner('Evolution').count()) === 1, 'Eben angelegter, leerer Bereich bleibt bei „nur Arbeitsblätter" sichtbar')
  // In einer anderen Bibliothek derselben Sitzung ebenso; dort zählt nur deren Art
  await bibliothek('Klassenarbeiten', 'Meine Klassenarbeiten')
  await umfang('nur Klassenarbeiten')
  await aufklappen('biologie')
  pruefe(
    (await ordner('Prüfungen').count()) === 1 && (await ordner('Zelle').count()) === 0 && (await ordner('Evolution').count()) === 1,
    'Klassenarbeiten: „Prüfungen" und der neue „Evolution" sichtbar, „Zelle" nicht'
  )
  await shot('nur-klassenarbeiten')
  // Neue Sitzung: der leere Bereich tritt zurück
  await page.reload()
  await warteAufOberflaeche(page)
  await bibliothek('Arbeitsblatt', 'Meine Arbeitsblätter')
  await aufklappen('biologie')
  pruefe((await ordner('Evolution').count()) === 0, 'Nach dem Neuladen (neue Sitzung) ist der leere Bereich ausgeblendet')

  // ---------- A) Alle Materialien automatisch einsortieren
  console.log('\nA) Alle einsortieren')
  const menue = async () => {
    await sichtbar(page.getByRole('button', { name: 'Einstellungen der Themenbereiche in Biologie' }))
      .first()
      .click()
    await page.getByRole('menuitem', { name: 'Alle Materialien automatisch einsortieren' }).click()
    await page.waitForTimeout(400)
    return sichtbar(page.locator('[data-einsortieren-rueckfrage]'))
  }
  const vorher = await stand()
  let frage = await menue()
  pruefe((await frage.count()) === 1, 'Rückfrage erscheint')
  pruefe(
    await frage.getByRole('radio', { name: 'Nur automatisch zugeordnete und nicht zugeordnete' }).isChecked(),
    'Standard: nur automatisch zugeordnete und nicht zugeordnete'
  )
  await shot('rueckfrage')
  await frage.getByRole('button', { name: 'Abbrechen' }).click()
  await page.waitForTimeout(400)
  pruefe(gleich((await stand()).zuordnungen, vorher.zuordnungen), 'Abbrechen ändert nichts')

  frage = await menue()
  await frage.getByRole('button', { name: 'Einsortieren' }).click()
  await page.waitForTimeout(1200)
  const hinweis = sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last()
  const text = (await hinweis.innerText()).replace(/\s+/g, ' ')
  pruefe(/\d+ einsortiert, \d+ verschoben/.test(text), `Zusammenfassung („${text}")`)
  await shot('ergebnis')
  const nach = await stand()
  const z = (d, k) => d.zuordnungen[`arbeitsblatt:${k}`]
  const name = (d, k) => d.bereiche.find((b) => b.id === z(d, k)?.bereichId)?.name
  pruefe(z(nach, 'bio00002')?.von === 'auto' && name(nach, 'bio00002') === 'Zelle', `„Zellatmung" einsortiert (${name(nach, 'bio00002')})`)
  pruefe(
    name(nach, 'bio00001') === 'Zelle',
    `„Die Zelle" (vorher automatisch in „Sonstiges") nach „Zelle" verschoben, nicht in „Zellorganellen" (${name(nach, 'bio00001')})`
  )
  pruefe(
    ['bio00003', 'bio00004', 'bio00005'].every((k) => JSON.stringify(z(nach, k)) === JSON.stringify(z(vorher, k))),
    'Von Hand Zugeordnetes bleibt unberührt'
  )
  pruefe(/1 einsortiert, 1 verschoben/.test(text), 'Die Zahlen stimmen (1 einsortiert, 1 verschoben)')
  await hinweis.getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(900)
  const zurueck = await stand()
  pruefe(
    gleich(zurueck.zuordnungen, vorher.zuordnungen) && zurueck.bereiche.length === vorher.bereiche.length,
    'Rückgängig stellt alle Zuordnungen in einem Schritt wieder her'
  )

  // „Alle, auch von Hand zugeordnete"
  frage = await menue()
  await frage.getByText('Alle, auch von Hand zugeordnete').click()
  await frage.getByRole('button', { name: 'Einsortieren' }).click()
  await page.waitForTimeout(1200)
  const alle = await stand()
  pruefe(
    ['bio00001', 'bio00002', 'bio00003', 'bio00004', 'bio00005'].every((k) => !z(alle, k) || z(alle, k).von === 'auto'),
    `„Alle": danach alles als automatisch gekennzeichnet (${['bio00003', 'bio00004', 'bio00005'].map((k) => `${name(alle, k)}/${z(alle, k)?.von}`).join(', ')})`
  )
  pruefe(alle.zuordnungen['klassenarbeit:ka000001']?.von === 'auto', '… auch die Klassenarbeit (alle Materialarten des Fachs)')
  await sichtbar(page.locator('[data-rueckgaengig-hinweis]')).last().getByRole('button', { name: 'Rückgängig' }).click()
  await page.waitForTimeout(900)
  const wieder = await stand()
  pruefe(z(wieder, 'bio00003')?.von === 'hand' && z(wieder, 'bio00005')?.von === 'hand', 'Rückgängig: „von Hand" ist wieder da')
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'paket15-themen-fehler.png') }).catch(() => undefined)
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

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
