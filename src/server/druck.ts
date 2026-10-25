/**
 * PDF auf dem Server (02.10.2026): Chromium über playwright-core statt Electrons printToPDF.
 *
 * Gleiche Einstellungen wie am PC (main/services/export/pdf.ts): A4, Hintergründe, Seitengröße
 * aus dem CSS. EIN Browser für alle, Aufträge nacheinander – der VPS hat wenig Arbeitsspeicher
 * (Proof of Concept). Nach 5 Minuten ohne Auftrag wird der Browser beendet.
 *
 * Drucken heißt im Browser: Seitenbilder des PDFs im aktuellen Dokument drucken, ohne neuen Tab (renderer/shared/export/druckImDokument.ts).
 */
import { digitalisieren, zusatzLinien } from '../shared/blattDigital'
import { BILD_SEITE, blattBilder } from '../shared/blattBilder'
import { objekteSvg, type BlattObjekt } from '../shared/blattObjekte'
import { materialMitZeilen } from '../renderer/src/modules/onlinetest/materialZeilen'
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

async function mitSeite<T>(html: string, fn: (seite: import('playwright-core').Page) => Promise<T>, skripte = true): Promise<T> {
  return nacheinander(async () => {
    const b = await holeBrowser()
    const kontext = await b.newContext({ javaScriptEnabled: skripte })
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

/**
 * PDF aus HTML, das von den Lernenden kommt (ausgefülltes Arbeitsblatt speichern/drucken,
 * 03.10.2026): ohne Skripte und ohne Netz – nur Darstellung.
 */
export const pdfOhneSkripte = (html: string): Promise<Uint8Array> => mitSeite(html, async (s) => new Uint8Array(await s.pdf(PDF)), false)

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

/**
 * Materialtexte eines freigegebenen Blatts mit Zeilennummern (22.10.2026, KI-Sicherheitsprüfung): vorher schickte das
 * Gerät der Lernenden diesen Text mit (bis 24 000 Zeichen, ungeprüft „verbindlich" in der Anfrage). Jetzt liest der Server
 * ihn selbst aus dem gespeicherten Blatt – dieselbe Funktion wie auf dem Gerät (materialZeilen.ts), ohne Netz.
 */
export async function materialAusBlatt(html: string): Promise<string> {
  return mitSeite(html, async (s) => {
    await s.setViewportSize({ width: 900, height: 1300 })
    await s.evaluate(`(${digitalisieren.toString()})(document)`)
    return String(await s.evaluate(`(${materialMitZeilen.toString()})(document)`))
  })
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
export async function seitenMitTinte(
  html: string,
  tinte: Record<string, string>,
  extra: { objekte?: BlattObjekt[]; zusatz?: Record<string, number>; seiten?: number[] } = {}
): Promise<string[]> {
  // Markierungen auf Bildern (25.10.2026, shared/blattBilder.ts): Tinte „bild:b0" und Objekte auf „Seite" BILD_SEITE + n
  const bildTinte = Object.fromEntries(
    Object.entries(tinte)
      .filter(([k]) => k.startsWith('bild:'))
      .map(([k, v]) => [k.slice(5), v])
  )
  const bildObjekte = (extra.objekte ?? []).filter((o) => o.s >= BILD_SEITE)
  const objekte = (extra.objekte ?? []).filter((o) => o.s < BILD_SEITE)
  let seiten = [
    ...new Set([
      ...Object.keys(tinte)
        .filter((k) => !k.startsWith('bild:'))
        .map(Number),
      ...objekte.map((o) => o.s),
      ...(extra.seiten ?? [])
    ])
  ]
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b)
  if (!seiten.length && !Object.keys(bildTinte).length && !bildObjekte.length) return []
  const bildSvg: Record<string, string> = {}
  for (const n of new Set(bildObjekte.map((o) => o.s)))
    bildSvg[`b${n - BILD_SEITE}`] = objekteSvg(
      bildObjekte.filter((o) => o.s === n),
      1000,
      1000
    )
  return mitSeite(html, async (s) => {
    await s.setViewportSize({ width: 900, height: 1300 })
    // Dieselbe digitale Fassung wie bei den Lernenden (blattDigital.ts) – sonst lägen Stift und Kästchen daneben
    await s.evaluate(`(${digitalisieren.toString()})(document)`)
    if (extra.zusatz && Object.keys(extra.zusatz).length) await s.evaluate(`(${zusatzLinien.toString()})(document, ${JSON.stringify(extra.zusatz)})`)
    // Kästchen, Linien und Punkte der Lernenden je Seite
    const svg: Record<string, string> = {}
    for (const n of seiten) {
      const eigene = objekte.filter((o) => o.s === n)
      if (eigene.length) svg[String(n)] = objekteSvg(eigene, 794, 1)
    }
    await s.evaluate((x) => {
      const alle = [...document.querySelectorAll<HTMLElement>('.ws-page')]
      for (const [k, inhalt] of Object.entries(x)) {
        const seite = alle[Number(k)]
        if (!seite) continue
        if (getComputedStyle(seite).position === 'static') seite.style.position = 'relative'
        seite.insertAdjacentHTML('beforeend', inhalt)
      }
    }, svg)
    // Bilder mit Markierungen: Tinte und Kästchen über das Bild gelegt (Zeichenfläche 1000 px breit, Maßstab = Bildbreite/1000)
    if (Object.keys(bildTinte).length || Object.keys(bildSvg).length) {
      const bildSeiten = await s.evaluate<number[]>(
        `((x) => {
          const bilder = (${blattBilder.toString()})(document)
          const alle = [...document.querySelectorAll('.ws-page')]
          const aus = []
          bilder.forEach((b, i) => {
            const id = 'b' + i
            if (!x.tinte[id] && !x.svg[id]) return
            const seite = alle[b.seite]
            if (!seite) return
            if (getComputedStyle(seite).position === 'static') seite.style.position = 'relative'
            const p = seite.getBoundingClientRect()
            const r = b.el.getBoundingClientRect()
            const k = r.width / 1000
            const h = document.createElement('div')
            h.style.cssText = 'position:absolute;left:' + (r.left - p.left) + 'px;top:' + (r.top - p.top) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;pointer-events:none;z-index:55;overflow:hidden'
            if (x.tinte[id]) {
              const img = document.createElement('img')
              img.src = x.tinte[id]
              img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'
              h.appendChild(img)
            }
            if (x.svg[id]) {
              const w = document.createElement('div')
              w.style.cssText = 'position:absolute;left:0;top:0;width:1000px;height:' + r.height / k + 'px;transform:scale(' + k + ');transform-origin:top left'
              w.innerHTML = x.svg[id]
              h.appendChild(w)
            }
            seite.appendChild(h)
            aus.push(b.seite)
          })
          return aus
        })(${JSON.stringify({ tinte: bildTinte, svg: bildSvg })})`
      )
      seiten = [...new Set([...seiten, ...bildSeiten])].sort((a, b) => a - b)
    }
    await s.evaluate((t) => {
      const alle = [...document.querySelectorAll<HTMLElement>('.ws-page')]
      for (const [k, url] of Object.entries(t)) {
        if (k.startsWith('bild:')) continue
        const seite = alle[Number(k)]
        if (!seite) continue
        if (getComputedStyle(seite).position === 'static') seite.style.position = 'relative'
        const bild = document.createElement('img')
        bild.src = url
        bild.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:50'
        seite.appendChild(bild)
      }
      // Kopf mit Name/Klasse/Datum abdecken – ein dort hingeschriebener Name darf nicht an die KI
      for (const seite of alle) {
        const kopf = seite.querySelector<HTMLElement>('.ws-header')
        if (!kopf) continue
        const p = seite.getBoundingClientRect()
        const r = kopf.getBoundingClientRect()
        const decke = document.createElement('div')
        decke.style.cssText = `position:absolute;left:0;top:${r.top - p.top}px;width:100%;height:${r.height + 4}px;background:#fff;z-index:60`
        seite.appendChild(decke)
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
