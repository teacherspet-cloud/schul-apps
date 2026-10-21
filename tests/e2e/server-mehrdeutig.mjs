// App „Mehrdeutig" (21.10.2026): Wörter aller Bücher mit Bedeutungen und Beispielbildern klären – nur Admins.
//  – Leiste: „Mehrdeutig" unter Organisation; Liste mit Klärungsbedarf, Filter, Suche, Bildstufe.
//  – Je Wort Fundstellen (Buch › Unit) und Bedeutungen; „Bild passt" setzt die Prüfung, der Filter „Geprüft" zeigt sie.
// Vorher: Server lokal MIT Grundbestand der Medienbank (sonst gibt es kaum Bilder), KI-Attrappe.
// Aufruf: node tests/e2e/server-mehrdeutig.mjs <Ausgabeordner> [adresse] [admin] [passwort]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { expertenmodus } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/server-mehrdeutig')
const A = process.argv[3] ?? 'http://localhost:18443'
const admin = { benutzer: process.argv[4] ?? 't.kornahrens', passwort: process.argv[5] ?? 'test-notzugang-123' }
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const da = (l, ms = 15000) =>
  l.waitFor({ timeout: ms }).then(
    () => true,
    () => false
  )

const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
let gepruefteBedeutung = null
try {
  const r = await ctx.request.post(`${A}/auth/lokal`, {
    form: { benutzer: admin.benutzer, passwort: admin.passwort, ziel: '/' },
    headers: { origin: A },
    maxRedirects: 0
  })
  pruefe(r.status() < 400, `Admin angemeldet (${r.status()})`)
  const p = await ctx.newPage()
  await p.goto(A)
  await p.waitForTimeout(2500)
  const sp = p.getByRole('button', { name: 'Später einrichten' })
  if (await sp.isVisible().catch(() => false)) await sp.click()
  await expertenmodus(p)
  await p.locator('.app-leiste [aria-label="Mehrdeutig"]').click()
  pruefe(await da(p.locator('.module-container:not([hidden]) [data-mehrdeutig-wort]').first(), 60000), 'Liste mit Klärungsbedarf erscheint')
  const anzahl = await p.locator('.module-container:not([hidden]) [data-mehrdeutig-anzahl]').innerText()
  pruefe(/mit Klärungsbedarf/.test(anzahl), `Zahl der Wörter (${anzahl})`)
  await p.screenshot({ path: join(out, '1-klaerungsbedarf.png') })
  // Alle Wörter, Suche „bear"
  await p.locator('.module-container:not([hidden]) [data-mehrdeutig-filter]').getByText('Alle Wörter', { exact: true }).click()
  await p.locator('.module-container:not([hidden]) [data-mehrdeutig-suche]').fill('bear')
  await p.waitForTimeout(1500)
  const bear = p.locator('.module-container:not([hidden]) [data-mehrdeutig-wort="en:bear"]')
  pruefe(await da(bear), 'Suche findet „bear"')
  pruefe((await bear.locator('[data-mehrdeutig-fundstellen]').innerText()).includes('›'), 'Fundstellen mit Buch › Unit')
  await p.screenshot({ path: join(out, '2-bear.png') })
  // „Bild passt" an der ersten Bedeutung mit Bild
  const knopf = bear.locator('[data-mehrdeutig-passt]:not([disabled])').first()
  if (await knopf.isVisible().catch(() => false)) {
    gepruefteBedeutung = await knopf.getAttribute('data-mehrdeutig-passt')
    await knopf.click()
    await p.waitForTimeout(1200)
    pruefe((await bear.locator(`[data-mehrdeutig-passt="${gepruefteBedeutung}"]`).innerText()).includes('✓'), '„Bild passt" ist gesetzt')
  } else pruefe(true, '„bear" ohne Bild im Grundbestand – „Bild passt" übersprungen')
  // Bildstufe umschalten
  await p.locator('.module-container:not([hidden]) [data-mehrdeutig-stufe]').getByText('Kl. 11–13', { exact: true }).click()
  await p.waitForTimeout(1200)
  await p.screenshot({ path: join(out, '3-stufe-s4.png') })
  pruefe(true, 'Bildstufe umgeschaltet')
  // Zurücknehmen, damit der Bestand unverändert bleibt
  if (gepruefteBedeutung) {
    await bear.locator(`[data-mehrdeutig-passt="${gepruefteBedeutung}"]`).click()
    await p.waitForTimeout(1000)
    pruefe(!(await bear.locator(`[data-mehrdeutig-passt="${gepruefteBedeutung}"]`).innerText()).includes('✓'), '„Bild passt" zurückgenommen')
  }
} catch (e) {
  problems.push(
    `Ablauf abgebrochen – ${String(e?.message ?? e)
      .split('\n')
      .join(' | ')}`
  )
} finally {
  await browser.close()
}
console.log(problems.length ? `\n${problems.length} Problem(e):\n - ${problems.join('\n - ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
