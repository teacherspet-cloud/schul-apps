// Räumt auf, was ein abgebrochener Testlauf hinterlassen hat.
// Aufruf: node tests/e2e/aufraeumen.mjs [--loeschen]
// Ohne Schalter wird nur aufgelistet – gelöscht wird erst auf ausdrückliche Ansage.
import { _electron as electron } from 'playwright-core'

const doDelete = process.argv.includes('--loeschen')
const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForSelector('text=Schul-Apps')

const state = await page.evaluate(async () => ({
  sheets: await window.api.sheets.list(),
  exams: await window.api.exams.list(),
  grammarTests: await window.api.grammarTests.list(),
  tests: await window.api.tests.list()
}))

for (const [key, list] of Object.entries(state)) {
  console.log(`\n${key} (${list.length}):`)
  for (const x of list) console.log(`  ${x.id}  ${x.updatedAt}  ${x.name}`)
}

if (doDelete) {
  const ids = JSON.parse(process.env.DELETE_IDS ?? '{}')
  const removed = await page.evaluate(async (targets) => {
    const out = {}
    for (const [key, list] of Object.entries(targets)) {
      const api = { sheets: window.api.sheets, exams: window.api.exams, grammarTests: window.api.grammarTests, tests: window.api.tests }[key]
      out[key] = 0
      for (const id of list ?? []) {
        await api.delete(id)
        out[key]++
      }
    }
    return out
  }, ids)
  console.log('\nGelöscht:', removed)
}

await app.close()
