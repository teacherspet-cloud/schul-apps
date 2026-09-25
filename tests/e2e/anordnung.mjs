// Wache für BILD bzw. TABELLE NEBEN den Schreiblinien – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/anordnung.mjs <Ausgabeordner>
//
// Gewünscht von der Lehrkraft (23.09.2026): „die bilder für die aufgaben etc sollen auch
// bündig mit linien zum schreiben daneben möglich sein" und „auch tabellen usw sollen wie
// die bilder angeordnet/platziert werden können".
//
// Der Punkt, auf den es ankommt, lässt sich nur am GESETZTEN Blatt messen: Neben dem
// Baustein stehen kurze Linien, DARUNTER laufen sie über die volle Blattbreite weiter.
// Im Modell sieht beides gleich aus.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/anordnung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-anordnung-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Geometrie des gesetzten Blattes: Wo steht der Baustein, wie breit sind die Linien? */
const messen = async () =>
  page.evaluate(() => {
    const seite = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)[0]
    if (!seite) return null
    const neben = seite.querySelector('.ws-side-image')
    const n = neben?.getBoundingClientRect()
    const s = seite.getBoundingClientRect()
    const linien = [...seite.querySelectorAll('.ws-line')].map((el) => {
      const r = el.getBoundingClientRect()
      // Gezeichnet wird die UNTERKANTE – sie ist das, was man als Schreiblinie sieht
      return { breite: Math.round(r.width), oben: Math.round(r.top - s.top), unten: Math.round(r.bottom - s.top) }
    })
    /*
     * Überstand über den bedruckbaren Bereich.
     *
     * Gemeldet von der Lehrkraft (24.09.2026): „bis man die tabellen anklickt sind sie
     * teilweise links (ggfs. auch rechts) aus dem druckbaren bereich hinausragend".
     * Gemessen wird gegen die INHALTSFLÄCHE, nicht gegen das Blatt – der Rand gehört dazu.
     */
    const body = seite.querySelector('.ws-body')?.getBoundingClientRect()
    /*
     * Wie viel HÖHER ist der seitliche Kasten als das, was man sieht?
     *
     * Gemeldet mit Bildschirmfoto (24.09.2026): Unter der Tabelle hingen zwei verkürzte
     * Linien, links daneben leeres Papier. Ursache ist immer dieselbe – der umflossene
     * Kasten reicht tiefer als sein sichtbarer Inhalt, also weichen die Linien noch aus.
     */
    const inhalt = neben?.querySelector('table, img, figure, .ws-table')?.getBoundingClientRect()
    const leerlauf = n && inhalt ? Math.round(n.bottom - inhalt.bottom) : 0
    const inhaltUnten = inhalt ? Math.round(inhalt.bottom - s.top) : 0
    return {
      leerlauf,
      inhaltUnten,
      ueberLinks: n && body ? Math.round(body.left - n.left) : 0,
      ueberRechts: n && body ? Math.round(n.right - body.right) : 0,
      nebenLinks: n ? Math.round(n.left - s.left) : -1,
      nebenBreite: n ? Math.round(n.width) : 0,
      nebenUnten: n ? Math.round(n.bottom - s.top) : 0,
      seiteBreite: Math.round(s.width),
      istLinks: neben?.classList.contains('ws-side-left') ?? false,
      linien
    }
  })

