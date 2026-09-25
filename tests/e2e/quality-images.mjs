// Qualitätsprüfung mit echter KI (kostet Abo-Kontingent!): Arbeitsblätter mit Bildern und Tafelbild für alle Fächer
// sowie Bilder für Vokabeltests. Vorher: npx electron-vite build
// Aufruf: node tests/e2e/quality-images.mjs <Ausgabeordner> [anthropic|openai] [fach,fach|vokabeln]
import { _electron as electron } from 'playwright-core'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/qualitaet')
const provider = process.argv[3] ?? 'anthropic'
const only = process.argv[4]?.split(',')
mkdirSync(out, { recursive: true })

// Eigene Einstellungen der Lehrkraft kopieren (Abo-Zugang), Text-KI ggf. umstellen
const userData = mkdtempSync(join(tmpdir(), 'schulapps-qualitaet-'))
const settings = JSON.parse(readFileSync(join(process.env.APPDATA, 'schul-apps', 'settings.json'), 'utf8'))
settings.ai.textProvider = provider
settings.ai.access[provider] = 'subscription'
settings.ai.subscriptionAccepted[provider] = true
writeFileSync(join(userData, 'settings.json'), JSON.stringify(settings))
try {
  copyFileSync(join(process.env.APPDATA, 'schul-apps', 'secrets.json'), join(userData, 'secrets.json'))
} catch {
  // ohne API-Schlüssel
}

