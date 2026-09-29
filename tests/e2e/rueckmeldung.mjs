// Wache für das Programm RÜCKMELDUNG (Großprogramm 0.4, F3) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/rueckmeldung.mjs <Ausgabeordner>
//
// Eigene Aufgabe eintragen, eine Abgabe eintippen, Namen „Lea Schmidt" am Rechner vergeben,
// „Rückmeldung schreiben": Der Bogen entsteht, die Anfrage enthält den Namen NICHT (nur S1),
// der Bogen enthält keine Punkte (die Attrappe schmuggelt einen Punktesatz ein), die Ansicht
// „Bögen & Export" zeigt „Rückmeldung für Lea Schmidt". Alles im WEGWERF-Profil.
//
// Seit 29.09.2026 nachts auch: Seitenzahl Ansicht == PDF (eine Paginierung), nichts ragt über eine
// Seite (Tabellenzeilen, Randnotizen), Bewertungsraster und Teile-Tabelle, „Weitere Abgabe".
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
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
      // Teile und Antwortsprache (29.09.2026) – startet automatisch nach der Wahl von Material in einer Fremdsprache
      rueckmeldung_teile: { teile: [] },
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
/** Zeile einer Abgabe in „Bögen & Export" (29.09.2026: auf- und zuklappbar, standardmäßig zu) */
const zeile = (kuerzel) => page.locator(`[data-rm-zeile="${kuerzel}"]`).filter({ visible: true }).first()
const aufklappen = async (kuerzel) => {
  const z = zeile(kuerzel)
  await z.waitFor({ timeout: 20000 })
  if ((await z.getAttribute('data-rm-offen')) !== 'ja') await z.locator('[data-rm-aufklappen]').click()
  await z.locator('[data-rm-blatt]').waitFor({ timeout: 10000 })
}
/** Die Attrappe während des Laufs ändern (sie wird bei jeder Anfrage neu gelesen) */
const setzeAttrappe = (aendern) => {
  const a = JSON.parse(readFileSync(attrappe, 'utf-8'))
  aendern(a)
  writeFileSync(attrappe, JSON.stringify(a))
}
/** Seiten eines PDF */
const pdfSeiten = async (pfad) => (await PDFDocument.load(readFileSync(pfad))).getPageCount()
/**
 * Was in der Ansicht über den Satzspiegel einer Seite ragt (29.09.2026 nachts): Textzeilen (ohne die
 * Notizen darin), Randnotizen, Zeilen und Punkte des Kastens, übrige Blöcke. Leer = alles auf seiner Seite.
 */
const seitenBefund = (blatt) =>
  blatt.evaluate((el) => {
    const seiten = [...el.querySelectorAll('.rm-seite')].map((s) => {
      const r = s.getBoundingClientRect()
      const mm = r.height / 297
      return { oben: r.top + 15 * mm - 1.5, unten: r.top + 282 * mm + 1.5 }
    })
    const raus = []
    const pruefe = (q, was) => {
      if (q.height > 0 && !seiten.some((s) => q.top >= s.oben && q.bottom <= s.unten)) raus.push(`${was} ${Math.round(q.top)}–${Math.round(q.bottom)}`)
    }
    for (const b of el.querySelectorAll('.blatt .bl-block')) {
      if (b.classList.contains('bl-abs')) {
        const lauf = document.createTreeWalker(b.querySelector('.bl-text'), NodeFilter.SHOW_TEXT)
        for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
          if (n.parentElement.closest('.bl-notiz, .bl-nr-t')) continue
          const range = document.createRange()
          range.selectNodeContents(n)
          for (const q of range.getClientRects()) pruefe(q, 'Textzeile')
        }
      } else pruefe(b.getBoundingClientRect(), b.className.replace(/\s+/g, '.'))
    }
    for (const n of el.querySelectorAll('.bl-notiz')) pruefe(n.getBoundingClientRect(), `Notiz ${n.getAttribute('data-notiz-nr')}`)
    for (const x of el.querySelectorAll('.bl-k tr, .bl-k li')) pruefe(x.getBoundingClientRect(), `Kasten-${x.tagName}`)
    return raus
  })
