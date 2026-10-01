// Wache für das TEXTAUSWAHL-MENÜ der Materialtexte – mit KI-Attrappe (vorher: npm run build).
// Aufruf: node tests/e2e/textauswahl.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (01.10.2026): Wort/Passage im Material markieren, Rechtsklick → Kreismenü
// mit „In Fußnote erklären", „Aufgabe dazu erzeugen", „Auslassen […]" … Geprüft wird:
//  1. Arbeitsblatt: Wort in M1 markieren → Rechtsklick → Kreismenü sichtbar
//  2. „In Fußnote erklären": hochgestellte Ziffer am Wort, Erklärung mit derselben Ziffer unter dem Material; Strg+Z
//  3. „Aufgabe dazu erzeugen": neue Aufgabe mit eingebautem Zitat „…“ und Zeilenangabe, Erwartungshorizont
//  4. „Auslassen […]": […] im Text, Quelle „(gekürzt)"
//  5. Umschalt + Rechtsklick: kein Kreismenü (Menü des Systems bleibt erreichbar)
//  6. Klassenarbeit: dasselbe Menü am Material
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/textauswahl')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-textauswahl-'))
const attrappe = join(userData, 'ki-attrappe.json')
const protokoll = join(userData, 'ki-protokoll.jsonl')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 400,
    protokoll,
    antworten: {
      textauswahl_fussnote: { wort: 'Versammlung', erklaerung: 'Treffen der gewählten Abgeordneten' },
      textauswahl_aufgabe: {
        operator: 'erläutern',
        rahmen: 'inwiefern die Abgeordneten laut Bericht {ZITAT} verlangten',
        erwartung: '- Forderung nach Begründung\n- Misstrauen gegenüber dem Beschluss',
        afb: 'II',
        punkte: 6
      }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
const fehler = []
page.on('pageerror', (e) => fehler.push(e.message))
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)

  /** Ein Wort bzw. eine Passage in einem Absatz des sichtbaren Blattes markieren; liefert die Mitte der Markierung */
  const markiere = (absatz, text, wurzel = '.module-container:not([hidden])') =>
    page.evaluate(
      ({ absatz, text, wurzel }) => {
        const el = [...document.querySelectorAll(`${wurzel} .ws-editor-pages .ws-paragraph[data-absatz="${absatz}"]`)].find(
          (e) => e.getBoundingClientRect().height > 0
        )
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const gang = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n = gang.nextNode(); n; n = gang.nextNode()) {
          const i = n.data.indexOf(text)
          if (i < 0) continue
          const r = document.createRange()
          r.setStart(n, i)
          r.setEnd(n, i + text.length)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(r)
          // Mitte des ersten Stücks der Markierung – sicher IN der Markierung (ein Rechtsklick daneben hebt sie auf)
          const b = r.getClientRects()[0]
          return { x: b.left + Math.min(b.width / 2, 20), y: b.top + b.height / 2 }
        }
        return null
      },
      { absatz, text, wurzel }
    )
  // Der Kreis selbst hat keine Fläche – sichtbar sind seine Einträge
  const menue = page.locator('[data-textmenue] [data-textaktion]').first()
  const textBlock = () => page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'text'))
  const bis = async (fn, arg, ms = 15000) => {
    const ende = Date.now() + ms
    while (Date.now() < ende) {
      if (await page.evaluate(fn, arg)) return true
      await page.waitForTimeout(250)
    }
    return false
  }

  // ---------- 1. Arbeitsblatt: Markieren + Rechtsklick
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(3))
  await page.waitForTimeout(2500)
  let p = await markiere(0, 'Versammlung')
  pruefe(Boolean(p), 'Wort „Versammlung" in M1 markiert')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.waitForTimeout(500)
  pruefe(await menue.isVisible(), 'Rechtsklick auf die Markierung öffnet das Kreismenü')
  const eintraege = await page.locator('[data-textmenue] [data-textaktion]').allInnerTexts()
  pruefe(
    eintraege.length === 10 && eintraege.includes('In Fußnote erklären') && eintraege.includes('Auslassen […]'),
    `Alle Aktionen im Kreis (${eintraege.join(' | ')})`
  )
  await page.screenshot({ path: join(out, '1-kreismenue.png') })

  // ---------- 2. Fußnote
  await page.locator('[data-textaktion="fussnote"]').click()
  const fussnote = await bis(() => {
    const b = window.__selftest.worksheetJetzt().sheets[0].blocks.find((x) => x.type === 'text')
    return (b.fussnoten ?? []).length === 1 && /Versammlung\[\^f1\]/.test(b.body)
  })
  pruefe(fussnote, 'Fußnote gespeichert: Marke hinter dem Wort')
  await page.waitForTimeout(1200)
  const anzeige = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.module-container:not([hidden]) .ws-editor-pages .ws-text')].find((e) => e.getBoundingClientRect().height > 0)
    const sup = el?.querySelector('.ws-paragraph sup')
    const notiz = el?.querySelector('.ws-anmerkung')
    return { sup: sup?.textContent, vor: sup?.parentElement?.previousSibling?.textContent?.slice(-11), notiz: notiz?.textContent }
  })
  pruefe(anzeige.sup === '1' && /Versammlung$/.test(anzeige.vor ?? ''), `Hochgestellte 1 am Wort (${JSON.stringify(anzeige)})`)
  pruefe(/^1\s*Versammlung: Treffen der gewählten Abgeordneten/.test(anzeige.notiz ?? ''), 'Unter dem Material: ¹ Versammlung: Erklärung')
  const anfrage = readFileSync(protokoll, 'utf8')
    .trim()
    .split('\n')
    .map((z) => JSON.parse(z))
    .find((a) => a.schemaName === 'textauswahl_fussnote')
  const anfrageText = JSON.stringify(anfrage ?? {})
  pruefe(
    anfrageText.includes('Geschichte') && anfrageText.includes('Jahrgang 12') && anfrageText.includes('Versammlung'),
    'Die KI bekommt Fach, Jahrgang und die Stelle'
  )
  await page.locator('.ws-anmerkung').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '2-fussnote.png') })
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  pruefe(!(await textBlock()).body.includes('[^f1]'), 'Strg+Z nimmt die Fußnote zurück')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(500)
  pruefe((await textBlock()).body.includes('[^f1]'), 'Strg+Y stellt sie wieder her')

  // ---------- 3. Aufgabe mit Zitat
  await page.waitForTimeout(800)
  p = await markiere(1, 'die Gruende fuer den Beschluss')
  pruefe(Boolean(p), 'Passage in Absatz 2 markiert')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.waitForTimeout(400)
  await page.locator('[data-textaktion="aufgabe"]').click()
  const aufgabeDa = await bis(() =>
    window.__selftest.worksheetJetzt().sheets[0].blocks.some((b) => b.type === 'task' && b.instruction.includes('Gruende fuer den Beschluss'))
  )
  pruefe(aufgabeDa, 'Neue Aufgabe eingefügt')
  const aufgabe = await page.evaluate(() =>
    window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task' && b.instruction.includes('Gruende'))
  )
  console.log('       Anweisung:', aufgabe?.instruction)
  pruefe(
    /^\*\*Erläutern\*\* Sie, inwiefern die Abgeordneten laut Bericht „die Gruende fuer den Beschluss“ verlangten \(Z\. \d+(–\d+)?\)\.$/.test(
      aufgabe?.instruction ?? ''
    ),
    'Zitat im Satz, Operator in Sie-Form, „…“ und Zeilenangabe'
  )
  pruefe((aufgabe?.solution ?? '').includes('Forderung nach Begründung'), 'Erwartungshorizont übernommen')
  const reihenfolge = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.map((b) => b.type))
  pruefe(reihenfolge.indexOf('task') > reihenfolge.indexOf('text'), `Aufgabe steht hinter dem Material (${reihenfolge.join(', ')})`)
  await page.waitForTimeout(1200)
  await page.locator('.editor-block', { hasText: 'Gruende fuer den Beschluss' }).last().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '3-aufgabe.png') })

  // ---------- 4. Auslassen
  p = await markiere(2, 'Die Aussprache zog sich hin, weil jede Seite auf ihre Erfahrungen verwies und niemand nachgeben wollte. ')
  pruefe(Boolean(p), 'Satz in Absatz 3 markiert')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.waitForTimeout(400)
  await page.locator('[data-textaktion="auslassen"]').click()
  await page.waitForTimeout(800)
  const gekuerzt = await textBlock()
  pruefe(/beriet die Versammlung .*\[…\] Am Abend/s.test(gekuerzt.body.split('\n\n')[2] ?? ''), 'Satz durch […] ersetzt')
  pruefe(/\(gekürzt\)$/.test(gekuerzt.source), `Quelle mit „(gekürzt)" (${gekuerzt.source})`)
  await page.screenshot({ path: join(out, '4-ausgelassen.png') })

  // ---------- 5. Umschalt + Rechtsklick
  p = await markiere(0, 'Abgeordneten')
  await page.mouse.move(p.x, p.y)
  await page.keyboard.down('Shift')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.keyboard.up('Shift')
  await page.waitForTimeout(400)
  pruefe(!(await menue.isVisible().catch(() => false)), 'Umschalt + Rechtsklick öffnet kein Kreismenü')
  await page.keyboard.press('Escape')

  // ---------- 6. Klassenarbeit
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.exam())
  await page.evaluate(() => {
    const e = structuredClone(window.__selftest.kaJetzt())
    e.parts[0].blocks.unshift({
      id: 'm1',
      type: 'text',
      title: 'A trip to York',
      body: 'Last summer we travelled to York. The old walls preserve the history of the city.',
      lineNumbers: true,
      source: '',
      glossary: []
    })
    window.__selftest.kaSetzen(e)
  })
  await page.waitForTimeout(2500)
  p = await markiere(0, 'preserve')
  pruefe(Boolean(p), 'Klassenarbeit: Wort im Material markiert')
  if (p) {
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await page.waitForTimeout(500)
    pruefe(await menue.isVisible(), 'Klassenarbeit: Rechtsklick öffnet das Kreismenü')
    const sprache = await page
      .locator('[data-erklaersprache]')
      .getAttribute('data-erklaersprache')
      .catch(() => null)
    pruefe(sprache === 'de' || sprache === 'en', `Klassenarbeit Englisch: Sprache der Erklärung wählbar (${sprache})`)
    await page.screenshot({ path: join(out, '6-klassenarbeit.png') })
    await page.locator('[data-textaktion="luecke"]').click()
    await page.waitForTimeout(800)
    const ka = await page.evaluate(() => window.__selftest.kaJetzt().parts[0].blocks.find((b) => b.id === 'm1'))
    pruefe(ka.body.includes('[[preserve]]'), 'Klassenarbeit: Wort wird zur Lücke')
  }
  pruefe(fehler.length === 0, `keine Fehler im Fenster${fehler.length ? ` – ${fehler.slice(0, 3).join(' | ')}` : ''}`)
} catch (e) {
  pruefe(false, `Abbruch – ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nTextauswahl-Menü in Ordnung. Bilder in ${out}`)
