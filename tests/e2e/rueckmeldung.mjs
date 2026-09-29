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
      },
      // Eigene Aufgabe aus einer Datei (29.09.2026)
      rueckmeldung_aufgabe: {
        titel: 'Erörterung Schuluniform',
        aufgaben: '1. Erörtere, ob an eurer Schule eine Schuluniform eingeführt werden sollte.\nMaterial: Zeitungsartikel „Einheitlich gekleidet?“ (Auszug)',
        erwartung: '',
        fach: 'deutsch',
        jahrgang: 9,
        erkennbar: ['Kopfzeile: Deutsch 9a']
      },
      rueckmeldung_erwartung: { erwartung: '- Einleitung mit Hinführung\n- Pro- und Kontra-Argumente mit Beispielen\n- eigenes Urteil' }
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
  await sichtbar(page.getByLabel('Text von S1')).fill(
    'Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht. Lea Schmidt sagt, Jonas sieht das auch so.'
  )
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
  pruefe(a.length === 1 && !/Lea|Schmidt|Jonas/.test(a[0].user) && a[0].user.includes('S1'), 'Die KI sieht nur Kürzel – auch Namen im Text sind ersetzt')
  pruefe(a.length === 1 && /KEINE Note, KEINE Punkte/.test(a[0].user), 'Die Anfrage verbietet Noten und Punkte')
  await page.getByText('Rückmeldung für Lea Schmidt').waitFor({ timeout: 10000 })
  pruefe(true, 'Die Ansicht zeigt den Namen – eingesetzt am Rechner')
  await page.screenshot({ path: join(out, 'boegen.png') })

  // Vokabeltest als Grundlage: Knopf „Rückmeldung …" im Vokabeltest-Editor
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.vtMitHinweis('[Prüfung] Beispiel'))
  await page.waitForTimeout(1500)
  await sichtbar(page.locator('[data-rueckmeldung-zu]')).click()
  const ende2 = Date.now() + 15000
  let grundlage = null
  while (Date.now() < ende2) {
    grundlage = await page.evaluate(() => window.__selftest.rmJetzt()?.grundlage ?? null)
    if (grundlage?.art === 'vokabeltest') break
    await page.waitForTimeout(300)
  }
  pruefe(grundlage?.art === 'vokabeltest', 'Aus dem Vokabeltest entsteht eine Rückmeldung mit ihm als Grundlage')
  pruefe(Boolean(grundlage?.aufgaben?.includes('Write a sentence with each word.')), 'Die Aufgaben des Vokabeltests stehen in der Grundlage')
  await page.screenshot({ path: join(out, 'vokabeltest-grundlage.png') })

  // ---------- Material über das Auswahlfenster (wie Themenbereiche)
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.locator('[data-rm-material]')).click()
  const fenster = page.locator('.mantine-Modal-content', { hasText: 'Material wählen' })
  await fenster.waitFor({ timeout: 10000 })
  const eintrag = fenster.locator('[data-material-wahl^="vokabeltest:"]').first()
  await eintrag.waitFor({ timeout: 10000 })
  pruefe((await eintrag.count()) === 1, 'Auswahlfenster zeigt das Material nach Fach gegliedert')
  await page.screenshot({ path: join(out, 'material-wahl.png') })
  await eintrag.click()
  const gewaehlt = await (async () => {
    const e = Date.now() + 10000
    while (Date.now() < e) {
      const g = await page.evaluate(() => window.__selftest.rmJetzt()?.grundlage ?? null)
      if (g?.art === 'vokabeltest') return g
      await page.waitForTimeout(300)
    }
    return null
  })()
  pruefe(gewaehlt?.art === 'vokabeltest', 'Ein Klick im Fenster übernimmt das Material als Grundlage')

  // ---------- Eigene Aufgabe: Datei in die Aufgabenstellung ziehen
  await page.evaluate(() => window.api.settings.set({ datenschutz: { hinweisBestaetigt: new Date().toISOString(), namenErsetzen: true } }))
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  const ablage = page.locator('.mantine-Dropzone-root', { hasText: 'Aufgabenblatt hierher ziehen' }).filter({ visible: true }).first()
  await ablage.locator('input[type=file]').setInputFiles({
    name: 'aufgabe.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Deutsch 9a – Klassenarbeit\n1. Erörtere, ob an eurer Schule eine Schuluniform eingeführt werden sollte.')
  })
  // Datenschutzhinweis vor dem Hochladen bestätigen
  const hochladen = page.getByRole('button', { name: 'Hochladen', exact: true })
  await hochladen.waitFor({ timeout: 10000 }).catch(() => undefined)
  if (await hochladen.count()) await hochladen.click()
  const ende3 = Date.now() + 20000
  let rm = null
  while (Date.now() < ende3) {
    rm = await page.evaluate(() => window.__selftest.rmJetzt())
    if (rm?.grundlage?.erwartung) break
    await page.waitForTimeout(300)
  }
  pruefe(Boolean(rm?.grundlage?.aufgaben?.startsWith('1. Erörtere')), 'Die Aufgabe steht in der Aufgabenstellung')
  pruefe(
    Boolean(rm?.grundlage?.erwartung?.startsWith('[Entwurf der KI – bitte prüfen]')),
    'Ohne Erwartungshorizont im Material: Entwurf der KI, gekennzeichnet'
  )
  pruefe(rm?.meta?.subjectId === 'deutsch' && rm?.meta?.grade === 9, 'Fach und Jahrgang aus dem Material übernommen')
  pruefe((await page.locator('[data-rm-erkannt]').filter({ visible: true }).count()) === 1, 'Hinweis „aus dem Material erkannt“ steht bei der Lerngruppe')
  const aufgabeAnfragen = anfragen().filter((z) => z.schemaName === 'rueckmeldung_aufgabe')
  pruefe(aufgabeAnfragen.length === 1 && aufgabeAnfragen[0].user.includes('Schuluniform'), 'Die Datei ging an die KI')
  pruefe((await page.getByText('Zu jeder Abgabe ein Bogen').count()) === 0, 'Der lange Einleitungstext ist weg')
  await page.screenshot({ path: join(out, 'eigene-aufgabe.png') })
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
