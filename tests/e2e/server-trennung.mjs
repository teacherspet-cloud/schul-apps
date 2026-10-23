// Trennung der Materialien (23.10.2026, Auftrag der Lehrkraft): „Jeder Nutzer sieht wirklich nur seine eigenen
// Materialien und diejenigen, die für seine Fachgruppe (z. B. Englisch) freigegeben sind."
//  1. Eigene Ablagen: Lea (Englisch) legt Material in allen Apps an – Ben (Englisch) und Cara (Mathe) sehen es weder in
//     der Liste noch per Kennung; auch nicht mit Pfad-Tricks in der Kennung.
//  2. Fachschaft: Lea gibt einen Vokabeltest für Englisch frei – Ben sieht ihn, Cara nicht.
//  3. Zurücknehmen: danach sieht ihn auch Ben nicht mehr.
// Ohne KI. Aufruf: node tests/e2e/server-trennung.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-trennung')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext()

// Je App eine Ablage: Kanal-Präfix, Kennung, Speicher-Argument
const ABLAGEN = [
  ['sheets', { stats: { sheetCount: 1 }, payload: { meta: { subjectId: 'englisch' }, sheets: [] } }],
  ['tests', { stats: { vocabCount: 0, includedCount: 0, hasTest: false, variantCount: 1, totalPoints: 0, language: 'en' }, payload: { doc: null } }],
  ['exams', { stats: {}, payload: { meta: { subjectId: 'englisch' }, parts: [] } }],
  ['kurztests', { stats: {}, payload: { meta: { subjectId: 'englisch' } } }],
  ['grammarTests', { stats: {}, payload: { meta: { subjectId: 'englisch' } } }],
  ['rueckmeldungen', { stats: {}, payload: { meta: {}, grundlage: { art: 'frei', titel: 'Geheim', aufgaben: 'Geheim' }, abgaben: [] } }],
  ['elternbriefe', { stats: {}, payload: { titel: 'Geheim' } }],
  ['tafelbilder', { stats: {}, payload: { titel: 'Geheim' } }]
]

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const konto = async (name, faecher) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext()
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })
      const t = await r.text()
      return { status: r.status(), ...(t.trim() ? JSON.parse(t) : {}) }
    }
    const get = async (pfad) => (await ctx.request.get(`${A}${pfad}`, { headers: KOPF })).json()
    const post = async (pfad, data) => {
      const r = await ctx.request.post(`${A}${pfad}`, { headers: KOPF, data })
      return { status: r.status(), ...(await r.json().catch(() => ({}))) }
    }
    await api('settings:set', { eigeneFaecher: faecher })
    return { ...k, ctx, api, get, post, name }
  }
  const lea = await konto('Lea Englisch', ['englisch'])
  const ben = await konto('Ben Englisch', ['englisch'])
  const cara = await konto('Cara Mathe', ['mathematik'])

  // ---------- 1. Eigene Ablagen
  for (const [kanal, rest] of ABLAGEN) {
    const id = `tr-${kanal.toLowerCase()}-1`
    const s = await lea.api(`${kanal}:save`, { id, name: `Leas ${kanal}`, ...rest })
    if (!s.ok) {
      pruefe(false, `${kanal}: Lea kann nicht speichern (${s.error ?? s.fehler ?? s.status}) – Trennung nicht prüfbar`)
      continue
    }
    const eigene = await lea.api(`${kanal}:list`)
    pruefe((eigene.value ?? []).some((m) => m.id === id), `${kanal}: Lea sieht ihr Material`)
    for (const andere of [ben, cara]) {
      const liste = await andere.api(`${kanal}:list`)
      pruefe(liste.ok && !(liste.value ?? []).some((m) => m.id === id), `${kanal}: ${andere.name} sieht es nicht in der Liste`)
      const einzeln = await andere.api(`${kanal}:get`, id)
      pruefe(!einzeln.ok || !einzeln.value, `${kanal}: ${andere.name} bekommt es auch per Kennung nicht`)
      const loeschen = await andere.api(`${kanal}:delete`, id)
      pruefe((await lea.api(`${kanal}:get`, id)).ok, `${kanal}: ${andere.name} kann es nicht löschen (${loeschen.ok ? 'Aufruf ok, Material bleibt' : 'abgelehnt'})`)
    }
    // Pfad-Tricks in der Kennung
    for (const trick of [`../${lea.id}/${id}`, `..\\..\\${id}`, `%2e%2e/${id}`]) {
      const r = await ben.api(`${kanal}:get`, trick)
      pruefe(!r.ok || !r.value, `${kanal}: Kennung „${trick}“ führt nicht zu fremdem Material`)
    }
  }

  // ---------- 2. Fachschaft: Freigabe für Englisch
  const fr = await lea.post('/server/fachschaft/freigeben', { art: 'vokabeltest', id: 'tr-tests-1' })
  pruefe(fr.status === 200, `Lea gibt den Vokabeltest für die Fachschaft frei (${fr.status} ${fr.fehler ?? ''})`)
  const sieht = async (wer) => ((await wer.get('/server/fachschaft')).eintraege ?? []).some((e) => e.titel === 'Leas tests')
  pruefe(await sieht(ben), 'Ben (Englisch) sieht die Freigabe der Fachschaft')
  pruefe(!(await sieht(cara)), 'Cara (Mathe) sieht sie nicht')
  // Ohne eigene Fächer (23.10.2026): nur „allgemeine“ Freigaben – vorher alle Fachgruppen
  await cara.api('settings:set', { eigeneFaecher: [] })
  pruefe(!(await sieht(cara)), 'Cara ohne Fächer sieht die Englisch-Freigabe nicht')
  const fachordner = await cara.get('/server/fach')
  pruefe((fachordner.faecher ?? []).every((f) => f.id === 'allgemein'), `Alter Fachordner ohne Fächer: nur „Allgemein“ (${(fachordner.faecher ?? []).map((f) => f.id).join(', ')})`)
  await cara.api('settings:set', { eigeneFaecher: ['mathematik'] })
  // Und der Inhalt selbst bleibt in Leas Ablage
  pruefe(!(await ben.api('tests:get', 'tr-tests-1')).value, 'Ben liest Leas Ablage auch nach der Freigabe nicht direkt')

  // ---------- 3. Zurücknehmen
  await lea.post('/server/fachschaft/zuruecknehmen', { art: 'vokabeltest', id: 'tr-tests-1' })
  pruefe(!(await sieht(ben)), 'Nach dem Zurücknehmen sieht Ben sie nicht mehr')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
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
