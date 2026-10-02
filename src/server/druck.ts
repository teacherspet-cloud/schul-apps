/**
 * PDF auf dem Server (02.10.2026): Chromium über playwright-core statt Electrons printToPDF.
 *
 * Gleiche Einstellungen wie am PC (main/services/export/pdf.ts): A4, Hintergründe, Seitengröße
 * aus dem CSS. EIN Browser für alle, Aufträge nacheinander – der VPS hat wenig Arbeitsspeicher
 * (Proof of Concept). Nach 5 Minuten ohne Auftrag wird der Browser beendet.
 *
 * Drucken heißt im Browser: PDF im neuen Tab (renderer/shared/netzZugang.ts `druckeImBrowser`).
 */
import type { Browser } from 'playwright-core'
import type { Druckmaschine } from '../main/kanaele'

let browser: Promise<Browser> | null = null
let schlange: Promise<unknown> = Promise.resolve()
let leerlauf: ReturnType<typeof setTimeout> | null = null

const CHROMIUM = process.env.SCHULAPPS_CHROMIUM || '/usr/bin/chromium'

async function holeBrowser(): Promise<Browser> {
  if (!browser) {
    browser = import('playwright-core').then(({ chromium }) =>
      chromium.launch({
        executablePath: CHROMIUM,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none']
      })
    )
    browser.catch(() => (browser = null))
  }
  return browser
}

function nacheinander<T>(fn: () => Promise<T>): Promise<T> {
  const lauf = schlange.then(fn, fn)
  schlange = lauf.catch(() => undefined)
  return lauf
}

function leerlaufStarten(): void {
  if (leerlauf) clearTimeout(leerlauf)
  leerlauf = setTimeout(() => {
    const b = browser
    browser = null
    void b?.then((x) => x.close()).catch(() => undefined)
  }, 5 * 60_000)
  leerlauf.unref?.()
}

async function mitSeite<T>(html: string, fn: (seite: import('playwright-core').Page) => Promise<T>): Promise<T> {
  return nacheinander(async () => {
    const b = await holeBrowser()
    const kontext = await b.newContext({ javaScriptEnabled: true })
    try {
      const seite = await kontext.newPage()
      // Kein Zugriff aus dem Druck heraus ins Netz – alles Nötige steckt im HTML (data:-Adressen)
      await seite.route(/^https?:\/\//, (r) => r.abort())
      await seite.setContent(html, { waitUntil: 'load', timeout: 60_000 })
      await seite.evaluate(() => document.fonts?.ready).catch(() => undefined)
      return await fn(seite)
    } finally {
      await kontext.close().catch(() => undefined)
      leerlaufStarten()
    }
  })
}

const PDF = { format: 'A4' as const, printBackground: true, preferCSSPageSize: true }

export const serverDruck: Druckmaschine = {
  pdf: (html) => mitSeite(html, async (s) => new Uint8Array(await s.pdf(PDF))),
  messenUndPdf: (html, skript) =>
    mitSeite(html, async (s) => {
      // Das Messskript ist ein Ausdruck (wie executeJavaScript am PC)
      const messung = await s.evaluate((code) => (0, eval)(code), skript)
      return { pdf: new Uint8Array(await s.pdf(PDF)), messung }
    }),
  drucken: async () => {
    throw new Error('Gedruckt wird auf dem Gerät: Die Druckansicht öffnet sich als PDF im Browser.')
  },
  drucker: async () => []
}

export async function druckBeenden(): Promise<void> {
  const b = browser
  browser = null
  await b?.then((x) => x.close()).catch(() => undefined)
}

/**
 * Seiten eines freigegebenen Arbeitsblatts MIT den Stift-Einträgen als Bilder (Etappe 5): Die
 * Stift-Ebene allein sagt der KI wenig – erst über dem Blatt sieht sie, was wohin geschrieben ist.
 * Nur Seiten mit Tinte; JPEG, damit die Anfrage klein bleibt.
 */
export async function seitenMitTinte(html: string, tinte: Record<string, string>): Promise<string[]> {
  const seiten = Object.keys(tinte)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b)
  if (!seiten.length) return []
  return mitSeite(html, async (s) => {
    await s.setViewportSize({ width: 900, height: 1300 })
    await s.evaluate((t) => {
      const alle = [...document.querySelectorAll<HTMLElement>('.ws-page')]
      for (const [k, url] of Object.entries(t)) {
        const seite = alle[Number(k)]
        if (!seite) continue
        if (getComputedStyle(seite).position === 'static') seite.style.position = 'relative'
        const bild = document.createElement('img')
        bild.src = url
        bild.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:50'
        seite.appendChild(bild)
      }
    }, tinte)
    await s.waitForTimeout(100)
    const bilder: string[] = []
    for (const n of seiten) {
      const el = s.locator('.ws-page').nth(n)
      if (!(await el.count())) continue
      const jpg = await el.screenshot({ type: 'jpeg', quality: 70 })
      bilder.push(`data:image/jpeg;base64,${Buffer.from(jpg).toString('base64')}`)
    }
    return bilder
  })
}
