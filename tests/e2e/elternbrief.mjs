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
        // Fettdruck mit **…** (09.10.2026) – die Frist steht schon auf dem Abschnitt
        absaetze: [
          'am **12. Oktober** wandern wir in den Wildpark. Treffpunkt ist um **8:00 Uhr** auf dem **Schulhof**.',
          'Bitte geben Sie Ihrem Kind bis zum 5. Oktober **5 €** mit.'
        ],
        gruss: 'Mit freundlichen Grüßen',
        ruecklaufTitel: 'Rückmeldung zum Wandertag',
        ruecklaufZeilen: ['Bitte bis **Mo, 05.10.** zurückgeben.', '☐ [Name des Kindes] nimmt teil.', 'Unterschrift: ______________']
      },
      elternbrief_uebersetzung: {
        betreff: 'يوم المشي في 12 أكتوبر',
        anrede: 'أولياء الأمور الأعزاء،',
        absaetze: ['في 12 أكتوبر نذهب إلى حديقة الحيوانات البرية.', 'يرجى إعطاء طفلكم 5 يورو حتى 5 أكتوبر.'],
        gruss: 'مع أطيب التحيات',
        ruecklaufTitel: 'رد',
        ruecklaufZeilen: ['يرجى الإرجاع حتى **05.10.**', '☐ [Name des Kindes]', 'التوقيع'],
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
  // Über die Leiste öffnen (Strg+Ziffer folgt der Reihenfolge der Programme – Strg+7 ist am PC „Tafelbilder")
  await sichtbar(page.locator('.app-leiste [aria-label="Elternbriefe"]')).click()
  // Erstes Öffnen in der Sitzung: Übersicht „Meine Elternbriefe" (09.10.2026, shared/sitzung.ts) – von dort ein neuer Brief
  const anlass = sichtbar(page.getByText('Anlass & Stichpunkte', { exact: true }))
  const neuerBrief = sichtbar(page.getByRole('button', { name: 'Neuer Elternbrief' }))
  await Promise.race([anlass.waitFor({ timeout: 10000 }), neuerBrief.waitFor({ timeout: 10000 })]).catch(() => undefined)
  if (!(await anlass.isVisible().catch(() => false)) && (await neuerBrief.isVisible().catch(() => false))) await neuerBrief.click()
  await anlass.waitFor({ timeout: 10000 })
  pruefe(true, 'Leiste öffnet „Elternbriefe"')
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
  pruefe(a.length === 1 && /FETTDRUCK/.test(a[0].user) && a[0].user.includes('Bitte bis **Mo, 05.10.** zurückgeben.'), 'Die Anfrage verlangt Fettdruck und die Frist auf dem Abschnitt')
  const geschrieben = await page.evaluate(() => window.__selftest.ebJetzt())
  pruefe(
    geschrieben?.text?.absaetze?.[1] === 'Bitte geben Sie Ihrem Kind bis zum **5. Oktober** **5 €** mit.',
    'Nachprüfung: die vergessene Frist im Text ist fett'
  )
  pruefe(geschrieben?.text?.ruecklauf?.zeilen?.length === 3, 'Die Frist steht genau einmal auf dem Abschnitt')
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

  // ---------- Bibliothek (09.10.2026): Schuljahr → Klasse → Datum, Marken, Vorschau, Ansicht, Anlass, Vorlage
  // Ein älterer Brief (Schuljahr 2023/24, ohne gespeicherte Kurzinfo) – die Bibliothek rechnet sie aus dem Brief nach
  await page.evaluate(() =>
    window.api.elternbriefe.save({
      id: 'eb-alt-1',
      name: 'Einladung 6a',
      stats: {},
      payload: {
        version: 1,
        meta: { title: '', anlass: 'Elternabend', ton: 'freundlich', stichpunkte: '', klasse: '6a', absender: '', datum: '2024-03-01', ruecklauf: false },
        text: { betreff: 'Einladung', anrede: 'Liebe Eltern,', absaetze: ['am **Dienstag, 12.03.2024** um **19 Uhr**.'], gruss: 'Mit freundlichen Grüßen' },
        uebersetzungen: [],
        createdAt: '2024-03-01T10:00:00.000Z'
      }
    })
  )
  // Warten, bis die automatische Sicherung den Brief mit Übersetzung abgelegt hat
  const bisGesichert = Date.now() + 15000
  while (Date.now() < bisGesichert) {
    const l = await page.evaluate(() => window.api.elternbriefe.list())
    if (l.some((m) => m.eb?.sprachen?.includes('ar'))) break
    await page.waitForTimeout(400)
  }
  await sichtbar(page.getByRole('button', { name: 'Meine Elternbriefe', exact: true })).click()
  const heute = new Date()
  const sj = heute.getMonth() >= 7 ? heute.getFullYear() : heute.getFullYear() - 1
  const sjName = `${sj}/${String((sj + 1) % 100).padStart(2, '0')}`
  const jetztJahr = sichtbar(page.locator(`[data-eb-schuljahr="${sjName}"]`))
  await jetztJahr.waitFor({ timeout: 10000 })
  pruefe((await jetztJahr.getAttribute('data-offen')) === 'ja', `Bibliothek: das laufende Schuljahr ${sjName} ist aufgeklappt`)
  pruefe((await jetztJahr.locator('[data-eb-klasse="Ohne Klasse"]').count()) === 1, 'Bibliothek: Brief ohne Klasse unter „Ohne Klasse"')
  const marken = jetztJahr.locator('[data-eb-marken]').first()
  pruefe((await marken.locator('[data-eb-anlass="Ausflug/Wandertag"]').count()) === 1, 'Bibliothek: Anlass „Ausflug/Wandertag" erkannt')
  pruefe((await marken.locator('[data-eb-termin-marke]').innerText().catch(() => '')).includes('Mo 12.10.'), 'Bibliothek: Termin aus dem Brief („Mo 12.10.")')
  pruefe(
    // textContent: das Abzeichen setzt den Text in Großbuchstaben (innerText liefert „RÜCKMELDUNG BIS …")
    ((await marken.locator('[data-eb-frist-marke]').textContent().catch(() => '')) ?? '').includes('Rückmeldung bis Mo 05.10.'),
    'Bibliothek: Rückmeldefrist „Rückmeldung bis Mo 05.10."'
  )
  pruefe((await marken.locator('[data-eb-sprache="ar"]').innerText().catch(() => '')) === 'AR', 'Bibliothek: Sprachkürzel AR')
  pruefe((await sichtbar(page.locator('[data-eb-zuletzt-eintrag]')).count()) === 1, 'Bibliothek: „Zuletzt bearbeitet" steht oben')
  await sichtbar(page.locator('[data-eb-vorschau="bild"]'))
    .waitFor({ timeout: 8000 })
    .catch(() => undefined)
  pruefe((await page.locator('[data-eb-vorschau="bild"] iframe').filter({ visible: true }).count()) >= 1, 'Bibliothek: Karten mit Vorschau der ersten Seite')
  const altesJahr = sichtbar(page.locator('[data-eb-schuljahr="2023/24"]'))
  pruefe((await altesJahr.getAttribute('data-offen')) === 'nein', 'Bibliothek: älteres Schuljahr zugeklappt')
  await altesJahr.getByRole('button', { name: /Schuljahr 2023\/24/ }).click()
  await page.waitForTimeout(300)
  pruefe(
    (await altesJahr.locator('[data-eb-klasse="6a"] [data-eb-anlass="Elternabend"]').count()) === 1,
    'Bibliothek: aufgeklappt – Klasse 6a, Anlass aus dem Brief nachgerechnet'
  )
  await page.screenshot({ path: join(out, 'bibliothek-karten.png') })

  // Liste statt Karten – je Gerät gemerkt
  await sichtbar(page.locator('[data-eb-ansicht]')).locator('label', { hasText: 'Liste' }).click()
  await page.waitForTimeout(300)
  pruefe((await page.evaluate(() => localStorage.getItem('schulapps-elternbrief-ansicht'))) === 'liste', 'Bibliothek: Listenansicht wird gemerkt')
  pruefe((await page.locator('[data-eb-vorschau]').filter({ visible: true }).count()) === 0, 'Bibliothek: Liste ohne Vorschaubilder')
  await page.screenshot({ path: join(out, 'bibliothek-liste.png') })

  // Anlass im Menü ändern (der Brief ist offen: über den Editor gespeichert)
  const name = await jetztJahr.locator('[data-bibliothek-eintrag]').first().getAttribute('data-bibliothek-eintrag')
  await sichtbar(page.getByRole('button', { name: `Weitere Aktionen für „${name}“` })).click()
  await sichtbar(page.getByRole('menuitem', { name: /^Termine/ })).click()
  await sichtbar(page.locator('[data-eb-anlass="Termine"]'))
    .waitFor({ timeout: 8000 })
    .catch(() => undefined)
  pruefe((await page.evaluate(() => window.__selftest.ebJetzt()?.meta?.anlassArt)) === 'Termine', 'Anlass im Menü geändert und im Brief gespeichert')
  pruefe((await page.locator('[data-eb-anlass="Termine"]').filter({ visible: true }).count()) >= 1, 'Die Marke zeigt den neuen Anlass')

  // Als Vorlage für neuen Brief
  await sichtbar(page.getByRole('button', { name: `Weitere Aktionen für „${name}“` })).click()
  await sichtbar(page.getByRole('menuitem', { name: 'Als Vorlage für neuen Brief' })).click()
  await page.waitForTimeout(800)
  const vorlage = await page.evaluate(() => window.__selftest.ebJetzt())
  pruefe(
    vorlage?.meta?.klasse === '' && !vorlage?.meta?.termin && !vorlage?.meta?.rueckgabeBis && vorlage?.uebersetzungen?.length === 0,
    'Vorlage: ohne Klasse, Termin, Frist und Übersetzungen'
  )
  pruefe(vorlage?.meta?.anlassArt === 'Termine' && vorlage?.meta?.ruecklauf === true, 'Vorlage: Anlass und Rücklaufzettel bleiben')
  pruefe(
    Boolean(vorlage?.text?.absaetze?.[0]?.includes('[Datum]')) && !vorlage?.text?.absaetze?.join(' ').includes('12. Oktober'),
    'Vorlage: Daten im Text sind „[Datum]"'
  )
  await page.screenshot({ path: join(out, 'vorlage.png') })
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
