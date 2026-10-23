// „Auf weniger Seiten" (23.10.2026, Wunsch der Lehrkraft: keine Folgeseite mit nur wenigen Zeilen). Ein echtes Arbeitsblatt
// aus dem lokalen Profil (nur gelesen) mit großzügigem Satz (14 pt, Zeilenabstand 1,6, Rand 25 mm): Der Knopf misst,
// schlägt Änderungen vor, „Übernehmen" spart eine Seite; Schrift nicht unter 10 pt; Rückgängig stellt alles wieder her.
// Ohne KI. Aufruf: node tests/e2e/server-weniger-seiten.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-weniger-seiten')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = readdirSync(ordner)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => join(ordner, f))
  .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .find((w) => (w.payload?.sheets?.[0]?.blocks?.length ?? 0) >= 4)
const payload = structuredClone(vorlage.payload)
payload.sheets = payload.sheets.slice(0, 1)
payload.meta.grade = 9
payload.meta.languageMode = 'standard'
payload.design.page = { ...payload.design.page, autoFontSize: false, baseFontPt: Number(process.env.PT ?? 14), lineHeight: 1.6, marginMm: 25 }

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  pruefe(Boolean(vorlage), `Vorlage: ${vorlage?.name}`)
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Seiten' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  await lk.request.post(`${A}/api`, {
    headers: KOPF,
    data: { channel: 'sheets:save', args: [{ id: 'seiten-probe', name: 'Seiten-Probe', stats: { sheetCount: 1 }, payload }] }
  })
  const p = await lk.newPage()
  p.on('console', (m) => m.type() === 'error' && console.log('KONSOLE', m.text().slice(0, 300)))
  p.on('pageerror', (e) => console.log('SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spaeter = p.getByRole('button', { name: 'Später einrichten' })
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  await p
    .getByRole('button', { name: /Meine Arbeitsblätter/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => undefined)
  await p.mouse.move(800, 700)
  await p.waitForTimeout(500)
  await p.locator('[data-bibliothek-eintrag="Seiten-Probe"]').click()
  const knopf = p.locator('[data-weniger-seiten]')
  await knopf.waitFor({ timeout: 30000 })
  await p.waitForTimeout(2500)
  const seiten = () => p.locator('.editor-canvas .ws-page:not(.ws-cover)').count()
  const vorher = await seiten()
  pruefe(vorher >= 2, `Blatt hat ${vorher} Seiten (mit großzügigem Satz)`)
  const t0 = Date.now()
  await knopf.click()
  const vorschlag = p.locator('[data-weniger-seiten-vorschlag]')
  const nicht = p.locator('[data-weniger-seiten-nicht]')
  await Promise.race([vorschlag.waitFor({ timeout: 90000 }), nicht.waitFor({ timeout: 90000 })]).catch(() => undefined)
  const dauer = Math.round((Date.now() - t0) / 1000)
  await p.screenshot({ path: join(out, '1-vorschlag.png') })
  pruefe(
    (await vorschlag.isVisible()) || (await nicht.isVisible()),
    `Ergebnis nach ${dauer} s (${(await vorschlag.isVisible()) ? 'Vorschlag' : 'passt nicht'})`
  )
  const text = (await vorschlag.innerText().catch(() => '')) || (await nicht.innerText().catch(() => ''))
  console.log(text.replace(/\n+/g, ' | '))
  const pt = /Schrift [\d,]+ → ([\d,]+) pt/.exec(text)
  pruefe(!pt || Number(pt[1].replace(',', '.')) >= 10, `Schrift nicht unter 10 pt (${pt?.[1] ?? 'unverändert'})`)
  // KI-Kürzung mit der Attrappe (ATTRAPPE=<Pfad der Attrappendatei des Servers>): nur wenn die Rechnung nicht reicht
  if (process.env.ATTRAPPE && (await nicht.isVisible())) {
    const bloecke = payload.sheets[0].blocks
    const aufgabe = bloecke.find((b) => b.type === 'task')
    const zugabe = bloecke.find((b) => ['learningGoals', 'selfCheck'].includes(b.type))
    writeFileSync(
      process.env.ATTRAPPE,
      JSON.stringify({
        verzoegerungMs: 300,
        antworten: {
          // ANTWORT=<Bericht aus tests/redteam/kuerzen.redteam.ts>: die echte KI-Antwort einspielen
          material_kuerzen: process.env.ANTWORT
            ? JSON.parse(readFileSync(process.env.ANTWORT, 'utf8')).rohAntwort
            : {
                aenderungen: [{ blockId: aufgabe.id, feld: 'instruction', text: 'KURZ: ' + aufgabe.instruction.slice(0, 20) }],
                weglassen: [zugabe.id, aufgabe.id]
              }
        }
      })
    )
    await p.locator('[data-weniger-seiten-kuerzen]').click()
    const kuerzung = p.locator('[data-weniger-seiten-kuerzung]')
    pruefe(
      await kuerzung.waitFor({ timeout: 60000 }).then(
        () => true,
        () => false
      ),
      'Kürzungsvorschlag der KI erscheint'
    )
    const kt = await kuerzung.innerText()
    console.log(kt.split('\n').filter(Boolean).join(' | ').slice(0, 400))
    pruefe(/Weglassen: (Lernziele|Selbsteinschätzung)/.test(kt) && !/Weglassen: Aufgabe/.test(kt), 'Weglassen nur die Zugabe, nie die Aufgabe')
    await p.screenshot({ path: join(out, '3-kuerzung.png') })
    await p.locator('[data-weniger-seiten-kuerzung-uebernehmen]').click()
    await p.waitForTimeout(3000)
    if (!process.env.ANTWORT) pruefe(await p.locator('.editor-canvas').getByText('KURZ:').first().isVisible(), 'Gekürzte Aufgabenstellung steht im Blatt')
    else pruefe((await p.locator('.editor-canvas').getByText('Expectation grid').count()) === 0, 'Weggelassene Selbsteinschätzung ist fort')
    writeFileSync(process.env.ATTRAPPE, '{}')
  }
  if (await vorschlag.isVisible()) {
    const soll = Number(/braucht das Blatt (\d+)/.exec(text)?.[1])
    // Im Editor stehen auch Zusatzseiten (Hilfekarten, Lösungen); der Dialog zählt nur die Schülerseiten
    const zusatz = vorher - Number(/statt (\d+) Seiten/.exec(text)?.[1])
    await p.locator('[data-weniger-seiten-uebernehmen]').click()
    await p.waitForTimeout(4000)
    const nachher = (await seiten()) - zusatz
    pruefe(nachher === soll && nachher < vorher - zusatz, `Nach dem Übernehmen ${nachher} Schülerseiten (vorher ${vorher - zusatz}, angekündigt ${soll})`)
    await p.screenshot({ path: join(out, '2-uebernommen.png') })
    await p.keyboard.press('Control+z')
    await p.waitForTimeout(4000)
    pruefe((await seiten()) === vorher, `Strg+Z: wieder ${vorher} Seiten`)
  }
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
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
