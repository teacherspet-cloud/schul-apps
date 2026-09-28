// Wache für das ÜBERTHEMA (Paket 11) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/ueberthema.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (26.09.2026): Neben dem Thema steht ein Überthema – standardmäßig der
// Themenbereich des Materials, je Material überschreibbar oder abschaltbar, dargestellt wie in
// der Designvorlage gewählt ((a) Pfad, (b) Fach links / Überthema rechts, (c) betont). Geprüft:
//  1. Arbeitsblatt im Themenbereich → „Geschichte › Industrialisierung" im Kopf;
//  2. Darstellung (a)/(b)/(c) aus der Designvorlage (Bildschirmfotos);
//  3. in den Blattoptionen überschrieben, dann abgeschaltet (kein einsamer Pfeil);
//  4. das PDF enthält das Überthema;
//  5. Lernzielkontrolle im Bereich, Vokabeltest mit der Unit der Liste;
//  6. „Neu in diesem Bereich" übernimmt das Fach des Bereichs ins Formular.
// Bildschirmfotos: paket11-kopf-a-pfad.png, paket11-kopf-b-geteilt.png, paket11-kopf-c-betont.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche, blattoptionen } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ueberthema')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-ueberthema-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.setSize(1500, 1050)
  })
  await warteAufOberflaeche(page)

  /** Kopf der ersten sichtbaren Seite im Editor (nicht die Messseiten) */
  const kopf = () =>
    page.evaluate(() => {
      const seite = [...document.querySelectorAll('.ws-editor-pages .ws-page')].find(
        (p) => p.getBoundingClientRect().width > 0 && !p.classList.contains('ws-cover')
      )
      const h = seite?.querySelector('.ws-header')
      return {
        text: h?.textContent ?? '',
        fachzeile: h?.querySelector('.ws-subject')?.textContent ?? '',
        block: h?.querySelector('.ws-ueberthema')?.textContent ?? '',
        titel: h?.querySelector('.ws-title')?.textContent ?? ''
      }
    })
  const stil = (s, layout) =>
    page.evaluate(
      ([s, layout]) => {
        const ws = window.__selftest.worksheetJetzt()
        window.__selftest.setWorksheet({ ...ws, design: { ...ws.design, header: { ...ws.design.header, overTopicStyle: s, ...(layout ? { layout } : {}) } } })
      },
      [s, layout]
    )
  const kopfFoto = async (name) => {
    const seite = page.locator('.ws-editor-pages .ws-page').filter({ visible: true }).first()
    const box = await seite.boundingBox()
    await page.screenshot({ path: join(out, `${name}.png`), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(260, box.height) } })
  }

  // ---- 1) Arbeitsblatt im Themenbereich ----
  console.log('\nArbeitsblatt')
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(20))
  await page.waitForTimeout(2000)
  const vorher = await kopf()
  /*
   * Seit Paket 15 sortiert die App ein neues Material selbst in den passenden Themenbereich des
   * Lehrplans ein – ein Blatt ohne Bereich gibt es nach dem ersten Sichern nicht mehr. Geprüft
   * wird deshalb, dass dieser Bereich als Überthema im Kopf steht (Pfad „Fach › Bereich").
   */
  pruefe(/^Geschichte › \S/.test(vorher.fachzeile), `eingeordnetes Blatt zeigt seinen Bereich als Überthema (${vorher.fachzeile})`)
  await page.evaluate(() => window.__selftest.inBereich('arbeitsblatt', 'Industrialisierung', 'geschichte'))
  await page.waitForTimeout(900)
  const a = await kopf()
  pruefe(a.fachzeile.includes('Geschichte › Industrialisierung'), `Themenbereich steht im Kopf (${a.fachzeile})`)
  pruefe(!a.titel.includes('Industrialisierung'), '… nicht in der Blattüberschrift')
  await kopfFoto('paket11-kopf-a-pfad')

  // ---- 2) Darstellung aus der Designvorlage ----
  await stil('split')
  await page.waitForTimeout(900)
  const b = await kopf()
  pruefe(
    b.block === 'Industrialisierung' && !b.fachzeile.includes('›') && b.fachzeile.includes('Geschichte'),
    `(b) Fach links, Überthema rechts („${b.block}")`
  )
  await kopfFoto('paket11-kopf-b-geteilt')
  await stil('emphasis', 'colorBand')
  await page.waitForTimeout(900)
  const c = await kopf()
  pruefe(
    c.block.includes('Geschichte') && c.block.includes('Industrialisierung') && !c.fachzeile.includes('Geschichte'),
    `(c) Überthema betont, Fach klein darüber („${c.block}")`
  )
  await kopfFoto('paket11-kopf-c-betont')
  await stil('path', 'logoLeft')
  await page.waitForTimeout(700)

  // ---- 3) Überschreiben und abschalten ----
  console.log('\nÜberschreiben und abschalten')
  await blattoptionen(page)
  const feld = page.getByRole('textbox', { name: 'Überthema' }).filter({ visible: true }).first()
  pruefe((await feld.getAttribute('placeholder')) === 'Industrialisierung', 'Feld zeigt den Themenbereich als Vorgabe')
  await feld.fill('Soziale Frage')
  await page.waitForTimeout(900)
  const ueber = await kopf()
  pruefe(ueber.fachzeile.includes('Geschichte › Soziale Frage'), `überschrieben (${ueber.fachzeile})`)
  await page.locator('label', { hasText: 'Kein Überthema anzeigen' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(900)
  const aus = await kopf()
  pruefe(
    !aus.text.includes('›') && !aus.text.includes('Soziale Frage') && !aus.text.includes('Industrialisierung'),
    `abgeschaltet: kein Überthema, kein Pfeil (${aus.fachzeile})`
  )
  await page.locator('label', { hasText: 'Kein Überthema anzeigen' }).filter({ visible: true }).first().click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)

  // ---- 4) PDF ----
  console.log('\nPDF')
  const html = await page.evaluate(() => window.__selftest.printHtml())
  const bytes = await page.evaluate(async (h) => Array.from(await window.api.exporter.preview(h)), html)
  const texte = await page.evaluate(async (d) => window.__selftest.pdfText(d), bytes)
  pruefe(texte[0]?.includes('Soziale Frage'), `PDF enthält das Überthema (${(texte[0] ?? '').slice(0, 80)} …)`)
  const folge = texte.slice(1).some((t) => t.includes('Soziale Frage'))
  pruefe(texte.length < 2 || folge, `… auch im kompakten Kopf der Folgeseiten (${texte.length} Seiten)`)

  // ---- 5) Lernzielkontrolle und Vokabeltest ----
  console.log('\nLernzielkontrolle und Vokabeltest')
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__selftest.inBereich('lernzielkontrolle', 'Potenzen', 'mathematik'))
  await page.waitForTimeout(900)
  const lzk = await kopf()
  pruefe(lzk.text.includes('Mathematik › Potenzen'), `LZK: Themenbereich dezent im Kopf (${lzk.fachzeile})`)

  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    window.__selftest.vtLatein()
    window.__selftest.vtListenName('Prima nova – Lektion 12')
  })
  await page.waitForTimeout(1500)
  const vt = await page.evaluate(() => [...document.querySelectorAll('.vt-ueberthema')].find((e) => e.getBoundingClientRect().width > 0)?.textContent ?? '')
  pruefe(vt === 'Latein › Lektion 12', `Vokabeltest: Unit der Liste als Rückfall („${vt}")`)

  // ---- 6) „Neu in diesem Bereich" übernimmt das Fach ----
  console.log('\nNeu in diesem Bereich')
  await page.evaluate(async () => {
    await window.api.sheets.save({
      id: 'phy00001',
      name: 'Hebelgesetz',
      stats: { subjectId: 'physik', subjectLabel: 'Physik', topic: 'Hebelgesetz', grade: 8, schoolTypeName: 'Gymnasium', sheetCount: 1, hasBoard: false },
      payload: {}
    })
    const d = await window.api.themen.bereich({ id: 'b-mechanik', fachId: 'physik', name: 'Mechanik' })
    await window.api.themen.zuordnen({ 'arbeitsblatt:phy00001': { bereichId: 'b-mechanik', von: 'hand', am: new Date().toISOString() } })
    return d
  })
  await page.reload()
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  const knopf = page.getByRole('button', { name: 'Meine Arbeitsblätter', exact: true }).filter({ visible: true })
  if (await knopf.count()) await knopf.click()
  await page.waitForTimeout(900)
  // Seit Paket 12 stehen Fächer anfangs zugeklappt
  const physik = page.locator('[data-fach-abschnitt="physik"]').filter({ visible: true }).first()
  if ((await physik.getAttribute('data-offen')) !== 'true')
    await physik
      .getByRole('button', { name: /aufklappen$/ })
      .first()
      .click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Themenbereich „Mechanik“ öffnen' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Neu in diesem Bereich' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(2500)
  const neu = await page.evaluate(() => window.__selftest.worksheetJetzt()?.meta.subjectId)
  pruefe(neu === 'physik', `neues Blatt beginnt im Fach des Bereichs (${neu})`)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nÜberthema: alles in Ordnung. Bilder in ${out}`)
