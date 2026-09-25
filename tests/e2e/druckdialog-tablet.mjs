// Wache für die DRUCKVORSCHAU auf flachen Bildschirmen (vorher: npm run build).
// Aufruf: node tests/e2e/druckdialog-tablet.mjs <Ausgabeordner>
//
// Gemeldet am 25.09.2026: „in der webversion wird beim druckdialog nicht alles angezeigt,
// insb. nicht der button zum drucken (am tablet)."
//
// Die Bedienspalte hatte die feste Höhe des Dialogs, aber keinen eigenen Rollbereich. Auf
// einem flachen Bildschirm stand „Drucken" unterhalb des Randes – man sah den Dialog, kam
// aber nicht zum Druck. Geprüft wird deshalb bei Tablet-Maßen, ob die Knöpfe wirklich im
// sichtbaren Bereich liegen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/druckdialog-tablet')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-druck-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(14))
await page.waitForTimeout(2500)

/*
 * Erst hier auf Tablet-Maße. Das Blatt entsteht in voller Größe – geprüft wird der DIALOG,
 * und der wird am Tablet geöffnet.
 */
/*
 * `unmaximize` zuerst: Ein maximiertes Fenster nimmt keine neue Größe an – die Wache hätte
 * sonst weiter auf dem großen Bildschirm gemessen und nichts geprüft.
 */
/*
 * Mehrfach versuchen: Ein maximiertes Fenster nimmt keine neue Größe an, und das Aufheben
 * braucht einen Moment. Ohne diese Schleife maß die Wache gelegentlich weiter auf dem großen
 * Bildschirm – und prüfte damit nichts.
 */
for (let versuch = 0; versuch < 5; versuch++) {
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    win.setSize(1024, 768)
  })
  await page.waitForTimeout(900)
  if ((await page.evaluate(() => window.innerHeight)) <= 800) break
}
const masse = await page.evaluate(() => ({ b: window.innerWidth, h: window.innerHeight }))
console.log(`nutzbare Fläche: ${masse.b}×${masse.h}`)
pruefe(masse.h <= 800, `Das Fenster hat Tablet-Maße (${masse.b}×${masse.h})`)

// Genau der Knopf, nicht der gleichnamige Schritt in der Kopfleiste („Word, PDF, Drucken")
await page.getByRole('button', { name: 'Drucken', exact: true }).first().click()
await page.waitForTimeout(8000)

/*
 * „Drucken" öffnet zuerst die Auswahl (welche Blätter, mit Lösungen?); die Seitenansicht mit
 * dem eigentlichen Druckknopf kommt einen Schritt später. Beide müssen am Tablet bedienbar
 * sein – gemeldet war die zweite.
 */
const auswahl = page.locator('.mantine-Modal-content')
pruefe((await auswahl.count()) > 0, 'Die Auswahl vor dem Druck öffnet sich')
const weiter = auswahl.getByRole('button', { name: 'Weiter zur Druckvorschau', exact: true }).first()
const weiterLage = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.mantine-Modal-content button')].find((b) => b.innerText.includes('Weiter zur Druckvorschau'))
  if (!k) return null
  const r = k.getBoundingClientRect()
  return { unten: Math.round(r.bottom), hoehe: Math.round(window.innerHeight) }
})
pruefe(
  Boolean(weiterLage) && weiterLage.unten <= weiterLage.hoehe,
  `Der Knopf „Weiter zur Druckvorschau" liegt im sichtbaren Bereich (${weiterLage?.unten} von ${weiterLage?.hoehe} px)`
)
await weiter.click()
// Die Vorschau rendert das PDF – das dauert
await page.waitForTimeout(12000)

const dialog = page.locator('.mantine-Modal-content')
pruefe((await dialog.count()) > 0, 'Die Druckvorschau öffnet sich')

/*
 * Gemessen wird IN DER SEITE, nicht über `boundingBox`.
 *
 * Bei gesetztem Zoom liefert Playwright Gerätepunkte, `window.innerHeight` aber CSS-Pixel –
 * ein Vergleich beider Werte sagt nichts. `getBoundingClientRect` und `innerHeight` stehen
 * dagegen in derselben Einheit.
 */
const sichtbar = async (name) =>
  page.evaluate((gesucht) => {
    const knopf = [...document.querySelectorAll('.mantine-Modal-content button')].find((b) => b.innerText.replace(/\s+/g, ' ').trim() === gesucht)
    if (!knopf) return { da: false }
    const r = knopf.getBoundingClientRect()
    return {
      da: true,
      oben: Math.round(r.top),
      unten: Math.round(r.bottom),
      hoehe: Math.round(window.innerHeight),
      drin: r.top >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
    }
  }, name)

console.log(
  '   Knöpfe im Dialog:',
  JSON.stringify(await dialog.locator('button').evaluateAll((bs) => bs.map((b) => `${b.innerText.replace(/\s+/g, ' ').trim()}|${b.disabled ? 'aus' : 'an'}`)))
)
for (const name of ['Drucken', 'Abbrechen']) {
  const s = await sichtbar(name)
  pruefe(s.da, `Der Knopf „${name}" ist im Dialog vorhanden`)
  if (s.da) {
    console.log(`     „${name}": ${s.oben}–${s.unten} px von ${s.hoehe} px Höhe`)
    pruefe(s.drin, `Der Knopf „${name}" liegt im sichtbaren Bereich`)
  }
}

// Die Einstellungen müssen erreichbar bleiben: der Drucker steht ganz oben
pruefe((await dialog.locator('input').count()) > 0, 'Die Einstellungen sind erreichbar')

/*
 * Die eigentliche Zusage: Die Knöpfe stehen AUSSERHALB des Rollbereichs. Läge „Drucken"
 * darin, könnte er bei jeder anderen Bildschirmgröße wieder wegrutschen – die Sichtprüfung
 * oben gilt immer nur für die gerade geprüfte Größe.
 */
const imRollbereich = await dialog.evaluate((d) => {
  const knopf = [...d.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Drucken')
  return Boolean(knopf?.closest('.pv-felder'))
})
pruefe(!imRollbereich, 'Der Druckknopf steht fest unter den Einstellungen, nicht im Rollbereich')
/*
 * Und die Spalte darf nicht über ihren Platz hinauswachsen. Das ist der deterministische
 * Nachweis: Sind die Einstellungen höher als der Raum, muss der Rollbereich sie aufnehmen –
 * sonst schiebt sich alles nach unten und die Knöpfe verschwinden, ganz gleich wie groß der
 * Bildschirm ist.
 */
const spalte = await page.evaluate(() => {
  const s = document.querySelector('.pv-seite')
  const feld = document.querySelector('.pv-felder')
  const sicht = feld?.querySelector('[data-scrollarea-viewport], .mantine-ScrollArea-viewport') ?? feld
  if (!s || !sicht) return null
  return {
    ueberlauf: Math.round(s.scrollHeight - s.clientHeight),
    rollt: sicht.scrollHeight > sicht.clientHeight + 2
  }
})
console.log(`     Spalte: Überlauf ${spalte?.ueberlauf} px · Einstellungen rollen: ${spalte?.rollt}`)
pruefe(Boolean(spalte) && spalte.ueberlauf <= 2, `Die Bedienspalte wächst nicht über ihren Platz hinaus (${spalte?.ueberlauf} px)`)

await page.screenshot({ path: join(out, 'druckdialog.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDie Druckvorschau ist auf dem Tablet vollständig bedienbar. Bild in ${out}`)
