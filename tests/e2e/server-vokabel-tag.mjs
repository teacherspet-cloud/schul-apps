// Vokabeltraining-Runde vom 08.10.2026: Tagesziel der Lehrkraft (Zehnerschritte, Spiele erst danach), Spiele für
// heute freischalten, Lernkarte ohne Weiter-Knopf, Vokabeln nachträglich hinzufügen, Lernende eintragen (auch aus
// einer CSV-Datei) mit persönlichem Anmeldecode, Code des Gastes ansehen und neu erzeugen, Grammatik fest mit dem
// Vokabeltraining verbunden. Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-vokabel-tag.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-vokabel-tag')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const WOERTER = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const PAKET = {
  thema: 'Simple past',
  regeln: [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes mit -ed oder unregelmäßiger Form.', beispiele: ['I played.', 'She went.'] }],
  aufgaben: Array.from({ length: 8 }, (_, i) => ({
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle die richtige Form.',
    satz: `Yesterday I ___ (play ${i}).`,
    optionen: ['played', 'play', 'plays'],
    loesungen: ['played']
  }))
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let vid = ''
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Tara T' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}/server/vokabeln/${pfad}`, { headers: KOPF, data })).json()
  vid = (await post('freigeben', { titel: 'Unit 1 Wörter', sprache: 'en', fach: 'Englisch', woerter: WOERTER, gaeste: true })).id
  pruefe(Boolean(vid), 'Vokabeltraining freigegeben')

  // ---------- Tagesziel, Vokabeln hinzufügen
  await post(`${vid}/tagesziel`, { tagesziel: 25 })
  const neu = await post(`${vid}/woerter`, {
    woerter: [{ id: 'w0', term: 'apple', translation: 'Apfel' }, { id: 'x', term: 'tree', translation: 'Baum' }, WOERTER[3]]
  })
  const st = await (await lk.request.get(`${A}/server/vokabeln/${vid}`, { headers: KOPF })).json()
  pruefe(st.tagesziel === 25, `Tagesziel 25 gespeichert (${st.tagesziel})`)
  pruefe(
    neu.neu === 2 && st.woerter.length === 32 && new Set(st.woerter.map((w) => w.id)).size === 32,
    `2 Vokabeln hinzugefügt, Doppeltes übersprungen, Ids eindeutig (${neu.neu}, ${st.woerter.length})`
  )

  // ---------- Lehrkraft: Lernende eintragen aus einer CSV-Datei, Zettel, Gast-Code ansehen
  const p = await lk.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  // Abschnitte nur in den Details, zugeklappt: Wörterzahl, neu Hinzugekommenes hervorgehoben
  pruefe(await da(p.locator('[data-vokabel-neu14]', { hasText: '+2' })), 'Kasten „32 Wörter" mit „+2 in den letzten 2 Wochen"')
  pruefe(!(await p.locator('[data-vokabel-abschnitte]').getByText('Unit 1 Wörter').isVisible()), 'Abschnitte zugeklappt')
  await p.locator('[data-vokabel-abschnitte-kopf]').click()
  pruefe(await da(p.locator('[data-vokabel-abschnitte]').getByText('Unit 1 Wörter')), 'Aufgeklappt: die Abschnitte')
  await p.locator('[data-lernende-eintragen]').click()
  const [wahl] = await Promise.all([p.waitForEvent('filechooser'), p.locator('[data-namen-datei]').click()])
  await wahl.setFiles({ name: 'klasse.csv', mimeType: 'text/csv', buffer: Buffer.from('Nr;Nachname;Vorname\n1;Müller;Anna\n2;Schmidt;Ben\n3;Müller;Anton\n') })
  await p.waitForTimeout(500)
  const namen = await p.locator('[data-namen-eingabe]').inputValue()
  pruefe(namen === 'Anna M.\nBen S.\nAnton M.', `Namen aus CSV als „Vorname N." (${JSON.stringify(namen)})`)
  await p.locator('[data-namen-eingabe]').fill(`${namen}\nClara Zimmermann`)
  await p.screenshot({ path: join(out, '1-eintragen.png') })
  await p.locator('[data-namen-eintragen]').click()
  pruefe(await da(p.locator('[data-eingetragen]')), 'Eingetragen, Zettel-Knöpfe da')
  // Zettel mit der Druckvorschau der App (nicht der Windows-Dialog), Symbol eingebettet
  await p.getByRole('button', { name: 'Zettel drucken' }).click()
  await p.waitForTimeout(3000)
  await p.screenshot({ path: join(out, '2b-zettel-vorschau.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(500)
  await p.screenshot({ path: join(out, '2-eingetragen.png') })
  if (
    await p
      .getByRole('button', { name: 'Fertig' })
      .isVisible()
      .catch(() => false)
  )
    await p.getByRole('button', { name: 'Fertig' }).click()
  const st2 = await (await lk.request.get(`${A}/server/vokabeln/${vid}`, { headers: KOPF })).json()
  const gaeste = st2.lernende.filter((l) => l.gast)
  pruefe(
    gaeste.length === 4 && gaeste.every((g) => /^[A-Z2-9]{8}$/.test(g.zugang ?? '')) && gaeste.some((g) => g.name === 'Clara Z.'),
    `4 Gäste mit persönlichem Code (${gaeste.map((g) => `${g.name}=${g.zugang}`).join(', ')})`
  )
  pruefe(await da(p.locator('[data-zettel-alle]')), 'Knopf „Zettel für alle"')
  await p.locator('[data-gast-name="Ben S."]').click()
  const benCode = gaeste.find((g) => g.name === 'Ben S.').zugang
  pruefe(await da(p.locator('[data-gast-code]', { hasText: benCode })), 'Klick auf den Namen zeigt den Code')
  await p.screenshot({ path: join(out, '3-gast-code.png') })
  await p.keyboard.press('Escape')
  // Spiele-Schalter und Tagesziel in den Details
  pruefe(await da(p.locator('[data-vokabel-tagesziel]')), 'Feld „Neue Vokabeln pro Tag"')
  await p.screenshot({ path: join(out, '4-details.png'), fullPage: true })

  // ---------- Lernende: Anmelden mit dem Code vom Zettel, Zehnerschritte, Lernkarte ohne Weiter
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, hasTouch: true })
  const s = await ctx.newPage()
  await s.goto(`${A}/s/`)
  await s.getByLabel(/Code \(steht an der Tafel oder du hast ihn von deiner Lehrkraft erhalten\)/).fill(benCode)
  await s.getByRole('button', { name: 'Öffnen', exact: true }).click()
  await s.waitForURL(`**/s/v/${vid}`, { timeout: 15000 }).catch(() => undefined)
  pruefe(s.url().endsWith(`/s/v/${vid}`), `Code vom Zettel öffnet das Training (${s.url()})`)
  // Vorab-Hintergrund (kein weißer Blitz): Skript da, nach dem Aufbau wieder entfernt
  pruefe((await ctx.request.get(`${A}/server/vorab.js`)).status() === 200, 'Vorab-Skript wird ausgeliefert')
  await s.waitForTimeout(500)
  pruefe((await s.evaluate(() => document.documentElement.style.background)) === '', 'Vorab-Hintergrund nach dem Aufbau entfernt')
  pruefe(await da(s.locator('[data-vokabel-start]', { hasText: '10 Wörter' })), '„Jetzt üben · 10 Wörter"')
  const seite = await s.locator('body').innerText()
  pruefe(seite.includes(`${new Date().getFullYear()} - Englisch`) && !seite.includes('Unit 1 Wörter'), 'Lernende sehen die Überschrift, nicht den Quellentitel')
  pruefe(await da(s.locator('[data-vokabel-rest]', { hasText: '25' })), 'Hinweis: heute noch 25 bis zu den Spielen')
  pruefe((await s.locator('[data-spielwahl]').count()) === 0, 'Spiele noch nicht frei')
  await s.locator('[data-wert="sicher"]').click()
  pruefe(
    await da(s.locator('[data-wert-erklaerung="sicher"]', { hasText: 'mindestens eine Woche' })),
    'Antippen von „sicher" erklärt, ab wann ein Wort sicher ist'
  )
  await s.screenshot({ path: join(out, '5-start.png') })
  await s.keyboard.press('Escape')
  await s.locator('[data-vokabel-start]').click()
  pruefe(['deutsch', 'fremd'].includes(await s.locator('[data-karte-vorn]').getAttribute('data-karte-vorn')), 'Karte mit zufälliger Vorderseite')
  await s.locator('[data-lernkarte]').click()
  await s.waitForTimeout(300)
  const vorher = await s.locator('[data-lernkarte]').innerText()
  await s.locator('[data-karte-gewusst]').click()
  await s.waitForTimeout(700)
  const nachher = await s
    .locator('[data-lernkarte]')
    .innerText()
    .catch(() => '')
  pruefe(
    vorher !== nachher &&
      !(await s
        .locator('[data-weiter]')
        .isVisible()
        .catch(() => false)),
    'Nach „Wusste ich" gleich die nächste Karte, ohne Weiter'
  )
  // Rest des Schritts: alle Karten „Wusste ich" (keine Wiederholungen in der Runde)
  for (let i = 0; i < 120; i++) {
    if (
      await s
        .locator('[data-sitzung-fertig]')
        .isVisible()
        .catch(() => false)
    )
      break
    if (
      await s
        .locator('[data-lernkarte]')
        .isVisible()
        .catch(() => false)
    ) {
      await s.locator('[data-lernkarte]').click()
      await s.waitForTimeout(150)
      await s.locator('[data-karte-gewusst]').click()
      await s.waitForTimeout(250)
    } else if (
      await s
        .locator('[data-weiter]')
        .isVisible()
        .catch(() => false)
    )
      await s.locator('[data-weiter]').click()
    else if (
      await s
        .locator('[data-sitzung] .vt-buehne button:not([disabled])')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // Wiederholung als Auswahl: irgendeine Antwort
      await s.locator('[data-sitzung] .vt-buehne button:not([disabled])').first().click()
      await s.waitForTimeout(250)
    } else await s.waitForTimeout(300)
  }
  pruefe(await da(s.locator('[data-sitzung-fertig]')), 'Erster Zehnerschritt geschafft')
  if (
    !(await s
      .locator('[data-sitzung-fertig]')
      .isVisible()
      .catch(() => false))
  )
    await s.screenshot({ path: join(out, 'debug-schritt.png') })
  await s.goto(`${A}/s/v/${vid}`)
  pruefe(await da(s.locator('[data-vokabel-start]', { hasText: '10 Wörter' })), 'Nächster Schritt: wieder 10 neue')
  pruefe(
    await da(s.locator('[data-vokabel-rest]', { hasText: '15' }), 4000),
    `Heute noch 15 (${await s
      .locator('[data-vokabel-rest]')
      .innerText()
      .catch(() => 'kein Hinweis')})`
  )

  // ---------- Startseite: motivierender Stand und ob heute noch etwas zu tun ist
  // Bisherige Liste/Türen (Rückfall zum Regal, 08.10.2026) – das Regal prüft server-regal.mjs
  await ctx.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { materialien: 'liste' } })
  await s.goto(`${A}/s/`)
  pruefe(await da(s.locator('[data-heute-offen="15"]', { hasText: 'Heute noch 15 Wörter' })), '„Heute noch 15 Wörter üben" auf der Startseite')
  pruefe(await da(s.getByText(/heute geübt: 10 · 10 von 32 kennengelernt · 0 sicher/)), '„heute geübt: 10 · 10 von 32 kennengelernt · 0 sicher"')
  await s.screenshot({ path: join(out, '5b-startseite.png'), fullPage: true })
  await s.goto(`${A}/s/v/${vid}`)

  // ---------- Spiele für heute freischalten
  await post(`${vid}/spiele`, { frei: true })
  await s.reload()
  pruefe(await da(s.locator('[data-spiele-freigeschaltet]')), 'Spiele von der Lehrkraft freigeschaltet – trotz offener Tagesrunde')
  pruefe(await da(s.locator('[data-vokabel-start]')), '„Jetzt üben" bleibt daneben')
  await s.screenshot({ path: join(out, '6-spiele-frei.png'), fullPage: true })
  // Spielbereiche auf- und zuklappen – bleibt nach dem Neuladen so
  pruefe(await da(s.locator('[data-spiel-gruppe="paare"][data-offen]')), 'Bereich „Paare finden" offen')
  pruefe((await s.locator('[data-spiel-gruppe="raetseln"][data-offen]').count()) === 0, 'Bereich „Rätseln" zu')
  await s.locator('[data-spiel-gruppe-kopf="paare"]').click()
  await s.locator('[data-spiel-gruppe-kopf="raetseln"]').click()
  await s.waitForTimeout(800)
  await s.reload()
  await s.locator('[data-spiel-gruppe="paare"]').waitFor()
  pruefe(
    (await s.locator('[data-spiel-gruppe="paare"][data-offen]').count()) === 0 && (await s.locator('[data-spiel-gruppe="raetseln"][data-offen]').count()) === 1,
    'Auf-/Zuklappen nach dem Neuladen gemerkt'
  )
  const ds = (await (await ctx.request.get(`${A}/s/api/darstellung`, { headers: KOPF })).json()).darstellung
  pruefe(ds?.spielGruppen?.paare === false && ds?.spielGruppen?.raetseln === true, `Am Konto gespeichert (${JSON.stringify(ds?.spielGruppen)})`)
  await s.screenshot({ path: join(out, '6b-bereiche.png'), fullPage: true })

  // ---------- Grammatik fest mit dem Vokabeltraining verbunden – auch für später Eingetragene
  const g = await (
    await lk.request.post(`${A}/server/grammatik/freigeben`, {
      headers: KOPF,
      data: { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: vid }
    })
  ).json()
  pruefe(Boolean(g.id), `Grammatik für die Lernenden des Vokabeltrainings freigegeben (${g.fehler ?? ''})`)
  const gram = (await (await ctx.request.get(`${A}/s/api/grammatik`, { headers: KOPF })).json()).listen ?? []
  pruefe(
    gram.some((x) => x.id === g.id),
    'Ben sieht die Grammatik'
  )
  const spaet = (await post(`${vid}/eintragen`, { namen: ['Dora K.'] })).eingetragen[0]
  const dora = await browser.newContext()
  const an = await (await dora.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: spaet.zugang } })).json()
  const gramDora = (await (await dora.request.get(`${A}/s/api/grammatik`, { headers: KOPF })).json()).listen ?? []
  pruefe(an.id === vid && gramDora.some((x) => x.id === g.id), 'Später Eingetragene haben die Grammatik automatisch')
  const gl = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen?.find((x) => x.id === g.id)
  pruefe(Boolean(gl?.lerngruppe?.includes('Vokabeltraining')), `Grammatik zeigt die Verbindung (${gl?.lerngruppe})`)
  // Fertiges Grammatiktraining nachträglich verbinden (Dialog „Grammatik dazu freigeben")
  const g2 = await (
    await lk.request.post(`${A}/server/grammatik/freigeben`, {
      headers: KOPF,
      data: { titel: 'Past progressive', fach: 'Englisch', sprache: 'en', thema: 'Past progressive', paket: PAKET, gaeste: true }
    })
  ).json()
  await p
    .locator('[data-zurueck], button:has-text("Alle Kurse")')
    .first()
    .click()
    .catch(() => undefined)
  await p.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  await p.locator('[data-vokabel-grammatik]').click()
  pruefe(await da(p.locator('[data-grammatik-verbunden]')), 'Dialog zeigt die schon verbundene Grammatik')
  await p.locator('[data-grammatik-dazu-wahl]').click()
  await p.getByRole('option', { name: /Past progressive/ }).click()
  await p.screenshot({ path: join(out, '9-grammatik-dazu.png') })
  await p.locator('[data-grammatik-dazu-verbinden]').click()
  await p.waitForTimeout(1000)
  const gl2 = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen?.find((x) => x.id === g2.id)
  const gramBen = (await (await ctx.request.get(`${A}/s/api/grammatik`, { headers: KOPF })).json()).listen ?? []
  pruefe(gl2?.vokId === vid && gramBen.some((x) => x.id === g2.id), 'Fertiges Grammatiktraining verbunden – Ben sieht es')
  await p.keyboard.press('Escape')

  // ---------- Details: Je Lernende/r (neu/wiederholt, sortieren, filtern, Namen ausblenden) und Grammatik der Gruppe
  console.log('  URL vor dem Neuladen:', p.url())
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  pruefe(await da(p.locator('[data-woche="10/0"]')), 'Ben: „10 neu · 0 wiederholt" in 7 Tagen')
  await p.locator('[data-sortieren="woche"]').click()
  pruefe((await p.locator('[data-lernende-tabelle] tbody tr').first().innerText()).includes('Ben S.'), 'Sortiert nach „geübt (7 Tage)": Ben oben')
  await p.locator('[data-filtern="woche"]').click()
  await p.locator('[data-filter-wahl="woche"]').click()
  await p.getByRole('option', { name: 'hat geübt' }).click()
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-lernende-tabelle] tbody tr').count()) === 1, 'Filter „hat geübt": nur Ben')
  await p.keyboard.press('Escape')
  await p.locator('[data-namen-ausblenden]').click()
  pruefe((await p.locator('[data-lernende-name]').first().innerText()).startsWith('Lernende/r'), 'Namen ausgeblendet')
  pruefe((await p.locator('[data-grammatik-zeile]').count()) === 2, 'Grammatik der Gruppe: beide verbundenen Trainings')
  await p.screenshot({ path: join(out, '10-details-tabellen.png'), fullPage: true })
  await p.locator('[data-namen-ausblenden]').click()
  await p.locator('[data-lernende-kopf]').click()
  pruefe((await p.locator('[data-lernende-tabelle]').count()) === 0, 'Je Lernende/r zugeklappt')
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${vid}"]`).click()
  await p.locator('[data-lernende-kasten]').waitFor()
  pruefe((await p.locator('[data-lernende-tabelle]').count()) === 0, 'Zugeklappt bleibt nach dem Neuladen')
  await p.locator('[data-lernende-kopf]').click()

  // ---------- Übersicht: Überschrift (Standard „Jahr - Lerngruppe - Fach", umbenennbar), Symbol per Rechtsklick
  const kurz = async () => (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.find((z) => z.id === vid)
  const k1 = await kurz()
  pruefe(k1.ueberschrift === `${new Date().getFullYear()} - Englisch` && k1.titel === 'Unit 1 Wörter', `Standard-Überschrift (${k1.ueberschrift})`)
  pruefe(k1.faecher?.length === 7 && k1.faecher.reduce((a, b) => a + b, 0) > 0, `Fächerverteilung für das Symbol (${k1.faecher})`)
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  const karte = p.locator(`[data-vokabel-zuweisung="${vid}"]`)
  await karte.locator('[data-vokabel-umbenennen]').click()
  await p.locator('[data-umbenennen-eingabe]').fill('Englisch 5b – Unit 1')
  await p.locator('[data-umbenennen-speichern]').click()
  pruefe(await da(karte.locator('[data-vokabel-ueberschrift]', { hasText: 'Englisch 5b – Unit 1' })), 'Überschrift umbenannt')
  pruefe(await da(karte.locator('[data-lernstand-symbol="verlauf"]')), 'Symbol zeigt den Verlauf')
  await p.screenshot({ path: join(out, '7-uebersicht-verlauf.png') })
  await karte.locator('[data-lernstand-symbol]').click({ button: 'right' })
  pruefe(await da(karte.locator('[data-lernstand-symbol="farbe"]')), 'Rechtsklick: feste Farbe')
  pruefe((await p.locator('[data-lernstand]').count()) === 0, 'Rechtsklick öffnet das Training nicht')
  await p.screenshot({ path: join(out, '8-uebersicht-farbe.png') })

  // ---------- Neuer Code ersetzt den alten
  const ben = gaeste.find((x) => x.name === 'Ben S.')
  const nc = (await post(`${vid}/gast-code`, { id: ben.id })).zugang
  const alt = await (await browser.newContext()).request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: benCode } })
  const neuAn = await (await browser.newContext()).request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: nc } })
  pruefe(alt.status() === 404 && neuAn.status() === 200 && nc !== benCode, 'Neuer Code gilt, der alte nicht mehr')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Training löschen (nimmt die Gastkonten mit), dann die Lehrkraft
  if (vid && lk) await lk.request.post(`${A}/server/vokabeln/${vid}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Training, Gäste und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
