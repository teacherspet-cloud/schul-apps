// Etappe 6 (02.10.2026): Unterrichtsreihe – Lehrkraft baut und weist zu, eine Schülerin geht den Weg.
// Vorher: Server lokal mit KI-Attrappe („reihe_lernziele", „schritt_lernziele", „rueckmeldung_bogen",
// „blatt_aufgabe_feedback"), IServ NICHT eingerichtet. Vorlage: jüngstes echtes Arbeitsblatt (nur gelesen).
// Aufruf: node tests/e2e/server-reihe.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-reihe')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `7r${Date.now() % 1000}`
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 2)

const ziel = (t) => ({ text: t, ichKann: `Ich kann ${t}` })
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
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'reihe-blatt', name: 'Reihen-Blatt', stats: { sheetCount: 1 }, payload: vorlage.payload }] }
  })
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()

  // Grundgerüst der Reihe (über die Schnittstelle), danach in der Oberfläche: Lernziele (KI), Arbeitsblatt-Schritt, Zuweisen
  const basis = {
    id: '',
    titel: 'Weather around the world',
    fachId: 'englisch',
    fachLabel: 'Englisch',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: 7,
    oberthema: 'Wetter und Klima',
    lernziele: [],
    teile: ['Teil 1', 'Abschluss'],
    schritte: [
      {
        id: 'sd',
        titel: 'Was kannst du schon?',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        inhalt: {
          art: 'diagnose',
          fragen: [
            { frage: 'sunny – Deutsch?', optionen: [], richtig: 'sonnig' },
            { frage: 'rain – past?', optionen: ['rained', 'rainen'], richtig: 'rained' }
          ],
          schwelle: 100,
          ueberspringen: ['sk']
        }
      },
      {
        id: 'sk',
        titel: 'Wetterwörter',
        abschnitt: 'Teil 1',
        lernziele: [ziel('Wetterwörter nennen')],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        inhalt: {
          art: 'lernkarten',
          karten: [
            { vorne: 'sunny', hinten: 'sonnig' },
            { vorne: 'windy', hinten: 'windig' }
          ]
        }
      },
      {
        id: 'sa',
        titel: 'Dein Wetter heute',
        abschnitt: 'Teil 1',
        lernziele: [ziel('das Wetter beschreiben')],
        rolle: 'pflicht',
        erfolg: { art: 'ki', schwelle: 'teilweise' },
        inhalt: {
          art: 'aufgabe',
          anweisung: 'Describe today’s weather in 3 sentences.',
          material: '',
          link: '',
          fragen: [],
          antwort: 'text',
          erwartung: 'Three sentences, weather words.',
          feedback: true
        }
      },
      {
        id: 'sh',
        abschnitt: 'Abschluss',
        titel: 'Merkkasten: Wetter',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        nach: 'sa',
        inhalt: { art: 'hefter', text: 'It is sunny / rainy / windy.' }
      },
      {
        id: 'sr',
        abschnitt: 'Abschluss',
        titel: 'Wie sicher bist du?',
        halt: { art: 'freigabe' },
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'abgabe' },
        inhalt: { art: 'reflexion', frage: 'Was war schwer?' }
      },
      {
        id: 'sp',
        abschnitt: 'Abschluss',
        titel: 'Wetterbericht als Plakat',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: { art: 'lehrkraft' },
        inhalt: { art: 'abschluss', anweisung: 'Make a weather poster.', raster: ['Wetterwörter', 'Bilder'] }
      }
    ]
  }
  const gesp = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: basis } })).json()
  pruefe(Boolean(gesp.id), 'Reihe gespeichert')

  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await p.mouse.move(800, 700)
  await p.locator('[data-reihe-karte="Weather around the world"] [data-reihe-oeffnen]').click()
  await p.locator('[data-reihe-editor]').waitFor({ timeout: 15000 })
  // Kopf einer Reihe mit Schritten ist eingeklappt (08.10.2026) – aufklappen
  pruefe(await p.locator('[data-reihe-kopf-zeile]').isVisible(), 'Kopf der Reihe mit Schritten eingeklappt (eine Zeile)')
  await p.locator('[data-reihe-kopf-auf]').click()
  // Lernziele der Reihe: KI schlägt vor
  await p.locator('[data-lernziele-ki]').first().click()
  await p.locator('[data-vorschlaege-uebernehmen]').click()
  pruefe(
    (await p
      .getByText('Ich kann das Wetter auf Englisch beschreiben.')
      .count()
      .then((n) => n > 0)
      .catch(() => false)) || (await p.locator('input[value="Ich kann das Wetter auf Englisch beschreiben."]').count()) > 0,
    'KI-Vorschläge für die Lernziele der Reihe übernommen'
  )
  // Arbeitsblatt-Schritt über den Dialog
  // Teil anlegen (03.10.2026), dann den Arbeitsblatt-Schritt in diesen Teil
  await p.locator('[data-teil-neu]').click()
  pruefe((await p.locator('[data-teil="Teil 2"]').count()) === 1, 'Neuer Teil „Teil 2" angelegt (leer)')
  await p.locator('[data-teil="Teil 2"] [data-teil-name]').fill('Vertiefung')
  await p.locator('[data-teil="Teil 2"] [data-teil-name]').press('Enter')
  pruefe((await p.locator('[data-teil="Vertiefung"]').count()) === 1, 'Teil umbenannt in „Vertiefung"')
  await p.locator('[data-teil="Vertiefung"] [data-schritt-neu]').click()
  await p.locator('[data-schritt-art="arbeitsblatt"]').click()
  await p.locator('[data-ablage-wahl]').click()
  await p.getByRole('option', { name: 'Reihen-Blatt' }).click()
  await p.waitForTimeout(1500)
  await p.locator('[data-schritt-titel]').fill('Arbeitsblatt Wetter')
  await p.screenshot({ path: join(out, '1-schritt-dialog.png') })
  await p.locator('[data-schritt-speichern]').click()
  await p.locator('[data-reihe-speichern]').click()
  await p.waitForTimeout(1500)
  await p.screenshot({ path: join(out, '2-editor.png'), fullPage: true })
  // Zuweisen (die Meldung „Gespeichert." liegt oben rechts darüber – schließen)
  await p
    .locator('.mantine-Notification-root .mantine-CloseButton-root')
    .first()
    .click()
    .catch(() => undefined)
  await p.waitForTimeout(400)
  await p.locator('[data-reihe-zuweisen]').click()
  await p.getByRole('dialog').getByPlaceholder('wählen …').click()
  await p.getByRole('option', { name: KLASSE }).click()
  await p.locator('[data-zuweisen-los]').click()
  await p.waitForTimeout(1500)
  const reihen = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen
  const r0 = reihen.find((x) => x.id === gesp.id)
  pruefe(r0?.schritte === 7 && r0.zuweisungen.length === 1, `Reihe mit 7 Schritten, zugewiesen (${r0?.schritte}, ${r0?.zuweisungen.length})`)
  const zid = r0.zuweisungen[0].id

  // ---------- Mia
  const sm = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const s = await sm.newPage()
  s.on('dialog', (d) => void d.accept())
  await s.goto(`${A}/s/`)
  await s.locator('[data-kachel="reihen"]').click()
  await s.locator('[data-reihe-eintrag]').first().click()
  await s.locator('[data-reihe-weg]').waitFor()
  const status = async () => {
    await s.locator('[data-station]').first().waitFor()
    return s.locator('[data-station]').evaluateAll((e) => e.map((x) => x.getAttribute('data-station')))
  }
  pruefe((await status())[0] === 'offen' && (await status())[1] === 'gesperrt', `Weg am Anfang: ${(await status()).join(', ')}`)
  pruefe(await s.getByText('Ich kann das Wetter auf Englisch beschreiben.').isVisible(), 'Lernziele der Reihe sichtbar')
  await s.screenshot({ path: join(out, '3-weg-anfang.png'), fullPage: true })
  // Diagnose: nicht bestanden → Lernkarten werden nicht übersprungen
  await s.locator('[data-station]').first().click()
  await s.locator('[data-diagnose] input').first().fill('sonnig')
  await s.locator('[data-diagnose-abgeben]').click()
  await s.getByText('% richtig').waitFor()
  await s.goto(`${A}/s/r/${zid}`)
  pruefe((await status())[1] === 'offen', 'Diagnose nicht bestanden: Lernkarten sind dran (nicht übersprungen)')
  // Lernkarten
  await s.locator('[data-station]').nth(1).click()
  for (let i = 0; i < 2; i++) {
    await s.locator('[data-karte-umdrehen]').click()
    await s.locator('[data-karte-gewusst]').click()
  }
  await s.locator('[data-karten-fertig]').click()
  await s.goto(`${A}/s/r/${zid}`)
  // Zwischenaufgabe mit KI-Feedback
  await s.locator('[data-station]').nth(2).click()
  await s.locator('[data-reihe-antwort]').fill('It is sunny today. It is warm. There is no wind.')
  await s.locator('[data-reihe-abgeben]').click()
  pruefe(
    await s
      .locator('[data-reihe-bogen]')
      .waitFor({ timeout: 60000 })
      .then(
        () => true,
        () => false
      ),
    'Zwischenaufgabe: KI-Feedback (Bogen)'
  )
  await s.goto(`${A}/s/r/${zid}`)
  let st = await status()
  pruefe(st[2] === 'geschafft', `Zwischenaufgabe geschafft (alle Kriterien mind. teilweise): ${st.join(', ')}`)
  pruefe(await s.locator('[data-abzeichen]').isVisible(), 'Abzeichen „Teil 1"')
  pruefe(await s.locator('[data-hefter-knopf]').isVisible(), 'Hefter-Eintrag freigeschaltet')
  // Haltepunkt vor der Selbsteinschätzung
  pruefe(st[4] === 'gesperrt', 'Haltepunkt: Selbsteinschätzung wartet auf die Besprechung')
  // Hilfe anfordern
  await s.locator('[data-hilfe-knopf]').click()
  await s.locator('[data-hilfe-senden]').click()
  await s.waitForTimeout(800)
  // ---------- Lehrkraft: Übersicht
  await p.locator('[data-reihe-editor] button', { hasText: 'Alle Reihen' }).click()
  await p.locator('[data-zuweisung-oeffnen]').first().click()
  await p.locator('[data-reihe-uebersicht]').waitFor()
  pruefe(await p.getByText('bittet um Hilfe').isVisible(), 'Übersicht: Hilferuf im Handlungsbedarf')
  await p.screenshot({ path: join(out, '4-uebersicht.png'), fullPage: true })
  // Lehrkraft gibt den Haltepunkt frei (Mia wartet dort)
  await p.locator('[data-halt-freigeben]').first().waitFor({ timeout: 10000 })
  await p.locator('[data-halt-freigeben]').first().click()
  await p.waitForTimeout(800)
  await s.goto(`${A}/s/r/${zid}`)
  st = await status()
  pruefe(st[4] === 'offen', `Nach der Freigabe: Selbsteinschätzung offen (${st[4]})`)
  // Selbsteinschätzung
  await s.locator('[data-station]').nth(4).click()
  const gruen = s.locator('[data-reflexion] label', { hasText: 'sicher' })
  await gruen.first().waitFor()
  const n = await gruen.count()
  for (let i = 0; i < n; i++) await gruen.nth(i).click()
  pruefe(n >= 4, `Selbsteinschätzung zu ${n} Lernzielen (Reihe + Schritte bis hier)`)
  await s.locator('[data-reflexion-abgeben]').click()
  await s.waitForTimeout(800)
  // Abschlussprodukt: Foto hochladen, abgeben
  await s.goto(`${A}/s/r/${zid}`)
  await s.locator('[data-station]').nth(5).click()
  await sm.request.post(`${A}/s/api/reihe/schritt`, { headers: KOPF, data: { id: zid, schritt: 'sp', aktion: 'datei', name: 'plakat.png', daten: PNG } })
  await s.reload()
  await s.locator('[data-reihe-antwort]').fill('Mein Plakat zeigt das Wetter in London und Berlin.')
  await s.locator('[data-reihe-abgeben]').click()
  await s.waitForTimeout(1000)
  // Lehrkraft bewertet
  await p.locator('button', { hasText: 'Aktualisieren' }).click()
  await p.locator('[data-bedarf-ansehen]').first().waitFor({ timeout: 10000 })
  await p.locator('[data-bedarf-ansehen]').first().click()
  pruefe(
    await p
      .locator('.mantine-Modal-body img')
      .first()
      .isVisible()
      .catch(() => false),
    'Lehrkraft sieht das hochgeladene Foto'
  )
  await p.locator('[data-bewerten-geschafft]').click()
  await p.waitForTimeout(800)
  // Mia füllt zuletzt das Arbeitsblatt aus (Link aus der Reihe)
  await s.goto(`${A}/s/r/${zid}`)
  st = await status()
  pruefe(st[5] === 'geschafft' && st[6] === 'offen', `Abschlussprodukt bestätigt, Arbeitsblatt dran: ${st.join(', ')}`)
  await s.locator('[data-station]').nth(6).click()
  await s.locator('[data-feld]').first().waitFor({ timeout: 20000 })
  pruefe(await s.locator('[data-zur-reihe]').isVisible(), 'Arbeitsblatt aus der Reihe: „Zur Unterrichtsreihe"')
  await s.locator('input[data-feld], textarea[data-feld]').first().fill('My answer')
  await s.locator('[data-blatt-einreichen]').click()
  await s.locator('[data-blatt-bogen]').waitFor({ timeout: 90000 })
  await s.goto(`${A}/s/r/${zid}`)
  const fortschritt = await s.locator('[data-reihe-weg]').textContent()
  pruefe(/100 %/.test(fortschritt) && /ganze Reihe geschafft/.test(fortschritt), 'Arbeitsblatt mit KI-Bogen geschafft – Reihe 100 %')
  await s.screenshot({ path: join(out, '5-weg-fertig.png'), fullPage: true })
  await p.locator('button', { hasText: 'Aktualisieren' }).click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '6-uebersicht-fertig.png'), fullPage: true })
  // Keine Lösungen bei den Lernenden
  const roh = JSON.stringify(await (await sm.request.get(`${A}/s/api/reihe?id=${zid}`, { headers: KOPF })).json())
  pruefe(!roh.includes('Three sentences, weather words') && !roh.includes('"richtig"'), 'Lernende bekommen keine Erwartungen und keine Diagnose-Lösungen')
  // Zuweisen an eine einzelne Schülerin ohne Lerngruppe (03.10.2026)
  const einzeln = await (
    await lk.request.post(`${A}/server/reihen/${gesp.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: '', schueler: [mia.benutzer] } })
  ).json()
  const miaReihen = (await (await sm.request.get(`${A}/s/api/reihen`, { headers: KOPF })).json()).reihen ?? []
  pruefe(
    Boolean(einzeln.id) && miaReihen.some((x) => x.id === einzeln.id),
    'Reihe an eine einzelne Schülerin (ohne Lerngruppe) zugewiesen und bei ihr sichtbar'
  )
  const zEinzeln = await (await lk.request.get(`${A}/server/reihen/z/${einzeln.id}`, { headers: KOPF })).json()
  pruefe(
    zEinzeln.lernende?.length === 1 && zEinzeln.zuweisung.lerngruppe === 'Einzelne Lernende',
    `Übersicht: 1 Lernende, „Einzelne Lernende" (${zEinzeln.lernende?.length})`
  )
  await lk.request.post(`${A}/server/reihen/${gesp.id}/loeschen`, { headers: KOPF, data: {} })
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
