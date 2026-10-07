// Unterrichtsreihe mit KI planen (05.10.2026): Stunden, Planen (Attrappe „reihe_planung"), vorhandenes Material
// eingesetzt, Platzhalter direkt erzeugt („reihe_schritt_aufgabe"), Auswahl je Schritt (KI-Vorschlag „reihe_auswahl",
// übernehmen) – Lernende sehen keine Platzhalter, ausgeblendete Aufgaben fehlen, freiwillige sind markiert.
// Vorher: Server lokal mit KI-Attrappe. Der Test trägt seine Antworten selbst in die Attrappe ein und stellt sie danach wieder her.
// Vorlage: jüngstes echtes Arbeitsblatt mit mind. drei Aufgaben (nur gelesen).
// Aufruf: node tests/e2e/server-reihe-ki.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-reihe-ki')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
// Dieselbe Messung wie im Seitenrand-Test (Quelltext aus tests/e2e/seitenrand.mjs, Backslashes wie im Template)
const MESSUNG = readFileSync(new URL('./seitenrand.mjs', import.meta.url), 'utf8')
  .match(/const MESSUNG = `([\s\S]*?)`\n/)[1]
  .replace(/\\\\/g, '\\')
const KLASSE = `8k${Date.now() % 1000}`
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).filter((b) => b.type === 'task').length >= 3)
const meta = vorlage.payload.meta
const aufgaben = vorlage.payload.sheets[0].blocks.filter((b) => b.type === 'task')
const BLATT_ID = 'reihe-ki-blatt'

