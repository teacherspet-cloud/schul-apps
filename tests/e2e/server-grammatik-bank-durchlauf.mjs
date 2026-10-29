// Durchlauf der echten Bank-Aufgaben in der Oberfläche (28.10.2026, Wunsch der Lehrkraft: „Tests, die sicherstellen, dass
// die Aufgaben lösbar und sinnvoll sind"): Die 141 Aufgaben des Probelaufs mit echter KI (tests/daten/grammatik-bank-
// englisch-2026-10-28.json, vier englische Teilformen) kommen in die Bank eines Testservers; die Bank stellt die vier mit
// verräterischem Satzanfang zurück. Eine Lehrkraft weist die Formen einem Kurs zu (alle Stufen) und löst in „Aufgaben
// ansehen" › „Selbst ausprobieren" JEDE Aufgabe über die Bedienelemente der Schüler-App mit der hinterlegten Lösung –
// jede muss „Richtig" ergeben.
// Vorher: Server lokal. Aufruf: node tests/e2e/server-grammatik-bank-durchlauf.mjs <Ausgabe> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-grammatik-bank-durchlauf')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  console.log(`${ok ? 'ok' : '!!'} ${text}`)
  if (!ok) problems.push(text)
}
const KOPF = { 'x-schulapps-token': 'server' }
const daten = JSON.parse(readFileSync(resolve('tests/daten/grammatik-bank-englisch-2026-10-28.json'), 'utf8'))
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const anfangOhne = (s) => String(s ?? '').replace(/\s*(?:\.{2,}|…)\s*$/, '').trim()
const woerter = (satz) => (String(satz).match(/[\p{L}\p{N}'’-]+/gu) ?? [])

let abgeschnittenZahl = 0
/** Die Aufgabe in ihrer Karte über die Bedienelemente lösen */
async function loesen(karte, a) {
  const l0 = a.loesungen?.[0] ?? ''
  const pruefen = async () => {
    const k = karte.locator('[data-pruefen]').filter({ visible: true }).first()
    if (await k.count()) await k.click()
  }
  switch (a.art) {
    case 'luecke':
      await karte.locator('[data-luecke-eingabe]').fill(l0)
      return pruefen()
    case 'auswahl': {
      // Lange Sätze (Befund der Lehrkraft 29.10.2026: „Jack, who is our class captain will speak firs"): nichts abgeschnitten
      const abgeschnitten = await karte
        .locator('[data-option]')
        .evaluateAll((l) => l.filter((e) => e.scrollWidth > e.clientWidth + 1 || [...e.querySelectorAll('*')].some((k) => k.scrollWidth > k.clientWidth + 1)).length)
      if (abgeschnitten) abgeschnittenZahl += abgeschnitten
      return karte.locator(`[data-option="${l0.replace(/"/g, '\\"')}"]`).first().click()
    }
    case 'mehrfach':
      for (const x of a.loesungen) await karte.locator(`[data-option="${x.replace(/"/g, '\\"')}"]`).first().click()
      return pruefen()
    case 'umformen':
      await karte.locator('[data-umformen-eingabe]').fill(l0)
      return pruefen()
    case 'verbinden':
    case 'frage': {
      const anf = anfangOhne(a.anfang)
      const rest = anf && norm(l0).startsWith(norm(anf)) ? l0.slice(anf.length).trim() : l0
      await karte.locator('[data-satz-eingabe]').fill(rest)
      return pruefen()
    }
    case 'satzbau':
      for (const t of a.teile) await karte.locator(`[data-satzteil="${t.replace(/"/g, '\\"')}"]`).first().click()
      return pruefen()
    case 'fehler':
      await karte.locator(`[data-fehlerwort="${a.fehlerWort}"]`).first().click()
      await karte.locator('[data-korrektur-eingabe]').fill(l0)
      return pruefen()
    case 'richtigfalsch':
      if (a.korrekt) return karte.locator('[data-rf="richtig"]').click()
      await karte.locator('[data-rf="falsch"]').click()
      await karte.locator(`[data-fehlerwort="${a.fehlerWort}"]`).first().click()
      await karte.locator('[data-korrektur-eingabe]').fill(l0)
      return pruefen()
    case 'zuordnen':
      for (const [k, p] of a.paare.entries()) {
        await karte.locator(`[data-zuordnen-links="${k}"]`).click()
        await karte.locator(`[data-zuordnen-rechts="${p.rechts.replace(/"/g, '\\"')}"]`).click()
      }
      return pruefen()
    case 'lueckentext':
      for (const [i, lk] of a.luecken.entries()) {
        const feld = karte.locator(`[data-luecke-nr="${i}"]`).first()
        if ((await feld.evaluate((e) => e.tagName)) === 'SELECT') await feld.selectOption(lk.loesungen[0])
        else await feld.fill(lk.loesungen[0])
      }
      return pruefen()
    case 'markieren': {
      const w = woerter(a.satz)
      const alle = karte.locator('[data-markier-wort]')
      for (const i of a.ziele) {
        // Das i-te Wort des Satzes – unter den gleichlautenden das wievielte?
        const n = w.slice(0, i).filter((x) => norm(x) === norm(w[i])).length
        await karte.locator(`[data-markier-wort="${w[i]}"]`).nth(n).click()
      }
      void alle
      return pruefen()
    }
    case 'sortieren':
      for (const e of a.elemente) {
        await karte.locator(`[data-sortier-element="${e.text.replace(/"/g, '\\"')}"]`).click()
        // Auf die Überschrift der Gruppe tippen – in der Mitte läge evtl. ein schon einsortiertes Element (das nähme es heraus)
        await karte.locator(`[data-sortier-gruppe="${a.gruppen[e.gruppe].replace(/"/g, '\\"')}"]`).click({ position: { x: 8, y: 8 } })
      }
      return pruefen()
    default:
      throw new Error(`unbekannte Art ${a.art}`)
  }
}

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const verwaltung = await browser.newContext()
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
let kurs = ''
let lk
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  let gespeichert = 0
  for (const e of daten.eintraege) {
    const r = await (
      await verwaltung.request.post(`${A}/server/grammatik-bank/speichern`, {
        headers: KOPF,
        data: { sprache: 'en', schluessel: e.schluessel, regel: e.regel, aufgaben: e.aufgaben.map(({ id: _i, ...x }) => x) }
      })
    ).json()
    gespeichert += r.aufgaben ?? 0
  }
  pruefe(gespeichert === 141, `Bank: 141 Aufgaben gespeichert (${gespeichert})`)
  const lehrer = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name: 'Dora Durchlauf' } })).json()
  zuLoeschen.push(lehrer.id)
  lk = await browser.newContext({ viewport: { width: 1300, height: 950 } })
  await anmelden(lk, lehrer.benutzer, lehrer.passwort)
  const post = async (p, d) => (await lk.request.post(`${A}${p}`, { headers: KOPF, data: d })).json()
  kurs = (await post('/server/vokabeln/freigeben', { titel: 'Durchlauf-Kurs', sprache: 'en', fach: 'Englisch', woerter: [], nurGrammatik: true, gaeste: true })).id
  const ids = []
  for (const e of daten.eintraege) {
    const thema = e.schluessel.split('/')[0]
    const r = await post('/server/grammatik/aus-bank', { vokId: kurs, formen: [{ thema, titel: thema, teile: [e.schluessel] }], info: { stufen: ['g', 'm', 'a'] } })
    if (r.ids?.[0]) ids.push(r.ids[0])
  }
  pruefe(ids.length === 4, `Vier Formen dem Kurs zugewiesen (${ids.length})`)
  const pakete = {}
  let imKurs = 0
  for (const id of ids) {
    pakete[id] = (await (await lk.request.get(`${A}/server/grammatik/${id}`, { headers: KOPF })).json()).paket
    imKurs += pakete[id]?.aufgaben?.length ?? 0
  }
  pruefe(imKurs === 132, `Im Kurs 132 Aufgaben – zurückgestellt: 4 mit verräterischem Satzanfang, 5 mit Platzhalter statt Name (${imKurs})`)

  // ---------- Lehrkraft: Aufgaben ansehen › Selbst ausprobieren
  const p = await lk.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const spat = p.getByRole('button', { name: 'Später einrichten' })
  if (await spat.isVisible().catch(() => false)) await spat.click()
  const zu = p.locator('.app-leiste [data-leiste-gruppe-kopf][data-offen="false"]').filter({ visible: true })
  for (let i = 0; i < 10 && (await zu.count()); i++) await zu.first().click()
  await p.locator('.app-leiste [aria-label="Sprachenlernen"]').click()
  await p.locator(`[data-vokabel-zuweisung="${kurs}"]`).click()
  await p.locator('[data-kurs-reiter="grammatik"]').click({ timeout: 15000 })
  const jeArt = {}
  let geloest = 0
  for (const zid of ids) {
    await p.locator('[data-grammatik-band]').first().waitFor({ timeout: 15000 })
    await p.waitForTimeout(500)
    // Alle Bände, Units und Stationen aufklappen (mehrere Durchgänge – Inneres erscheint erst nach dem Äußeren)
    for (let n = 0; n < 20; n++) {
      const zu = p.locator('[data-band-kopf][aria-expanded="false"], [data-grammatik-unit][aria-expanded="false"], [data-grammatik-station][aria-expanded="false"]').filter({ visible: true })
      if (!(await zu.count())) break
      await zu.first().click().catch(() => undefined)
      await p.waitForTimeout(150)
    }
    await p.locator(`[data-grammatik-aktionen="${zid}"]`).click()
    await p.locator(`[data-grammatik-ansehen="${zid}"]`).click()
    await p.locator('[data-aufgaben-ansicht]').waitFor()
    await p.locator('[data-ansicht-probieren]').check()
    const aufgaben = pakete[zid].aufgaben
    for (const a of aufgaben) {
      const karte = p.locator(`[data-ansicht-aufgabe="${a.id}"]`)
      let urteil = 'nicht erschienen'
      try {
        await karte.scrollIntoViewIfNeeded()
        await loesen(karte, a)
        urteil = (await karte.locator('[data-ansicht-urteil]').getAttribute('data-ansicht-urteil', { timeout: 4000 })) ?? 'kein Urteil'
      } catch (e) {
        urteil = `Fehler: ${String(e?.message ?? e).split('\n')[0].slice(0, 120)} | ${String(e?.message ?? e).match(/waiting for (locator\([^\n]*)/)?.[1]?.slice(0, 160) ?? ''}`
        await karte.screenshot({ path: join(out, `fehler-${a.id}.png`) }).catch(() => undefined)
      }
      jeArt[a.art] = jeArt[a.art] ?? { richtig: 0, gesamt: 0 }
      jeArt[a.art].gesamt++
      if (urteil === 'richtig') {
        jeArt[a.art].richtig++
        geloest++
      } else problems.push(`${a.art} „${(a.satz || a.anweisung).slice(0, 60)}“: ${urteil}`)
    }
    await p.screenshot({ path: join(out, `ansicht-${zid}.png`), fullPage: false })
    await p.keyboard.press('Escape')
    await p.waitForTimeout(400)
  }
  for (const [art, z] of Object.entries(jeArt)) console.log(`   ${art}: ${z.richtig} von ${z.gesamt} richtig`)
  pruefe(abgeschnittenZahl === 0, `Auswahl: kein Satz abgeschnitten (${abgeschnittenZahl} abgeschnitten)`)
  pruefe(geloest === imKurs, `Alle Aufgaben über die Oberfläche gelöst (${geloest} von ${imKurs})`)
} catch (e) {
  for (const pg of lk?.pages() ?? []) await pg.screenshot({ path: join(out, 'fehler.png'), fullPage: true }).catch(() => undefined)
  problems.push(String(e?.stack ?? e))
  console.log(e)
} finally {
  if (kurs && lk) await lk.request.post(`${A}/server/vokabeln/${kurs}/loeschen`, { headers: KOPF, data: { klassenkurs: true } }).catch(() => null)
  for (const e of daten.eintraege)
    await verwaltung.request
      .post(`${A}/server/grammatik-bank/speichern`, { headers: KOPF, data: { sprache: 'en', schluessel: e.schluessel, regel: e.regel, aufgaben: [] } })
      .catch(() => null)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => null)
  await browser.close()
}
writeFileSync(join(out, 'probleme.txt'), problems.join('\n'))
console.log(problems.length ? `\n${problems.length} Problem(e):\n${problems.slice(0, 40).join('\n')}` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