const NI_GYM = { stateId: 'NI', schoolTypeId: 'gymnasium', schoolTypeName: 'Gymnasium' }
const SUBJECTS = [
  { subjectId: 'deutsch', topic: 'Merkmale der Ballade am Beispiel „Der Erlkönig“', grade: 8 },
  { subjectId: 'englisch', topic: 'Australian wildlife', grade: 7, cefrLevel: 'A2' },
  { subjectId: 'franzoesisch', topic: 'Les monuments de Paris', grade: 8, cefrLevel: 'A2' },
  { subjectId: 'spanisch', topic: 'La comida en España', grade: 9, cefrLevel: 'A2', languageOrder: 2 },
  { subjectId: 'italienisch', topic: 'Roma antica e moderna', grade: 10, cefrLevel: 'A2', languageOrder: 3 },
  { subjectId: 'latein', topic: 'Das Forum Romanum', grade: 7 },
  { subjectId: 'mathematik', topic: 'Satz des Pythagoras', grade: 9 },
  { subjectId: 'biologie', topic: 'Aufbau der Pflanzenzelle', grade: 6 },
  { subjectId: 'chemie', topic: 'Aggregatzustände des Wassers', grade: 7 },
  { subjectId: 'physik', topic: 'Hebelgesetz', grade: 8 },
  { subjectId: 'informatik', topic: 'Wie Datenpakete durch das Internet reisen', grade: 8 },
  { subjectId: 'geschichte', topic: 'Leben auf einer mittelalterlichen Burg', grade: 7 },
  { subjectId: 'erdkunde', topic: 'Vulkane', grade: 7 },
  { subjectId: 'politik', topic: 'Wahlen in Deutschland', grade: 9 },
  { subjectId: 'religion', topic: 'Franz von Assisi', grade: 6 },
  { subjectId: 'kunst', topic: 'Vincent van Gogh: Die Sternennacht', grade: 7 },
  { subjectId: 'musik', topic: 'Instrumente des Sinfonieorchesters', grade: 5 },
  { subjectId: 'sport', topic: 'Weitsprung – Bewegungsablauf', grade: 6 },
  { subjectId: 'sachunterricht', topic: 'Der Igel', grade: 3, stateId: 'NI', schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule' },
  { subjectId: 'daz', topic: 'Obst und Gemüse einkaufen', grade: 5, languageMode: 'dazA1' }
]
const VOCAB = [
  {
    targetLanguage: 'en',
    grade: 5,
    level: 'A1',
    words: [
      ['ladder', 'Leiter'],
      ['bat', 'Fledermaus'],
      ['glasses', 'Brille'],
      ['orange', 'Orange (Frucht)'],
      ['letter', 'Brief'],
      ['umbrella', 'Regenschirm'],
      ['to swim', 'schwimmen'],
      ['key', 'Schlüssel'],
      ['trainers', 'Turnschuhe'],
      ['kitchen', 'Küche'],
      ['cow', 'Kuh'],
      ['friendship', 'Freundschaft']
    ]
  },
  {
    targetLanguage: 'fr',
    grade: 7,
    level: 'A1',
    words: [
      ['la pomme', 'Apfel'],
      ['le vélo', 'Fahrrad'],
      ['la clé', 'Schlüssel'],
      ['nager', 'schwimmen'],
      ['la fenêtre', 'Fenster'],
      ['le pain', 'Brot'],
      ['la liberté', 'Freiheit']
    ]
  },
  {
    targetLanguage: 'es',
    grade: 8,
    level: 'A1',
    words: [
      ['la mesa', 'Tisch'],
      ['el perro', 'Hund'],
      ['llover', 'regnen'],
      ['la camiseta', 'T-Shirt'],
      ['el reloj', 'Uhr'],
      ['la playa', 'Strand']
    ]
  }
]

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.waitForFunction(() => Boolean(window.__selftest), null, { timeout: 60000 })

const saveThumb = (name, dataUrl) => {
  if (!dataUrl) return undefined
  const file = `${name}.jpg`
  writeFileSync(join(out, file), Buffer.from(dataUrl.split(',')[1], 'base64'))
  return file
}
const summary = []

async function runWorksheet(input) {
  const t = Date.now()
  try {
    const res = await page.evaluate((i) => window.__selftest.worksheet(i), { ...NI_GYM, ...input })
    const { worksheet, ...rest } = res
    rest.images = rest.images.map((img, k) => ({ ...img, thumb: saveThumb(`${input.subjectId}-bild${k + 1}`, img.thumb) }))
    writeFileSync(join(out, `${input.subjectId}.json`), JSON.stringify(rest, null, 1))
    writeFileSync(join(out, `${input.subjectId}.arbeitsblatt`), JSON.stringify({ app: 'schul-apps', type: 'arbeitsblatt', version: 1, worksheet }))
    const line = `${input.subjectId}: ${rest.images.length} Bild(er) [${rest.images.map((i) => i.source ?? 'fehlt').join(', ')}], Tafelbild ${rest.board ? 'ja' : 'NEIN'}, ${Math.round((Date.now() - t) / 1000)} s`
    console.log(line)
    summary.push(line)
  } catch (e) {
    const line = `${input.subjectId}: FEHLER ${e.message.split('\n')[0]}`
    console.log(line)
    summary.push(line)
  }
}

async function runVocab(input) {
  try {
    const res = await page.evaluate((i) => window.__selftest.vocab(i), { ...input, words: input.words.map(([term, translation]) => ({ term, translation })) })
    res.words = res.words.map((w, k) => ({ ...w, thumb: saveThumb(`vokabel-${input.targetLanguage}-${k + 1}-${w.term.replace(/[^a-z]/gi, '')}`, w.thumb) }))
    writeFileSync(join(out, `vokabeln-${input.targetLanguage}.json`), JSON.stringify(res, null, 1))
    const line = `vokabeln ${input.targetLanguage}: ${res.words.map((w) => `${w.term}=${w.depictable ? (w.source ?? 'fehlt') : 'nicht darstellbar'}`).join('; ')}`
    console.log(line)
    summary.push(line)
  } catch (e) {
    const line = `vokabeln ${input.targetLanguage}: FEHLER ${e.message.split('\n')[0]}`
    console.log(line)
    summary.push(line)
  }
}

try {
  const subjects = SUBJECTS.filter((s) => !only || only.includes(s.subjectId))
  if (!only || only.includes('vokabeln')) for (const v of VOCAB) await runVocab(v)
  // Drei Fächer gleichzeitig (die KI-Programme laufen höchstens dreifach parallel)
  for (let i = 0; i < subjects.length; i += 3) await Promise.all(subjects.slice(i, i + 3).map(runWorksheet))
} finally {
  writeFileSync(join(out, 'zusammenfassung.txt'), [...summary, '', `Konsolenfehler: ${errors.length ? errors.slice(0, 5).join(' | ') : 'keine'}`].join('\n'))
  console.log('Konsolenfehler:', errors.length ? errors.slice(0, 5) : 'keine')
  await app.close()
}
