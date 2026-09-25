// Wache für die Programmsymbole – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/programmsymbole.mjs <Ausgabeordner>
//
// Anlass (Paket 9, 26.09.2026): Die Programme tragen eigene Vektorsymbole
// (shared/components/ProgrammSymbol.tsx) statt Tabler-Symbolen; die Startseiten-Kachel zeigt
// eine Illustration, sobald eine vorliegt, sonst das Symbol. Geprüft wird:
//  - Leiste, schmal und breit, hell und dunkel, mit normaler und farbiger Leiste:
//    jedes Programm hat sein Symbol, 22 px groß, mit Fläche in der Programmfarbe;
//  - auf dem aktiven Knopf und auf der farbigen Leiste nimmt die Fläche die Strichfarbe an
//    (sonst verschwimmt sie mit dem Hintergrund), auf dem weißen aktiven Knopf der farbigen
//    Leiste wieder die Programmfarbe;
//  - jede Kachel der Startseite zeigt Illustration oder Symbol.
// Bildschirmfotos: paket9-leiste-*.png, paket9-start.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/programmsymbole')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-symbole-'))
const PROGRAMME = ['Vokabeltest', 'Vokabellisten', 'Arbeitsblatt', 'Lernzielkontrolle', 'Grammatiktest', 'Klassenarbeiten']

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await page.setViewportSize({ width: 1400, height: 900 })
  await warteAufOberflaeche(page)

  /** Fläche und Strich des Symbols eines Leistenknopfs */
  const symbol = (label) =>
    page.evaluate((label) => {
      const knopf = document.querySelector(`.app-leiste [aria-label="${label}"]`)
      const svg = knopf?.querySelector('svg.programm-symbol')
      if (!svg) return null
      const flaeche = getComputedStyle(svg.querySelector('.sym-akzent'))
      return {
        breite: svg.getBoundingClientRect().width,
        fuellung: flaeche.fill,
        deckkraft: flaeche.fillOpacity,
        strich: getComputedStyle(svg).color,
        tabler: !!knopf.querySelector('svg.tabler-icon')
      }
    }, label)

  async function darstellung(theme, colorScheme) {
    await page.evaluate((a) => window.api.settings.set({ appearance: a }), { theme, colorScheme })
    await page.reload()
    await warteAufOberflaeche(page)
    await page.click('[aria-label="Vokabeltest"]')
  }

  for (const [theme, scheme] of [
    ['teal', 'light'],
    ['teal', 'dark'],
    ['blue', 'light'],
    ['blue', 'dark']
  ]) {
    await darstellung(theme, scheme)
    const farbig = theme === 'blue'
    for (const name of PROGRAMME) {
      const s = await symbol(name)
      pruefe(!!s && !s.tabler && s.breite === 22, `${theme}/${scheme}: ${name} hat eigenes 22-px-Symbol`)
    }
    // Vokabeltest ist aktiv, Arbeitsblatt nicht
    const aktiv = await symbol('Vokabeltest')
    const ruhig = await symbol('Arbeitsblatt')
    if (farbig) {
      pruefe(aktiv.deckkraft === '1' && aktiv.fuellung !== aktiv.strich, `${theme}/${scheme}: aktiver weißer Knopf zeigt die Programmfarbe`)
      pruefe(ruhig.deckkraft === '0.4', `${theme}/${scheme}: farbige Leiste – Fläche halbtransparent in Strichfarbe`)
    } else {
      pruefe(aktiv.deckkraft === '0.4', `${theme}/${scheme}: aktiver Knopf – Fläche halbtransparent in Strichfarbe`)
      pruefe(ruhig.deckkraft === '1' && ruhig.fuellung !== ruhig.strich, `${theme}/${scheme}: ruhender Knopf – Fläche in Programmfarbe`)
    }
    const leiste = page.locator('.app-leiste')
    await leiste.screenshot({ path: join(out, `paket9-leiste-${theme}-${scheme}-schmal.png`) })
    await page.click('.leiste-umschalter')
    await page.waitForTimeout(250)
    await leiste.screenshot({ path: join(out, `paket9-leiste-${theme}-${scheme}-breit.png`) })
    await page.click('.leiste-umschalter')
  }

  await darstellung('teal', 'light')
  await page.click('[aria-label="Startseite"]')
  const kacheln = await page.$$eval('.home-tile', (els) =>
    els.map((el) => ({ bild: !!el.querySelector('img.home-illustration'), symbol: !!el.querySelector('.home-illustration svg.programm-symbol') }))
  )
  pruefe(kacheln.length === PROGRAMME.length, `Startseite zeigt ${PROGRAMME.length} Kacheln (${kacheln.length})`)
  pruefe(
    kacheln.every((k) => k.bild || k.symbol),
    'jede Kachel zeigt Illustration oder Symbol'
  )
  await page.locator('.home-tile').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'paket9-start.png') })
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nProgrammsymbole: alles in Ordnung')
