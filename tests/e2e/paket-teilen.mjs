// Wache für das SCHULPAKET (Großprogramm 0.4, F8) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/paket-teilen.mjs <Ausgabeordner>
//
// Rechner A (Wegwerf-Profil): Arbeitsblatt mit Hörtext und Elternbrief anlegen, auf der Startseite
// „Schulpaket erstellen …", beide wählen, speichern (Dialog im Hauptprozess ersetzt).
// Rechner B (zweites Wegwerf-Profil): „Schulpaket öffnen …", Vorschau zeigt beide, „einlesen":
// Beide stehen in den Bibliotheken, der Hörtext liegt im Ordner. Kein Netz, kein QR.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/paket-teilen')
mkdirSync(out, { recursive: true })
const profilA = mkdtempSync(join(tmpdir(), 'schulapps-paket-a-'))
const profilB = mkdtempSync(join(tmpdir(), 'schulapps-paket-b-'))
const ablage = mkdtempSync(join(tmpdir(), 'schulapps-paket-datei-'))
const paketDatei = join(ablage, 'Einheit 9b.schulpaket')

const problems = []
const errors = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

async function starte(userData) {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 950))
  await warteAufOberflaeche(page)
  return { app, page }
}

try {
  // ---------- Rechner A: packen
  console.log('Rechner A')
  mkdirSync(join(profilA, 'hoertexte'), { recursive: true })
  writeFileSync(join(profilA, 'hoertexte', 'paket_hoertext_1.mp3'), Buffer.from([0x49, 0x44, 0x33, 1, 2, 3]))
  let { app, page } = await starte(profilA)
  await page.evaluate(async () => {
    await window.api.sheets.save({
      id: 'paket-ab-1',
      name: 'Julikrise Quellenarbeit',
      stats: { subjectLabel: 'Geschichte', grade: 9, sheets: 1, tasks: 1 },
      payload: { version: 1, meta: { title: 'Julikrise Quellenarbeit' }, sheets: [], audio: 'paket_hoertext_1.mp3' }
    })
    await window.api.elternbriefe.save({ id: 'paket-eb-1', name: 'Wandertag 7b', stats: {}, payload: { version: 1, text: null } })
  })
  await page.reload()
  await warteAufOberflaeche(page)
  await app.evaluate(({ dialog }, ziel) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: ziel })
  }, paketDatei)
  await page.click('[data-paket-erstellen]')
  await page.waitForSelector('[data-paket-eintrag="arbeitsblatt:paket-ab-1"]', { timeout: 10000 })
  await page.fill('[data-paket-titel]', 'Einheit 9b')
  await page.click('[data-paket-eintrag="arbeitsblatt:paket-ab-1"]')
  await page.click('[data-paket-eintrag="elternbrief:paket-eb-1"]')
  await page.screenshot({ path: join(out, 'paket-erstellen.png') })
  await page.click('[data-paket-speichern]')
  await page.waitForSelector('text=Schulpaket gespeichert', { timeout: 15000 })
  pruefe(existsSync(paketDatei), 'Paketdatei liegt am gewählten Ort')
  await app.close()

  // ---------- Rechner B: einlesen
  console.log('Rechner B')
  ;({ app, page } = await starte(profilB))
  await app.evaluate(({ dialog }, datei) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [datei] })
  }, paketDatei)
  await page.click('[data-paket-oeffnen]')
  await page.waitForSelector('[data-paket-einlesen]', { timeout: 10000 })
  const vorschau = await page.locator('.mantine-Modal-content').innerText()
  pruefe(
    vorschau.includes('Einheit 9b') && vorschau.includes('Julikrise Quellenarbeit') && vorschau.includes('Wandertag 7b'),
    'Vorschau nennt Paket und beide Materialien'
  )
  pruefe(vorschau.includes('1 Hörtext'), 'Vorschau nennt den Hörtext')
  await page.screenshot({ path: join(out, 'paket-einlesen.png') })
  await page.click('[data-paket-einlesen]')
  await page.waitForSelector('text=Schulpaket eingelesen', { timeout: 15000 })
  const bestand = await page.evaluate(async () => ({
    blaetter: await window.api.sheets.list(),
    briefe: await window.api.elternbriefe.list()
  }))
  const blatt = bestand.blaetter.find((b) => b.name === 'Julikrise Quellenarbeit')
  pruefe(Boolean(blatt) && blatt.id !== 'paket-ab-1', 'Arbeitsblatt ist mit neuer Kennung in der Bibliothek')
  pruefe(blatt?.subjectLabel === 'Geschichte' && blatt?.grade === 9, 'Kennzahlen (Fach, Jahrgang) sind mitgekommen')
  pruefe(
    bestand.briefe.some((b) => b.name === 'Wandertag 7b'),
    'Elternbrief ist in seiner Bibliothek'
  )
  pruefe(existsSync(join(profilB, 'hoertexte', 'paket_hoertext_1.mp3')), 'Hörtext liegt im Ordner des zweiten Rechners')
  const zuletzt = await page.locator('body').innerText()
  pruefe(zuletzt.includes('Julikrise Quellenarbeit'), 'Startseite zeigt das eingelesene Material ohne Neustart')
  await app.close()
} catch (e) {
  problems.push(`Abbruch: ${e instanceof Error ? e.message : e}`)
  console.log(e)
} finally {
  for (const d of [profilA, profilB, ablage]) rmSync(d, { recursive: true, force: true })
}

const echteFehler = errors.filter((e) => !/Autofill|DevTools/.test(e))
pruefe(echteFehler.length === 0, `keine Fehler in der Konsole${echteFehler.length ? `: ${echteFehler.slice(0, 3).join(' | ')}` : ''}`)
console.log(problems.length ? `\n${problems.length} Problem(e)` : '\nAlles in Ordnung')
process.exit(problems.length ? 1 : 0)
