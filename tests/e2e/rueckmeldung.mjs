// Wache für das Programm RÜCKMELDUNG (Großprogramm 0.4, F3) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/rueckmeldung.mjs <Ausgabeordner>
//
// Eigene Aufgabe eintragen, eine Abgabe eintippen, Namen „Lea Schmidt" am Rechner vergeben,
// „Rückmeldung schreiben": Der Bogen entsteht, die Anfrage enthält den Namen NICHT (nur S1),
// der Bogen enthält keine Punkte (die Attrappe schmuggelt einen Punktesatz ein), die Ansicht
// „Bögen & Export" zeigt „Rückmeldung für Lea Schmidt". Alles im WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/rueckmeldung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-rueckmeldung-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: {
      rueckmeldung_bogen: {
        staerken: ['S1 nennt gleich zu Beginn ein klares Anliegen.', 'Das sind 12 von 15 Punkten.'],
        schritte: ['Ergänze zu jedem Argument ein Beispiel aus deinem Alltag.'],
        kriterien: [{ kriterium: 'Anliegen', einschaetzung: 'sicher', beleg: 'Ich finde, das Handyverbot ist falsch.' }],
        schluss: 'Weiter so – mit Beispielen wird dein Brief überzeugender.'
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
  await page.click('[aria-label="Rückmeldung"]')
  await page.getByText('Rückmeldung ohne Note', { exact: true }).waitFor({ timeout: 10000 })
  pruefe(true, 'Das Programm „Rückmeldung" öffnet sich')
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  await sichtbar(page.getByLabel('Titel der Aufgabe')).fill('Leserbrief zum Handyverbot')
  await sichtbar(page.locator('[data-rm-aufgaben]')).fill('Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot.')
  await sichtbar(page.locator('[data-rm-eintippen]')).click()
  await sichtbar(page.getByLabel('Name zu S1')).fill('Lea Schmidt')
  await sichtbar(page.getByLabel('Text von S1')).fill('Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.')
  await page.screenshot({ path: join(out, 'einrichten.png') })
  await sichtbar(page.locator('[data-rm-schreiben]')).click()

  const ende = Date.now() + 20000
  let bogen = null
  while (Date.now() < ende) {
    bogen = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen ?? null)
    if (bogen) break
    await page.waitForTimeout(300)
  }
  pruefe(Boolean(bogen), 'Der Bogen ist entstanden')
  pruefe(bogen && !JSON.stringify(bogen).includes('Punkten'), 'Kein Punktesatz im Bogen (von der App entfernt)')
  pruefe(bogen?.entfernt === 1, 'Die entfernte Aussage ist vermerkt')
  const a = anfragen().filter((z) => z.schemaName === 'rueckmeldung_bogen')
  pruefe(a.length === 1, 'Eine Anfrage für den Bogen')
  pruefe(a.length === 1 && !/Lea|Schmidt/.test(a[0].user) && a[0].user.includes('S1'), 'Die KI sieht nur das Kürzel, nicht den Namen')
  pruefe(a.length === 1 && /KEINE Note, KEINE Punkte/.test(a[0].user), 'Die Anfrage verbietet Noten und Punkte')
  await page.getByText('Rückmeldung für Lea Schmidt').waitFor({ timeout: 10000 })
  pruefe(true, 'Die Ansicht zeigt den Namen – eingesetzt am Rechner')
  await page.screenshot({ path: join(out, 'boegen.png') })
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
