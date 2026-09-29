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
        schluss: 'Weiter so – mit Beispielen wird dein Brief überzeugender.',
        // Rückmeldung 2.0 (29.09.2026): Einstufung als Vorschlag, Korrekturrand, Fehlerschwerpunkte
        gesamt: { anteil: 80, begruendung: 'Klare These, Belege fehlen.' },
        rand: [
          { zitat: 'das Handyverbot ist falsch', text: 'Klare These', zeichen: '', art: 'lob' },
          { zitat: 'Unterricht', text: 'Beispiel ergänzen', zeichen: 'Inh', art: 'hinweis' }
        ],
        fehler: [{ kategorie: 'Belege fehlen', beispiel: 'Wir brauchen das Handy' }]
      },
      // Eigene Aufgabe aus einer Datei (29.09.2026)
      rueckmeldung_aufgabe: {
        titel: 'Erörterung Schuluniform',
        aufgaben: '1. Erörtere, ob an eurer Schule eine Schuluniform eingeführt werden sollte.\nMaterial: Zeitungsartikel „Einheitlich gekleidet?“ (Auszug)',
        erwartung: '',
        fach: 'deutsch',
        jahrgang: 9,
        erkennbar: ['Kopfzeile: Deutsch 9a'],
        // Teile der Arbeit (29.09.2026) – Pflichtfeld des Schemas, sonst fragt die App ein zweites Mal
        teile: [{ titel: 'Erörterung', art: 'sonstig', gewichtProzent: 0, punkte: 0, inhaltProzent: 0, ergebnisSprache: '' }]
      },
      rueckmeldung_erwartung: { erwartung: '- Einleitung mit Hinführung\n- Pro- und Kontra-Argumente mit Beispielen\n- eigenes Urteil' },
      // Zauberstab am A4-Blatt (29.09.2026): eine Stelle neu – nur sie wird ersetzt
      rueckmeldung_stelle: { schluss: 'Neuer Schlusssatz vom Zauberstab.' }
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
  await page.getByText('Rückmeldung für Lea Schmidt').first().waitFor({ timeout: 10000 })
  pruefe(true, 'Die Ansicht zeigt den Namen – eingesetzt am Rechner')
  await page.screenshot({ path: join(out, 'boegen.png') })

  // ---------- Rückmeldung 2.0 (29.09.2026): Formen, Einstufung, Nachteilsausgleich, Gedächtnis
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  await sichtbar(page.locator('[data-rm-aufgaben]')).fill('Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot.')
  await sichtbar(page.locator('[data-form="rand"]')).check()
  await sichtbar(page.locator('[data-einstufung="noteTendenz"]')).check()
  pruefe((await page.getByText('Rückmeldung mit Einstufung', { exact: true }).count()) === 1, 'Mit Einstufung heißt der Schritt „Rückmeldung mit Einstufung"')
  pruefe((await page.locator('[data-einstufung="notenpunkte"]').filter({ visible: true }).isDisabled()), 'Notenpunkte sind in Klasse 7 gesperrt (nur Oberstufe)')
  pruefe((await page.locator('[data-rm-landeshinweis]').filter({ visible: true }).count()) > 0, 'Hinweise des Landes mit Fundstelle stehen bei der Einstufung')
  await page.locator('[data-rm-art]').filter({ visible: true }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, 'art-der-rueckmeldung.png') })
  await sichtbar(page.locator('[data-rm-eintippen]')).click()
  await sichtbar(page.getByLabel('Name zu S1')).fill('Lea Schmidt')
  await sichtbar(page.getByLabel('Text von S1')).fill('Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.')
  await sichtbar(page.locator('[data-rm-ausgleich-knopf]')).click()
  const na = page.locator('[data-rm-ausgleich]').filter({ visible: true })
  await sichtbar(page.locator('[data-massnahme="ns-rechtschreibung"]')).check()
  await sichtbar(page.locator('[data-rm-ausgleich-eigene]')).fill('wegen Legasthenie laut Gutachten')
  pruefe((await page.getByText('Gesundheitsangaben gehen nicht an die KI', { exact: false }).count()) > 0, 'Das Fenster warnt vor Diagnosewörtern')
  await page.screenshot({ path: join(out, 'nachteilsausgleich.png') })
  await sichtbar(page.locator('[data-rm-ausgleich-ok]')).click()
  await na.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)
  const na1 = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.ausgleich ?? null)
  pruefe(Boolean(na1?.massnahmen?.includes('ns-rechtschreibung')), 'Der Nachteilsausgleich hängt an der Abgabe')
  await page.screenshot({ path: join(out, 'einrichten-2.png') })
  await sichtbar(page.locator('[data-rm-schreiben]')).click()
  const ende4 = Date.now() + 20000
  let bogen2 = null
  while (Date.now() < ende4) {
    bogen2 = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen ?? null)
    if (bogen2) break
    await page.waitForTimeout(300)
  }
  pruefe(Boolean(bogen2?.gesamt?.wert) && !bogen2?.gesamt?.bestaetigt, 'Die Einstufung ist ein unbestätigter Vorschlag')
  pruefe(bogen2?.rand?.length === 2, 'Der Korrekturrand ist entstanden')
  const b2 = anfragen().filter((z) => z.schemaName === 'rueckmeldung_bogen').pop()
  pruefe(Boolean(b2) && /NOTENSCHUTZ/.test(b2.user) && !/Legasthenie|Gutachten/.test(b2.user), 'Der Nachteilsausgleich geht als Maßnahme an die KI – ohne Diagnose')
  pruefe(Boolean(b2) && /Lehrkraft vergibt die Einstufung/.test(b2.user), 'Die KI schlägt nur vor')
  await page.locator('[data-rm-rand]').filter({ visible: true }).first().waitFor({ timeout: 10000 })
  pruefe(true, 'Der Korrekturrand steht im Bogen')
  // ---------- A4-Blatt (29.09.2026): Schülertext oben mit Randnotizen, Kasten darunter
  const blatt = page.locator('[data-rm-blatt]').filter({ visible: true }).first()
  await blatt.waitFor({ timeout: 10000 })
  pruefe((await blatt.locator('.bl-notiz').count()) === 2, 'Zwei Randnotizen stehen am Rand des Blatts')
  pruefe((await blatt.locator('.bl-m.lob').count()) === 1 && (await blatt.locator('.bl-notiz.lob .bl-haken').count()) === 1, 'Lob grün angestrichen, Häkchen am Rand')
  pruefe((await blatt.getByText('Rückmeldung für Lea Schmidt').count()) === 1, 'Der Kasten „Rückmeldung für …" steht unter dem Text')
  const reihenfolge = await blatt.evaluate((el) => {
    const y = (s) => el.querySelector(s)?.getBoundingClientRect().top ?? -1
    return [y('.bl-kopf'), y('.bl-abs'), y('.bl-k.erst')]
  })
  pruefe(reihenfolge[0] >= 0 && reihenfolge[0] < reihenfolge[1] && reihenfolge[1] < reihenfolge[2], 'Kopf, dann Schülertext, dann Feedback')
  const hand = await blatt.locator('.bl-notiz').first().evaluate((el) => getComputedStyle(el).fontFamily)
  pruefe(/Ink Free|Segoe Print|Comic Sans/.test(hand), `Randnotizen in Handschrift-Anmutung (${hand})`)
  await blatt.screenshot({ path: join(out, 'blatt.png') })
  // Direkt auf dem Blatt bearbeiten: Klick in eine Stärke, tippen
  const staerke = blatt.locator('.bl-staerken [data-rm-edit]').first()
  await staerke.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Prima.')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  const st = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen?.staerken?.[0] ?? '')
  pruefe(st.endsWith('Prima.') && !/Lea/.test(st), `Stärke direkt auf dem Blatt geändert – gespeichert mit Kürzel („${st}")`)
  // Text markieren → Notiz
  await blatt.locator('.bl-text[data-absatz="0"]').evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      const i = n.textContent.indexOf('brauchen')
      if (i >= 0) {
        const range = document.createRange()
        range.setStart(n, i)
        range.setEnd(n, i + 'brauchen'.length)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        break
      }
    }
    el.closest('section').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.locator('[data-rm-auswahl]').waitFor({ timeout: 5000 })
  await page.locator('[data-rm-notiz-neu="fehler"]').click()
  await page.waitForTimeout(200)
  await page.keyboard.type('Wortwahl prüfen')
  await page.waitForTimeout(300)
  const rand3 = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen?.rand ?? [])
  pruefe(rand3.length === 3 && rand3.some((k) => k.zitat === 'brauchen' && k.text === 'Wortwahl prüfen'), 'Markierte Stelle wird zur Randnotiz')
  pruefe((await blatt.locator('.bl-notiz').count()) === 3, 'Die neue Notiz steht am Rand')
  // Export-Sperre: PDF mit unbestätigter Einstufung → Fenster
  await sichtbar(page.locator('[data-rm-pdf]')).click()
  const sperre = page.locator('[data-rm-sperre-weiter]').filter({ visible: true })
  await sperre.waitFor({ timeout: 5000 }).catch(() => undefined)
  pruefe((await sperre.count()) === 1, 'Vor dem PDF erscheint die Sperre mit der offenen Einstufung')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, 'export-sperre.png') })
  await page.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(300)
  await sichtbar(page.locator('[data-rm-bestaetigen]')).click()
  await page.waitForTimeout(300)
  const best = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen?.gesamt?.bestaetigt ?? false)
  pruefe(best === true, 'Die Lehrkraft bestätigt die Einstufung')
  await page.screenshot({ path: join(out, 'boegen-2.png') })
  // Zauberstab: nur der Schlusssatz wird ersetzt
  const vorher = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen)
  await sichtbar(page.locator('[data-rm-stab="schluss"]')).click()
  await sichtbar(page.locator('[data-rm-stab-modus="ueberarbeiten"]')).click()
  const ende5 = Date.now() + 15000
  let nachher = null
  while (Date.now() < ende5) {
    nachher = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen)
    if (nachher?.schluss === 'Neuer Schlusssatz vom Zauberstab.') break
    await page.waitForTimeout(300)
  }
  pruefe(nachher?.schluss === 'Neuer Schlusssatz vom Zauberstab.', 'Zauberstab ersetzt den Schlusssatz')
  pruefe(JSON.stringify(nachher?.staerken) === JSON.stringify(vorher?.staerken) && nachher?.rand?.length === vorher?.rand?.length, 'Der Rest des Bogens bleibt')
  const stelleAnfrage = anfragen().filter((z) => z.schemaName === 'rueckmeldung_stelle').pop()
  pruefe(Boolean(stelleAnfrage) && !/Lea|Schmidt/.test(stelleAnfrage.user) && /BISHERIGE FASSUNG/.test(stelleAnfrage.user), 'Die Anfrage des Zauberstabs kennt nur Kürzel')
  // PDF ohne Sperre (bestätigt) – Datei entsteht
  const pdfPfad = join(out, 'blatt-app.pdf')
  rmSync(pdfPfad, { force: true })
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: pfad })
  }, pdfPfad)
  await sichtbar(page.locator('[data-rm-pdf]')).click()
  const ende6 = Date.now() + 20000
  while (Date.now() < ende6 && !existsSync(pdfPfad)) await page.waitForTimeout(300)
  pruefe(existsSync(pdfPfad), 'Nach der Bestätigung entsteht das PDF ohne Rückfrage')
  await page.locator('[data-rm-blatt]').filter({ visible: true }).first().screenshot({ path: join(out, 'blatt-2.png') })
  await sichtbar(page.locator('[data-rm-ansicht]').getByText('Lerngruppe')).click()
  await page.locator('[data-rm-uebersicht]').filter({ visible: true }).first().waitFor({ timeout: 5000 })
  pruefe((await page.getByText('Belege fehlen', { exact: false }).filter({ visible: true }).count()) > 0, 'Das Fehlerprofil zeigt den Schwerpunkt')
  await page.screenshot({ path: join(out, 'lerngruppe.png') })
  // Gedächtnis: gleicher Name in einer neuen Rückmeldung
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.locator('[data-rm-eintippen]')).click()
  await sichtbar(page.getByLabel('Name zu S1')).fill('lea schmidt')
  await page.locator('[data-rm-ausgleich-uebernehmen]').filter({ visible: true }).first().waitFor({ timeout: 5000 }).catch(() => undefined)
  pruefe((await page.locator('[data-rm-ausgleich-uebernehmen]').filter({ visible: true }).count()) === 1, 'Der gemerkte Nachteilsausgleich wird für denselben Namen vorgeschlagen')

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
  pruefe(aufgabeAnfragen.length === 1 && aufgabeAnfragen[0].user.includes('Schuluniform'), `Die Datei ging an die KI (${aufgabeAnfragen.length} Anfrage[n]: ${aufgabeAnfragen.map((a) => JSON.stringify(a.user.slice(-50))).join(' | ')})`)
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
