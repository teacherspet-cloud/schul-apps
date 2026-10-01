// Wache für ÄNDERUNGSWUNSCH AM HÖRTEXT und ZEITANGABEN AUS DER AUFNAHME – mit KI- und
// Sprachsynthese-Attrappe, ohne Netz und ohne Kontingent (vorher: npm run build).
// Aufruf: node tests/e2e/hoertext-wunsch.mjs <Ausgabeordner>
//
// Wünsche der Lehrkraft (01.10.2026):
// - Am Hörtext Zauberstab/Kreis mit Wunsch und Vorschlägen; die KI ändert das SKRIPT, die Aufgaben
//   dazu werden angepasst (nur, was nicht mehr stimmt), Zusammenfassung, Strg+Z als EIN Schritt.
//   Eine vorhandene Aufnahme gilt danach als veraltet; neu vertont werden nur geänderte Zeilen.
// - Sobald vertont ist, stimmen alle Zeitangaben mit der Aufnahme überein: Spieldauer ohne „ca.",
//   Bearbeitungszeit des Hörteils, Zeitmarken in Skript und Erwartungshorizont.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hoertext-wunsch')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hoerwunsch-'))

const ALT = [
  'Mr Clarkson: Good morning, Anna. You look tired today.',
  'Anna: Good morning. I could not sleep last night because of the storm.',
  'Mr Clarkson: Were you worried about the maths test on Tuesday?',
  'Anna: Yes. I still do not understand the fractions at all.',
  'Mr Clarkson: Then come to my room after lunch and we will practise together.'
]
// „Kürzer": Zeilen 1 und 2 bleiben wörtlich, Zeile 3 ändert sich, 4 und 5 fallen weg
const NEU = [ALT[0], ALT[1], 'Mr Clarkson: Is it the maths test on Wednesday?']
const ZEICHEN_JE_SEKUNDE = 15
const RAHMEN = 1152 / 44100
const dauerVon = (zeile) => {
  const text = zeile.slice(zeile.indexOf(':') + 1).trim()
  const sprache = Math.max(1, Math.round(Math.max(0.5, text.length / ZEICHEN_JE_SEKUNDE) / RAHMEN)) * RAHMEN
  return sprache + Math.max(1, Math.round(0.3 / RAHMEN)) * RAHMEN
}
const erwartet = (zeilen) => zeilen.reduce((n, z) => n + dauerVon(z), 0)
const minSek = (s) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

