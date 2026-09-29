// Wache für Paket 12 B/C – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/programme-faecher.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (26.09.2026):
//  - „Unterrichtete Fächer" in den Einstellungen (Reiter Schule) und im Einrichtungsassistenten;
//    Programme, die zu keinem Fach passen, verschwinden aus Leiste, Startseite und Strg+1 … 6,
//    lassen sich unter „Programme anzeigen" einzeln wieder einblenden.
//  - Fachauswahl: eigene Fächer oben („Eigene Fächer"), Rest unter „Andere Fächer".
//  - Reihenfolge überall: Arbeitsblätter, Vokabeltest, Grammatiktest, LZK, Klassenarbeiten, Rückmeldung, Elternbriefe, Vokabellisten (seit 29.09.2026).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/programme-faecher')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-programme-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  // Der Einrichtungsassistent bleibt offen: Das Fächerfeld muss dort erscheinen
  await warteAufOberflaeche(page, 3, { assistent: true })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 950))
  const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
  await assistent.waitFor({ timeout: 15000 })
  pruefe(
    (await assistent.locator('[data-eigene-faecher]').count()) > 0 || (await assistent.getByText('Unterrichtete Fächer').count()) > 0,
    'Der Einrichtungsassistent fragt die unterrichteten Fächer'
  )
  await page.screenshot({ path: join(out, 'paket12-einrichtung-faecher.png') })
  await assistent.getByRole('button', { name: 'Später einrichten' }).click()
  await page.waitForTimeout(300)

  const leiste = async () => page.evaluate(() => [...document.querySelectorAll('.leiste-liste .nav-icon')].map((b) => b.getAttribute('aria-label')))
  pruefe(
    JSON.stringify(await leiste()) ===
      JSON.stringify(['Arbeitsblatt', 'Vokabeltest', 'Grammatiktest', 'Lernzielkontrolle', 'Klassenarbeiten', 'Rückmeldung', 'Elternbriefe', 'Vokabellisten']),
    `Reihenfolge der Leiste (${(await leiste()).join(', ')})`
  )
  const kacheln = await page.locator('.home-tile .mantine-Text-root[data-size="lg"]').allInnerTexts()
  pruefe(kacheln[0] === 'Arbeitsblatt' && kacheln[7] === 'Vokabellisten', `Reihenfolge der Startseite (${kacheln.join(', ')})`)

  // ---------- Klassenarbeit, Rahmen (Paket 12 D): Jahrgang neben Fach, Titel neben Thema, GER-Kennzeichen an den Chips
  await page.click('[aria-label="Klassenarbeiten"]')
  const kaThema = page.locator('.mantine-Autocomplete-root', { hasText: 'Thema' }).filter({ visible: true }).locator('input').first()
  await kaThema.waitFor({ timeout: 15000 })
  await kaThema.fill('Going abroad')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const lage = await page.evaluate(() => {
    const box = (name) => {
      const l = [...document.querySelectorAll('label')].find((x) => x.offsetParent && x.textContent?.trim().startsWith(name))
      const r = l?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y } : null
    }
    return { fach: box('Fach'), jahrgang: box('Jahrgang'), thema: box('Thema'), titel: box('Titel der Arbeit') }
  })
  pruefe(lage.fach && lage.jahrgang && Math.abs(lage.fach.y - lage.jahrgang.y) < 4 && lage.jahrgang.x > lage.fach.x, 'Jahrgang steht neben dem Fach')
  pruefe(lage.thema && lage.titel && Math.abs(lage.thema.y - lage.titel.y) < 4 && lage.titel.x > lage.thema.x, 'Titel der Arbeit steht rechts neben dem Thema')
  const kennzeichen = await page.locator('.ger-kennzeichen').filter({ visible: true }).allInnerTexts()
  pruefe(
    kennzeichen.length > 0 && kennzeichen.every((k) => /^≈?(A1|A2|B1|B2|C1)/.test(k)),
    `GER-Kennzeichen an den Vorschlags-Chips (${kennzeichen.join(', ')})`
  )
  await page.locator('.ger-kennzeichen').filter({ visible: true }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'paket12-klassenarbeit-rahmen.png') })

  // ---------- Fächer wählen: Geschichte und Mathematik
  await page.click('[aria-label="Einstellungen"]')
  const feld = page.locator('.mantine-MultiSelect-root', { hasText: 'Unterrichtete Fächer' }).locator('input').first()
  await feld.click()
  await feld.fill('Geschichte')
  await page.getByRole('option', { name: 'Geschichte' }).click()
  await feld.fill('Mathematik')
  await page.getByRole('option', { name: 'Mathematik' }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  pruefe(
    JSON.stringify(await leiste()) === JSON.stringify(['Arbeitsblatt', 'Lernzielkontrolle', 'Klassenarbeiten', 'Rückmeldung', 'Elternbriefe']),
    `Geschichte + Mathematik: nur passende Programme in der Leiste (${(await leiste()).join(', ')})`
  )
  await page.locator('[data-programme-anzeigen]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'paket12-programme-anzeigen.png') })

  // Strg+2 = zweites SICHTBARES Programm
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(300)
  pruefe(
    (await page.locator('[aria-label="Lernzielkontrolle"]').first().getAttribute('data-active')) === 'true',
    'Strg+2 öffnet das zweite sichtbare Programm (Lernzielkontrolle)'
  )

  // Fachauswahl der Lernzielkontrolle: eigene Fächer oben
  const fach = page.locator('.mantine-Select-root', { hasText: 'Fach' }).filter({ visible: true }).locator('input').first()
  await fach.click()
  await page.waitForTimeout(300)
  const gruppen = await page.locator('[class*="groupLabel"]').filter({ visible: true }).allInnerTexts()
  pruefe(gruppen[0] === 'Eigene Fächer' && gruppen.includes('Andere Fächer'), `Gruppen der Fachauswahl: ${gruppen.join(', ')}`)
  const ersteOptionen = await page
    .locator('[class*="-group"]:has([class*="groupLabel"])')
    .filter({ visible: true })
    .first()
    .locator('[role="option"]')
    .allInnerTexts()
  pruefe(ersteOptionen.join('|') === 'Geschichte|Mathematik', `Eigene Fächer oben: ${ersteOptionen.join(', ')}`)
  await page.screenshot({ path: join(out, 'paket12-fachauswahl.png') })
  await page.keyboard.press('Escape')

  // ---------- Einzeln wieder einblenden
  await page.click('[aria-label="Einstellungen"]')
  await page.locator('[data-programm-schalter="vokabeltest"]').click()
  await page.waitForTimeout(500)
  pruefe((await leiste()).includes('Vokabeltest'), 'Der Vokabeltest lässt sich einzeln wieder einblenden')
  await page.getByRole('button', { name: 'Wie die Fächer' }).click()
  await page.waitForTimeout(500)
  pruefe(!(await leiste()).includes('Vokabeltest'), '„Wie die Fächer" nimmt die eigene Wahl zurück')

  // Gespeichert im Hauptprozess (null löscht die Festlegung)
  const gespeichert = await page.evaluate(() => window.api.settings.get())
  pruefe(
    JSON.stringify(gespeichert.eigeneFaecher) === JSON.stringify(['geschichte', 'mathematik']) && Object.keys(gespeichert.programmeAnzeigen ?? {}).length === 0,
    'Fächer gespeichert, keine Festlegung übrig'
  )
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nProgramme nach Fächern: Auswahl, Ausblenden, Einblenden, Reihenfolge in Ordnung.')
