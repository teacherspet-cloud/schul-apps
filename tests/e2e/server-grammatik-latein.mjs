// Latein im Grammatiktraining (07.10.2026): Bestimmen mit allen Lesarten, Mehrfachauswahl, Paradigma-Tabelle,
// Übersetzen mit Selbstvergleich, Umformen (Kongruenz) – Längenzeichen werden bei Eingaben nicht verlangt.
// Die Lehrkraft gibt einen festen Pool frei (ohne KI), ein Gast am Handy löst alles einmal richtig und einmal teilweise.
// Aufruf: node tests/e2e/server-grammatik-latein.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-grammatik-latein')
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

const KASUS = ['Nom.', 'Gen.', 'Dat.', 'Akk.', 'Abl.']
const B = (form, lesarten, satz = '') => ({
  art: 'bestimmen',
  regelId: 'r1',
  anweisung: 'Bestimme die Form.',
  satz,
  form,
  merkmale: ['Kasus', 'Numerus', 'Genus'],
  werte: [KASUS, ['Sg.', 'Pl.'], ['m.', 'f.', 'n.']],
  lesarten,
  loesungen: []
})
const PAKET = {
  regeln: [{ id: 'r1', titel: 'a- und o-Deklination', erklaerung: 'Endungen der a- und o-Deklination.', beispiele: ['rosa pulchra', 'templum magnum'] }],
  aufgaben: [
    B('rosae', [
      ['Gen.', 'Sg.', 'f.'],
      ['Dat.', 'Sg.', 'f.'],
      ['Nom.', 'Pl.', 'f.']
    ]),
    B('templa', [
      ['Nom.', 'Pl.', 'n.'],
      ['Akk.', 'Pl.', 'n.']
    ]),
    B('puellam', [['Akk.', 'Sg.', 'f.']], 'Mārcus puellam videt.'),
    B('servō', [
      ['Dat.', 'Sg.', 'm.'],
      ['Abl.', 'Sg.', 'm.']
    ]),
    {
      art: 'tabelle',
      regelId: 'r1',
      anweisung: 'Ergänze die Formen.',
      satz: 'amīca, -ae f.',
      spalten: ['Sg.', 'Pl.'],
      zeilen: [
        { name: 'Nom.', loesungen: ['amīca', 'amīcae'], vorgabe: [true, false] },
        { name: 'Akk.', loesungen: ['amīcam', 'amīcās'], vorgabe: [false, false] },
        { name: 'Abl.', loesungen: ['amīcā', 'amīcīs'], vorgabe: [false, true] }
      ],
      loesungen: []
    },
    { art: 'mehrfach', regelId: 'r1', anweisung: 'Welche Formen sind Ablativ?', satz: '', optionen: ['rosā', 'rosam', 'rosīs', 'rosae'], loesungen: ['rosā', 'rosīs'] },
    { art: 'umformen', regelId: 'r1', anweisung: 'Bilde die passende Form (KNG-Kongruenz).', satz: 'magnus + templum', vorgabe: 'Gen. Pl.', loesungen: ['magnōrum templōrum'] },
    { art: 'uebersetzen', regelId: 'r1', anweisung: 'Übersetze.', satz: 'gladiō pugnat', loesungen: ['er kämpft mit dem Schwert'] },
    { art: 'auswahl', regelId: 'r1', anweisung: 'Wähle die Präposition.', satz: 'Puer ___ vīllā est.', optionen: ['in', 'ad', 'per'], loesungen: ['in'] }
  ]
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let zid = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  const lehrer = await (
    await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Lea Lateinlehrerin' } })
  ).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext()
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const f = await (
    await lk.request.post(`${A}/server/grammatik/freigeben`, {
      headers: KOPF,
      data: { titel: 'a- und o-Deklination', fach: 'Latein', sprache: 'la', thema: 'a- und o-Deklination', paket: PAKET, gaeste: true }
    })
  ).json()
  zid = f.id ?? ''
  pruefe(f.aufgaben === 9, `Pool freigegeben, alle 9 Latein-Aufgaben gültig (${f.aufgaben ?? f.fehler})`)
  const z = (await (await lk.request.get(`${A}/server/grammatik`, { headers: KOPF })).json()).zuweisungen.find((x) => x.id === zid)

  // ---------- Gast am Handy
  const g = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const h = await g.newPage()
  await h.goto(`${A}/s/gt/${z.code}`)
  await h.locator('[data-gastname]').fill('Lia L.')
  await h.getByRole('button', { name: 'Mitlernen' }).click()
  await h.locator('[data-vokabeln-los]').click()
  await h.locator('[data-grammatik-start]').click()
  await h.locator('[data-sitzung]').waitFor()
  const paket = (await (await g.request.get(`${A}/s/api/grammatik/liste?id=${zid}`)).json()).paket
  const urteile = {}
  const gesehen = new Set()
  for (let i = 0; i < 30; i++) {
    if (await h.locator('[data-sitzung-fertig]').isVisible()) break
    const art = await h.locator('[data-aufgabe]').getAttribute('data-aufgabe')
    const text = await h.locator('[data-aufgabe]').innerText()
    const erstes = !gesehen.has(art)
    gesehen.add(art)
    if (art === 'bestimmen') {
      const a = paket.aufgaben.find((x) => x.art === 'bestimmen' && text.includes(x.form))
      // Beim ersten Mal (rosae o. ä.) nur EINE Lesart: teilweise richtig
      const lesarten = erstes && a.lesarten.length > 1 ? a.lesarten.slice(0, 1) : a.lesarten
      for (const [k, l] of lesarten.entries()) {
        if (k > 0) await h.locator('[data-weitere-lesart]').click()
        const zeile = h.locator(`[data-lesart="${k}"]`)
        for (const w of l) await zeile.getByText(w, { exact: true }).click()
      }
      if (erstes && a.lesarten.length > 1)
        pruefe(await h.getByText('Gib alle Möglichkeiten an').isVisible(), 'Einzelform: Hinweis „alle Möglichkeiten angeben"')
      await h.locator('[data-pruefen]').click()
    } else if (art === 'tabelle') {
      const a = paket.aufgaben.find((x) => x.art === 'tabelle')
      for (const [zi, zz] of a.zeilen.entries())
        for (const [j, l] of zz.loesungen.entries()) {
          if (zz.vorgabe?.[j]) continue
          // Ohne Längenzeichen eingeben
          await h.locator(`[data-zelle="${zi}-${j}"]`).fill(l.normalize('NFD').replace(/̄/g, ''))
        }
      await h.locator('[data-pruefen]').click()
    } else if (art === 'mehrfach') {
      await h.locator('[data-option="rosā"]').click()
      await h.locator('[data-option="rosīs"]').click()
      await h.locator('[data-pruefen]').click()
    } else if (art === 'umformen') {
      await h.locator('[data-umformen-eingabe]').fill('magnorum templorum')
      await h.locator('[data-pruefen]').click()
    } else if (art === 'uebersetzen') {
      await h.locator('[data-uebersetzen-eingabe]').fill('er kämpft durch das Schwert')
      await h.locator('[data-pruefen]').click()
      pruefe(await da(h.locator('[data-selbstvergleich]')), 'Übersetzen: Musterlösung zum Selbstvergleich')
      await h.screenshot({ path: join(out, '2-uebersetzen.png'), fullPage: true })
      await h.locator('[data-selbst="richtig"]').click()
    } else if (art === 'auswahl') {
      await h.locator('[data-option="in"]').click()
    }
    await h.locator('[data-urteil]').waitFor()
    const u = await h.locator('[data-urteil]').getAttribute('data-urteil')
    if (!urteile[art]) {
      urteile[art] = u
      await h.screenshot({ path: join(out, `1-${art}.png`), fullPage: true })
    }
    await h.locator('[data-weiter]').click()
  }
  pruefe(urteile.bestimmen === 'fast' || urteile.bestimmen === 'richtig', `Bestimmen bewertet (erste: ${urteile.bestimmen})`)
  pruefe(urteile.tabelle === 'richtig', `Tabelle ohne Längenzeichen richtig (${urteile.tabelle})`)
  pruefe(urteile.mehrfach === 'richtig', `Mehrfachauswahl richtig (${urteile.mehrfach})`)
  pruefe(urteile.umformen === 'richtig', `Kongruenz ohne Längenzeichen richtig (${urteile.umformen})`)
  pruefe(urteile.uebersetzen === 'richtig', `Übersetzen nach Selbstvergleich (${urteile.uebersetzen})`)
  pruefe(urteile.auswahl === 'richtig', `Präposition gewählt (${urteile.auswahl})`)
  pruefe(await da(h.locator('[data-sitzung-fertig]'), 5000), 'Sitzung abgeschlossen')
  // Teilweise richtige Bestimmung kam wieder und wurde vollständig gelöst
  const stand = (await (await g.request.get(`${A}/s/api/grammatik/liste?id=${zid}`)).json()).staende
  const rosae = paket.aufgaben.find((x) => x.form === 'rosae')
  pruefe((stand[rosae.id]?.versuche ?? 0) >= 1, `Bestimmung „rosae" gespeichert (${stand[rosae.id]?.versuche} Versuche)`)
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${String(e?.message ?? e).split('\n').slice(0, 3).join(' | ')}`)
} finally {
  if (zid && lk) await lk.request.delete(`${A}/server/grammatik/${zid}`, { headers: KOPF }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung')
