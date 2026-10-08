// Digitale Unterrichtsreihe (08.10.2026, Plan „Unterrichtsreihe" G.2/G.3/G.5/G.6, E.2/E.6):
//  - Lehrkraft: Platzhalter „Zwischenaufgabe" in einer DIGITALEN Reihe entsteht über die Arbeitsblatt-Pipeline als vollwertiges
//    Blatt (Rolle bleibt, Erfolg = KI), Anfrage verlangt Erklärung mit Beispiel + Hilfekarten (selbstständig am Gerät);
//  - Lernende am HANDY: Blatt ausfüllen, KI-Feedback je Aufgabe und nach dem Einreichen (Attrappe), Schritt automatisch
//    geschafft; Selbsteinschätzung mit KI-Impuls; Abschlussprodukt mit KI-Vorschlag (nur die Lehrkraft sieht Punkte),
//    geschafft ohne Lehrkraft; Materialien und „Meine Abgaben"; Hefter als Seite mit PDF; nichts ragt seitlich über;
//  - Lehrkraft: KI-Vorschlag im Handlungsbedarf und in der Detailansicht, übernehmen und bestätigen.
//  - Einreichen (08.10.2026): ✓/✗ an Ankreuzen und Lücke ohne KI, Hinweis je offener Aufgabe aus EINER Anfrage
//    („blatt_abgabe_aufgaben", Attrappe), „Weiter: <nächster Schritt>" führt zum nächsten offenen Schritt.
// Vorher: Server lokal mit KI-Attrappe (SCHULAPPS_KI_ATTRAPPE; Grundantworten „rueckmeldung_bogen", „blatt_aufgabe_feedback"
// wie für server-reihe.mjs). Der Test trägt seine übrigen Antworten selbst ein und stellt die Datei danach wieder her.
// Eigene Konten, am Ende samt Daten gelöscht. Vorlage für Fach/Thema: jüngstes echtes Arbeitsblatt (nur gelesen).
// Aufruf: node tests/e2e/server-reihe-digital.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-reihe-digital')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8d${Date.now() % 1000}`
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => w.payload?.meta?.subjectId)
const meta = vorlage.payload.meta

