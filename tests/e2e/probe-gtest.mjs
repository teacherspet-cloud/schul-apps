// Prüft den KI-Aufruf des Grammatiktests isoliert: Kommt er zurück, und wie lange braucht er?
// Aufruf: node tests/e2e/probe-gtest.mjs
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const live = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-probe-'))
for (const f of ['settings.json', 'secrets.json', 'model-cache.json', 'worksheet-designs.json', 'worksheet-designs-version.json']) {
  const from = join(live, f)
  if (existsSync(from)) copyFileSync(from, join(userData, f))
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
await page.waitForSelector('text=Schul-Apps')

const result = await page.evaluate(async () => {
  const started = Date.now()
  // Ein bewusst winziges Schema: Kommt überhaupt eine Antwort?
  const small = {
    type: 'object',
    properties: { hello: { type: 'string' } },
    required: ['hello'],
    additionalProperties: false
  }
  try {
    const r = await window.api.ai.structured({
      system: 'Du antwortest knapp.',
      user: 'Schreibe das Wort "ok" in das Feld hello.',
      schemaName: 'probe',
      schema: small
    })
    return { ok: true, ms: Date.now() - started, answer: JSON.stringify(r).slice(0, 120) }
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e).slice(0, 300) }
  }
})
console.log('Kleiner Aufruf:', result)

await app.close()
rmSync(userData, { recursive: true, force: true })
