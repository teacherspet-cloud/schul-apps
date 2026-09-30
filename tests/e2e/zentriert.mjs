// Wache: Blätter MITTIG und EINGEPASST, Zoom überall gleich – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/zentriert.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (30.09.2026): „In den Apps: Das erstellte Material scheint linksbündig
// angezeigt zu werden. Das fällt vor allem auf, wenn die linke Seitenleiste ausgeblendet wird und
// rechts ein großer freier Platz entsteht. Zeige das Material auf der freien Fläche immer
// zentriert (und heranzoombar) an, sodass es die freie Fläche dort sinnvoll füllt."
//
// Geprüft je Programm (Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Grammatiktest, Vokabeltest,
// Rückmeldung):
//   – Blatt mittig in der freien Fläche (linker = rechter Rand ± 2 px), mit breiter und schmaler Leiste
//   – „Breite einpassen" füllt die Breite bis zur Obergrenze (150 %) und folgt der Leiste
//   – Zoom per Knopf, Strg + Mausrad (Punkt unter dem Zeiger bleibt), Strg + Plus/Minus,
//     Strg + Umschalt + 0 = Einpassen; Strg + 0 bleibt die Startseite; Zoom je Programm gemerkt
//   – Bearbeiten im gezoomten Blatt: Text ändern, Baustein ziehen, Beschriftungspunkt ziehen,
//     Randnotiz anlegen (Rückmeldung)
//   – Doppelseite: zwei Seiten nebeneinander
//   – Touch (CDP-Emulation): Seitenleiste ausblenden → Blatt mittig, Zwei-Finger-Zoom
//   – Druck-HTML unverändert (kein Zoom darin)
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/zentriert')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-zentriert-'))
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 100,
    antworten: {
      rueckmeldung_bogen: {
        staerken: ['S1 nennt gleich zu Beginn ein klares Anliegen.'],
        schritte: ['Ergänze zu jedem Argument ein Beispiel aus deinem Alltag.'],
        kriterien: [{ kriterium: 'Anliegen', einschaetzung: 'sicher', beleg: 'Ich finde, das Handyverbot ist falsch.' }],
        schluss: 'Weiter so.',
        gesamt: { anteil: 80, begruendung: 'Klare These, Belege fehlen.' },
        rand: [{ zitat: 'das Handyverbot ist falsch', text: 'Klare These', zeichen: '', art: 'lob' }],
        fehler: []
      },
      rueckmeldung_teile: { teile: [] },
      rueckmeldung_erwartung: { erwartung: '- Einleitung\n- Argumente\n- Urteil' }
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
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
page.on('crash', () => problems.push('Das Fenster ist abgestürzt'))
app.on('close', () => console.log('   (App beendet)'))
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w?.setSize(1700, 1050)
  w?.center()
})
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const warte = (ms) => page.waitForTimeout(ms)

/**
 * Lage des sichtbaren Blattes: Ränder links/rechts zur freien Fläche (dem rollenden Fenster, in dem
 * das Blatt steht), Zoom, Seiten. `wurzel` grenzt auf ein Programm bzw. die Rückmeldung ein.
 */
const lage = () =>
  page.evaluate(() => {
    const sichtbarEl = (el) => el.getBoundingClientRect().height > 0 && el.checkVisibility()
    const flaeche = [...document.querySelectorAll('.fit-to-width, [data-rm-blatt]')].filter(sichtbarEl).pop()
    if (!flaeche) return null
    const seiten = [...flaeche.querySelectorAll('.ws-page, .vt-page, .rm-seite')].filter((el) => !el.closest('.ws-measure, .vt-measure') && sichtbarEl(el))
    if (!seiten.length) return null
    const fenster = flaeche.closest('.mantine-ScrollArea-viewport') ?? flaeche
    const f = fenster.getBoundingClientRect()
    const links = Math.min(...seiten.map((s) => s.getBoundingClientRect().left))
    const rechts = Math.max(...seiten.map((s) => s.getBoundingClientRect().right))
    const r0 = seiten[0].getBoundingClientRect()
    const fl = flaeche.getBoundingClientRect()
    return {
      randLinks: Math.round(links - f.left),
      randRechts: Math.round(f.left + fenster.clientWidth - rechts),
      fensterBreite: Math.round(fenster.clientWidth),
      flaecheBreite: Math.round(flaeche.clientWidth),
      flaecheLinks: Math.round(fl.left),
      seitenBreite: Math.round(r0.width),
      zoom: Number(flaeche.getAttribute('data-blatt-zoom')),
      seiten: seiten.length,
      nebeneinander: seiten.length > 1 && Math.abs(seiten[1].getBoundingClientRect().top - r0.top) < 4 && seiten[1].getBoundingClientRect().left > r0.right
    }
  })
