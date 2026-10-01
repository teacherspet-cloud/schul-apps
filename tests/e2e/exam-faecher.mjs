// Wache für die neuen Fächer der KLASSENARBEIT (Großprogramm 0.4, Phase G) – mit KI-ATTRAPPE,
// ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/exam-faecher.mjs <Ausgabeordner>
//
// Französisch Klasse 8 und Deutsch Klasse 8 über die Oberfläche anlegen, Vorschlag erzeugen,
// Arbeit erzeugen: Der Kopf steht in der Sprache des Fachs („Contrôle", „Partie 1", „Nom :"
// bzw. „Klassenarbeit Deutsch", „Teil 1"), die Teile sind die des Fachs, und die Anfrage an die
// KI nennt das Fach. Alles in einem WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/exam-faecher')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-exam-faecher-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
const teil = {
  blocks: [
    { outlineIndex: 0, type: 'text', title: 'Texte', body: 'Un texte court pour la vérification.', lineNumbers: true },
    {
      outlineIndex: 1,
      type: 'task',
      instruction: '**Résumez** le texte.',
      operator: 'résumer',
      afb: 'I',
      solution: 'Solution',
      points: 5,
      answer: { kind: 'lines', lines: 4 }
    }
  ]
}
writeFileSync(attrappe, JSON.stringify({ verzoegerungMs: 200, protokoll, antworten: { exam_part: teil } }))

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
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const blattText = () => page.locator('.ws-editor-pages').first().innerText()

const waehle = async (label, option) => {
  await sichtbar(page.getByLabel(label, { exact: true })).click()
  await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
  await page.waitForTimeout(300)
}

const arbeit = async (fach, thema) => {
  await waehle('Fach', fach)
  await waehle('Jahrgang', 'Klasse 8')
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill(thema)
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, `${fach}-rahmen.png`) })
  const vorher = anfragen().length
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).first().click()
  await page.locator('.ws-editor-pages .ws-page').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(out, `${fach}-arbeit.png`) })
  return anfragen().slice(vorher)
}

try {
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')

  // ---------- Französisch
  const fr = await arbeit('Französisch', 'Les vacances')
  const exam = await page.evaluate(() => window.__selftest.kaJetzt())
  pruefe(exam.meta.subjectId === 'franzoesisch', 'Fach Französisch gesetzt')
  pruefe(exam.parts.length > 0 && exam.parts.every((p) => p.formatId.startsWith('fr-')), `Teile des Fachs (${exam.parts.map((p) => p.formatId).join(', ')})`)
  pruefe(
    exam.parts.some((p) => p.formatId === 'fr-writing' && p.gradeGroup === 'writing'),
    'Schreibteil mit eigener Note'
  )
  const textFr = await blattText()
  pruefe(/Contrôle/.test(textFr), 'Titel „Contrôle"')
  pruefe(/Partie 1/.test(textFr), 'Teile heißen „Partie"')
  pruefe(/Nom\s*:/.test(textFr), 'Namensfeld „Nom :"')
  pruefe(fr.length > 0 && fr.every((z) => z.user.includes('im Fach Französisch')), `Die Anfragen nennen das Fach (${fr.length})`)

  // ---------- Deutsch
  await page.getByRole('button', { name: 'Neue Klassenarbeit' }).click()
  await page.waitForSelector('text=Rahmen der Arbeit')
  const de = await arbeit('Deutsch', 'Kurzgeschichten')
  const examDe = await page.evaluate(() => window.__selftest.kaJetzt())
  pruefe(
    examDe.parts.every((p) => p.formatId.startsWith('de-')),
    `Teile des Fachs Deutsch (${examDe.parts.map((p) => p.formatId).join(', ')})`
  )
  const textDe = await blattText()
  pruefe(/Klassenarbeit Deutsch/.test(textDe), 'Titel „Klassenarbeit Deutsch"')
  pruefe(/Teil 1/.test(textDe), 'Teile heißen „Teil"')
  pruefe(de.length > 0 && de.every((z) => z.user.includes('im Fach Deutsch')), `Die Anfragen nennen das Fach (${de.length})`)
  pruefe(
    de.some((z) => /70 % für den Inhalt|70 % Inhalt/.test(z.user)),
    'Schreibteil: Inhalt und Darstellung 70 : 30'
  )
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
