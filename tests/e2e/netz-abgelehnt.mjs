// Sucht Aufrufe, die im Browser abgelehnt werden, obwohl die Oberfläche sie braucht.
// Aufruf: node tests/e2e/netz-abgelehnt.mjs
//
// Der Zugang aus dem Netz arbeitet mit einer Erlaubnisliste. Zu eng eingestellt bedeutet:
// Die Oberfläche läuft am Rechner, im Browser aber meldet sie „… ist über das Netz nicht
// freigegeben". Diese Wache fährt die Programme durch und schreibt auf, was abgelehnt wurde –
// damit die Liste an der Wirklichkeit gemessen wird und nicht an meiner Vermutung.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const userData = mkdtempSync(join(tmpdir(), 'schulapps-abgelehnt-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })

const status = await page.evaluate(() => window.api.lan.start())
const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
const basis = `http://127.0.0.1:${status.port}`

// Anmeldung vorbereiten, damit die Oberfläche gleich durchstarten kann
const anmeldung = await fetch(`${basis}/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })
const { token } = await anmeldung.json()

await app.evaluate(
  async ({ BrowserWindow }, { adresse, token }) => {
    const win = new BrowserWindow({ width: 1500, height: 1000, show: false, webPreferences: { preload: undefined, sandbox: false } })
    /*
     * Der Token muss stehen, BEVOR die Oberfläche startet. Lädt man sie zuerst, läuft ihr
     * erster Aufruf ins Leere, sie verwirft den Token als abgelaufen – und die Anmeldung ist
     * wieder weg. Deshalb wird er auf einer reinen JSON-Seite derselben Herkunft abgelegt.
     */
    await win.loadURL(`${adresse}/gesundheit`)
    await win.webContents.executeJavaScript(`localStorage.setItem('schulapps-netz-token', ${JSON.stringify(token)})`)
  },
  { adresse: basis, token }
)
const netz = (await app.windows()).find((w) => w !== page)
if (!netz) throw new Error('Das Fenster ohne Brücke ließ sich nicht öffnen')

// Jede abgelehnte Anfrage mitschreiben
/*
 * ACHTUNG, hier lag ein Loch: Vorher wurde der Mitschnitt erst NACH dem Laden eingesetzt.
 * Aufrufe beim Aufbauen der Oberfläche liefen also unbeobachtet durch – genau dort steckte
 * `files:launch-file`, das bei jeder Browsersitzung sofort eine Fehlermeldung erzeugte.
 * Jetzt wird der Mitschnitt vor dem Laden eingesetzt und die Seite neu geladen.
 */
await netz.addInitScript(() => {
  window.__abgelehnt = []
  const echt = window.fetch
  window.fetch = async (...args) => {
    const res = await echt(...args)
    if (res.status === 403) {
      try {
        const kanal = JSON.parse(String(args[1]?.body ?? '{}')).channel
        if (kanal && !window.__abgelehnt.includes(kanal)) window.__abgelehnt.push(kanal)
      } catch {
        /* keine JSON-Anfrage */
      }
    }
    return res
  }
})
// Jetzt erst die Oberfläche laden – mit Token und mit Mitschnitt
await netz.goto(basis)
await netz.waitForTimeout(3000)

/*
 * Erst prüfen, ob überhaupt etwas dasteht.
 *
 * Ohne diese Zeile könnte die Wache still durchwinken: Baut sich die Oberfläche gar nicht
 * auf, ruft sie auch nichts auf – und „kein Aufruf wurde abgelehnt" wäre keine gute
 * Nachricht, sondern eine leere.
 */
const programme = await netz.evaluate(() => document.querySelectorAll('[aria-label="Arbeitsblatt"], [aria-label="Vokabeltest"]').length)
if (programme < 2) throw new Error(`Die Oberfläche ist im Browser nicht aufgebaut (${programme} Programmknöpfe gefunden) – die Prüfung wäre wertlos`)
await netz.evaluate(() => {
  window.__abgelehnt = []
  const echt = window.fetch
  window.fetch = async (...args) => {
    const res = await echt(...args)
    if (res.status === 403) {
      try {
        const kanal = JSON.parse(String(args[1]?.body ?? '{}')).channel
        if (kanal && !window.__abgelehnt.includes(kanal)) window.__abgelehnt.push(kanal)
      } catch {
        /* keine JSON-Anfrage */
      }
    }
    return res
  }
})

/** Klickt ein Element mit diesem Text bzw. dieser Beschriftung an. */
const klick = async (auswahl) => {
  await netz.evaluate((a) => {
    const el = document.querySelector(a) ?? [...document.querySelectorAll('button, [role="tab"], a')].find((x) => x.textContent?.trim() === a)
    el?.click()
  }, auswahl)
  await netz.waitForTimeout(1400)
}

// Alle Programme und Bibliotheken öffnen
for (const modul of ['Arbeitsblatt', 'Klassenarbeiten', 'Lernzielkontrolle', 'Grammatiktest', 'Vokabeltest', 'Vokabellisten']) {
  await klick(`[aria-label="${modul}"]`)
}
for (const knopf of ['Meine Arbeitsblätter', 'Meine Lernzielkontrollen', 'Meine Grammatiktests', 'Datei öffnen …']) {
  await klick(knopf)
}
// Einstellungen mit allen Reitern
await klick('[aria-label="Einstellungen"]')
for (const reiter of ['Schule', 'Material', 'Darstellung', 'KI-Zugang', 'Bilder und Hörtexte', 'Netzwerk']) {
  await klick(reiter)
}

// Auch SCHREIBEN auslösen – Klicken allein rührt die Einstellungen nicht an
await netz.evaluate(() => {
  const feld = [...document.querySelectorAll('input')].find((i) => i.closest('.mantine-InputWrapper-root')?.textContent?.includes('Schulname'))
  if (!feld) return
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(feld, 'Probeschule vom Tablet')
  feld.dispatchEvent(new Event('input', { bubbles: true }))
  feld.dispatchEvent(new Event('blur', { bubbles: true }))
})
await netz.waitForTimeout(1500)
// Notenschlüssel ändern (schreibt ebenfalls in die Einstellungen)
await klick('Material')
await netz.evaluate(() => {
  const feld = [...document.querySelectorAll('input')].find((i) => i.closest('.mantine-InputWrapper-root')?.textContent?.includes('Note 1'))
  if (!feld) return
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(feld, '90')
  feld.dispatchEvent(new Event('input', { bubbles: true }))
})
await netz.waitForTimeout(1500)
// Designvorlagen öffnen
await klick('[aria-label="Arbeitsblatt"]')
await klick('Designvorlagen')
await netz.waitForTimeout(1500)

const abgelehnt = await netz.evaluate(() => window.__abgelehnt ?? [])
await netz.screenshot({ path: 'test-results/netz-abgelehnt.png' }).catch(() => undefined)

await page.evaluate(() => window.api.lan.stop())
await app.close()
rmSync(userData, { recursive: true, force: true })

if (abgelehnt.length) {
  console.log('Im Browser abgelehnt, obwohl die Oberfläche es aufruft:')
  for (const k of abgelehnt) console.log(`  - ${k}`)
  process.exit(1)
}
console.log('Kein Aufruf der Oberfläche wird im Browser abgelehnt.')
