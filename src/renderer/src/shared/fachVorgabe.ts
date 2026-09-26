/**
 * Fach für ein neues Material vorgeben (Rest aus Paket 10b, erledigt in Paket 11).
 *
 * Wer in einem Themenbereich „Neu in diesem Bereich" wählt, meint das Fach dieses Bereichs –
 * ein Blatt für „Biologie › Ökologie" soll nicht mit „Englisch" im Formular beginnen, nur weil
 * zuletzt Englisch gewählt war. Die Programme legen ein neues Dokument aber erst an, wenn ihr
 * Formular erscheint (asynchron, nach dem Laden der Länderdaten). Deshalb merkt sich diese
 * Datei die Vorgabe, und jedes Programm holt sie beim Anlegen genau einmal ab.
 *
 * Der Vokabeltest kennt kein Fach, nur die Sprache: Für ihn wird die Sprache als zuletzt
 * gewählte gemerkt – dort liest sein erster Schritt sie ohnehin.
 */
import { FACH_ZU_SPRACHE } from './fachfarben'
import { saveLastChoice } from './lastChoice'

const offen = new Map<string, string>()

export function setzeFachVorgabe(moduleId: string, fachId: string): void {
  if (!fachId) return
  if (moduleId === 'vokabeltest') {
    const sprache = Object.entries(FACH_ZU_SPRACHE).find(([, fach]) => fach === fachId)?.[0]
    if (sprache) saveLastChoice('vokabeltest', { targetLanguage: sprache })
    return
  }
  offen.set(moduleId, fachId)
}

/** Die Vorgabe abholen (danach ist sie weg); null = keine */
export function nimmFachVorgabe(moduleId: string): string | null {
  const fach = offen.get(moduleId) ?? null
  offen.delete(moduleId)
  return fach
}
