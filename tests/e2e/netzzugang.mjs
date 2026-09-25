// Wache für den ZUGRIFF AUS DEM NETZ – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/netzzugang.mjs
//
// Der Server macht die Programmschnittstelle über das Netz erreichbar. Darin liegen Aufrufe,
// die dort nichts zu suchen haben: API-Schlüssel schreiben, Dateien dieses Rechners öffnen,
// Material löschen. Diese Wache prüft deshalb vor allem, was NICHT geht:
//
//   – ohne Anmeldung kein einziger Aufruf
//   – mit falscher PIN keine Anmeldung, und nach zehn Versuchen Schluss
//   – ein gesperrter Aufruf wird abgelehnt, auch angemeldet
//   – ein freigegebener Aufruf funktioniert
//   – die Oberfläche wird ausgeliefert
//   – nach dem Ausschalten ist nichts mehr erreichbar
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const userData = mkdtempSync(join(tmpdir(), 'schulapps-netz-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/*
 * ZUERST: Die PIN muss in den Einstellungen stehen, OHNE dass der Zugang läuft.
 *
 * Gemeldet von der Lehrkraft (23.09.2026): „in den einstellungen ist keine pin sichtbar,
 * einstellbar oder änderbar". Ursache war, dass die PIN erst beim Einschalten entstand –
 * und dann im Hauptprozess, ohne dass die Oberfläche ihre Einstellungen neu las.
 */
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(800)
await page.getByRole('tab', { name: 'Netzwerk' }).click()
await page.waitForTimeout(1200)
const pinFeld = await page.evaluate(() => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('PIN für die Anmeldung'))
  const feld = label?.parentElement?.querySelector('input')
  return { da: Boolean(label), wert: feld?.value ?? '', aenderbar: feld ? !feld.disabled && !feld.readOnly : false }
})
console.log(`PIN in den Einstellungen (Zugang aus): „${pinFeld.wert}" · änderbar: ${pinFeld.aenderbar}`)
pruefe(pinFeld.da, 'Das PIN-Feld steht in den Einstellungen, auch wenn der Zugang aus ist')
pruefe(/^\d{6}$/.test(pinFeld.wert), `Es steht eine sechsstellige PIN darin (war: „${pinFeld.wert}")`)
pruefe(pinFeld.aenderbar, 'Die PIN lässt sich ändern')

// Eine eigene PIN eintragen und nachsehen, ob sie ankommt
await page.evaluate(() => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('PIN für die Anmeldung'))
  const feld = label?.parentElement?.querySelector('input')
  if (!feld) return
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(feld, '246813')
  feld.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(900)
const eigene = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
pruefe(eigene === '246813', `Eine selbst gesetzte PIN wird übernommen (gespeichert: „${eigene}")`)

// Zugang einschalten und PIN auslesen – beides über die Programmschnittstelle
const status = await page.evaluate(() => window.api.lan.start())
const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
console.log(`Zugang: ${status.adresse} · PIN ${pin}\n`)
const basis = `http://127.0.0.1:${status.port}`

const hole = async (pfad, opts = {}) => {
  const res = await fetch(basis + pfad, opts)
  const text = await res.text()
  let daten = {}
  try {
    daten = JSON.parse(text)
  } catch {
    daten = { text }
  }
  return { code: res.status, daten, text, kopf: res.headers }
}
const api = (channel, token, args = []) =>
  hole('/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-schulapps-token': token } : {}) },
    body: JSON.stringify({ channel, args })
  })

// ---------------------------------------------------------------- ohne Anmeldung
pruefe((await api('settings:get', '')).code === 401, 'Ohne Anmeldung wird ein Aufruf abgewiesen')
pruefe((await api('secrets:set', '', ['openai', 'geheim'])).code === 401, 'Ohne Anmeldung wird auch ein gesperrter Aufruf abgewiesen')

// ---------------------------------------------------------------- falsche PIN
const falsch = await hole('/anmelden', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '000000' }) })
pruefe(falsch.code === 401 && !falsch.daten.token, 'Mit falscher PIN gibt es keine Anmeldung')
pruefe(typeof falsch.daten.verbleibend === 'number', `Die Zahl der verbleibenden Versuche wird genannt (${falsch.daten.verbleibend})`)

// ---------------------------------------------------------------- richtige PIN
const gut = await hole('/anmelden', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })
const token = gut.daten.token ?? ''
pruefe(Boolean(token), 'Mit der richtigen PIN gibt es eine Anmeldung')

