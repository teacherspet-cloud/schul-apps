// Wache für die Formulare (Paket 6, Nachträge Paket 7) – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/formulare.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (25.09.2026):
// - Der Hauptknopf („Gliederung planen", „… erstellen", „Weiter …") steht IMMER sichtbar unten,
//   auch am Tablet quer (1024×690), ohne zu scrollen.
// - Ist er gesperrt, steht daneben der Grund („Thema fehlt").
// - Selten Geändertes steht eingeklappt unter „Weitere Optionen"; auf/zu wird je Programm
//   gemerkt, und die eingeklappte Überschrift nennt, was vom Standard abweicht.
//
// Es wird nichts erzeugt: Die Knöpfe werden nur auf Sichtbarkeit und Sperre geprüft.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/formulare')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-formulare-'))
const starte = async () => {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1024, height: 690 })
  await warteAufOberflaeche(page)
  return { app, page }
}

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Liegt der Knopf ganz im sichtbaren Fenster – ohne zu scrollen? */
const imBild = async (page, name) => {
  const knopf = page.getByRole('button', { name, exact: true }).filter({ visible: true })
  if (!(await knopf.count())) return { da: false }
  const box = await knopf.first().boundingBox()
  const vp = page.viewportSize()
  return {
    da: true,
    sichtbar: Boolean(box) && box.y >= 0 && box.y + box.height <= vp.height && box.x + box.width <= vp.width,
    gesperrt: await knopf.first().isDisabled()
  }
}

// Nur im SICHTBAREN Programm suchen – die anderen bleiben im Hintergrund geöffnet
const sperrgrund = async (page) => {
  const el = page.locator('[data-testid="sperrgrund"]:visible')
  return (await el.count()) ? (await el.first().innerText()).trim() : ''
}
const weitereKopf = (page) => page.locator('.weitere-optionen-kopf:visible')

let { app, page } = await starte()

// ---------- Arbeitsblatt ----------
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForSelector('text=Thema & Lerngruppe')
await page.waitForTimeout(800)
let k = await imBild(page, 'Gliederung planen')
pruefe(k.da && k.sichtbar, 'Arbeitsblatt: „Gliederung planen“ ist ohne Scrollen sichtbar')
pruefe(k.gesperrt, 'Arbeitsblatt: ohne Thema gesperrt')
pruefe((await sperrgrund(page)).includes('Thema fehlt'), `Arbeitsblatt: Sperrgrund „Thema fehlt“ (${await sperrgrund(page)})`)
await page.screenshot({ path: join(out, 'paket6-arbeitsblatt-formular.png') })
/*
 * Mit Auftragsleiste unten rechts (sie setzt `data-auftraege` am Wurzelelement, AuftragsLayer.tsx)
 * endet der Fuß über ihr – die Pille (bis 60 Punkte vom Rand) verdeckt den Knopf nicht.
 */
await page.evaluate(() => document.documentElement.setAttribute('data-auftraege', ''))
await page.waitForTimeout(300)
const fussUnten = await page.evaluate(
  () => [...document.querySelectorAll('.formular-fuss')].find((f) => f.offsetParent !== null)?.getBoundingClientRect().bottom ?? 9999
)
pruefe(fussUnten <= 690 - 56, `Mit Auftragsleiste endet der Fuß über ihr (unten bei ${Math.round(fussUnten)} von 690)`)
await page.evaluate(() => document.documentElement.removeAttribute('data-auftraege'))
// Nach dem Thema ist der Grund weg (der KI-Zugang fehlt im leeren Profil – dann steht DER da)
await page.getByRole('textbox', { name: 'Thema', exact: true }).fill('Fotosynthese')
await page.waitForTimeout(300)
const grundDanach = await sperrgrund(page)
pruefe(!grundDanach.includes('Thema fehlt'), `Arbeitsblatt: mit Thema kein „Thema fehlt“ mehr (${grundDanach || 'kein Grund'})`)
pruefe(grundDanach === '' || grundDanach.includes('KI-Zugang'), 'Arbeitsblatt: übrig bleibt höchstens der fehlende KI-Zugang (mit Link)')

