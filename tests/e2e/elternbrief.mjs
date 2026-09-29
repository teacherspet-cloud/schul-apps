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
      },
      // Zauberstab (29.09.2026): neu formulierter Teil und dessen Übersetzung
      elternbrief_teil: { text: 'Bitte geben Sie Ihrem Kind bis zum 5.10. genau 5 € mit.' },
      elternbrief_teile: { teile: [{ schluessel: 'absatz-1', text: 'يرجى إعطاء طفلكم 5 يورو حتى 5.10.' }] }
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
  // Briefkopf aus den Einstellungen (Anschrift, Lehrkraft)
  await page.evaluate(() =>
    window.api.settings.set({
      schoolName: 'Gymnasium Wesermünde',
      briefkopf: { lehrkraft: 'Frau Müller', strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven', telefon: '0471 483670' }
    })
  )
  await sichtbar(page.locator('[data-eb-stichpunkte]')).fill('Wandertag am 12.10., Treffpunkt 8:00 Schulhof, Wildpark, 5 € bis 5.10.')
  await sichtbar(page.locator('[data-eb-termin]')).fill('2026-10-12')
  await sichtbar(page.locator('[data-eb-uhrzeit]')).fill('08:00')
  await sichtbar(page.getByLabel('Mit Rücklaufzettel zum Abschneiden')).check()
  await sichtbar(page.locator('[data-eb-frist]')).fill('2026-10-05')
  await sichtbar(page.locator('[data-eb-schreiben]')).click()
  await page.getByText('Wandertag am 12. Oktober', { exact: true }).first().waitFor({ timeout: 15000 })
  pruefe(true, 'Der Brief steht da')
  pruefe((await page.getByText('Rücklaufzettel', { exact: true }).count()) > 0, 'Mit Rücklaufzettel')
  const a = anfragen().filter((z) => z.schemaName === 'elternbrief_text')
  pruefe(
    a.length === 1 && a[0].user.includes('Wildpark') && /KEINE Namen von Kindern/.test(a[0].user),
    'Die Anfrage enthält die Stichpunkte und verbietet Namen'
  )
  pruefe(
    a.length === 1 && a[0].user.includes('TERMIN: Montag, 12.10.2026, 08:00 Uhr') && a[0].user.includes('RÜCKGABE DES RÜCKLAUFZETTELS BIS: Montag, 05.10.2026'),
    'Termin und Rückgabefrist gehen als feste Angaben an die KI'
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

  // ---------- Zauberstab am zweiten Absatz: „Kürzer" – der Absatz ändert sich, die arabische Fassung zieht nach
  await sichtbar(page.getByRole('tab', { name: 'Deutsch' })).click()
  await page.waitForTimeout(300)
  await sichtbar(page.locator('[data-eb-teil="absatz-1"] [data-eb-zauberstab]')).click()
  await sichtbar(page.locator('[data-eb-aktion="kuerzer"]')).click()
  const ende = Date.now() + 15000
  let nachher = null
  while (Date.now() < ende) {
    nachher = await page.evaluate(() => window.__selftest.ebJetzt())
    if (nachher?.uebersetzungen?.[0]?.text?.absaetze?.[1]?.includes('5.10.')) break
    await page.waitForTimeout(300)
  }
  pruefe(nachher?.text?.absaetze?.[1] === 'Bitte geben Sie Ihrem Kind bis zum 5.10. genau 5 € mit.', 'Zauberstab: der Absatz ist neu formuliert')
  pruefe(Boolean(nachher?.uebersetzungen?.[0]?.text?.absaetze?.[1]?.includes('5.10.')), 'Zauberstab: die arabische Fassung dieses Absatzes ist nachgezogen')
  const teilAnfrage = anfragen().filter((z) => z.schemaName === 'elternbrief_teil')
  pruefe(
    teilAnfrage.length === 1 && /kürzer/.test(teilAnfrage[0].user) && /FESTE ANGABEN/.test(teilAnfrage[0].user),
    'Zauberstab: Anfrage mit Auftrag und festen Angaben'
  )
  const teileAnfrage = anfragen().filter((z) => z.schemaName === 'elternbrief_teile')
  pruefe(
    teileAnfrage.length === 1 && teileAnfrage[0].user.includes('absatz-1') && !teileAnfrage[0].user.includes('absatz-0'),
    'Nur der geänderte Absatz wird neu übersetzt'
  )
  pruefe((nachher?.fassungen?.length ?? 0) >= 1, 'Die vorige Fassung ist aufgehoben')

  // ---------- Ganzen Brief neu formulieren (Ton sachlich)
  await sichtbar(page.locator('[data-eb-neu-hinweis]')).fill('Kosten zuerst')
  await sichtbar(page.locator('[data-eb-neu]')).click()
  await page.waitForTimeout(2500)
  const neuAnfrage = anfragen()
    .filter((z) => z.schemaName === 'elternbrief_text')
    .slice(1)
  pruefe(
    neuAnfrage.length >= 1 && /Formuliere diesen Elternbrief neu/.test(neuAnfrage[0].user) && /Kosten zuerst/.test(neuAnfrage[0].user),
    'Neuformulierung mit Hinweis angefragt'
  )

  await page.screenshot({ path: join(out, 'nach-bearbeitung.png') })
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