const zoomWert = async () => parseInt(await page.locator('[data-zoom-wert]').filter({ visible: true }).last().innerText(), 10)
const A4 = (210 * 96) / 25.4

/** Mittig? Und füllt „Einpassen" die Fläche bis zur Obergrenze? */
async function mittigUndEingepasst(name, schritt) {
  const l = await lage()
  if (!l) return pruefe(false, `${name} ${schritt}: kein Blatt gefunden`)
  pruefe(Math.abs(l.randLinks - l.randRechts) <= 2, `${name} ${schritt}: Blatt mittig (links ${l.randLinks} px, rechts ${l.randRechts} px)`)
  const soll = Math.max(0.5, Math.min(1.5, Math.floor(((l.flaecheBreite - 24) / A4) * 100) / 100))
  pruefe(Math.abs(l.zoom - soll) <= 0.02, `${name} ${schritt}: Breite eingepasst (Zoom ${l.zoom}, erwartet ${soll} bei ${l.flaecheBreite} px Fläche)`)
  return l
}

/** Leiste ausklappen bzw. einklappen (PC: breite oder schmale Leiste) */
async function leiste(breit) {
  const knopf = page.locator('.leiste-umschalter[aria-expanded]').first()
  if ((await knopf.getAttribute('aria-expanded')) !== String(breit)) await knopf.click()
  await warte(700)
}

/** Strg + Mausrad über einem Punkt */
async function strgRad(x, y, deltaY) {
  await page.mouse.move(x, y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, deltaY)
  await warte(250)
  await page.keyboard.up('Control')
  await warte(400)
}

