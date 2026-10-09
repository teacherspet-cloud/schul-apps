// Lern-App (03.10.2026): Vokabeltraining (Freigabe, Trainer, Lernstand), Lernraum (Türen, Karteikasten),
// Vokabel-Schritt in der Reihe und die LearningView-Ideen (Fragen, Korrektur-Eingang, „Zur Überarbeitung",
// Musterlösung, Lehrkraft-Ampel, Schüler-Vorschau).
// Vorher: Server lokal mit KI-Attrappe, IServ NICHT eingerichtet. Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-lernen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-lernen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `8l${Date.now() % 1000}`
const WOERTER = [
  { id: 'w1', term: 'weather', translation: 'Wetter', example: 'The weather is nice.' },
  { id: 'w2', term: 'sunny', translation: 'sonnig' },
  { id: 'w3', term: 'cloud', translation: 'Wolke' }
]

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
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()

  // ---------- Vokabeln freigeben (Schnittstelle wie der Dialog)
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gruppe.id, titel: 'Unit 1 Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER, testTermin: Date.now() + 5 * 86400000 }
    })
  ).json()
  pruefe(Boolean(vok.id), 'Vokabelliste für die Lerngruppe freigegeben')

  // ---------- Mia: Startseite → Trainer
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  s.on('dialog', (d) => void d.accept())
  await s.goto(`${A}/s/v/${vok.id}`)
  await s.locator('[data-vokabel-kasten]').waitFor({ timeout: 15000 })
  await s.screenshot({ path: join(out, '1-kasten.png'), fullPage: true })
  await s.locator('[data-vokabel-start]').click()
  await s.locator('[data-sitzung]').waitFor()
  const arten = new Set()
  for (let i = 0; i < 80; i++) {
    if (
      await s
        .locator('[data-sitzung-fertig]')
        .isVisible()
        .catch(() => false)
    )
      break
    if (
      await s
        .locator('[data-weiter]')
        .isVisible()
        .catch(() => false)
    ) {
      await s.locator('[data-weiter]').click()
      continue
    }
    if (
      await s
        .locator('[data-lernkarte]')
        .isVisible()
        .catch(() => false)
    ) {
      arten.add('karte')
      await s.locator('[data-lernkarte]').click()
      await s.waitForTimeout(300)
      await s.locator('[data-karte-gewusst]').click()
    } else if (
      await s
        .locator('[data-option]')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      arten.add('auswahl')
      await s.locator('[data-option]').first().click()
    } else if (
      await s
        .locator('[data-buchstabe]')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      arten.add('buchstaben')
      while ((await s.locator('[data-buchstabe]:not([disabled])').count()) > 0) await s.locator('[data-buchstabe]:not([disabled])').first().click()
      await s.locator('[data-pruefen]').click()
    } else if (
      await s
        .locator('[data-eingabe]')
        .isVisible()
        .catch(() => false)
    ) {
      arten.add('schreiben')
      await s.locator('[data-eingabe]').fill('weather')
      await s.locator('[data-pruefen]').click()
    } else await s.waitForTimeout(400)
    await s.waitForTimeout(250)
  }
  pruefe(await s.locator('[data-sitzung-fertig]').isVisible(), `Lernsitzung zu Ende gespielt (Abfragen: ${[...arten].join(', ')})`)
  await s.screenshot({ path: join(out, '2-sitzung-fertig.png'), fullPage: true })
  const lst = await (await lk.request.get(`${A}/server/vokabeln/${vok.id}`, { headers: KOPF })).json()
  const ml = lst.lernende?.[0]
  pruefe(Boolean(ml) && ml.tage7 === 1, `Lernstand bei der Lehrkraft: Mia heute aktiv (${ml?.tage7})`)
  pruefe(ml?.uebersicht?.neu === 0, `Alle 3 Wörter im Kasten, keins mehr neu (${JSON.stringify(ml?.uebersicht?.faecher)})`)
  pruefe(!JSON.stringify(lst).includes('"fehlerTexte"'), 'Lernstand ohne Rohdaten je Wort')

  // ---------- Tafelbild freigeben (wie der Knopf im Tafelbild-Export)
  const tafel = await (
    await lk.request.post(`${A}/server/tafeln/freigeben`, {
      headers: KOPF,
      data: {
        lerngruppeId: gruppe.id,
        titel: 'Tafelbild Wetter',
        fach: 'Englisch',
        thema: 'Wetter',
        bilder: [
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#2f4f3f"/><text x="20" y="60" fill="#fff" font-size="28">The weather</text></svg>'
        ]
      }
    })
  ).json()
  pruefe(Boolean(tafel.id), 'Tafelbild für die Lerngruppe freigegeben')

  // ---------- Lernraum: Fach → Zimmer → Karteikasten
  // Bisherige Liste (Rückfall zum Regal, 08.10.2026; die Türen sind entfallen) – das Regal prüft server-regal.mjs
  await sm.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { materialien: 'liste' } })
  await s.goto(`${A}/s/`)
  // „Mein Lernraum" auf der Startseite: Link zum Lernraum und die neuesten Materialien
  pruefe(await s.locator('[data-mein-lernraum] [data-neues-material]').first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'Mein Lernraum: neueste Materialien')
  await s.locator('[data-kachel="lernen"]').click()
  await s.locator('[data-fach-karte]').first().waitFor({ timeout: 15000 })
  pruefe((await s.locator('[data-fach-karte]').count()) >= 1, 'Lernraum: Karte für das Fach')
  pruefe((await s.locator('[data-tuer], .lr-tuer').count()) === 0, 'Lernraum ohne Türen')
  await s.screenshot({ path: join(out, '3-faecher.png'), fullPage: true })
  await s.locator('[data-fach-karte]').first().click()
  await s.locator('[data-zimmer]').waitFor({ timeout: 15000 })
  pruefe((await s.locator('[data-karteikasten]').count()) >= 1, 'Zimmer: Karteikasten mit den Vokabeln')
  pruefe((await s.locator('[data-mappe]').count()) >= 1, 'Zimmer: Mappe mit dem Tafelbild')
  await s.locator('[data-mappe]').first().click()
  pruefe(
    await s
      .locator('[data-mappenseite] img')
      .first()
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Mappe aufgeschlagen: Tafelbild als Seite'
  )
  await s.waitForTimeout(800)
  await s.screenshot({ path: join(out, '4b-mappe.png'), fullPage: true })
  await s.keyboard.press('Escape')
  await s.waitForTimeout(1200)
  await s.screenshot({ path: join(out, '4-zimmer.png'), fullPage: true })

  // ---------- Reihe mit Vokabel-Schritt, Aufgabe mit Musterlösung und Selbsteinschätzung
  const ziel = (t) => ({ text: t, ichKann: `Ich kann ${t}` })
  const basis = {
    id: '',
    titel: 'Weather words',
    fachId: 'englisch',
    fachLabel: 'Englisch',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: 8,
    oberthema: 'Wetter',
    lernziele: [ziel('über das Wetter sprechen')],
    schritte: [
      {
        id: 'sa',
        titel: 'Dein Wetter',
        lernziele: [ziel('das Wetter beschreiben')],
        rolle: 'wahl',
        erfolg: { art: 'lehrkraft' },
        inhalt: {
          art: 'aufgabe',
          anweisung: 'Describe the weather.',
          material: '',
          link: '',
          fragen: [],
          antwort: 'text',
          erwartung: '',
          feedback: false,
          musterloesung: 'It is sunny and warm.'
        }
      },
      {
        id: 'sv',
        titel: 'Wetter-Vokabeln',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'punkte', schwelle: 80 },
        inhalt: { art: 'vokabeln', titel: 'Wetter', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
      },
      {
        id: 'sr',
        titel: 'Wie sicher bist du?',
        lernziele: [],
        rolle: 'wahl',
        erfolg: { art: 'abgabe' },
        inhalt: { art: 'reflexion', frage: 'Was war schwer?' }
      }
    ]
  }
  const gesp = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: basis } })).json()
  const zug = await (await lk.request.post(`${A}/server/reihen/${gesp.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: gruppe.id } })).json()
  const zid = zug.id
  pruefe(Boolean(zid), 'Reihe mit Vokabel-Schritt zugewiesen')
  const sicht = await (await sm.request.get(`${A}/s/api/reihe?id=${zid}`, { headers: KOPF })).json()
  const svLink = sicht.schritte?.find((x) => x.id === 'sv')?.link ?? ''
  pruefe(svLink.startsWith('/s/v/'), `Vokabel-Schritt führt zum Trainer (${svLink})`)
  pruefe(!JSON.stringify(sicht).includes('It is sunny and warm.'), 'Musterlösung vor dem Abgeben nicht bei den Lernenden')

  // Mia: Frage stellen, abgeben, Musterlösung sehen
  await s.goto(`${A}/s/r/${zid}`)
  await s.locator('[data-station]').nth(0).click()
  await s.locator('[data-frage-knopf]').click()
  await s.locator('[data-frage-text]').fill('Darf ich auch über Regen schreiben?')
  await s.locator('[data-frage-senden]').click()
  await s.waitForTimeout(800)
  await s.locator('[data-reihe-antwort]').fill('It is cloudy. It rains a little.')
  await s.locator('[data-reihe-abgeben]').click()
  await s.waitForTimeout(1000)
  await s.reload()
  pruefe(
    await s
      .locator('[data-musterloesung]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Nach dem Abgeben: Musterlösung sichtbar'
  )
  await s.screenshot({ path: join(out, '5-musterloesung.png'), fullPage: true })

  // Lehrkraft: Korrektur-Eingang
  const ein = (await (await lk.request.get(`${A}/server/reihen/eingang`, { headers: KOPF })).json()).eintraege ?? []
  pruefe(
    ein.some((e) => e.art === 'frage') && ein.some((e) => e.art === 'bewerten'),
    `Korrektur-Eingang: Frage und Abgabe (${ein.map((e) => e.art).join(', ')})`
  )
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await p.locator('[data-eingang]').waitFor({ timeout: 15000 })
  await p.screenshot({ path: join(out, '6-eingang.png'), fullPage: true })
  await p.locator('[data-eingang-antwort]').first().fill('Ja, gern!')
  await p.locator('[data-eingang-antworten]').first().click()
  await p.waitForTimeout(1000)
  // Zur Überarbeitung (wie der Knopf im Detail)
  const sid = (await (await lk.request.get(`${A}/server/reihen/z/${zid}`, { headers: KOPF })).json()).lernende[0].id
  await lk.request.post(`${A}/server/reihen/z/${zid}/aktion`, {
    headers: KOPF,
    data: { art: 'ueberarbeiten', schueler: sid, schritt: 'sa', text: 'Bitte noch einen Satz zur Temperatur.' }
  })
  await lk.request.post(`${A}/server/reihen/z/${zid}/aktion`, { headers: KOPF, data: { art: 'lehrkraft-ampel', schueler: sid, ziel: 1, farbe: 'gelb' } })
  const z1 = await (await lk.request.get(`${A}/server/reihen/z/${zid}`, { headers: KOPF })).json()
  pruefe(z1.lernende[0].stand.lehrkraftAmpel?.['1'] === 'gelb', 'Lehrkraft-Ampel je Lernziel gespeichert')
  // Mia sieht Antwort und Überarbeitungs-Hinweis, reicht neu ein
  await s.goto(`${A}/s/r/${zid}`)
  await s.locator('[data-station]').first().waitFor()
  const st1 = await s.locator('[data-station]').evaluateAll((e) => e.map((x) => x.getAttribute('data-station')))
  pruefe(st1[0] === 'offen', `Nach „Zur Überarbeitung": Schritt wieder offen (${st1.join(', ')})`)
  await s.locator('[data-station]').nth(0).click()
  const da = (l) =>
    l.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    )
  pruefe(await da(s.locator('[data-ueberarbeiten-hinweis]')), 'Hinweis „Bitte überarbeiten" mit Kommentar')
  pruefe(await da(s.getByText('Ja, gern!')), 'Antwort der Lehrkraft auf die Frage sichtbar')
  pruefe((await s.getByText('Ich kann Ich kann').count()) === 0, 'Lernziele ohne doppeltes „Ich kann"')
  await s.screenshot({ path: join(out, '7-ueberarbeiten.png'), fullPage: true })
  await s.locator('[data-reihe-antwort]').fill('It is cloudy. It rains a little. It is 12 degrees.')
  await s.locator('[data-reihe-abgeben]').click()
  await s.waitForTimeout(1000)
  const z2 = await (await lk.request.get(`${A}/server/reihen/z/${zid}`, { headers: KOPF })).json()
  pruefe(
    z2.bedarf.some((b) => b.art === 'bewerten' && b.schritt === 'sa'),
    'Neu eingereicht: wieder im Handlungsbedarf zum Bestätigen'
  )

  // Schüler-Vorschau im Editor
  await p.locator('[data-reihe-karte="Weather words"] [data-reihe-oeffnen]').click()
  await p.locator('[data-reihe-editor]').waitFor({ timeout: 15000 })
  // Ablauf-Simulator heißt seit 08.10.2026 „Ablauf testen" (Expertenmodus); „Als Schüler ansehen" öffnet die echte Schülerseite
  await p.locator('[data-ablauf-testen]').click()
  await p.locator('[data-vorschau]').waitFor()
  await p.locator('[data-vorschau-geschafft]').first().click()
  pruefe((await p.locator('[data-vorschau-station="geschafft"]').count()) === 1, 'Schüler-Vorschau: simuliertes „geschafft"')
  await p.screenshot({ path: join(out, '8-vorschau.png'), fullPage: true })

  await lk.request.post(`${A}/server/reihen/${gesp.id}/loeschen`, { headers: KOPF, data: {} })
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 8).join(' | ')}`)
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