// ---------------------------------------------------------------- Sperren greifen auch angemeldet
for (const [kanal, was] of [
  ['secrets:set', 'API-Schlüssel schreiben'],
  ['files:save', 'Dateien auf diesem Rechner speichern'],
  ['files:open', 'Dateien dieses Rechners öffnen'],
  ['sheets:delete', 'Arbeitsblätter löschen'],
  ['kurztests:delete', 'Lernzielkontrollen löschen'],
  ['export:print', 'den Druckdialog dieses Rechners öffnen'],
  ['ai:login-start', 'einen KI-Zugang einrichten'],
  ['audio:show', 'den Explorer dieses Rechners öffnen'],
  ['lan:stop', 'den Zugang für andere abschalten']
]) {
  const res = await api(kanal, token)
  pruefe(res.code === 403, `Angemeldet bleibt gesperrt: ${was} (${kanal})`)
}

// ---------------------------------------------------------------- Freigegebenes geht
const einstellungen = await api('settings:get', token)
pruefe(einstellungen.code === 200 && einstellungen.daten.ok === true, 'Ein freigegebener Aufruf funktioniert (settings:get)')
pruefe(typeof einstellungen.daten.value?.defaults?.stateId === 'string', 'Die Antwort trägt echte Daten')
const blaetter = await api('sheets:list', token)
pruefe(blaetter.code === 200 && Array.isArray(blaetter.daten.value), 'Die Bibliothek lässt sich lesen (sheets:list)')

/*
 * Der Schlüssel darf auch nicht auf Umwegen herauskommen: `secrets:has` ist freigegeben,
 * liefert aber nur ja/nein – nie den Schlüssel selbst.
 */
/*
 * Einstellungen ÄNDERN ist erlaubt – aber der Netzzugang selbst darf dabei nicht verstellt
 * werden. Sonst könnte ein angemeldetes Gerät PIN und Port ändern.
 */
const vorher = (await api('settings:get', token)).daten.value?.lan ?? {}
await api('settings:set', token, [{ schoolName: 'Probeschule', lan: { port: 9999, pin: '111111' } }])
const nachher = (await api('settings:get', token)).daten.value ?? {}
pruefe(nachher.schoolName === 'Probeschule', 'Der Schulname lässt sich über das Netz ändern')
pruefe(nachher.lan?.pin === vorher.pin && nachher.lan?.port === vorher.port, 'Der Netzzugang selbst bleibt unverändert (PIN und Port)')

const hat = await api('secrets:has', token, ['openai'])
pruefe(hat.code === 200 && typeof hat.daten.value === 'boolean', 'secrets:has liefert nur ja/nein, nie den Schlüssel')

// ---------------------------------------------------------------- Oberfläche
const seite = await hole('/')
pruefe(seite.code === 200 && seite.text.includes('<div id="root"'), 'Die Oberfläche wird ausgeliefert')
/*
 * Die Seite selbst darf der Browser NICHT behalten.
 *
 * Sonst zeigt das Tablet nach einem Update weiter die alte Oberfläche und ruft Dinge auf,
 * die es längst anders gibt – das sieht dann aus wie ein Fehler des Programms. Die Bündel
 * dagegen tragen eine Prüfsumme im Namen und dürfen dauerhaft bleiben.
 */
pruefe(String(seite.kopf.get('cache-control')).includes('no-store'), 'Die Seite wird nicht zwischengespeichert')
const buendel = String(seite.text.match(/src="([^"]*\.js)"/)?.[1] ?? '')
const js = buendel ? await hole(buendel.startsWith('/') ? buendel : `/${buendel}`) : { kopf: new Map() }
pruefe(String(js.kopf.get?.('cache-control') ?? '').includes('max-age'), `Das Bündel darf zwischengespeichert werden (${buendel || 'nicht gefunden'})`)

// Die laufende Fassung ist von außen erkennbar – der erste Fehlalarm kam von einer alten
const gesund = await hole('/gesundheit')
pruefe(/^\d+\.\d+/.test(String(gesund.daten.fassung ?? '')), `Die laufende Fassung wird genannt (${gesund.daten.fassung})`)

// Kein Ausbruch aus dem Ordner der Oberfläche
const ausbruch = await hole('/../../package.json')
pruefe(!ausbruch.text.includes('"electron-builder"'), 'Dateien außerhalb der Oberfläche sind nicht erreichbar')

// ---------------------------------------------------------------- wie ein Browser
/*
 * Ein Fenster OHNE Electron-Brücke ist für die Oberfläche dasselbe wie ein Browser auf dem
 * Tablet: `window.api` fehlt, und der Netzzugang muss es selbst aufbauen. Genau dieser Weg
 * lässt sich sonst nur von Hand prüfen – und bliebe damit ungeprüft.
 */