/** Zoom-Bedienung am PC: Knopf, Strg + Rad, Tasten, Einpassen */
async function zoomBedienung(name) {
  const vorher = await lage()
  await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
  await warte(500)
  const nachKnopf = await lage()
  pruefe(nachKnopf.zoom > vorher.zoom, `${name}: Knopf „Vergrößern" (${vorher.zoom} → ${nachKnopf.zoom})`)
  pruefe((await zoomWert()) === Math.round(nachKnopf.zoom * 100), `${name}: Prozentanzeige stimmt (${await zoomWert()} %)`)
  await sichtbar(page.getByRole('button', { name: 'Verkleinern' })).click()
  await sichtbar(page.getByRole('button', { name: 'Verkleinern' })).click()
  await warte(500)
  const nachKlein = await lage()
  pruefe(nachKlein.zoom < nachKnopf.zoom, `${name}: Knopf „Verkleinern" (${nachKnopf.zoom} → ${nachKlein.zoom})`)
  // Strg + Mausrad: der Punkt unter dem Zeiger bleibt stehen
  const punkt = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.ws-page, .vt-page, .rm-seite')].find((el) => el.getBoundingClientRect().height > 0 && el.checkVisibility() && !el.closest('.ws-measure, .vt-measure'))
    const r = s.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.3), y: Math.round(Math.min(r.top + 300, innerHeight - 200)), rx: (r.width * 0.3) / r.width }
  })
  const vorRad = await page.evaluate(({ x, y }) => {
    const s = [...document.querySelectorAll('.ws-page, .vt-page, .rm-seite')].find((el) => el.getBoundingClientRect().height > 0 && el.checkVisibility() && !el.closest('.ws-measure, .vt-measure'))
    const r = s.getBoundingClientRect()
    return { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height }
  }, punkt)
  const treffer = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return `${el?.tagName}.${el?.className} in Fläche: ${Boolean(el?.closest('.fit-to-width, [data-rm-blatt]'))}`
  }, punkt)
  if (!/in Fläche: true/.test(treffer)) console.log(`       (Zeiger über ${treffer})`)
  await strgRad(punkt.x, punkt.y, -300)
  const nachRad = await lage()
  const nachRadPunkt = await page.evaluate(({ x, y }) => {
    const s = [...document.querySelectorAll('.ws-page, .vt-page, .rm-seite')].find((el) => el.getBoundingClientRect().height > 0 && el.checkVisibility() && !el.closest('.ws-measure, .vt-measure'))
    const r = s.getBoundingClientRect()
    return { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height }
  }, punkt)
  pruefe(nachRad.zoom > nachKlein.zoom * 1.3, `${name}: Strg + Mausrad vergrößert (${nachKlein.zoom} → ${nachRad.zoom})`)
  pruefe(
    Math.abs(nachRadPunkt.fx - vorRad.fx) < 0.02 && Math.abs(nachRadPunkt.fy - vorRad.fy) < 0.02,
    `${name}: Der Punkt unter dem Mauszeiger bleibt stehen (${vorRad.fx.toFixed(3)}/${vorRad.fy.toFixed(3)} → ${nachRadPunkt.fx.toFixed(3)}/${nachRadPunkt.fy.toFixed(3)})`
  )
  // Ohne Strg rollt das Rad weiter (kein Zoom)
  await page.mouse.wheel(0, 200)
  await warte(300)
  pruefe((await lage()).zoom === nachRad.zoom, `${name}: Mausrad ohne Strg zoomt nicht`)
  // Tasten
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+-')
  await warte(400)
  const nachMinus = await lage()
  pruefe(nachMinus.zoom < nachRad.zoom, `${name}: Strg + Minus verkleinert (${nachRad.zoom} → ${nachMinus.zoom})`)
  await page.keyboard.press('Control+=')
  await warte(400)
  const nachPlus = await lage()
  pruefe(nachPlus.zoom > nachMinus.zoom, `${name}: Strg + Plus vergrößert (${nachMinus.zoom} → ${nachPlus.zoom})`)
  await page.keyboard.press('Control+Shift+Digit0')
  await warte(500)
  const eingepasst = await lage()
  pruefe(Math.abs(eingepasst.zoom - vorher.zoom) < 0.015, `${name}: Strg + Umschalt + 0 passt wieder ein (${eingepasst.zoom}, vorher ${vorher.zoom})`)
  pruefe((await sichtbar(page.locator('[data-zoom-einpassen]')).getAttribute('aria-pressed')) === 'true', `${name}: „Breite einpassen" ist als aktiv markiert`)
}

/** Ein Programm prüfen: Leiste breit/schmal, Zoom-Bedienung, Bildschirmfotos */
async function programm(name, kurz) {
  await leiste(true)
  await warte(300)
  await mittigUndEingepasst(name, 'breite Leiste')
  await page.screenshot({ path: join(out, `${kurz}-1-breite-leiste.png`) })
  await leiste(false)
  const schmal = await mittigUndEingepasst(name, 'schmale Leiste')
  await page.screenshot({ path: join(out, `${kurz}-2-schmale-leiste.png`) })
  await zoomBedienung(name)
  return schmal
}

