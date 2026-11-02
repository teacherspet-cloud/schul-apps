// „Test planen" (02.11.2026): Knopf neben „Als Schüler ansehen" in „Meine Klassen" – Sprachfach: Termin und Inhalt des
// Kurses, gegliedert nach Band › Unit (Station 1 aus Green Line 5 und 6 getrennt); Geschichte: Thema, Buchseiten und
// einzelne Aufgaben eines Arbeitsblatts. Kurseinstellungen ohne „Zeitraum und Test". Ohne KI.
// Aufruf: node tests/e2e/server-testplanen.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-testplanen')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const K = `9t${Date.now() % 1000}`
const W = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `${p}word${i}`, translation: `${p}Wort${i}` }))
const VORLAGE = {
  version: 1,
  meta: { title: 'Probe', subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9, anrede: 'du', schwerpunkt: '' },
  grundlage: { art: 'frei', titel: 'Probe', aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
  abgaben: [],
  createdAt: new Date().toISOString()
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const inTagen = (n) => {
  const d = new Date(Date.now() + n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Tim Termin' } })).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const neu = async (name, fach) => (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name, fach, iservGruppe: `klasse:${name}` } })).json()
  const gEn = await neu(K, 'Englisch')
  const gGe = await neu(K, 'Geschichte')
  // Zwei Bände im Kurs der Klasse: Station 1 aus Green Line 5 und Station 1 aus Green Line 6
  const v1 = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: { lerngruppeId: gEn.id, titel: 'Green Line 5 - Unit 1 - Station 1', sprache: 'en', fach: 'Englisch', woerter: W('a', 4), quelle: { lehrwerk: 'green-line-5', unit: 'Unit 1', abschnitte: ['Station 1'] } }
    })
  ).json()
  // Green Line 6 in denselben Kurs (wie „Vokabeln hinzufügen")
  const v2 = await (
    await lk.request.post(`${A}/server/vokabeln/${v1.id}/woerter`, {
      headers: KOPF,
      data: { titel: 'Green Line 6 - Unit 1 - Station 1', woerter: W('b', 5), quelle: { lehrwerk: 'green-line-6', unit: 'Unit 1', abschnitte: ['Station 1'] } }
    })
  ).json()
  const kursId = v1.id
  pruefe(Boolean(kursId) && !v2.fehler, `Kurs mit zwei Bänden angelegt (${kursId} ${JSON.stringify(v2).slice(0, 80)})`)
  await lk.request.post(`${A}/server/blaetter/freigeben`, {
    headers: KOPF,
    data: {
      titel: 'Die Julikrise',
      html: '<!doctype html><html><body><div class="ws-page"><p>Julikrise</p></div></body></html>',
      aufgaben: [
        { nr: 1, anweisung: 'Lies M1 und nenne die Bündnisse.', erwartung: 'x' },
        { nr: 2, anweisung: 'Erkläre den Blankoscheck.', erwartung: 'y' }
      ],
      rueckmeldung: { ...VORLAGE, meta: { ...VORLAGE.meta, title: 'Die Julikrise' } },
      lerngruppeId: gGe.id,
      schueler: [],
      einstellungen: { feedback: false }
    }
  })

  // ---------- Oberfläche
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator(`[data-klasse="${K}"]`).first().click()
  await p.locator('[data-fach-leiste] [data-fach="Englisch"]').click()
  pruefe(await da(p.locator('[data-test-planen]')), 'Knopf „Test planen" neben „Als Schüler ansehen"')
  const lage = await p.evaluate(() => {
    const a = document.querySelector('[data-als-schueler]')?.getBoundingClientRect()
    const b = document.querySelector('[data-test-planen]')?.getBoundingClientRect()
    return a && b ? { rechts: b.left >= a.right - 1, zeile: Math.abs(a.top - b.top) < 6 } : null
  })
  pruefe(Boolean(lage?.rechts && lage?.zeile), `„Test planen" rechts von „Als Schüler ansehen" (${JSON.stringify(lage)})`)
  await p.locator('[data-test-planen]').click()
  const f = p.locator('[data-test-planen-fenster="kurs"]')
  pruefe(await da(f.locator('[data-test-band="Green Line 6"]')), 'Fenster gliedert nach Band: Green Line 6')
  pruefe(await da(f.locator('[data-test-band="Green Line 5"]'), 3000), '… und Green Line 5')
  const reihenfolge = await f.locator('[data-test-band]').evaluateAll((e) => e.map((x) => x.getAttribute('data-test-band')))
  pruefe(reihenfolge[0] === 'Green Line 6', `Neuester Band oben (${reihenfolge.join(' · ')})`)
  await p.screenshot({ path: join(out, 'kurs-fenster.png') })
  pruefe(await f.locator('[data-test-planen-speichern]').isDisabled(), 'Speichern erst mit Datum')
  await f.locator('[data-vokabel-termin]').fill(inTagen(9))
  // Nur Green Line 5 · Station 1 wählen
  if ((await f.locator('[data-test-planen-leeren]').count()) > 0) await f.locator('[data-test-planen-leeren]').click()
  await f.locator('[data-test-band="Green Line 5"] [data-test-abschnitt]').first().check()
  pruefe(/1 Abschnitt \(4 Wörter\)/.test(await f.locator('[data-test-planen-zahlen]').innerText()), 'Zusammenfassung: 1 Abschnitt (4 Wörter)')
  await f.locator('[data-test-planen-speichern]').click()
  await f.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined)
  const tp = await (await lk.request.get(`${A}/server/vokabeln/${kursId}/testplan`, { headers: KOPF })).json()
  const gewaehlt = tp.testAbschnitte?.gewaehlt ?? []
  const gl5 = (tp.testAbschnitte?.eintraege ?? []).find((e) => e.buch === 'Green Line 5')
  pruefe(
    Boolean(tp.testTermin) && gewaehlt.length === 1 && gl5 && gewaehlt[0] === gl5.key,
    `Termin und Auswahl gespeichert (${JSON.stringify(gewaehlt)}; ${JSON.stringify(tp.testAbschnitte?.eintraege).slice(0, 400)})`
  )
  pruefe(await da(p.locator('[data-test-planen-datum]'), 5000), 'Knopf zeigt das Datum')
  // Kurseinstellungen ohne „Zeitraum und Test"
  await p.getByRole('tab', { name: /^Vokabeln/ }).click()
  await p.locator('[data-kurs-einstellungen-knopf]').first().click().catch(() => undefined)
  if (await da(p.locator('[data-kurs-einstellungen]'), 5000)) {
    pruefe((await p.getByText('Zeitraum und Test').count()) === 0, 'Kurseinstellungen ohne „Zeitraum und Test"')
    pruefe((await p.locator('[data-kurs-einstellungen] [data-vokabel-termin]').count()) === 0, 'Kein Testtermin mehr in den Kurseinstellungen')
    await p.keyboard.press('Escape')
  } else pruefe(false, 'Kurseinstellungen ließen sich nicht öffnen')

  // ---------- Geschichte: Thema, Seiten, einzelne Aufgabe
  await p.locator('[data-fach-leiste] [data-fach="Geschichte"]').click()
  await p.locator('[data-test-planen]').click()
  const g = p.locator('[data-test-planen-fenster="fach"]')
  pruefe(await da(g.locator('[data-test-plan-thema]')), 'Fenster für Thema/Seiten/Material (Geschichte)')
  await g.locator('[data-test-plan-datum]').fill(inTagen(12))
  await g.locator('[data-test-plan-thema]').fill('Erster Weltkrieg')
  await g.locator('[data-test-plan-seiten]').first().fill('S. 112–115')
  await g.locator('[data-test-plan-abschnitte]').first().fill('M3, Aufgabe 2')
  const quelle = g.locator('[data-test-plan-quelle^="blatt:"]').first()
  pruefe(await da(quelle), 'Arbeitsblatt der Klasse steht zur Auswahl')
  await quelle.locator('button').first().click()
  await quelle.locator('[data-test-plan-teil="a2"]').check()
  await p.screenshot({ path: join(out, 'fach-fenster.png') })
  await g.locator('[data-test-plan-speichern]').click()
  await p.waitForTimeout(1200)
  const plaene = (await (await lk.request.get(`${A}/server/testplaene/${gGe.id}`, { headers: KOPF })).json()).plaene ?? []
  const pl = plaene[0]
  pruefe(
    plaene.length === 1 &&
      pl.thema === 'Erster Weltkrieg' &&
      pl.seiten[0]?.seiten === 'S. 112–115' &&
      pl.seiten[0]?.abschnitte === 'M3, Aufgabe 2' &&
      pl.material[0]?.teile?.length === 1 &&
      pl.material[0].teile[0].key === 'a2',
    `Plan gespeichert (${JSON.stringify(pl)})`
  )
  pruefe(await da(g.locator(`[data-test-plan="${pl?.id}"]`), 4000), 'Geplanter Test steht oben im Fenster')
  await p.keyboard.press('Escape')
  pruefe(await da(p.locator('[data-test-planen-datum]'), 5000), 'Knopf zeigt das Datum (Geschichte)')
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
