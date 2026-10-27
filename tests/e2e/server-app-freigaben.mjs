// App-Freigaben (23.10.2026, abgestimmt; shared/appFreigaben.ts, server/appFreigaben.ts):
//  1. Nur Admins lesen und ändern die Gruppen (Lehrkraft: 403).
//  2. Ohne Freigabe: die App fehlt in /server/ich.js, Änderungen an ihrer Ablage sind gesperrt (403), Lesen bleibt.
//  3. Eine eigene Gruppe gibt die App einzelnen Lehrkräften wieder frei.
//  4. Oberfläche: kein „Tafelbild" für die gesperrte Lehrkraft, ein Link darauf zeigt den Hinweis; der Admin sieht den
//     Reiter „App-Freigaben" mit der Grundgruppe.
// Ohne KI. Aufruf: node tests/e2e/server-app-freigaben.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/server-app-freigaben')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const KOPF = { 'x-schulapps-token': 'server' }
// Jüngstes Arbeitsblatt des Profils als Vorlage (wie server-blatt.mjs)
const ordner = join(process.env.APPDATA ?? '', 'schul-apps', 'arbeitsblaetter')
const vorlage = (() => {
  try {
    return readdirSync(ordner)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => join(ordner, f))
      .sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)
      .map((f) => JSON.parse(readFileSync(f, 'utf8')))
      .find((w) => (w.payload?.sheets?.[0]?.blocks ?? []).some((b) => b.type === 'task'))
  } catch {
    return null
  }
})()

