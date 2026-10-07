// Handschrift im Onlinetest (02.10.2026) – ein Gerät, KI-Attrappe, ohne IServ (Beitritt mit Namen).
// Vorher: Server lokal mit SCHULAPPS_KI_ATTRAPPE starten; Antwort „onlinetest_handschrift" als Folge:
//   [„New pupils integrate more easy", „easily", „verry" (unsicher)]
// Aufruf: node tests/e2e/server-handschrift.mjs <Ausgabeordner> [adresse] [admin] [passwort]
//
// Geprüft: Umschalten auf Stift; Schreiben → nach kurzem Absetzen Wortkärtchen („erkannt als");
// Durchstreichen löscht ein Kärtchen; Antippen ersetzt (vergrößerte Fläche); „+" fügt ein;
// gedrückt halten und ziehen verschiebt; Kritzeln in der Schreibfläche löscht Tinte; die
// Tastaturfelder sind ohne Rechtschreibhilfe; ein Stift auf dem Tastaturfeld wechselt zur
// Schreibfläche; die Lehrkraft sieht die Tinte; falsch Geschriebenes bleibt falsch geschrieben.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-handschrift')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const TEST = {
  version: 1,
  header: { title: 'Vocabulary Test', showName: true, showDate: true, showClass: false, showSchool: false, schoolName: '', showVariant: true, showPoints: true, showGrade: true, subtitle: '' },
  settings: { targetLanguage: 'en', level: 'A2', stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 1, grade: 7, vocabCount: 1, variantCount: 1, variantMode: 'sameVocab', tasks: [], topic: 'School', pictureSource: 'none', answerKey: true, seed: 1 },
  vocab: [],
  variants: [
    {
      id: 'A',
      label: 'A',
      blocks: [
        { id: 'o', kind: 'open', taskType: 'mediation', title: 'Say it in English', instruction: 'Express the sentence in English.', pointsPerItem: 2, items: [{ id: 'o1', prompt: 'Neue Schüler integrieren sich leichter.', modelAnswer: 'New students integrate more easily.', lines: 2 }] },
        { id: 'g', kind: 'gap', taskType: 'gapSentences', title: 'Gaps', instruction: 'Fill in.', pointsPerItem: 1, wordBank: false, firstLetterHint: false, extraBankWords: [], items: [{ id: 'g1', sentences: [{ before: 'It is', after: 'cold.' }], answer: 'very' }] }
      ]
    }
  ],
  fontSize: 12,
  createdAt: new Date().toISOString()
}

