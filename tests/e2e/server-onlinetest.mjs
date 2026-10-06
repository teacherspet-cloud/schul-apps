// Onlinetest auf dem Schul-Apps-Server – Lehrkraft und zwei Lernende (Gäste), KI-Attrappe (02.10.2026).
// Vorher: Server lokal mit SCHULAPPS_KI_ATTRAPPE starten (Antwort „onlinetest_bewertung" hinterlegt:
// { urteile: [{ id: 'A1', richtig: true, … }] }). IServ NICHT eingerichtet (Beitritt mit Namen).
// Aufruf: node tests/e2e/server-onlinetest.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft (zweite Runde, abgestimmt 02.10.2026):
//  - QR-Link ohne Anmeldung → Namenseingabe (nicht die Anmeldeseite); doppelter Name abgelehnt
//  - Wartebildschirm mit Figur bis zum gemeinsamen Start durch die Lehrkraft; keine Lösungen am Gerät
//  - Abgabe selbst und durch Verlassen der Seite; danach wertet die KI automatisch aus
//  - falsches Wort → „zu entscheiden" (0 Punkte), Lehrkraft akzeptiert → Punkt
//  - Ergebnis erscheint erst, wenn alle abgegeben haben – vorläufig, mit Lösungen; danach endgültig
//  - Word partners: Lehrkraft sieht „a) heatwave", keine interne Kennung
//  - Oberfläche: Testliste mit Sortier-/Filterknöpfen, Namensliste zugeklappt, Namen ausblendbar,
//    Export-Menü, kein Knopf ohne Funktion neben „Test beenden"
//  - zum Schluss alle Konten (Lehrkraft, Gäste) samt Daten gelöscht
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-onlinetest')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
// Winzige Figur (1×1 PNG)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const TEST = {
  version: 1,
  header: {
    title: 'Vocabulary Test',
    showName: true,
    showDate: true,
    showClass: false,
    showSchool: false,
    schoolName: '',
    showVariant: true,
    showPoints: true,
    showGrade: true,
    subtitle: '',
    ueberthema: 'Unit 1'
  },
  settings: {
    targetLanguage: 'en',
    level: 'A2',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 7,
    vocabCount: 2,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: 'Weather',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  },
  vocab: [],
  variants: [
    {
      id: 'A',
      label: 'A',
      blocks: [
        {
          id: 'g',
          kind: 'gap',
          taskType: 'gapSentences',
          title: 'Gaps',
          instruction: 'Fill in the gaps.',
          pointsPerItem: 1,
          wordBank: false,
          firstLetterHint: true,
          extraBankWords: [],
          items: [
            { id: 'g1', sentences: [{ before: 'I go to', after: 'every day.' }], answer: 'school' },
            { id: 'g2', sentences: [{ before: 'My', after: 'is called Rex.' }], answer: 'dog' }
          ]
        },
        {
          id: 'm',
          kind: 'match',
          taskType: 'wordPartners',
          title: 'Word partners',
          instruction: 'Match.',
          pointsPerItem: 1,
          leftLabel: 'Words',
          rightLabel: 'Partners',
          left: [{ id: 'l1', text: 'heat', answerId: 'r1x9q' }],
          right: [
            { id: 'r1x9q', text: 'heatwave' },
            { id: 'r2k7p', text: 'storm' }
          ]
        },
        {
          id: 'o',
          kind: 'open',
          taskType: 'mediation',
          title: 'Say it in English',
          instruction: 'Express the sentence in English. Use the word in brackets.',
          pointsPerItem: 2,
          items: [{ id: 'o1', prompt: 'Neue Schüler integrieren sich leichter. (to integrate)', modelAnswer: 'New students integrate more easily.', lines: 2 }]
        }
      ]
    }
  ],
  fontSize: 12,
  createdAt: new Date().toISOString()
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const warteBis = async (fn, ms = 30000) => {
  const ende = Date.now() + ms
  for (;;) {
    const r = await fn()
    if (r || Date.now() > ende) return r
    await new Promise((x) => setTimeout(x, 700))
  }
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)

  // ---------- Lehrkraft: Lerngruppe und Test (mit Figur)
  const lk = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '7a', fach: 'Englisch' } })).json()
  const neu = await (
    await lk.request.post(`${A}/server/onlinetest/erstellen`, {
      headers: KOPF,
      data: { titel: 'Vocabulary Test', thema: 'Unit 1 – Weather', test: TEST, lerngruppeId: gruppe.id, zeitMin: 10, figur: { winkend: PNG, jubelnd: PNG } }
    })
  ).json()
  const detail = async () => (await lk.request.get(`${A}/server/onlinetest/${neu.id}`, { headers: KOPF })).json()
  pruefe((await detail()).status === 'wartend', `Onlinetest angelegt (Code ${neu.code}) und wartet auf den Start`)

  // ---------- Zwei Lernende am „iPad", ohne Konto
  const geraet = async () => (await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })).newPage()
  const s1 = await geraet()
  await s1.goto(neu.link)
  await s1.locator('[data-gastname]').waitFor({ timeout: 15000 })
  pruefe(!s1.url().includes('/anmelden'), 'QR-Link ohne Anmeldung → Namenseingabe statt Anmeldeseite')
  await s1.locator('[data-gastname]').fill('kim t')
  await s1.getByRole('button', { name: 'Weiter' }).click()
  await s1.locator('[data-wartebildschirm]').waitFor({ timeout: 15000 })
  pruefe(await s1.getByText('Gleich geht es los, Kim T.!').isVisible(), 'Wartebildschirm mit sauber geschriebenem Namen („Kim T.")')
  pruefe(await s1.locator('[data-figur="winkend"]').isVisible(), 'Figur auf dem Wartebildschirm')
  await s1.screenshot({ path: join(out, '1-warten.png') })
  const s2 = await geraet()
  await s2.goto(neu.link)
  await s2.locator('[data-gastname]').fill('Kim T.')
  await s2.getByRole('button', { name: 'Weiter' }).click()
  await s2.getByText('schreibt diesen Test schon').waitFor({ timeout: 10000 })
  pruefe(true, 'gleicher Name ein zweites Mal → Hinweis auf einen zweiten Buchstaben')
  await s2.locator('[data-gastname]').fill('Kim Ta.')
  await s2.getByRole('button', { name: 'Weiter' }).click()
  await s2.locator('[data-wartebildschirm]').waitFor({ timeout: 15000 })
  // Am PC (Maus, kein Touch): nur dort prüft die Seite den Fensterfokus (03.10.2026 – am Handy schlug die Prüfung fälschlich an)
  const s3 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await s3.goto(neu.link)
  await s3.locator('[data-gastname]').fill('Ole F.')
  await s3.getByRole('button', { name: 'Weiter' }).click()
  await s3.locator('[data-wartebildschirm]').waitFor({ timeout: 15000 })
  let d = await detail()
  pruefe(d.teilnahmen.length === 3 && d.teilnahmen.every((t) => t.beginn === 0), 'Lehrkraft sieht drei Wartende')
  const vorStart = await s1.evaluate(
    async (code) =>
      JSON.stringify(
        await (
          await fetch('/s/api/beitreten', {
            method: 'POST',
            headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
            body: JSON.stringify({ code })
          })
        ).json()
      ),
    neu.code
  )
  pruefe(!vorStart.includes('Fill in the gaps'), 'vor dem Start keine Aufgaben am Gerät')

  // ---------- Gemeinsamer Start
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'starten' } })
  await s1.getByText('Fill in the gaps.').waitFor({ timeout: 10000 })
  await s2.getByText('Fill in the gaps.').waitFor({ timeout: 10000 })
  pruefe(true, 'nach dem Start der Lehrkraft erscheint der Test auf beiden Geräten')
  // Anderes Fenster daneben: Die Seite bleibt sichtbar, verliert aber den Fokus
  await s3.getByText('Fill in the gaps.').waitFor({ timeout: 10000 })
  // Seit 06.10.2026: Fokus weg → protokolliert (mit Dauer), nicht abgegeben; am PC Vollbild Pflicht
  const lage = await s3.evaluate(() => ({
    pc: matchMedia('(pointer: fine)').matches && navigator.maxTouchPoints === 0,
    voll: Boolean(document.fullscreenElement)
  }))
  console.log('PC-LAGE', JSON.stringify(lage))
  if (lage.pc && !lage.voll) {
    pruefe(await da(s3.locator('[data-fenster-sperre]'), 5000), 'PC ohne Vollbild: Sperre verdeckt den Test')
    await s3.locator('[data-fenster-sperre] [data-vollbild]').click()
    await s3.waitForTimeout(1500)
    pruefe(
      !(await s3.locator('[data-fenster-sperre]').isVisible()),
      `Vollbild eingeschaltet → Sperre weg (${await s3.evaluate(() => Boolean(document.fullscreenElement))})`
    )
  }
  await s3.evaluate(() => window.dispatchEvent(new Event('blur')))
  await s3.waitForTimeout(2200)
  await s3.evaluate(() => window.dispatchEvent(new Event('focus')))
  const ole = await warteBis(async () => {
    const x = (await detail()).teilnahmen.find((t) => t.name === 'Ole F.')
    return x?.vorfaelle?.some((v) => v.art === 'fokus' && v.dauer >= 2) ? x : null
  }, 10000)
  pruefe(
    Boolean(ole) && !ole.abgabe && !(await s3.getByText('automatisch abgegeben').count()),
    `anderes Fenster (Fokus weg) → protokolliert mit Dauer, nicht abgegeben (${JSON.stringify(ole?.vorfaelle)})`
  )
  s3.once('dialog', (dlg) => void dlg.accept())
  await s3.getByRole('button', { name: 'Abgeben' }).click()
  await s3.locator('[data-ergebnis-wartet], [data-ergebnis]').first().waitFor({ timeout: 10000 })
  const ole2 = (await detail()).teilnahmen.find((t) => t.name === 'Ole F.')
  pruefe(!ole2?.vorfaelle?.some((v) => v.art === 'fokus' && v.dauer === undefined), 'Eigene Rückfrage beim Abgeben ist kein Vorfall')
  const quelltext = await s1.evaluate(
    async (code) =>
      JSON.stringify(
        await (
          await fetch('/s/api/beitreten', {
            method: 'POST',
            headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
            body: JSON.stringify({ code })
          })
        ).json()
      ),
    neu.code
  )
  pruefe(
    !quelltext.includes('school') && !quelltext.includes('integrate more easily') && !quelltext.includes('"answer"') && !quelltext.includes('answerId'),
    'Das Gerät bekommt keine Lösungen'
  )
  // Strenger (06.10.2026): keine Lösung bei ihrem eigenen Feld (Lückensatz, Hinweis, Wortliste, Anfangsbuchstabe …)
  {
    const schueler = JSON.parse(quelltext)
    const dd = await detail()
    const variante =
      dd.fassungen.find((x) => JSON.stringify(x.aufgaben.map((a) => a.id)) === JSON.stringify(schueler.aufgaben.map((a) => a.id))) ?? dd.fassungen[0]
    const lecks = []
    let geprueft = 0
    for (const a of schueler.aufgaben ?? [])
      for (const e of a.eintraege ?? [])
        for (const f of e.felder ?? [])
          for (const w of variante.loesungen?.[f.id]?.werte ?? []) {
            if (String(w).trim().length < 3) continue
            geprueft++
            const umgebung = JSON.stringify({
              vor: e.vor,
              nach: e.nach,
              text: e.text,
              saetze: e.saetze,
              woerter: e.woerter,
              hinweis: e.hinweis,
              anfang: f.anfang
            })
            const woerter = ` ${umgebung.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ')} `
            const gesucht = ` ${String(w)
              .toLowerCase()
              .replace(/[^\p{L}\p{N}']+/gu, ' ')
              .trim()} `
            if (woerter.includes(gesucht)) lecks.push(`${f.id}: ${w}`)
          }
    console.log('LÖSUNGEN GEPRÜFT', geprueft, 'Lecks:', JSON.stringify(lecks.slice(0, 8)))
    pruefe(geprueft > 0 && lecks.length === 0, `Keine Lösung steht bei ihrem eigenen Feld (${lecks.length} von ${geprueft})`)
  }
  const felder = s1.locator('input:not([type=radio]):not([type=hidden]), textarea')
  await felder.nth(0).fill('school')
  await felder.nth(1).fill('dgo')
  await s1
    .locator('select')
    .first()
    .selectOption({ label: 'a) heatwave' })
    .catch(async () => s1.getByLabel('a) heatwave').check())
  await felder.nth(2).fill('New pupils integrate more easily.')
  await s1.waitForTimeout(2600)
  await s1.screenshot({ path: join(out, '2-test.png') })
  s1.once('dialog', (dlg) => void dlg.accept())
  await s1.getByRole('button', { name: 'Abgeben' }).click()
  await s1.locator('[data-ergebnis-wartet]').waitFor({ timeout: 10000 })
  pruefe(true, 'abgegeben – Ergebnis wartet, bis alle abgegeben haben')
  // Zweite Person verlässt die Seite (z. B. iPad ausgeschaltet) – seit 06.10.2026 nur protokolliert, nicht abgegeben
  if (await s2.locator('[data-fenster-sperre]').isVisible()) await s2.locator('[data-fenster-sperre] [data-vollbild]').click()
  await s2.waitForTimeout(1200)
  pruefe(!(await s2.locator('[data-fenster-sperre]').isVisible()), 'PC: Test läuft im Vollbild (keine Sperre)')
  await s2.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await s2.waitForTimeout(1500)
  await s2.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  // Kopieren und Seitenübersetzung (Chrome setzt eine Klasse an <html>)
  await s2.evaluate(() => {
    document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true }))
    document.documentElement.classList.add('translated-ltr')
  })
  const markierbar = await s2.evaluate(() => getComputedStyle(document.querySelector('[data-onlinetest-blatt]')).userSelect)
  pruefe(markierbar === 'none', `Aufgabentext nicht markierbar (user-select: ${markierbar})`)
  const ben = await warteBis(async () => {
    const x = (await detail()).teilnahmen.find((t) => t.name !== 'Kim T.')
    const arten = (x?.vorfaelle ?? []).map((v) => v.art)
    return arten.includes('verlassen') && arten.includes('kopieren') && arten.includes('uebersetzt') ? x : null
  }, 15000)
  pruefe(
    Boolean(ben) && !ben.abgabe,
    `Seite verlassen → protokolliert, nicht abgegeben (${JSON.stringify(ben?.vorfaelle?.map((v) => [v.art, v.dauer, v.info]))})`
  )
  pruefe(ben?.vorfaelle?.find((v) => v.art === 'verlassen')?.dauer >= 1, 'Verlassen mit Dauer, ein Eintrag')
  await s2.evaluate(() => document.documentElement.classList.remove('translated-ltr'))
  s2.once('dialog', (dlg) => void dlg.accept())
  await s2.getByRole('button', { name: 'Abgeben' }).click()
  await s2.locator('[data-ergebnis-wartet], [data-ergebnis]').first().waitFor({ timeout: 10000 })
  pruefe(true, 'Zweite Person gibt danach selbst ab')

  // ---------- KI wertet automatisch aus
  d = await warteBis(async () => {
    const x = await detail()
    return !x.ki.laeuft && x.teilnahmen.every((t) => t.abgabe) && x.teilnahmen.some((t) => t.zuEntscheiden > 0) ? x : null
  }, 40000)
  const kim = d?.teilnahmen.find((t) => t.name === 'Kim T.')
  pruefe(Boolean(kim), 'KI hat nach der Abgabe von selbst ausgewertet')
  pruefe(kim?.zuEntscheiden === 1 && kim.offen === 0, `„dgo" statt „dog": zu entscheiden (${kim?.zuEntscheiden}), nichts mehr offen (${kim?.offen})`)
  pruefe(kim?.punkte === 4 && kim.max === 5, `Punkte bis zur Entscheidung: ${kim?.punkte}/${kim?.max} (school, heatwave, Satz 2 P.)`)

  // ---------- Ergebnis am Gerät: vorläufig, mit Lösung
  await s1.locator('[data-ergebnis]').waitFor({ timeout: 15000 })
  pruefe(await s1.getByText('Vorläufig').isVisible(), 'Ergebnis erscheint, sobald alle abgegeben haben – als vorläufig')
  pruefe(await s1.getByText('→ dog').isVisible(), 'Ergebnis zeigt die richtige Lösung')
  pruefe(await s1.locator('[data-figur="jubelnd"]').isVisible(), 'jubelnde Figur beim Ergebnis')
  await s1.screenshot({ path: join(out, '3-ergebnis.png'), fullPage: true })

  // ---------- Lehrkraft entscheidet
  // Im Pop-up „Zu entscheiden", gebündelt nach Fehlerart (06.10.2026)
  {
    const p0 = await lk.newPage()
    await p0.goto(A)
    await p0.waitForTimeout(2500)
    const sp = p0.getByRole('button', { name: 'Später einrichten' })
    if (await sp.isVisible().catch(() => false)) await sp.click()
    await p0
      .getByRole('button', { name: /Onlinetest/ })
      .first()
      .click()
    await p0.locator('[data-testliste]').waitFor({ timeout: 10000 })
    await p0.locator('[data-testliste] tbody tr').first().click()
    await p0.locator('[data-zu-entscheiden]').click()
    const modal = p0.locator('.mantine-Modal-content', { hasText: 'Zu entscheiden' })
    await modal.waitFor({ timeout: 8000 })
    const gruppen = await modal
      .locator('[data-fehlergruppe]')
      .evaluateAll((e) => e.map((x) => [x.getAttribute('data-fehlergruppe'), x.querySelector('[data-fehlerart]')?.getAttribute('data-fehlerart')]))
    console.log('GRUPPEN', JSON.stringify(gruppen))
    pruefe(gruppen.length >= 1 && gruppen[0][0] === 'rechtschreibung', `„dgo" statt „dog" unter Rechtschreibung gebündelt (${JSON.stringify(gruppen)})`)
    await p0.screenshot({ path: join(out, '3b-entscheiden.png') })
    // „Im Test ansehen": Blatt der Abgabe, Stelle wie mit Textmarker, direkt entscheiden
    await modal.locator('[data-im-test-ansehen]').first().click()
    const blattModal = p0.locator('.mantine-Modal-content', { hasText: 'im Test' })
    await blattModal.locator('.vt-fokus').first().waitFor({ timeout: 8000 })
    const markiert = await blattModal.locator('.vt-fokus').first().textContent()
    pruefe(/dgo/.test(markiert ?? '') && (markiert ?? '').length < 260, `Im Test: nur die Stelle hervorgehoben („${(markiert ?? '').trim().slice(0, 80)}")`)
    pruefe(await blattModal.locator('[data-fokus-entscheiden]').isVisible(), 'Im Test: ✓/✗ direkt an der Stelle')
    await p0.screenshot({ path: join(out, '3c-im-test.png') })
    await blattModal.locator('[data-fokus-ja]').click()
    await warteBis(async () => ((await detail()).teilnahmen.find((t) => t.id === kim.id).punkte === 5 ? true : null), 10000)
    await p0.close()
  }
  d = await detail()
  pruefe(d.teilnahmen.find((t) => t.id === kim.id).punkte === 5, 'akzeptiert → ganzer Punkt (5/5)')
  await s1.getByText('Vorläufig').waitFor({ state: 'detached', timeout: 15000 })
  pruefe(await s1.getByText('5 / 5 Punkte').isVisible(), 'am Gerät endgültig: 5 / 5 Punkte')

  // ---------- Oberfläche der Lehrkraft
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await p
    .getByRole('button', { name: /Onlinetest/ })
    .first()
    .click()
  await p.locator('[data-testliste]').waitFor({ timeout: 10000 })
  pruefe(await p.getByText('Unit 1 – Weather').first().isVisible(), 'Testliste: Thema statt „Vocabulary Test"')
  pruefe((await p.locator('[data-filter]').count()) === 6, 'Testliste: Filter- und Sortierknöpfe an allen sechs Spalten')
  await p.locator('[data-filter="name"]').click()
  await p.getByLabel('Test enthält').fill('gibt es nicht')
  pruefe(await p.getByText('Kein Test passt zum Filter.').isVisible(), 'Filter wirkt')
  await p.keyboard.press('Escape')
  pruefe(await p.locator('[data-aktive-filter]').isVisible(), 'aktiver Filter steht über der Tabelle')
  await p.getByRole('button', { name: 'Filter zurücksetzen' }).click()
  await p.locator('[data-testliste] tbody tr').first().click()
  await p.locator('[data-namensliste-knopf]').waitFor({ timeout: 10000 })
  pruefe(!(await p.getByText('Kim T.').isVisible()), 'Namensliste ist zugeklappt (Tafel)')
  pruefe((await p.getByRole('button', { name: 'Neu laden' }).count()) === 0, 'kein Knopf ohne Funktion neben „Test beenden"')
  await p.locator('[data-namensliste-knopf]').click()
  await p.getByText('Kim T.').first().waitFor({ timeout: 5000 })
  await p.locator('[data-namen-verdecken]').click()
  pruefe((await p.getByText('Kim T.').count()) === 0 && (await p.getByText('Person 1').isVisible()), 'Namen ausgeblendet → „Person 1"')
  await p.getByText('Person 1').click()
  await p.getByText('a) heatwave').first().waitFor({ timeout: 5000 })
  pruefe((await p.getByText('r1x9q').count()) === 0, 'Word partners: Lehrkraft sieht „a) heatwave", keine interne Kennung')
  await p.screenshot({ path: join(out, '4-durchsicht.png') })
  // Abgabe als DIN-A4-Blatt
  await p.locator('[data-als-blatt]').click()
  await p.locator('[data-abgabe-blatt] .vt-page').first().waitFor({ timeout: 10000 })
  const blatt = await p.locator('[data-abgabe-blatt]').innerText()
  pruefe(blatt.includes('school') && blatt.includes('dgo'), 'Als Blatt: die Eingaben stehen in den Lücken')
  pruefe(
    (await p.locator('[data-abgabe-blatt] .vt-marke-ok').count()) > 0 &&
      (await p.locator('[data-abgabe-blatt] .vt-marke-falsch, [data-abgabe-blatt] .vt-marke-ok').count()) >= 2,
    'Haken grün, Kreuze rot markiert'
  )
  pruefe(!blatt.includes('Lösung'), 'Kopf ohne „Lösung“, mit Name und Punkten')
  await p.screenshot({ path: join(out, '4b-als-blatt.png') })
  await p.keyboard.press('Escape')
  await p.locator('[data-namen-verdecken]').click()
  // Nach dem Ende des Tests: Bewertung lässt sich weiter ändern
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'beendet' } })
  const kimId = (await detail()).teilnahmen.find((t) => t.name === 'Kim T.').id
  const g1 = (await detail()).fassungen[0].einheiten.find((e) => e.id.includes('g1'))
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/korrektur`, { headers: KOPF, data: { teilnahme: kimId, einheit: g1.id, richtig: false } })
  pruefe((await detail()).teilnahmen.find((t) => t.id === kimId).punkte === 4, 'nach „Test beenden“ noch änderbar (5 → 4 Punkte)')
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/korrektur`, { headers: KOPF, data: { teilnahme: kimId, einheit: g1.id, richtig: true } })
  pruefe(await p.locator('[data-export]').isEnabled(), 'Export-Menü (PDF, Excel, Word, Drucken, TeacherTool) bereit')
  await p.locator('[data-export]').click()
  pruefe(
    await p
      .getByText('Abschreibliste drucken')
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false
      ),
    'TeacherTool-Abschreibliste im Menü'
  )
  await p.screenshot({ path: join(out, '5-lehrkraft.png') })
  for (const [eintrag, endung] of [
    ['Excel (.xlsx)', '.xlsx'],
    ['PDF', '.pdf'],
    ['CSV für neuen Kurs (Vorname, Name, Klasse)', '.csv']
  ]) {
    if (
      !(await p
        .getByRole('menuitem', { name: eintrag })
        .isVisible()
        .catch(() => false))
    )
      await p.locator('[data-export]').click()
    const [datei] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('menuitem', { name: eintrag, exact: true }).click()])
    const pfad = join(out, `export${endung}`)
    await datei.saveAs(pfad)
    const { statSync, readFileSync } = await import('fs')
    const kopf = readFileSync(pfad).subarray(0, 4).toString('latin1')
    const passt = endung === '.xlsx' ? kopf.startsWith('PK') : endung === '.pdf' ? kopf === '%PDF' : readFileSync(pfad, 'utf8').includes('Vorname;Name;Klasse')
    pruefe(statSync(pfad).size > 30 && passt, `Export ${endung}: ${datei.suggestedFilename()} (${statSync(pfad).size} Bytes)`)
  }
  // ---------- Liste (06.10.2026): Suche im Kopf, eigenes Fenster, beendete Tests ausblenden
  await p.keyboard.press('Escape')
  await p.getByText('← Alle Tests').click()
  await p.locator('[data-testliste]').waitFor({ timeout: 10000 })
  const zeilen = () => p.locator('[data-testliste] tbody tr').count()
  const alle = await zeilen()
  await p.locator('[data-app-suche="liste"]').fill('gibt-es-nicht-xyz')
  pruefe((await zeilen()) === 0 && (await p.getByText('Kein Test passt zum Filter.').isVisible()), 'Suchfeld im Kopf filtert die Tests')
  await p.locator('[data-app-suche="liste"]').fill('')
  pruefe((await p.locator('[data-test-fenster]').count()) === alle, 'Symbol „In eigenem Fenster öffnen" an jedem Test')
  pruefe(await p.locator('[data-alte-ausblenden]').isVisible(), 'Knopf „Alte Tests ausblenden" oben rechts')
  await p.locator('[data-alte-ausblenden]').click()
  await p
    .locator('[data-aelter-als]')
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => undefined)
  pruefe((await p.locator('[data-aelter-als]').count()) === 4, 'Auswahl 1, 3, 6, 12 Monate')
  await p.screenshot({ path: join(out, '6a-alte.png') })
  await p.keyboard.press('Escape')
  await p.locator('[data-test-ausblenden="aus"]').first().click()
  await p.waitForTimeout(1200)
  pruefe((await zeilen()) === alle - 1, `Beendeter Test ausgeblendet (${alle} → ${await zeilen()})`)
  await p.locator('[data-reiter-ausgeblendet]').click()
  await p.waitForTimeout(1200)
  pruefe((await p.locator('[data-test-ausblenden="ein"]').count()) === 1, 'Reiter „Ausgeblendete Tests" zeigt ihn – mit „Wieder einblenden"')
  await p.screenshot({ path: join(out, '6-ausgeblendet.png') })
  await p.locator('[data-test-ausblenden="ein"]').first().click()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Gäste dieses Laufs und die Lehrkraft samt Daten löschen
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({ nutzer: [] }))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast') zuLoeschen.push(n.id)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