// Weitere Optionen: zu, auf, gemerkt
const kopf = weitereKopf(page)
pruefe((await kopf.getAttribute('aria-expanded')) === 'false', 'Arbeitsblatt: „Weitere Optionen“ ist anfangs eingeklappt')
pruefe(!(await page.getByText('Bevorzugte Sozialformen (optional)').isVisible()), 'Arbeitsblatt: Sozialformen stehen eingeklappt nicht im Formular')
// Paket 7: Lösungsblatt, Hilfekarten, Tafelbild, Differenzierung und Bilder bleiben IMMER sichtbar
for (const t of ['Lösungsblatt erstellen', 'Tipp- und Hilfekarten anlegen', 'Tafelbild zur Sicherung mit erstellen']) {
  pruefe(await page.getByText(t, { exact: true }).first().isVisible(), `Arbeitsblatt: „${t}“ steht eingeklappt sichtbar im Formular`)
}
pruefe(await page.getByText('Differenzierung', { exact: true }).first().isVisible(), 'Arbeitsblatt: Differenzierung steht sichtbar im Formular')
pruefe(await page.getByRole('combobox', { name: 'Bilder auf dem Blatt' }).isVisible(), 'Arbeitsblatt: „Bilder auf dem Blatt“ steht sichtbar im Formular')
pruefe(await page.getByRole('combobox', { name: 'Woher die Bilder kommen' }).isVisible(), 'Arbeitsblatt: „Woher die Bilder kommen“ steht sichtbar im Formular')
pruefe(await page.getByText('Ein Schmuckbild zulassen').isVisible(), 'Arbeitsblatt: Schmuckbild-Schalter steht sichtbar im Formular')
// Seitenzahl automatisch (Paket 7)
const seitenHinweis = (await page.locator('[data-testid="seiten-hinweis"]:visible').first().innerText()).trim()
pruefe(/legt die Seitenzahl selbst fest/.test(seitenHinweis), `Arbeitsblatt: Seitenzahl ist standardmäßig automatisch („${seitenHinweis}“)`)
// Die Anpassungs-Karte steht in „Weitere Optionen“ – eingeklappt also nicht sichtbar
pruefe(!(await page.locator('[data-testid="profil-karte"]').isVisible()), 'Arbeitsblatt: Profilkarte steht eingeklappt nicht im Formular')
// Etwas vom Standard abweichen lassen: Differenzierung zählt NICHT mehr (steht oben)
await page.getByText('★ / ★★', { exact: true }).first().click()
await page.waitForTimeout(300)
pruefe(
  !(await page.locator('[data-testid="weitere-optionen-zusammenfassung"]:visible').count()),
  'Arbeitsblatt: sichtbare Felder erscheinen nicht in der Zusammenfassung'
)
await kopf.click()
await page.waitForTimeout(500)
pruefe((await kopf.getAttribute('aria-expanded')) === 'true', 'Arbeitsblatt: „Weitere Optionen“ klappt auf')
pruefe(
  await page.locator('[data-testid="profil-karte"]').isVisible(),
  'Arbeitsblatt: Profilkarte „So wird das Arbeitsblatt angepasst“ steht in „Weitere Optionen“'
)
pruefe(await page.getByText('Schrift & Satz').isVisible(), 'Arbeitsblatt: Profilkarte gegliedert (Schrift & Satz)')
await page.locator('[data-testid="profil-karte"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, 'paket7-arbeitsblatt-weitere-optionen.png') })
// Piktogramme einschalten – das steht eingeklappt in der Zusammenfassung
await page.getByRole('switch', { name: 'Piktogramme an den Arbeitsanweisungen' }).check({ force: true })
await page.waitForTimeout(300)
await kopf.click()
await page.waitForTimeout(500)
const zusammenfassung = (await page.locator('[data-testid="weitere-optionen-zusammenfassung"]:visible').first().innerText()).trim()
pruefe(/1 geändert: Piktogramme/.test(zusammenfassung), `Arbeitsblatt: eingeklappt steht, was geändert ist („${zusammenfassung}“)`)
await page.evaluate(() => document.querySelector('.formular-inhalt .mantine-ScrollArea-viewport')?.scrollTo(0, 0))
await page.screenshot({ path: join(out, 'paket7-arbeitsblatt-formular.png') })
await kopf.click()
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'paket6-weitere-optionen.png') })

// ---------- Lernzielkontrolle ----------
await page.click('[aria-label="Lernzielkontrolle"]')
await page.waitForTimeout(1200)
k = await imBild(page, 'Lernzielkontrolle erstellen')
pruefe(k.da && k.sichtbar, 'LZK: „Lernzielkontrolle erstellen“ ist ohne Scrollen sichtbar')
pruefe(k.gesperrt && (await sperrgrund(page)).includes('Thema fehlt'), `LZK: gesperrt mit Grund „Thema fehlt“ (${await sperrgrund(page)})`)
pruefe((await weitereKopf(page).getAttribute('aria-expanded')) === 'false', 'LZK: eigener Zustand – eingeklappt, obwohl im Arbeitsblatt offen')
for (const t of ['Punkte je Aufgabe auf dem Blatt', 'Lösungsblatt für die Lehrkraft', 'Sprachliche Hilfen zulassen']) {
  pruefe(await page.getByText(t, { exact: true }).first().isVisible(), `LZK: „${t}“ steht eingeklappt sichtbar im Formular`)
}
await page.screenshot({ path: join(out, 'paket6-lzk-formular.png') })

