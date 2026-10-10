// Achievements (09.10.2026, Wunsch der Lehrkraft): alle Achievements mit Fortschritt, geheime verborgen, eigener Platz
// in der Klasse (ab 5 Lernenden, nach Übungstagen der letzten 4 Wochen, keine Namen), Anteil der Schule erst ab 10
// Lernenden (Testkonten zählen dort nicht – hier also keiner). Dazu: keine Namen anderer in der Antwort.
// Medaillen und Titel je Sprache (10.10.2026): Mia lernt Englisch und Französisch → zwei Reihen, Bronze in „Spiele"
// (Englisch), erster Titel „Traveller", Form wählen, Begrüßung mit Titel und Profilbild, Titel im Spielraum, die
// Lehrkraft sieht Medaillen und Titel in „Meine Klassen", Sammlung mit gesperrten und freien Bildern.
// Jahresreihen (10.10.2026): Medaillen des Schuljahres mit Beschriftung „Kl. 7 (2026/27)" und konkreter Zahl zur
// nächsten Stufe; nach einem Schuljahreswechsel (Testuhr SCHULAPPS_KALENDER_TESTUHR) neue Reihe, die alte unter
// „Frühere Jahre", Haupttitel bleibt. Danach Testuhr zurück und Klassenwechsel der Testlehrkraft zurückgenommen.
// Aufbau des Fensters (10.10.2026): alle Abschnitte eingeklappt mit Zusammenfassung (data-klappkarte/data-offen,
// Kopf data-klappkopf) – vor dem Prüfen des Inhalts aufklappen. Medaillen als Raster 7 × 6 (data-medaille-zelle), Tipp
// öffnet ein Blatt; Titel und Jahrestitel als Streifen; Sammlung mit „Profilbild wählen". Bildschirmfotos auch für
// Telefon (390 × 844) und iPad (820 × 1180).
// Vorher: Server lokal (KI-Attrappe). Es wird keine KI gebraucht.
// Aufruf: node tests/e2e/server-achievements.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-achievements')
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
// Abschnitt aufklappen (nur, wenn er zu ist – offen/zu gilt für die Sitzung)
const auf = async (pg, id) => {
  await da(pg.locator(`[data-klappkarte="${id}"]`), 8000)
  const k = pg.locator(`[data-klappkarte="${id}"][data-offen="false"] [data-klappkopf]`)
  if (await k.count()) await k.first().click()
  await pg.waitForTimeout(150)
}
// Blatt (Telefon: von unten, sonst Fenster) schließen
const blattZu = async (pg) => {
  await pg.locator('.mantine-Drawer-close, .mantine-Modal-close').last().click().catch(() => undefined)
  await pg.waitForTimeout(300)
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const trainings = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
let uhrVerstellt = false
let gewechselt = false
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const neu = async (rolle, name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle, name } })).json()
    zuLoeschen.push(k.id)
    return k
  }
  const lehrer = await neu('lehrkraft', 'Aaron A')
  const kinder = []
  for (const n of ['Mia Muster', 'Ben Beispiel', 'Cem Probe', 'Dana Test', 'Eli Versuch']) kinder.push(await neu('schueler', n))
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const g = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '7z', fach: 'Englisch', mitglieder: kinder.map((k) => k.benutzer) } })
  ).json()
  const kurs = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: { titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'dog', translation: 'Hund' }], schueler: kinder.map((k) => k.benutzer) }
      })
    ).json()
  ).id
  trainings.push(kurs)
  pruefe(Boolean(g.id && kurs), 'Klasse 7z mit fünf Lernenden und ein Vokabelkurs')
  // Zweite Sprache (10.10.2026): Französisch für dieselben Lernenden
  const gFr = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: '7z', fach: 'Französisch', mitglieder: kinder.map((k) => k.benutzer) } })
  ).json()
  const kursFr = (
    await (
      await lk.request.post(`${A}/server/vokabeln/freigeben`, {
        headers: KOPF,
        data: { lerngruppeId: gFr.id, titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'w1', term: 'chien', translation: 'Hund' }] }
      })
    ).json()
  ).id
  trainings.push(kursFr)
  await lk.request.post(`${A}/server/vokabeln/${kurs}/spiele`, { headers: KOPF, data: { frei: true } })
  pruefe(Boolean(gFr.id && kursFr), 'Dazu Französisch (7z) mit eigenem Kurs')

  // Mia übt heute (ein Übungstag), Ben gar nicht
  const mia = await browser.newContext({ viewport: { width: 1000, height: 900 } })
  await anmelden(mia, kinder[0].benutzer, kinder[0].passwort)
  for (let i = 0; i < 3; i++)
    await mia.request.post(`${A}/s/api/vokabeln/antwort`, { headers: KOPF, data: { id: kurs, wortId: 'w1', uebung: 'diktat', antwort: 'dog' } })
  const api = async (ctx) => (await ctx.request.get(`${A}/s/api/achievements`, { headers: KOPF })).json()
  const a = await api(mia)
  pruefe(Array.isArray(a.alle) && a.alle.length > 30, `Alle Achievements kommen mit (${a.alle?.length})`)
  const d50 = a.alle?.find((x) => x.id === 'diktat-10')
  pruefe(d50 && !d50.erreicht && d50.ist === 3 && d50.ziel === 10, `Fortschritt „10 Diktate richtig": ${d50?.ist}/${d50?.ziel}`)
  pruefe(!a.alle?.some((x) => x.id === 'comeback' || x.id === 'unmoeglich') && a.verborgen === 3, `Geheime verborgen (${a.verborgen})`)
  pruefe(a.platz?.platz === 1 && a.platz?.von === 5 && a.platz?.tage === 1, `Mia: Platz ${a.platz?.platz} von ${a.platz?.von} (${a.platz?.tage} Tag)`)
  pruefe(a.lernende === 0 && a.alle.every((x) => x.anteil === null), 'Unter 10 Lernenden (Testkonten zählen nicht): kein Schulanteil')
  const text = JSON.stringify(a)
  pruefe(!['Ben', 'Cem', 'Dana', 'Eli'].some((n) => text.includes(n)) && !kinder.slice(1).some((k) => text.includes(k.id)), 'Keine Namen oder Kennungen anderer')
  // ---------- Medaillen und Titel (10.10.2026)
  for (let i = 0; i < 3; i++) await mia.request.post(`${A}/s/api/vokabeln/spiel`, { headers: KOPF, data: { id: kurs, spiel: 'blitz', wert: 5 + i, fehler: [] } })
  const gemeldet = await (await mia.request.get(`${A}/s/api/achievements/neu`, { headers: KOPF })).json()
  const ausz = gemeldet.auszeichnungen ?? []
  pruefe(
    ausz.some((x) => x.art === 'medaille' && x.sprache === 'en' && /^Spiele · Kl\. 7 \(\d{4}\/\d{2}\)$/.test(x.text)) && ausz.some((x) => x.art === 'titel' && x.text === 'Traveller'),
    `Glückwunsch: Bronze „Spiele" und Titel „Traveller" (${ausz.map((x) => `${x.titel}: ${x.text}`).join(' · ')})`
  )
  const m = await (await mia.request.get(`${A}/s/api/auszeichnungen`, { headers: KOPF })).json()
  pruefe(JSON.stringify((m.sprachen ?? []).map((x) => x.sprache)) === '["en","fr"]', `Zwei Reihen: ${(m.sprachen ?? []).map((x) => x.name).join(', ')}`)
  const mEn = m.sprachen?.find((x) => x.sprache === 'en')
  pruefe(mEn?.jahrgang === 7 && mEn?.medaillen.find((x) => x.kategorie === 'spiele')?.stufe === 1, `Englisch (Klasse ${mEn?.jahrgang}): Bronze in „Spiele"`)
  pruefe(m.sprachen?.find((x) => x.sprache === 'fr')?.medaillen.every((x) => x.stufe === 0), 'Französisch: noch keine Medaille')
  pruefe(m.formOffen === true, 'Form des Titels noch nicht gewählt')
  // Jahresreihe (10.10.2026): Beschriftung und konkrete Zahl zur nächsten Stufe
  const jahrEn = mEn?.jahr ?? ''
  const zielWort = mEn?.medaillen.find((x) => x.kategorie === 'wortschatz')?.ziel
  pruefe(/^Kl\. 7 \(\d{4}\/\d{2}\)$/.test(jahrEn) && mEn?.schuljahrText && jahrEn.includes(mEn.schuljahrText), `Jahresreihe beschriftet: „${jahrEn}"`)
  pruefe(Number.isInteger(zielWort) && zielWort > 0 && mEn?.grundlage?.schultage > 100, `Wortschatz: nächste Stufe bei ${zielWort} Punkten (Grundlage ${mEn?.grundlage?.band ?? 'Jahrgangstabelle'}, ${mEn?.grundlage?.schultage} Schultage)`)
  pruefe(mEn?.jahrestitel?.text === 'Traveller of Year 7' && Array.isArray(mEn?.frueher) && mEn.frueher.length === 0, `Jahrestitel „${mEn?.jahrestitel?.text}", noch keine früheren Jahre`)

  const ben = await browser.newContext()
  await anmelden(ben, kinder[1].benutzer, kinder[1].passwort)
  const b = await api(ben)
  pruefe(b.platz?.platz === 2 && b.platz?.von === 5 && b.platz?.tage === 0, `Ben (kein Übungstag) teilt sich Platz 2 (${b.platz?.platz} von ${b.platz?.von})`)

  // Musterschüler-Vorschau (09.10.2026, Befund der Lehrkraft: „0 von 0 Achievements geschafft"): voller Katalog mit
  // Fortschritt, aber nichts gespeichert, nichts als neu gemeldet, und die Klasse sieht keinen zusätzlichen Lernenden
  const vs = (await (await lk.request.post(`${A}/server/klassen/${g.id}/vorschau`, { headers: KOPF, data: { zustand: 'erfolgreich' } })).json()).schluessel
  const vKopf = { ...KOPF, 'x-schulapps-vorschau': vs }
  const v = await (await lk.request.get(`${A}/s/api/achievements`, { headers: vKopf })).json()
  pruefe(Boolean(vs) && Array.isArray(v.alle) && v.alle.length === a.alle.length, `Vorschau: alle Achievements (${v.alle?.length} von ${a.alle?.length})`)
  pruefe(v.alle?.every((x) => typeof x.ist === 'number' && typeof x.ziel === 'number'), `Vorschau: jedes mit Fortschritt (${v.alle?.filter((x) => x.ist > 0).length} begonnen, ${v.erreicht?.length} erreicht)`)
  const vNeu = await (await lk.request.get(`${A}/s/api/achievements/neu`, { headers: vKopf })).json()
  pruefe(Array.isArray(vNeu.neu) && vNeu.neu.length === 0 && Array.isArray(v.neu) && v.neu.length === 0, 'Vorschau: kein Glückwunsch bei jedem Öffnen (nichts als neu)')
  const b2 = await api(ben)
  pruefe(b2.platz?.von === 5, `Vorschau zählt in der Klasse nicht mit (Ben: von ${b2.platz?.von})`)

  // Gast mit persönlichem Code (Lernende eintragen): ebenfalls der volle Katalog
  const ein = await (await lk.request.post(`${A}/server/vokabeln/${kurs}/eintragen`, { headers: KOPF, data: { namen: ['Gina G.'] } })).json()
  const gastCode = ein.neu?.[0]?.zugang ?? ein.eingetragen?.[0]?.zugang
  const gast = await browser.newContext()
  const anm = await gast.request.post(`${A}/s/api/vokabeln/anmelden`, { headers: KOPF, data: { code: gastCode } })
  const ga = anm.ok() ? await api(gast) : {}
  pruefe(anm.ok() && Array.isArray(ga.alle) && ga.alle.length === a.alle.length, `Gast: alle Achievements (${ga.alle?.length}; Anmeldung ${anm.status()})`)

  // Oberfläche: Fenster „Achievements"
  const p = await mia.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}/s/`)
  // Medaillen und Titel (10.10.2026): beim ersten Titel fragt auf der Startseite ein Fenster nach der Form
  pruefe(await da(p.locator('[data-titel-form="w"]')), 'Startseite: Fenster „Dein erster Titel!" fragt nach der Form')
  pruefe((await p.locator('[data-titel-form="w"]').innerText()).includes('Dame'), 'Beispiel der Formen: Sir / Dame / Knight')
  await p.screenshot({ path: join(out, '0a-titelform.png') })
  await p.locator('[data-titel-form="m"]').click()
  await p.waitForTimeout(600)
  pruefe(!(await p.locator('[data-titel-form="m"]').isVisible().catch(() => false)), 'Form gewählt, Fenster zu')
  await p.locator('[data-rekorde-knopf]').first().click()
  pruefe(await da(p.locator('[data-medaillen-titel]')), 'Fenster öffnet mit „Medaillen & Titel"')
  pruefe((await da(p.locator('[data-ausz-sprache="en"]'))) && (await p.locator('[data-ausz-sprache="fr"]').count()) === 1, 'Reiter je Sprache: Englisch und Französisch')
  pruefe(!(await p.locator('[data-titel-form="m"]').isVisible().catch(() => false)), 'Form schon gewählt: keine zweite Frage')
  // Eingeklappt mit Zusammenfassung
  const zu = await p.locator('[data-ausz-reihe="en"] [data-klappkarte][data-offen="false"]').count()
  pruefe(zu === 4 && (await p.locator('[data-ausz-reihe="en"] [data-klappkarte][data-offen="true"]').count()) === 0, `Alle vier Abschnitte eingeklappt (${zu})`)
  pruefe(await da(p.locator(`[data-ausz-reihe="en"] [data-ausz-jahr="${jahrEn}"]`)), `Zusammenfassung „Medaillen ${jahrEn}"`)
  const zMed = await p.locator('[data-klappkarte="medaillen-en"] [data-klappstatus]').innerText().catch(() => '')
  pruefe(zMed.includes('1 von 42'), `Zusammenfassung Medaillen: „${zMed}"`)
  const zTit = await p.locator('[data-klappkarte="titel-en"] [data-klappstatus]').innerText().catch(() => '')
  pruefe(zTit.includes('Traveller · nächster bei 3 Punkten'), `Zusammenfassung Titel: „${zTit}"`)
  const zSam = await p.locator('[data-klappkarte="sammlung-en"] [data-klappstatus]').innerText().catch(() => '')
  pruefe(zSam.includes('2 von 50'), `Zusammenfassung Sammlung: „${zSam}"`)
  await p.screenshot({ path: join(out, '0-eingeklappt.png') })
  // Medaillen: Raster 7 × 6
  await auf(p, 'medaillen-en')
  pruefe((await p.locator('[data-ausz-medaillen="en"] [data-raster-jetzt] [data-medaille-zelle]').count()) === 42, 'Raster mit 42 Feldern (7 Kategorien × 6 Stufen)')
  pruefe(await da(p.locator('[data-ausz-reihe="en"] [data-medaille="spiele"][data-stufe="1"] [data-medaille-zelle="spiele-1"][data-erreicht="true"]')), 'Medaille „Spiele" in Bronze')
  pruefe(
    (await da(p.locator('[data-ausz-reihe="en"] [data-medaille="wortschatz"][data-stufe="0"] [data-medaille-zelle="wortschatz-1"][data-naechste]'))) &&
      (await p.locator('[data-raster-jetzt] [data-medaille-zelle="wortschatz-2"][data-erreicht="false"]').count()) === 1,
    'Noch nicht erreichte Medaille: nächste Stufe hervorgehoben, spätere gesperrt'
  )
  pruefe(await da(p.locator('[data-ausz-medaillen="en"] [data-medaillen-zahl="1/42"]')), '„1 von 42 Medaillen"')
  await p.locator('[data-ausz-medaillen="en"] [data-medaille-zelle="wortschatz-1"]').click()
  const naechste = p.locator(`[data-medaille-blatt="m-wortschatz-1"] [data-medaille-naechste="${zielWort}"]`)
  pruefe((await da(naechste)) && (await naechste.innerText()).includes(`Nächste Stufe (Bronze) bei ${zielWort} Punkten`), `Blatt mit konkreter Zahl: „${await naechste.innerText().catch(() => '–')}"`)
  await blattZu(p)
  await p.locator('[data-ausz-medaillen="en"] [data-medaille-zelle="spiele-1"]').click()
  const erreicht = p.locator('[data-medaille-blatt="m-spiele-1"] [data-medaille-erreicht]')
  pruefe((await da(erreicht)) && /Erreicht am \d+\.\d+\.\d{4} · Kl\. 7/.test(await erreicht.innerText()), `Blatt „${await erreicht.innerText().catch(() => '–')}"`)
  await blattZu(p)
  // Titel und Jahrestitel als Streifen
  await auf(p, 'jahrestitel-en')
  pruefe(await da(p.locator('[data-jahrestitel="en"][data-jahrestitel-stufe="1"] [data-jahrestitel-text="Traveller of Year 7"]')), 'Jahrestitel „Traveller of Year 7" sichtbar')
  await auf(p, 'titel-en')
  pruefe(await da(p.locator('[data-titel-leiter="en"][data-titel-stufe="1"] [data-titel="1"][aria-current="step"]')), 'Titelleiter: „Traveller" hervorgehoben')
  pruefe((await p.locator('[data-titel-leiter="en"] [data-titel][data-erreicht="false"]').count()) === 7, 'Sieben Titel noch gesperrt')
  await p.locator('[data-titel-leiter="en"] [data-titel="1"]').click()
  pruefe(await da(p.locator('[data-titel-blatt="1"] [data-titel-zeigen="1"]')), 'Titel-Blatt: „Neben meinem Namen zeigen"')
  await blattZu(p)
  // Sammlung
  await auf(p, 'sammlung-en')
  pruefe(await da(p.locator('[data-sammlung="en"][data-sammlung-zahl="2/50"]')), `Sammlung: 2 von 50 (${await p.locator('[data-sammlung]').getAttribute('data-sammlung-zahl').catch(() => '–')})`)
  pruefe((await p.locator('[data-sammlung-raster] [data-medaille-zelle="spiele-2"][data-erreicht="false"]').count()) === 1, 'Gesperrtes Bild in der Sammlung')
  pruefe((await p.locator('[data-sammlung-bild="t-en-1"][data-frei="true"]').count()) === 1, 'Titel-Wappen „Traveller" freigeschaltet')
  await p.waitForTimeout(800)
  const bildOk = await p.locator('[data-sammlung-raster] [data-medaille-zelle="spiele-1"] img').evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)
  pruefe(bildOk, 'Platzhalterbild wird geladen')
  await p.screenshot({ path: join(out, '0-medaillen.png'), fullPage: true })
  // Profilbild wählen: nur Freigeschaltetes wählbar
  await p.locator('[data-profilbild-waehlen]').click()
  pruefe(await p.locator('[data-sammlung-raster] [data-medaille-zelle="spiele-2"]').isDisabled(), 'Profilbild-Wahl: gesperrtes Bild nicht wählbar')
  await p.locator('[data-sammlung-raster] [data-medaille-zelle="spiele-1"]').click()
  await p.waitForTimeout(600)
  pruefe((await p.locator('[data-sammlung-raster] [data-medaille-zelle="spiele-1"]').getAttribute('aria-pressed')) === 'true', 'Profilbild gewählt')
  await p.locator('[data-profilbild-waehlen]').click()
  // Ansichten für Telefon und iPad
  for (const [n, w, h] of [
    ['telefon', 390, 844],
    ['ipad', 820, 1180]
  ]) {
    await p.setViewportSize({ width: w, height: h })
    await p.locator('[data-klappkopf="medaillen-en"]').scrollIntoViewIfNeeded().catch(() => undefined)
    await p.waitForTimeout(600)
    await p.screenshot({ path: join(out, `nachher-${n}.png`) })
    await p.locator('[data-klappkopf="sammlung-en"]').scrollIntoViewIfNeeded().catch(() => undefined)
    await p.waitForTimeout(300)
    await p.screenshot({ path: join(out, `nachher-${n}-titel.png`) })
    await p.locator('[data-ausz-medaillen="en"] [data-medaille-zelle="spiele-1"]').click()
    await p.waitForTimeout(600)
    await p.screenshot({ path: join(out, `nachher-${n}-blatt.png`) })
    await blattZu(p)
  }
  await p.setViewportSize({ width: 1000, height: 900 })
  await p.locator('[data-ausz-sprache="fr"]').click()
  await auf(p, 'medaillen-fr')
  pruefe(await da(p.locator('[data-ausz-reihe="fr"] [data-medaille="spiele"][data-stufe="0"]')), 'Französisch: eigene Reihe ohne Medaille')
  await p.locator('[data-tab-achievements]').click()
  pruefe(await da(p.locator('[data-achievements]')), 'Fenster mit Achievements')
  pruefe(
    (await da(p.locator('[data-achievements] [data-achievements-gruppe][data-offen="false"]').first())) &&
      (await p.locator('[data-achievements] [data-klappkarte][data-offen="true"]').count()) === 0,
    'Achievements: Gruppen eingeklappt'
  )
  const zPlatz = await p.locator('[data-achievements-platz] [data-klappstatus]').innerText().catch(() => '')
  pruefe(zPlatz.startsWith('Platz 1 von 5'), `Zusammenfassung Platz: „${zPlatz}"`)
  const zGr = await p.locator('[data-achievements-gruppe] [data-klappstatus]').first().innerText().catch(() => '')
  pruefe(/\d+ von \d+ geschafft/.test(zGr), `Zusammenfassung Gruppe: „${zGr}"`)
  await p.screenshot({ path: join(out, '1-achievements-zu.png') })
  for (let i = 0; i < 20; i++) {
    const k = p.locator('[data-achievements] [data-klappkarte][data-offen="false"] [data-klappkopf]')
    if (!(await k.count())) break
    await k.first().click()
    await p.waitForTimeout(100)
  }
  pruefe(await da(p.locator('[data-achievements-platz="1/5"]')), 'Platz in der Klasse sichtbar')
  pruefe((await p.locator('[data-achievements-platz]').innerText()).includes('nach Übungstagen der letzten 4 Wochen'), 'Maßstab wird genannt')
  pruefe(await da(p.locator('[data-achievement="diktat-10"][data-erreicht="false"] [data-achievement-fortschritt="3/10"]')), 'Fortschrittsbalken 3/10')
  pruefe((await p.locator('[data-achievement="comeback"]').count()) === 0 && (await da(p.locator('[data-achievements-verborgen="3"]'))), 'Geheime nur als Zahl')
  pruefe((await p.locator('[data-achievement-anteil]').count()) === 0, 'Kein Schulanteil unter 10 Lernenden')
  await p.screenshot({ path: join(out, '1-achievements.png'), fullPage: true })
  // Rekorde: ebenfalls eingeklappt
  await p.locator('[data-tab-rekorde]').click()
  pruefe(await da(p.locator('[data-rekorde-spiele][data-offen="false"] [data-klappstatus]')), 'Rekorde: Abschnitt eingeklappt mit Zusammenfassung')
  await p.keyboard.press('Escape')

  // Begrüßung mit Titel und Profilbild
  await p.goto(`${A}/s/`)
  const gruss = p.locator('[data-gruss]')
  await da(p.locator('[data-gruss-avatar]'))
  pruefe((await da(gruss)) && /Traveller Mia!/.test(await gruss.innerText()), `Begrüßung mit Titel: „${await gruss.innerText().catch(() => '–')}"`)
  pruefe(await da(p.locator('[data-gruss-avatar="m-spiele-1"]')), 'Profilbild in der Begrüßung')
  await p.screenshot({ path: join(out, '0b-begruessung.png') })
  // Nur freigeschaltete Bilder als Profilbild
  const falsch = await (await mia.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { avatar: 'm-spiele-6' } })).json()
  pruefe(falsch.darstellung?.avatar === '', 'Gesperrtes Bild als Profilbild abgelehnt')
  await mia.request.post(`${A}/s/api/darstellung`, { headers: KOPF, data: { avatar: 'm-spiele-1' } })

  // Spielraum: „Traveller Mia M."
  const neuLobby = await (await mia.request.post(`${A}/s/api/spiel/neu`, { headers: KOPF, data: { bereich: 'vok', kurs, spiel: 'teammatch' } })).json()
  if (neuLobby.code) {
    await p.goto(`${A}/s/sp/${neuLobby.code}`)
    pruefe(await da(p.locator('[data-mehr-spieler] [data-mehr-titel="Traveller"]')), 'Spielraum zeigt den Titel vor dem Namen')
    pruefe(await da(p.locator('[data-mehr-spieler] [data-mehr-avatar="m-spiele-1"]')), 'Spielraum zeigt das Profilbild')
    pruefe(/^Traveller Mia/.test((await p.locator('[data-mehr-anzeige]').first().getAttribute('data-mehr-anzeige')) ?? ''), 'Anzeige „Traveller Mia M."')
    await p.screenshot({ path: join(out, '0c-spielraum.png') })
  } else pruefe(false, `Spielraum ließ sich nicht öffnen (${JSON.stringify(neuLobby)})`)

  // Lehrkraft: Medaillen und Titel in „Meine Klassen" (Englisch), in der gewählten Form, ohne Rangfolge
  const detail = await (await lk.request.get(`${A}/server/klassen/${g.id}`, { headers: KOPF })).json()
  const dm = detail.lernende?.find((l) => l.benutzer === kinder[0].benutzer)?.auszeichnung
  pruefe(dm?.titel === 'Traveller' && dm?.avatar === 'm-spiele-1' && dm?.medaillen.find((x) => x.kategorie === 'spiele')?.stufe === 1, `Lehrkraft sieht Titel, Profilbild und Medaillen (${JSON.stringify(dm)})`)
  const detailFr = await (await lk.request.get(`${A}/server/klassen/${gFr.id}`, { headers: KOPF })).json()
  const dmFr = detailFr.lernende?.find((l) => l.benutzer === kinder[0].benutzer)?.auszeichnung
  pruefe(dmFr && dmFr.titel === null && dmFr.punkte === 0, 'Französisch-Lerngruppe: Medaillen der Sprache Französisch')
  // „Keinen Titel zeigen" gilt auch für die Lehrkraft (Entscheidung 10.10.2026) – Medaillen und Profilbild bleiben
  await mia.request.post(`${A}/s/api/auszeichnungen/wahl`, { headers: KOPF, data: { anzeige: 'aus' } })
  const aus = (await (await lk.request.get(`${A}/server/klassen/${g.id}`, { headers: KOPF })).json()).lernende?.find((l) => l.benutzer === kinder[0].benutzer)?.auszeichnung
  pruefe(aus?.titel === null && aus?.avatar === 'm-spiele-1' && aus?.punkte === 1, `„Keinen Titel zeigen": Lehrkraft sieht keinen Titel (${JSON.stringify(aus)})`)
  await mia.request.post(`${A}/s/api/auszeichnungen/wahl`, { headers: KOPF, data: { anzeige: null } })
  const lp = await lk.newPage()
  await lp.goto(A)
  await lp.waitForTimeout(2500)
  const sp = lp.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await lp.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await lp.locator('[data-klasse="7z"]').click()
  const fachEn = lp.locator('[data-fach-leiste] [data-fach="Englisch"]')
  if (await da(fachEn, 8000)) await fachEn.click()
  await lp.getByRole('tab', { name: /^Lernende/ }).click()
  pruefe(await da(lp.locator('[data-lernende-auszeichnung="Traveller"]')), 'Meine Klassen › Lernende: Spalte „Medaillen & Titel"')
  pruefe(await da(lp.locator('[data-lernende-avatar="m-spiele-1"]')), 'Meine Klassen: Profilbild')
  await lp.screenshot({ path: join(out, '0d-lehrkraft.png'), fullPage: true })

  // Oberfläche der Vorschau: Seite mit dem Vorschau-Schlüssel (wie das Fenster „Als Schüler ansehen")
  const vp = await lk.newPage()
  vp.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await vp.goto(`${A}/s/?vs=${encodeURIComponent(vs)}`)
  await vp.locator('[data-rekorde-knopf]').first().click()
  await vp.locator('[data-tab-achievements]').click()
  const zahl = vp.locator('[data-achievements-zahl]')
  pruefe((await da(zahl)) && !(await zahl.getAttribute('data-achievements-zahl')).endsWith('/0'), `Vorschau-Fenster: ${await zahl.innerText().catch(() => '–')}`)
  await vp.screenshot({ path: join(out, '2-vorschau-achievements.png'), fullPage: true })

  // ---------- Schuljahreswechsel (Testuhr): neue Reihe, alte unter „Frühere Jahre", Haupttitel bleibt
  const sj = mEn?.schuljahr
  const uhr = await (await verwaltung.request.post(`${A}/server/schulkalender/testuhr`, { headers: KOPF, data: { heute: `${sj + 1}-10-01` } })).json()
  uhrVerstellt = true
  gewechselt = uhr.ergebnis?.art === 'gewechselt'
  const n = await (await mia.request.get(`${A}/s/api/auszeichnungen`, { headers: KOPF })).json()
  const nEn = n.sprachen?.find((x) => x.sprache === 'en')
  pruefe(nEn?.schuljahr === sj + 1 && nEn?.medaillen.every((x) => x.stufe === 0), `Neues Schuljahr ${nEn?.schuljahrText}: neue Reihe ohne Medaille`)
  const alt = nEn?.frueher?.[0]
  pruefe(
    alt?.schuljahr === sj && alt?.label === jahrEn && alt?.medaillen.some((x) => x.kategorie === 'spiele' && x.stufe === 1) && alt?.jahrestitel === 'Traveller of Year 7',
    `Frühere Jahre: ${alt?.label} mit Bronze „Spiele" und „${alt?.jahrestitel}"`
  )
  pruefe(nEn?.titel?.stufe === 1 && nEn?.punkte === 1, `Haupttitel bleibt (Stufe ${nEn?.titel?.stufe}, ${nEn?.punkte} Punkt)`)
  const lkNeu = (await (await lk.request.get(`${A}/server/klassen/${g.id}`, { headers: KOPF })).json()).lernende?.find((l) => l.benutzer === kinder[0].benutzer)?.auszeichnung
  pruefe(
    lkNeu?.schuljahr === nEn?.schuljahrText && lkNeu?.medaillen.every((x) => x.stufe === 0) && lkNeu?.titel === 'Traveller' && lkNeu?.punkte === 1,
    `Lehrkraft: Medaillen des laufenden Schuljahres ${lkNeu?.schuljahr}, Titel über alle Jahre`
  )
  const pj = await mia.newPage()
  pj.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await pj.goto(`${A}/s/`)
  await pj.locator('[data-rekorde-knopf]').first().click()
  pruefe(await da(pj.locator(`[data-ausz-reihe="en"] [data-ausz-jahr="${nEn?.jahr}"]`)), `Zusammenfassung der neuen Reihe „${nEn?.jahr}"`)
  await auf(pj, 'medaillen-en')
  pruefe(await da(pj.locator('[data-ausz-medaillen="en"] [data-raster-jetzt] [data-medaille="spiele"][data-stufe="0"]')), 'Neue Reihe: Raster ohne Medaille')
  await pj.locator(`[data-fruehere-jahre="en"] [data-ausz-jahr-wahl="${sj}"]`).click()
  pruefe(await da(pj.locator(`[data-frueheres-jahr="${sj}"] [data-medaille="spiele"][data-stufe="1"]`)), 'Jahreswahl: Raster des Vorjahres mit Bronze „Spiele"')
  await auf(pj, 'jahrestitel-en')
  pruefe(
    await da(pj.locator(`[data-jahrestitel="en"] [data-frueheres-jahrestitel-jahr="${sj}"][data-frueherer-jahrestitel="Traveller of Year 7"]`)),
    'Jahrestitel-Streifen: „Traveller of Year 7" des Vorjahres'
  )
  await pj.screenshot({ path: join(out, '4-fruehere-jahre.png'), fullPage: true })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 4).join(' | ')}`)
} finally {
  // Testuhr zurück; den dabei ausgelösten Klassenwechsel der Testlehrkraft zurücknehmen
  if (uhrVerstellt) await verwaltung.request.post(`${A}/server/schulkalender/testuhr`, { headers: KOPF, data: { heute: null } }).catch(() => undefined)
  if (gewechselt && lk) await lk.request.post(`${A}/server/schuljahr/rueckgaengig`, { headers: KOPF, data: {} }).catch(() => undefined)
  for (const id of trainings) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Trainings und Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