// ---------- Attrappe ergänzen (und am Ende wiederherstellen)
const attrappePfad = process.env.SCHULAPPS_KI_ATTRAPPE ?? join(process.env.TEMP ?? '', 'attrappe.json')
const attrappeAlt = readFileSync(attrappePfad, 'utf8')
const attrappe = JSON.parse(attrappeAlt)
const protokoll = join(out, 'ki-protokoll.jsonl')
writeFileSync(protokoll, '')
const leer = { kind: 'none', lines: 0, gapText: '', options: [], correctIndex: -1, pairs: [], items: [], rows: [], statements: [], labels: [] }
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: '',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
const IMPULS = 'Du hast genau benannt, was schwer war. Welche Ursache könntest du morgen noch einmal mit einem Beispiel erklären?'
const HINWEIS = 'Eine Ursache passt schon – nenne noch eine zweite aus dem Merkkasten.'
attrappe.protokoll = protokoll
attrappe.antworten = {
  ...attrappe.antworten,
  worksheet_outline: {
    title: 'Einführung: Ursachen',
    learningGoals: ['Ich kann Ursachen nennen.'],
    minutes: 20,
    teacherNote: '',
    items: [
      { type: 'text', purpose: 'Merkkasten mit Beispiel', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
      { type: 'task', purpose: 'Informationen entnehmen', afb: 'I', operator: 'nennen', socialForm: 'EA', stars: 0, answerKind: 'lines' },
      { type: 'task', purpose: 'Ursache erkennen', afb: 'I', operator: 'ankreuzen', socialForm: 'EA', stars: 0, answerKind: 'multipleChoice' },
      { type: 'task', purpose: 'Fachbegriff einsetzen', afb: 'I', operator: 'ergänzen', socialForm: 'EA', stars: 0, answerKind: 'gapText' }
    ]
  },
  worksheet: {
    blocks: [
      baustein({ type: 'text', title: 'Merke', body: 'Eine Ursache ist ein Grund für ein Ereignis.\n\nBeispiel: Der Regen ist die Ursache für den nassen Boden.' }),
      baustein({
        outlineIndex: 1,
        instruction: '**Nenne** zwei Ursachen aus dem Text.',
        operator: 'nennen',
        afb: 'I',
        solution: 'zwei Ursachen',
        answer: { ...leer, kind: 'lines', lines: 3 }
      }),
      // Feste Lösungen (08.10.2026): beim Einreichen ohne KI geprüft
      baustein({
        outlineIndex: 2,
        instruction: '**Kreuze an:** Was ist die Ursache für den nassen Boden?',
        operator: 'ankreuzen',
        afb: 'I',
        solution: 'Regen',
        answer: { ...leer, kind: 'multipleChoice', options: ['Regen', 'Sonne', 'Schnee'], correct: [0] }
      }),
      baustein({
        outlineIndex: 3,
        instruction: '**Ergänze** die Lücke.',
        operator: 'ergänzen',
        afb: 'I',
        solution: 'nass',
        answer: { ...leer, kind: 'gapText', gapText: 'Durch den Regen wird der Boden [[nass]].' }
      })
    ]
  },
  worksheet_review: { problems: [] },
  // Einreichen: Hinweis je offener Aufgabe (Aufgabe 1 – Ankreuzen und Lücke prüft der Server selbst)
  blatt_abgabe_aufgaben: { aufgaben: [{ nr: 1, einschaetzung: 'teilweise', hinweis: HINWEIS }] },
  reihe_reflexion_impuls: { impuls: IMPULS },
  reihe_abschluss_vorschlag: {
    kriterien: [
      { kriterium: 'Inhalt', punkte: 3, begruendung: 'Beide Ursachen sind genannt.' },
      { kriterium: 'Gestaltung', punkte: 2, begruendung: 'Übersichtlich, Überschrift fehlt.' }
    ],
    gesamt: 'Solides Plakat; nächster Schritt: Überschrift ergänzen.'
  }
}
writeFileSync(attrappePfad, JSON.stringify(attrappe, null, 2))
const anfragen = () =>
  (existsSync(protokoll) ? readFileSync(protokoll, 'utf8') : '')
    .split('\n')
    .filter(Boolean)
    .map((z) => JSON.parse(z))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const ueberstand = (seite) => seite.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Dora Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Nele Probe' } })
  ).json()
  const nele = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === nele.benutzer) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, {
      headers: KOPF,
      data: { name: KLASSE, fach: meta.subjectLabel, iservGruppe: `klasse:${KLASSE}` }
    })
  ).json()
  const ziel = { text: 'Ursachen nennen', ichKann: 'Ich kann Ursachen nennen.' }
  const basis = {
    id: '',
    titel: 'Digitale Reihe Probe',
    art: 'digital',
    fachId: meta.subjectId,
    fachLabel: meta.subjectLabel,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: meta.grade || 8,
    oberthema: meta.topic || 'Ursachen',
    lernziele: [ziel],
    schritte: [
      {
        id: 'sa',
        titel: 'Einführung: Ursachen',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        minuten: 20,
        platzhalter: { beschreibung: 'Ursachen erklären und an einem Text anwenden' },
        inhalt: { art: 'aufgabe', anweisung: '', material: '', link: '', fragen: [], antwort: 'text', erwartung: '', feedback: true }
      },
      { id: 'sh', titel: 'Merkkasten: Ursachen', lernziele: [], rolle: 'pflicht', erfolg: { art: 'abgabe' }, nach: 'sa', inhalt: { art: 'hefter', text: 'Ursache = Grund.' } },
      { id: 'sr', titel: 'Wie sicher bist du?', lernziele: [], rolle: 'pflicht', erfolg: { art: 'abgabe' }, inhalt: { art: 'reflexion', frage: 'Was war schwer?' } },
      {
        id: 'sp',
        titel: 'Plakat zu den Ursachen',
        lernziele: [],
        rolle: 'pflicht',
        // ausdrücklich „Lehrkraft bestätigt" – in digitalen Reihen nicht nötig (Plan G.5)
        erfolg: { art: 'lehrkraft' },
        inhalt: { art: 'abschluss', anweisung: 'Gestalte ein Plakat zu den Ursachen.', raster: ['Inhalt', 'Gestaltung'] }
      }
    ]
  }
  const gesp = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: basis } })).json()
  pruefe(Boolean(gesp.id), 'Digitale Reihe gespeichert')

  // ---------- Lehrkraft: Platzhalter „Zwischenaufgabe" entsteht als Arbeitsblatt
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await p.mouse.move(800, 700)
  await p.locator('[data-reihe-karte="Digitale Reihe Probe"] [data-reihe-oeffnen]').click()
  await p.locator('[data-reihe-editor]').waitFor({ timeout: 15000 })
  const karte = p.locator('[data-schritt]').filter({ hasText: 'Einführung: Ursachen' })
  await karte.locator('[data-platzhalter-erstellen]').click()
  await karte.locator('[data-ki-status="fertig"]').waitFor({ timeout: 120000 })
  await p.screenshot({ path: join(out, '1-blatt-erstellt.png'), fullPage: true })
  const roh = (await (await lk.request.get(`${A}/server/reihen/${gesp.id}`, { headers: KOPF })).json()).reihe
  const blattSchritt = roh.schritte.find((x) => x.id === 'sa')
  pruefe(
    blattSchritt?.inhalt?.art === 'arbeitsblatt' && blattSchritt.inhalt.zweck === 'einfuehrung' && Boolean(blattSchritt.inhalt.quelle) && !blattSchritt.platzhalter,
    `Zwischenaufgabe wurde zum Arbeitsblatt (Art ${blattSchritt?.inhalt?.art}, Rolle ${blattSchritt?.inhalt?.zweck})`
  )
  pruefe(blattSchritt?.erfolg?.art === 'ki', `Erfolg des Blatts: KI-Einschätzung (${JSON.stringify(blattSchritt?.erfolg)})`)
  pruefe((blattSchritt?.inhalt?.aufgaben ?? []).length >= 1 && /ws-page/.test(blattSchritt?.inhalt?.html ?? ''), 'Schülerfassung mit Aufgaben gemessen')
  const outline = anfragen().find((a) => a.schemaName === 'worksheet_outline')
  pruefe(
    Boolean(outline) && outline.user.includes('SELBSTSTÄNDIG AM GERÄT') && outline.user.includes('EINFÜHRUNG'),
    'Blatt-Anfrage verlangt Erklärung mit Beispiel und Hilfekarten (selbstständig am Gerät) und die Rolle „Einführung"'
  )
  pruefe(!anfragen().some((a) => a.schemaName === 'reihe_schritt_aufgabe'), 'Kein Einzel-Auftrag „Zwischenaufgabe" – der Weg geht über die Arbeitsblatt-Pipeline')

  // Zuweisen
  const z = await (await lk.request.post(`${A}/server/reihen/${gesp.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: gruppe.id } })).json()
  const zid = z.id
  pruefe(Boolean(zid), 'Digitale Reihe der Lerngruppe zugewiesen')

  // ---------- Nele am Handy
  const sm = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await anmelden(sm, nele.benutzer, nele.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: nele.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  s.on('dialog', (d) => void d.accept())
  const status = async () => {
    await s.goto(`${A}/s/r/${zid}`)
    await s.locator('[data-station]').first().waitFor()
    return s.locator('[data-station]').evaluateAll((e) => e.map((x) => x.getAttribute('data-station')))
  }
  let st = await status()
  pruefe(st[0] === 'offen', `Weg am Handy: ${st.join(', ')}`)
  pruefe((await s.locator('[data-reihe-digital]').count()) === 1, 'Hinweis „alles am Gerät, geschafft nach Ergebnis"')
  pruefe((await ueberstand(s)) <= 1, `Weg: nichts ragt seitlich über (${await ueberstand(s)} px)`)
  await s.screenshot({ path: join(out, '2-handy-weg.png'), fullPage: true })
  // Blatt öffnen (die Station führt direkt hinein) und bearbeiten
  await s.locator('[data-station]').first().click()
  // Am Handy öffnet das Blatt als Liste je Aufgabe (das Blatt selbst bleibt unsichtbar zum Messen da)
  await s.locator('[data-blatt-liste] [data-listen-feld]').first().waitFor({ timeout: 20000 })
  pruefe(await s.locator('[data-zur-reihe]').isVisible(), 'Blatt am Handy mit „Zur Unterrichtsreihe"')
  await s.locator('[data-blatt-liste] input[data-listen-feld]:not([type=checkbox]), [data-blatt-liste] textarea[data-listen-feld]').first().fill('Der Regen und der Wind.')
  await s.waitForTimeout(800)
  const pruefKnopf = s.locator('[data-blatt-liste] [data-listen-pruefen]').first()
  if (await pruefKnopf.isVisible().catch(() => false)) {
    const breit = await pruefKnopf.evaluate((e) => {
      const l = e.querySelector('.mantine-Button-label') ?? e
      return l.scrollWidth <= l.clientWidth + 1
    })
    pruefe(breit, 'Knopf „Prüfen" in der Liste nicht abgeschnitten')
    await pruefKnopf.click()
    pruefe(
      await s
        .locator('[data-aufgaben-feedback]')
        .first()
        .waitFor({ timeout: 30000 })
        .then(
          () => true,
          () => false
        ),
      'KI-Feedback zu einer Aufgabe am Handy'
    )
  } else pruefe(false, 'Knopf „Feedback zu Aufgabe" am Handy sichtbar')
  // Ankreuzen (falsch: „Sonne") und Lücke (richtig: „nass") – prüft der Server beim Einreichen ohne KI
  await s.locator('[data-blatt-liste] label', { hasText: 'Sonne' }).first().click()
  await s
    .locator('[data-blatt-liste] .mantine-Card-root', { hasText: 'Aufgabe 3' })
    .locator('input[data-listen-feld]:not([type=checkbox])')
    .first()
    .fill('nass')
  await s.waitForTimeout(500)
  await s.locator('[data-blatt-einreichen]').click()
  pruefe(
    await s
      .locator('[data-blatt-bogen]')
      .waitFor({ timeout: 90000 })
      .then(
        () => true,
        () => false
      ),
    'Nach dem Einreichen: KI-Bogen am Handy'
  )
  await s.screenshot({ path: join(out, '3-handy-blatt.png'), fullPage: true })
  // Alles auf einmal: ✓/✗ an den Feldern, Hinweis an der offenen Aufgabe, Übersicht je Aufgabe
  pruefe((await s.locator('[data-blatt-liste] [data-pruef-marke="f"]').count()) === 1, 'Falsches Kreuz mit ✗ markiert (ohne KI)')
  pruefe((await s.locator('[data-blatt-liste] [data-pruef-marke="r"]').count()) === 1, 'Richtige Lücke mit ✓ markiert (ohne KI)')
  const offeneHinweis = await s
    .locator('[data-blatt-liste] .mantine-Card-root', { hasText: 'Aufgabe 1' })
    .locator('[data-abgabe-feedback]')
    .innerText()
    .catch(() => '')
  pruefe(offeneHinweis.includes('zweite aus dem Merkkasten'), 'Hinweis der KI direkt an der offenen Aufgabe')
  pruefe(
    (await s.locator('[data-abgabe-ergebnis] [data-abgabe-aufgabe="2"][data-einschaetzung="noch nicht"]').count()) === 1 &&
      (await s.locator('[data-abgabe-ergebnis] [data-abgabe-aufgabe="3"][data-einschaetzung="sicher"]').count()) === 1,
    'Übersicht nach dem Einreichen: Ankreuzen „noch nicht", Lücke „sicher"'
  )
  const abgabeAnfragen = anfragen().filter((a) => a.schemaName === 'blatt_abgabe_aufgaben')
  pruefe(
    abgabeAnfragen.length === 1 &&
      abgabeAnfragen[0].user.includes('AUFGABE 1') &&
      !abgabeAnfragen[0].user.includes('AUFGABE 2') &&
      !abgabeAnfragen[0].user.includes('AUFGABE 3') &&
      !/Nele|Probe/.test(abgabeAnfragen[0].user),
    'Eine KI-Anfrage nur für die offene Aufgabe, ohne Namen'
  )
  pruefe(
    anfragen().some((a) => a.schemaName === 'rueckmeldung_bogen' && /angekreuzt: .*Sonne/.test(a.user ?? '')),
    'Bogen-Anfrage nennt die angekreuzte Möglichkeit statt „Kästchen n"'
  )
  // Weiter zum nächsten offenen Schritt (Hefter zählt nicht – die Selbsteinschätzung ist dran)
  const weiter = s.locator('[data-reihe-weiter-karte] [data-reihe-weiter]')
  pruefe(
    await weiter
      .waitFor({ timeout: 20000 })
      .then(
        () => true,
        () => false
      ),
    '„Weiter: …" nach dem Einreichen'
  )
  pruefe((await s.locator('[data-reihe-weiter-karte] [data-schritt-geschafft]').count()) === 1, 'Schritt als „Geschafft" gekennzeichnet')
  pruefe((await ueberstand(s)) <= 1, `Blatt nach dem Einreichen: nichts ragt seitlich über (${await ueberstand(s)} px)`)
  await weiter.click()
  pruefe(
    await s.waitForURL(`**/s/r/${zid}/sr`, { timeout: 15000 }).then(
      () => true,
      () => false
    ),
    `„Weiter" führt zum nächsten Schritt (${s.url()})`
  )
  st = await status()
  pruefe((await s.locator('[data-weiter-mit] [data-reihe-weiter="sr"]').count()) === 1, 'Weg: „Weiter mit: Wie sicher bist du?" oben')
  pruefe(st[0] === 'geschafft', `Blatt automatisch geschafft – ohne Lehrkraft (${st.join(', ')})`)

  // Hefter als Seite mit PDF
  pruefe(await s.locator('[data-hefter-knopf]').isVisible(), 'Hefter-Eintrag nach dem Blatt freigeschaltet')
  await s.locator('[data-hefter-knopf]').click()
  await s.locator('[data-hefter-seite]').waitFor()
  // Mantine legt die leere Modal-Wurzel auch für geschlossene Fenster an – nur ein offenes Fenster hat Inhalt
  pruefe(s.url().endsWith(`/s/r/${zid}/hefter`) && (await s.locator('.mantine-Modal-content').count()) === 0, 'Hefter als eigene Seite, kein Fenster')
  const dl = s.waitForEvent('download', { timeout: 60000 }).catch(() => null)
  await s.locator('[data-hefter-pdf]').click()
  const datei = await dl
  pruefe(Boolean(datei && datei.suggestedFilename().endsWith('.pdf')), `Hefter als PDF (${datei?.suggestedFilename() ?? 'kein Download'})`)

  // Selbsteinschätzung mit KI-Impuls (Ampel untereinander)
  await s.goto(`${A}/s/r/${zid}/sr`)
  await s.locator('[data-reflexion]').waitFor()
  const senkrecht = await s
    .locator('[data-reflexion] .mantine-SegmentedControl-root')
    .first()
    .evaluate((e) => e.getAttribute('data-orientation') === 'vertical' || e.className.includes('vertical') || e.offsetHeight > 70)
  pruefe(senkrecht, 'Ampel am Handy untereinander')
  const gruen = s.locator('[data-reflexion] label', { hasText: 'sicher' })
  for (let i = 0; i < (await gruen.count()); i++) await gruen.nth(i).click()
  await s.locator('[data-reflexion] textarea').fill('Schwer war, die zweite Ursache zu finden.')
  await s.locator('[data-reflexion-abgeben]').click()
  const impuls = await s
    .locator('[data-reflexion-impuls]')
    .innerText({ timeout: 60000 })
    .catch(() => '')
  pruefe(impuls.includes('Welche Ursache'), 'KI-Impuls zum Lerntagebuch erscheint')
  const imp = anfragen().filter((a) => a.schemaName === 'reihe_reflexion_impuls')
  pruefe(imp.length === 1 && !/Nele|Probe/.test(imp[0].user + imp[0].system), 'Impuls-Anfrage ohne Namen')
  await s.screenshot({ path: join(out, '4-handy-reflexion.png'), fullPage: true })

  // Abschlussprodukt: geschafft nach dem KI-Vorschlag, Punkte nur für die Lehrkraft
  await sm.request.post(`${A}/s/api/reihe/schritt`, { headers: KOPF, data: { id: zid, schritt: 'sp', aktion: 'datei', name: 'plakat.png', daten: PNG } })
  await s.goto(`${A}/s/r/${zid}/sp`)
  await s.locator('[data-reihe-antwort]').fill('Mein Plakat nennt Regen und Wind als Ursachen. – Nele')
  await s.locator('[data-reihe-abgeben]').click()
  await s.waitForTimeout(500)
  await s.locator('[data-reihe-abgeben]').waitFor({ state: 'detached', timeout: 90000 }).catch(() => undefined)
  st = await status()
  pruefe(st[3] === 'geschafft', `Abschlussprodukt geschafft nach dem KI-Vorschlag, ohne Lehrkraft (${st.join(', ')})`)
  const vorschlagAnfrage = anfragen().find((a) => a.schemaName === 'reihe_abschluss_vorschlag')
  pruefe(
    Boolean(vorschlagAnfrage) && vorschlagAnfrage.bilder === 1 && !/Nele/.test(vorschlagAnfrage.user),
    'Vorschlag-Anfrage mit Foto, eigener Name ersetzt'
  )
  const sicht = JSON.stringify(await (await sm.request.get(`${A}/s/api/reihe?id=${zid}`, { headers: KOPF })).json())
  pruefe(!sicht.includes('kiVorschlag') && !sicht.includes('Beide Ursachen sind genannt'), 'Lernende sehen den KI-Vorschlag nicht')

  // Materialien und Abgaben
  await s.goto(`${A}/s/r/${zid}`)
  await s.locator('[data-materialien-knopf]').click()
  await s.locator('[data-materialien]').waitFor({ timeout: 15000 })
  pruefe((await s.locator('[data-material="sa"] [data-material-oeffnen]').count()) === 1, 'Materialien: das Blatt der Reihe mit „Öffnen/Ansehen"')
  pruefe((await ueberstand(s)) <= 1, 'Materialien: nichts ragt seitlich über')
  await s.locator('[data-material-reiter]').getByText('Meine Abgaben').click()
  await s.locator('[data-abgaben]').waitFor()
  const arten = await s.locator('[data-abgabe]').evaluateAll((e) => e.map((x) => x.getAttribute('data-abgabe')))
  pruefe(['arbeitsblatt', 'reflexion', 'abschluss'].every((a) => arten.includes(a)), `Meine Abgaben: ${arten.join(', ')}`)
  pruefe((await s.locator('[data-abgabe="arbeitsblatt"] [data-abgabe-feedback]').count()) === 1, 'Abgabe des Blatts mit Rückmeldung')
  await s.screenshot({ path: join(out, '5-handy-abgaben.png'), fullPage: true })
  // Fachordner
  const regal = await (await sm.request.get(`${A}/s/api/reihen/materialien`, { headers: KOPF })).json()
  const imOrdner = (regal.reihen ?? []).find((x) => x.zid === zid)
  pruefe(Boolean(imOrdner) && imOrdner.materialien.some((m) => m.schritt === 'sa' && m.link), 'Fachordner: Blatt der Reihe unter „Materialien"')
  await s.goto(`${A}/s/ordner/${encodeURIComponent(meta.subjectLabel)}?r=mat`)
  const ordnerBlatt = await s
    .locator('[data-ordner-reihe-blatt]')
    .first()
    .waitFor({ timeout: 15000 })
    .then(
      () => true,
      () => false
    )
  pruefe(ordnerBlatt, 'Fachordner zeigt das Blatt der Reihe')
  await s.screenshot({ path: join(out, '6-handy-ordner.png'), fullPage: true })

  // ---------- Lehrkraft: KI-Vorschlag ansehen, übernehmen, bestätigen
  const lz = await (await lk.request.get(`${A}/server/reihen/z/${zid}`, { headers: KOPF })).json()
  const vor = lz.lernende?.[0]?.stand?.schritte?.sp?.kiVorschlag
  pruefe(vor?.kriterien?.length === 2 && vor.kriterien[0].punkte === 3, `Lehrkraft sieht den KI-Vorschlag (${vor?.kriterien?.map((k) => `${k.kriterium} ${k.punkte}/${k.max}`).join(', ')})`)
  pruefe((lz.bedarf ?? []).some((b) => b.art === 'vorschlag' && /5 von 6 Punkten/.test(b.text)), 'Handlungsbedarf: KI-Vorschlag mit Summe')
  pruefe(!(lz.bedarf ?? []).some((b) => b.art === 'bewerten'), 'Keine Pflicht-Bestätigung in der digitalen Reihe')
  pruefe(lz.lernende?.[0]?.stand?.schritte?.sr?.impuls?.text === IMPULS, 'Lehrkraft sieht den Impuls zum Lerntagebuch')
  await p.locator('[data-reihe-editor] button', { hasText: 'Alle Reihen' }).click()
  await p.locator('[data-zuweisung-oeffnen]').first().click()
  await p.locator('[data-reihe-uebersicht]').waitFor()
  await p.locator('[data-bedarf-ansehen]').first().click()
  await p.locator('[data-ki-vorschlag]').waitFor({ timeout: 10000 })
  await p.locator('[data-vorschlag-uebernehmen]').click()
  await p.screenshot({ path: join(out, '7-lehrkraft-vorschlag.png') })
  await p.locator('[data-bewerten-geschafft]').click()
  await p.waitForTimeout(800)
  const danach = await (await sm.request.get(`${A}/s/api/reihe?id=${zid}`, { headers: KOPF })).json()
  pruefe(/5 von 6 Punkten/.test(danach.stand?.schritte?.sp?.bewertung?.text ?? ''), 'Bestätigte Bewertung erreicht die Lernenden')
  const fertig = await (await sm.request.get(`${A}/s/api/reihe?id=${zid}`, { headers: KOPF })).json()
  pruefe(fertig.weg?.fertig === true, `Reihe vollständig geschafft (${Math.round((fertig.weg?.fortschritt ?? 0) * 100)} %)`)
  await lk.request.post(`${A}/server/reihen/${gesp.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 8).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  writeFileSync(attrappePfad, attrappeAlt)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
