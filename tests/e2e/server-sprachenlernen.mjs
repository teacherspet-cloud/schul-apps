// Sprachenlernen (08.10.2026, im Plan-Modus abgestimmt): eine App statt Vokabel- und Grammatiktraining (Kurs je Gruppe),
// Überführung alter Grammatiktrainings in Kurse, Grammatik-Tabelle mit Bearbeiten-Fenster, Stärken/Schwächen je Kind,
// Förderaufgaben per KI (Attrappe) → Entwurf prüfen → nur für das Kind freischalten, Grammatikseite der Lernenden nach
// Regeln, Startkarte, passende Spiele (Signalwort-Sortierer aus dem Lehrwerk-Stand), Lehrwerk-Stand in „Meine Klassen".
// Vorher: Server lokal mit KI-Attrappe (grammatik_pool). Es wird keine echte KI gebraucht.
// Aufruf: node tests/e2e/server-sprachenlernen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus, kursKaestenAuf, kursReiter } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-sprachenlernen')
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
const WOERTER = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const PAKET = {
  thema: 'Simple past',
  regeln: [
    { id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes mit -ed oder unregelmäßiger Form.', beispiele: ['I played.', 'She went.'] },
    { id: 'r2', titel: 'Verneinung mit didn’t', erklaerung: 'didn’t + Grundform.', beispiele: ['I didn’t play.'] }
  ],
  aufgaben: [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `a${i + 1}`,
      art: 'auswahl',
      regelId: 'r1',
      anweisung: 'Wähle die richtige Form.',
      satz: `Yesterday I ___ (play ${i}).`,
      optionen: ['played', 'play', 'plays'],
      loesungen: ['played']
    })),
    ...['go', 'see', 'eat'].map((v, i) => ({
      id: `b${i + 1}`,
      art: 'luecke',
      regelId: 'r2',
      anweisung: 'Verneine.',
      satz: `I ___ ${v} yesterday.`,
      vorgabe: '(not)',
      loesungen: ['didn’t', 'did not']
    }))
  ]
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
const kurse = []
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Sina S' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const get = async (pfad) => (await lk.request.get(`${A}${pfad}`, { headers: KOPF })).json()

  // ---------- Altes Grammatiktraining ohne Kurs → wird beim Laden der Kursliste zum Kurs ohne Vokabeln
  const alt = await post('/server/grammatik/freigeben', {
    titel: 'Altes Training',
    fach: 'Englisch',
    sprache: 'en',
    thema: 'Simple past',
    paket: PAKET,
    gaeste: true
  })
  const liste1 = (await get('/server/vokabeln')).zuweisungen
  const altKurs = liste1.find((k) => k.titel === 'Altes Training')
  pruefe(
    Boolean(altKurs && altKurs.woerter === 0 && altKurs.grammatik === 1),
    `Altes Grammatiktraining wurde Kurs ohne Vokabeln (${JSON.stringify(altKurs && { w: altKurs.woerter, g: altKurs.grammatik })})`
  )
  if (altKurs) kurse.push(altKurs.id)
  const g0 = (await get('/server/grammatik')).zuweisungen.find((g) => g.id === alt.id)
  pruefe(g0?.vokId === altKurs?.id, 'Grammatik hängt am neuen Kurs')

  // ---------- Kurs mit Vokabeln (Green Line 1, Unit 3) und zwei eingetragenen Lernenden, Grammatik dazu
  const kurs = (
    await post('/server/vokabeln/freigeben', {
      titel: 'Green Line 1 - Unit 3',
      sprache: 'en',
      fach: 'Englisch',
      woerter: WOERTER,
      gaeste: true,
      quelle: { lehrwerk: 'green-line-1', unit: 'Unit 3', abschnitte: ['Station 1'] }
    })
  ).id
  kurse.push(kurs)
  const eing = (await post(`/server/vokabeln/${kurs}/eintragen`, { namen: ['Ben S.', 'Tom K.'] })).eingetragen
  const code = Object.fromEntries(eing.map((e) => [e.name, e.zugang]))
  const gram = (
    await post('/server/grammatik/freigeben', { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: kurs })
  ).id
  pruefe(Boolean(gram), 'Grammatik für den Kurs freigegeben')

  // Lernende melden sich mit ihrem Code an; Ben antwortet bei „Simple past" falsch, Tom alles richtig
  const lern = async (name) => {
    const c = await browser.newContext({ viewport: { width: 420, height: 900 } })
    await c.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: code[name] } })
    return c
  }
  const ben = await lern('Ben S.')
  const tom = await lern('Tom K.')
  const antwort = (c, aufgabeId, a) => c.request.post(`${A}/s/api/grammatik/antwort`, { headers: KOPF, data: { id: gram, aufgabeId, antwort: a } })
  for (let i = 1; i <= 6; i++) await antwort(ben, `a${i}`, 'play')
  for (let i = 1; i <= 8; i++) await antwort(tom, `a${i}`, 'played')
  for (let i = 1; i <= 3; i++) await antwort(tom, `b${i}`, 'didn’t')

  // ---------- Lehrkraft: nur „Sprachenlernen" in der Leiste, Kurs mit Grammatik-Tabelle und Stärken/Schwächen
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  pruefe(await da(p.locator('.app-leiste [aria-label="Sprachenlernen"]')), 'Leiste: „Sprachenlernen"')
  pruefe(
    (await p.locator('.app-leiste [aria-label="Vokabeltraining"], .app-leiste [aria-label="Grammatiktraining"]').count()) === 0,
    'Leiste ohne Vokabel- und Grammatiktraining'
  )
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.screenshot({ path: join(out, '1-uebersicht.png') })
  await p.locator(`[data-vokabel-zuweisung="${kurs}"]`).click()
  await kursKaestenAuf(p)
  pruefe(await da(p.locator(`[data-grammatik-zeile="${gram}"]`)), 'Grammatik-Tabelle im Kurs')
  // Kopf + Reiter (09.10.2026): Kennzahlen im Kopf, Überblick mit Handlungsbedarf
  pruefe(await da(p.locator('[data-kurs-kopf] [data-kennzahl="aktiv"]')), 'Kopf: „aktiv diese Woche"')
  await p.locator('[data-kurs-kopf] [data-kennzahl="bedarf"]').click()
  pruefe(await da(p.locator('[data-kurs-bedarf]')), 'Klick auf „Handlungsbedarf" öffnet den Überblick')
  // Units je Band (09.10.2026): neuester Band oben, Cover bzw. Kachel links
  pruefe(await da(p.locator('[data-kurs-units] [data-band-gruppe="Green Line 1"]')), 'Überblick: Units unter „Green Line 1" (mit Cover)')
  // Grammatik-Hinweise führen in den Reiter „Grammatik" (09.10.2026, Befund der Lehrkraft), nie zur Vokabeltabelle
  pruefe(
    (await p.locator('[data-kurs-bedarf] [data-kurs-hinweis="foerdern"]:not([data-ziel-reiter="grammatik"]), [data-kurs-bedarf] [data-kurs-hinweis="entwurf"]:not([data-ziel-reiter="grammatik"])').count()) === 0,
    'Grammatik-Hinweise zielen auf den Reiter „Grammatik"'
  )
  const gramHinweis = p.locator('[data-kurs-bedarf] [data-ziel-reiter="grammatik"]').first()
  if (await gramHinweis.count()) {
    await gramHinweis.click()
    pruefe(await da(p.locator('[data-kurs-reiter="grammatik"][data-active]')), 'Grammatik-Hinweis öffnet den Reiter „Grammatik"')
    pruefe(await da(p.locator('[data-kurs-grammatik]')), 'Grammatik-Hinweis zeigt die Grammatik-Liste')
    // Genau eine betroffene Person (09.10.2026, kursFokus.ts): deren Grammatik-Details öffnen sich gleich – wieder schließen
    const details = p.getByRole('dialog', { name: /^Grammatik – / })
    if (await details.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
      await p.keyboard.press('Escape')
      await details.waitFor({ state: 'hidden', timeout: 5000 })
    }
  }
  // Spontane Gruppe (QR-Code): „Kurs beenden" und „Kurs löschen" bleiben
  await kursReiter(p, 'einstellungen')
  pruefe(
    (await p.locator('[data-kurs-einstellungen] [data-kurs-loeschen]').count()) === 1 && (await p.locator('[data-kurs-einstellungen] [data-vokabel-status]').count()) === 1,
    'Spontane Gruppe: „Kurs beenden" und „Kurs löschen" vorhanden'
  )
  await kursReiter(p, 'lernende')
  // Reiter „Lernende" nur mit Vokabeln (08.10.2026): keine Grammatik-Spalte, kein Fördern/Fordern
  pruefe((await p.locator('[data-lernende-tabelle] [data-foerdern]').count()) === 0, 'Reiter „Lernende" ohne Fördern/Fordern')
  // Reiter „Grammatik": Name | Details | Fördern | Fordern, Empfehlung mit Grund („1 Schwäche")
  await p.locator('[data-lernende-ansicht]').getByText('Grammatik', { exact: true }).click()
  const benProfil = p.locator('[data-grammatik-profil="Ben S."]')
  pruefe(await da(benProfil.locator('[data-schwaechen*="Simple past"]')), 'Ben: Schwäche „Simple past" als Hinweis unter „Fördern"')
  pruefe(await da(benProfil.locator('[data-foerdern="Ben S."][data-empfohlen]')), 'Ben: „Fördern" hervorgehoben')
  pruefe((await p.locator('[data-grammatik-profil="Tom K."] [data-schwaechen]').count()) === 0, 'Tom: keine Schwäche')
  pruefe(await p.locator('[data-fordern="Ben S."]').isDisabled(), 'Ben: „Fordern" ohne Stärken gesperrt')
  // Reiter „Übersicht" (Lernende × Regeln) entfällt – seine Angaben stehen in den Details (08.10.2026)
  pruefe((await p.locator('[data-lernende-ansicht]').getByText('Übersicht', { exact: true }).count()) === 0, 'Kein Reiter „Übersicht" mehr')
  // Details: Kompetenzprofil (Kacheln je Bereich), „Braucht Aufmerksamkeit", „Alle Formen" zugeklappt
  await p.locator('[data-grammatik-details="Ben S."]').click()
  pruefe(await da(p.locator('[data-lernende-details="Ben S."] [data-details-filter="schwaeche"]', { hasText: 'Schwäche 1' })), 'Details: „Schwäche 1"')
  pruefe(
    await da(p.locator('[data-lernende-details="Ben S."] [data-kompetenzprofil] [data-profil-kachel][data-kachel-ampel="schwaeche"]').first()),
    'Kompetenzprofil: rote Kachel für Bens Schwäche'
  )
  pruefe(
    await da(p.locator('[data-lernende-details="Ben S."] [data-aufmerksamkeit] [data-ampel="schwaeche"]', { hasText: 'Simple past' })),
    'Braucht Aufmerksamkeit: die Schwäche mit Fehlern, Regel rot'
  )
  pruefe(await da(p.locator('[data-lernende-details="Ben S."] [data-aufmerksamkeit] [data-regel-extra^="foerder:"]').first()), 'Ben: „Fördern" je Form in den Details')
  pruefe((await p.locator('[data-lernende-details="Ben S."] [data-alle-formen] [data-regel-zeile]').count()) === 0, '„Alle Formen" ist zugeklappt')
  // Klick auf die Kachel öffnet „Alle Formen" mit der Zeile der Form
  await p.locator('[data-lernende-details="Ben S."] [data-profil-kachel][data-kachel-ampel="schwaeche"]').first().click()
  pruefe(await da(p.locator('[data-lernende-details="Ben S."] [data-alle-formen] [data-regel-zeile][data-ampel="schwaeche"]').first()), 'Kachel öffnet die Zeile der Form')
  await p.locator('[data-details-ansicht]').getByText('nach Lehrwerk-Units').click()
  pruefe(await da(p.locator('[data-lernende-details="Ben S."] [data-details-gruppe]').first()), 'Details nach Lehrwerk-Units')
  await p.locator('[data-details-ansicht]').getByText('nach Bereichen').click()
  await p.screenshot({ path: join(out, '2-kurs.png'), fullPage: true })
  await p.keyboard.press('Escape')

  // ---------- Fördern → KI (Attrappe) im Hintergrund → Entwurf in der Tabelle → prüfen → nur für Ben freischalten
  await p.locator('[data-foerdern="Ben S."]').click()
  await kursReiter(p, 'grammatik')
  pruefe(await da(p.locator('[data-grammatik-entwurf]'), 40000), 'Entwurf „Förderung" erscheint in der Grammatik-Tabelle')
  await p.locator('[data-grammatik-entwurf]').first().click()
  pruefe(await da(p.locator('[data-entwurf-fenster]')), 'Prüf-Fenster mit Aufgaben')
  await p.locator('[data-aufgabe-bearbeiten]').first().click()
  await p.locator('[data-feld-satz]').first().fill('Last week I ___ (visit) my aunt.')
  await p.locator('[data-feld-loesung]').first().fill('visited')
  await p.screenshot({ path: join(out, '3-entwurf.png') })
  await p.locator('[data-entwurf-freigeben]').click()
  await p.waitForTimeout(1500)
  const benListe = (await (await ben.request.get(`${A}/s/api/grammatik`, { headers: KOPF })).json()).listen
  const tomListe = (await (await tom.request.get(`${A}/s/api/grammatik`, { headers: KOPF })).json()).listen
  const extra = benListe.find((x) => x.extra)
  pruefe(Boolean(extra?.titel.startsWith('Extra für dich')), `Ben sieht „Extra für dich" (${extra?.titel})`)
  pruefe(!tomListe.some((x) => x.extra), 'Tom sieht die Extra-Aufgaben nicht')
  pruefe(benListe[0]?.extra === true, 'Extra steht oben')
  const extraDaten = await (await ben.request.get(`${A}/s/api/grammatik/liste?id=${extra?.id}`, { headers: KOPF })).json()
  pruefe(
    extraDaten.paket?.aufgaben?.some((a) => a.satz === 'Last week I ___ (visit) my aunt.'),
    'Die Bearbeitung im Prüf-Fenster ist freigegeben'
  )
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${kurs}"]`).click()
  await kursReiter(p, 'lernende')
  await p.locator('[data-lernende-ansicht]').getByText('Grammatik', { exact: true }).click()
  pruefe(await da(p.locator('[data-grammatik-profil="Ben S."] [data-extra-stand]')), 'Ben: Plakette „Förderung läuft"')
  await kursReiter(p, 'grammatik')

  // ---------- Grammatik-Fenster: Aufgabe bearbeiten → Lernende sehen die Änderung
  await p.locator(`[data-grammatik-zeile="${gram}"]`).click()
  pruefe(await da(p.locator('[data-grammatik-fenster]')), 'Grammatik-Fenster öffnet')
  await p.locator('[data-aufgabe-bearbeiten="b1"]').click()
  await p.locator('[data-aufgabe-felder="b1"] [data-feld-satz]').fill('We ___ go to school last Sunday.')
  await p.locator('[data-grammatik-speichern]').click()
  await p.waitForTimeout(1200)
  await p.screenshot({ path: join(out, '4-fenster.png') })
  const tomDaten = await (await tom.request.get(`${A}/s/api/grammatik/liste?id=${gram}`, { headers: KOPF })).json()
  pruefe(
    tomDaten.paket.aufgaben.find((a) => a.id === 'b1')?.satz === 'We ___ go to school last Sunday.',
    'Bearbeitete Aufgabe bei den Lernenden, Kennung gleich'
  )
  pruefe(Boolean(tomDaten.staende?.b1?.versuche), 'Lernstand der bearbeiteten Aufgabe bleibt erhalten')
  await p.keyboard.press('Escape')

  // ---------- „Als Schüler ansehen" im Kurskopf (09.10.2026): spontane Gruppe → Fenster gleich auf dem Kurs
  const alsSchueler = p.locator('[data-kurs-kopf] [data-als-schueler]')
  pruefe(await da(alsSchueler), 'Kurskopf: Knopf „Als Schüler ansehen"')
  await alsSchueler.click()
  await p.locator('[data-vorschau-wahl="fleissig"]').click()
  const [vorschauFenster] = await Promise.all([lk.waitForEvent('page', { timeout: 15000 }), p.locator('[data-vorschau-oeffnen]').click()])
  await vorschauFenster.waitForURL(/\/vorschau\?vs=/, { timeout: 15000 })
  const vorschauZiel = new URL(vorschauFenster.url()).searchParams.get('ziel')
  pruefe(vorschauZiel === `/s/v/${kurs}`, `Vorschaufenster mit Ziel /s/v/<Kurs> (${vorschauZiel})`)
  pruefe(await da(vorschauFenster.frameLocator('#ansicht').locator('[data-vokabel-kasten]'), 25000), 'Vorschau zeigt den Kurs (Vokabelkasten) als Musterschüler')
  const rahmenIch = await vorschauFenster.frame({ url: /\/s\/v\// })?.evaluate(() => window.__schulappsServer)
  pruefe(rahmenIch?.quelle === 'vorschau' && rahmenIch?.vorschau === true, `Im Fenster angemeldet als Musterschüler (${rahmenIch?.name})`)
  await vorschauFenster.screenshot({ path: join(out, '4b-vorschau-kurs.png') })
  await vorschauFenster.close()
  const nachVorschau = await get(`/server/vokabeln/${kurs}`)
  pruefe(
    !nachVorschau.lernende.some((l) => l.name === 'Musterschüler') && nachVorschau.lernende.length === 2,
    `Musterschüler nicht unter den Lernenden des Kurses (${nachVorschau.lernende.map((l) => l.name).join(', ')})`
  )

  // ---------- Lernende: Startkarte, Seite nach Regeln, „Diese Regel üben", passende Spiele
  // Bisherige Liste (Rückfall zum Regal, 08.10.2026) – das Regal prüft server-regal.mjs
  await ben.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { materialien: 'liste' } })
  const sb = await ben.newPage()
  await sb.goto(`${A}/s/`)
  pruefe(await da(sb.locator('[data-grammatik-offen]').first()), 'Startkarte: „Noch … Übungen nicht bearbeitet"')
  pruefe(
    (await sb.locator('[data-grammatik-offen]').first().innerText()).includes('Übungen'),
    `Startkarte spricht von Übungen (${await sb.locator('[data-grammatik-offen]').first().innerText()})`
  )
  await sb.screenshot({ path: join(out, '5-startseite.png'), fullPage: true })
  await sb.goto(`${A}/s/g/${gram}`)
  pruefe(await da(sb.locator('[data-regel="r1"]')), 'Seite nach Regeln')
  pruefe(await da(sb.locator('[data-gerade-dran] [data-regel="r2"]')), 'Unbearbeitete Regel unter „Gerade dran"')
  pruefe(await da(sb.locator('[data-gerade-dran] [data-extra-link]')), '„Extra für dich" unter „Gerade dran"')
  pruefe(await da(sb.locator('[data-uebungsarten]', { hasText: 'Auswahl 8' })), 'Übungsarten-Zeile')
  pruefe(await da(sb.locator('[data-grammatik-start]', { hasText: 'Übungen' })), '„Weiter üben · N Übungen"')
  await sb.locator('[data-regel-kopf="r2"]').click()
  await sb.screenshot({ path: join(out, '6-regeln.png'), fullPage: true })
  await sb.locator('[data-regel-ueben="r2"]').click()
  pruefe(await da(sb.locator('.vt-buehne', { hasText: /see yesterday|eat yesterday|go to school last Sunday/ })), '„Diese Regel üben": Aufgaben der Regel')
  const st = await tom.newPage()
  await st.goto(`${A}/s/g/${gram}`)
  await st.locator('[data-grammatik-kasten]').waitFor()
  pruefe(await da(st.locator('[data-grammatik-geschafft]')), 'Tom: für heute alles geübt')
  const tomBekannt = (await (await tom.request.get(`${A}/s/api/grammatik/liste?id=${gram}`, { headers: KOPF })).json()).bekannt
  pruefe(
    tomBekannt.includes('en.verb.present_simple'),
    `Bekannte Grammatik aus dem Lehrwerk-Stand (${tomBekannt.filter((b) => b.startsWith('en.verb')).join(', ')})`
  )
  if (
    !(await st
      .locator('[data-grammatik-spiele][data-offen], [data-grammatik-spiel]')
      .first()
      .isVisible()
      .catch(() => false))
  )
    await st.locator('[data-grammatik-spiele-kopf]').click()
  pruefe(await da(st.locator('[data-grammatik-spiel="richtigfalsch"]')), 'Spiel „Richtig oder falsch?" angeboten')
  pruefe((await st.locator('[data-grammatik-spiel="tabellenpuzzle"]').count()) === 0, 'Tabellen-Puzzle ausgeblendet (keine Tabelle)')
  const signal = await st.locator('[data-grammatik-spiel="signalwort"]').count()
  console.log(`   (Signalwort-Sortierer ${signal ? 'angeboten' : 'nicht angeboten'})`)
  await st.screenshot({ path: join(out, '7-spiele.png'), fullPage: true })
  if (signal) {
    await st.locator('[data-grammatik-spiel="signalwort"]').click()
    for (let i = 0; i < 12; i++) {
      if (
        await st
          .locator('[data-spiel-ende]')
          .isVisible()
          .catch(() => false)
      )
        break
      await st.locator('[data-zeitform]').first().click()
      await st.waitForTimeout(1500)
    }
    pruefe(await da(st.locator('[data-spiel-ende]'), 20000), 'Signalwort-Sortierer bis zum Ende gespielt')
    const rek = (await (await tom.request.get(`${A}/s/api/grammatik/liste?id=${gram}`, { headers: KOPF })).json()).rekorde
    pruefe(rek.signalwort !== undefined, 'Rekord gespeichert')
  }

  // ---------- Lehrwerk-Stand einer Lerngruppe (Meine Klassen)
  const g = await post('/server/lerngruppen/anlegen', { name: '5x', fach: 'Englisch', iservGruppe: 'klasse:5x' })
  // Kurs für die Klasse (08.10.2026): automatisch, leer, Überschrift ohne Jahr; Lernende sehen ihn noch nicht
  const kurs5x = (await get('/server/vokabeln')).zuweisungen.filter((z) => z.lerngruppe === '5x')
  pruefe(
    kurs5x.length === 1 && kurs5x[0].woerter === 0 && kurs5x[0].ueberschrift === '5x - Englisch',
    `Klasse 5x mit Englisch hat automatisch einen leeren Kurs (${kurs5x.map((z) => z.ueberschrift).join(', ')})`
  )
  pruefe((await get('/server/vokabeln')).zuweisungen.filter((z) => z.lerngruppe === '5x').length === 1, 'Kein zweiter Kurs beim erneuten Öffnen')
  if (kurs5x[0]) kurse.push(kurs5x[0].id)
  const ls0 = await get(`/server/grammatik/lehrwerkstand?gruppe=${g.id}`)
  // Automatisch (09.10.2026): Reihe aus den Kursen der Lehrkraft, Band nach Klasse 5 → Green Line 1, ohne Unit
  pruefe(ls0.automatisch?.buch === 'Green Line 1' && !ls0.automatisch?.unit, `Klasse 5x automatisch Green Line 1 ohne Unit (${JSON.stringify(ls0.automatisch)})`)
  // Kurs einer festen Klasse (09.10.2026): weder beenden noch löschen
  if (kurs5x[0]) {
    const d5x = await get(`/server/vokabeln/${kurs5x[0].id}`)
    pruefe(d5x.klassenKurs === true, 'Kurs der Klasse 5x gilt als Klassenkurs')
    const ende = await lk.request.post(`${A}/server/vokabeln/${kurs5x[0].id}/status`, { headers: KOPF, data: { status: 'beendet' } })
    pruefe(ende.status() === 400, `Klassenkurs lässt sich nicht beenden (${ende.status()})`)
  }
  await post('/server/grammatik/lehrwerkstand', { gruppe: g.id, buch: 'Green Line 2', unit: Object.keys(ls0.baende)[1] ? ls0.baende['Green Line 2'][1] : '' })
  const ls1 = await get(`/server/grammatik/lehrwerkstand?gruppe=${g.id}`)
  pruefe(ls1.stand?.buch === 'Green Line 2', `Lehrwerk-Stand gesetzt (${JSON.stringify(ls1.stand)})`)
  await post('/server/grammatik/lehrwerkstand', { gruppe: g.id, buch: '' })
  pruefe((await get(`/server/grammatik/lehrwerkstand?gruppe=${g.id}`)).stand === null, 'Lehrwerk-Stand zurück auf automatisch')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  for (const k of kurse) if (lk) await lk.request.post(`${A}/server/vokabeln/${k}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Kurse, Gäste und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
