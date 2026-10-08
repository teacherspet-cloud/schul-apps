// „Meine Klassen" (06.10.2026, abgestimmt): Lerngruppen als „5b – Englisch" alphabetisch, Lernstand, Handlungsbedarf,
// Vorschlag „Wackelige Wörter" ansehen und freischalten. Ohne KI (das Übungsblatt wird nur angeboten, nicht erzeugt).
// Vorher: Server lokal, IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-meineklassen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-meineklassen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const N = Date.now() % 1000
const K5 = `5k${N}`
const K10 = `10k${N}`
const K7 = `7k${N}`
const VORLAGE = {
  version: 1,
  meta: { title: 'Probe', subjectId: 'englisch', subjectLabel: 'Englisch', grade: 5, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'Probe', aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const WOERTER = ['weather', 'sunny', 'cloud', 'rain', 'wind', 'snow', 'storm'].map((t, i) => ({
  id: `w${i}`,
  term: t,
  translation: ['Wetter', 'sonnig', 'Wolke', 'Regen', 'Wind', 'Schnee', 'Sturm'][i]
}))
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kai Klasse' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: K5, namen: 'Mia Probe\nBen Test' } })
  ).json()
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer)
    if (liste.angelegt.some((a) => a.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const neu = async (name, fach) =>
    (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name, fach, iservGruppe: `klasse:${name}` } })).json()
  const g10 = await neu(K10, 'Englisch')
  const gGe = await neu(K5, 'Geschichte')
  const gEn = await neu(K5, 'Englisch')
  const gOhne = await neu(K7, '')
  void g10
  void gOhne
  const vok = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gEn.id, titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: WOERTER }
    })
  ).json()
  // Zwei Blätter: eins mit Frist (morgen), eins ohne – Standard: offene mit Frist zuerst
  const blatt = async (titel, bis) =>
    (
      await lk.request.post(`${A}/server/blaetter/freigeben`, {
        headers: KOPF,
        data: {
          titel,
          html: `<!doctype html><html><body><div class="ws-page"><p>${titel}</p></div></body></html>`,
          aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
          rueckmeldung: { ...VORLAGE, meta: { ...VORLAGE.meta, title: titel }, grundlage: { ...VORLAGE.grundlage, titel } },
          lerngruppeId: gEn.id,
          schueler: [],
          einstellungen: { feedback: false, ...(bis ? { bis } : {}) }
        }
      })
    ).json()
  await blatt('Ohne Frist', null)
  await blatt('Mit Frist', Date.now() + 86_400_000)
  // Mia übt: alle Wörter kennengelernt, fünf davon dreimal falsch geschrieben → wackelig
  const mia = liste.angelegt[0]
  const sm = await browser.newContext()
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  for (const w of WOERTER)
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'karte', gewusst: true } })
  for (const w of WOERTER.slice(0, 5))
    for (let i = 0; i < 3; i++)
      await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'frei', antwort: 'xyz' } })

  // ---------- Schnittstelle: eine Karte je Klasse, Fächer darunter
  const uebersicht = await (await lk.request.get(`${A}/server/klassen`, { headers: KOPF })).json()
  const namen = uebersicht.klassen.map((k) => `${k.name}:${k.faecher.map((f) => f.fach).join('+')}`)
  pruefe(
    JSON.stringify(namen) === JSON.stringify([`${K5}:Englisch+Geschichte`, `${K7}:`, `${K10}:Englisch`]),
    `Eine Karte je Klasse, Zahlen natürlich (${namen.join(' · ')})`
  )
  const d = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
  pruefe(d.lernende.length === 2 && d.lernende.some((l) => l.vokabelnSicher !== null), `Lernende mit Lernstand (${d.lernende.length})`)
  pruefe(d.wackelig.length >= 5, `Wackelige Wörter der Klasse (${d.wackelig.length})`)
  pruefe(d.sprachfach === true && d.ablageMuster === 'Gruppen/Klasse {Klasse}/{Fach}', `Sprachfach, Ablagestruktur (${d.ablageMuster})`)
  pruefe(
    d.vokabeln[0]?.woerter === 7 && d.vokabeln[0]?.probleme.length >= 1,
    `Vokabel-Details: Umfang, schwierigste Wörter (${d.vokabeln[0]?.probleme.length})`
  )
  pruefe(
    d.blaetter.some((b) => b.bis && b.nichtBegonnen.length === 2),
    'Blatt-Details: Frist, wer noch nicht begonnen hat'
  )
  pruefe(
    d.bedarf.some((b) => b.art === 'inaktiv' || b.art === 'foerdern'),
    `Handlungsbedarf erkannt (${d.bedarf.map((b) => b.art).join(', ')})`
  )
  // 08.10.2026: höchstens EIN Vokabel-Eintrag je Klasse, junger Kurs ohne „unter 30 % sicher", Ziel ist der Kurs
  const vokBedarf = d.bedarf.filter((b) => b.ziel?.modul === 'vokabeltraining')
  pruefe(vokBedarf.length === 1, `Ein Vokabel-Eintrag im Handlungsbedarf (${vokBedarf.length})`)
  pruefe(!vokBedarf.some((b) => /unter 30/.test(b.text)), 'Junger Kurs: kein „unter 30 % sicher“')
  pruefe(vokBedarf[0]?.ziel?.id === vok.id, `Klick öffnet den Kurs der Klasse (${vokBedarf[0]?.ziel?.id})`)
  pruefe(
    d.vokabeln[0]?.anteil && typeof d.vokabeln[0]?.heuteAktiv === 'number',
    `Kurs-Karte: Anteile und „heute aktiv“ (${JSON.stringify(d.vokabeln[0]?.anteil)}, ${d.vokabeln[0]?.heuteAktiv})`
  )
  pruefe(
    d.vorschlaege.some((v) => v.art === 'vokabeln'),
    'Vorschlag: Vokabeltraining „Wackelige Wörter“'
  )
  const dGe = await (await lk.request.get(`${A}/server/klassen/${gGe.id}`, { headers: KOPF })).json()
  pruefe(dGe.sprachfach === false, 'Geschichte ist kein Sprachfach')

  // ---------- Oberfläche
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  // Neue Konten beginnen im Standardmodus (07.10.2026) – die Sortierpfeile gibt es nur im Expertenmodus
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 10000 })
  const karten = await p.locator('[data-klasse]').evaluateAll((e) => e.map((x) => x.getAttribute('data-klasse')))
  pruefe(JSON.stringify(karten) === JSON.stringify([K5, K7, K10]), `Karten je Klasse in der App (${karten.join(' · ')})`)
  // Gleiche Ausrichtung: Karten gleich hoch, Inhalt der Karte ohne Fach nicht nach oben gerutscht
  const lage = await p.locator('[data-klasse]').evaluateAll((e) =>
    e.map((x) => {
      const r = x.getBoundingClientRect()
      const k = x.firstElementChild.getBoundingClientRect()
      return { h: Math.round(r.height), oben: Math.round(k.top - r.top) }
    })
  )
  pruefe(new Set(lage.map((l) => l.h)).size === 1 && lage.every((l) => l.oben >= 14), `Karten gleich hoch, Inhalt ausgerichtet (${JSON.stringify(lage)})`)
  await p.screenshot({ path: join(out, '1-uebersicht.png') })

  // Klasse ohne Fach: nur „+ Fach hinzufügen"
  await p.locator(`[data-klasse="${K7}"]`).click()
  pruefe(await da(p.locator('[data-ohne-fach]')), 'Klasse ohne Fach: Hinweis und „+ Fach hinzufügen“')
  pruefe((await p.locator('[data-fach-leiste] [data-fach]').count()) === 0, 'Noch keine Fach-Reiter')
  await p.screenshot({ path: join(out, '2-ohne-fach.png') })
  await p.locator('[data-fach-hinzufuegen]').click()
  await p.locator('[data-fach-wahl]').click()
  await p.getByRole('option', { name: 'Französisch', exact: true }).click()
  pruefe(await da(p.locator('[data-fach-leiste] [data-fach="Französisch"]')), 'Fach hinzugefügt: Reiter „Französisch“')
  pruefe(await da(p.locator('[data-handlungsbedarf]')), 'Danach Handlungsbedarf und Reiter des Fachs')
  await p.screenshot({ path: join(out, '2b-fach-neu.png') })
  await p.getByRole('button', { name: 'Alle Klassen' }).click()

  // Klasse mit zwei Fächern
  await p.locator(`[data-klasse="${K5}"]`).click()
  await p.locator('[data-fach-leiste] [data-fach]').first().waitFor({ timeout: 10000 })
  const faecher = await p.locator('[data-fach-leiste] [data-fach]').evaluateAll((e) => e.map((x) => x.getAttribute('data-fach')))
  pruefe(JSON.stringify(faecher) === JSON.stringify(['Englisch', 'Geschichte']), `Fach-Leiste (${faecher.join(' | ')})`)
  await p.locator('[data-handlungsbedarf]').waitFor({ timeout: 10000 })
  const leisteOben = await p.locator('[data-fach-leiste]').boundingBox()
  const bedarfOben = await p.locator('[data-handlungsbedarf]').boundingBox()
  pruefe(leisteOben.y < bedarfOben.y, 'Fach-Leiste steht über „Handlungsbedarf“')
  // Bedarfszahl am Fach (08.10.2026): oranges Abzeichen mit Warnzeichen, Erklärung als Bezeichnung des Reiters
  const mitBedarf = p.locator('[data-fach-leiste] [data-fach]:has([data-bedarf-zahl])').first()
  if (await mitBedarf.count()) {
    const bez = (await mitBedarf.getAttribute('aria-label')) ?? ''
    pruefe(/\d+ Punkte? Handlungsbedarf$/.test(bez), `Bedarfszahl erklärt (${bez})`)
  }
  // Fach-Reiter (mit Bedarfszahl) zählen nicht
  const reiter = (await p.locator('[data-klasse-detail] [role="tab"]').allInnerTexts()).map((r) => r.trim())
  pruefe(
    /^Unterrichtsreihen & Blätter/.test(reiter[0]) &&
      /^Vokabeln & Grammatik/.test(reiter[1]) &&
      /^Tests & Noten/.test(reiter[2]) &&
      /^Lernende/.test(reiter[3]),
    `Reiter-Reihenfolge (${reiter.join(' | ')})`
  )
  // Reihen & Blätter: Standard offen + Frist zuerst; Pfeile sortieren, Rechtsklick filtert
  const titelFolge = async () =>
    p.locator('[data-material-liste] [data-material-titel]').evaluateAll((e) => e.map((x) => x.getAttribute('data-material-titel')))
  const vorher = await titelFolge()
  pruefe(vorher[0] === 'Mit Frist' && vorher[1] === 'Ohne Frist', `Standard: mit Frist zuerst (${vorher.join(', ')})`)
  await p.locator('[data-sortieren="titel-ab"]').first().click()
  const nachher = await titelFolge()
  pruefe(nachher[0] === 'Ohne Frist', `Pfeil: nach Titel absteigend (${nachher.join(', ')})`)
  await p.locator('[data-sortieren="frist-auf"]').first().click({ button: 'right' })
  pruefe(await da(p.locator('[data-filter-menue="frist"]')), 'Rechtsklick auf den Pfeil: Filter „Frist“')
  await p.locator('[data-filter-menue="frist"] [data-filter-wert="ohne Frist"]').click()
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  const gefiltert = await titelFolge()
  pruefe(gefiltert.length === 1 && gefiltert[0] === 'Ohne Frist', `Gefiltert: nur „ohne Frist“ (${gefiltert.join(', ')})`)
  await p.locator('[data-sortierung-standard]').click()
  pruefe((await titelFolge()).length === 2, 'Standard stellt alles wieder her')
  const karte = p.locator('[data-material-titel="Mit Frist"]')
  await karte.locator('[data-details-auf]').click()
  pruefe(await da(karte.locator('[data-details]').getByText('Noch nicht begonnen')), 'Details: wer noch nicht begonnen hat')
  pruefe((await karte.locator('[data-ampel]').getAttribute('data-ampel')) === 'red', 'Balken in Ampelfarbe (0 % → rot)')
  await karte.locator('[data-ablegen]').click()
  pruefe(await da(p.locator('[data-ablegen-menue]')), 'Ablegen ▾: Menü')
  const arten = await p
    .locator('[data-ablegen-menue] [data-ablegen-art]')
    .evaluateAll((e) => e.map((x) => `${x.getAttribute('data-ablegen-art')}${x.hasAttribute('data-disabled') || x.disabled ? '(aus)' : ''}`))
  pruefe(arten.join(',') === 'pdf,word(aus),drucken,iserv(aus)', `PDF, Word (ohne Original aus), Drucken, IServ (im Browser aus): ${arten.join(', ')}`)
  await p.screenshot({ path: join(out, '3-reihen-blaetter.png'), fullPage: true })
  await p.keyboard.press('Escape')
  await p.getByRole('tab', { name: /^Vokabeln & Grammatik/ }).click()
  pruefe(await da(p.locator('[data-kurs="Weather"] [data-material="Kurs"]')), 'Kurs als eine Karte')
  pruefe((await p.locator('[data-kurs="Weather"] [data-kurs-stand]').count()) === 1, 'Kurs-Karte: Balken sicher / kennengelernt / neu')
  pruefe(await da(p.locator('[data-kurs="Weather"]').getByText(/heute aktiv \d+\/\d+/)), 'Kurs-Karte: „heute aktiv n/m“')
  // Lehrwerk-Stand: kleiner Knopf in der Kopfzeile, Auswahl im Pop-up, zurück zu „automatisch"
  await p.locator('[data-lehrwerk-knopf]').click()
  pruefe(await da(p.locator('[data-lehrwerk-stand]')), 'Lehrwerk-Stand im Pop-up')
  await p.locator('[data-lehrwerk-band]').click()
  await p.getByRole('option').first().click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-lehrwerk-knopf][data-automatisch]').count()) === 0, 'Band gewählt: nicht mehr automatisch')
  await p.locator('[data-lehrwerk-automatisch]').click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-lehrwerk-knopf][data-automatisch]').count()) === 1, '„Automatisch (aus den Vokabeln)“ löscht die Wahl')
  const standNachher = await (await lk.request.get(`${A}/server/grammatik/lehrwerkstand?gruppe=${gEn.id}`, { headers: KOPF })).json()
  pruefe(standNachher.stand === null, 'Server: Eintrag gelöscht')
  await p.keyboard.press('Escape')
  await p.screenshot({ path: join(out, '4-vokabeln.png'), fullPage: true })
  // Ablegen ▾ → Als PDF speichern (im Browser: Download)
  await p.locator('[data-kurs="Weather"] [data-ablegen]').click()
  const [laden] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    p.locator('[data-ablegen-menue] [data-ablegen-art="pdf"]').click()
  ])
  const datei = laden?.suggestedFilename() ?? ''
  if (!datei) {
    await p.screenshot({ path: join(out, '5-pdf-fehlt.png'), fullPage: true })
    console.log('     Hinweise:', await p.locator('.mantine-Notification-root').allInnerTexts().catch(() => []))
  }
  pruefe(/Wortliste Weather\.pdf$/.test(datei), `Wortliste als PDF gespeichert (${datei || 'kein Download'})`)
  // Geschichte: kein Reiter „Vokabeln & Grammatik"
  await p.locator('[data-fach-leiste] [data-fach="Geschichte"]').click()
  await p.locator(`[data-klasse-detail="${K5} – Geschichte"]`).waitFor({ timeout: 10000 })
  pruefe((await p.getByRole('tab', { name: /^Vokabeln & Grammatik/ }).count()) === 0, 'Geschichte: ohne „Vokabeln & Grammatik“')
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  await p.locator(`[data-klasse-detail="${K5} – Englisch"]`).waitFor({ timeout: 10000 })

  // Rückweg: Blatt öffnen → „Meine Klassen" führt zurück in dieselbe Klasse
  await p.getByRole('tab', { name: /^Unterrichtsreihen/ }).click()
  pruefe(await da(p.locator('[data-reihe-erstellen]')), 'Knopf „Unterrichtsreihe erstellen“')
  pruefe(await da(p.locator('[data-arbeitsblatt-erstellen]')), 'Knopf „Arbeitsblatt erstellen“')
  await p.locator('[data-material-titel="Mit Frist"] [data-material-oeffnen]').click()
  pruefe(await da(p.locator('[data-zurueck="meineklassen"]')), 'Im geöffneten Blatt heißt der Zurück-Knopf „Meine Klassen“')
  await p.locator('[data-zurueck="meineklassen"]').click()
  pruefe(await da(p.locator(`[data-klasse-detail="${K5} – Englisch"]`)), 'Zurück in derselben Klasse und demselben Fach')

  await p.locator('[data-vorschlag="vokabeln"] [data-vorschlag-ansehen]').click()
  await p.locator('[data-vokabeln-freischalten]').click()
  pruefe(await da(p.getByText(/ist für .* freigeschaltet/), 8000), 'Vorschlag nach Sichtung freigeschaltet')
  const vt = await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()
  const neuVt = (vt.zuweisungen ?? vt.liste ?? []).find((z) => /Wackelige Wörter/.test(z.titel))
  pruefe(Boolean(neuVt), `Neues Vokabeltraining „${neuVt?.titel}“ für die Klasse`)
  for (const z of vt.zuweisungen ?? vt.liste ?? []) await lk.request.post(`${A}/server/vokabeln/${z.id}/loeschen`, { headers: KOPF, data: {} })

  // ---------- Verwaltung: Ablagestruktur ändern und zurücksetzen
  const neuMuster = await (
    await verwaltung.request.post(`${A}/server/verwaltung/iserv-ablage`, { headers: KOPF, data: { muster: 'Gruppen\\{Klasse}\\{Fach}\\{Schuljahr}' } })
  ).json()
  pruefe(neuMuster.muster === 'Gruppen/{Klasse}/{Fach}/{Schuljahr}', `Admin: Ablagestruktur gespeichert (${neuMuster.muster})`)
  const d2 = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
  pruefe(d2.ablageMuster === neuMuster.muster, 'Lehrkraft bekommt die Struktur der Verwaltung')
  await verwaltung.request.post(`${A}/server/verwaltung/iserv-ablage`, { headers: KOPF, data: { muster: '' } })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
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
