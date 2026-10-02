// Sichtprüfung der echten Mindmap im Vokabeltest (02.10.2026): beide Formen ohne KI, Wegwerf-Profil.
// Aufruf (vorher: npm run build): node tests/e2e/mindmap.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'
const out = process.argv[2]; mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-mindmap-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('FEHLER', e.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForTimeout(600)
  for (const [v, frei] of [['oberbegriffe', true], ['offen', false]]) {
    await page.evaluate(([v, f]) => window.__selftest.vtMindmap(v, f), [v, frei])
    await page.waitForTimeout(2000)
    await page.screenshot({ path: join(out, `mindmap-${v}.png`) })
  }
} finally {
  await app.close().catch(() => {})
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
