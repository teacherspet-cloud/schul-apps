/**
 * Anbindung des `.schulpaket` an die Ablagen der Programme (Großprogramm 0.4, F8).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { pruefeAudioName } from '../audio/elevenlabs'
import { ABLAGEN } from '../storage/dokumente'
import { getExam, saveExam } from '../storage/exams'
import { getGrammarTest, saveGrammarTest } from '../storage/grammarTests'
import { getKurztest, saveKurztest } from '../storage/kurztests'
import { getTest, saveTest } from '../storage/vocabTests'
import { getWorksheet, saveWorksheet } from '../storage/worksheets'
import { paketBauen, paketEinlesen, paketVorschau, type Ablageweg, type PaketArt, type PaketVorschau } from './paket'

/* eslint-disable @typescript-eslint/no-explicit-any -- die Ablagen haben je eigene Kennzahl-Typen */
const weg = (get: (id: string) => unknown, save: (input: any) => unknown): Ablageweg => ({
  get: (id) => get(id) as Record<string, unknown>,
  save: (input) => save(input) as { id: string }
})

export const WEGE: Record<PaketArt, Ablageweg> = {
  arbeitsblatt: weg(getWorksheet, saveWorksheet),
  vokabeltest: weg(getTest, saveTest),
  klassenarbeit: weg(getExam, saveExam),
  lernzielkontrolle: weg(getKurztest, saveKurztest),
  grammatiktest: weg(getGrammarTest, saveGrammarTest),
  rueckmeldung: weg(ABLAGEN.rueckmeldungen.get, ABLAGEN.rueckmeldungen.save),
  elternbrief: weg(ABLAGEN.elternbriefe.get, ABLAGEN.elternbriefe.save)
}

const hoertextPfad = (name: string): string | null => {
  try {
    return pruefeAudioName(name)
  } catch {
    return null
  }
}

export const erstellePaket = (titel: string, auswahl: { art: PaketArt; id: string }[]): Uint8Array => paketBauen(titel, auswahl, WEGE, hoertextPfad)

/** Das zuletzt geöffnete Paket – eingelesen wird nur, was vorher geprüft und angezeigt wurde */
let geoeffnet: Uint8Array | null = null

export function oeffnePaket(pfad: string): PaketVorschau {
  const daten = new Uint8Array(readFileSync(pfad))
  const vorschau = paketVorschau(daten)
  geoeffnet = daten
  return vorschau
}

export function leseGeoeffnetesPaketEin(): { art: PaketArt; id: string; name: string }[] {
  if (!geoeffnet) throw new Error('Es ist kein Schulpaket geöffnet.')
  const daten = geoeffnet
  geoeffnet = null
  return paketEinlesen(daten, WEGE, (name, inhalt) => {
    const pfad = hoertextPfad(name)
    // Vorhandene Hörtexte gleichen Namens bleiben – die Namen sind Prüfsummen des Inhalts
    if (pfad && !existsSync(pfad)) writeFileSync(pfad, inhalt)
  })
}
