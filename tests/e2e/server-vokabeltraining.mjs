// Runde 03.10.2026 abends: App „Vokabeltraining" (Lernzeitraum, QR-Code für Gäste mit persönlichem
// Wiedereinstiegs-Code), „Freigegebene Blätter" nach Lerngruppe + Liste leeren, Verwaltung für Lehrkräfte,
// QR-Beitritt mit angemeldeter Lehrkraft am Handy.
// Vorher: Server lokal (KI-Attrappe), IServ NICHT eingerichtet. Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-vokabeltraining.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus, kursKaestenAuf } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-vokabeltraining')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7v${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter' },
  { id: 'w2', term: 'sunny', translation: 'sonnig' },
  { id: 'w3', term: 'cloud', translation: 'Wolke' },
  { id: 'w4', term: 'children [pl]', translation: 'Kinder' }
]
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const BLATT = '<html><head></head><body><div class="ws-page"><div class="ws-content"><div class="ws-body"><p>Probe</p></div></div></div></body></html>'

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  // Kurs für die Klasse (08.10.2026): eine Lerngruppe mit Englisch bekommt automatisch einen leeren Kurs „<Klasse> - Englisch"
  const kurseDerKlasse = async () =>
    (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.filter((z) => z.lerngruppe === KLASSE)
  const auto = await kurseDerKlasse()
  pruefe(
    auto.length === 1 && auto[0].woerter === 0 && auto[0].ueberschrift === `${KLASSE} - Englisch` && auto[0].fach === 'Englisch',
    `Klasse mit Englisch hat automatisch einen leeren Kurs (${auto.map((z) => `${z.ueberschrift}/${z.woerter}`).join(', ')})`
  )
  pruefe((await kurseDerKlasse()).length === 1, 'Erneutes Öffnen legt keinen zweiten Kurs an')

  // ---------- Vokabeltraining nur per QR-Code, mit Lernzeitraum
  const bis = Date.now() + 30 * 864e5
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: '', schueler: [], gaeste: true, bis, titel: 'Weather words', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  pruefe(Boolean(vok.id), 'Vokabeltraining nur per QR-Code freigegeben')
  const kurz = (await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen.find((z) => z.id === vok.id)
  pruefe(Boolean(kurz?.code && kurz.link?.includes('/s/vt/')) && kurz.bis === bis, `Code, Link und Zeitraum (${kurz?.code})`)

  // Lehrkraft: eigene App in der Leiste, kein Reiter mehr im Onlinetest
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Onlinetest"]').click()
  await p.waitForTimeout(600)
  pruefe((await p.getByRole('tab', { name: 'Vokabeltraining' }).count()) === 0, 'Onlinetest ohne Reiter „Vokabeltraining"')
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  pruefe(await da(p.locator(`[data-vokabel-zuweisung="${vok.id}"]`)), 'App „Vokabeltraining" mit der Freigabe')
  await p.screenshot({ path: join(out, '1-app.png') })
  // Vokabeln wählen (06.10.2026): Fach (bei mehreren Fremdsprachen) → Lehrwerk → Band
  await p.locator('[data-vokabeln-freigeben]').click()
  const lehrwerk = p.locator('[data-vokabel-buch]')
  await lehrwerk.waitFor({ timeout: 8000 })
  if (await p.locator('[data-vokabel-fach]').count()) {
    await p.locator('[data-vokabel-fach]').click()
    await p.getByRole('option', { name: 'Englisch' }).click()
  }
  await lehrwerk.click()
  const reihenNamen = await p.getByRole('option').allInnerTexts()
  pruefe(
    reihenNamen.some((x) => /^Green Line$/.test(x.trim())),
    `Lehrwerk als Reihe („${reihenNamen.slice(0, 4).join('", "')}")`
  )
  await p.getByRole('option', { name: 'Green Line', exact: true }).click()
  await p.locator('[data-vokabel-band]').click()
  const baende = await p.getByRole('option').allInnerTexts()
  pruefe(
    baende.some((x) => /Green Line 1/.test(x)),
    `Danach der Band („${baende.slice(0, 3).join('", "')}")`
  )
  await p
    .getByRole('option', { name: /Green Line 1/ })
    .first()
    .click()
  pruefe(await da(p.locator('[data-vokabel-unit]')), 'Danach die Unit')
  // Mehrere Units (08.10.2026): zwei Units wählen – Abschnitte sind NICHT vorausgewählt, Hinweis, „Freigeben" gesperrt
  await p.locator('[data-vokabel-unit]').click()
  const unitNamen = (await p.getByRole('option').allInnerTexts()).map((x) => x.trim()).filter(Boolean)
  pruefe(unitNamen.length >= 2, `Mindestens zwei Units im Band (${unitNamen.slice(0, 3).join(', ')})`)
  await p.getByRole('option', { name: unitNamen[0], exact: true }).click()
  await p.getByRole('option', { name: unitNamen[1], exact: true }).click()
  await p.keyboard.press('Escape')
  pruefe(await da(p.getByText('Abschnitte auswählen')), 'Hinweis „Abschnitte auswählen" – keine Vorauswahl')
  pruefe(await p.locator('[data-vokabeln-los]').isDisabled(), '„Freigeben" gesperrt, solange kein Abschnitt gewählt ist')
  await p.locator('[data-vokabel-abschnitte]').click()
  await p.getByRole('option').filter({ hasText: `${unitNamen[0]} · ` }).first().click()
  await p.getByRole('option').filter({ hasText: `${unitNamen[1]} · ` }).first().click()
  await p.keyboard.press('Escape')
  await p.locator('[data-vokabel-gruppe]').click()
  await p.getByRole('option', { name: KLASSE, exact: true }).click()
  await p.screenshot({ path: join(out, '1b-lehrwerk.png') })
  pruefe(await p.locator('[data-vokabeln-los]').isEnabled(), '„Freigeben" mit Abschnitten aus zwei Units möglich')
  await p.locator('[data-vokabeln-los]').click()
  await p.waitForTimeout(3000)
  // Der leere Kurs der Klasse wird gefüllt – kein zweiter Kurs daneben
  const kurseNachher = await kurseDerKlasse()
  pruefe(kurseNachher.length === 1 && kurseNachher[0].id === auto[0].id && kurseNachher[0].woerter > 0, `Der leere Kurs der Klasse wird gefüllt (${kurseNachher.length} Kurs/e)`)
  const mitWoertern = kurseNachher.filter((z) => z.woerter > 0)
  const zweiUnits = mitWoertern.length === 1 ? await (await lk.request.get(`${A}/server/vokabeln/${mitWoertern[0].id}`, { headers: KOPF })).json() : null
  pruefe(
    Boolean(zweiUnits) &&
      zweiUnits.quelle?.units?.length === 2 &&
      zweiUnits.quelle.units.map((u) => u.unit).join('|') === `${unitNamen[0]}|${unitNamen[1]}` &&
      zweiUnits.teile?.length === 2 &&
      zweiUnits.teile[0].titel.startsWith(unitNamen[0]) &&
      zweiUnits.teile[1].titel.startsWith(unitNamen[1]) &&
      zweiUnits.woerter.length === zweiUnits.teile[0].anzahl + zweiUnits.teile[1].anzahl,
    `Ein Kurs mit den Wörtern beider Units in Buchreihenfolge (${zweiUnits?.teile?.map((t) => `${t.titel}: ${t.anzahl}`).join(', ')})`
  )
  if (await p.getByRole('dialog').count()) await p.keyboard.press('Escape')

  // ---------- Gast am Handy: Name → persönlicher Code → Trainer
  const g1 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h = await g1.newPage()
  await h.goto(`${A}/s/vt/${kurz.code}`)
  await h.locator('[data-gastname]').fill('Ben T.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  pruefe(await da(h.locator('[data-wieder-code]')), 'Gast bekommt einen persönlichen Code')
  const wieder = (await h.locator('[data-wieder-code]').innerText()).trim()
  await h.screenshot({ path: join(out, '2-code.png') })
  await h.locator('[data-vokabeln-los]').click()
  pruefe(await da(h.locator('[data-vokabel-kasten]')), 'Gast lernt im Karteikasten')
  await h.screenshot({ path: join(out, '2b-kasten.png'), fullPage: true })
  // Eine Übungsrunde: Jede Frage startet frei bedienbar – kein altes „Richtig", nichts gesperrt (Befund 03.10.2026)
  // Fächer mit Lernstufen-Namen, Wiederkehr und Erklärung beim Antippen
  pruefe(
    (await h.locator('[data-fach="1"]').innerText()).replace(/­/g, '').includes('Angefangen') &&
      (await h.locator('[data-fach="1"]').innerText()).includes('morgen'),
    'Fach „Angefangen“ mit „↻ morgen“'
  )
  await h.locator('[data-fach="3"]').click()
  pruefe(await da(h.locator('[data-fach-erklaerung="3"]').getByText('selbst richtig geschrieben')), 'Antippen erklärt, wie ein Wort ins Fach kommt')
  await h.keyboard.press('Escape')
  await h.locator('[data-vokabel-start]').click()
  await h.locator('[data-sitzung]').waitFor()
  const arten = new Set()
  let sauber = true
  let buchstabenOk = true
  let karteGeprueft = false
  let tastaturGeprueft = false
  for (let i = 0; i < 40; i++) {
    if (await h.locator('[data-sitzung-fertig]').isVisible()) break
    await h.waitForTimeout(250)
    if ((await h.locator('[data-urteil]').count()) > 0) sauber = false
    const karte = await h.locator('[data-lernkarte]').isVisible()
    if (karte && !karteGeprueft) {
      karteGeprueft = true
      arten.add('karte')
      const buehne = h.locator('[data-lernkarte]')
      const deutschVorn = (await h.locator('[data-karte-vorn]').getAttribute('data-karte-vorn')) === 'deutsch'
      // Aussprache verrät nichts (09.10.2026): bei deutscher Vorderseite kein Lautsprecher, erst nach dem Umdrehen
      const tonVorher = await h.locator('[data-karte-anhoeren]').count()
      pruefe(deutschVorn ? tonVorher === 0 : tonVorher === 1, `Lautsprecher nur auf der fremdsprachigen Seite (vorn ${deutschVorn ? 'deutsch' : 'fremd'}: ${tonVorher})`)
      // Hängender Zug (Befund 09.10.2026 „Karteikarten frieren ein"): ziehen, dann vom Browser abgebrochen …
      const b = await buehne.boundingBox()
      const x = b.x + b.width / 2
      await buehne.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'mouse', button: 0, isPrimary: true, clientX: x, clientY: b.y + 20 })
      await buehne.dispatchEvent('pointermove', { pointerId: 41, pointerType: 'mouse', isPrimary: true, clientX: x + 80, clientY: b.y + 20 })
      pruefe((await buehne.getAttribute('data-zieht')) !== null, 'Karte folgt dem Ziehen')
      await buehne.dispatchEvent('pointercancel', { pointerId: 41, pointerType: 'mouse', isPrimary: true })
      pruefe((await buehne.getAttribute('data-zieht')) === null, 'Abgebrochener Zug: Karte wieder in Ruhe')
      // … oder neben der Karte losgelassen und das Fenster gewechselt
      await buehne.dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'mouse', button: 0, isPrimary: true, clientX: x, clientY: b.y + 20 })
      await buehne.dispatchEvent('pointermove', { pointerId: 42, pointerType: 'mouse', isPrimary: true, clientX: x - 50, clientY: b.y + 20 })
      await h.evaluate(() => window.dispatchEvent(new Event('blur')))
      await h.waitForTimeout(100)
      pruefe((await buehne.getAttribute('data-zieht')) === null, 'Fensterwechsel beendet den Zug')
      await buehne.click()
      pruefe((await h.locator('.vt-karte.umgedreht').count()) === 1, 'Danach dreht ein Klick die Karte normal um')
      const tonNachher = await h.locator('[data-karte-anhoeren]').count()
      pruefe(deutschVorn ? tonNachher === 1 : tonNachher === 0, 'Nach dem Umdrehen: Lautsprecher passend zur sichtbaren Seite')
      // Antwort kommt nicht an: Meldung, Knöpfe wieder frei, nochmal tippen klappt
      await h.route('**/s/api/vokabeln/antwort', (r) => r.abort())
      await h.locator('[data-karte-gewusst]').click()
      pruefe(await da(h.locator('[data-netz-fehler]'), 30000), 'Antwort ohne Verbindung: Meldung statt eingefrorener Karte')
      pruefe(!(await h.locator('[data-karte-gewusst]').isDisabled()), 'Knöpfe der Lernkarte danach wieder frei')
      await h.unroute('**/s/api/vokabeln/antwort')
      await h.locator('[data-karte-gewusst]').click()
    } else if (karte) {
      arten.add('karte')
      await h.locator('[data-lernkarte]').click()
      // Erst „nicht gewusst" – so kommt das Wort in anderer Form wieder
      await h.locator(i % 2 ? '[data-karte-gewusst]' : '[data-karte-nicht]').click()
    } else if ((await h.locator('[data-option-fs]').count()) > 0) {
      arten.add('schreibweise')
      await h.screenshot({ path: join(out, '2e-schreibweise.png') })
      if (await h.locator('[data-option-fs]').first().isDisabled()) sauber = false
      await h.locator('[data-option-fs]').first().click()
    } else if ((await h.locator('[data-paar]').count()) > 0) {
      arten.add('paar')
      await h.screenshot({ path: join(out, '2f-paar.png') })
      if (await h.locator('[data-paar="ja"]').isDisabled()) sauber = false
      await h.locator('[data-paar="ja"]').click()
    } else if ((await h.locator('[data-option]').count()) > 0) {
      arten.add('auswahl')
      if (await h.locator('[data-option]').first().isDisabled()) sauber = false
      await h.locator('[data-option]').first().click()
    } else if ((await h.locator('[data-buchstabe]').count()) > 0 && !tastaturGeprueft) {
      // Tastatur wird erkannt (09.10.2026): einfach lostippen, ohne „Tippen" zu wählen; Enter prüft
      tastaturGeprueft = true
      arten.add('buchstaben')
      const buehnenText = await h.locator('.vt-buehne').innerText()
      const w = WOERTER.find((x) => buehnenText.includes(x.translation))
      await h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await h.keyboard.type(w.term.replace(/\s*\[.*\]/, ''))
      pruefe(await da(h.locator('[data-lege-tippen]'), 3000), 'Lostippen schaltet „Lege das Wort" auf Tippen')
      await h.keyboard.press('Enter')
      pruefe((await h.locator('[data-urteil]').getAttribute('data-urteil', { timeout: 8000 })) === 'richtig', `Getippt und mit Enter geprüft: richtig (${w.term})`)
    } else if ((await h.locator('[data-buchstabe]').count()) > 0) {
      arten.add('buchstaben')
      const k = h.locator('[data-buchstabe]')
      const n = await k.count()
      const texte = await k.allInnerTexts()
      if (texte.some((t) => /[\[\]]/.test(t))) buchstabenOk = false
      if (await k.first().isDisabled()) sauber = false
      for (let j = 0; j < n; j++) await k.nth(j).click()
      await h.locator('[data-pruefen]').click()
    } else if ((await h.locator('[data-eingabe]').count()) > 0) {
      arten.add('schreiben')
      if (await h.locator('[data-eingabe]').isDisabled()) sauber = false
      await h.locator('[data-eingabe]').fill('cloud')
      await h.locator('[data-pruefen]').click()
    }
    // Lernkarte geht seit 08.10.2026 ohne Weiter-Knopf gleich weiter
    if (karte) await h.waitForTimeout(400)
    else await h.locator('[data-weiter]').click({ timeout: 8000 })
  }
  pruefe(sauber, `Jede Frage startet bedienbar ohne altes Ergebnis (${[...arten].join(', ')})`)
  pruefe(arten.size >= 2, `Mehrere Abfrageformate in der Runde (${[...arten].join(', ')})`)
  pruefe(buchstabenOk, 'Buchstaben ohne „[pl]"-Angabe')
  pruefe(await da(h.locator('[data-aufstieg]'), 5000), 'Am Ende der Runde: aufgestiegene Wörter')
  pruefe(karteGeprueft, 'Lernkarte geprüft (Ziehen, Ton, Verbindung)')
  await h.waitForTimeout(1200)
  await h.screenshot({ path: join(out, '2c2-aufstieg.png'), fullPage: true })
  await h.getByRole('button', { name: 'Zurück zum Kasten' }).click()
  pruefe(await da(h.locator('[data-fach-zuwachs]').first(), 5000), 'Kasten zeigt den Zuwachs je Fach')
  // Tipp der Startseite „Abfrage ohne Hinschauen starten" (09.10.2026): Link öffnet die Abfrage selbst, nicht nur die Kursseite
  const kastenUrl = h.url()
  await h.goto(`${A}/s/v/${vok.id}?uebung=abfragen`)
  pruefe(await da(h.locator('[data-sitzung]'), 10000), '„?uebung=abfragen" startet gleich die Abfrage')
  pruefe(!h.url().includes('uebung='), 'Übungs-Hinweis verschwindet aus der Adresse')
  pruefe(
    (await h.locator('[data-option], [data-option-fs], [data-paar]').count()) === 0,
    'Abfrage ohne Hinschauen: keine Auswahl, kein Erkennen'
  )
  // „Lösung zeigen" (09.10.2026): beim Schreiben/Legen die Lösung ansehen – zählt als falsch, dann „Weiter"
  const falschGesamt = async () =>
    Object.values((await (await g1.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()).staende ?? {}).reduce(
      (n, st) => n + (st.falsch ?? 0),
      0
    )
  for (let i = 0; i < 12 && !(await h.locator('[data-loesung-zeigen]').isVisible()); i++) {
    if (await h.locator('[data-lernkarte]').isVisible()) {
      await h.locator('[data-lernkarte]').click()
      await h.locator('[data-karte-gewusst]').click()
    } else if (await h.locator('[data-weiter]').isVisible()) await h.locator('[data-weiter]').click()
    await h.waitForTimeout(400)
  }
  pruefe(await h.locator('[data-loesung-zeigen]').isVisible(), 'Schreiben/Legen: Knopf „Lösung zeigen" da')
  const falschVorher = await falschGesamt()
  // Mit der Tastatur erreichbar: fokussieren und mit Enter auslösen
  await h.locator('[data-loesung-zeigen]').focus()
  await h.keyboard.press('Enter')
  pruefe((await h.locator('[data-urteil]').getAttribute('data-urteil', { timeout: 8000 })) === 'falsch', '„Lösung zeigen" zählt als nicht gewusst (falsch)')
  pruefe(await h.getByText('Hier ist die Lösung').isVisible(), 'Rückmeldung nennt die Lösung')
  await h.screenshot({ path: join(out, '2c4-loesung-zeigen.png'), fullPage: true })
  pruefe((await falschGesamt()) === falschVorher + 1, `Im Kasten als Fehler gezählt (${falschVorher} → ${await falschGesamt()})`)
  await h.locator('[data-weiter]').click()
  pruefe(
    (await da(h.locator('[data-sitzung-fertig]'), 3000)) || ((await h.locator('[data-urteil]').count()) === 0 && (await h.locator('[data-sitzung]').isVisible())),
    '„Weiter" führt zur nächsten Frage'
  )
  await h.goto(kastenUrl)
  await h.locator('[data-vokabel-kasten]').waitFor()
  await h.waitForTimeout(1300)
  await h.screenshot({ path: join(out, '2c3-zuwachs.png'), fullPage: true })
  await h.screenshot({ path: join(out, '2c-runde.png'), fullPage: true })
  // Gast: „Meine Materialien" statt Test-Code-Seite
  // Bisherige Liste/Türen (Rückfall zum Regal, 08.10.2026) – das Regal prüft server-regal.mjs
  await g1.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { materialien: 'liste' } })
  await h.goto(`${A}/s/`)
  pruefe(await da(h.locator('[data-gast-start] [data-gast-vokabeln]')), 'Gast-Startseite zeigt das Vokabeltraining')
  pruefe((await h.getByText('Schul-Apps · Onlinetest').count()) === 0, 'Kopfzeile nicht mehr „Onlinetest"')
  pruefe((await h.locator('[data-kopf-titel]').count()) === 0, 'Startseite der Gäste: kein Seitentitel, nur „Schul-Apps"')
  await h.screenshot({ path: join(out, '2d-gast-start.png'), fullPage: true })
  // Öffnen ohne Türanimation (08.10.2026: entfallen), kein weißes Aufblitzen im Dunkelmodus (frühes Skript im Seitenkopf)
  await h.locator('[data-gast-vokabeln]').first().click()
  pruefe(await da(h.locator('[data-vokabel-kasten]')), 'Klick in „Meine Materialien" öffnet das Vokabeltraining')
  pruefe((await h.locator('[data-tuer-uebergang]').count()) === 0, 'Keine Türanimation mehr')
  // Kopfzeile: deutlicher Knopf „Start" statt des Schriftzugs, daneben der Seitentitel
  pruefe(await da(h.locator('[data-start-knopf]')), 'Kopfzeile: Knopf „Start"')
  pruefe(/Vokabeltraining/.test((await h.locator('[data-kopf-titel]').innerText().catch(() => '')) ?? ''), 'Kopfzeile: Seitentitel „Vokabeltraining"')
  await h.screenshot({ path: join(out, '2e-kopf.png') })
  const ichJs = await (await g1.request.get(`${A}/server/ich.js`)).text()
  pruefe(ichJs.includes('schulapps-darstellung') && ichJs.includes('#242424'), 'Dunkler Hintergrund wird vor dem Programm gesetzt')
  const cookie = (await g1.cookies()).find((c) => c.name === 'sa_sitzung')
  pruefe(Boolean(cookie && cookie.expires * 1000 > Date.now() + 20 * 864e5), 'Gast bleibt über Wochen angemeldet (bis zum Ende des Zeitraums)')

  // Anderes Gerät: falscher, dann richtiger Code
  const g2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h2 = await g2.newPage()
  await h2.goto(`${A}/s/vt/${kurz.code}`)
  await h2.locator('[data-schon-dabei]').click()
  await h2.locator('[data-gastname]').fill('Ben T.')
  await h2.locator('[data-wieder-eingabe]').fill('AAAAAA')
  await h2.getByRole('button', { name: 'Weiterlernen' }).click()
  pruefe(await da(h2.getByText('passen nicht zusammen')), 'Falscher persönlicher Code wird abgelehnt')
  await h2.locator('[data-wieder-eingabe]').fill(wieder)
  await h2.getByRole('button', { name: 'Weiterlernen' }).click()
  pruefe(await da(h2.locator('[data-vokabel-kasten]')), 'Mit Name + persönlichem Code auf dem zweiten Gerät weiter')

  // Lehrkraft sieht den Gast im Lernstand, QR-Knopf
  await p.locator(`[data-vokabel-zuweisung="${vok.id}"]`).click()
  await kursKaestenAuf(p)
  pruefe(await da(p.locator('[data-lernstand]').getByText('Ben T.')), 'Gast im Lernstand der Lehrkraft')
  await p.locator('[data-vokabel-qr-zeigen]').click()
  pruefe(await da(p.getByRole('dialog').getByText(`/s/vt/${kurz.code}`)), 'QR-Code mit Code im Lernstand')
  await p.screenshot({ path: join(out, '3-lernstand-qr.png') })
  await p.keyboard.press('Escape')

  // Zeitraum abgelaufen → abgeschlossen, Gast kommt nicht mehr hinein
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/zeitraum`, { headers: KOPF, data: { bis: Date.now() - 1000 } })
  const zu = await g2.request.get(`${A}/s/api/vokabeln/zugang?code=${kurz.code}`)
  pruefe(zu.status() === 404, 'Nach Ablauf des Zeitraums kein Zugang mehr')
  // Löschen nimmt die Gastkonten mit
  const vorher = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer.length
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/loeschen`, { headers: KOPF, data: {} })
  const nachher = (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer.length
  pruefe(nachher === vorher - 1, `Löschen entfernt das Gastkonto (${vorher} → ${nachher})`)

  // ---------- Freigegebene Blätter: nach Lerngruppe, Liste leeren
  const frei = async (lerngruppeId, titel) =>
    (
      await lk.request.post(`${A}/server/blaetter/freigeben`, {
        headers: KOPF,
        data: { lerngruppeId, gaeste: !lerngruppeId, html: BLATT, aufgaben: [], rueckmeldung: { grundlage: { art: 'text', text: 'x' }, meta: {} }, titel }
      })
    ).json()
  const b1 = await frei(gruppe.id, 'Blatt A')
  const b2 = await frei('', 'Blatt B')
  pruefe(Boolean(b1.id && b2.id), `Zwei Blätter freigegeben (${b1.fehler ?? ''}${b2.fehler ?? ''})`)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  pruefe(await da(p.locator(`[data-freigabe-gruppe="${KLASSE}"]`)), 'Gruppiert nach Lerngruppe')
  pruefe(await da(p.locator('[data-freigabe-gruppe="gaeste"]')), 'Eigene Gruppe „Gäste per QR-Code"')
  await p.screenshot({ path: join(out, '4-freigaben.png') })
  // Teacher am Handy: QR-Link des Blatts zeigt das Namensfeld
  const lkHandy = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await lk.storageState() })
  const ph = await lkHandy.newPage()
  const liste = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  const mitCode = liste.find((x) => x.id === b2.id)
  await ph.goto(`${A}/s/w/${mitCode.code}`)
  pruefe(await da(ph.locator('[data-gastname]')), 'Lehrkraft am Handy: QR-Link zeigt das Namensfeld')
  pruefe(await ph.locator('[data-lehrkraft-hinweis]').isVisible(), 'Hinweis für die angemeldete Lehrkraft')
  await ph.screenshot({ path: join(out, '5-handy-lehrkraft.png') })
  // Beide beenden, Liste der abgeschlossenen leeren
  for (const b of [b1, b2]) await lk.request.post(`${A}/server/blaetter/${b.id}/status`, { headers: KOPF, data: { status: 'beendet' } })
  await p.reload()
  await p.waitForTimeout(1500)
  await p.locator('.app-leiste [aria-label="Freigegebene Blätter"]').click()
  await p.getByText('Abgeschlossen', { exact: true }).click()
  await p.locator('[data-abgeschlossene-leeren]').click()
  await p.locator('[data-leeren-bestaetigen]').click()
  await p.waitForTimeout(1200)
  const rest = (await (await lk.request.get(`${A}/server/blaetter`, { headers: KOPF })).json()).blaetter
  pruefe(rest.length === 0, `Liste geleert (${rest.length} übrig)`)

  // ---------- Verwaltung für Lehrkräfte: Daten und Material
  await p.locator('.app-leiste .leiste-gruppe-apps [aria-label="Verwaltung"]').click()
  pruefe(await da(p.locator('[data-datenverwaltung]')), 'Verwaltung (Daten und Material) für Lehrkräfte')
  await p.screenshot({ path: join(out, '6-verwaltung.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
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
