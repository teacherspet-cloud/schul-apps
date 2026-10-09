/**
 * Seitenbilder zum Drucken im Browser (08.10.2026, seit 09.10.2026 ohne eigenen Tab).
 *
 * Meldung der Lehrkraft (iPad, Zugangszettel/Codekarten): Ein PDF aus einem Blob zeigt Safari auf iPad und iPhone nur
 * zum Laden bzw. Sichern an, Chrome unter Android lädt es gleich herunter – einen Druckknopf gibt es dort nicht. Deshalb
 * werden die Seiten des PDFs mit pdf.js zu Bildern (genau so, wie der Server sie gesetzt hat – Safari setzt das HTML
 * beim Drucken anders) und über den Druckdialog des Geräts gedruckt (auf dem iPad AirPrint mit Druckerwahl, Exemplaren
 * und Doppelseitig).
 *
 * Bis 08.10.2026 kamen die Bilder in einen neuen Tab; den blockierte der Popup-Blocker (09.10.2026, iPad mit Opera,
 * Schul-PC). Jetzt liegen sie in einem Druckbereich im aktuellen Dokument (druckImDokument.ts) – auf allen Geräten.
 *
 * Querformat-Seiten werden gedreht auf eine Hochformat-Seite gelegt – auf Papier ist das dasselbe, und der Druck
 * braucht so nur EIN Seitenformat (Safari kennt `@page size` je Seite nicht).
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
