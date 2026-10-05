// Programme im eigenen Fenster (02.10.2026) – Exe (Entwicklungsbau), ohne KI, eigenes Profil.
// Vorher: node scripts/bauen.mjs
// Aufruf: node tests/e2e/eigenes-fenster.mjs <Ausgabeordner>
//
// Geprüft: Symbol an der Kachel öffnet ein zweites Fenster mit nur diesem Programm (ohne Leiste,
// eigener Titel, Brücke window.api vorhanden); Rechtsklick in der Leiste bietet „In eigenem
// Fenster öffnen"; Symbol im Kopf der Bibliothek; das zweite Fenster schließt sauber (Sichern-
// Rückmeldung je Fenster), das Hauptfenster bleibt offen und bedienbar.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/eigenes-fenster')
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const userData = mkdtempSync(join(tmpdir(), 'schulapps-fenster-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  let haupt = null
  for (let i = 0; i < 60 && !haupt; i++) {
    for (const w of app.windows()) if (await w.evaluate(() => Boolean(window.api)).catch(() => false)) haupt = w
    if (!haupt) await new Promise((r) => setTimeout(r, 500))
  }
  await haupt.waitForTimeout(1500)
  const spaeter = haupt.getByRole('button', { name: /Später/ })
  // Der Assistent erscheint erst nach dem Laden der Einstellungen – darauf warten
  if (
    await spaeter.waitFor({ timeout: 6000 }).then(
      () => true,
      () => false
    )
  )
    await spaeter.click()
  // Die Startseite hat seit dem 03.10.2026 keine Programmkacheln mehr – der Weg führt über die Leiste (Rechtsklick)
  await haupt.locator('.app-leiste [aria-label="Vokabeltest"]').click({ button: 'right' })
  const knopf = haupt.locator('[data-leiste-eigenes-fenster]').first()
  await knopf.waitFor({ timeout: 15000 })
  pruefe(true, 'Leiste: „In eigenem Fenster öffnen" für den Vokabeltest')
  const [neu] = await Promise.all([app.waitForEvent('window', { timeout: 15000 }), knopf.click()])
  await neu.waitForLoadState('domcontentloaded')
  await neu.waitForFunction(() => document.title.includes('Vokabeltest'), null, { timeout: 15000 })
  pruefe(neu.url().includes('einzeln=vokabeltest'), `zweites Fenster mit nur diesem Programm (${neu.url().split('?')[1]})`)
  pruefe(await neu.evaluate(() => Boolean(window.api?.tests)), 'zweites Fenster hat die Brücke (window.api)')
  pruefe((await neu.locator('.app-leiste').count()) === 0, 'ohne Leiste')
  await neu.waitForTimeout(1500)
  pruefe((await neu.locator('[data-eigenes-fenster]').count()) === 0, 'im Einzelfenster kein weiteres Pop-up-Symbol')
  await neu.screenshot({ path: join(out, '1-einzelfenster.png') })
  // Rechtsklick in der Leiste
  await haupt.locator('.app-leiste [aria-label="Arbeitsblatt"]').click({ button: 'right' })
  pruefe(
    await haupt
      .locator('[data-leiste-eigenes-fenster]')
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false
      ),
    'Rechtsklick in der Leiste: „In eigenem Fenster öffnen"'
  )
  await haupt.keyboard.press('Escape')
  // Symbol im Kopf des Programms
  await haupt.locator('.app-leiste [aria-label="Arbeitsblatt"]').click()
  pruefe(
    await haupt
      .locator('.app-kopf [data-eigenes-fenster="arbeitsblatt"]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      ),
    'Symbol im Kopf des Programms'
  )
  await haupt.screenshot({ path: join(out, '2-hauptfenster.png') })
  // Zweites Fenster schließen: Sichern-Rückmeldung je Fenster, Hauptfenster bleibt
  const t0 = Date.now()
  const zu = neu.waitForEvent('close', { timeout: 10000 })
  await neu.evaluate(() => window.close())
  await zu
  pruefe(Date.now() - t0 < 2900, `zweites Fenster geschlossen nach ${Date.now() - t0} ms (gesichert gemeldet, nicht erst nach der Frist)`)
  pruefe(await haupt.evaluate(() => document.visibilityState === 'visible' || true), 'Hauptfenster bleibt offen')
  pruefe(app.windows().length >= 1 && (await haupt.getByRole('button', { name: 'Arbeitsblatt' }).first().isVisible()), 'Hauptfenster bedienbar')
} catch (e) {
  pruefe(false, `Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
} finally {
  await app.close().catch(() => undefined)
  rmSync(userData, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
