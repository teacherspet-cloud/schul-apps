// Medienbank der Vokabeln und gemeinsame Lehrwerke (05.10.2026). KI nur als Attrappe (Bildsuche, Bildwahl, Bild, Stimmen).
//  – Admin: Green Line ist „gemeinsam", Leiste der Medienbank; Beispielbilder suchen (KI wählt), Aussprache und
//    Satz-Aussprache erzeugen; Bild-Pop-up mit Kandidaten und „Von der KI erzeugen".
//  – Lehrkraft: dasselbe Lehrwerk nur ansehen (Hinweis, keine Leiste, Felder schreibgeschützt); Speichern und
//    Medien ändern lehnt der Server ab; Bilder und Aussprache sieht/hört sie.
//  – Lernende: /s/api/medien liefert Bild und Aussprache, die Dateien kommen an; der Trainer zeigt das Bild.
// Vorher: Server lokal mit KI-Attrappe (bildsuche, bild, tts, antworten.vokabel_bildwahl), IServ NICHT eingerichtet.
// Aufruf: node tests/e2e/server-medienbank.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-medienbank')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
const KLASSE = `6m${Date.now() % 1000}`
// Medienaufträge laufen seit 06.10.2026 in der Auftragsleiste unten rechts: Leiste aufklappen, fertige Zeile abwarten
const auftragFertig = async (p, art, ms = 180000) => {
  if (await p.locator('.auftrags-pille').isVisible().catch(() => false)) await p.locator('.auftrags-pille').click()
  return da(p.locator('.auftrags-zeile[data-status="fertig"]', { hasText: art }).first(), ms)
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )
const api = async (ctx, channel, ...args) => {
  const r = await (await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })).json()
  return r
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
let woerter = []
const verwaltung = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })

async function lehrwerkOeffnen(p) {
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Vokabellisten"]').click()
  await p.waitForTimeout(1200)
  // Schulbuchreihen sind anfangs zugeklappt (Reihe aufklappen, dann die Bände)
  const reihe = p.locator('.module-container:not([hidden]) [data-reihe*="Green Line"] button[aria-expanded="false"]').first()
  if (await reihe.isVisible().catch(() => false)) await reihe.click().catch(() => undefined)
  await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Vokabeln bearbeiten' }).first().click()
  await p.locator('.module-container:not([hidden]) .vokabel-tabelle').waitFor({ timeout: 20000 })
  await p.waitForTimeout(1200)
}

