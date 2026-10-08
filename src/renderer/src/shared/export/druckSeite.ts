/**
 * Drucken im Browser eines Tablets oder Telefons (08.10.2026).
 *
 * Meldung der Lehrkraft (iPad, Zugangszettel/Codekarten): Nach der Druckvorschau kam nur „Als PDF
 * sichern" – drucken ließ sich nicht, einen Drucker konnte man nicht wählen. Ursache: Im Browser öffnet
 * „Druckansicht öffnen …" das fertige PDF in einem neuen Tab (netzZugang.ts `druckeImBrowser`). Safari
 * auf iPad und iPhone zeigt ein PDF aus einem Blob aber nur zum Laden bzw. Sichern an, Chrome unter
 * Android lädt es gleich herunter – einen Druckknopf gibt es dort nicht.
 *
 * Jetzt bekommt der neue Tab auf diesen Geräten eine DRUCKSEITE: die Seiten des PDFs als Bilder (mit
 * pdf.js gerendert, also genau so, wie der Server sie gesetzt hat – Safari setzt das HTML beim Drucken
 * anders), dazu „Drucken …" (window.print → Druckdialog des Geräts, auf dem iPad AirPrint mit Druckerwahl,
 * Exemplaren und Doppelseitig) und „Als PDF sichern" als Rückfall. Der Druckdialog öffnet sich gleich von
 * selbst, sobald die Seiten geladen sind; der Knopf bleibt für den zweiten Versuch.
 *
 * Querformat-Seiten werden gedreht auf eine Hochformat-Seite gelegt – auf Papier ist das dasselbe, und die
 * Druckseite braucht so nur EIN Seitenformat (Safari kennt `@page size` je Seite nicht).
 *
 * Die App am PC, die Exe „Schul-Apps Online" und die iPad-App drucken anders und sind nicht betroffen.
 */
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/**
 * Tablet oder Telefon im Browser, das ein PDF im Tab nicht selbst drucken kann: iPad/iPhone (Safari und
 * alle anderen Browser dort – alle WebKit) und Android. iPadOS meldet sich als „MacIntel" mit Touch.
 */
export function mobilerBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod|Android/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

/** Schärfe der Druckbilder: A4 (595 pt) × 2,5 ≈ 1490 px Breite, rund 180 dpi – scharf genug für Text */
const DRUCK_MASSSTAB = 2.5

/** Seiten eines PDFs als Hochformat-JPEGs (Querformat gedreht) – für die Druckseite */
export async function druckBilder(daten: Uint8Array): Promise<string[]> {
  const aufgabe = pdfjs.getDocument({ data: daten.slice() })
  const pdf = await aufgabe.promise
  const bilder: string[] = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const seite = await pdf.getPage(p)
      const grund = seite.getViewport({ scale: 1 })
      const quer = grund.width > grund.height
      const viewport = seite.getViewport({ scale: DRUCK_MASSSTAB, rotation: (seite.rotate + (quer ? 90 : 0)) % 360 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Weißer Grund – JPEG kennt keine Transparenz
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await seite.render({ canvas, viewport }).promise
      bilder.push(canvas.toDataURL('image/jpeg', 0.92))
      // Speicher sofort freigeben (iOS begrenzt Canvas-Speicher streng)
      canvas.width = 0
      canvas.height = 0
      seite.cleanup()
    }
  } finally {
    await aufgabe.destroy()
  }
  return bilder
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Das HTML der Druckseite (ohne Skript – die Knöpfe verdrahtet `zeigeDruckSeite`) */
export function druckSeiteHtml(bilder: string[], titel: string, pdfUrl: string, dateiname: string): string {
  const seiten = bilder.map((src, i) => `<div class="seite"><img src="${src}" alt="Seite ${i + 1}"></div>`).join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titel)}</title><style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; background: #e9ecef; font-family: -apple-system, system-ui, "Segoe UI", sans-serif; color: #111; }
.leiste { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; justify-content: center; padding: 12px 16px; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.15); }
.leiste button, .leiste a { font: 600 17px -apple-system, system-ui, sans-serif; padding: 11px 20px; border-radius: 10px; border: 0; cursor: pointer; text-decoration: none; touch-action: manipulation; }
#drucken { background: #1c7ed6; color: #fff; }
#pdf { background: #f1f3f5; color: #1c3d5a; }
.hinweis { flex-basis: 100%; text-align: center; font-size: 13px; color: #555; }
.seite { margin: 16px auto; width: min(800px, calc(100vw - 32px)); background: #fff; box-shadow: 0 3px 16px rgba(0,0,0,.18); }
.seite img { display: block; width: 100%; height: auto; }
@media print {
  .leiste { display: none; }
  html, body { background: #fff; }
  .seite { margin: 0 auto; width: 100%; box-shadow: none; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
  .seite:last-child { break-after: auto; page-break-after: auto; }
  .seite img { width: 100%; height: auto; max-height: 100vh; object-fit: contain; margin: 0 auto; }
}
</style></head><body>
<div class="leiste"><button id="drucken" type="button">Drucken …</button><a id="pdf" href="${esc(pdfUrl)}" download="${esc(dateiname)}">Als PDF sichern</a>
<div class="hinweis">Im Druckdialog lassen sich Drucker, Exemplare, Seiten und Doppelseitig wählen.</div></div>
${seiten}
</body></html>`
}

/**
 * Die Druckseite in den (schon offenen) Tab schreiben und den Druckdialog öffnen. `tab` ist ein
 * leerer Tab derselben Herkunft (window.open('') beim Klick), `pdfUrl` die Blob-Adresse des PDFs.
 */
export async function zeigeDruckSeite(tab: Window, pdf: Uint8Array, titel: string, pdfUrl: string, dateiname: string): Promise<void> {
  const bilder = await druckBilder(pdf)
  const doc = tab.document
  doc.open()
  doc.write(druckSeiteHtml(bilder, titel, pdfUrl, dateiname))
  doc.close()
  const drucken = (): void => {
    try {
      tab.focus()
      tab.print()
    } catch {
      // Knopf bleibt – dann eben von Hand
    }
  }
  doc.getElementById('drucken')?.addEventListener('click', drucken)
  // Erst drucken, wenn alle Seitenbilder da sind – sonst druckt Safari leere Seiten
  await Promise.all(
    Array.from(doc.images).map((b) =>
      b.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            b.addEventListener('load', () => r())
            b.addEventListener('error', () => r())
          })
    )
  )
  setTimeout(drucken, 300)
}
