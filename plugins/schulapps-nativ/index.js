import { registerPlugin } from '@capacitor/core'

/** PDF aus HTML erzeugen (unsichtbarer WKWebView) und per AirPrint drucken. */
export const PdfDruck = registerPlugin('PdfDruck', {
  web: () => import('./web.js').then((m) => new m.PdfDruckWeb())
})

/** Ein Geheimnis-Eintrag im iOS-Schluesselbund (im Browser: localStorage). */
export const Schluesselbund = registerPlugin('Schluesselbund', {
  web: () => import('./web.js').then((m) => new m.SchluesselbundWeb())
})

/** Dokumentenscanner von VisionKit (im Browser: leere Liste). */
export const Scanner = registerPlugin('Scanner', {
  web: () => import('./web.js').then((m) => new m.ScannerWeb())
})

/** Hintergrundzeit fuer laufende KI-Auftraege (UIApplication.beginBackgroundTask; im Browser: nichts). */
export const Hintergrund = registerPlugin('Hintergrund', {
  web: () => import('./web.js').then((m) => new m.HintergrundWeb())
})