try {
  // =============================================================== Arbeitsblatt
  console.log('\nArbeitsblatt')
  await page.click('[aria-label="Arbeitsblatt"]')
  await warte(600)
  await page.evaluate(() => window.__selftest.wsAnordnung('tabelle', 'left'))
  await warte(1500)
  // Ein Bild mit Beschriftungspunkten dazu (wie beschriftungZiehen.mjs)
  await page.evaluate(() => {
    const ws = window.__selftest.worksheetJetzt()
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 600
    const g = c.getContext('2d')
    g.fillStyle = '#eef3ee'
    g.fillRect(0, 0, 800, 600)
    ws.sheets[0].blocks.push({
      id: 'zelle',
      type: 'image',
      role: 'material',
      side: 'none',
      description: 'Pflanzenzelle',
      caption: 'Pflanzenzelle',
      widthPercent: 60,
      image: { dataUrl: c.toDataURL('image/png'), source: 'own', credit: 'Prüfstand' },
      labels: [
        { id: 'a', text: 'Zellkern', x: 30, y: 30 },
        { id: 'b', text: 'Zellwand', x: 60, y: 55 }
      ]
    })
    window.__selftest.setWorksheet(structuredClone(ws))
  })
  await warte(2500)
  await programm('Arbeitsblatt', 'arbeitsblatt')

  // ---------- Zoom je Programm gemerkt; Strg + 0 bleibt die Startseite
  await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
  await warte(400)
  const abZoom = (await lage()).zoom
  await page.click('[aria-label="Vokabeltest"]')
  await warte(600)
  await page.click('[aria-label="Arbeitsblatt"]')
  await warte(600)
  pruefe((await lage()).zoom === abZoom, `Arbeitsblatt: Zoom nach dem Programmwechsel erhalten (${abZoom})`)
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+0')
  await page.getByText('Zuletzt bearbeitet').waitFor({ timeout: 10000 })
  pruefe(true, 'Strg + 0 öffnet weiterhin die Startseite')
  await page.click('[aria-label="Arbeitsblatt"]')
  await warte(800)
  pruefe((await lage()).zoom === abZoom, 'Arbeitsblatt: Zoom nach der Startseite erhalten')

  // ---------- Bearbeiten im gezoomten Blatt (175 %)
  for (let i = 0; i < 3 && (await lage()).zoom < 1.75; i++) {
    await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
    await warte(300)
  }
  const gz = await lage()
  pruefe(gz.zoom >= 1.75, `Arbeitsblatt: Blatt auf ${Math.round(gz.zoom * 100)} % gezoomt`)
  pruefe(gz.seitenBreite > gz.flaecheBreite - 30 || gz.zoom * A4 <= gz.flaecheBreite, 'Arbeitsblatt: gezoomtes Blatt ist breiter als die Fläche und rollt seitwärts')

  // Text ändern: Überschrift der Aufgabe
  const aufgabe = page.locator('.ws-editor-pages').getByText('your favourite place').first()
  await aufgabe.scrollIntoViewIfNeeded()
  const ab = await aufgabe.boundingBox()
  // Ans Ende des Textes klicken – mit dem Zoom umgerechnet muss der Klick im Text landen
  await page.mouse.click(ab.x + ab.width - 3, ab.y + ab.height / 2)
  await warte(300)
  await page.keyboard.press('End')
  await page.keyboard.type(' Zoomprobe')
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined)
  await warte(500)
  const text = await page.evaluate(() => JSON.stringify(window.__selftest.worksheetJetzt().sheets[0].blocks))
  pruefe(text.includes('Zoomprobe'), 'Arbeitsblatt (gezoomt): Text im Blatt geändert')

  // Baustein ziehen: Der Griff landet dort, wo losgelassen wurde
  const griff = page.locator('.ws-side-image [aria-label="Baustein verschieben"]').first()
  await griff.scrollIntoViewIfNeeded()
  const g = await griff.boundingBox()
  if (g) {
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2 + 20, g.y + g.height / 2 + 20, { steps: 4 })
    await warte(400)
    const ziel = await page.evaluate(() => {
      const seite = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)[0]
      const r = seite.querySelector('.ws-body').getBoundingClientRect()
      // Im Satzspiegel, links im sichtbaren Teil – rechts stieße der breite Baustein an den Rand
      return { x: Math.round(Math.max(r.left, 0) + 120), y: Math.round(Math.min(r.bottom - 200, innerHeight - 250)) }
    })
    await page.mouse.move(ziel.x, ziel.y, { steps: 12 })
    await page.mouse.up()
    await warte(900)
    // Vom Griff aus gezogen, hängt der Baustein mit seiner linken oberen Ecke (24/20 Punkte versetzt) am Zeiger
    const frei = page.locator('.ws-editor-pages .ws-free').filter({ visible: true }).first()
    const nach = (await frei.count()) ? await frei.boundingBox() : null
    const dx = nach ? Math.abs(nach.x + Math.min(24, nach.width / 2) - ziel.x) : 999
    const dy = nach ? Math.abs(nach.y + Math.min(20, nach.height / 2) - ziel.y) : 999
    pruefe(nach && dx < 12 && dy < 12, `Arbeitsblatt (gezoomt): Baustein landet unter dem Zeiger (Abweichung ${Math.round(dx)}/${Math.round(dy)} px)`)
    await page.screenshot({ path: join(out, 'arbeitsblatt-3-gezoomt-gezogen.png') })
    // Per Skript geklickt: Die Schreiblinien der Aufgabe liegen über dem Knopf
    await page.evaluate(() => document.querySelector('[aria-label="Wieder einreihen"]')?.click())
    await warte(700)
  } else pruefe(false, 'Arbeitsblatt: Anfassknopf der Tabelle fehlt')

  // Beschriftungspunkt ziehen: Verschiebung in Prozent passt zur Zeigerstrecke
  const fig = page.locator('.ws-editor-pages .ws-image:has([data-griff])').first()
  await fig.scrollIntoViewIfNeeded()
  const punktB = fig.locator('[data-griff="punkt"][data-label-id="b"]').first()
  const bild = await fig.locator('img').first().boundingBox()
  const p = await punktB.boundingBox()
  if (p && bild) {
    const vorher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'zelle').labels.find((l) => l.id === 'b'))
    const x = p.x + p.width / 2
    const y = p.y + p.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (100 * i) / 8, y + (-80 * i) / 8)
    await page.mouse.up()
    await warte(400)
    const nachher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'zelle').labels.find((l) => l.id === 'b'))
    const sollX = vorher.x + (100 / bild.width) * 100
    const sollY = vorher.y - (80 / bild.height) * 100
    pruefe(
      Math.abs(nachher.x - sollX) < 2 && Math.abs(nachher.y - sollY) < 2,
      `Arbeitsblatt (gezoomt): Beschriftungspunkt folgt dem Zeiger (${vorher.x}/${vorher.y} → ${nachher.x.toFixed(1)}/${nachher.y.toFixed(1)}, erwartet ${sollX.toFixed(1)}/${sollY.toFixed(1)})`
    )
    await fig.screenshot({ path: join(out, 'arbeitsblatt-4-beschriftung-gezoomt.png') })
  } else pruefe(false, 'Arbeitsblatt: Beschriftungspunkt nicht gefunden')

  // Druck unverändert: kein Zoom im Druck-HTML
  const druck = await page.evaluate(() => window.__selftest.printHtml?.() ?? null)
  if (druck) pruefe(!/zoom:\s*1\.\d|blatt-inhalt/.test(druck), 'Arbeitsblatt: Druck-HTML ohne Ansichtszoom')
  await page.keyboard.press('Control+Shift+Digit0')
  await warte(500)

  // ---------- Doppelseite: zwei Seiten nebeneinander
  const doppel = page.locator('[data-zoom-doppelseite]').filter({ visible: true }).last()
  pruefe((await doppel.count()) > 0, 'Arbeitsblatt: Umschalter „Doppelseite" bei breiter Fläche')
  if (await doppel.count()) {
    await doppel.click()
    await warte(1500)
    const d = await lage()
    pruefe(d.nebeneinander, `Arbeitsblatt: Doppelseite zeigt zwei Seiten nebeneinander (${d.seiten} Seiten)`)
    pruefe(Math.abs(d.randLinks - d.randRechts) <= 2, `Arbeitsblatt: Doppelseite mittig (links ${d.randLinks}, rechts ${d.randRechts})`)
    await page.evaluate(() => document.querySelector('.module-container:not([hidden]) .editor-canvas .mantine-ScrollArea-viewport')?.scrollTo(0, 0))
    await warte(300)
    await page.screenshot({ path: join(out, 'arbeitsblatt-5-doppelseite.png') })
    await doppel.click()
    await warte(800)
  }

  // =============================================================== Klassenarbeit
  console.log('\nKlassenarbeit')
  await page.click('[aria-label="Klassenarbeiten"]')
  await warte(600)
  await page.evaluate(() => window.__selftest.exam())
  await warte(3000)
  await programm('Klassenarbeit', 'klassenarbeit')
  // =============================================================== Lernzielkontrolle
  console.log('\nLernzielkontrolle')
  await page.click('[aria-label="Lernzielkontrolle"]')
  await warte(600)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await warte(3000)
  await programm('Lernzielkontrolle', 'lernzielkontrolle')

  // =============================================================== Grammatiktest
  console.log('\nGrammatiktest')
  await page.click('[aria-label="Grammatiktest"]')
  await warte(600)
  await page.evaluate(() => window.__selftest.grammarTestSheet())
  await warte(3000)
  await programm('Grammatiktest', 'grammatiktest')

  // =============================================================== Vokabeltest
  console.log('\nVokabeltest')
  await page.click('[aria-label="Vokabeltest"]')
  await warte(600)
  await page.evaluate(() => window.__selftest.vtLatein())
  await warte(3000)
  await programm('Vokabeltest', 'vokabeltest')
  // Bearbeiten im gezoomten Blatt: Aufgabentitel ändern
  await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
  await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
  await warte(500)
  const titel = sichtbar(page.locator('.vt-page .vt-block-title'))
  await titel.scrollIntoViewIfNeeded()
  await titel.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Zoomprobe')
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined)
  await warte(500)
  const vt = await page.evaluate(() => JSON.stringify(window.__selftest.vtJetzt?.() ?? ''))
  pruefe(vt.includes('Zoomprobe'), 'Vokabeltest (gezoomt): Aufgabentitel im Blatt geändert')
  await page.screenshot({ path: join(out, 'vokabeltest-3-gezoomt.png') })
  await page.keyboard.press('Control+Shift+Digit0')
  await warte(400)

  // =============================================================== Rückmeldung (A4-Blatt mit Randnotizen)
  console.log('\nRückmeldung')
  await page.click('[aria-label="Rückmeldung"]')
  await page.getByText('Rückmeldung ohne Note', { exact: true }).waitFor({ timeout: 10000 })
  await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
  await sichtbar(page.getByLabel('Titel der Aufgabe')).fill('Leserbrief zum Handyverbot')
  await sichtbar(page.locator('[data-rm-aufgaben]')).fill('Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot.')
  await sichtbar(page.locator('[data-rm-eintippen]')).click()
  await sichtbar(page.getByLabel('Text von S1')).fill('Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.')
  await sichtbar(page.locator('[data-rm-schreiben]')).click()
  const zeile = page.locator('[data-rm-zeile="S1"]').filter({ visible: true }).first()
  await zeile.waitFor({ timeout: 30000 })
  if ((await zeile.getAttribute('data-rm-offen')) !== 'ja') await zeile.locator('[data-rm-aufklappen]').click()
  await zeile.locator('[data-rm-blatt]').waitFor({ timeout: 10000 })
  await warte(1500)
  await leiste(true)
  const rmBreit = await lage()
  pruefe(rmBreit && Math.abs(rmBreit.randLinks - rmBreit.randRechts) <= 2, `Rückmeldung breite Leiste: Blatt mittig (links ${rmBreit?.randLinks}, rechts ${rmBreit?.randRechts})`)
  await leiste(false)
  const rm = await lage()
  pruefe(rm && Math.abs(rm.randLinks - rm.randRechts) <= 2, `Rückmeldung schmale Leiste: Blatt mittig (links ${rm?.randLinks}, rechts ${rm?.randRechts})`)
  const rmSoll = Math.max(0.35, Math.min(1.5, Math.floor(((rm.flaecheBreite - 24) / A4) * 100) / 100))
  pruefe(Math.abs(rm.zoom - rmSoll) <= 0.02, `Rückmeldung: Breite eingepasst (Zoom ${rm.zoom}, erwartet ${rmSoll})`)
  await page.screenshot({ path: join(out, 'rueckmeldung-1-eingepasst.png') })
  await sichtbar(page.getByRole('button', { name: 'Vergrößern' })).click()
  await warte(1200)
  const rmZ = await lage()
  pruefe(rmZ.zoom > rm.zoom, `Rückmeldung: Knopf „Vergrößern" (${rm.zoom} → ${rmZ.zoom})`)
  // Randnotiz im gezoomten Blatt anlegen: Text markieren → Notiz
  const blatt = page.locator('[data-rm-blatt]').filter({ visible: true }).first()
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
  await warte(200)
  await page.keyboard.type('Wortwahl prüfen')
  await warte(400)
  const rand = await page.evaluate(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen?.rand ?? [])
  pruefe(
    rand.some((k) => k.zitat === 'brauchen' && k.text === 'Wortwahl prüfen'),
    'Rückmeldung (gezoomt): markierte Stelle wird zur Randnotiz'
  )
  await page.screenshot({ path: join(out, 'rueckmeldung-2-gezoomt-notiz.png') })

  // =============================================================== Touch (CDP-Emulation): Leiste ausblenden, zwei Finger
  console.log('\nTouch')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] }).catch(() => undefined)
  await warte(800)
  const touchAn = await page.evaluate(() => document.documentElement.hasAttribute('data-touch'))
  pruefe(touchAn, 'Touch-Modus in der Emulation an')
  if (touchAn) {
    await page.click('[aria-label="Arbeitsblatt"]')
    await warte(800)
    await sichtbar(page.locator('[data-leiste-ausblenden]')).click()
    await warte(800)
    const t = await lage()
    pruefe(t && Math.abs(t.randLinks - t.randRechts) <= 2, `Touch, Seitenleiste ausgeblendet: Blatt mittig (links ${t?.randLinks}, rechts ${t?.randRechts})`)
    await page.keyboard.press('Control+Shift+Digit0')
    await warte(500)
    const t0 = await lage()
    pruefe(Math.abs(t0.flaecheLinks) <= 4 || t0.flaecheLinks < 40, `Touch: Fläche reicht bis an den linken Rand (${t0.flaecheLinks} px)`)
    await page.screenshot({ path: join(out, 'touch-1-ohne-leiste.png') })
    const finger = (type, punkte) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punkte.map((q, i) => ({ x: q.x, y: q.y, id: i })) })
    const fx = 850
    const fy = 500
    await finger('touchStart', [
      { x: fx - 40, y: fy },
      { x: fx + 40, y: fy }
    ])
    for (let i = 1; i <= 8; i++) {
      await finger('touchMove', [
        { x: fx - 40 - i * 10, y: fy },
        { x: fx + 40 + i * 10, y: fy }
      ])
      await warte(20)
    }
    await finger('touchEnd', [])
    await warte(600)
    const t1 = await lage()
    pruefe(t1.zoom > t0.zoom * 1.3, `Touch: Zwei-Finger-Zoom vergrößert (${t0.zoom} → ${t1.zoom})`)
    await page.screenshot({ path: join(out, 'touch-2-gezoomt.png') })
    await sichtbar(page.locator('[data-zoom-wert]')).click()
    await warte(500)
    pruefe(Math.abs((await lage()).zoom - t0.zoom) < 0.015, 'Touch: Antippen der Prozentanzeige passt wieder ein')
  }
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  console.log(e)
  await page.screenshot({ path: join(out, 'abbruch.png') }).catch(() => undefined)
}

await app.close()
try {
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
} catch {
  // Profil wird später vom System geräumt
}
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nAlle Blätter mittig, eingepasst und zoombar. Bilder in ${out}`)