const browser = await app.evaluate(async ({ BrowserWindow }, adresse) => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { preload: undefined, sandbox: false } })
  await win.loadURL(adresse)
  return win.webContents.id
}, basis)
const seiteImNetz = (await app.windows()).find((w) => w !== page)
if (!seiteImNetz) {
  pruefe(false, 'Das Fenster ohne Brücke ließ sich nicht öffnen')
} else {
  await seiteImNetz.waitForTimeout(2500)
  const hatPin = await seiteImNetz.evaluate(() => (document.body.textContent ?? '').includes('Gib einmalig die PIN ein'))
  pruefe(hatPin, 'Ohne Anmeldung erscheint im Browser die PIN-Abfrage')
  const hatApi = await seiteImNetz.evaluate(() => typeof window.api?.sheets?.list === 'function')
  pruefe(hatApi, 'Die Oberfläche baut sich im Browser dieselbe Schnittstelle auf')

  // Anmelden wie am Gerät: PIN eintippen
  await seiteImNetz.evaluate((p) => {
    const felder = [...document.querySelectorAll('input')].filter((i) => i.getAttribute('type') === 'text' || i.inputMode === 'numeric')
    felder.forEach((f, i) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(f, p[i] ?? '')
      f.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }, pin)
  await seiteImNetz.waitForTimeout(2500)
  const drin = await seiteImNetz.evaluate(() => (document.body.textContent ?? '').includes('Arbeitsblatt'))
  pruefe(drin, 'Nach der PIN-Eingabe öffnet sich die Oberfläche')
  const listeOk = await seiteImNetz.evaluate(async () => {
    try {
      return Array.isArray(await window.api.sheets.list())
    } catch {
      return false
    }
  })
  pruefe(listeOk, 'Aus dem Browser heraus lässt sich die Bibliothek lesen')
  const gesperrt = await seiteImNetz.evaluate(async () => {
    try {
      await window.api.secrets.set('openai', 'geheim')
      return 'kam durch'
    } catch (e) {
      return String(e)
    }
  })
  pruefe(gesperrt.includes('nicht freigegeben'), `Ein gesperrter Aufruf wird im Browser erklärt abgewiesen: ${gesperrt.slice(0, 80)}`)
  /*
   * Die KI arbeitet mit den Zugangsdaten DIESES Rechners (Wunsch der Lehrkraft, 23.09.2026).
   * Geprüft wird beides: dass der Browser denselben Zugangsstand sieht wie der Rechner, und
   * dass der Erzeugungsaufruf nicht gesperrt ist. Eine echte Anfrage wird NICHT abgeschickt –
   * sie würde Kontingent verbrauchen.
   */
  const standPc = await page.evaluate(() => window.api.ai.status())
  const standNetz = await seiteImNetz.evaluate(() => window.api.ai.status())
  pruefe(
    standNetz.hasTextKey === standPc.hasTextKey && standNetz.provider === standPc.provider,
    `Der Browser sieht denselben KI-Zugang wie der Rechner (Schlüssel: ${standPc.hasTextKey ? 'ja' : 'nein'}, Anbieter: ${standPc.provider})`
  )
  const kiFrei = await seiteImNetz.evaluate(async () => {
    try {
      await window.api.ai.structured({ schemaName: 'probe', schema: {}, system: '', user: '' })
      return 'durchgelaufen'
    } catch (e) {
      return String(e)
    }
  })
  pruefe(!kiFrei.includes('nicht freigegeben'), `Die KI-Erzeugung ist vom Browser aus nicht gesperrt (${kiFrei.slice(0, 60)})`)

  // Die Reiter, die es nur am Rechner gibt, werden im Browser gar nicht erst angeboten
  await seiteImNetz.evaluate(() => document.querySelector('[aria-label="Einstellungen"]')?.click())
  await seiteImNetz.waitForTimeout(1200)
  const reiterImNetz = await seiteImNetz.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? '').trim()))
  console.log(`    Reiter im Browser: ${reiterImNetz.join(' · ')}`)
  pruefe(!reiterImNetz.includes('KI-Zugang'), 'Der Reiter „KI-Zugang" fehlt im Browser – er richtet etwas auf dem Rechner ein')
  pruefe(!reiterImNetz.includes('Netzwerk'), 'Der Reiter „Netzwerk" fehlt im Browser – ein Gerät stellt den Zugang nicht um')
  pruefe(reiterImNetz.includes('Schule'), 'Der Reiter „Schule" ist da – Schulname und Logo sind vom Gerät aus einstellbar')

  await seiteImNetz.screenshot({ path: 'test-results/netzzugang-browser.png' }).catch(() => undefined)
}

// ---------------------------------------------------------------- Ausschalten
await page.evaluate(() => window.api.lan.stop())
let aus = false
try {
  await hole('/')
} catch {
  aus = true
}
pruefe(aus, 'Nach dem Ausschalten ist nichts mehr erreichbar')

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nDer Zugang aus dem Netz lässt nur durch, was freigegeben ist.')
