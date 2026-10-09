// Wache für die THEMEN-BIBLIOTHEK (09.10.2026) am Beispiel „Meine Tafelbilder" – ohne KI, Wegwerf-Profil.
// Aufruf (nach dem Bauen): node tests/e2e/themen-bibliothek.mjs <Ausgabeordner>
//
// Entscheidungen der Lehrkraft: Fach → Themenbereich (ohne KI aus dem Lehrplankatalog), Anzahl und
// Klassenspanne in den Überschriften, Gruppen zuklappbar (gemerkt), Karten/Liste (gemerkt), „Zuletzt
// bearbeitet" mit den letzten vier, Suche über Titel/Thema/Themenbereich, „Themenbereich ändern …" und
// Ziehen auf einen Bereich – gespeichert im Dokument (meta.themenbereich).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/themen-bibliothek')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-themenbib-'))
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()

/** Ein Tafelbild nur als gespeicherter Eintrag (ohne Tafel – die Karte zeigt dann das Programmsymbol) */
const TAFELN = [
  // Klasse 8: Im Kerncurriculum Niedersachsen (Gymnasium) steht „Erster Weltkrieg" in 7/8, nicht in 9
  ['tb-julikrise', 'Ursachen des Ersten Weltkriegs', 'Geschichte', 'geschichte', 8, 'Ursachen des Ersten Weltkriegs', 1],
  ['tb-versailles', 'Versailler Vertrag', 'Geschichte', 'geschichte', 10, 'Der Versailler Vertrag', 2],
  ['tb-weimar', 'Weimarer Republik – Krisenjahre', 'Geschichte', 'geschichte', 9, 'Die Weimarer Republik', 3],
  ['tb-einstieg', 'Stundeneinstieg', 'Geschichte', 'geschichte', 8, '', 4],
  ['tb-brueche', 'Brüche addieren', 'Mathematik', 'mathematik', 6, 'Bruchrechnung', 5],
  ['tb-zelle', 'Die Zelle', 'Biologie', 'biologie', 7, 'Zellaufbau', 6]
]

const metaVon = (id) => page.evaluate(async (i) => (await window.api.tafelbilder.list()).find((m) => m.id === i), id)
const bibliothek = async () => {
  // Beim ersten Öffnen in der Sitzung steht die Bibliothek schon da (09.10.2026, shared/sitzung.ts)
  await page.waitForTimeout(500)
  if (!(await page.locator('[data-themen-bibliothek="tafelbild"]').filter({ visible: true }).count()))
    await sichtbar(page.getByRole('button', { name: 'Meine Tafelbilder', exact: true })).click()
  await sichtbar(page.locator('[data-themen-bibliothek="tafelbild"]')).waitFor({ timeout: 10000 })
}