const leer = { kind: 'lines', count: 0, heightMm: 0, gapText: '', options: [], correct: [], pairs: [], items: [], rows: [], statements: [], labels: [] }
const attrappe = join(userData, 'ki-attrappe.json')
const protokoll = join(userData, 'ki-protokoll.jsonl')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 600,
    protokoll,
    tts: { zeichenJeSekunde: ZEICHEN_JE_SEKUNDE },
    antworten: {
      baustein_wunsch_vorschlaege: { vorschlaege: ['Weniger Fachwörter', 'Ein Sprecher mehr', 'Langsamer', 'Andere Schule'] },
      hoertext_wunsch: {
        title: 'Talking to the teacher',
        textType: 'Gespräch',
        speakers: ['Mr Clarkson', 'Anna'],
        transcript: NEU.join('\n'),
        beforeListening: 'Du hörst ein kurzes Gespräch zwischen einer Schülerin und ihrem Lehrer.',
        plays: 2,
        aenderungen: 'Gekürzt auf drei Zeilen; der Test ist jetzt am Mittwoch.'
      },
      hoertext_aufgaben: {
        aufgaben: [
          { id: 't1', geaendert: false, grund: '', block: {} },
          {
            id: 't2',
            geaendert: true,
            grund: 'Aussage 1: Test jetzt am Mittwoch; Aussage 2 gestrichen',
            block: {
              type: 'task',
              instruction: 'True or false? Tick the box.',
              operator: '',
              afb: 'I',
              afbReason: '',
              socialForm: 'EA',
              minutes: 4,
              points: 0,
              solution: '',
              answer: { ...leer, kind: 'trueFalse', statements: [{ text: 'The maths test is on Wednesday.', isTrue: true }] },
              parts: []
            }
          }
        ],
        zusammenfassung: 'Aufgabe 2 an den neuen Testtag angepasst.'
      }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const anfragen = (schema) => {
  try {
    return readFileSync(protokoll, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((z) => JSON.parse(z))
      .filter((a) => a.schemaName === schema)
  } catch {
    return []
  }
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe },
  ...(process.env.SCHULAPPS_ELECTRON ? { executablePath: process.env.SCHULAPPS_ELECTRON } : {})
})
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
  await warteAufOberflaeche(page)
  const bis = async (pruefen, arg, ms = 15000) => {
    const ende = Date.now() + ms
    while (Date.now() < ende) {
      if (await page.evaluate(pruefen, arg)) return true
      await page.waitForTimeout(250)
    }
    return false
  }
  const ws = () => page.evaluate(() => window.__selftest.worksheetJetzt())
  const ansicht = async (name) => {
    await page.locator('[aria-label="Ansicht"]').getByText(name, { exact: true }).first().click()
    await page.waitForTimeout(900)
  }

  // ---------- Blatt mit Hörtext (ohne Aufnahme) und zwei Aufgaben dazu
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.audioSheet())
  await page.waitForTimeout(800)
  await page.evaluate(
    ({ ALT, leer }) => {
      const w = structuredClone(window.__selftest.worksheetJetzt())
      const h = w.sheets[0].blocks[0]
      h.transcript = ALT.join('\n')
      h.beforeListening = 'Du hörst ein Gespräch. Der Hörtext dauert ca. 0:30 Minuten.'
      delete h.audio
      const aufgabe = (id, instruction, answer) => ({
        id,
        type: 'task',
        instruction,
        operator: '',
        afb: 'I',
        afbReason: '',
        socialForm: 'EA',
        answer: { ...leer, ...answer },
        parts: [],
        solution: '',
        points: 2,
        minutes: 4,
        skill: 'listening',
        audioId: 'a1'
      })
      w.sheets[0].blocks.push(
        aufgabe('t1', 'Why is Anna tired? Tick the right answer.', { kind: 'multipleChoice', options: ['because of the storm', 'because of a party'], correct: [0] }),
        aufgabe('t2', 'True or false? Tick the box.', {
          kind: 'trueFalse',
          statements: [
            { text: 'The maths test is on Tuesday.', isTrue: true },
            { text: 'Anna understands the fractions.', isTrue: false }
          ]
        })
      )
      window.__selftest.setWorksheet(w)
    },
    { ALT, leer }
  )
  await page.waitForTimeout(1500)

  // ---------- Vor dem Vertonen: geschätzt, mit „ca."
  const kopfVorher = await page.locator('.ws-editor-pages .ws-audio-meta').first().innerText()
  pruefe(/ca\. \d:\d\d min/.test(kopfVorher), `Ohne Aufnahme steht eine Schätzung mit „ca." auf dem Blatt („${kopfVorher}")`)

  await ansicht('Hörtexte')
  pruefe((await page.locator('[data-hoerdauer="geschaetzt"]').count()) === 1, 'Der Reiter Hörtexte zeigt die geschätzte Dauer')

  // ---------- Vertonen (Attrappe: Stille mit bekannter Länge je Zeile)
  await page.getByRole('button', { name: /^Vertonen$/ }).first().click()
  const vertont = await bis(() => window.__selftest.worksheetJetzt().sheets[0].blocks[0].audio?.sekunden > 0, undefined, 20000)
  pruefe(vertont, 'Nach dem Vertonen ist die gemessene Dauer im Hörtext gespeichert')
  let h = (await ws()).sheets[0].blocks[0]
  const soll = erwartet(ALT)
  pruefe(Math.abs(h.audio.sekunden - soll) < 0.1, `Gemessene Dauer = Summe der Zeilen (${h.audio.sekunden.toFixed(2)} s, erwartet ${soll.toFixed(2)} s)`)
  pruefe(h.audio.zeitmarken?.length === 5 && h.audio.zeitmarken[0] === 0, `Je Sprecherzeile eine Zeitmarke (${JSON.stringify(h.audio.zeitmarken)})`)
  pruefe(Math.abs(h.audio.zeitmarken[2] - (dauerVon(ALT[0]) + dauerVon(ALT[1]))) < 0.1, 'Zeitmarke von Zeile 3 = Länge der Zeilen 1 und 2')
  pruefe(h.beforeListening.includes(`dauert ${minSek(soll)} Minuten`), `Die Längenangabe im Hinweis folgt der Aufnahme („${h.beforeListening}")`)
  await page.waitForTimeout(600)
  pruefe((await page.locator('[data-hoerdauer="gemessen"]').count()) === 1, 'Der Reiter zeigt die gemessene Dauer')
  pruefe((await page.locator('[data-zeitmarken="gemessen"]').count()) === 1, 'Der Reiter zeigt gemessene Zeitmarken')
  await page.screenshot({ path: join(out, '1-vertont-hoertexte.png') })

  // ---------- Blatt: Dauer ohne „ca."; Lösungen: Ablauf, Zeitmarken, Fundstellen
  await ansicht('Arbeitsblatt')
  const kopf = await page.locator('.ws-editor-pages .ws-audio-meta').first().innerText()
  pruefe(kopf.includes(`${minSek(soll)} min`) && !kopf.includes('ca.'), `Auf dem Blatt steht die gemessene Dauer ohne „ca." („${kopf}")`)
  await page.locator('.ws-editor-pages .ws-audio').first().screenshot({ path: join(out, '2-blatt-hoertext.png') })
  await ansicht('Lösungen')
  const ablauf = await page.locator('.ws-editor-pages [data-hoerablauf]').first().innerText().catch(() => '')
  const minuten = Math.ceil((60 + 2 * soll + 60 + 60) / 60)
  pruefe(ablauf.includes(`2 × ${minSek(soll)} Hören`) && ablauf.includes(`= ${minuten} Min.`), `Bearbeitungszeit des Hörteils aus der Aufnahme („${ablauf}")`)
  const marken = await page.locator('.ws-editor-pages .ws-zeitmarke').allInnerTexts()
  pruefe(marken.length === 5 && marken[2] === minSek(dauerVon(ALT[0]) + dauerVon(ALT[1])), `Zeitmarken je Zeile im Skript (${marken.join(', ')})`)
  const notizen = (await page.locator('.ws-editor-pages .ws-teacher-note').allInnerTexts()).join(' | ')
  pruefe(/Hörtext: 1\) ab 0:0\d/.test(notizen) && !/ab ca\./.test(notizen), `Fundstellen im Erwartungshorizont aus der Aufnahme (${notizen.slice(0, 200)})`)
  // „Why is Anna tired? – because of the storm": Die Antwort steht in Zeile 2, nicht in Zeile 1 („You look tired")
  pruefe(notizen.includes(`Hörtext: ab ${minSek(h.audio.zeitmarken[1])}`), 'Die Fundstelle der Mehrfachwahl ist die Zeile mit der richtigen Antwort')
  await page.screenshot({ path: join(out, '3-loesungen-zeiten.png') })

  // ---------- Änderungswunsch „Kürzer" am Hörtext (Reiter Hörtexte)
  await ansicht('Hörtexte')
  const karte = page.locator('[data-hoertext="a1"]')
  await karte.locator('[aria-label^="Baustein überarbeiten"]').click()
  await page.locator('[data-ki-wunsch] textarea').waitFor({ timeout: 4000 })
  const regel = await page.locator('[data-ki-wunsch] [data-vorschlag="regel"]').allInnerTexts()
  pruefe(['Kürzer', 'Langsamer und einfachere Sprache', 'Andere Situation'].every((x) => regel.includes(x)), `Vorschläge für Hörtexte (${regel.slice(0, 6).join(' | ')})`)
  await page.locator('[data-ki-wunsch] [data-vorschlag="regel"]', { hasText: 'Kürzer' }).first().click()
  await page.screenshot({ path: join(out, '4-wunsch-kuerzer.png') })
  await page.locator('[data-ki-wunsch] button', { hasText: 'Überarbeiten' }).click()
  const geaendert = await bis((neu) => window.__selftest.worksheetJetzt().sheets[0].blocks[0].transcript === neu, NEU.join('\n'), 20000)
  pruefe(geaendert, 'Das Skript wurde nach dem Wunsch geändert (kürzer)')
  let w = await ws()
  pruefe(w.sheets[0].blocks[0].transcript.length < ALT.join('\n').length, 'Das neue Skript ist kürzer')
  const t2 = w.sheets[0].blocks.find((b) => b.id === 't2')
  const t1 = w.sheets[0].blocks.find((b) => b.id === 't1')
  pruefe(t2?.answer.statements[0]?.text.includes('Wednesday') && t2.points === 2 && t2.audioId === 'a1', 'Die betroffene Aufgabe ist angepasst (Kennung, Punkte, Zuordnung bleiben)')
  pruefe(t1?.instruction === 'Why is Anna tired? Tick the right answer.', 'Die nicht betroffene Aufgabe bleibt unverändert')
  const wunschAnfrage = anfragen('hoertext_wunsch').at(-1)
  pruefe(Boolean(wunschAnfrage?.user.includes('Kürzer') && wunschAnfrage.user.includes(ALT[4])), 'Die Skript-Anfrage enthält Wunsch und bisheriges Skript')
  pruefe(Boolean(anfragen('hoertext_aufgaben').at(-1)?.user.includes('[t2]')), 'Die Aufgaben gehen mit altem und neuem Skript an die KI')
  const meldung = await page.locator('.mantine-Notification-root').allInnerTexts()
  pruefe(meldung.some((m) => /Angepasst: Aufgabe 2/.test(m) && /Unverändert: Aufgabe 1/.test(m)), `Zusammenfassung der Änderungen (${meldung.join(' | ').slice(0, 200)})`)
  await page.waitForTimeout(600)
  pruefe((await page.locator('[data-aufnahme-veraltet]').count()) === 1, 'Die Aufnahme ist als veraltet markiert')
  pruefe((await page.getByRole('button', { name: 'Geänderte Stellen neu vertonen' }).count()) === 1, 'Angeboten: „Geänderte Stellen neu vertonen"')
  pruefe((await page.locator('[data-hoerdauer="geschaetzt"]').count()) === 1, 'Mit veralteter Aufnahme sind die Zeitangaben wieder geschätzt')
  await page.screenshot({ path: join(out, '5-nach-wunsch.png') })

  // ---------- Strg+Z: Skript und Aufgaben in EINEM Schritt zurück
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Control+z')
  const zurueck = await bis((alt) => window.__selftest.worksheetJetzt().sheets[0].blocks[0].transcript === alt, ALT.join('\n'), 5000)
  w = await ws()
  pruefe(zurueck && w.sheets[0].blocks.find((b) => b.id === 't2')?.answer.statements.length === 2, 'Strg+Z nimmt Skript und Aufgaben in einem Schritt zurück')
  await page.keyboard.press('Control+y')
  let wieder = await bis((neu) => window.__selftest.worksheetJetzt().sheets[0].blocks[0].transcript === neu, NEU.join('\n'), 3000)
  if (!wieder) {
    await page.keyboard.press('Control+Shift+z')
    wieder = await bis((neu) => window.__selftest.worksheetJetzt().sheets[0].blocks[0].transcript === neu, NEU.join('\n'), 3000)
  }
  pruefe(wieder, 'Wiederholen stellt die Änderung wieder her')

  // ---------- Nur geänderte Stellen neu vertonen
  const ttsVorher = anfragen('tts').length
  // Die alte Aufnahme samt Segmenten merken – die unveränderten Zeilen müssen Byte für Byte bleiben
  const altAudio = (await ws()).sheets[0].blocks[0].audio
  await page.getByRole('button', { name: 'Geänderte Stellen neu vertonen' }).click()
  const neuVertont = await bis(() => {
    const b = window.__selftest.worksheetJetzt().sheets[0].blocks[0]
    return b.audio?.zeitmarken?.length === 3
  }, undefined, 20000)
  pruefe(neuVertont, 'Neu vertont: drei Zeitmarken für drei Zeilen')
  const tts = anfragen('tts').slice(ttsVorher)
  pruefe(tts.length === 1 && tts[0].user === 'Is it the maths test on Wednesday?', `Nur die geänderte Zeile ging an die Sprachsynthese (${JSON.stringify(tts.map((t) => t.user))})`)
  h = (await ws()).sheets[0].blocks[0]
  // Übernommene Stücke enden in der Pausenmitte (dort wird geschnitten) – die Summe der Segmente zählt
  const soll2 = altAudio.segmente[0].sekunden + altAudio.segmente[1].sekunden + dauerVon(NEU[2])
  pruefe(Math.abs(h.audio.sekunden - soll2) < 0.05, `Neue Dauer = Summe der Segmente (${h.audio.sekunden.toFixed(2)} s, erwartet ${soll2.toFixed(2)} s)`)
  const gleich = await page.evaluate(
    ({ alt, neu }) => {
      const bytes = (u) => Uint8Array.from(atob(u.slice(u.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      const a = bytes(alt.dataUrl)
      const b = bytes(neu.dataUrl)
      return [0, 1].every((i) => {
        const x = a.subarray(alt.segmente[i].von, alt.segmente[i].bis)
        const y = b.subarray(neu.segmente[i].von, neu.segmente[i].bis)
        return x.length === y.length && x.every((v, k) => v === y[k])
      })
    },
    { alt: altAudio, neu: h.audio }
  )
  pruefe(gleich, 'Die unveränderten Zeilen sind Byte für Byte aus der alten Aufnahme übernommen')
  const meldung2 = await page.locator('.mantine-Notification-root').allInnerTexts()
  pruefe(meldung2.some((m) => /Nur die geänderten Stellen neu vertont \(1 von 3 Zeilen\)/.test(m)), 'Die Meldung nennt den Weg (nur geänderte Stellen)')
  pruefe((await page.locator('[data-aufnahme-veraltet]').count()) === 0, 'Die Aufnahme passt wieder zum Skript')
  await page.screenshot({ path: join(out, '6-teilweise-neu-vertont.png') })
  await ansicht('Lösungen')
  const marken2 = await page.locator('.ws-editor-pages .ws-zeitmarke').allInnerTexts()
  pruefe(marken2.length === 3, `Die Zeitmarken im Skript folgen der neuen Aufnahme (${marken2.join(', ')})`)
  await page.screenshot({ path: join(out, '7-loesungen-neu.png') })
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}

if (problems.length) {
  console.error(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nÄnderungswunsch am Hörtext und Zeitangaben aus der Aufnahme: alles in Ordnung.')
