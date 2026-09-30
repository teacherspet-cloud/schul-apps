// Sicherer Bereich in der iPad-/iPhone-App (30.09.2026): Statusleiste, Kamera-Aussparung und App-Wechsel-Balken
// verdecken nichts mehr (src/mobil/sicherBereich.css).
//
// Vorher: npm run build:mobil
// Aufruf: node tests/e2e/mobil-sicherbereich.mjs <Ausgabeordner>
//
// Im Browser sind die Werte von env(safe-area-inset-*) 0 – die Prüfung setzt deshalb die Variablen
// der Datei (--sicher-oben …) wie auf einem iPad bzw. iPhone quer und färbt die verdeckten Streifen
// halbdurchsichtig rot ein. Die Bildschirmfotos zeigen, dass dort nur Hintergrund liegt.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { createServer } from 'http'
import { existsSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'
const wurzel = resolve('out/mobil')
const out = resolve(process.argv[2] ?? 'test-results/mobil-sicherbereich')
mkdirSync(out, { recursive: true })
const probleme = []
const pruefe = (ok, text) => {
  if (!ok) probleme.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const browser = await chromium.launch({ channel: 'msedge' })
for (const [name, w, h, oben, unten, links] of [['ipad', 1180, 820, 24, 20, 0], ['iphone', 844, 390, 0, 21, 47]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  await spaeter.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  await page.evaluate(([o, u, l]) => {
    const r = document.documentElement.style
    r.setProperty('--sicher-oben', `${o}px`)
    r.setProperty('--sicher-unten', `${u}px`)
    r.setProperty('--sicher-links', `${l}px`)
    // Statusleiste und Balken sichtbar machen (halbdurchsichtig rot)
    for (const [css] of [[`top:0;left:0;right:0;height:${o}px`], [`bottom:0;left:0;right:0;height:${u}px`], [`top:0;bottom:0;left:0;width:${l}px`]]) {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;${css};background:rgba(255,0,0,.35);z-index:99999;pointer-events:none`
      document.body.appendChild(d)
    }
  }, [oben, unten, links])
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, `sicher-${name}-start.png`) })
  const r = await page.evaluate(() => {
    const nav = document.querySelector('.mantine-AppShell-navbar')?.getBoundingClientRect()
    const main = document.querySelector('.mantine-AppShell-main')
    const erstes = main?.firstElementChild?.getBoundingClientRect()
    return { navTop: nav?.top, navBottom: nav?.bottom, navLeft: nav?.left, mainPadTop: main && getComputedStyle(main).paddingTop, mainPadBottom: main && getComputedStyle(main).paddingBottom, inhaltTop: erstes?.top, hoehe: innerHeight }
  })
  pruefe(r.navTop === oben && r.navLeft === links, `${name}: Seitenleiste beginnt unter der Statusleiste bzw. neben der Aussparung (${r.navTop}/${r.navLeft})`)
  pruefe(r.navBottom === r.hoehe - unten, `${name}: Seitenleiste endet über dem App-Wechsel-Balken (${r.navBottom} von ${r.hoehe})`)
  pruefe(r.mainPadTop === `${oben}px` && r.mainPadBottom === `${unten}px`, `${name}: Inhalt rückt oben und unten ab (${r.mainPadTop}/${r.mainPadBottom})`)
  await page.getByRole('button', { name: /Einstellungen/ }).filter({ visible: true }).first().click().catch(() => undefined)
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, `sicher-${name}-einstellungen.png`) })
  await page.close()
}
// Ohne Aussparungen (Browser, PC-Größe): alles wie bisher
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
  const r = await page.evaluate(() => ({
    navTop: document.querySelector('.mantine-AppShell-navbar')?.getBoundingClientRect().top,
    pad: getComputedStyle(document.querySelector('.mantine-AppShell-main')).paddingTop
  }))
  pruefe(r.navTop === 0 && r.pad === '0px', `ohne Aussparungen unverändert (${r.navTop}/${r.pad})`)
}
await browser.close()
server.close()
if (probleme.length) {
  console.log(`\n${probleme.length} Problem(e)`)
  process.exit(1)
}
console.log('\nSicherer Bereich: nichts verdeckt.')
