// Werkzeuge auf freigegebenen Blättern (03.10.2026): Kästchen verschieben/größer ziehen, Linien rasten an Kästchen und
// Zeitleiste ein, Radierer für Stift-Striche und Objekte, Textmarker durchscheinend, KI-Prüfung einer Zeitleisten-Aufgabe.
// Etappe 5 des Schülerbereichs (02.10.2026): Arbeitsblatt für Lernende freigeben und ausfüllen.
// Vorher: Server lokal mit KI-Attrappe („rueckmeldung_bogen", „blatt_aufgabe_feedback"), IServ NICHT eingerichtet.
// Vorlage: das jüngste echte Arbeitsblatt mit Aufgaben aus dem lokalen Profil (nur gelesen).
// Aufruf: node tests/e2e/server-blatt.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-blatt-werkzeuge')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const KLASSE = `6b${Date.now() % 1000}`

// Jüngstes Blatt mit mindestens zwei Aufgaben (Lücken oder Linien)
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => JSON.stringify(w).includes('"zeitleiste"'))

/*
 * QUER=1 (06.10.2026): die Zeitleisten-Aufgabe steht auf einer Querseite – derselbe Ablauf auf dem quer gesetzten Blatt
 * (Andocken, Jahr, Optionen, Stift …).
 */
if (process.env.QUER && vorlage) {
  for (const blatt of vorlage.payload?.sheets ?? []) {
    const i = blatt.blocks.findIndex((b) => JSON.stringify(b.answer?.diagram ?? b.diagram ?? {}).includes('"zeitleiste"'))
    if (i < 0) continue
    blatt.blocks[i].seitenFormat = 'quer'
    if (blatt.blocks[i + 1]) blatt.blocks[i + 1].seitenFormat = 'hoch'
  }
}

