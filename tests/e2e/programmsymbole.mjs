// Wache für die Programmsymbole – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/programmsymbole.mjs <Ausgabeordner>
//
// Anlass (Paket 9, 26.09.2026): Die Programme tragen eigene Vektorsymbole
// (shared/components/ProgrammSymbol.tsx) statt Tabler-Symbolen; die Startseiten-Kachel zeigt
// eine Illustration, sobald eine vorliegt, sonst das Symbol.
// Paket 10a (Entscheidung der Lehrkraft): Auch die Leiste zeigt die Illustrationen selbst,
// verkleinert (kleine Fassung <id>-96.webp); die Vektorsymbole bleiben Rückfall und stehen im
// Auftrags-Layer. Geprüft wird:
//  - Leiste, schmal (40 px) und breit (30 px), hell und dunkel, normale und farbige Leiste:
//    jedes Programm zeigt sein geladenes Bild, kein Vektorsymbol;
//  - der aktive Knopf hebt sich durch die Fläche um das Bild ab, ruhende haben keine Fläche;
//  - der Laufpunkt der Hintergrund-Aufträge sitzt weiter am Bild;
//  - jede Kachel der Startseite zeigt Illustration oder Symbol.
// Bildschirmfotos: paket10a-leiste-<thema>-<hell|dunkel>-<schmal|breit>.png, paket9-start.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { PNG } from 'pngjs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/programmsymbole')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-symbole-'))
const PROGRAMME = ['Vokabeltest', 'Vokabellisten', 'Arbeitsblatt', 'Lernzielkontrolle', 'Grammatiktest', 'Klassenarbeiten', 'Rückmeldung', 'Elternbriefe']
/*
 * Programme ohne eigene Illustration (Großprogramm 0.4: Rückmeldung, Elternbrief) zeigen ihr
 * gezeichnetes Symbol. Eine Illustration entstünde über die Bild-KI der Lehrkraft – das kostet
 * Kontingent und bleibt ihre Entscheidung.
 */
const OHNE_BILD = ['Rückmeldung', 'Elternbriefe']

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

  /** Programmbild bzw. Symbol eines Leistenknopfs und die Fläche des Knopfes */
  const knopf = (label) =>
    page.evaluate((label) => {
      const k = document.querySelector(`.app-leiste [aria-label="${label}"]`)
      if (!k) return null
      const bild = k.querySelector('img.nav-bild')
      return {
        bild: Boolean(bild),
        geladen: Boolean(bild?.complete && bild.naturalWidth > 0),
        quelle: bild?.naturalWidth ?? 0,
        breite: bild ? Math.round(bild.getBoundingClientRect().width) : 0,
        vektor: Boolean(k.querySelector('svg.programm-symbol')),
        flaeche: getComputedStyle(k).backgroundColor
      }
    }, label)
  const durchsichtig = (farbe) => farbe === 'transparent' || /rgba\(.*,\s*0\)$/.test(farbe)

  async function darstellung(theme, colorScheme) {
    await page.evaluate((a) => window.api.settings.set({ appearance: a }), { theme, colorScheme })
    await page.reload()
    await warteAufOberflaeche(page)
    await page.click('[aria-label="Vokabeltest"]')
  }

  // Paket 10a: In der Leiste stehen die Illustrationen selbst (Entscheidung der Lehrkraft)
  const fotos = []
  for (const [theme, scheme] of [
    ['teal', 'light'],
    ['teal', 'dark'],
    ['blue', 'light'],
    ['blue', 'dark']
  ]) {
    await darstellung(theme, scheme)
    for (const breit of [false, true]) {
      const soll = breit ? 30 : 40
      for (const name of PROGRAMME) {
        const k = await knopf(name)
        if (OHNE_BILD.includes(name)) {
          pruefe(!!k && k.vektor, `${theme}/${scheme}/${breit ? 'breit' : 'schmal'}: ${name} zeigt sein Symbol`)
          continue
        }
        pruefe(
          !!k && k.bild && k.geladen && !k.vektor && k.breite === soll,
          `${theme}/${scheme}/${breit ? 'breit' : 'schmal'}: ${name} zeigt sein Bild (${k?.breite} px)`
        )
      }
      // Die kleine Fassung, nicht die große Kachel: scharf bis 200 % Zoom, ohne unnötige Last
      const k0 = await knopf('Arbeitsblatt')
      pruefe(k0.quelle >= 80 && k0.quelle <= 128, `${theme}/${scheme}: Leistenbild ist die kleine Fassung (${k0.quelle} px)`)
      // Aktiv (Vokabeltest) mit Fläche um das Bild, ruhend (Arbeitsblatt) ohne
      const aktiv = await knopf('Vokabeltest')
      pruefe(!durchsichtig(aktiv.flaeche) && aktiv.flaeche !== k0.flaeche, `${theme}/${scheme}: aktiver Knopf hebt sich ab (${aktiv.flaeche} / ${k0.flaeche})`)
      pruefe(durchsichtig(k0.flaeche), `${theme}/${scheme}: ruhender Knopf ohne Fläche (${k0.flaeche})`)
      const leiste = page.locator('.app-leiste')
      const datei = `paket10a-leiste-${theme}-${scheme}-${breit ? 'breit' : 'schmal'}.png`
      await leiste.screenshot({ path: join(out, datei) })
      fotos.push(datei)
      await page.click('.leiste-umschalter')
      await page.waitForTimeout(250)
    }
  }
  // Der Laufpunkt der Hintergrund-Aufträge sitzt weiter am Bild
  await page.evaluate(() => {
    const ind = document.querySelector('.app-leiste [aria-label="Arbeitsblatt"] .mantine-Indicator-root')
    if (!ind) throw new Error('kein Indicator am Leistenbild')
  })
  pruefe(true, 'der Laufpunkt (Indicator) umschließt das Leistenbild')

  // Alle Leisten nebeneinander in einem Bild: paket10a-leiste.png
  const bilder = fotos.map((f) => PNG.sync.read(readFileSync(join(out, f))))
  const gesamt = new PNG({ width: bilder.reduce((b, p) => b + p.width + 8, 0), height: Math.max(...bilder.map((p) => p.height)) })
  gesamt.data.fill(255)
  let x = 0
  for (const p of bilder) {
    PNG.bitblt(p, gesamt, 0, 0, p.width, p.height, x, 0)
    x += p.width + 8
  }
  writeFileSync(join(out, 'paket10a-leiste.png'), PNG.sync.write(gesamt))

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