/** Seitenzahl der Ansicht (erst, wenn der Seitenplan steht) */
const ansichtSeiten = async (blatt) => {
  let alt = -1
  for (let k = 0; k < 20; k++) {
    await page.waitForTimeout(250)
    const n = Number(await blatt.getAttribute('data-rm-seiten'))
    if (n === alt) return n
    alt = n
  }
  return alt
}
/** PDF eines Bogens aus der App speichern */
const pdfSpeichern = async (z, datei) => {
  const pfad = join(out, datei)
  rmSync(pfad, { force: true })
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, pfad)
  await z.locator('[data-rm-pdf]').click()
  const ende = Date.now() + 20000
  while (Date.now() < ende && !existsSync(pfad)) await page.waitForTimeout(300)
  await page.waitForTimeout(500)
  return existsSync(pfad) ? pfad : null
}
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
  await zeile('S1').waitFor({ timeout: 10000 })
  pruefe(
    (await zeile('S1').getAttribute('data-rm-offen')) === 'nein' && (await page.locator('[data-rm-blatt]').filter({ visible: true }).count()) === 0,
    'Die Rückmeldung ist standardmäßig zugeklappt'
  )
  pruefe((await zeile('S1').getByText('Lea Schmidt').count()) > 0, 'Die Zeile zeigt den Namen')
  await aufklappen('S1')
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
  await aufklappen('S1')
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
  // Randnotiz auf der Höhe ihrer Zeile (29.09.2026 spät): Nummer der Notiz ≈ Zeile der Stelle – außer sie
  // ist unter eine Notiz derselben Zeile gerutscht (dann direkt darunter, nie überdeckt)
  const lagen = await blatt.evaluate((el) =>
    [...el.querySelectorAll('.bl-abs .bl-notiz')].map((n) => {
      const nr = n.getAttribute('data-notiz-nr')
      const sup = [...n.closest('.bl-text').querySelectorAll('sup.bl-nr-t')].find((x) => x.textContent.replace(/[^0-9]/g, '') === nr)
      const mark = sup?.previousElementSibling?.classList.contains('bl-m') ? sup.previousElementSibling : sup
      const zeilen = mark ? [...mark.getClientRects()] : []
      const z = zeilen[zeilen.length - 1]
      const nrRect = n.querySelector('.bl-nr').getBoundingClientRect()
      const r = n.getBoundingClientRect()
      return { nr, stelle: z ? (z.top + z.bottom) / 2 : null, notiz: (nrRect.top + nrRect.bottom) / 2, oben: r.top, unten: r.bottom }
    })
  )
  const zeilenTreu = lagen.every((l, i) => {
    if (l.stelle == null) return false
    const d = l.notiz - l.stelle
    if (Math.abs(d) <= 6) return true
    // gestapelt: unter der vorigen Notiz, nicht höher als die Stelle
    return d > 0 && i > 0 && l.oben >= lagen[i - 1].unten - 1 && l.oben <= lagen[i - 1].unten + 12
  })
  const ueberdeckt = lagen.some((l, i) => i > 0 && l.oben < lagen[i - 1].unten - 1)
  pruefe(
    lagen.length === 2 && zeilenTreu && !ueberdeckt,
    `Randnotizen stehen auf der Höhe ihrer Zeile, ohne sich zu überdecken (${lagen.map((l) => `${l.nr}: ${Math.round(l.notiz - (l.stelle ?? 0))} px`).join(', ')})`
  )
  // Der Kasten bleibt links der roten Randlinie
  const kastenRechts = await blatt.evaluate((el) => {
    const linie = el.querySelector('.rm-seite-linie').getBoundingClientRect().left
    return Math.max(...[...el.querySelectorAll('.bl-k, .bl-k table')].map((k) => k.getBoundingClientRect().right)) - linie
  })
  pruefe(kastenRechts <= 1, `Der Kasten „Rückmeldung für …" steht in der Textspalte, links der Randlinie (${Math.round(kastenRechts)} px)`)
  await blatt.screenshot({ path: join(out, 'blatt.png') })
  // Hell und dunkel: Das Blatt bleibt ein weißes Papier mit dunkler Schrift, die Leiste folgt dem Schema
  for (const colorScheme of ['light', 'dark']) {
    // Mantine schaltet das Schema über dieses Attribut (ohne Neuladen – der Bogen bleibt offen)
    await page.evaluate((c) => document.documentElement.setAttribute('data-mantine-color-scheme', c), colorScheme)
    await page.waitForTimeout(500)
    const farben = await blatt.evaluate((el) => {
      const seite = el.querySelector('.rm-seite') ?? el
      const text = el.querySelector('.bl-abs') ?? el
      return { grund: getComputedStyle(seite).backgroundColor, schrift: getComputedStyle(text).color }
    })
    const hell = (rgb) => (rgb.match(/\d+/g) ?? []).slice(0, 3).reduce((n, x) => n + Number(x), 0) / 3
    pruefe(hell(farben.grund) > 230 && hell(farben.schrift) < 90, `Blatt im Schema ${colorScheme}: Papier hell, Schrift dunkel (${farben.grund} / ${farben.schrift})`)
    await page.screenshot({ path: join(out, `blatt-${colorScheme}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-mantine-color-scheme', 'light'))
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
  if (existsSync(pdfPfad)) {
    const n = await ansichtSeiten(page.locator('[data-rm-blatt]').filter({ visible: true }).first())
    const p = await pdfSeiten(pdfPfad)
    pruefe(n === p, `Seitenzahl Ansicht (${n}) = PDF (${p})`)
  }
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

  // ---------- Lange Abgabe + Liste zum Auf- und Zuklappen (29.09.2026, Bericht/Wunsch der Lehrkraft)
  // Ein einziger Absatz über mehrere Seiten (samt Zeichenkette ohne Leerzeichen) ließ Seite 1 leer
  // und lief über die Seitenränder. Drei Abgaben: Suche, Aufklappen, Seitengrenzen.
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  await sichtbar(page.locator('[data-rm-aufgaben]')).fill('Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot.')
  await sichtbar(page.locator('[data-form="rand"]')).check()
  await sichtbar(page.locator('[data-einstufung="noteTendenz"]')).check()
  const satz = 'Wir brauchen das Handy für den Unterricht, weil man damit schnell etwas nachschlagen kann. '
  const langerText = `Ich finde, das Handyverbot ist falsch. ${satz.repeat(55)}${'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo'.repeat(50)} ${satz.repeat(35)}`
  const schueler = [
    ['Tom Berger', 'Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.'],
    ['Jürgen Öztürk', langerText],
    ['Mia Krause', 'Ich finde, das Handyverbot ist falsch. Im Unterricht stört das Handy aber oft.']
  ]
  for (const [k, [name, text]] of schueler.entries()) {
    await sichtbar(page.locator('[data-rm-eintippen]')).click()
    await sichtbar(page.getByLabel(`Name zu S${k + 1}`)).fill(name)
    await sichtbar(page.getByLabel(`Text von S${k + 1}`)).fill(text)
  }
  await sichtbar(page.locator('[data-rm-schreiben]')).click()
  const ende7 = Date.now() + 30000
  let drei = null
  while (Date.now() < ende7) {
    drei = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben ?? [])
    if (drei.length === 3 && drei.every((a) => a.bogen)) break
    await page.waitForTimeout(300)
  }
  pruefe(drei?.length === 3 && drei.every((a) => a.bogen), 'Drei Bögen sind entstanden')
  await zeile('S3').waitFor({ timeout: 10000 })
  const zeilen = page.locator('[data-rm-zeile]').filter({ visible: true })
  pruefe(
    (await zeilen.count()) === 3 && (await page.locator('[data-rm-offen="ja"]').filter({ visible: true }).count()) === 0,
    'Alle drei Rückmeldungen stehen zugeklappt in der Liste'
  )
  pruefe((await page.locator('[data-rm-blatt]').filter({ visible: true }).count()) === 0, 'Zugeklappt wird kein Blatt gezeichnet')
  pruefe((await zeile('S2').locator('[data-rm-status="offen"]').count()) === 1, 'Die Zeile zeigt den Status „Einstufung offen“')
  await page.screenshot({ path: join(out, 'liste-zu.png') })
  // Suche: Umlaute tolerant, genau ein Treffer klappt auf
  await sichtbar(page.locator('[data-rm-suche]')).fill('oeztuerk')
  await page.waitForTimeout(400)
  pruefe((await zeilen.count()) === 1 && (await zeile('S2').count()) === 1, 'Die Suche „oeztuerk“ findet „Jürgen Öztürk“ – und nur ihn')
  await zeile('S2')
    .locator('[data-rm-blatt]')
    .waitFor({ timeout: 10000 })
    .catch(() => undefined)
  pruefe((await zeile('S2').getAttribute('data-rm-offen')) === 'ja', 'Bei genau einem Treffer klappt die Rückmeldung auf')
  await page.waitForTimeout(800)
  // Die lange Abgabe: Schülertext auf Seite 1, nichts ragt über eine Seitengrenze, nichts in die Korrekturspalte
  const lang = zeile('S2').locator('[data-rm-blatt]')
  const befund = await lang.evaluate((el) => {
    const seiten = [...el.querySelectorAll('.rm-seite')].map((s) => s.getBoundingClientRect())
    const bloecke = [...el.querySelectorAll('.blatt .bl-block')].map((b) => ({ k: b.className, r: b.getBoundingClientRect() }))
    const inSeite = (r) => seiten.some((s) => r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.left >= s.left - 1 && r.right <= s.right + 1)
    // Absätze: die Textzeilen zählen (der Rahmen eines Absatzes umschließt auch nach oben gerückte Randnotizen)
    const draussen = bloecke.filter((b) => b.r.height > 0 && !/bl-abs/.test(b.k) && !inSeite(b.r)).map((b) => `${b.k} ${Math.round(b.r.top)}–${Math.round(b.r.bottom)}`)
    const texte = [...el.querySelectorAll('.bl-abs')]
    const erstesAbs = texte[0]?.getBoundingClientRect()
    // Schülertext (ohne die Notizen, die als Float in den Rand ragen) endet links der roten Randlinie
    const linie = el.querySelector('.rm-seite-linie').getBoundingClientRect().left
    const breit = texte.filter((a) =>
      [...a.querySelector('.bl-text').childNodes]
        .filter((k) => !(k instanceof Element && k.classList.contains('bl-notiz')))
        .some((k) => {
          const range = document.createRange()
          range.selectNode(k)
          return [...range.getClientRects()].some((q) => q.width > 0 && q.right > linie + 1)
        })
    ).length
    return {
      seiten: seiten.length,
      draussen,
      erste: erstesAbs ? erstesAbs.top < seiten[0].bottom && erstesAbs.bottom <= seiten[0].bottom + 1 : false,
      absaetze: texte.length,
      breit
    }
  })
  pruefe(befund.seiten >= 3 && befund.absaetze >= befund.seiten - 1, `Die lange Abgabe steht auf mehreren Seiten, an den Seitenenden geteilt (${befund.seiten} Seiten, ${befund.absaetze} Teile)`)
  pruefe(befund.erste, 'Seite 1 enthält Schülertext direkt unter dem Kopf (keine leere erste Seite)')
  pruefe(befund.draussen.length === 0, `Kein Block ragt über eine Seitengrenze${befund.draussen.length ? ` (${befund.draussen.join(', ')})` : ''}`)
  const draussenLang = await seitenBefund(lang)
  pruefe(draussenLang.length === 0, `Keine Textzeile und keine Randnotiz ragt über den Satzspiegel${draussenLang.length ? ` (${draussenLang.slice(0, 6).join(', ')})` : ''}`)
  pruefe(befund.breit === 0, 'Lange Zeichenketten brechen um – nichts läuft in die Korrekturspalte')
  // Bilder der Ansicht: Seite 1 und die Übergänge Seite 1/2 und 2/3 (das Blatt liegt in einer Rollfläche)
  for (const [k, datei] of [
    [0, 'lange-abgabe-seite1.png'],
    [1, 'lange-abgabe-seite2.png'],
    [2, 'lange-abgabe-seite3.png']
  ]) {
    await lang.evaluate((el, k) => el.querySelectorAll('.rm-seite')[k]?.scrollIntoView({ block: k ? 'center' : 'start' }), k)
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(out, datei) })
  }
  // PDF der langen Abgabe aus der App (nach Bestätigung der Einstufung)
  await zeile('S2').locator('[data-rm-bestaetigen]').click()
  await page.waitForTimeout(300)
  const langPdf = join(out, 'lange-abgabe.pdf')
  rmSync(langPdf, { force: true })
  await app.evaluate(({ dialog }, pfad) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: pfad })
  }, langPdf)
  await zeile('S2').locator('[data-rm-pdf]').click()
  const ende8 = Date.now() + 20000
  while (Date.now() < ende8 && !existsSync(langPdf)) await page.waitForTimeout(300)
  pruefe(existsSync(langPdf), 'Das PDF der langen Abgabe entsteht')
  // Suche leeren: alle drei wieder da; alle auf- und zuklappen
  await sichtbar(page.locator('[data-rm-suche]')).fill('')
  await page.waitForTimeout(300)
  pruefe((await zeilen.count()) === 3, 'Ohne Suche stehen wieder alle drei Zeilen da')
  await sichtbar(page.locator('[data-rm-alle-auf]')).click()
  await page.waitForTimeout(800)
  pruefe((await page.locator('[data-rm-blatt]').filter({ visible: true }).count()) === 3, '„Alle aufklappen“ zeigt alle drei Blätter')
  await sichtbar(page.locator('[data-rm-alle-zu]')).click()
  await page.waitForTimeout(300)
  pruefe((await page.locator('[data-rm-blatt]').filter({ visible: true }).count()) === 0, '„Alle zuklappen“ klappt alle zu')
  await zeile('S3').locator('[data-rm-aufklappen]').click()
  await zeile('S3').locator('[data-rm-blatt]').waitFor({ timeout: 10000 })
  pruefe((await zeile('S3').getByText('Rückmeldung für Mia Krause').count()) > 0, 'Aufklappen einer Zeile zeigt ihr Blatt mit Leiste')
  await page.screenshot({ path: join(out, 'liste-auf.png') })

  // ---------- „Weitere Abgabe" (29.09.2026 nachts, Wunsch der Lehrkraft): Fenster in „Bögen & Export",
  // Datei hineinziehen, auswerten – die neue Zeile erscheint aufgeklappt mit Lader, dann mit Bogen
  setzeAttrappe((x) => (x.verzoegerungMs = 2500))
  await sichtbar(page.locator('[data-rm-weitere-knopf]')).click()
  const fensterW = page.locator('.mantine-Modal-content', { hasText: 'Weitere Abgabe auswerten' })
  await fensterW.waitFor({ timeout: 5000 })
  await fensterW.getByLabel('Name', { exact: false }).first().fill('Nora Lange')
  await fensterW.locator('input[type=file]').setInputFiles({
    name: 'nora.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot.\nIch finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.')
  })
  const hochladen2 = page.getByRole('button', { name: 'Hochladen', exact: true })
  await hochladen2.waitFor({ timeout: 4000 }).catch(() => undefined)
  if (await hochladen2.count()) await hochladen2.click()
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((t) => t.value.includes('Handyverbot ist falsch')), null, { timeout: 10000 }).catch(() => undefined)
  pruefe((await fensterW.locator('textarea').first().inputValue().catch(() => '')).includes('Handyverbot ist falsch'), 'Weitere Abgabe: die hineingezogene Datei ist gelesen')
  await page.screenshot({ path: join(out, 'weitere-abgabe.png') })
  const anfragenVorher = anfragen().filter((z) => z.schemaName === 'rueckmeldung_bogen').length
  await fensterW.getByRole('button', { name: 'Auswerten' }).click()
  await fensterW.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)
  const z4 = zeile('S4')
  await z4.waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  pruefe(
    (await z4.getAttribute('data-rm-offen')) === 'ja' && (await z4.locator('[data-rm-wartet] .mantine-Loader-root').count()) === 1,
    'Die neue Abgabe steht aufgeklappt in der Liste – mit Lader, bis der Bogen da ist'
  )
  await page.screenshot({ path: join(out, 'weitere-abgabe-lader.png') })
  const ende9 = Date.now() + 25000
  let s4 = null
  while (Date.now() < ende9) {
    s4 = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.find((a) => a.kuerzel === 'S4') ?? null)
    if (s4?.bogen) break
    await page.waitForTimeout(300)
  }
  setzeAttrappe((x) => (x.verzoegerungMs = 200))
  pruefe(Boolean(s4?.bogen), 'Der Bogen der weiteren Abgabe entsteht')
  pruefe(s4?.name === 'Nora Lange' && !/Schreibe einen Leserbrief/.test(s4?.text ?? '') && /Handyverbot ist falsch/.test(s4?.text ?? ''), `Name lokal, Aufgabentext abgetrennt („${(s4?.text ?? '').slice(0, 60)}")`)
  const neueAnfragen = anfragen().filter((z) => z.schemaName === 'rueckmeldung_bogen').slice(anfragenVorher)
  pruefe(neueAnfragen.length === 1 && neueAnfragen[0].user.includes('S4') && !/Nora|Lange/.test(neueAnfragen[0].user), 'Ausgewertet wird nur die neue Abgabe – die KI kennt nur das Kürzel')
  await z4.locator('[data-rm-blatt]').waitFor({ timeout: 10000 })
  pruefe((await z4.getByText('Rückmeldung für Nora Lange').count()) > 0, 'Die weitere Abgabe erscheint wie die anderen: mit Leiste und Blatt')
  await page.screenshot({ path: join(out, 'weitere-abgabe-fertig.png') })

  // Seitenzahl Ansicht == PDF für die lange Abgabe (EINE Paginierung)
  await sichtbar(page.locator('[data-rm-alle-zu]')).click()
  await zeile('S2').locator('[data-rm-aufklappen]').click()
  const langBlatt = zeile('S2').locator('[data-rm-blatt]')
  await langBlatt.waitFor({ timeout: 10000 })
  const seitenLang = await ansichtSeiten(langBlatt)
  const langPdf2 = await pdfSpeichern(zeile('S2'), 'lange-abgabe-2.pdf')
  const pdfLang = langPdf2 ? await pdfSeiten(langPdf2) : -1
  pruefe(seitenLang >= 3 && seitenLang === pdfLang, `Lange Abgabe: Seitenzahl Ansicht (${seitenLang}) = PDF (${pdfLang})`)

  // ---------- Englisch mit Bewertungsraster, Teilen und hohen Randnotizen (29.09.2026 nachts, PDF der Lehrkraft)
  await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
  await page.waitForTimeout(800)
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  await sichtbar(page.getByLabel('Titel der Aufgabe')).fill('Exam no. 4')
  await sichtbar(page.locator('[data-rm-aufgaben]')).fill('Write an e-mail to the student coordinator about the film review (about 200 words).')
  const fachFeld = sichtbar(page.getByLabel('Fach', { exact: true }))
  await fachFeld.click()
  await fachFeld.fill('Englisch')
  await page.getByRole('option', { name: 'Englisch', exact: true }).first().click()
  await page.waitForTimeout(300)
  await sichtbar(page.locator('[data-form="rand"]')).check()
  await sichtbar(page.locator('[data-form="tabelle"]')).check()
  await sichtbar(page.locator('[data-einstufung="noteTendenz"]')).check()
  await sichtbar(page.locator('[data-teile]').getByRole('button', { name: 'Teil', exact: true })).click()
  setzeAttrappe((x) => {
    x.antworten.rueckmeldung_tabelle = {
      titel: 'Bewertungsraster Mediation',
      stufen: [],
      kriterien: [
        ['Inhalt', 'Gewaltinszenierung: Wählt relevante Aussagen der Rezension aus und erläutert Kurzels exzessive, ästhetisierte Gewaltdarstellung, insbesondere die öffentliche Verbrennung von Macduffs Familie als Abschreckung und Tabubruch sowie Macbeths Deutung als moderner Tyrann bzw. Terrorist.', 10],
        ['Inhalt', 'Neuinterpretation Lady Macbeths: Stellt nachvollziehbar dar, dass Lady Macbeth als zerbrechliche Außenseiterin und zunehmend als Opfer ihres Mannes erscheint; erläutert ihre Abwendung von Macbeth.', 10],
        ['Inhalt', 'Abwägung von Stärken und Schwächen: Arbeitet positive Aspekte wie eindrucksvolle Bildkompositionen und negative Aspekte wie fehlende Kohärenz heraus und gewichtet sie.', 10],
        ['Inhalt', 'Begründete Empfehlung: Beantwortet eindeutig, ob der Film für den Macbeth-Abend geeignet ist, und stützt das Urteil schlüssig auf zuvor erläuterte Befunde der Rezension.', 10],
        ['Darstellung/Sprache', 'Kommunikative Textgestaltung: Verfasst eine adressatengerechte englische E-Mail mit passender Anrede und Schlussformel, klarem Anlass, sinnvoller Gliederung und angemessener Orientierung an ca. 200 Wörtern.', 20],
        ['Darstellung/Sprache', 'Ausdrucksvermögen: Verwendet ein differenziertes, präzises und situationsangemessenes englisches Vokabular; formuliert eigenständig, idiomatisch und variabel.', 20],
        ['Darstellung/Sprache', 'Sprachrichtigkeit: Beherrscht Grammatik, Satzbau, Wortformen, Rechtschreibung und Zeichensetzung so sicher, dass die Aussagen durchgehend klar verständlich sind.', 20]
      ].map(([bereich, kriterium, punkte]) => ({ bereich, kriterium, punkte, deskriptoren: [] }))
    }
  })
  await sichtbar(page.locator('[data-rm-tabelle-ki]')).click()
  const ende10 = Date.now() + 15000
  let tab = null
  while (Date.now() < ende10) {
    tab = await page.evaluate(() => window.__selftest.rmJetzt()?.tabelle ?? null)
    if (tab?.kriterien?.length === 7) break
    await page.waitForTimeout(300)
  }
  pruefe(tab?.kriterien?.length === 7, 'Die Bewertungstabelle ist da (7 Kriterien)')
  // Ein langer Brief mit vielen, teils hohen Randnotizen – manche stehen zwangsläufig am Seitenende
  const saetze = Array.from({ length: 64 }, (_, i) => `In point ${i + 1} the reviewer describes how the staging of the film turned out and why it matters.`)
  const englisch = ['Hi Eddie,', saetze.slice(0, 30).join(' '), saetze.slice(30).join(' '), 'Best, Frank'].join('\n')
  // Ohne Wörter wie „Note“ oder „Punkte“ – solche Aussagen entfernt die App aus dem Bogen
  const langeNotiz = 'Bezug unpräzise; besser: „Kurzel’s staging of the film“. Außerdem fehlt die Begründung aus der Rezension: welche Stärken die Inszenierung hat, welche Schwächen genannt werden und warum der Film für den Abend taugt.'
  setzeAttrappe((x) => {
    x.antworten.rueckmeldung_bogen = {
      staerken: ['S1 verwendet eine passende Anrede und Schlussformel.', 'S1 schreibt in kurzen, verständlichen Sätzen.'],
      schritte: ['Relevante Informationen der Rezension auf Englisch vermitteln.', 'Die Empfehlung ausdrücklich begründen.'],
      kriterien: [{ kriterium: 'Kommunikative Textgestaltung', einschaetzung: 'teilweise', beleg: 'Hi Eddie,' }],
      schluss: 'Der E-Mail-Rahmen steht – jetzt die Befunde der Quelle erklären.',
      teile: [{ id: 't1', inhalt: 40, sprache: 60, anteil: 0, begruendung: 'Inhalt lückenhaft, Sprache weitgehend korrekt.' }],
      tabelle: tab.kriterien.map((k, i) => ({ id: k.id, punkte: [0, 0, 0, 1, 5, 5, 18][i], stufe: 0, begruendung: 'Kurze Begründung mit Bezug auf die Arbeit.' })),
      rand: [
        { zitat: 'Hi Eddie,', text: 'Passende direkte Anrede für eine E-Mail.', zeichen: '', art: 'lob' },
        ...Array.from({ length: 16 }, (_, k) => ({ zitat: `point ${4 * k + 3} the reviewer`, text: k % 3 === 0 ? `W: ${langeNotiz}` : 'Bezug unpräzise; besser: „Kurzel’s staging of the film“.', zeichen: 'W', art: 'fehler' })),
        // Hohe Notizen in den letzten Zeilen einer Seite (Bericht der Lehrkraft: rutschten im PDF auf die nächste Seite)
        ...[21, 44].map((n) => ({ zitat: `point ${n} the reviewer`, text: langeNotiz, zeichen: 'A', art: 'hinweis' }))
      ],
      fehler: [{ kategorie: 'Wortwahl', beispiel: 'the staging shown here' }]
    }
  })
  await sichtbar(page.locator('[data-rm-eintippen]')).click()
  await sichtbar(page.getByLabel('Name zu S1')).fill('Kim Weber')
  await sichtbar(page.getByLabel('Text von S1')).fill(englisch)
  await sichtbar(page.locator('[data-rm-schreiben]')).click()
  const ende11 = Date.now() + 25000
  let bogenE = null
  while (Date.now() < ende11) {
    bogenE = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen ?? null)
    if (bogenE) break
    await page.waitForTimeout(300)
  }
  pruefe(Boolean(bogenE?.tabelle?.length) && Boolean(bogenE?.teile?.length), 'Englisch: Bogen mit Bewertungstabelle und Teilen')
  await aufklappen('S1')
  await zeile('S1').locator('[data-rm-bestaetigen]').click()
  const blattE = zeile('S1').locator('[data-rm-blatt]')
  const seitenE = await ansichtSeiten(blattE)
  pruefe((await blattE.locator('[data-rm-abschnitt="kriterien"]').count()) === 0, 'Mit Bewertungstabelle kein zweites „Worauf es ankam“')
  pruefe(!(await blattE.innerText()).includes('W: W:'), 'Randnotiz: das Korrekturzeichen steht nur einmal (kein „W: W:“)')
  const raster = await blattE.evaluate((el) => {
    const teile = [...el.querySelectorAll('table.bl-raster')]
    return { teile: teile.length, mitKopf: teile.filter((t) => t.querySelector('thead th')?.textContent === 'Kriterium').length, bereiche: el.querySelectorAll('.bl-raster tr.bereich').length, fett: el.querySelector('.bl-raster .kn')?.textContent ?? '' }
  })
  pruefe(raster.teile >= 1 && raster.mitKopf === raster.teile && raster.bereiche === 2 && raster.fett === 'Gewaltinszenierung', `Raster: Kopfzeile auf jeder Seite (${raster.teile} Teil/e), 2 Bereichszeilen, Kriterium kurz und fett`)
  const teilKopf = await blattE.locator('.bl-teiltab thead').innerText()
  const teilErgebnis = await blattE.locator('[data-rm-teil-ergebnis]').first().innerText()
  pruefe(/Inhalt erreicht\s*Gewicht 40 %/.test(teilKopf) && /Sprache erreicht\s*Gewicht 60 %/.test(teilKopf) && teilErgebnis.trim() === '52 %', `Teile als Tabelle: erreicht getrennt vom Gewicht, Ergebnis ${teilErgebnis.trim()}`)
  await blattE.locator('[data-rm-teil-ergebnis]').first().hover()
  await page.getByText('Inhalt 40 % × 0,4 + Sprache 60 % × 0,6 = 52 %').first().waitFor({ timeout: 3000 }).catch(() => undefined)
  pruefe((await page.getByText('Inhalt 40 % × 0,4 + Sprache 60 % × 0,6 = 52 %').count()) > 0, 'Die Rechnung steht als Erläuterung am Ergebnis (nur in der Ansicht)')
  await page.screenshot({ path: join(out, 'teile-erlaeuterung.png') })
  const draussenE = await seitenBefund(blattE)
  pruefe(draussenE.length === 0, `Englisch: nichts ragt über eine Seite – keine Tabellenzeile, keine Randnotiz${draussenE.length ? ` (${draussenE.slice(0, 6).join(', ')})` : ''}`)
  const verschoben = await blattE.evaluate((el) => [...el.querySelectorAll('.bl-notiz')].filter((n) => getComputedStyle(n).transform !== 'none').length)
  const pdfE = await pdfSpeichern(zeile('S1'), 'englisch-raster.pdf')
  const pdfSeitenE = pdfE ? await pdfSeiten(pdfE) : -1
  pruefe(seitenE >= 2 && seitenE === pdfSeitenE, `Englisch: Seitenzahl Ansicht (${seitenE}) = PDF (${pdfSeitenE})`)
  pruefe(verschoben >= 1, `Hohe Randnotizen am Seitenende weichen nach oben aus, statt auf die nächste Seite zu rutschen (${verschoben} verschoben)`)
  for (let k = 0; k < seitenE; k++) {
    await blattE.evaluate((el, k) => el.querySelectorAll('.rm-seite')[k]?.scrollIntoView({ block: 'start' }), k)
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(out, `englisch-seite${k + 1}.png`) })
  }
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
