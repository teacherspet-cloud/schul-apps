// Wache für den AUFBAU EINER ÜBUNGSKLAUSUR (vorher: npm run build).
// Aufruf: node tests/e2e/klausur-aufbau.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (24.09.2026): „füge bei übungsklausuren die aufgabenstellungen
// außerdem an den anfang auf eine eigene seite und das material auf nachfolgende seiten."
//
// Gemeldet am 25.09.2026: „die aufgabe steht weiterhin erst hinter dem material." Die
// Umsortierung gab es da längst, samt Tests – aber der Erzeugungsweg der App rief sie mit
// einem Schalter auf, den er selbst nie setzte. Die Tests setzten ihn und waren grün.
//
// Diese Wache prüft deshalb nicht die Funktion, sondern das GESETZTE BLATT: Was steht auf
// Seite 1? Ein Test, der die Reihenfolge selbst vorgibt, kann diesen Fehler nicht finden.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/klausur-aufbau')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-klausur-'))
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' }
})
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
// Die Probe geht durch DENSELBEN Einsetzweg wie die App – nicht an ihm vorbei
await page.evaluate(() => window.__selftest.wsMaterialtext(24, 'klausur'))
await page.waitForTimeout(2500)

/** Welche Bausteinart steht auf welcher Seite, und ragt etwas aus dem Satzspiegel? */
const messen = async () =>
  page.evaluate(() => {
    const seiten = [...document.querySelectorAll('.ws-editor-pages .ws-page')]
    const arten = (p) =>
      [...p.querySelectorAll('.ws-block')].map((b) => [...b.classList].find((c) => c.startsWith('ws-') && c !== 'ws-block' && !c.startsWith('ws-continued')))
    return {
      seiten: seiten.length,
      arten: seiten.map(arten),
      ueberstand: seiten.map((p) => {
        const rahmen = p.querySelector('.ws-content')
        if (!rahmen) return 0
        const unten = rahmen.getBoundingClientRect().bottom
        const teile = [...rahmen.querySelectorAll('.ws-paragraph, .ws-block')]
        return Math.round(Math.max(0, ...teile.map((t) => t.getBoundingClientRect().bottom)) - unten)
      }),
      /*
       * Zerrissene Bausteine: Ein Teilstueck mit einem einzigen Absatz ist im Buchsatz ein
       * Schusterjunge bzw. Hurenkind. Gezaehlt werden die Absaetze jedes Textstuecks je Seite.
       */
      stuecke: seiten.map((p) => [...p.querySelectorAll('.ws-text')].map((t) => t.querySelectorAll('.ws-paragraph').length)).flat(),
      /*
       * Die Wortzahl ist rechtsbuendig und landete dadurch jenseits der Notizlinie, mitten im
       * Notizfeld. Gemessen wird der Abstand ihrer rechten Kante zur Linie.
       */
      wortzahlJenseits: (() => {
        const w = document.querySelector('.ws-wortzahl')
        const abs = document.querySelector('.ws-notizrand .ws-paragraph')
        if (!w || !abs) return null
        const linie = abs.getBoundingClientRect().right - parseFloat(getComputedStyle(abs).paddingRight)
        /*
         * Die TEXTkante messen, nicht die Box: `getBoundingClientRect` schliesst das Padding
         * ein. Die Box reicht also weiterhin bis zum Blattrand, waehrend die Zahl selbst
         * laengst links der Linie steht.
         */
        const bereich = document.createRange()
        bereich.selectNodeContents(w)
        return Math.round(bereich.getBoundingClientRect().right - linie)
      })()
    }
  })

const ohne = await messen()
console.log(`ohne Notizrand: ${ohne.seiten} Seiten · ${ohne.arten.map((a, i) => `S${i + 1}:${a.join('+')}`).join(' · ')}`)

/*
 * Der Kern: Auf Seite 1 steht die AUFGABE, und zwar allein. Das Material folgt danach.
 */
pruefe(ohne.arten[0]?.includes('ws-task'), 'Seite 1 zeigt die Aufgabenstellung')
pruefe(!ohne.arten[0]?.includes('ws-text'), 'Auf Seite 1 steht noch kein Material')
const ersteMaterialseite = ohne.arten.findIndex((a) => a.includes('ws-text'))
pruefe(ersteMaterialseite === 1, `Das Material beginnt auf Seite 2 (gefunden auf Seite ${ersteMaterialseite + 1})`)
// Der Schreibraum gehört ans Ende, hinter das Material – nicht zwischen Aufgabe und Text
const ersteSchreibseite = ohne.arten.findIndex((a) => a.includes('ws-workspace'))
pruefe(ersteSchreibseite > ersteMaterialseite, `Der Schreibraum steht hinter dem Material (Seite ${ersteSchreibseite + 1})`)
pruefe(
  ohne.ueberstand.every((u) => u <= 2),
  `Kein Baustein ragt aus dem Satzspiegel (${ohne.ueberstand.join('/')} px)`
)

// --- mit Notizrand: die Reihenfolge muss bleiben, der Umbruch sauber
await page.locator('label', { hasText: 'Notizrand' }).first().click()
await page.waitForTimeout(2500)
const mit = await messen()
console.log(`mit Notizrand:  ${mit.seiten} Seiten · ${mit.arten.map((a, i) => `S${i + 1}:${a.join('+')}`).join(' · ')}`)

pruefe(mit.arten[0]?.includes('ws-task') && !mit.arten[0]?.includes('ws-text'), 'Auch mit Notizrand steht die Aufgabe allein auf Seite 1')
pruefe(
  mit.ueberstand.every((u) => u <= 2),
  `Auch mit Notizrand ragt nichts aus dem Satzspiegel (${mit.ueberstand.join('/')} px)`
)
pruefe(mit.wortzahlJenseits !== null && mit.wortzahlJenseits <= 2, `Die Wortzahl steht links der Notizlinie (${mit.wortzahlJenseits} px dahinter)`)
/*
 * Der gemeldete Schaden: „Aufgabe/Material wird zerrissen." Kein Teilstueck eines geteilten
 * Textes darf aus einem einzigen Absatz bestehen – weder unten angerissen noch oben allein.
 */
for (const [name, m] of [
  ['ohne Notizrand', ohne],
  ['mit Notizrand', mit]
]) {
  const duenn = m.stuecke.filter((n) => n === 1).length
  pruefe(m.stuecke.length > 1 && duenn === 0, `${name}: kein Textstück steht mit einem einzelnen Absatz allein (Absätze je Stück: ${m.stuecke.join('/')})`)
}

const seiten = page.locator('.ws-editor-pages .ws-page')
for (let i = 0; i < Math.min(await seiten.count(), 3); i++) {
  await seiten.nth(i).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await seiten.nth(i).screenshot({ path: join(out, `seite-${i + 1}.png`) })
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDie Übungsklausur beginnt mit der Aufgabe. Bilder in ${out}`)