// Bild zum Vergrößern und Markieren (25.10.2026): ein Material-Bild am Ende des letzten Blatts
const logo = `data:image/png;base64,${readFileSync(resolve('resources/schulen/logos/NI-67052.png')).toString('base64')}`
const mitBild = (payload) => {
  const p = JSON.parse(JSON.stringify(payload))
  const blatt = p.sheets?.at(-1)
  blatt?.blocks.push({
    id: 'bild-probe',
    type: 'image',
    role: 'material',
    image: { dataUrl: logo, source: 'own' },
    description: 'Probebild zum Markieren',
    caption: 'Probebild',
    widthPercent: 70
  })
  return p
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)

  // ---------- Lehrkraft: Blatt ablegen, Lerngruppe, Freigabe über die Oberfläche
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'blatt-probe', name: 'Blatt-Probe', stats: { sheetCount: 1 }, payload: mitBild(vorlage.payload) }] }
  })
  await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p
    .getByRole('button', { name: /Meine Arbeitsblätter/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  await p.waitForTimeout(500)
  await p.locator('[data-bibliothek-eintrag="Blatt-Probe"]').click()
  await p.locator('[data-blatt-freigeben-knopf]').waitFor({ timeout: 30000 })
  await p.waitForTimeout(2500)
  await p.locator('[data-blatt-freigeben-knopf]').click()
  await p.getByRole('dialog').getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await p.locator('[data-blatt-gaeste]').check()
  await p.screenshot({ path: join(out, '1-freigabe.png') })
  await p.locator('[data-blatt-freigeben]').click()
  const qr = await p
    .getByText('Code für die Lernenden')
    .waitFor({ timeout: 20000 })
    .then(
      () => true,
      () => false
    )
  pruefe(qr, 'Freigegeben, QR-Code für Gäste erscheint')
  const freigaben = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  const fr = freigaben[0]
  pruefe(Boolean(fr?.id && fr.link), `Freigabe in der Liste (${fr?.titel})`)

  // Keine Lösungen im Schülerblatt
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const roh = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  const loesung = vorlage.payload.sheets[0].blocks.find((b) => b.type === 'task' && b.solution && b.solution.length > 25)?.solution
  pruefe(!roh.erwartung && !roh.aufgaben && (!loesung || !roh.html.includes(loesung.slice(0, 25))), 'Schülerblatt enthält keine Lösungen/Erwartungen')

  // ---------- Mia am iPad: auf dem Blatt ausfüllen
  const s = await sm.newPage()
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="blaetter"]').click()
  await s.locator('[data-blatt-oeffnen]').first().click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await s.waitForTimeout(800)
  // Achse der Zeitleiste (lange dunkle SVG-Linie) in Bildschirmkoordinaten
  // Achse der Zeitleiste: längste waagerechte Strecke der Andockstellen (über die Linien-Werkzeug-Anzeige nicht nötig)
  const achseSuchen = () =>
    s.evaluate(() => {
      const f = document.querySelector('iframe')
      const fr = f.getBoundingClientRect()
      const k = fr.width / f.contentDocument.documentElement.clientWidth
      for (const img of f.contentDocument.querySelectorAll('img.ws-diagram-img')) {
        const src = decodeURIComponent(img.getAttribute('src').split(',').slice(1).join(','))
        const svg = new DOMParser().parseFromString(src, 'image/svg+xml').documentElement
        const vb = svg
          .getAttribute('viewBox')
          .split(/[\s,]+/)
          .map(Number)
        const b = img.getBoundingClientRect()
        for (const l of svg.querySelectorAll('line')) {
          const x1 = +l.getAttribute('x1'),
            x2 = +l.getAttribute('x2'),
            y1 = +l.getAttribute('y1'),
            y2 = +l.getAttribute('y2')
          const st = l.getAttribute('stroke') ?? ''
          if (Math.abs(y1 - y2) < 0.01 && Math.abs(x2 - x1) > vb[2] * 0.5 && /^#[0-3]/.test(st))
            return {
              x: fr.left + (b.left + ((x1 - vb[0]) / vb[2]) * b.width) * k,
              y: fr.top + (b.top + ((y1 - vb[1]) / vb[3]) * b.height) * k,
              w: ((x2 - x1) / vb[2]) * b.width * k
            }
        }
      }
      return null
    })
  const a0 = await achseSuchen()
  pruefe(Boolean(a0), 'Zeitleiste mit Achse auf dem Blatt')
  if (process.env.QUER) {
    const quer = await s.evaluate(() =>
      [...document.querySelector('iframe').contentDocument.querySelectorAll('.ws-page')].map((x) => (x.classList.contains('ws-page-quer') ? 'Q' : 'H')).join('')
    )
    pruefe(quer.includes('Q') && quer.includes('H'), `Digitales Blatt mit Querseite (${quer})`)
  }
  // Vollbild beim Lernen (09.10.2026, FokusRahmen.tsx): dann rollt die Ebene der Übung, nicht das Fenster
  await s.evaluate((y) => {
    const ebene = document.querySelector('.sa-fokus[data-fokus="an"] > .sa-fokus-inhalt')
    if (ebene) ebene.scrollBy(0, y - 450)
    else window.scrollTo(0, window.scrollY + y - 450)
  }, a0.y)
  await s.waitForTimeout(400)
  const ac = await achseSuchen()
  // Kästchen über der Achse
  await s.locator('[data-werkzeug="text"]').click()
  await s.mouse.click(ac.x + 40, ac.y - 130)
  await s.locator('[data-kaestchen]').last().fill('Attentat von Sarajevo')
  const box = s.locator('[data-kasten]').last()
  const b0 = await box.boundingBox()
  // Größer ziehen (auch die Höhe)
  const g = await s.locator('[data-kasten-groesse]').last().boundingBox()
  await s.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await s.mouse.down()
  await s.mouse.move(g.x + 40, g.y + 50, { steps: 6 })
  await s.mouse.up()
  const b1 = await box.boundingBox()
  pruefe(
    b1.height > b0.height + 30 && b1.width > b0.width + 20,
    `Kästchen in Höhe und Breite gezogen (${Math.round(b0.height)} → ${Math.round(b1.height)} px hoch)`
  )
  // Verschieben
  const sch = await s.locator('[data-kasten-schieben]').last().boundingBox()
  await s.mouse.move(sch.x + sch.width / 2, sch.y + sch.height / 2)
  await s.mouse.down()
  await s.mouse.move(sch.x + sch.width / 2 + 80, sch.y + sch.height / 2 - 20, { steps: 6 })
  await s.mouse.up()
  const b2 = await box.boundingBox()
  pruefe(Math.abs(b2.x - b1.x - 80) < 6 && Math.abs(b2.y - b1.y + 20) < 6, 'Kästchen verschoben')
  // Linie vom unteren Rand des Kästchens zur Achse: rastet an beiden ein
  await s.locator('[data-werkzeug="linie"]').click()
  await s.mouse.move(b2.x + b2.width / 2 + 3, b2.y + b2.height + 4)
  await s.mouse.down()
  await s.mouse.move(b2.x + b2.width / 2 + 10, ac.y + 6, { steps: 8 })
  pruefe(await s.locator('[data-andock-ziel]').isVisible(), 'Andockziel wird beim Ziehen angezeigt')
  await s.screenshot({ path: join(out, '1-andocken.png') })
  await s.mouse.up()
  await s.waitForTimeout(2600)
  const objekteHolen = async () =>
    JSON.parse((await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()).antworten.objekte ?? '[]')
  const obj = await objekteHolen()
  const linie = obj.find((o) => o.t === 'linie')
  const kasten = obj.find((o) => o.t === 'text')
  pruefe(Boolean(linie?.v1 && linie.v1 === kasten?.id), 'Linie hängt am Kästchen')
  pruefe(Boolean(kasten?.h && kasten.h > 40), `Höhe des Kästchens gespeichert (${kasten?.h})`)
  const ende = await s.evaluate(() => {
    const l = [...document.querySelectorAll('[data-objekt-linie] line')].pop()
    return l ? l.getBoundingClientRect().bottom : 0
  })
  pruefe(Math.abs(ende - ac.y) < 4, `Linienende rastet auf der Achse ein (Abweichung ${Math.round(Math.abs(ende - ac.y))} px)`)
  // ---------- 06.10.2026: Jahr an der Linie, jahresgenaues Einrasten mit Blase, Optionsmenü, Lösch-Rückfrage
  pruefe(Boolean(linie?.jahr2) && !linie.jahr1, `Linie kennt das Jahr am Ende auf der Zeitleiste (${linie?.jahr2})`)
  const jahrText = await s
    .locator('[data-objekt-linie] [data-jahr]')
    .first()
    .textContent()
    .catch(() => '')
  const jahrDreh = await s
    .locator('[data-objekt-linie] [data-jahr]')
    .first()
    .getAttribute('transform')
    .catch(() => '')
  pruefe(jahrText === linie?.jahr2 && /rotate\(/.test(jahrDreh ?? ''), `Jahreszahl steht entlang der Linie (${jahrText}, ${jahrDreh})`)
  // Skala der Achse: Pixel je Jahr
  const skala = await s.evaluate(() => {
    const f = document.querySelector('iframe')
    const fr = f.getBoundingClientRect()
    const k = fr.width / f.contentDocument.documentElement.clientWidth
    for (const img of f.contentDocument.querySelectorAll('img.ws-diagram-img')) {
      const src = decodeURIComponent(img.getAttribute('src').split(',').slice(1).join(','))
      const svg = new DOMParser().parseFromString(src, 'image/svg+xml').documentElement
      const l = svg.querySelector('line[data-skala]')
      if (!l) continue
      const vb = svg
        .getAttribute('viewBox')
        .split(/[\s,]+/)
        .map(Number)
      const b = img.getBoundingClientRect()
      const [a, z] = l.getAttribute('data-skala').split('|').map(Number)
      const x1 = fr.left + (b.left + ((+l.getAttribute('x1') - vb[0]) / vb[2]) * b.width) * k
      const x2 = fr.left + (b.left + ((+l.getAttribute('x2') - vb[0]) / vb[2]) * b.width) * k
      return { a, z, x1, x2, proJahr: (x2 - x1) / (z - a) }
    }
    return null
  })
  pruefe(Boolean(skala), `Achse trägt ihre Skala (${skala?.a}–${skala?.z}, ${skala?.proJahr?.toFixed(1)} px je Einheit)`)
  if (skala) {
    await s.locator('[data-werkzeug="linie"]').click()
    await s.mouse.move(ac.x + 200, ac.y - 90)
    await s.mouse.down()
    const xa = skala.x1 + (Math.floor((skala.z - skala.a) / 2) + 0.1) * skala.proJahr
    await s.mouse.move(xa, ac.y + 3, { steps: 6 })
    const j1 = await s.locator('[data-jahr-blase]').getAttribute('data-jahr-blase')
    await s.mouse.move(xa + skala.proJahr, ac.y + 3, { steps: 3 })
    const j2 = await s.locator('[data-jahr-blase]').getAttribute('data-jahr-blase')
    await s.screenshot({ path: join(out, '1b-jahr-blase.png') })
    pruefe(Number.parseInt(j2) - Number.parseInt(j1) === 1, `Jahresgenau: eine Einheit weiter = nächstes Jahr (${j1} → ${j2})`)
    await s.mouse.up()
  }
  // Rechtsklick aufs Kästchen: Optionen
  const kb = await s.locator('[data-kasten]').first().boundingBox()
  await s.mouse.click(kb.x + kb.width / 2, kb.y + kb.height / 2, { button: 'right' })
  pruefe(await da(s.locator('[data-kontextmenue] [data-optionen="text"]'), 4000), 'Rechtsklick aufs Kästchen öffnet die Optionen')
  await s.locator('[data-kontextmenue] [data-farbe="#fef9c3"]').click()
  await s.locator('[data-kontextmenue] [data-linienart] label').nth(1).click()
  await s.locator('[data-kontextmenue] [data-fett]').click()
  await s.screenshot({ path: join(out, '1c-optionen.png') })
  await s.keyboard.press('Escape')
  // Rechtsklick auf die Linie: Pfeil am Ende
  const lm = await s.evaluate(() => {
    const l = [...document.querySelectorAll('[data-objekt-linie] line')].find((x) => x.getAttribute('stroke') !== 'transparent')
    const r = l.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await s.mouse.click(lm.x, lm.y, { button: 'right' })
  pruefe(await da(s.locator('[data-kontextmenue] [data-optionen="linie"]'), 4000), 'Rechtsklick auf die Linie öffnet ihre Optionen')
  await s.locator('[data-kontextmenue] [data-pfeil] label').nth(1).click()
  await s.keyboard.press('Escape')
  await s.waitForTimeout(2600)
  const mitOptionen = await objekteHolen()
  const k2 = mitOptionen.find((o) => o.t === 'text')
  const l3 = mitOptionen.find((o) => o.t === 'linie')
  pruefe(
    k2?.fuellung === '#fef9c3' && k2.linienArt === 'strich' && k2.fett === true,
    `Kästchen: Füllung, gestrichelter Rand, fett gespeichert (${JSON.stringify([k2?.fuellung, k2?.linienArt, k2?.fett])})`
  )
  pruefe(l3?.pfeil === 'ende' && (await s.locator('[data-objekt-linie] polygon').count()) >= 1, 'Linie mit Pfeilspitze')
  // Radierer auf beschriftetes Kästchen: Rückfrage; „Behalten" lässt es stehen
  await s.locator('[data-werkzeug="radierer"]').click()
  await s.locator('[data-kasten]').first().dispatchEvent('pointerdown')
  pruefe(await da(s.locator('.mantine-Modal-content', { hasText: 'Textkästchen löschen?' }), 4000), 'Radierer auf beschriftetes Kästchen: Rückfrage')
  await s.locator('[data-loesch-nein]').click()
  pruefe((await s.locator('[data-kasten]').count()) >= 1, '„Behalten" lässt das Kästchen stehen')
  // Leeres Kästchen: sofort weg
  await s.locator('[data-werkzeug="text"]').click()
  // Rechts neben dem ersten Kästchen – auf Hoch- wie Querseiten im Blatt
  const kb2 = await s.locator('[data-kasten]').first().boundingBox()
  await s.mouse.click(kb2.x + kb2.width + 40, kb2.y + 4)
  const vorLeer = await s.locator('[data-kasten]').count()
  // Seit 19.10.2026 verschwindet ein leeres Kästchen schon beim Verlassen (Werkzeugwechsel) – erst den Fokus abwarten
  await s.waitForTimeout(250)
  await s.locator('[data-werkzeug="radierer"]').click()
  await s.waitForTimeout(300)
  pruefe(
    (await s.locator('[data-kasten]').count()) === vorLeer - 1 && !(await s.locator('[data-loesch-frage]').count()),
    'Leeres Kästchen verschwindet ohne Rückfrage'
  )
  // Werkzeug-Optionen: Rechtsklick auf den Stift
  await s.locator('[data-werkzeug="stift"]').click({ button: 'right' })
  pruefe(await da(s.locator('[data-kontextmenue] [data-optionen="stift"]'), 4000), 'Rechtsklick auf den Stift: Farbe, Linienart, Stärke')
  await s.keyboard.press('Escape')
  // Formen (05.10.2026): aus dem Menü wählen, aufziehen; Radierer entfernt sie wieder
  await s.locator('[data-werkzeug="form"]').click()
  await s.locator('[data-form="kreis"]').click()
  await s.mouse.move(b2.x + 260, b2.y + 40)
  await s.mouse.down()
  await s.mouse.move(b2.x + 340, b2.y + 120, { steps: 6 })
  await s.mouse.up()
  pruefe((await s.locator('[data-objekt-form="kreis"]').count()) === 1, 'Kreis aus dem Formen-Menü aufgezogen')
  await s.waitForTimeout(2600)
  const mitForm = await objekteHolen()
  pruefe(
    mitForm.some((o) => o.t === 'form' && o.f === 'kreis' && o.w === o.h && o.w > 40),
    'Form gespeichert (Kreis, gleich breit wie hoch)'
  )
  await s.locator('[data-werkzeug="radierer"]').click()
  await s.locator('[data-objekt-form="kreis"]').dispatchEvent('pointerdown')
  pruefe((await s.locator('[data-objekt-form="kreis"]').count()) === 0, 'Radierer entfernt die Form')
  // Kästchen verschieben: angehängtes Linienende wandert mit
  await s.locator('[data-werkzeug="tastatur"]').click()
  const sch2 = await s.locator('[data-kasten-schieben]').last().boundingBox()
  await s.mouse.move(sch2.x + sch2.width / 2, sch2.y + sch2.height / 2)
  await s.mouse.down()
  await s.mouse.move(sch2.x + sch2.width / 2 + 60, sch2.y + sch2.height / 2, { steps: 5 })
  await s.mouse.up()
  await s.waitForTimeout(2600)
  const l2 = (await objekteHolen()).find((o) => o.t === 'linie')
  pruefe(
    l2.x > linie.x + 20 && Math.abs(l2.x2 - linie.x2) < 1,
    `Angehängtes Linienende wandert mit, das Ende an der Achse bleibt (${Math.round(linie.x)} → ${Math.round(l2.x)})`
  )
  // Stift-Automatik (26.10.2026, Wunsch der Lehrkraft): ein Stift (pointerType „pen") wählt den Stift von selbst und
  // schreibt schon mit dem ersten Strich – ohne vorher das Werkzeug anzutippen
  await s.locator('[data-werkzeug="tastatur"]').click()
  const zaehlTinte = () =>
    s.locator('[data-tinte]').evaluateAll((cs) =>
      cs.reduce((n, c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let k = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 20) k++
        return n + k
      }, 0)
    )
  const tinteOhneStift = await zaehlTinte()
  const cdpS = await s.context().newCDPSession(s)
  const stift = (type, x, extra = {}) => cdpS.send('Input.dispatchMouseEvent', { type, x, y: ac.y - 60, pointerType: 'pen', ...extra })
  await stift('mousePressed', ac.x + 20, { button: 'left', buttons: 1, clickCount: 1, force: 0.5 })
  for (let i = 1; i <= 6; i++) await stift('mouseMoved', ac.x + 20 + i * 15, { button: 'left', buttons: 1, force: 0.5 })
  await stift('mouseReleased', ac.x + 110, { button: 'left', clickCount: 1 })
  await cdpS.detach()
  await s.waitForTimeout(300)
  pruefe((await s.locator('[data-werkzeug="stift"]').getAttribute('aria-pressed')) === 'true', 'Stift-Automatik: Stift gewählt, sobald ein Stift aufsetzt')
  pruefe((await zaehlTinte()) > tinteOhneStift, 'Stift-Automatik: der erste Strich ist schon Tinte')
  // Stift-Strich, dann radieren – links neben der Verbindungslinie (deren Radier-Fläche fängt sonst den Radierer)
  await s.locator('[data-werkzeug="stift"]').click()
  await s.mouse.move(ac.x + 20, ac.y - 60)
  await s.mouse.down()
  await s.mouse.move(ac.x + 140, ac.y - 60, { steps: 8 })
  await s.mouse.up()
  const tinte = async () =>
    s.locator('[data-tinte]').evaluateAll((cs) =>
      cs.reduce((n, c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let k = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 20) k++
        return n + k
      }, 0)
    )
  const vor = await tinte()
  await s.locator('[data-werkzeug="radierer"]').click()
  await s.mouse.move(ac.x + 10, ac.y - 60)
  await s.mouse.down()
  await s.mouse.move(ac.x + 150, ac.y - 60, { steps: 10 })
  await s.mouse.up()
  const nach = await tinte()
  pruefe(vor > 100 && nach < vor * 0.2, `Radierer entfernt Stift-Striche (${vor} → ${nach} Pixel)`)
  // Radierer auf die Linie: weg
  const lb = await s.locator('[data-radier-linie]').first().boundingBox()
  await s.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2)
  pruefe((await s.locator('[data-objekt-linie]').count()) === 0, 'Radierer entfernt die Verbindungslinie')
  // Textmarker: mehrfach über dieselbe Stelle bleibt durchscheinend
  await s.locator('[data-werkzeug="marker"]').click()
  await s.mouse.move(ac.x + 50, ac.y - 220)
  await s.mouse.down()
  for (let i = 0; i < 6; i++) await s.mouse.move(ac.x + 50 + (i % 2 ? 0 : 150), ac.y - 220, { steps: 6 })
  await s.mouse.up()
  const alpha = await s.locator('[data-tinte]').evaluateAll((cs) => {
    let max = 0
    for (const c of cs) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 4) max = Math.max(max, d[i])
    }
    return max
  })
  pruefe(alpha > 0 && alpha < 120, `Textmarker bleibt durchscheinend (höchste Deckkraft ${alpha}/255)`)
  // KI-Prüfung der Aufgabe mit der Zeitleiste (nur Kästchen, keine Schreibfelder)
  await s.locator('[data-werkzeug="text"]').click()
  // Knapp über der Achse – sicher im Bereich der Aufgabe (im Vollbild ist das Blatt schmaler, die Aufgabenzeile liegt näher an der Achse)
  await s.mouse.click(ac.x + 260, ac.y - 70)
  await s.locator('[data-kaestchen]').last().fill('Julikrise')
  await s.locator('[data-werkzeug="tastatur"]').click()
  const nr = await s.evaluate((y) => {
    let best = null
    for (const k of document.querySelectorAll('[data-aufgabe-pruefen]')) {
      const r = k.getBoundingClientRect()
      if (r.top < y && (!best || r.top > best.top)) best = { top: r.top, nr: k.getAttribute('data-aufgabe-pruefen') }
    }
    return best?.nr
  }, ac.y)
  /*
   * Material mit Zeilennummern geht an die KI – und stimmt mit der gedruckten Nummer 5 überein. Seit 22.10.2026 liest der
   * SERVER das Material aus dem Blatt (das Gerät schickt keins mehr); geprüft wird darum der Auftrag an die KI über das
   * Protokoll der Attrappe (SCHULAPPS_KI_ATTRAPPE).
   */
  const attrappeDatei = process.env.SCHULAPPS_KI_ATTRAPPE ?? ''
  const protokollDatei = attrappeDatei ? join(out, 'ki-protokoll.jsonl') : ''
  if (attrappeDatei) {
    const a0 = JSON.parse(readFileSync(attrappeDatei, 'utf8'))
    writeFileSync(attrappeDatei, JSON.stringify({ ...a0, protokoll: protokollDatei }))
  }
  const fuenf = await s.evaluate(() => {
    const doc = document.querySelector('iframe').contentDocument
    const marke = [...doc.querySelectorAll('.ws-line-numbers span')].find((x) => x.textContent.trim() === '5')
    if (!marke) return null
    const y = marke.getBoundingClientRect().top
    const body = marke.closest('.ws-text-body')
    const w = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    const r = doc.createRange()
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement.closest('.ws-line-numbers')) continue
      for (const m of n.textContent.matchAll(/\S+/g)) {
        r.setStart(n, m.index)
        r.setEnd(n, m.index + m[0].length)
        const b = r.getClientRects()[0]
        if (b && Math.abs(b.top - y) < 6) return m[0]
      }
    }
    return null
  })
  await s.locator(`[data-aufgabe-pruefen="${nr}"]`).click()
  await s.locator('[data-aufgabe-pruefen-los]').click()
  await s.waitForTimeout(4000)
  const kiAuftrag = protokollDatei && existsSync(protokollDatei)
    ? readFileSync(protokollDatei, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).filter((z) => z.schemaName === 'blatt_aufgabe_feedback').pop()
    : null
  const zeile5 = /Z\. 5: (\S+)/.exec(kiAuftrag ? `${kiAuftrag.user} ${kiAuftrag.system}` : '')?.[1]
  pruefe(Boolean(fuenf) && zeile5 === fuenf, `Material mit Zeilennummern an die KI, Z. 5 beginnt mit „${zeile5}" (gedruckt: „${fuenf}")`)
  const fehler = await s.locator('[data-pruef-fehler]').allInnerTexts()
  pruefe(fehler.length === 0 && (await s.getByText('Gelungen').count()) > 0, `KI-Prüfung der Zeitleisten-Aufgabe ${nr} liefert Feedback ${fehler.join(' ')}`)
  await s.screenshot({ path: join(out, '2-zeitleiste.png') })
  // Markierungen aus dem Feedback zur Zeitleiste dürfen nicht in einer anderen Aufgabe auftauchen
  // (kein Esc: im Vollbild beim Lernen beendet Esc die Übung, 09.10.2026 – Klick daneben genügt)
  await s.mouse.click(5, 400)
  const andere = s.locator('textarea[data-feld]').last()
  await andere.scrollIntoViewIfNeeded()
  await andere.click()
  await s.keyboard.type('Die Marne und der Stellungskrieg veraenderte vieles.', { delay: 2 })
  await s.waitForTimeout(800)
  const fremd = await s.locator('[data-rand-kommentar], [data-rand-marke]').count()
  pruefe(fremd === 0, `Kein Randkommentar aus dem Feedback einer anderen Aufgabe (${fremd})`)
  // ---------- Textkästchen bedienen (19.10.2026, Befunde der Lehrkraft) – zuletzt, damit die Lage der übrigen Prüfungen bleibt
  await s.locator('[data-werkzeug="text"]').click()
  // Schmaler ziehen (19.10.2026, Befund der Lehrkraft): das Kästchen wird höher, kein Text verschwindet unten
  await s.locator('[data-kaestchen]').last().fill('Attentat von Sarajevo auf den österreichischen Thronfolger')
  const gs = await s.locator('[data-kasten-groesse]').last().boundingBox()
  await s.mouse.move(gs.x + gs.width / 2, gs.y + gs.height / 2)
  await s.mouse.down()
  await s.mouse.move(gs.x - 120, gs.y + gs.height / 2, { steps: 6 })
  await s.mouse.up()
  await s.waitForTimeout(200)
  const passt = await s.locator('[data-kaestchen]').last().evaluate((t) => t.scrollHeight <= t.clientHeight + 3)
  pruefe(passt, 'Schmaler gezogen: Kästchen wächst mit, der Text bleibt sichtbar')
  // Klick daneben beendet nur das Schreiben – kein zweites Kästchen (19.10.2026)
  await s.locator('[data-kaestchen]').last().focus()
  const vorKlick = await s.locator('[data-kasten]').count()
  const ac2 = await achseSuchen()
  await s.mouse.click(ac2.x + 300, ac2.y + 55)
  await s.waitForTimeout(250)
  pruefe((await s.locator('[data-kasten]').count()) === vorKlick, 'Klick neben das Kästchen beim Schreiben: kein neues Kästchen')
  await s.mouse.click(ac2.x + 300, ac2.y + 55)
  pruefe((await s.locator('[data-kasten]').count()) === vorKlick + 1, 'Nächster Klick setzt ein neues Kästchen')
  await s.waitForTimeout(250)
  await s.waitForTimeout(200)
  await s.mouse.click(ac2.x + 120, ac2.y + 95)
  await s.waitForTimeout(300)
  pruefe((await s.locator('[data-kasten]').count()) === vorKlick, 'Leeres Kästchen verschwindet beim Verlassen')
  // ---------- Bild vergrößern und markieren (25.10.2026) – ganz zuletzt: das Rollen zum Bild verschiebt die Lage der übrigen Prüfungen
  const lupe = s.locator('[data-bild-zoom]').first()
  pruefe(await da(lupe, 10000), 'Lupe am Bild des Blatts')
  await lupe.scrollIntoViewIfNeeded()
  await lupe.click()
  // Das Mantine-Fenster selbst hat keine Ausdehnung – sichtbar ist sein Inhalt
  const voll = s.locator('[data-bild-vollbild]')
  pruefe(await da(voll.locator('[data-bild-schliessen]')), 'Bild bildschirmfüllend mit Werkzeugen')
  await voll.locator('[data-werkzeug="stift"]').click()
  const lw = await voll.locator('[data-tinte]').boundingBox()
  // Das Bild füllt die Breite (1024 px breites iPad): vorher blieb es beim Startmaßstab 0,5 stehen
  pruefe(lw.width > 900, `Bild nutzt die Bildschirmbreite (${Math.round(lw.width)} px)`)
  await s.mouse.move(lw.x + lw.width * 0.3, lw.y + lw.height * 0.3)
  await s.mouse.down()
  await s.mouse.move(lw.x + lw.width * 0.6, lw.y + lw.height * 0.5, { steps: 8 })
  await s.mouse.up()
  await voll.locator('[data-werkzeug="text"]').click()
  await s.mouse.click(lw.x + lw.width * 0.65, lw.y + lw.height * 0.7)
  await voll.locator('[data-kaestchen]').last().fill('Markiert')
  await s.screenshot({ path: join(out, '5-bild-vollbild.png') })
  await voll.locator('[data-bild-schliessen]').click()
  await voll.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined)
  pruefe((await voll.count()) === 0, '„Schließen" beendet das Vollbild')
  await s.waitForTimeout(2600)
  const abgabeBild = await (await sm.request.get(`${A}/s/api/blatt?id=${fr.id}`, { headers: KOPF })).json()
  const bildObjekte = JSON.parse(abgabeBild.antworten.objekte ?? '[]').filter((o) => o.s >= 20)
  const bildTinte = abgabeBild.tinte?.['bild:b0']
  pruefe(
    typeof bildTinte === 'string' && bildTinte.startsWith('data:image/png') && bildObjekte.length === 1,
    `Markierungen am Bild gespeichert (Tinte ${bildTinte ? 'ja' : 'nein'}, ${bildObjekte.length} Kästchen)`
  )
  pruefe((await s.locator('[data-bild-zoom][data-bild-markiert]').count()) === 1, 'Lupe zeigt an, dass das Bild Markierungen trägt')
  // ---------- Zwei-Finger-Zoom am Handy (25.10.2026, Wunsch der Lehrkraft: am Handy an das Blatt heranzoomen) – eigener
  // Handy-Kontext (mobil, Touch), Blattansicht, zwei Finger auseinander per CDP
  const hm = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  await anmelden(hm, mia.benutzer, 'NeuesPasswort-99')
  const h = await hm.newPage()
  await h.goto(`${A}/s/`)
  await h.locator('[data-kachel="blaetter"]').click()
  await h.locator('[data-blatt-oeffnen]').first().click()
  await h.locator('[data-ansicht]').waitFor({ timeout: 20000 })
  pruefe(await h.evaluate(() => document.documentElement.hasAttribute('data-touch')), 'Handy: Touch-Modus an')
  await h.locator('[data-ansicht] label', { hasText: 'Blatt' }).click()
  const zf = h.locator('.zoom-flaeche.blatt-zoom')
  pruefe(await da(zf, 10000), 'Handy, Blattansicht: Fläche mit Zwei-Finger-Zoom')
  await h.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  await h.waitForTimeout(800)
  const zb = await zf.boundingBox()
  const cdp = await hm.newCDPSession(h)
  const mx = zb.x + zb.width / 2
  const my = zb.y + Math.min(200, zb.height / 2)
  const zwei = (d) => [
    { x: mx - d, y: my, id: 1, radiusX: 6, radiusY: 6, force: 1 },
    { x: mx + d, y: my, id: 2, radiusX: 6, radiusY: 6, force: 1 }
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: zwei(30) })
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: zwei(30 + i * 10) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await h.waitForTimeout(400)
  const zoomWert = await zf.evaluate((el) => Number(el.firstElementChild?.style.zoom || 1))
  pruefe(zoomWert > 1.3 && (await zf.getAttribute('data-gezoomt')) !== null, `Zwei Finger auseinander: Blatt vergrößert (Zoom ${zoomWert.toFixed(2)}), Fläche rollt seitwärts`)
  // Noch einmal mit zwei Fingern oben auf dem Blatt (26.10.2026, Befund „zoomt an den Hintergrund"): nach „Breite einpassen" wieder vergrößern;
  // der Inhalt des Blattrahmens zieht mit (rahmenZoomAngleichen – Chromium gibt den Zoom weiter, WebKit bekommt ihn gesetzt)
  // Erst zurück auf „Breite einpassen“ (der erste Zoom stand schon am Anschlag), dann im Rahmen aufziehen
  await h.locator('[data-zoom-einpassen]').first().click()
  await h.waitForTimeout(400)
  const rahmenBox = await h.locator('.zoom-flaeche.blatt-zoom iframe').first().boundingBox()
  const cdp2 = await hm.newCDPSession(h)
  const rx = rahmenBox.x + rahmenBox.width * 0.5
  const ry = rahmenBox.y + rahmenBox.height * 0.08
  const zweiImRahmen = (d) => [
    { x: rx - d, y: ry, id: 1, radiusX: 6, radiusY: 6, force: 1 },
    { x: rx + d, y: ry, id: 2, radiusX: 6, radiusY: 6, force: 1 }
  ]
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: zweiImRahmen(20) })
  for (let i = 1; i <= 10; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: zweiImRahmen(20 + i * 8) })
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp2.detach()
  await h.waitForTimeout(400)
  const zoomWert2 = await zf.evaluate((el) => Number(el.firstElementChild?.style.zoom || 1))
  pruefe(zoomWert2 > 1.3, `Zwei Finger auf dem Blatt: wieder vergrößert (Zoom ${zoomWert2.toFixed(2)})`)
  const rahmenInnen = await h.evaluate(() => {
    const f = document.querySelector('.zoom-flaeche.blatt-zoom iframe')
    return { innen: f?.contentWindow?.innerWidth ?? 0, breite: f?.clientWidth ?? 0, zoomInnen: f?.contentDocument?.documentElement.style.zoom ?? '' }
  })
  pruefe(
    Math.abs(rahmenInnen.innen - rahmenInnen.breite) < 4 || rahmenInnen.zoomInnen !== '',
    `Blattinhalt im Rahmen zieht mit dem Zoom mit (innen ${rahmenInnen.innen}, Breite ${rahmenInnen.breite}, eigener Zoom „${rahmenInnen.zoomInnen}")`
  )
  const breiter = await zf.evaluate((el) => el.scrollWidth > el.clientWidth + 10)
  pruefe(breiter, 'Gezoomtes Blatt ist breiter als der Bildschirm und lässt sich seitwärts rollen')
  await h.screenshot({ path: join(out, '6-handy-zoom.png') })
  // Zurück auf 100 % über den Prozent-Knopf
  await h.locator('[data-zoom-wert]').first().click()
  await h.waitForTimeout(300)
  pruefe((await zf.evaluate((el) => Number(el.firstElementChild?.style.zoom || 1))) === 1, 'Prozent-Knopf setzt den Zoom zurück')
  await hm.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
} finally {
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
