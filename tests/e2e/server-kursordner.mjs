// Kursordner beim „Ablegen ▾" in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft): Kurse quer zu den Klassen landen in
// ihrem IServ-Gruppenordner („FR 7 Kon"), Klassenfächer bleiben in „Gruppen/Klasse 7b/Mathematik".
//
// IServ ist NICHT echt: Die Exe „Schul-Apps Online" wird im Browser nachgestellt (window.__schulappsClient), ihr WebDAV
// ist der nachgebaute IServ aus tests/support/fakeWebdav.mjs (ohne Netz, im Testprozess). Es wird nichts auf einen echten
// IServ geschrieben.
//
// Geprüft wird:
//  1. Französisch der 7b (von Hand angelegte Lerngruppe) → Rückfrage zeigt „Gruppen › FR 7 Kon" als Ziel; die PDF
//     landet im Fake unter /Groups/FR 7 Kon/…
//  2. Mathematik der 7b → kein Kursordner, Ziel „Gruppen › Klasse 7b › Mathematik"
//  3. Sek II „Englisch 13 eA (Kon)" → „EN 13 eA Kon"
//  4. Spanisch der 7b mit zwei Spanisch-Kursen → „In welchen Kursordner?", nichts vorgewählt; die Wahl wird gemerkt
//  5. „Anderer Ordner …" wählt frei („Fachschaft Englisch")
// Vorher: Server lokal (Port 18443, mit SCHULAPPS_CHROMIUM für PDF).
// Aufruf: node tests/e2e/server-kursordner.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { fakeWebdav } from '../support/fakeWebdav.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-kursordner')
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