// ---------- Grammatiktest ----------
await page.click('[aria-label="Grammatiktest"]')
await page.waitForTimeout(1200)
k = await imBild(page, 'Test erstellen')
pruefe(k.da && k.sichtbar, 'Grammatiktest: „Test erstellen“ ist ohne Scrollen sichtbar')
pruefe(k.gesperrt && (await sperrgrund(page)).includes('Form'), `Grammatiktest: gesperrt mit Grund (${await sperrgrund(page)})`)
pruefe(await page.getByText('Test wird benotet', { exact: true }).isVisible(), 'Grammatiktest: „Test wird benotet“ steht eingeklappt sichtbar im Formular')
await page.screenshot({ path: join(out, 'paket6-grammatiktest-formular.png') })

// ---------- Klassenarbeit ----------
await page.click('[aria-label="Klassenarbeiten"]')
await page.waitForTimeout(1200)
k = await imBild(page, 'Weiter zu den Aufgaben')
pruefe(k.da && k.sichtbar, 'Klassenarbeit: „Weiter zu den Aufgaben“ ist ohne Scrollen sichtbar')
pruefe(k.gesperrt && (await sperrgrund(page)).length > 0, `Klassenarbeit: gesperrt mit Grund (${await sperrgrund(page)})`)
pruefe(
  await page.getByText('Erwartungshorizont erstellen', { exact: true }).isVisible(),
  'Klassenarbeit: „Erwartungshorizont erstellen“ steht eingeklappt sichtbar im Formular'
)
pruefe(
  await page.getByRole('combobox', { name: 'Ausführlichkeit des Erwartungshorizonts' }).isVisible(),
  'Klassenarbeit: Ausführlichkeit steht sichtbar im Formular'
)
await page.screenshot({ path: join(out, 'paket6-klassenarbeit-formular.png') })

// ---------- Vokabeltest (Schritt 2: Test einstellen) ----------
await page.click('[aria-label="Vokabeltest"]')
await page.waitForSelector('text=Vokabelliste')
await page.getByRole('tab', { name: 'Schulbuch' }).click()
await page.getByRole('combobox', { name: 'Lehrwerk' }).click()
await page.getByRole('option', { name: 'Green Line 4', exact: true }).click()
await page.getByRole('combobox', { name: 'Unit', exact: true }).click()
await page.getByRole('option', { name: 'Unit 1', exact: true }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'alle' }).click()
await page.getByRole('button', { name: /Vokabeln anzeigen und auswählen/ }).click()
await page.waitForSelector('text=Vokabeln prüfen und festlegen, was abgefragt wird')
await page.getByRole('button', { name: 'Bisherige Liste ersetzen' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Weiter zu den Testeinstellungen/ }).click()
await page.waitForSelector('text=Test einstellen')
await page.waitForTimeout(600)
k = await imBild(page, 'Test erstellen')
pruefe(k.da && k.sichtbar, 'Vokabeltest: „Test erstellen“ ist ohne Scrollen sichtbar')
const zurueck = await imBild(page, 'Zurück zur Vokabelliste')
pruefe(zurueck.da && zurueck.sichtbar, 'Vokabeltest: „Zurück zur Vokabelliste“ steht in derselben Leiste')
await page.screenshot({ path: join(out, 'paket6-vokabeltest-formular.png') })

// ---------- Gemerkt über einen Neustart ----------
await app.close()
;({ app, page } = await starte())
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(1500)
// Mit gespeichertem Blatt öffnet das Programm die Bibliothek – ein neues Blatt zeigt das Formular
const neu = page.getByRole('button', { name: 'Neues Arbeitsblatt' }).filter({ visible: true })
if (await neu.count()) await neu.first().click()
await page.waitForSelector('text=Thema & Lerngruppe')
await page.waitForTimeout(600)
pruefe((await weitereKopf(page).getAttribute('aria-expanded')) === 'true', 'Arbeitsblatt: „Weitere Optionen“ ist nach dem Neustart weiter offen (gemerkt)')
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