// Attrappe ergänzen (und am Ende wiederherstellen)
const attrappePfad = process.env.SCHULAPPS_KI_ATTRAPPE ?? join(process.env.TEMP ?? '', 'attrappe.json')
const attrappeAlt = readFileSync(attrappePfad, 'utf8')
const attrappe = JSON.parse(attrappeAlt)
const schritt = (o) => ({ rolle: 'pflicht', minuten: 20, lernziele: [0], begruendung: 'passt hier', beschreibung: '', material: '', ...o })
attrappe.antworten = {
  ...attrappe.antworten,
  reihe_planung: {
    hinweis: 'Im Plenum die Ergebnisse sichern.',
    teile: [
      {
        name: 'Einstieg',
        schritte: [
          schritt({ titel: 'Erste Begegnung', art: 'aufgabe', stunde: 1, beschreibung: 'Kurzer Auftrag zum Vorwissen' }),
          schritt({
            titel: 'Material bearbeiten',
            art: 'arbeitsblatt',
            stunde: 2,
            minuten: 40,
            material: BLATT_ID,
            begruendung: 'Lernziele und Jahrgang passen'
          })
        ]
      },
      { name: 'Sicherung', schritte: [schritt({ titel: 'Neues Übungsblatt', art: 'arbeitsblatt', stunde: 2, beschreibung: 'Übung mit Anwendung' })] }
    ]
  },
  reihe_schritt_aufgabe: {
    anweisung: 'Notiere drei Dinge, die du schon weißt.',
    material: '',
    fragen: ['Was fällt dir zuerst ein?'],
    antwort: 'text',
    erwartung: 'drei sinnvolle Stichpunkte',
    musterloesung: 'individuell'
  },
  reihe_auswahl: {
    eintraege: [
      { schluessel: aufgaben[1].id, stufe: 'aus', grund: 'sprengt die Zeit' },
      { schluessel: aufgaben[2].id, stufe: 'frei', grund: 'Vertiefung' }
    ],
    minuten: 20,
    hinweis: 'Aufgabe 2 entfällt, Aufgabe 3 freiwillig.'
  }
}
writeFileSync(attrappePfad, JSON.stringify(attrappe, null, 2))

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kai Testlehrer' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Ben Probe' } })
  ).json()
  const ben = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === ben.benutzer) zuLoeschen.push(n.id)

  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: {
      channel: 'sheets:save',
      args: [
        {
          id: BLATT_ID,
          name: 'Reihen-KI-Blatt',
          stats: { subjectId: meta.subjectId, subjectLabel: meta.subjectLabel, topic: meta.topic, grade: meta.grade, schoolTypeName: '', sheetCount: 1 },
          payload: vorlage.payload
        }
      ]
    }
  })
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, {
      headers: KOPF,
      data: { name: KLASSE, fach: meta.subjectLabel, iservGruppe: `klasse:${KLASSE}` }
    })
  ).json()
  const basis = {
    id: '',
    titel: 'KI-Reihe Probe',
    fachId: meta.subjectId,
    fachLabel: meta.subjectLabel,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    grade: meta.grade,
    oberthema: meta.topic,
    lernziele: [{ text: 'Ziel A', ichKann: 'Ich kann A' }],
    schritte: []
  }
  const gesp = await (await lk.request.post(`${A}/server/reihen/speichern`, { headers: KOPF, data: { reihe: basis } })).json()

  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Unterrichtsreihe"]').click()
  await p.mouse.move(800, 700)
  await p.locator('[data-reihe-karte="KI-Reihe Probe"] [data-reihe-oeffnen]').click()
  await p.locator('[data-reihe-editor]').waitFor({ timeout: 15000 })

  // Stunden: Einzel + Doppel
  await p.locator('[data-stunde-neu="einzel"]').click()
  await p.locator('[data-stunde-neu="doppel"]').click()
  pruefe((await p.locator('[data-stunde]').count()) === 2, 'Zwei Stunden angelegt (Einzel, Doppel)')
  // Planen
  await p.locator('[data-reihe-planen]').click()
  await p.locator('[data-planen-los]').waitFor()
  await p.waitForFunction(() => !document.querySelector('[data-planen-los]')?.hasAttribute('disabled'), null, { timeout: 20000 })
  await p.locator('[data-planen-los]').click()
  await p.locator('[data-plan-uebernehmen]').waitFor({ timeout: 30000 })
  await p.screenshot({ path: join(out, '1-plan.png'), fullPage: true })
  pruefe(await p.getByText('vorhandenes Material').first().isVisible(), 'Plan: vorhandenes Material eingesetzt')
  await p.locator('[data-plan-uebernehmen]').click()
  await p.waitForTimeout(500)
  pruefe((await p.locator('[data-schritt]').count()) === 3, `Drei Schritte übernommen (${await p.locator('[data-schritt]').count()})`)
  pruefe((await p.locator('[data-platzhalter]').count()) === 2, 'Zwei Platzhalter markiert')
  // Platzhalter Zwischenaufgabe direkt erzeugen
  await p.locator('[data-schritt]').first().locator('[data-platzhalter-erstellen]').click()
  await p.waitForTimeout(1500)
  pruefe((await p.locator('[data-platzhalter]').count()) === 1, 'Zwischenaufgabe erstellt – noch ein Platzhalter')
  // Auswahl im Material-Schritt: KI-Vorschlag übernehmen
  await p.locator('[data-schritt]').nth(1).locator('[data-schritt-bearbeiten]').click()
  await p.locator('[data-auswahl-feld] button').first().click()
  await p.locator('[data-auswahl-ki]').click()
  await p.locator('[data-auswahl-uebernehmen]').waitFor({ timeout: 20000 })
  await p.locator('[data-auswahl-uebernehmen]').click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(out, '2-auswahl.png'), fullPage: true })
  pruefe(await p.getByText('1 ausgeblendet, 1 freiwillig').isVisible(), 'Auswahl übernommen: 1 ausgeblendet, 1 freiwillig')
  await p.locator('[data-schritt-speichern]').click()
  await p.locator('[data-reihe-speichern]').click()
  await p.waitForTimeout(1500)

  const roh = (await (await lk.request.get(`${A}/server/reihen/${gesp.id}`, { headers: KOPF })).json()).reihe
  const blattSchritt = roh.schritte.find((x) => x.inhalt.art === 'arbeitsblatt' && x.inhalt.quelle === BLATT_ID)
  const html = blattSchritt?.inhalt.html ?? ''
  const strip = (s) =>
    String(s ?? '')
      .replace(/<[^>]+>|\*\*|\{[^}]*\}/g, '')
      .slice(0, 40)
  pruefe(
    Boolean(blattSchritt) && blattSchritt.inhalt.aufgaben.length === aufgaben.length - 1,
    `Schülerfassung: eine Aufgabe weniger (${blattSchritt?.inhalt.aufgaben.length} von ${aufgaben.length})`
  )
  pruefe(html.includes('ws-freiwillig') && html.includes('data-freiwillig'), 'Freiwillige Aufgabe markiert')
  pruefe(blattSchritt?.inhalt.aufgaben.some((x) => x.freiwillig) === true, 'Aufgabenliste für den Server: freiwillig gekennzeichnet')
  pruefe(!html.includes(strip(aufgaben[1].instruction)) || strip(aufgaben[1].instruction).length < 10, 'Ausgeblendete Aufgabe fehlt im Blatt')
  // Seiten gemessen wie im Editor: nichts ragt über den Satzspiegel (Messung aus seitenrand.mjs), Korrekturrand da
  pruefe(html.includes('ws-lines-rand'), 'Korrekturrand in der Schülerfassung (Vorgabe)')
  const druck = await lk.newPage()
  await druck.emulateMedia({ media: 'print' })
  await druck.setContent(html, { waitUntil: 'load' })
  await druck.waitForTimeout(800)
  const mess = await druck.evaluate(`${MESSUNG}('.ws-page', '.ws-body')`)
  pruefe(
    mess.seiten > 0 && mess.ueberlauf.length === 0,
    `Schülerfassung: ${mess.seiten} Seiten, nichts abgeschnitten${mess.ueberlauf.length ? ` → ${JSON.stringify(mess.ueberlauf[0])}` : ''}`
  )
  await druck.screenshot({ path: join(out, '3-fassung.png'), fullPage: true })
  await druck.close()
  // Sammeldruck der Reihe als PDF (Download im Browser)
  const dl = p.waitForEvent('download', { timeout: 60000 }).catch(() => null)
  await p.locator('[data-reihe-drucken]').click()
  await p.locator('[data-druck-art="pdf"]').click()
  const datei = await dl
  pruefe(Boolean(datei && datei.suggestedFilename().endsWith('.pdf')), `Reihe als PDF gespeichert (${datei?.suggestedFilename() ?? 'kein Download'})`)
  // Antwort mit Lebenszeichen davor (Leerzeichen) – erst trimmen
  const original = JSON.parse((await (await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'sheets:get', args: [BLATT_ID] } })).text()).trim())
  const origBlocks = original.value?.payload?.sheets?.[0]?.blocks ?? []
  pruefe(origBlocks.filter((b) => b.type === 'task').length === aufgaben.length, 'Original-Arbeitsblatt unverändert')

  // Zuweisen und als Lernender ansehen: Platzhalter erscheint nicht
  const z = await (await lk.request.post(`${A}/server/reihen/${gesp.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: gruppe.id } })).json()
  const reihen = (await (await lk.request.get(`${A}/server/reihen`, { headers: KOPF })).json()).reihen
  const zid = z.id ?? reihen.find((x) => x.id === gesp.id)?.zuweisungen?.[0]?.id
  const sb = await browser.newContext()
  await anmelden(sb, ben.benutzer, ben.passwort)
  await sb.request.post(`${A}/auth/passwort`, {
    form: { alt: ben.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const sicht = await (await sb.request.get(`${A}/s/api/reihe?id=${zid}`)).json()
  pruefe((sicht.schritte ?? []).length === 2, `Lernende: 2 Schritte ohne Platzhalter (${(sicht.schritte ?? []).length})`)
  await sb.close()

  // Gäste per QR-Code (05.10.2026): Beitritt mit Namen, Zugang zur Reihe UND zum verknüpften Blatt, entfernbar
  const zq = await (
    await lk.request.post(`${A}/server/reihen/${gesp.id}/zuweisen`, { headers: KOPF, data: { lerngruppeId: '', schueler: [], gaeste: true } })
  ).json()
  pruefe(Boolean(zq.code && zq.link?.includes('/s/rq/')), `Zuweisung für Gäste mit Code (${zq.code}, ${zq.link})`)
  const gast = await browser.newContext()
  const zugang = await (await gast.request.get(`${A}/s/api/reihe/zugang?code=${zq.code}`)).json()
  pruefe(zugang.titel === 'KI-Reihe Probe' && zugang.gaeste === true, 'Zugang per Code: Titel, Gäste erlaubt')
  const bei = await gast.request.post(`${A}/s/api/reihe/gast`, { headers: { ...KOPF, origin: A }, data: { code: zq.code, name: 'Lia T.' } })
  pruefe(bei.ok(), `Gast „Lia T.“ beigetreten (${bei.status()})`)
  // Der Blatt-Schritt ist noch gesperrt (erst die Zwischenaufgabe): Lehrkraft schaltet ihn für den Gast frei
  const lz0 = await (await lk.request.get(`${A}/server/reihen/z/${zq.id}`, { headers: KOPF })).json()
  const gastId0 = lz0.zuweisung?.perCode?.[0]
  const blattSchrittId = lz0.reihe.schritte.find((x) => x.inhalt?.art === 'arbeitsblatt' && !x.platzhalter)?.id
  await lk.request.post(`${A}/server/reihen/z/${zq.id}/aktion`, { headers: KOPF, data: { art: 'freischalten', schueler: gastId0, schritt: blattSchrittId } })
  const gsicht = await (await gast.request.get(`${A}/s/api/reihe?id=${zq.id}`)).json()
  const blattLink = (gsicht.schritte ?? []).map((x) => x.link).find((l) => String(l ?? '').startsWith('/s/b/'))
  pruefe((gsicht.schritte ?? []).length === 2 && Boolean(blattLink), `Gast sieht die Reihe mit Blatt-Link (${blattLink})`)
  const gblatt = await gast.request.get(`${A}/s/api/blatt?id=${String(blattLink).slice(5)}`)
  pruefe(gblatt.ok(), `Gast öffnet das verknüpfte Arbeitsblatt (${gblatt.status()})`)
  const seite = await gast.newPage()
  await seite.goto(`${A}/s/rq/${zq.code}`)
  await seite.waitForURL(/\/s\/r\//, { timeout: 15000 }).catch(() => undefined)
  pruefe(seite.url().includes(`/s/r/${zq.id}`), 'QR-Link führt angemeldete Gäste direkt in die Reihe')
  const lzq = await (await lk.request.get(`${A}/server/reihen/z/${zq.id}`, { headers: KOPF })).json()
  const gastId = lzq.zuweisung?.perCode?.[0]
  pruefe(Boolean(gastId) && lzq.lernende.some((l) => l.id === gastId), 'Lehrkraft sieht den Gast in der Übersicht')
  const weg = await lk.request.post(`${A}/server/reihen/z/${zq.id}/gast-entfernen`, { headers: KOPF, data: { nutzer: gastId } })
  pruefe(weg.ok(), 'Gast entfernt')
  const danach = await gast.request.get(`${A}/s/api/reihe?id=${zq.id}`)
  pruefe(!danach.ok(), `Entfernter Gast hat keinen Zugang mehr (${danach.status()})`)
  await gast.close()
} catch (e) {
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  writeFileSync(attrappePfad, attrappeAlt)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