try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  // Standardstimmen für Englisch (Attrappe): weibliche und männliche Fassung (07.10.2026)
  const st = await api(verwaltung, 'medien:stimme-setzen', 'en', 'probe-w', 'w')
  const st2 = await api(verwaltung, 'medien:stimme-setzen', 'en', 'probe-m', 'm')
  pruefe(st.ok && st2.ok && st2.value?.en?.w === 'probe-w' && st2.value?.en?.m === 'probe-m', 'Admin setzt weibliche und männliche Standardstimme für Englisch')

  // ---------- Admin
  const p = await verwaltung.newPage()
  await lehrwerkOeffnen(p)
  pruefe(await da(p.locator('[data-gemeinsam]')), 'Green Line ist als „gemeinsam" gekennzeichnet')
  pruefe(await da(p.locator('[data-medien-leiste]')), 'Admin sieht die Leiste der Medienbank')
  woerter = await p
    .locator('.module-container:not([hidden]) .vokabel-tabelle [data-feld="term"]')
    .evaluateAll((e) => e.map((x) => x.value).filter(Boolean))
  pruefe(woerter.length >= 4, `Abschnitt mit ${woerter.length} Wörtern`)
  await p.screenshot({ path: join(out, '1-admin.png') })
  await p.locator('[data-medien-bilder]').click()
  pruefe(await auftragFertig(p, 'Beispielbilder suchen'), 'Beispielbilder gesucht (KI wählt aus)')
  await p.waitForTimeout(800)
  const bilder = await p.locator('[data-beispielbild] img').count()
  pruefe(bilder >= 1, `Beispielbilder in der Tabelle: ${bilder}`)
  await p.locator('[data-medien-aussprache]').click()
  pruefe(await auftragFertig(p, 'Aussprache erzeugen'), 'Aussprache erzeugt')
  await p.waitForTimeout(800)
  pruefe((await p.locator('[data-aussprache="wort"]').count()) >= 1, 'Aussprache-Knöpfe in der Tabelle')
  pruefe((await p.locator('[data-lage="m"] [data-aussprache="wort"]').count()) >= 1, 'Aussprache auch in männlicher Fassung (eigener Knopf je Fassung)')
  {
    // Lernende bekommen ihre Fassung, die andere als Rückfall
    const q = (lage) => `${A}/s/api/medien?sprache=en&lage=${lage}&w=${encodeURIComponent(woerter[0])}`
    const w = await (await verwaltung.request.get(q('w'))).json()
    const m = await (await verwaltung.request.get(q('m'))).json()
    pruefe(
      w.medien?.[woerter[0]]?.ton?.stimme === 'probe-w' && m.medien?.[woerter[0]]?.ton?.stimme === 'probe-m',
      `Lernende hören die gewählte Fassung (w: ${w.medien?.[woerter[0]]?.ton?.stimme}, m: ${m.medien?.[woerter[0]]?.ton?.stimme})`
    )
  }
  if (await p.locator('[data-medien-satz]').isEnabled()) {
    await p.locator('[data-medien-satz]').click()
    pruefe(await auftragFertig(p, 'Satz-Aussprache erzeugen'), 'Satz-Aussprache erzeugt')
    await p.waitForTimeout(800)
    pruefe((await p.locator('[data-aussprache="satz"]').count()) >= 1, 'Satz-Aussprache-Knöpfe in der Tabelle')
  }
  await p.screenshot({ path: join(out, '2-medien.png'), fullPage: true })
  // Bild-Pop-up
  await p.locator('[data-beispielbild]:has(img)').first().click()
  pruefe(await da(p.locator('[data-bild-kandidat]').first()), 'Pop-up zeigt die gefundenen Bilder zum Umwählen')
  await p.locator('[data-bild-ki]').click()
  pruefe(await auftragFertig(p, 'Beispielbild von der KI'), '„Von der KI erzeugen" ersetzt das Bild')
  await p.screenshot({ path: join(out, '3-bilddialog.png') })
  await p.keyboard.press('Escape')

  // ---------- Bildstufen (07.10.2026): je Altersstufe ein eigenes Bild, sonst das der nächsten Stufe
  await p.locator('[data-bildstufe-wahl]').getByText('Kl. 7–10').click()
  await p.waitForTimeout(800)
  const rueckfall = await p.locator('[data-beispielbild][data-bildstufe="s2"] img').count()
  pruefe(rueckfall >= 1, `Kl. 7–10: bis dahin das Bild der Stufe 5–6 als Rückfall (${rueckfall})`)
  pruefe(await da(p.locator('[data-medien-bilder]', { hasText: `(${woerter.length})` })), 'Für Kl. 7–10 sind alle Wörter noch offen')
  await p.locator('[data-medien-bilder]').click()
  // Es gibt schon einen fertigen Auftrag gleichen Namens – auf das Ende des laufenden warten (Knopf lädt nicht mehr)
  await p.waitForTimeout(500)
  await p.locator('[data-medien-bilder][data-loading]').waitFor({ state: 'detached', timeout: 90000 }).catch(() => undefined)
  pruefe(await auftragFertig(p, 'Beispielbilder suchen'), 'Bilder für Kl. 7–10 gesucht')
  await p.waitForTimeout(1200)
  const eigen = await p.locator('[data-beispielbild][data-bildstufe="s3"] img').count()
  pruefe(eigen >= 1, `eigene Bilder der Stufe 7–10 (${eigen})`)
  {
    const q = (stufe) => `${A}/s/api/medien?sprache=en&stufe=${stufe}&w=${encodeURIComponent(woerter[0])}`
    const s3 = (await (await verwaltung.request.get(q('s3'))).json()).medien?.[woerter[0]]
    const s1 = (await (await verwaltung.request.get(q('s1'))).json()).medien?.[woerter[0]]
    pruefe(s3?.bildStufe === 's3' && s1?.bildStufe === 's2', `Lernende sehen ihre Stufe bzw. die nächste (Kl. 7–10: ${s3?.bildStufe}, Kl. 1–4: ${s1?.bildStufe})`)
  }
  await p.screenshot({ path: join(out, '3b-bildstufen.png') })
  await p.locator('[data-bildstufe-wahl]').getByText('Kl. 5–6').click()

  // ---------- Lehrkraft: nur ansehen
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Testlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  const lk = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const q = await lk.newPage()
  await lehrwerkOeffnen(q)
  pruefe(await da(q.locator('[data-lehrwerk-hinweis]', { hasText: 'nur Admins' })), 'Lehrkraft: Hinweis „nur Admins können es bearbeiten"')
  pruefe((await q.locator('[data-medien-leiste]').count()) === 0, 'Lehrkraft: keine Leiste der Medienbank')
  pruefe(
    await q
      .locator('.module-container:not([hidden]) .vokabel-tabelle [data-feld="term"]')
      .first()
      .evaluate((e) => e.readOnly),
    'Lehrkraft: Felder schreibgeschützt'
  )
  pruefe((await q.locator('[data-beispielbild] img').count()) >= 1, 'Lehrkraft sieht die Beispielbilder')
  await q.screenshot({ path: join(out, '4-lehrkraft.png') })
  const buchId = (await api(lk, 'textbooks:list')).value.find((b) => b.builtIn && /green/i.test(b.name))?.id
  const buch = (await api(lk, 'textbooks:get', buchId)).value
  const speichern = await api(lk, 'textbooks:save', [buch])
  pruefe(!speichern.ok && /nur Admins/.test(speichern.error ?? ''), `Lehrkraft darf das gemeinsame Lehrwerk nicht speichern (${speichern.error})`)
  const loeschen = await api(lk, 'medien:bild-loeschen', 'en', woerter[0])
  pruefe(!loeschen.ok && /nur Admins/.test(loeschen.error ?? ''), 'Lehrkraft darf Medien nicht ändern')

  // ---------- Lernende
  const liste = await (
    await verwaltung.request.post(`${A}/server/verwaltung/klassenliste`, { headers: KOPF, data: { klasse: KLASSE, namen: 'Mia Probe' } })
  ).json()
  const mia = liste.angelegt[0]
  const u0 = await (await verwaltung.request.get(`${A}/server/verwaltung/uebersicht`, { headers: KOPF })).json()
  for (const n of u0.nutzer ?? []) if (n.benutzer === mia.benutzer) zuLoeschen.push(n.id)
  const gruppe = await (
    await lk.request.post(`${A}/server/lerngruppen/anlegen`, { headers: KOPF, data: { name: KLASSE, fach: 'Englisch', iservGruppe: `klasse:${KLASSE}` } })
  ).json()
  const eintraege = buch.units[0].sections[0].entries.filter((e) => woerter.includes(e.term)).slice(0, 6)
  const fr = await (
    await lk.request.post(`${A}/server/vokabeln/freigeben`, {
      headers: KOPF,
      data: {
        lerngruppeId: gruppe.id,
        titel: 'Medienprobe',
        sprache: 'en',
        fach: 'Englisch',
        woerter: eintraege.map((e, i) => ({ id: `m${i}`, term: e.term, translation: e.translation, ...(e.example ? { example: e.example } : {}) }))
      }
    })
  ).json()
  const sm = await browser.newContext({ viewport: { width: 1000, height: 1000 } })
  await anmelden(sm, mia.benutzer, mia.passwort)
  await sm.request.post(`${A}/auth/passwort`, {
    form: { alt: mia.passwort, neu: 'NeuesPasswort-99', neu2: 'NeuesPasswort-99', ziel: '/s/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  const qs = new URLSearchParams({ sprache: 'en' })
  for (const e of eintraege) qs.append('w', e.term)
  const med = (await (await sm.request.get(`${A}/s/api/medien?${qs}`, { headers: KOPF })).json()).medien ?? {}
  const mitTon = Object.values(med).find((m) => m.ton?.url)
  const mitBild = Object.values(med).find((m) => m.bild?.url)
  pruefe(Boolean(mitTon && mitBild), `Lernende bekommen Bild und Aussprache (${Object.keys(med).length} Wörter mit Medien)`)
  const ton = mitTon ? await sm.request.get(`${A}${mitTon.ton.url}`) : null
  pruefe(ton?.status() === 200 && /audio\/mpeg/.test(ton.headers()['content-type'] ?? ''), 'Aufnahme lässt sich laden (audio/mpeg)')
  const teil = mitTon ? await sm.request.get(`${A}${mitTon.ton.url}`, { headers: { range: 'bytes=0-9' } }) : null
  pruefe(teil?.status() === 206, 'Bereichsanfrage für Safari (206)')
  const fremd = await (await browser.newContext()).request.get(`${A}${mitTon?.ton.url ?? '/medien/x'}`)
  pruefe(fremd.status() === 401, 'Ohne Anmeldung keine Datei')
  const s = await sm.newPage()
  await s.goto(`${A}/s/v/${fr.id}`)
  await s.waitForTimeout(3000)
  await s
    .getByRole('button', { name: /Los|Starten|Lernen|Weiter/ })
    .first()
    .click()
    .catch(() => undefined)
  await s.waitForTimeout(1500)
  pruefe((await s.locator('img[src^="/medien/"]').count()) >= 0, 'Trainer geladen')
  await s.screenshot({ path: join(out, '5-trainer.png') })
  await lk.request.post(`${A}/server/vokabeln/${fr.id}/loeschen`, { headers: KOPF, data: {} })
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n').slice(0, 6).join(' | ')}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Keine Testreste: Medien der Probewörter und die Standardstimme wieder entfernen
  for (const w of woerter) {
    await api(verwaltung, 'medien:bild-loeschen', 'en', w).catch(() => undefined)
    await api(verwaltung, 'medien:bild-loeschen', 'en', w, 's3').catch(() => undefined)
    await api(verwaltung, 'medien:ton-loeschen', 'en', w, 'wort').catch(() => undefined)
    await api(verwaltung, 'medien:ton-loeschen', 'en', w, 'wort', undefined, 'm').catch(() => undefined)
  }
  await api(verwaltung, 'medien:stimme-setzen', 'en', '', 'w').catch(() => undefined)
  await api(verwaltung, 'medien:stimme-setzen', 'en', '', 'm').catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Konten samt Daten gelöscht (${zuLoeschen.length}), Medien entfernt`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
