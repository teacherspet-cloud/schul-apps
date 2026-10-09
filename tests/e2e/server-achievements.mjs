// Achievements (09.10.2026, Wunsch der Lehrkraft): alle Achievements mit Fortschritt, geheime verborgen, eigener Platz
// in der Klasse (ab 5 Lernenden, nach Übungstagen der letzten 4 Wochen, keine Namen), Anteil der Schule erst ab 10
// Lernenden (Testkonten zählen dort nicht – hier also keiner). Dazu: keine Namen anderer in der Antwort.
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

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const trainings = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let lk
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
  const ben = await browser.newContext()
  await anmelden(ben, kinder[1].benutzer, kinder[1].passwort)
  const b = await api(ben)
  pruefe(b.platz?.platz === 2 && b.platz?.von === 5 && b.platz?.tage === 0, `Ben (kein Übungstag) teilt sich Platz 2 (${b.platz?.platz} von ${b.platz?.von})`)

  // Oberfläche: Fenster „Achievements"
  const p = await mia.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}/s/`)
  await p.locator('[data-rekorde-knopf]').first().click()
  pruefe(await da(p.locator('[data-achievements]')), 'Fenster mit Achievements')
  pruefe(await da(p.locator('[data-achievements-platz="1/5"]')), 'Platz in der Klasse sichtbar')
  pruefe((await p.locator('[data-achievements-platz]').innerText()).includes('nach Übungstagen der letzten 4 Wochen'), 'Maßstab wird genannt')
  pruefe(await da(p.locator('[data-achievement="diktat-10"][data-erreicht="false"] [data-achievement-fortschritt="3/10"]')), 'Fortschrittsbalken 3/10')
  pruefe((await p.locator('[data-achievement="comeback"]').count()) === 0 && (await da(p.locator('[data-achievements-verborgen="3"]'))), 'Geheime nur als Zahl')
  pruefe((await p.locator('[data-achievement-anteil]').count()) === 0, 'Kein Schulanteil unter 10 Lernenden')
  await p.screenshot({ path: join(out, '1-achievements.png'), fullPage: true })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 4).join(' | ')}`)
} finally {
  for (const id of trainings) if (lk) await lk.request.post(`${A}/server/vokabeln/${id}/loeschen`, { headers: KOPF, data: {} }).catch(() => undefined)
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
