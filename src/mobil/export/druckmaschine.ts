/**
 * PDF und Drucken auf dem iPad – über das native Plugin PdfDruck (plugins/schulapps-nativ).
 *
 * Am PC druckt ein unsichtbares Electron-Fenster (main/services/export/pdf.ts). Auf dem iPad lädt
 * das Plugin das HTML in einen unsichtbaren WKWebView, wartet auf Schriften und Bilder, misst bei
 * Bedarf (Messskript aus fillablePdf.ts) und erzeugt das PDF. Alles Weitere – Formularfelder,
 * Hörtexte, Metadaten, Signatur – macht danach derselbe Code wie am PC (main/kanaele.ts).
 *
 * Im Browser (dev:mobil) gibt es das Plugin nicht: Dann druckt der Browser selbst, und ein PDF
 * gibt es nicht – mit einer Meldung, die das sagt.
 */
import type { Druckmaschine } from '../../main/kanaele'
import { ausBase64 } from '../base64'
import { PdfDruck } from '../plugins'

export const KEIN_PDF_IM_BROWSER = 'PDF-Dateien entstehen nur in der iPad-App. Im Browser geht nur „Drucken“ (dort auch „Als PDF sichern“).'

/** Im Browser: das HTML in einem unsichtbaren Rahmen laden und dessen Druckdialog öffnen */
function druckeImRahmen(html: string): Promise<void> {
  return new Promise((fertig) => {
    const rahmen = document.createElement('iframe')
    rahmen.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10px;top:-10px'
    rahmen.srcdoc = html
    rahmen.onload = () => {
      try {
        rahmen.contentWindow?.focus()
        rahmen.contentWindow?.print()
      } finally {
        setTimeout(() => {
          rahmen.remove()
          fertig()
        }, 1000)
      }
    }
    document.body.appendChild(rahmen)
  })
}

export const druckmaschine: Druckmaschine = {
  async pdf(html) {
    if (!PdfDruck.verfuegbar()) throw new Error(KEIN_PDF_IM_BROWSER)
    const { pdf } = await PdfDruck.erzeugen({ html })
    return ausBase64(pdf)
  },
  async messenUndPdf(html, skript) {
    if (!PdfDruck.verfuegbar()) throw new Error(KEIN_PDF_IM_BROWSER)
    const { pdf, messung } = await PdfDruck.erzeugen({ html, messen: skript })
    let gemessen: unknown = null
    try {
      gemessen = typeof messung === 'string' ? JSON.parse(messung) : messung ?? null
    } catch {
      gemessen = null
    }
    return { pdf: ausBase64(pdf), messung: gemessen }
  },
  async drucken(html) {
    // Druckerwahl, Exemplare und Seiten stellt AirPrint selbst ein – die Optionen des PCs entfallen
    if (!PdfDruck.verfuegbar()) return druckeImRahmen(html)
    const { pdf } = await PdfDruck.erzeugen({ html })
    await PdfDruck.drucken({ pdf, name: 'Schul-Apps' })
  },
  async drucker() {
    return []
  }
}
