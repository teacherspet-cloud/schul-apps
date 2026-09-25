// Wache: Eine Quelle, die als PDF vorliegt, wird gelesen (vorher: npm run build).
// Aufruf: node tests/e2e/pdf-quelle.mjs
//
// Verbraucht KEIN KI-Kontingent – geladen wird über die Adressen, die ein früherer Lauf mit
// echter KI gefunden hat.
//
// Nachgemessen am 24.09.2026 bei der Suche nach wissenschaftlichen Quellen zu
// „Antibiotikaresistenz": Ein Sachstandsbericht des Robert-Koch-Instituts fiel mit
// „Die Adresse liefert keinen Text" heraus, weil er ein PDF ist. Gerade in den
// Naturwissenschaften und bei Behördenveröffentlichungen liegt sehr viel so vor – ohne
// PDF-Unterstützung fehlt ein großer Teil des guten Materials.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const PDFS = [
  {
    name: 'Sachstandsbericht des Robert-Koch-Instituts',
    url: 'https://edoc.rki.de/bitstream/handle/176904/11078/JHealthMonit_2023_S3_Antibiotikaresistenz_Sachstandsbericht_Klimawandel_Gesundheit.pdf?isAllowed=y&sequence=1'
  }
]

const userData = mkdtempSync(join(tmpdir(), 'schulapps-pdfquelle-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

for (const pdf of PDFS) {
  const quelle = await page.evaluate(async (url) => {
    const q = await window.__selftest.materialLaden(url)
    return { fehler: q.fehler, wortzahl: q.wortzahl, anfang: q.text.slice(0, 160).replace(/\s+/g, ' ') }
  }, pdf.url)

  console.log(`\n${pdf.name}`)
  if (quelle.fehler) {
    pruefe(false, `Nicht gelesen: ${quelle.fehler}`)
    continue
  }
  console.log(`  ${quelle.wortzahl} Wörter · „${quelle.anfang} …"`)
  pruefe(quelle.wortzahl > 500, `Der PDF-Text kommt an (${quelle.wortzahl} Wörter)`)
  // Die Seitenmarken des Lesers sind fuer die Lehrkraft gedacht, nicht fuer den Quellentext
  pruefe(!quelle.anfang.includes('--- Seite'), 'Die Seitenmarken des Lesers stehen nicht im Text')
}

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nQuellen, die als PDF vorliegen, werden gelesen.')