const browser = await chromium.launch({ channel: 'msedge' })
const zuLoeschen = []
const anmelden = (ctx, b, p) => ctx.request.post(`${A}/auth/lokal`, { form: { benutzer: b, passwort: p, ziel: '/' }, headers: { origin: A }, maxRedirects: 0 })
const verwaltung = await browser.newContext({ viewport: { width: 1400, height: 900 } })
let vorher = null
const seiteAuf = async (ctx, pfad = '/') => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  SEITENFEHLER', e.message.slice(0, 300)))
  await p.goto(`${A}${pfad}`)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  return p
}
try {
  await anmelden(verwaltung, admin.benutzer, admin.passwort)
  vorher = (await (await verwaltung.request.get(`${A}/server/app-freigaben`, { headers: KOPF })).json()).gruppen
  pruefe(Array.isArray(vorher) && vorher[0]?.id === 'alle', 'Admin liest die Gruppen, „Alle Lehrkräfte“ steht vorn')

  const konto = async (name) => {
    const k = await (await verwaltung.request.post(`${A}/server/verwaltung/testkonto`, { headers: KOPF, data: { rolle: 'lehrkraft', name } })).json()
    zuLoeschen.push(k.id)
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await anmelden(ctx, k.benutzer, k.passwort)
    const api = async (channel, ...args) => {
      const r = await ctx.request.post(`${A}/api`, { headers: KOPF, data: { channel, args } })
      const text = await r.text()
      return { status: r.status(), ...(text.trim() ? JSON.parse(text) : {}) }
    }
    const ich = async () => {
      const t = await (await ctx.request.get(`${A}/server/ich.js`)).text()
      return JSON.parse(t.slice(t.indexOf('=') + 1, t.indexOf(';(function')).replace(/;$/, ''))
    }
    return { ...k, ctx, api, ich, name }
  }
  const lea = await konto('Lea Gesperrt')
  const ben = await konto('Ben Erprobung')

  // ---------- 1. Rechte
  const versuch = await lea.ctx.request.post(`${A}/server/app-freigaben`, { headers: KOPF, data: { gruppen: [] } })
  pruefe(versuch.status() === 403, `Lehrkraft darf die Freigaben nicht ändern (${versuch.status()})`)
  pruefe((await lea.ich()).apps?.includes('tafelbild'), 'Vorher: Tafelbild für alle freigegeben')

  // ---------- 2. Tafelbild nur noch für die Gruppe „Erprobung“
  const alle = vorher[0].apps.filter((a) => a !== 'tafelbild')
  const r = await (
    await verwaltung.request.post(`${A}/server/app-freigaben`, {
      headers: KOPF,
      data: { gruppen: [{ ...vorher[0], apps: alle }, { id: 'erprobung', name: 'Erprobung', apps: ['tafelbild'], mitglieder: [ben.id] }] }
    })
  ).json()
  pruefe(r.gruppen?.length === 2 && r.gruppen[1].mitglieder[0] === ben.id, 'Admin speichert die Gruppe „Erprobung“ mit Ben')
  const ichLea = await lea.ich()
  pruefe(!ichLea.apps.includes('tafelbild') && ichLea.apps.includes('arbeitsblatt'), 'Lea: Tafelbild fehlt in ihren Apps, Arbeitsblatt bleibt')
  pruefe((await ben.ich()).apps.includes('tafelbild'), 'Ben (Erprobung): Tafelbild freigegeben')
  const speichern = await lea.api('tafelbilder:save', { id: 'tb-probe', name: 'Probe', stats: {}, payload: {} })
  pruefe(speichern.status === 403, `Lea: Speichern im Tafelbild gesperrt (${speichern.status})`)
  const lesen = await lea.api('tafelbilder:list')
  pruefe(lesen.status === 200 && lesen.ok === true, 'Lea: eigene Tafelbilder lesen bleibt')
  pruefe((await lea.api('sheets:list')).ok === true, 'Lea: andere Apps unberührt')
  const benSpeichern = await ben.api('tafelbilder:delete', 'gibt-es-nicht')
  pruefe(benSpeichern.status === 200, `Ben: Änderungen im Tafelbild erlaubt (${benSpeichern.status})`)

  // ---------- 3. Oberfläche der Lehrkraft
  // Die Leiste zeigt ihre Gruppen zugeklappt – alle aufklappen, sonst wäre „fehlt“ zu leicht bestanden
  const aufklappen = async (seite) => {
    for (let i = 0; i < 6; i++) {
      const zu = seite.locator('.app-leiste [aria-expanded="false"]')
      if (!(await zu.count())) break
      await zu.first().click()
      await seite.waitForTimeout(300)
    }
  }
  const tafel = (seite) => seite.locator('.app-leiste [aria-label^="Tafelbild"]').count()
  // Vokabellisten (23.10.2026): gemeinsames Lehrwerk öffnen und prüfen, dass es nach reinem Lesen aussieht
  const lehrwerkAnsehen = async (seite, wer) => {
    await seite.goto(`${A}/?einzeln=vokabelliste`)
    await seite.waitForTimeout(2500)
    // Alle Reihen aufklappen, dann einen Band MIT Vokabeln öffnen (Platzhalter-Bände sind leer)
    for (let i = 0; i < 12; i++) {
      const zu = seite.locator('[data-reihe] button[aria-expanded="false"]').first()
      if (!(await zu.count())) break
      await zu.click()
      await seite.waitForTimeout(150)
    }
    const ansehen = seite.locator('[data-band]').filter({ hasText: /[1-9]\d* Vokabeln/ }).locator('[data-band-ansehen]').first()
    const da = await ansehen.waitFor({ timeout: 10000 }).then(
      () => true,
      () => false
    )
    pruefe(da && (await seite.locator('[data-band] button', { hasText: 'Vokabeln bearbeiten' }).count()) === 0, `${wer}: Schulbücher mit „Vokabeln ansehen“ statt „bearbeiten“`)
    if (!da) return
    await ansehen.click()
    await seite.waitForTimeout(2500)
    const befund = {
      'Zeile hinzufügen': await seite.getByRole('button', { name: 'Zeile hinzufügen' }).count(),
      Speichern: await seite.getByRole('button', { name: /^(Speichern|Gesichert)$/ }).count(),
      'Änderungen verwerfen': await seite.getByRole('button', { name: 'Änderungen verwerfen' }).count(),
      'Admin-Medienbank': await seite.locator('[data-medien-leiste]').count(),
      'unsichere Aufnahmen hervorgehoben': await seite.locator('[data-aussprache-verdacht]').count()
    }
    pruefe(
      Object.values(befund).every((n) => n === 0) && (await seite.locator('[data-angaben-nur-lesen]').count()) === 1,
      `${wer}: gemeinsames Lehrwerk nur zum Lesen (${JSON.stringify(befund)})`
    )
    await seite.screenshot({ path: join(out, `lehrwerk-${wer}.png`) })
  }
  const p = await seiteAuf(lea.ctx)
  await aufklappen(p)
  pruefe((await tafel(p)) === 0 && (await p.locator('.app-leiste [aria-label^="Arbeitsbl"]').count()) > 0, 'Lea: Tafelbild fehlt in der Leiste, Arbeitsblatt steht da')
  await p.screenshot({ path: join(out, 'lea-start.png') })
  const pb = await seiteAuf(ben.ctx)
  await aufklappen(pb)
  pruefe((await tafel(pb)) > 0, 'Gegenprobe: Ben sieht Tafelbild in der Leiste')
  const link = await seiteAuf(lea.ctx, '/?einzeln=tafelbild')
  pruefe(
    await link
      .locator('[data-gesperrte-app="tafelbild"]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Lea: ein Link aufs Tafelbild zeigt „nicht freigegeben“'
  )
  await link.screenshot({ path: join(out, 'lea-link.png') })

  // ---------- 4. Oberfläche des Admins
  const v = await seiteAuf(verwaltung, '/?einzeln=verwaltung')
  await v.getByRole('tab', { name: 'App-Freigaben' }).click()
  const karte = v.locator('[data-app-gruppe="alle"]')
  pruefe(await karte.waitFor({ timeout: 10000 }).then(() => true, () => false), 'Admin: Reiter „App-Freigaben“ mit der Grundgruppe')
  const haken = (id) => karte.locator(`[data-app-freigabe="${id}"]`).first().evaluate((el) => (el.matches('input') ? el : el.querySelector('input')).checked)
  pruefe(!(await haken('tafelbild')) && (await haken('arbeitsblatt')), '… dort ist Tafelbild abgewählt, Arbeitsblatt angehakt')
  pruefe((await v.locator('[data-app-gruppe="erprobung"]').count()) === 1, '… und die Gruppe „Erprobung“ steht darunter')
  const reiter = await v.getByRole('tab').allTextContents()
  // Seit 27.10.2026 steht „Fächer" direkt neben „Nutzer", „App-Freigaben" danach
  pruefe(reiter.indexOf('App-Freigaben') === reiter.indexOf('Nutzer') + 2 && reiter.indexOf('Fächer') === reiter.indexOf('Nutzer') + 1, `… nach „Nutzer“ und „Fächer“ (${reiter.join(' | ')})`)
  await v.screenshot({ path: join(out, 'admin-freigaben.png'), fullPage: true })

  // ---------- 5. „Ansicht zeigen“: neues Fenster mit der Sicht der Gruppe (Grundgruppe + Gruppe)
  const [fenster] = await Promise.all([verwaltung.waitForEvent('page'), v.locator('[data-app-ansicht="alle"]').click()])
  await fenster.waitForLoadState()
  await fenster.waitForTimeout(2500)
  const sp = fenster.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  pruefe(await fenster.locator('[data-ansicht-band]').isVisible(), 'Ansicht: Band „Ansicht als Lehrkraft der Gruppe …“ erscheint')
  pruefe(!/ansicht=|apps=/.test(fenster.url()), `… die Angaben stehen nicht mehr in der Adresse (${fenster.url()})`)
  await aufklappen(fenster)
  pruefe(
    (await fenster.locator('.app-leiste [aria-label^="Schule & Daten"]').count()) === 0 && (await tafel(fenster)) === 0,
    '… ohne „Schule & Daten“ und ohne das gesperrte Tafelbild'
  )
  pruefe((await fenster.locator('.app-leiste [aria-label^="Arbeitsbl"]').count()) > 0, '… mit den freigegebenen Apps')
  await fenster.screenshot({ path: join(out, 'ansicht-alle.png') })
  await fenster.reload()
  await fenster.waitForTimeout(2500)
  pruefe(await fenster.locator('[data-ansicht-band]').isVisible(), '… bleibt nach dem Neuladen in diesem Fenster erhalten')
  // Der Server kennt das Fenster weiter als Admin – die Ansicht zeigt trotzdem nur, was eine Lehrkraft sieht
  await lehrwerkAnsehen(fenster, 'Ansicht')
  // ---------- 6. Freigaben wie am Schulserver (23.10.2026): nur 8 Apps – keine Wege in gesperrte Apps
  const VPS = ['vokabeltest', 'grammatiktest', 'grammatikformen', 'elternbrief', 'vokabelliste', 'tafelbild', 'lernzielkontrolle', 'arbeitsblatt']
  await verwaltung.request.post(`${A}/server/app-freigaben`, { headers: KOPF, data: { gruppen: [{ ...vorher[0], apps: VPS }] } })
  if (vorlage) {
    const ab = await lea.api('sheets:save', { id: 'freigaben-probe', name: 'Freigaben-Probe', stats: { sheetCount: 1 }, payload: vorlage.payload })
    pruefe(ab.ok === true, 'Lea legt ein Arbeitsblatt an (erlaubt)')
    const ed = await seiteAuf(lea.ctx, '/?einzeln=arbeitsblatt&dok=freigaben-probe')
    await ed.waitForTimeout(3000)
    await ed.screenshot({ path: join(out, 'vps-editor.png') })
    const knoepfe = {
      'Rückmeldung …': await ed.locator('[data-rueckmeldung-zu]').count(),
      Onlinetest: await ed.locator('[data-onlinetest-knopf]').count(),
      'Für Lernende': await ed.locator('[data-blatt-freigeben-knopf]').count()
    }
    pruefe(
      Object.values(knoepfe).every((n) => n === 0) && (await ed.locator('.ws-page').count()) > 0,
      `Arbeitsblatt-Editor ohne Wege in gesperrte Apps (${JSON.stringify(knoepfe)})`
    )
  } else pruefe(false, 'Keine Arbeitsblatt-Vorlage im Profil gefunden – Editor nicht prüfbar')
  const start = await seiteAuf(lea.ctx)
  await start.waitForTimeout(1500)
  pruefe((await start.getByText('Auf einen Blick', { exact: true }).count()) === 0, 'Startseite: ohne leere „Auf einen Blick“-Kästen')
  await start.screenshot({ path: join(out, 'vps-start.png') })
  const blatt = await lea.ctx.request.post(`${A}/server/blaetter/freigeben`, { headers: KOPF, data: {} })
  pruefe(blatt.status() === 403, `Server: Blätter für Lernende freigeben gesperrt (${blatt.status()})`)
  await lea.api('sheets:delete', 'freigaben-probe')

  // ---------- 7. Vokabellisten (23.10.2026): gemeinsame Lehrwerke sehen für Lehrkräfte nach reinem Lesen aus
  await lehrwerkAnsehen(await seiteAuf(lea.ctx), 'Lehrkraft')

  // ---------- 8. Einstellungen: „Einrichtung neu starten“ (23.10.2026) – Assistent mit den vorhandenen Angaben
  await lea.api('settings:set', { schoolName: 'Probeschule am See' })
  const einst = await seiteAuf(lea.ctx)
  await einst.locator('.app-leiste [aria-label^="Einstellungen"], [aria-label="Einstellungen"]').first().click()
  await einst.waitForTimeout(1200)
  const neuKnopf = einst.locator('[data-einrichtung-neu]')
  pruefe(await neuKnopf.isVisible().catch(() => false), 'Einstellungen: „Einrichtung neu starten“ neben „Angemeldet als …“')
  if (await neuKnopf.isVisible().catch(() => false)) {
    await neuKnopf.click()
    const titel = einst.getByText('Willkommen bei Schul-Apps', { exact: true })
    const auf = await titel.waitFor({ timeout: 8000 }).then(
      () => true,
      () => false
    )
    pruefe(auf, '… der Einrichtungsassistent öffnet sich')
    // Bis zum Schritt „Schule“ blättern und dort den eingetragenen Schulnamen finden
    let gefunden = false
    for (let i = 0; i < 4 && auf && !gefunden; i++) {
      // Im Feld – oder als Text, wenn die Schulverwaltung die Schule festlegt
      gefunden = await einst.evaluate(() => {
        const box = [...document.querySelectorAll('.mantine-Modal-content')].pop()
        if (!box) return false
        return [...box.querySelectorAll('input')].some((e) => e.value === 'Probeschule am See') || /Probeschule am See|von der Schulverwaltung festgelegt/.test(box.textContent ?? '')
      })
      if (!gefunden) {
        const weiter = einst.locator('.mantine-Modal-content').last().getByRole('button', { name: /^(Weiter|Überspringen)/ }).first()
        if (!(await weiter.count())) break
        await weiter.click()
        await einst.waitForTimeout(500)
      }
    }
    pruefe(gefunden, '… mit den vorhandenen Angaben (Schulname steht im Feld)')
    await einst.screenshot({ path: join(out, 'einrichtung-neu.png') })
  }

  // Das eigene Fenster des Admins bleibt die Admin-Sicht
  const admin2 = await seiteAuf(verwaltung)
  pruefe((await admin2.locator('[data-ansicht-band]').count()) === 0, '… andere Fenster des Admins bleiben unverändert')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  for (const [i, seite] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await seite.screenshot({ path: join(out, `fehler-${i}.png`) }).catch(() => undefined)
} finally {
  // Freigaben gelten schulweit – zurück auf den Stand davor
  if (vorher) await verwaltung.request.post(`${A}/server/app-freigaben`, { headers: KOPF, data: { gruppen: vorher } }).catch(() => undefined)
  for (const id of zuLoeschen) await verwaltung.request.post(`${A}/server/verwaltung/nutzer-loeschen`, { headers: KOPF, data: { id } }).catch(() => undefined)
  pruefe(true, `Freigaben zurückgesetzt, Konten gelöscht (${zuLoeschen.length})`)
  await browser.close()
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const x of problems) console.log(` - ${x}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
