// Wache für das Programm ELTERNBRIEF (Großprogramm 0.4, F7) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/elternbrief.mjs <Ausgabeordner>
//
// Stichpunkte eintragen, Rücklauf an, „Brief schreiben": Der Brief steht da (mit Rücklaufzettel).
// „Übersetzen" ins Arabische: Der Reiter erscheint, der Text steht von rechts nach links, die
// Anfrage nennt Arabisch. Alles im WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/elternbrief')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-elternbrief-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: {
      elternbrief_text: {
        betreff: 'Wandertag am 12. Oktober',
        anrede: 'Liebe Eltern der Klasse 7b,',
        absaetze: [
          'am 12. Oktober wandern wir in den Wildpark. Treffpunkt ist um 8:00 Uhr auf dem Schulhof.',
          'Bitte geben Sie Ihrem Kind bis zum 5. Oktober 5 € mit.'
        ],
        gruss: 'Mit freundlichen Grüßen',
        ruecklaufTitel: 'Rückmeldung zum Wandertag',
        ruecklaufZeilen: ['☐ [Name des Kindes] nimmt teil.', 'Unterschrift: ______________']
      },
      elternbrief_uebersetzung: {
        betreff: 'يوم المشي في 12 أكتوبر',
        anrede: 'أولياء الأمور الأعزاء،',
        absaetze: ['في 12 أكتوبر نذهب إلى حديقة الحيوانات البرية.', 'يرجى إعطاء طفلكم 5 يورو حتى 5 أكتوبر.'],
        gruss: 'مع أطيب التحيات',
        ruecklaufTitel: 'رد',
        ruecklaufZeilen: ['☐ [Name des Kindes]', 'التوقيع'],
        vermerk: 'ترجمة آلية – النسخة الألمانية هي الملزمة.'
      }
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
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
try {
  // Strg+8 öffnet das achte Programm
  await page.keyboard.press('Control+8')
  await page.getByText('Anlass & Stichpunkte', { exact: true }).waitFor({ timeout: 10000 })
  pruefe(true, 'Strg+8 öffnet „Elternbriefe"')
  await sichtbar(page.locator('[data-eb-stichpunkte]')).fill('Wandertag am 12.10., Treffpunkt 8:00 Schulhof, Wildpark, 5 € bis 5.10.')
  await sichtbar(page.getByLabel('Mit Rücklaufzettel zum Abschneiden')).check()
  await sichtbar(page.locator('[data-eb-schreiben]')).click()
  await page.getByText('Wandertag am 12. Oktober', { exact: true }).first().waitFor({ timeout: 15000 })
  pruefe(true, 'Der Brief steht da')
  pruefe((await page.getByText('Rücklaufzettel', { exact: true }).count()) > 0, 'Mit Rücklaufzettel')
  const a = anfragen().filter((z) => z.schemaName === 'elternbrief_text')
  pruefe(
    a.length === 1 && a[0].user.includes('Wildpark') && /KEINE Namen von Kindern/.test(a[0].user),
    'Die Anfrage enthält die Stichpunkte und verbietet Namen'
  )
  await page.screenshot({ path: join(out, 'brief.png') })

  await sichtbar(page.locator('[data-eb-sprachen]')).click()
  await sichtbar(page.getByRole('option', { name: /^Arabisch/ })).click()
  await page.keyboard.press('Escape')
  await sichtbar(page.locator('[data-eb-uebersetzen]')).click()
  await sichtbar(page.getByRole('tab', { name: 'Arabisch' })).waitFor({ timeout: 15000 })
  await sichtbar(page.getByRole('tab', { name: 'Arabisch' })).click()
  await page.waitForTimeout(500)
  const rtl = await page.locator('[dir="rtl"]').filter({ visible: true }).count()
  pruefe(rtl > 0, 'Die arabische Fassung steht von rechts nach links')
  const u = anfragen().filter((z) => z.schemaName === 'elternbrief_uebersetzung')
  pruefe(u.length === 1 && /Arabisch/.test(u[0].system), 'Die Übersetzungsanfrage nennt die Sprache')
  await page.screenshot({ path: join(out, 'arabisch.png') })
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