// Gruppenordner wie in IServ. Ein „/" kann in einem WebDAV-Ordnernamen nicht stehen – „RE 7b/c Xyz" heißt dort
// „RE 7b-c Xyz" (die Schreibweise mit „/" prüft tests/kursAblage.test.ts).
const GRUPPEN = ['Klasse 7b', 'FR 7 Kon', 'SN 7 Abc', 'SN 7 Def', 'RE 7b-c Xyz', 'EN 13 eA Kon', 'Fachschaft Englisch']
const fake = fakeWebdav({ ordner: GRUPPEN.map((g) => `/Groups/${g}`) })
const HOST = 'webdav.meineschule.de'
const AUTH = { authorization: 'Basic ' + Buffer.from(`${fake.benutzer}:${fake.passwort}`, 'utf8').toString('base64') }
const dav = (methode, pfad, koerper) => fake.behandle(methode, HOST, pfad, { ...AUTH, depth: '1' }, koerper)
/** Unterordner eines Pfads im Fake (PROPFIND Depth 1) */
function ordnerVon(pfad) {
  const teile = String(pfad ?? '')
    .split('/')
    .filter(Boolean)
  const p = teile.length ? '/' + teile.join('/') : ''
  const r = dav('PROPFIND', p)
  if (r.status !== 207) throw new Error(`Ordner nicht gefunden (${r.status})`)
  return [...fake.baum.entries()]
    .filter(([k, v]) => v.ordner && k !== p && k.slice(0, k.lastIndexOf('/')) === p)
    .map(([k]) => ({ name: k.slice(k.lastIndexOf('/') + 1), pfad: k.slice(1), ordner: true }))
}
/** Wie die Exe: oberste Ebene angleichen („Gruppen" → „Groups"), fehlende Ordner anlegen, Datei hochladen */
const abgelegt = []
function ablegen(name, laenge, ziel) {
  const teile = [...(ziel?.iservPfad ?? [])]
  if (/^(gruppen|groups)$/i.test(teile[0] ?? '')) teile[0] = 'Groups'
  let p = ''
  for (const t of teile) {
    p += '/' + t
    if (!fake.baum.has(p)) dav('MKCOL', p)
  }
  const r = dav('PUT', `${p}/${name}`, Buffer.alloc(laenge, 1))
  if (r.status >= 300) throw new Error(`Hochladen fehlgeschlagen (${r.status})`)
  abgelegt.push(`${p}/${name}`)
  return `iserv:${p.slice(1)}/${name}`
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Kim Kurs' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  // Von Hand angelegte Lerngruppen (ohne IServ-Gruppe) – so wie meist in der Exe
  const neu = async (name, fach) => (await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name, fach, iservGruppe: '' } })).json()
  const blatt = async (g, titel) =>
    lk.request.post(`${A}/server/blaetter/freigeben`, {
      headers: KOPF,
      data: {
        titel,
        html: `<!doctype html><html><body><div class="ws-page"><p>${titel}</p></div></body></html>`,
        aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
        rueckmeldung: {
          version: 1,
          meta: { title: titel, subjectId: 'englisch', subjectLabel: g.fach, grade: 7, anrede: 'du', schwerpunkt: '' },
          grundlage: { art: 'frei', titel, aufgaben: 'Aufgabe 1: Schreibe.', erwartung: 'Ein Satz.' },
          abgaben: [],
          createdAt: new Date().toISOString()
        },
        lerngruppeId: g.id,
        schueler: [],
        einstellungen: { feedback: false }
      }
    })
  const gruppen = {
    fr: await neu('7b', 'Französisch'),
    ma: await neu('7b', 'Mathematik'),
    sn: await neu('7b', 'Spanisch'),
    en: await neu('Englisch 13 eA (Kon)', 'Englisch')
  }
  for (const [k, g] of Object.entries(gruppen)) {
    const r = await blatt(g, `Blatt ${k}`)
    if (!r.ok()) throw new Error(`Blatt ${k} nicht freigegeben: ${r.status()} ${await r.text()}`)
  }
  const d = await (await lk.request.get(`${A}/server/klassen/${gruppen.fr.id}`, { headers: KOPF })).json()
  pruefe(d.ablageMuster === 'Gruppen/Klasse {Klasse}/{Fach}' && 'iservKuerzel' in d, `Fach-Details mit Ablagestruktur und Kürzel (${d.ablageMuster}, ${d.iservKuerzel})`)

  // ---------- Oberfläche mit nachgestellter Exe
  await lk.exposeFunction('__davOrdner', (pfad) => ordnerVon(pfad))
  await lk.exposeFunction('__davAblegen', (name, laenge, ziel) => ablegen(name, laenge, ziel))
  await lk.addInitScript(() => {
    const status = { verbunden: true, schule: 'meineschule.de', benutzer: 'erika.muster', basis: 'https://webdav.meineschule.de/', ziel: 'Home/Schulmaterial', passwortGespeichert: true }
    window.__schulappsClient = {
      name: 'Schul-Apps Online',
      iserv: {
        status: async () => status,
        verbinden: async () => ({ basis: status.basis, ordner: [] }),
        ordner: (pfad) => window.__davOrdner(pfad),
        eintraege: (pfad) => window.__davOrdner(pfad),
        laden: async () => {
          throw new Error('nicht im Test')
        },
        trennen: async () => undefined,
        ablegen: (name, daten, ziel) => window.__davAblegen(name, typeof daten === 'string' ? daten.length : daten.byteLength, ziel)
      }
    }
  })
  const p = await lk.newPage()
  const fehler = []
  p.on('pageerror', (e) => fehler.push(e.message))
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await p.locator('.app-leiste [aria-label="Meine Klassen"]').click()
  await p.locator('[data-klassen-liste]').waitFor({ timeout: 10000 })

  /** Fach öffnen, Ablegen ▾ › In IServ ablegen …, Rückfrage abwarten */
  const frage = async (klasse, fach, titel) => {
    await p.getByRole('button', { name: 'Alle Klassen' }).click({ timeout: 2000 }).catch(() => undefined)
    await p.locator(`[data-klasse="${klasse}"]`).click()
    const reiter = p.locator(`[data-fach-leiste] [data-fach="${fach}"]`)
    if (await da(reiter, 4000)) await reiter.click()
    await p.locator(`[data-klasse-detail="${klasse} – ${fach}"]`).waitFor({ timeout: 10000 })
    const karte = p.locator(`[data-material-titel="${titel}"]`)
    await karte.waitFor({ timeout: 10000 })
    await karte.locator('[data-ablegen]').click()
    const punkt = p.locator('[data-ablegen-menue] [data-ablegen-art="iserv"]')
    await punkt.waitFor({ timeout: 5000 })
    // IServ wird einmal je Sitzung gefragt – kurz warten, bis der Menüpunkt freigegeben ist
    for (let i = 0; i < 20 && (await punkt.getAttribute('data-disabled')) !== null; i++) await p.waitForTimeout(150)
    await punkt.click()
    await p.locator('[data-iserv-ziel-frage] [data-iserv-ziel]').first().waitFor({ timeout: 10000 })
  }
  const ziel = () => p.locator('[data-iserv-ziel-frage] [data-ablage-ziel]').getAttribute('data-ablage-ziel')
  const speichern = async () => {
    const vorher = abgelegt.length
    await p.locator('[data-ablegen-speichern]').click()
    for (let i = 0; i < 100 && abgelegt.length === vorher; i++) await p.waitForTimeout(200)
    return abgelegt.length > vorher ? abgelegt[abgelegt.length - 1] : ''
  }

  // 1. Französisch der 7b → FR 7 Kon
  await frage('7b', 'Französisch', 'Blatt fr')
  pruefe((await ziel()) === 'Gruppen/FR 7 Kon', `Französisch 7b: Ziel vorgewählt „Gruppen › FR 7 Kon" (${await ziel()})`)
  const arten = await p.locator('[data-iserv-ziel]').evaluateAll((e) => e.map((x) => `${x.getAttribute('data-iserv-ziel-art')}:${x.getAttribute('data-iserv-ziel')}`))
  pruefe(arten.join(' | ') === 'kurs:Gruppen/FR 7 Kon | klasse:Gruppen/Klasse 7b/Französisch', `Kursordner und Klassenordner zur Wahl (${arten.join(' | ')})`)
  pruefe(await da(p.locator('[data-anderer-ordner]'), 2000), '„Anderer Ordner …" angeboten')
  await p.screenshot({ path: join(out, '1-franzoesisch.png') })
  const fr = await speichern()
  pruefe(fr === '/Groups/FR 7 Kon/Blatt fr.pdf', `PDF liegt im Kursordner (${fr || 'nichts abgelegt'})`)

  // 2. Mathematik der 7b → Klassenstruktur
  await frage('7b', 'Mathematik', 'Blatt ma')
  pruefe((await ziel()) === 'Gruppen/Klasse 7b/Mathematik', `Mathematik 7b bleibt in der Klasse (${await ziel()})`)
  pruefe((await p.locator('[data-iserv-ziel-art="kurs"]').count()) === 0, 'Mathematik: kein Kursordner angeboten')
  const ma = await speichern()
  pruefe(ma === '/Groups/Klasse 7b/Mathematik/Blatt ma.pdf', `PDF liegt in Klasse 7b/Mathematik (${ma || 'nichts abgelegt'})`)

  // 3. Sek II
  await frage('Englisch 13 eA (Kon)', 'Englisch', 'Blatt en')
  pruefe((await ziel()) === 'Gruppen/EN 13 eA Kon', `Sek II: „EN 13 eA Kon" (${await ziel()})`)
  await p.keyboard.press('Escape')

  // 4. Spanisch mit zwei Kursen → Auswahl, gemerkt
  await frage('7b', 'Spanisch', 'Blatt sn')
  pruefe(await da(p.locator('[data-kursordner-frage]'), 3000), 'Zwei Spanisch-Kurse: „In welchen Kursordner?"')
  pruefe((await ziel()) === '' && (await p.locator('[data-ablegen-speichern]').isDisabled()), 'Nichts vorgewählt, „Ablegen" erst nach der Wahl')
  await p.screenshot({ path: join(out, '2-auswahl.png') })
  await p.locator('[data-iserv-ziel="Gruppen/SN 7 Def"]').click()
  const sn = await speichern()
  pruefe(sn === '/Groups/SN 7 Def/Blatt sn.pdf', `PDF im gewählten Kursordner (${sn || 'nichts abgelegt'})`)
  await frage('7b', 'Spanisch', 'Blatt sn')
  pruefe((await ziel()) === 'Gruppen/SN 7 Def', `Wahl gemerkt (${await ziel()})`)

  // 5. Anderer Ordner
  await p.locator('[data-anderer-ordner]').click()
  await p.locator('[data-iserv-blaettern] [data-iserv-eintrag="Fachschaft Englisch"]').click()
  await p.locator('[data-iserv-blaettern] [data-iserv-hier]').click()
  pruefe((await ziel()) === 'Groups/Fachschaft Englisch', `Anderer Ordner gewählt (${await ziel()})`)
  const anders = await speichern()
  pruefe(anders === '/Groups/Fachschaft Englisch/Blatt sn.pdf', `PDF im frei gewählten Ordner (${anders || 'nichts abgelegt'})`)
  pruefe(!fehler.length, `Keine Fehler im Fenster (${fehler.join(' | ')})`)
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
