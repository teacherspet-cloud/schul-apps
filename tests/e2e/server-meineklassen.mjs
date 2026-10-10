// „Meine Klassen" (06.10.2026, abgestimmt): Lerngruppen als „5b – Englisch" alphabetisch, Lernstand, Handlungsbedarf,
// Vorschlag „Wackelige Wörter" ansehen und im Kurs wiederholen lassen (09.10.2026: kein zweiter Kurs mehr), „Vokabeln/Grammatik
// hinzufügen" und „+ Aufgaben" in den Reitern, Leiste bleibt im Leerlauf ruhig. Ohne KI (Blätter werden nur angeboten, nicht erzeugt).
// Vorher: Server lokal, IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-meineklassen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus, grammatikJahreAuf } from './warten.mjs'

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
const PAKET = {
  thema: 'Simple past',
  regeln: [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenes.', beispiele: ['I played.'] }],
  aufgaben: Array.from({ length: 11 }, (_, i) => ({
    id: `a${i + 1}`,
    art: 'auswahl',
    regelId: 'r1',
    anweisung: 'Wähle die richtige Form.',
    satz: `Yesterday I ___ football with friend number ${i}.`,
    optionen: ['played', 'play', 'plays'],
    loesungen: ['played']
  }))
}
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
  void gOhne
  // Übliche Reihe der Lehrkraft (09.10.2026, Lehrwerk-Vorwahl): Klasse 10 lernt mit Green Line 6
  await lk.request.post(`${A}/server/vokabeln/freigeben`, {
    headers: KOPF,
    data: {
      lerngruppeId: g10.id,
      titel: 'Green Line 6 - Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: WOERTER.slice(0, 2),
      quelle: { lehrwerk: 'green-line-6', unit: 'Unit 1', abschnitte: ['Station 1'] }
    }
  })
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
  // Grammatik im Kurs der Klasse (für „+ Aufgaben" im Reiter Grammatik)
  const gram = await (
    await lk.request.post(`${A}/server/grammatik/freigeben`, {
      headers: KOPF,
      data: { titel: 'Simple past', fach: 'Englisch', sprache: 'en', thema: 'Simple past', paket: PAKET, vokId: vok.id }
    })
  ).json()
  pruefe(Boolean(gram.id), `Grammatik im Kurs freigegeben (${gram.id ?? gram.fehler})`)

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
  // 09.10.2026: Handlungsbedarf ausblenden – zählt nicht mehr in der Übersicht, „Wieder einblenden" holt ihn zurück
  {
    const zahl = async () =>
      (await (await lk.request.get(`${A}/server/klassen`, { headers: KOPF })).json()).klassen.flatMap((k) => k.faecher).find((f) => f.id === gEn.id)?.bedarf
    const vorher = await zahl()
    const schluessel = vokBedarf[0]?.schluessel
    pruefe(typeof schluessel === 'string' && !d.bedarf.some((b) => /[A-Z][a-z]+ Probe/.test(b.schluessel ?? '')), `Eintrag mit Schlüssel ohne Namen (${schluessel})`)
    await lk.request.post(`${A}/server/klassen/${gEn.id}/bedarf-ausblenden`, { headers: KOPF, data: { schluessel } })
    const d2 = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
    pruefe(
      !d2.bedarf.some((b) => b.schluessel === schluessel) && d2.bedarfAusgeblendet?.some((b) => b.schluessel === schluessel),
      'Ausgeblendeter Eintrag steht unter „Ausgeblendet"'
    )
    pruefe((await zahl()) === vorher - 1, `Bedarfszahl ohne Ausgeblendetes (${vorher} → ${await zahl()})`)
    await lk.request.post(`${A}/server/klassen/${gEn.id}/bedarf-einblenden`, { headers: KOPF, data: { schluessel } })
    pruefe((await zahl()) === vorher, 'Wieder eingeblendet zählt wieder')
  }
  pruefe(
    d.vokabeln[0]?.anteil && typeof d.vokabeln[0]?.heuteAktiv === 'number',
    `Kurs-Karte: Anteile und „heute aktiv“ (${JSON.stringify(d.vokabeln[0]?.anteil)}, ${d.vokabeln[0]?.heuteAktiv})`
  )
  pruefe(
    d.vorschlaege.some((v) => v.art === 'vokabeln'),
    'Vorschlag: „Wackelige Wörter“'
  )
  // 09.10.2026: Kurs der Klasse (Ziel von „Vokabeln/Grammatik hinzufügen"), Wackeliges mit Kurs und Wort
  pruefe(d.klassenKurs === vok.id, `Kurs der Klasse ist der Kurs „Weather“ (${d.klassenKurs})`)
  pruefe(d.wackelig.every((w) => w.kurs === vok.id && WOERTER.some((x) => x.id === w.id)), 'Wackelige Wörter tragen Kurs und Wort')
  const dGe = await (await lk.request.get(`${A}/server/klassen/${gGe.id}`, { headers: KOPF })).json()
  pruefe(dGe.sprachfach === false, 'Geschichte ist kein Sprachfach')
  // 09.10.2026: Kurs nach Bänden benannt, Übersicht je Abschnitt – zwei Abschnitte aus Green Line 1 dazu
  const neueWoerter = ['house', 'garden', 'kitchen', 'room'].map((t, i) => ({ id: `n${i}`, term: t, translation: ['Haus', 'Garten', 'Küche', 'Zimmer'][i] }))
  await lk.request.post(`${A}/server/vokabeln/${vok.id}/woerter`, {
    headers: KOPF,
    data: {
      woerter: neueWoerter,
      teile: [
        { titel: 'Station 1', anzahl: 2 },
        { titel: 'Station 2', anzahl: 2 }
      ],
      quelle: { lehrwerk: 'green-line-1', unit: 'Unit 1', abschnitte: ['Station 1', 'Station 2'] }
    }
  })
  const dAb = await (await lk.request.get(`${A}/server/klassen/${gEn.id}`, { headers: KOPF })).json()
  const kAb = dAb.vokabeln.find((v) => v.id === vok.id)
  pruefe(kAb?.kursName === 'Vokabeln Englisch · Green Line 1', `Kursname nach Band (${kAb?.kursName})`)
  pruefe(
    JSON.stringify((kAb?.abschnitte ?? []).map((a) => [a.unit, a.name, a.woerter])) ===
      JSON.stringify([
        ['', 'Weather', 7],
        ['Unit 1', 'Station 1', 2],
        ['Unit 1', 'Station 2', 2]
      ]),
    `Abschnitte je Unit (${JSON.stringify((kAb?.abschnitte ?? []).map((a) => a.name))})`
  )
  pruefe(
    kAb?.lernendeNamen?.length === 2 && kAb.abschnitte[0].jeLernende.length === 2 && kAb.abschnitte[0].schwach === null && kAb.abschnitte[0].probleme.length >= 1,
    'Abschnitt: je Person, „noch zu früh“, schwierigste Wörter'
  )

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
  // Rechtsklick auf das Fach (08.10.2026): „Französisch in Klasse … abwählen" – ohne Material verschwindet es
  await p.locator('[data-fach-leiste] [data-fach="Französisch"]').click({ button: 'right' })
  pruefe(await da(p.locator('[data-fach-abwaehlen]'), 5000), 'Rechtsklick auf ein Fach: „… abwählen“')
  pruefe(/Französisch in Klasse .* abwählen/.test(await p.locator('[data-fach-abwaehlen]').innerText()), 'Menüpunkt nennt Fach und Klasse')
  await p.locator('[data-fach-abwaehlen]').click()
  await p.locator('[data-fach-abwahl-ok]').click()
  pruefe(await da(p.locator('[data-ohne-fach]')), 'Fach abgewählt: Klasse wieder ohne Fach')
  pruefe((await p.locator('[data-fach-leiste] [data-fach]').count()) === 0, 'Kein Fach-Reiter mehr')
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
  // Ausblenden ganz links am Eintrag, darunter „Ausgeblendet (n)" zum Wiederherstellen (09.10.2026)
  {
    const zeile = p.locator('[data-handlungsbedarf] [data-bedarf-zeile]').first()
    const knopf = zeile.locator('[data-bedarf-ausblenden]')
    const links = (await knopf.boundingBox())?.x ?? 1e9
    const eintrag = (await zeile.locator('.klassen-bedarf').boundingBox())?.x ?? 0
    pruefe(links < eintrag, 'Auge „Ausblenden" steht links vom Eintrag')
    await knopf.click()
    pruefe(await da(p.locator('[data-bedarf-ausgeblendet="1"]')), '„Ausgeblendet (1)" erscheint')
    await p.locator('[data-bedarf-ausgeblendet-knopf]').click()
    await p.locator('[data-bedarf-einblenden]').first().click()
    await p.locator('[data-bedarf-ausgeblendet]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined)
    pruefe((await p.locator('[data-bedarf-ausgeblendet]').count()) === 0, 'Wieder eingeblendet – „Ausgeblendet" verschwindet')
  }
  // Kopf mit Kennzahlen (09.10.2026, „Kopf + Reiter"): im Sprachfach mit „Wörter sicher" und „aktiv diese Woche"
  pruefe(await da(p.locator('[data-fach-kopf="sprache"] [data-kennzahl="sicher"]')), 'Kopf der Fachansicht: „Wörter sicher"')
  pruefe(/\d+\/\d+/.test(await p.locator('[data-fach-kopf] [data-kennzahl="aktiv"]').innerText()), 'Kopf: „aktiv diese Woche n/m"')
  pruefe(await da(p.locator('[data-fach-kopf] [data-kennzahl="tests"]')), 'Kopf: „Tests Ø"')
  // Lernstand der Sprachklasse wie im Überblick der Kursseite (09.10.2026): Karteikasten-Säulen und Units je Band
  pruefe(await da(p.locator('[data-sprach-lernstand] [data-stufen-diagramm]')), 'Sprachklasse: „Lernstand im Karteikasten"')
  pruefe(await da(p.locator('[data-sprach-lernstand] [data-kurs-units] [data-band-gruppe]').first()), 'Sprachklasse: „Units" je Band (mit Cover/Kachel)')
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
      /^Vokabeln/.test(reiter[1]) &&
      /^Grammatik/.test(reiter[2]) &&
      /^Tests & Noten/.test(reiter[3]) &&
      /^Lernende/.test(reiter[4]),
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
  // Getrennte Reiter (08.10.2026): Grammatik eigener Reiter
  await p.getByRole('tab', { name: /^Grammatik/ }).click()
  // Dieselbe Kursseite wie in Sprachenlernen, eingebettet (09.10.2026): kein Wechsel, keine zweite Reiterleiste
  pruefe(await da(p.locator('[data-klassen-kurs] [data-kurs-grammatik]')), 'Reiter „Grammatik“ zeigt die Grammatik-Tabelle des Kurses')
  pruefe((await p.locator('[data-kurs-reiterleiste]').count()) === 0, 'Eingebettet ohne zweite Reiterleiste')
  // „Grammatik je Lernende/r" zugeklappt mit Kurzzeile (09.10.2026), aufklappbar
  pruefe(await da(p.locator('[data-klassen-kurs] [data-je-lernende-kurz]')), '„Grammatik je Lernende/r" zu Beginn zugeklappt (Kurzzeile)')
  await p.locator('[data-klassen-kurs] [data-je-lernende-kopf="grammatik"]').click()
  pruefe(await da(p.locator('[data-klassen-kurs] [data-grammatik-tabelle]')), 'Aufgeklappt: Fördern/Fordern je Lernende/r')
  pruefe(await da(p.locator('[data-klassen-kurs] [data-kurs-grammatik-kopf]')), 'Grammatik-Liste zuklappbar (Kopf)')
  await grammatikJahreAuf(p)
  // „+ Aufgaben" je Grammatik (09.10.2026): öffnet das Fenster wie in Sprachenlernen
  await p.locator(`[data-grammatik-mehr="${gram.id}"]`).click()
  pruefe(await da(p.locator('[data-mehr-aufgaben-fenster]')), '„+ Aufgaben“ öffnet „Weitere Aufgaben“')
  await p.getByRole('button', { name: 'Abbrechen' }).click()
  // „Grammatik hinzufügen" (09.10.2026): derselbe Dialog wie im Kurs, für den Kurs der Klasse
  await p.locator('[data-klassen-kurs] [data-vokabel-grammatik]').click()
  pruefe(await da(p.locator('[data-grammatik-fuer-kurs]')), '„Grammatik hinzufügen“ öffnet „Grammatik zum Üben freigeben“ für den Kurs')
  pruefe(/Weather/.test(await p.locator('[data-grammatik-fuer-kurs]').innerText().catch(() => '')), 'Für die Lernenden des Kurses „Weather“')
  // Feste Klasse (09.10.2026): „Planen …" wie bei Vokabeln, kein „Übungszeitraum bis"
  pruefe(await da(p.locator('.mantine-Modal-content [data-plan-modus]')), 'Grammatik hinzufügen: „Jetzt freischalten / Planen …"')
  pruefe((await p.locator('[data-grammatik-bis]').count()) === 0, 'Feste Klasse: kein „Übungszeitraum bis"')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
  await p.getByRole('tab', { name: /^Vokabeln/ }).click()
  // „Vokabeln hinzufügen" (09.10.2026): derselbe Dialog wie im Kurs
  await p.locator('[data-klassen-kurs] [data-vokabel-hinzufuegen]').click()
  pruefe(await da(p.locator('[data-vokabel-hinzufuegen-los]')), '„Vokabeln hinzufügen“ öffnet den Dialog des Kurses')
  // Vorwahl: übliche Reihe der Lehrkraft (Green Line), Band nach Jahrgang der Klasse 5 → Green Line 1
  await p.waitForTimeout(1500)
  const band = await p.locator('[data-vokabel-band]').inputValue().catch(() => '')
  // Im Kurs (10.10.2026): kompakter Band-Kopf mit Cover („Green Line 1 ▾ · anderes Lehrwerk …") statt Lehrwerk + Band
  const kompakt = await p.locator('[data-band-kopf-wahl]').count()
  const reiheWahl = kompakt ? 'Green Line' : await p.locator('[data-vokabel-buch]').inputValue().catch(() => '')
  pruefe(reiheWahl === 'Green Line' && /^Green Line 1\b/.test(band), `Lehrwerk vorgewählt (${reiheWahl} · ${band}${kompakt ? ', kompakter Band-Kopf' : ''})`)
  await p.getByRole('button', { name: 'Abbrechen' }).click()
  await p.waitForTimeout(400)
  pruefe(await da(p.locator('[data-kurs="Weather"][data-klassen-kurs] [data-vokabel-kasten]')), 'Kursseite (Vokabeln) eingebettet')
  // „Abschnitte und Stand der Lernenden" und „Karteikasten je Lernende/r" zu Beginn zugeklappt (09.10.2026)
  pruefe(/Abschnitt/.test(await p.locator('[data-kurs="Weather"] [data-kurs-abschnitte-kurz]').innerText().catch(() => '')), 'Abschnitte zugeklappt mit Kurzzeile')
  pruefe(/Lernende/.test(await p.locator('[data-kurs="Weather"] [data-je-lernende-kurz]').innerText().catch(() => '')), '„Karteikasten je Lernende/r" zugeklappt mit Kurzzeile')
  await p.locator('[data-kurs="Weather"] [data-kurs-abschnitte-kopf]').click()
  pruefe(await da(p.locator('[data-kurs="Weather"] [data-vok-abschnitte] [data-band-gruppe]').first()), 'Abschnitte je Band (Cover links)')
  pruefe((await p.locator('[data-kurs="Weather"] [data-abschnitt-stand]').count()) >= 1, 'Abschnitte: Balken sicher / im Aufbau / neu')
  // Name nach Kurs und Übersicht je Abschnitt (09.10.2026): neueste Unit offen, Klick zeigt Wörter und Ampeln je Person
  pruefe(
    (await p.locator('[data-kurs="Weather"]').getAttribute('data-kurs-name')) === 'Vokabeln Englisch · Green Line 1',
    'Kurs heißt „Vokabeln Englisch · Green Line 1“'
  )
  pruefe(await da(p.locator('[data-kurs="Weather"] [data-vokabel-kurzinfo]', { hasText: /3 Abschnitten/ })), 'Kurzzeile: Zahl der Abschnitte')
  pruefe(
    (await p.locator('[data-kurs="Weather"] [data-abschnitt-gruppe="Unit 1"][data-offen]').count()) === 1 &&
      (await p.locator('[data-kurs="Weather"] [data-abschnitt-gruppe="Weitere Vokabeln"][data-offen]').count()) === 0,
    'Neueste Unit offen, ältere zugeklappt'
  )
  await p.locator('[data-kurs="Weather"] [data-abschnitt-gruppe="Weitere Vokabeln"] [data-abschnitt-gruppe-knopf]').click()
  await p.locator('[data-kurs="Weather"] [data-abschnitt="Weather"]').click()
  pruefe(await da(p.locator('[data-kurs="Weather"] [data-abschnitt-detail] [data-abschnitt-personen]')), 'Abschnitt-Details: Ampel je Person')
  pruefe(
    /Schwierigste Wörter:.*(weather|sunny|cloud|rain|wind)/.test(await p.locator('[data-kurs="Weather"] [data-abschnitt-detail]').innerText()),
    'Abschnitt-Details: schwierigste Wörter'
  )
  await p.screenshot({ path: join(out, '3c-abschnitte.png'), fullPage: true })
  // Lehrwerk-Stand: kleiner Knopf in der Kopfzeile, Auswahl im Pop-up, zurück zu „automatisch"
  // Automatisch (09.10.2026): nur der Band nach Klassenstufe – keine Unit
  const lwText = await p.locator('[data-lehrwerk-knopf]').innerText()
  pruefe(/Green Line 1 \(automatisch\)/.test(lwText) && !/Unit/.test(lwText), `Lehrwerk automatisch ohne Unit (${lwText})`)
  const stand10 = await (await lk.request.get(`${A}/server/grammatik/lehrwerkstand?gruppe=${g10.id}`, { headers: KOPF })).json()
  pruefe(stand10.automatisch?.buch === 'Green Line 6' && !stand10.automatisch?.unit, `Klasse 10 (Gymnasium) → Green Line 6 ohne Unit (${JSON.stringify(stand10.automatisch)})`)
  await p.locator('[data-lehrwerk-knopf]').click()
  pruefe(await da(p.locator('[data-lehrwerk-stand]')), 'Lehrwerk-Stand im Pop-up')
  await p.locator('[data-lehrwerk-band]').click()
  await p.getByRole('option').first().click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-lehrwerk-knopf][data-automatisch]').count()) === 0, 'Band gewählt: nicht mehr automatisch')
  await p.locator('[data-lehrwerk-automatisch]').click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-lehrwerk-knopf][data-automatisch]').count()) === 1, '„Automatisch (nach Klassenstufe)“ löscht die Wahl')
  const standNachher = await (await lk.request.get(`${A}/server/grammatik/lehrwerkstand?gruppe=${gEn.id}`, { headers: KOPF })).json()
  pruefe(standNachher.stand === null, 'Server: Eintrag gelöscht')
  await p.keyboard.press('Escape')
  await p.screenshot({ path: join(out, '4-vokabeln.png'), fullPage: true })
  // Kurs der festen Klasse (09.10.2026): weder beenden noch löschen, kein Lernzeitraum-Ende
  await p.locator('[data-kurs="Weather"] [data-kurs-einstellungen-knopf]').click()
  pruefe(await da(p.locator('[data-kurs-einstellungen]')), 'Kurseinstellungen offen')
  pruefe(
    (await p.locator('[data-kurs-loeschen], [data-vokabel-status], [data-vokabel-bis-aendern]').count()) === 0,
    'Feste Klasse: ohne „Kurs beenden/löschen" und „Lernzeitraum bis"'
  )
  const loeschVersuch = await lk.request.post(`${A}/server/vokabeln/${vok.id}/loeschen`, { headers: KOPF, data: {} })
  pruefe(loeschVersuch.status() === 400, `Server lehnt das Löschen des Klassenkurses ab (${loeschVersuch.status()})`)
  await p.locator('.mantine-Modal-close').first().click()
  await p.waitForTimeout(400)
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
  pruefe(
    (await p.getByRole('tab', { name: /^Vokabeln/ }).count()) === 0 && (await p.getByRole('tab', { name: /^Grammatik/ }).count()) === 0,
    'Geschichte: ohne Reiter „Vokabeln“ und „Grammatik“'
  )
  // Derselbe Kopf für jedes Fach – ohne Sprach-Kennzahlen
  pruefe(await da(p.locator('[data-fach-kopf="fach"] [data-kennzahl="tests"]')), 'Geschichte: Kopf mit „Tests Ø"')
  pruefe((await p.locator('[data-fach-kopf] [data-kennzahl="sicher"]').count()) === 0, 'Geschichte: ohne „Wörter sicher"')
  await p.screenshot({ path: join(out, '4c-geschichte-kopf.png') })
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  await p.locator(`[data-klasse-detail="${K5} – Englisch"]`).waitFor({ timeout: 10000 })

  // Handlungsbedarf der Kurse (09.10.2026, eine Quelle mit der Kursseite): Klick bleibt in „Meine Klassen" – Vokabel-
  // Hinweise im Reiter „Vokabeln", Grammatik-Hinweise im Reiter „Grammatik"
  const vokEintrag = p.locator('[data-handlungsbedarf] [data-ziel-reiter="vokabeln"], [data-handlungsbedarf] [data-ziel-reiter="lernende"]').first()
  if (await vokEintrag.count()) {
    await vokEintrag.click()
    pruefe(await da(p.locator(`[data-klasse-detail="${K5} – Englisch"] [data-kurs-seite][data-eingebettet]`), 10000), 'Vokabel-Hinweis öffnet den Kurs eingebettet in „Meine Klassen" (Reiter „Vokabeln")')
    pruefe(await da(p.locator('[role="tab"][aria-selected="true"]', { hasText: /^Vokabeln/ })), 'Reiter „Vokabeln" gewählt')
    await p.screenshot({ path: join(out, '4b-kurs-aus-bedarf.png') })
  } else pruefe(false, 'Vokabel-Eintrag im Handlungsbedarf fehlt')
  const gramEintrag = p.locator('[data-handlungsbedarf] [data-ziel-reiter="grammatik"]').first()
  if (await gramEintrag.count()) {
    await gramEintrag.click()
    pruefe(await da(p.locator('[role="tab"][aria-selected="true"]', { hasText: /^Grammatik/ })), 'Grammatik-Hinweis öffnet den Reiter „Grammatik"')
    pruefe(await da(p.locator('[data-kurs-seite] [data-kurs-grammatik]'), 10000), 'Grammatik-Hinweis zeigt die Grammatik-Liste')
  }

  // Rückweg: Blatt öffnen → „Meine Klassen" führt zurück in dieselbe Klasse
  await p.getByRole('tab', { name: /^Unterrichtsreihen/ }).click()
  pruefe(await da(p.locator('[data-reihe-erstellen]')), 'Knopf „Unterrichtsreihe erstellen“')
  pruefe(await da(p.locator('[data-arbeitsblatt-erstellen]')), 'Knopf „Arbeitsblatt erstellen“')
  await p.locator('[data-material-titel="Mit Frist"] [data-material-oeffnen]').click()
  pruefe(await da(p.locator('[data-zurueck="meineklassen"]')), 'Im geöffneten Blatt heißt der Zurück-Knopf „Meine Klassen“')
  await p.locator('[data-zurueck="meineklassen"]').click()
  pruefe(await da(p.locator(`[data-klasse-detail="${K5} – Englisch"]`)), 'Zurück in derselben Klasse und demselben Fach')

  // Leiste im Leerlauf (09.10.2026, Befund der Lehrkraft: Einträge der Gruppe „Verwaltung" blinkten): 20 s keine Änderung
  await p.evaluate(() => {
    window.__leiste = 0
    new MutationObserver((l) => (window.__leiste += l.length)).observe(document.querySelector('.app-leiste'), {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true
    })
  })
  await p.waitForTimeout(20000)
  const leiste = await p.evaluate(() => window.__leiste)
  pruefe(leiste === 0, `Leiste bleibt im Leerlauf ruhig (${leiste} Änderungen in 20 s)`)

  // „Wackelige Wörter" (09.10.2026): kein neuer Kurs – im Kurs wieder fällig. Vorher richtig geübt → erst morgen dran
  for (const w of WOERTER.slice(0, 5))
    await sm.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: vok.id, wortId: w.id, uebung: 'frei', antwort: w.term } })
  const faellig = async () => {
    const l = await (await sm.request.get(`${A}/s/api/vokabeln/liste?id=${vok.id}`, { headers: KOPF })).json()
    return WOERTER.slice(0, 5).filter((w) => (l.staende?.[w.id]?.faellig ?? Infinity) <= Date.now()).length
  }
  const faelligVorher = await faellig()
  const kurseVorher = ((await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()).zuweisungen ?? []).length
  await p.locator('[data-vorschlag="vokabeln"] [data-vorschlag-ansehen]').click()
  pruefe(await da(p.locator('[data-wackelig-blatt]')), 'Vorschau bietet „Als kurzes Arbeitsblatt“')
  await p.locator('[data-wackelig-wiederholen]').click()
  pruefe(await da(p.getByText(/wieder dran – im Kurs „/), 8000), 'Meldung: wackelige Wörter sind im Kurs wieder dran')
  const faelligNachher = await faellig()
  pruefe(faelligVorher === 0 && faelligNachher === 5, `Wörter bei Mia wieder fällig (vorher ${faelligVorher}, nachher ${faelligNachher} von 5)`)
  const vt = await (await lk.request.get(`${A}/server/vokabeln`, { headers: KOPF })).json()
  pruefe((vt.zuweisungen ?? []).length === kurseVorher && !(vt.zuweisungen ?? []).some((z) => /Wackelige Wörter/.test(z.titel)), 'Kein zweiter Kurs „Wackelige Wörter“')
  for (const z of vt.zuweisungen ?? []) await lk.request.post(`${A}/server/vokabeln/${z.id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } })

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