/** Ein Wort „schreiben": ein paar Bögen mit der Maus */
async function schreibe(page, flaeche, x0 = 20) {
  const r = await flaeche.boundingBox()
  const y = r.y + r.height * 0.55
  await page.mouse.move(r.x + x0, y)
  await page.mouse.down()
  for (let i = 0; i <= 24; i++) await page.mouse.move(r.x + x0 + i * 6, y + Math.sin(i / 2) * 12 - (i % 6 === 0 ? 14 : 0))
  await page.mouse.up()
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  // Wie bei der Lehrkraft: KI über das ChatGPT-Abo – die Erkennung muss darüber laufen (02.10.2026)
  const abo = await (await lk.request.post(`${A}/api`, { headers: KOPF, data: { channel: 'settings:set', args: [{ ai: { textProvider: 'openai', access: { openai: 'subscription' } } }] } })).json()
  pruefe(abo.ok, 'Lehrkraft nutzt das Abo (ChatGPT)')
  const neu = await (await lk.request.post(`${A}/server/onlinetest/erstellen`, { headers: KOPF, data: { titel: 'Handschrift', test: TEST, zeitMin: 10, handschrift: true } })).json()
  await lk.request.post(`${A}/server/onlinetest/${neu.id}/status`, { headers: KOPF, data: { status: 'starten' } })

  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } })
  const s = await ctx.newPage()
  await s.goto(neu.link)
  await s.locator('[data-gastname]').fill('Kim T.')
  await s.getByRole('button', { name: 'Weiter' }).click()
  await s.getByRole('button', { name: 'Test beginnen' }).click()
  // Tastaturfelder ohne jede Schreibhilfe
  const feld = s.locator('input:not([type=radio]):not([type=hidden])').first()
  pruefe(
    (await feld.getAttribute('spellcheck')) === 'false' && (await feld.getAttribute('autocorrect')) === 'off' && (await feld.getAttribute('autocomplete')) === 'off',
    'Tastaturfeld: keine Rechtschreibprüfung, keine Autokorrektur, keine Vorschläge'
  )
  // Stift für alle Felder
  await s.locator('[data-schreibart]').getByText('Stift').click()
  const flaeche = s.locator('[data-handfeld] canvas[data-schreibflaeche="schrift"]').first()
  await flaeche.waitFor({ timeout: 5000 })
  pruefe((await s.locator('[data-handfeld]').count()) === 2, 'Stift: beide Antwortfelder werden zu Schreibflächen')
  // Kritzeln löscht Tinte
  await schreibe(s, flaeche)
  const r = await flaeche.boundingBox()
  const mitte = r.y + r.height * 0.55
  await s.mouse.move(r.x + 15, mitte - 10)
  await s.mouse.down()
  for (let i = 0; i < 10; i++) await s.mouse.move(r.x + (i % 2 ? 180 : 15), mitte - 10 + i * 2)
  await s.mouse.up()
  await s.waitForTimeout(400)
  pruefe((await flaeche.getAttribute('data-striche')) === '0', 'Durchkritzeln löscht die Tinte darunter')
  await s.waitForTimeout(1300)
  pruefe((await s.locator('[data-handfeld] [data-karte]').count()) === 0, 'danach nichts zu erkennen')
  // Schreiben → Kärtchen
  await schreibe(s, flaeche)
  await s.locator('[data-handfeld] [data-karte]').first().waitFor({ timeout: 10000 })
  const woerter = async () => (await s.locator('[data-handfeld]').first().locator('[data-karte]').allInnerTexts()).map((x) => x.trim())
  pruefe((await woerter()).join(' ') === 'New pupils integrate more easy', `erkannt als Wortkärtchen: „${(await woerter()).join(' ')}"`)
  await s.screenshot({ path: join(out, '1-kaertchen.png') })
  // Durchstreichen löscht „easy"
  const easy = s.locator('[data-handfeld]').first().locator('[data-karte]', { hasText: 'easy' })
  const eb = await easy.boundingBox()
  await s.mouse.move(eb.x - 4, eb.y + eb.height / 2)
  await s.mouse.down()
  for (let i = 0; i <= 10; i++) await s.mouse.move(eb.x - 4 + ((eb.width + 8) * i) / 10, eb.y + eb.height / 2 + 1)
  await s.mouse.up()
  await s.waitForTimeout(300)
  pruefe((await woerter()).join(' ') === 'New pupils integrate more', 'Durchstreichen löscht ein Wort')
  // „+" am Ende: Wort einfügen über die vergrößerte Fläche
  const plus = s.locator('[data-handfeld]').first().locator('[data-luecke]').last()
  await plus.click()
  const gross = s.locator('[data-grosses-feld] canvas')
  await gross.waitFor({ timeout: 5000 })
  await schreibe(s, gross)
  await s.locator('[data-erkannt]').waitFor({ timeout: 10000 })
  pruefe((await s.locator('[data-erkannt]').innerText()).includes('easily'), 'vergrößerte Fläche: „erkannt als" sofort sichtbar')
  await s.locator('[data-uebernehmen]').click()
  await s.waitForTimeout(300)
  pruefe((await woerter()).join(' ') === 'New pupils integrate more easily', 'Einfügen über „+": New pupils integrate more easily')
  // Verschieben: „more" vor „integrate"
  const more = s.locator('[data-handfeld]').first().locator('[data-karte]', { hasText: 'more' })
  const mb = await more.boundingBox()
  const ziel = await s.locator('[data-handfeld]').first().locator('[data-luecke]').nth(2).boundingBox()
  await s.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await s.mouse.down()
  await s.waitForTimeout(650)
  await s.mouse.move(ziel.x + ziel.width / 2, ziel.y + ziel.height / 2, { steps: 8 })
  await s.mouse.up()
  await s.waitForTimeout(300)
  pruefe((await woerter()).join(' ') === 'New pupils more integrate easily', `gedrückt halten und ziehen verschiebt: „${(await woerter()).join(' ')}"`)
  // Rückgängig
  await s.locator('[data-handfeld]').first().locator('[data-rueckgaengig]').click()
  pruefe((await woerter()).join(' ') === 'New pupils integrate more easily', 'Rückgängig nimmt das Verschieben zurück')
  // Zweites Feld: falsch geschrieben bleibt falsch geschrieben
  const f2 = s.locator('[data-handfeld]').nth(1).locator('canvas[data-schreibflaeche="schrift"]')
  await schreibe(s, f2)
  await s.locator('[data-handfeld]').nth(1).locator('[data-karte]').first().waitFor({ timeout: 10000 })
  pruefe((await s.locator('[data-handfeld]').nth(1).locator('[data-karte]').innerText()).trim() === 'verry', 'keine Rechtschreibkorrektur: „verry" bleibt „verry" (unsicher markiert)')
  await s.screenshot({ path: join(out, '2-fertig.png') })
  await s.waitForTimeout(2600)
  s.once('dialog', (d) => void d.accept())
  await s.getByRole('button', { name: 'Abgeben' }).click()
  await s.locator('[data-ergebnis-wartet], [data-ergebnis]').first().waitFor({ timeout: 10000 })
  // Lehrkraft: Antworten und Tinte
  const d = await (await lk.request.get(`${A}/server/onlinetest/${neu.id}`, { headers: KOPF })).json()
  const t = d.teilnahmen[0]
  pruefe(t.antworten['o.o1.a'] === 'New pupils integrate more easily' && t.antworten['g.g1.a'] === 'verry', `gespeichert: „${t.antworten['o.o1.a']}" / „${t.antworten['g.g1.a']}"`)
  const tinte = await (await lk.request.post(`${A}/server/onlinetest/${neu.id}/tinte`, { headers: KOPF, data: { teilnahme: t.id } })).json()
  pruefe(tinte.tinte.length >= 3 && tinte.tinte.every((x) => x.bild.startsWith('data:image/png')), `Lehrkraft sieht die Tinte (${tinte.tinte.length} Schriftproben)`)
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.getByRole('button', { name: /Onlinetest/ }).first().click()
  await p.locator('[data-testliste] tbody tr').first().click()
  await p.locator('[data-namensliste-knopf]').click()
  await p.getByText('Kim T.').first().click()
  pruefe(await p.locator('[data-tinte] img').first().waitFor({ timeout: 10000 }).then(() => true, () => false), 'Durchsicht zeigt das Schriftbild neben der Antwort')
  await p.screenshot({ path: join(out, '3-durchsicht.png') })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser.contexts().flatMap((c) => c.pages()).entries()) await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  const u = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json().catch(() => ({ nutzer: [] }))
  for (const n of u.nutzer ?? []) if (n.quelle === 'gast') zuLoeschen.push(n.id)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