try {
  await page.evaluate(async (liste) => {
    for (const [id, name, fach, fachId, grade, thema, tag] of liste) {
      const meta = { title: name, subjectId: fachId, subjectLabel: fach, grade, stateId: 'NI', schoolTypeId: 'gymnasium', thema }
      await window.api.tafelbilder.save({ id, name, stats: { subjectLabel: fach, subjectId: fachId, grade, thema, stateId: 'NI', schoolTypeId: 'gymnasium', hatTafel: false }, payload: { meta, tafeln: [] } })
      // Reihenfolge der Änderungszeit: zuletzt gespeichert = zuletzt bearbeitet
      await new Promise((r) => setTimeout(r, 20 + tag))
    }
  }, TAFELN)
  await page.locator('.app-leiste [aria-label="Tafelbilder"]').first().click()
  await bibliothek()

  // ---------- Gliederung
  const faecher = await page.locator('[data-themen-fach]').evaluateAll((l) => l.map((e) => e.getAttribute('data-themen-fach')))
  pruefe(JSON.stringify(faecher) === JSON.stringify(['Biologie', 'Geschichte', 'Mathematik']), `Fächer alphabetisch (${faecher.join(', ')})`)
  const kopf = await sichtbar(page.locator('[data-themen-fach="Geschichte"] > button')).innerText()
  pruefe(kopf.includes('4') && kopf.includes('Kl. 8–10'), `Fachkopf mit Anzahl und Klassenspanne („${kopf.replace(/\s+/g, ' ')}")`)
  const bereichJulikrise = await page.locator('[data-bibliothek-eintrag="Ursachen des Ersten Weltkriegs"]').getAttribute('data-themenbereich-von')
  pruefe(Boolean(bereichJulikrise) && bereichJulikrise !== 'Ohne Themenbereich', `Automatisch einsortiert ohne KI („${bereichJulikrise}")`)
  pruefe(
    (await page.locator('[data-bibliothek-eintrag="Stundeneinstieg"]').getAttribute('data-themenbereich-von')) === 'Ohne Themenbereich',
    'Ohne passendes Thema: „Ohne Themenbereich"'
  )
  pruefe((await page.locator('[data-zuletzt-bearbeitet] [data-zuletzt-eintrag]').count()) === 4, '„Zuletzt bearbeitet" zeigt die letzten vier')
  await page.screenshot({ path: join(out, '1-karten.png') })

  // ---------- Themenbereich ändern (Menü)
  await sichtbar(page.getByRole('button', { name: 'Weitere Aktionen für „Stundeneinstieg“' })).click()
  await page.getByRole('menuitem', { name: 'Themenbereich ändern …' }).click()
  await page.locator('[data-themen-suche]').fill('Wiederholung')
  await page.locator('[data-themen-neu]').click()
  let meta = null
  for (let i = 0; i < 30 && meta?.themenbereich !== 'Wiederholung'; i++) {
    await page.waitForTimeout(200)
    meta = await metaVon('tb-einstieg')
  }
  pruefe(meta?.themenbereich === 'Wiederholung', `„Themenbereich ändern …" speichert im Dokument (${meta?.themenbereich})`)
  await sichtbar(page.locator('[data-themenbereich="Wiederholung"]')).waitFor({ timeout: 5000 })
  pruefe(true, 'Neuer Bereich „Wiederholung" erscheint')

  // ---------- Ziehen auf einen Bereich (am PC)
  await page
    .locator('[data-themen-bibliothek] [data-bibliothek-eintrag="Versailler Vertrag"]')
    .dragTo(page.locator('[data-themenbereich="Wiederholung"] > button'))
    .catch(() => undefined)
  meta = null
  for (let i = 0; i < 30 && meta?.themenbereich !== 'Wiederholung'; i++) {
    await page.waitForTimeout(200)
    meta = await metaVon('tb-versailles')
  }
  pruefe(meta?.themenbereich === 'Wiederholung', `Ziehen auf „Wiederholung" speichert den Bereich (${meta?.themenbereich})`)
  await page.screenshot({ path: join(out, '2-geaendert.png') })

  // ---------- Suche (auch nach dem Themenbereich)
  const suche = sichtbar(page.getByRole('textbox', { name: 'Meine Tafelbilder durchsuchen' }))
  await suche.fill('wiederholung')
  await page.waitForTimeout(300)
  const treffer = await page.locator('[data-themen-bibliothek] [data-bibliothek-eintrag]').evaluateAll((l) => l.map((e) => e.getAttribute('data-bibliothek-eintrag')).sort())
  pruefe(JSON.stringify(treffer) === JSON.stringify(['Stundeneinstieg', 'Versailler Vertrag']), `Suche findet über den Themenbereich (${treffer.join(', ')})`)
  pruefe((await page.locator('[data-zuletzt-bearbeitet]').count()) === 0, 'Bei einer Suche kein „Zuletzt bearbeitet"')
  await suche.fill('')

  // ---------- Liste und Zuklappen – je Gerät gemerkt
  await sichtbar(page.locator('[data-themen-bibliothek] label').filter({ hasText: 'Liste' })).click()
  await sichtbar(page.getByRole('button', { name: 'Biologie zuklappen' })).click()
  await page.waitForTimeout(300)
  pruefe((await page.locator('[data-bibliothek-eintrag="Die Zelle"]').count()) === 0, 'Fach zugeklappt')
  await page.reload()
  await warteAufOberflaeche(page)
  await page.locator('.app-leiste [aria-label="Tafelbilder"]').first().click()
  await bibliothek()
  pruefe((await page.locator('[data-themen-bibliothek] [data-ansicht="liste"]').count()) === 1, 'Listenansicht nach dem Neuladen gemerkt')
  pruefe((await page.locator('.tbib-zeile').count()) > 0, 'Kompakte Zeilen statt Karten')
  pruefe((await page.locator('[data-bibliothek-eintrag="Die Zelle"]').count()) === 0, 'Zugeklapptes Fach nach dem Neuladen gemerkt')
  await page.screenshot({ path: join(out, '3-liste.png') })

  // ---------- Automatisch zuordnen (Handwahl zurücknehmen)
  await sichtbar(page.getByRole('button', { name: 'Weitere Aktionen für „Versailler Vertrag“' })).click()
  await page.getByRole('menuitem', { name: 'Themenbereich ändern …' }).click()
  await page.locator('[data-themen-auto]').click()
  for (let i = 0; i < 30 && meta?.themenbereich; i++) {
    await page.waitForTimeout(200)
    meta = await metaVon('tb-versailles')
  }
  pruefe(!meta?.themenbereich, '„Automatisch zuordnen" nimmt die Handwahl zurück')

  // ---------- Schmal (Handy): keine waagerechte Rollleiste der Seite
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(400, 860))
  await page.waitForTimeout(600)
  const breit = await page.evaluate(() => {
    const b = document.querySelector('[data-themen-bibliothek]')
    return b ? b.scrollWidth - b.clientWidth : 0
  })
  pruefe(breit <= 1, `Schmal ohne Überlauf (${breit} px)`)
  await page.screenshot({ path: join(out, '4-schmal.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