/** Prüft eine Anordnung vollständig. */
const pruefeAnordnung = async (was, seite) => {
  await page.evaluate(([w, s]) => window.__selftest.wsAnordnung(w, s), [was, seite])
  await page.waitForTimeout(2500)
  const m = await messen()
  if (!m) return problems.push(`${was}/${seite}: Es wurde keine Seite gesetzt`)

  /*
   * Schmal oder breit – gemessen an den Linien selbst, nicht an der Unterkante des
   * Bausteins. Die Linien kommen in Zweierpäckchen (siehe `linienAbschnitte`); das Päckchen,
   * das die Unterkante überschreitet, bleibt noch schmal. Das ist richtig so, ließe eine
   * Prüfung an der Unterkante aber fälschlich durchfallen.
   */
  const breiteste = Math.max(...m.linien.map((l) => l.breite))
  const schmal = m.linien.filter((l) => l.breite < breiteste * 0.9)
  const breit = m.linien.filter((l) => l.breite >= breiteste * 0.9)
  console.log(
    `${was} ${seite}: Baustein ${m.nebenBreite} breit bei x=${m.nebenLinks}, Unterkante ${m.nebenUnten} · ${schmal.length} Linien schmal (${schmal[0]?.breite ?? 0}), ${breit.length} über volle Breite (${breiteste})`
  )

  console.log(
    '     Kästen:',
    JSON.stringify(
      await page.evaluate(() => {
        const seite = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)[0]
        const n = seite?.querySelector('.ws-side-image')
        if (!n) return null
        const kette = []
        let el = n
        while (el && el !== seite) {
          const r = el.getBoundingClientRect()
          kette.push(`${el.tagName}.${String(el.className).split(' ').slice(0, 2).join('.')} unten=${Math.round(r.bottom)}`)
          el = el.firstElementChild
        }
        const tab = n.querySelector('table')
        return { kette, tabelleUnten: tab ? Math.round(tab.getBoundingClientRect().bottom) : 0 }
      })
    )
  )
  pruefe(m.nebenBreite > 0, `${was} ${seite}: Der Baustein steht seitlich`)
  pruefe(m.istLinks === (seite === 'left'), `${was} ${seite}: Er steht auf der gewählten Seite`)
  // Links heißt: am linken Blattrand. Rechts heißt: in der rechten Blatthälfte.
  pruefe(
    seite === 'left' ? m.nebenLinks < m.seiteBreite / 3 : m.nebenLinks > m.seiteBreite / 2,
    `${was} ${seite}: Er sitzt an der richtigen Blattkante (x=${m.nebenLinks} von ${m.seiteBreite})`
  )
  pruefe(schmal.length > 0, `${was} ${seite}: Neben dem Baustein stehen verkürzte Schreiblinien (${schmal.length})`)
  /*
   * Der eigentliche Wunsch: UNTER dem Baustein wird die volle Blattbreite genutzt.
   * Bliebe die Spalte schmal, ginge rechts ein Streifen Papier verloren – und die Zeilen
   * wären zum Schreiben zu kurz.
   */
  pruefe(breit.length > 0, `${was} ${seite}: Darunter laufen die Linien über die volle Breite (${breit.length})`)
  /*
   * Kein Überstand über den bedruckbaren Bereich – gemeldet für Tabellen, gilt für Bilder
   * genauso. Ein Millimeter Rundung ist erlaubt, mehr nicht.
   */
  pruefe(m.leerlauf <= 14, `${was} ${seite}: Der Kasten endet kurz unter seinem Inhalt (${m.leerlauf} Punkte Leerlauf)`)
  /*
   * HÄNGENDE LINIEN – der eigentliche Mangel aus dem Bildschirmfoto der Lehrkraft
   * (24.09.2026): Unter der Tabelle standen zwei verkürzte Linien, links daneben leeres
   * Papier. Eine einzelne darf es geben – sie liegt zwangsläufig auf der Kante –, zwei
   * sehen nach einem Satzfehler aus.
   */
  const haengend = schmal.filter((l) => l.unten > m.inhaltUnten + 2)
  pruefe(haengend.length <= 1, `${was} ${seite}: Höchstens eine verkürzte Linie hängt unter dem Kasten (${haengend.length})`)
  pruefe(m.ueberLinks <= 2, `${was} ${seite}: Kein Überstand nach links (${m.ueberLinks} Punkte)`)
  pruefe(m.ueberRechts <= 2, `${was} ${seite}: Kein Überstand nach rechts (${m.ueberRechts} Punkte)`)
  /*
   * Gleichmäßiger Zeilenabstand über den Übergang hinweg.
   *
   * Gemeldet: „die Linien … nicht gut nach unten hin angrenzend an die tabellen". Wenn beim
   * Wechsel von schmal auf breit eine Lücke entsteht, schreibt man auf einem Blatt mit
   * ungleichen Zeilen – das fällt sofort auf und sieht nach einem Satzfehler aus.
   */
  const abstaende = m.linien.slice(1).map((l, k) => l.oben - m.linien[k].oben)
  const normal = abstaende.length ? abstaende.sort((a, b) => a - b)[Math.floor(abstaende.length / 2)] : 0
  const ausreisser = abstaende.filter((a) => Math.abs(a - normal) > 3)
  pruefe(ausreisser.length === 0, `${was} ${seite}: Gleichmäßiger Zeilenabstand (${normal} Punkte; Ausreißer: ${ausreisser.join(', ') || 'keine'})`)
  if (schmal.length && breit.length) {
    pruefe(breiteste > schmal[0].breite * 1.3, `${was} ${seite}: Die Linien darunter sind deutlich länger (${schmal[0].breite} → ${breiteste})`)
    // Erst schmal, dann breit – ein Wechsel hin und her wäre ein Satzfehler
    pruefe(
      Math.max(...schmal.map((l) => l.oben)) < Math.min(...breit.map((l) => l.oben)),
      `${was} ${seite}: Die verkürzten Linien stehen alle oben, die langen alle darunter`
    )
    // Der Wechsel darf nicht lange auf sich warten lassen, sonst bleibt Papier ungenutzt
    const versatz = Math.min(...breit.map((l) => l.oben)) - m.nebenUnten
    pruefe(versatz < 60, `${was} ${seite}: Die volle Breite beginnt kurz unter dem Baustein (${versatz} Punkte)`)
  }
  await page.screenshot({ path: join(out, `${was}-${seite}.png`), fullPage: false })
}

await pruefeAnordnung('tabelle', 'left')
await pruefeAnordnung('tabelle', 'right')
await pruefeAnordnung('bild', 'left')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nBild und Tabelle stehen bündig neben den Schreiblinien. Bilder in ${out}`)
