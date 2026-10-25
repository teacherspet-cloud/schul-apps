// Partnerarbeit Sprechen (24.10.2026, Plan cryptic-gathering-jellyfish): Lehrkraft bereitet im Reiter „Sprechen" vor
// (Vorschau A|B|C), aktiviert; drei Lernende kommen über die Startseite in den Warteraum (eigenes Symbol, keine Namen);
// Lehrkraft hakt Anwesende ab, lässt zuteilen, startet; Dreiergruppe: Interview (A fragt, Hilfen freischalten, Wechsel,
// Rückmeldung), Monolog, Dialog mit dritter Rolle; Live-Ansicht; Beenden. Dann Selbstwahl per Code (richtig/falsch,
// Nachzügler zuordnen) und eine geplante Partnerarbeit („Demnächst", Absagen). Keine KI nötig.
// Aufruf: node tests/e2e/server-partnerarbeit.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-partnerarbeit')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6p${Date.now() % 1000}`
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
// Mantine-Schalter: Klick statt check() – der Zustand kommt kontrolliert vom Server/Zustand zurück
const schalten = async (l) => {
  await l.waitFor()
  await l.click({ force: true })
  await l.page().waitForTimeout(400)
}
const rolle = (name, karte) => ({
  name,
  karte,
  vorschlaege: [`${name}: idea one`, `${name}: idea two`, `${name}: idea three`],
  wortschatz: [{ wort: `${name.toLowerCase()}-word`, deutsch: 'Wort' }],
  beispiele: [`${name} would say …`]
})

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const kurse = []
const karten = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Pia Partner' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe\nBen Test\nLea Muster' } })
  ).json()
  const [mia, ben, lea] = liste.angelegt
  for (const n of (await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()).nutzer ?? [])
    if (liste.angelegt.some((k) => k.benutzer === n.benutzer)) zuLoeschen.push(n.id)
  lk = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (pfad, data) => (await lk.request.post(`${A}${pfad}`, { headers: KOPF, data })).json()
  const get = async (pfad) => (await lk.request.get(`${A}${pfad}`)).json()
  const g = await post('/server/lerngruppen/anlegen', { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` })
  const kurs = (
    await post('/server/vokabeln/freigeben', {
      lerngruppeId: g.id,
      titel: 'Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [{ id: 'w1', term: 'trip', translation: 'Ausflug' }]
    })
  ).id
  kurse.push(kurs)

  // ---------- Pool Jahrgang 6: Interview (mit Hilfen), Bildkarte (mit Bild), Dialog mit dritter Rolle
  const bild = (await post('/server/sprech-bank/bild', { dataUrl: PNG })).datei
  const speichern = async (teil, karte) => {
    const r = await post('/server/sprech-bank/speichern', { sprache: 'en', jahrgang: 6, teil, karte })
    karten.push(r.id)
    return r.id
  }
  await speichern('interview', {
    thema: 'Free time',
    fragen: ['What do you do after school?', 'Tell me about your hobby.', 'Why do you like it?'],
    hilfen: {
      nachfragen: ['Who with?', 'How often?', 'Since when?'],
      wortschatz: [
        { wort: 'hobby', deutsch: 'Hobby' },
        { wort: 'after school', deutsch: 'nach der Schule' }
      ],
      beispiele: ['I play football after school.'],
      phrases: [{ text: 'In my free time I usually …', wann: 'Du erzählst von deiner Freizeit.' }]
    },
    hilfenStatus: 'geprueft'
  })
  await speichern('monolog', {
    titel: 'At the market',
    bilder: [bild],
    bildBeschreibung: 'A market with people.',
    leitfragen: ['Who can you see?', 'Where are they?'],
    hilfen: {
      auftrag: 'Describe the picture. Who can you see and what are they doing?',
      zusatzfragen: ['What is the weather like?'],
      wortschatz: [{ wort: 'market stall', deutsch: 'Marktstand' }],
      beispiele: ['In the foreground I can see …'],
      phrases: [{ text: 'In the foreground I can see …', wann: 'Du beginnst die Beschreibung.' }]
    },
    hilfenStatus: 'geprueft'
  })
  await speichern('dialog', {
    form: 'diskussion',
    titel: 'Planning a class trip',
    situation: 'Your class wants to go on a trip. Talk about the ideas and agree on one.',
    rolleSchueler: 'x',
    rolleKi: 'y',
    punkte: ['zoo', 'museum', 'beach'],
    ziel: 'Agree on one trip.',
    hilfen: {
      rollen: [
        rolle('Active', 'You want to do something active.'),
        rolle('Quiet', 'You prefer quiet places.'),
        rolle('Practical', 'You think about money and time.')
      ],
      phrases: [{ text: 'What do you think about …?', wann: 'Du fragst nach der Meinung.' }]
    },
    hilfenStatus: 'geprueft'
  })

  // ---------- Lehrkraft: Reiter „Sprechen", Vorschau, aktivieren
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${KLASSE}"]`).click()
  const reiter = p.getByRole('tab', { name: 'Sprechen', exact: true })
  pruefe(await da(reiter), 'Reiter „Sprechen" in Meine Klassen')
  await reiter.click()
  pruefe(await da(p.locator('[data-pa-vorbereiten]')), 'Partnerarbeit vorbereiten')
  pruefe((await p.locator('[data-pa-abdeckung]').getAttribute('data-pa-abdeckung')) === 'voll', 'Abdeckung: alle Karten vollständig')
  // Lehrwerk-Stand als Unit-Leiste (24.10.2026) und Kartenwahl in drei Spalten mit Vorschau
  pruefe(await da(p.locator('[data-lehrwerk-wahl]')), 'Unit-Leiste „Bis Lehrwerk-Stand"')
  pruefe(await da(p.locator('[data-pa-kartenwahl]')), 'Kartenwahl in drei Spalten')
  pruefe(((await p.locator('[data-pa-kartenwahl-zahl]').textContent()) ?? '').includes('3 von 3'), 'Anfangs alle Karten gewählt')
  await p.locator('[data-pa-kartenwahl-keine="interview"]').click()
  pruefe(((await p.locator('[data-pa-kartenwahl-zahl]').textContent()) ?? '').includes('2 von 3'), 'Spalte „keine" wählt ab')
  await p.locator('[data-pa-kartenwahl-alle="interview"]').click()
  await p.locator('[data-pa-karte-auge]').first().click()
  // Das Fenster-Wurzelelement von Mantine gilt nicht als sichtbar – auf den Umschalter darin warten
  pruefe(await da(p.locator('[data-pa-kartenvorschau] [data-pa-vorschau-sicht]')), 'Vorschau einer Karte')
  pruefe(await da(p.locator('[data-pa-kartenvorschau] [data-sprechkarte-inhalt]')), 'Vorschau zeigt die Karte wie in der Pool-App')
  await p.locator('[data-pa-vorschau-sicht]').getByText('So sehen es die Lernenden').click()
  pruefe(await da(p.locator('[data-pa-kartenvorschau] [data-pa-vorschau]')), 'Umschalter: Partnersicht in der Kartenvorschau')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  // Ende im Planen-Block: Dauer-Chips
  await p.locator('[data-pa-ende-wahl]').getByText('45 Min.').click()
  pruefe(((await p.locator('[data-pa-zeitraum]').textContent()) ?? '').includes('bis'), 'Ende über Dauer-Chip (45 Min.)')
  await p.locator('[data-pa-groesse]').getByText('Zu dritt').click()
  await p.locator('[data-pa-vorschau-knopf]').click()
  const vorschau = p.locator('[data-pa-vorschau]')
  pruefe(await da(vorschau), 'Vorschau „So sehen es die Lernenden"')
  pruefe((await p.locator('[data-pa-vorschau-spalte]').count()) === 3, 'Vorschau zu dritt: drei Spalten')
  const spalteA = p.locator('[data-pa-vorschau-spalte]').filter({ has: p.locator('[data-pa-rolle="A"]') })
  // Jahrgang 6 = Unterstufe: eine Frage auf einmal mit „Nächste Frage" (24.10.2026)
  pruefe((await spalteA.count()) === 1 && (await spalteA.locator('[data-pa-frage]').count()) >= 1 && (await spalteA.locator('[data-pa-frage-einzeln]').count()) === 1, 'Vorschau: A sieht die Fragen (Unterstufe: einzeln)')
  await schalten(spalteA.locator('[data-pa-frei="wortschatz"]'))
  await p.waitForTimeout(200)
  pruefe(
    (await p.locator('[data-pa-vorschau-spalte] [data-pa-hilfe="wortschatz"]').count()) >= 1,
    'Vorschau: Freischalten in einer Spalte erscheint bei den anderen'
  )
  await p.screenshot({ path: join(out, '1-vorschau.png'), fullPage: true })
  await p.locator('[data-pa-vorschau-groesse]').getByText('Zu zweit').click()
  await p.waitForTimeout(300)
  pruefe((await p.locator('[data-pa-vorschau-spalte]').count()) === 2, 'Vorschau zu zweit: zwei Spalten')
  await p.keyboard.press('Escape')
  await p.locator('[data-pa-aktivieren]').click()
  pruefe(await da(p.locator('[data-pa-laufend][data-pa-status="aktiv"]')), 'Aktiviert: Warteraum (Zufall)')
  const paId = (await get(`/server/partnerarbeit?kurs=${kurs}`)).aktuelle?.id
  pruefe(Boolean(paId), 'Partnerarbeit am Server angelegt')

  // ---------- Lernende: Startseite → Warteraum
  const schueler = []
  for (const k of [mia, ben, lea]) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    await ctx.request.post(`${A}/auth/passwort`, {
      form: { alt: k.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
      headers: { origin: A },
      maxRedirects: 0
    })
    const s = await ctx.newPage()
    await s.goto(`${A}/s/`)
    schueler.push({ ctx, s, name: k.name.split(' ')[0] })
  }
  const [m, b, l] = schueler.map((x) => x.s)
  pruefe(await da(m.locator('[data-kachel="partnerarbeit"]')), 'Startseite: Kachel „Partnerarbeit"')
  for (const s of [m, b, l]) {
    await s.goto(`${A}/s/pa/${paId}`)
    await s.locator('[data-pa-warteraum]').waitFor()
  }
  pruefe((await m.locator('[data-pa-mein-name]').innerText()).length > 2, 'Warteraum: eigenes Symbol mit Namen')
  pruefe(await da(m.locator('[data-pa-warten]')), 'Warteraum: „Deine Lehrkraft teilt gleich ein"')
  await m.screenshot({ path: join(out, '2-warteraum.png') })

  // ---------- Lehrkraft: Anwesenheit, Vorschlag, Start
  for (let t = 0; t < 20 && (await p.locator('[data-pa-online="1"]').count()) < 3; t++) await p.waitForTimeout(500)
  pruefe((await p.locator('[data-pa-online="1"]').count()) === 3, 'Lehrkraft sieht drei online')
  await p.locator('[data-pa-zuteilen]').click()
  pruefe(await da(p.locator('[data-pa-vorschlag]')), 'Zuteilungsvorschlag')
  pruefe(
    (await p.locator('[data-pa-vorschlag-gruppe]').count()) === 1 && (await p.locator('[data-pa-mitglied]').count()) === 3,
    'Drei Personen → eine Dreiergruppe'
  )
  await p.locator('[data-pa-neu-mischen]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-pa-start]').click()
  pruefe(await da(p.locator('[data-pa-laufend][data-pa-status="laeuft"]')), 'Läuft: Live-Ansicht')
  pruefe(await da(p.locator('[data-pa-live-mitglied]').nth(2)), 'Live-Ansicht zeigt drei Mitglieder mit Symbol und Name')
  await p.screenshot({ path: join(out, '3-live.png'), fullPage: true })

  // ---------- Lernende: Dreiergruppe, Interview
  for (const s of [m, b, l]) await s.locator('[data-pa-gruppe]').waitFor({ timeout: 15000 })
  pruefe((await m.locator('[data-pa-partner]').count()) === 2, 'Gruppe: zwei Partner als Symbole')
  const text = async (s) => (await s.locator('[data-partnerarbeit]').innerText()).toLowerCase()
  const namen = ['mia', 'ben', 'lea', 'probe', 'test', 'muster']
  const alleTexte = `${await text(m)} ${await text(b)} ${await text(l)}`
  pruefe(!namen.some((n) => new RegExp(`\\b${n}\\b`).test(alleTexte)), 'Keine Namen bei den Lernenden')
  const rolleVon = async (s) => s.locator('[data-pa-schritt]').getAttribute('data-pa-rolle')
  const rollen = await Promise.all([m, b, l].map(rolleVon))
  pruefe(rollen.filter((r) => r === 'A').length === 1 && rollen.includes('B') && rollen.includes('C'), `Interview: Rollen A, B, C (${rollen.join(',')})`)
  const sA = [m, b, l][rollen.indexOf('A')]
  const sB = [m, b, l][rollen.indexOf('B')]
  pruefe((await sA.locator('[data-pa-schritt]').getAttribute('data-pa-stufe')) === 'unter', 'Jahrgang 6: Unterstufen-Gestaltung')
  pruefe((await sA.locator('[data-pa-frage]').count()) >= 1 && (await sB.locator('[data-pa-frage]').count()) === 0, 'A sieht die Fragen, B nicht')
  await sA.locator('[data-pa-naechste-frage]').click()
  pruefe((await sA.locator('[data-pa-frage-einzeln]').getAttribute('data-pa-frage-einzeln')) === '1', 'Unterstufe: „Nächste Frage" blättert weiter und hakt ab')
  pruefe((await sA.locator('[data-pa-uhr]').count()) === 0, 'Uhr aus (Option nicht gesetzt)')
  await schalten(sA.locator('[data-pa-frei="wortschatz"]'))
  pruefe(await da(sB.locator('[data-pa-hilfe="wortschatz"]')), 'A schaltet Wortschatz frei → B sieht ihn')
  pruefe(await da(sA.locator('[data-pa-dran-symbol]')), 'A sieht, wer antwortet')
  await sA.locator('[data-pa-naechste]').click()
  await sA.waitForTimeout(300)
  await sA.screenshot({ path: join(out, '4-interview-a.png'), fullPage: true })
  await sB.screenshot({ path: join(out, '4-interview-b.png'), fullPage: true })
  await sA.locator('[data-pa-wechsel]').click()
  pruefe(await da(sA.locator('[data-pa-rueckmeldung-senden]')), 'A gibt eine Rückmeldung')
  await sA.locator('[data-pa-smiley="0:2"]').click()
  await sA.locator('[data-pa-satz]').fill('Great answers!')
  await sA.locator('[data-pa-rueckmeldung-senden]').click()
  pruefe(await da(sB.locator('[data-pa-erhalten]')), 'B sieht die Rückmeldung')
  // „Weiter" nur bei A (25.10.2026): B kann die Rückmeldung nicht für alle überspringen
  pruefe((await sB.locator('[data-pa-weiter]').count()) === 0 && (await da(sB.locator('[data-pa-warte-weiter]'))), 'B hat kein „Weiter" – nur A geht weiter')
  await sA.locator('[data-pa-weiter]').click()
  await m.waitForTimeout(500)
  const rollen2 = await Promise.all([m, b, l].map(rolleVon))
  pruefe(rollen2.indexOf('A') !== rollen.indexOf('A'), 'Nächste Runde: eine andere Person fragt')
  // Durch Interview und Monolog bis zum Dialog
  const weiter = async () => {
    const r = await Promise.all([m, b, l].map(rolleVon))
    const a = [m, b, l][r.indexOf('A')]
    await a.locator('[data-pa-wechsel]').click()
    await a.locator('[data-pa-weiter]').first().click()
    await m.waitForTimeout(400)
  }
  await weiter()
  await weiter()
  pruefe(await da(m.locator('[data-pa-schritt="monolog"]')), 'Nach drei Interview-Runden: Monolog')
  const r3 = await Promise.all([m, b, l].map(rolleVon))
  const mB = [m, b, l][r3.indexOf('B')]
  pruefe(await da(mB.locator('[data-pa-bild]')), 'Monolog: B sieht das Bild')
  pruefe((await mB.locator('[data-pa-auftrag]').innerText()).includes('Describe'), 'Monolog: Arbeitsauftrag beim Sprechenden')
  // Zu dritt (25.10.2026): C sieht Bild und Auftrag mit, dazu deutlich, wer gerade spricht; B hat „Du bist dran"
  const mC = [m, b, l][r3.indexOf('C')]
  pruefe((await da(mC.locator('[data-pa-zuhoeren]'))) && (await da(mC.locator('[data-pa-bild]'))), 'Monolog: C sieht das Bild und den Hinweis, wer spricht')
  pruefe(await da(mB.locator('[data-pa-dran]')), 'Monolog: B sieht „Du bist dran"')
  await weiter()
  await weiter()
  await weiter()
  pruefe(await da(m.locator('[data-pa-schritt="dialog"]')), 'Nach dem Monolog: Dialog')
  const rollenkarten = await Promise.all([m, b, l].map(async (s) => s.locator('[data-pa-rollenkarte]').innerText()))
  pruefe(new Set(rollenkarten).size === 3, 'Dialog zu dritt: drei verschiedene Rollenkarten')
  await schalten(m.locator('[data-pa-frei="vorschlaege"]'))
  pruefe(await da(m.locator('[data-pa-hilfe="vorschlaege"]')), 'Dialog: eigene Vorschläge freigeschaltet')
  pruefe((await b.locator('[data-pa-hilfe="vorschlaege"]').count()) === 0, 'Dialog: die anderen sehen sie nicht')
  await m.screenshot({ path: join(out, '5-dialog.png'), fullPage: true })

  // ---------- Beenden
  await p.locator('[data-pa-beenden]').click()
  pruefe(await da(m.locator('[data-pa-beendet]')), 'Beendet: Lernende sehen das Ende')
  pruefe(await da(p.locator('[data-pa-vorbereiten]')), 'Lehrkraft: wieder Vorbereiten')

  // ---------- Selbstwahl per Code (zu zweit)
  const pa2 = (
    await post('/server/partnerarbeit/anlegen', { kurs, teile: ['interview'], gruppengroesse: 2, modus: 'code', uhr: false, ende: Date.now() + 30 * 60_000 })
  ).id
  for (const s of [m, b, l]) await s.goto(`${A}/s/pa/${pa2}`)
  pruefe(await da(m.locator('[data-pa-mein-code]')), 'Code-Modus: eigener Code')
  const code = (await m.locator('[data-pa-mein-code]').innerText()).trim()
  pruefe(/^\d{6}$/.test(code), `Sechsstelliger Code (${code})`)
  await l.locator('[data-pa-code-eingabe] input').first().click()
  await l.keyboard.type('000000')
  await l.locator('[data-pa-code-senden]').click()
  pruefe(await da(l.locator('[data-pa-code-fehler]')), 'Falscher Code: Fehlermeldung')
  await b.locator('[data-pa-code-eingabe] input').first().click()
  await b.keyboard.type(code)
  await b.locator('[data-pa-code-senden]').click()
  pruefe(await da(b.locator('[data-pa-gruppe]')), 'Richtiger Code: Paar steht')
  pruefe(await da(m.locator('[data-pa-gruppe]')), 'Partner sieht das Paar ebenfalls')
  // Die Lehrkraft hat die zweite Partnerarbeit über die Schnittstelle angelegt: Reiter neu öffnen lädt sie
  await p.getByRole('tab', { name: /^Lernende/ }).click()
  await p.getByRole('tab', { name: 'Sprechen', exact: true }).click()
  pruefe(await da(p.locator('[data-pa-laufend][data-pa-status="laeuft"]')), 'Lehrkraft: Code-Partnerarbeit läuft')
  pruefe(await da(p.locator('[data-pa-unzugeteilt]')), 'Lehrkraft sieht, wer ohne Gruppe ist')
  await p.locator('[data-pa-hinzufuegen]').first().click()
  pruefe(await da(l.locator('[data-pa-gruppe]')), 'Nachzügler zugeordnet (Dreiergruppe)')
  await post(`/server/partnerarbeit/${pa2}/beenden`, {})

  // ---------- Geplant: morgen 7:30 → „Demnächst", Lernende sehen nichts; Absagen
  const morgen = new Date()
  morgen.setDate(morgen.getDate() + 1)
  morgen.setHours(7, 30, 0, 0)
  const pa3 = await post('/server/partnerarbeit/anlegen', {
    kurs,
    teile: ['interview'],
    gruppengroesse: 2,
    modus: 'zufall',
    uhr: false,
    ende: morgen.getTime() + 60 * 60_000,
    plan: { ab: morgen.getTime() }
  })
  pruefe(pa3.geplant === true, 'Geplante Partnerarbeit angelegt')
  const meine = await (await schueler[0].ctx.request.get(`${A}/s/api/partnerarbeit`)).json()
  pruefe(!(meine.partnerarbeiten ?? []).some((x) => x.id === pa3.id), 'Geplante ist für Lernende noch unsichtbar')
  const geplant = await (await schueler[0].ctx.request.get(`${A}/s/api/geplant`)).json()
  pruefe(
    (geplant.demnaechst ?? []).some((x) => x.typ === 'partner'),
    '„Demnächst" nennt die Partnerarbeit'
  )
  const uebersicht = await get(`/server/partnerarbeit?kurs=${kurs}`)
  pruefe(uebersicht.aktuelle?.id === pa3.id && uebersicht.geplant === true, 'Lehrkraft: aktuelle ist geplant')
  await post('/server/planen/absagen', { typ: 'partner', id: pa3.id })
  pruefe((await get(`/server/partnerarbeit?kurs=${kurs}`)).aktuelle === null, 'Abgesagt: keine aktuelle Partnerarbeit mehr')
  for (const x of schueler) await x.ctx.close()
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split(String.fromCharCode(10)).slice(0, 6).join(' | ')}`)
} finally {
  for (const id of karten) if (lk) await lk.request.post(`${A}/server/sprech-bank/loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  for (const k of kurse)
    if (lk) await lk.request.post(`${A}/server/vokabeln/${k}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Karten, Kurse und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
