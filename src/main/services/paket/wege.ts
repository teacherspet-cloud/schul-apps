/**
 * Anbindung des `.schulpaket` an die Ablagen der Programme (Großprogramm 0.4, F8).
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DesignTemplate } from '@shared/design'
import { pruefeAudioName } from '../audio/elevenlabs'
import { ABLAGEN } from '../storage/dokumente'
import { listDesigns, saveDesign } from '../storage/designs'
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
  elternbrief: weg(ABLAGEN.elternbriefe.get, ABLAGEN.elternbriefe.save),
  tafelbild: weg(ABLAGEN.tafelbilder.get, ABLAGEN.tafelbilder.save)
}

const hoertextPfad = (name: string): string | null => {
  try {
    return pruefeAudioName(name)
  } catch {
    return null
  }
}

const maskottchenOrdner = (id: string): string => join(app.getPath('userData'), 'maskottchen', id.replace(/[^a-z0-9-]/gi, ''))

/** Dateien eines eigenen Maskottchens – mitgelieferte Figuren haben keinen Ordner im Profil */
function maskottchenDateien(id: string): Record<string, Uint8Array> | null {
  const ordner = maskottchenOrdner(id)
  if (!existsSync(join(ordner, 'figur.json'))) return null
  const dateien: Record<string, Uint8Array> = {}
  for (const f of readdirSync(ordner)) if (f === 'figur.json' || f.endsWith('.png')) dateien[f] = new Uint8Array(readFileSync(join(ordner, f)))
  return dateien
}

export const erstellePaket = (titel: string, auswahl: { art: PaketArt; id: string }[]): Uint8Array =>
  paketBauen(titel, auswahl, WEGE, hoertextPfad, new Date(), { maskottchenDateien })

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
  return lesePaketEin(daten)
}

/** Ein Paket in die Ablagen einlesen (auch: gemeinsame Fachordner des Servers, 02.10.2026) */
export function lesePaketEin(daten: Uint8Array): { art: PaketArt; id: string; name: string }[] {
  const vorhandeneDesigns = new Set(listDesigns().map((d) => d.id))
  return paketEinlesen(
    daten,
    WEGE,
    (name, inhalt) => {
      const pfad = hoertextPfad(name)
      // Vorhandene Hörtexte gleichen Namens bleiben – die Namen sind Prüfsummen des Inhalts
      if (pfad && !existsSync(pfad)) writeFileSync(pfad, inhalt)
    },
    {
      // Eigene Vorlagen kommen dazu; eine gleichnamige Kennung beim Empfänger bleibt, wie sie ist
      design: (d) => {
        if (vorhandeneDesigns.has(String(d.id))) return
        saveDesign({ ...(d as unknown as DesignTemplate), isDefault: false })
        vorhandeneDesigns.add(String(d.id))
      },
      maskottchen: (id, dateien) => {
        const ordner = maskottchenOrdner(id)
        if (existsSync(join(ordner, 'figur.json'))) return
        mkdirSync(ordner, { recursive: true })
        for (const [name, inhalt] of Object.entries(dateien)) writeFileSync(join(ordner, name), inhalt)
      }
    }
  )
}

/** Beim Start per „Öffnen mit" übergebene Paketdatei (Kommandozeile) – einmal abholbar */
export function paketAusArgumenten(argv: string[]): string | null {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith('.schulpaket') && existsSync(a)) ?? null
}
