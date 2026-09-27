/**
 * Hineingezogene Unterlagen aus dem Unterricht – Tafelbilder, Buchseiten, Hefteinträge,
 * Arbeitsblätter – als Beleg dafür, was behandelt wurde.
 *
 * Entstanden in der Lernzielkontrolle; seit 25.09.2026 nimmt auch die Klassenarbeit solche
 * Dateien an (Wunsch der Lehrkraft: „Material-Dateien annehmen wie in der LZK"). Damit beide
 * Programme dieselbe Form speichern und dieselbe Liste zeigen, steht der Typ hier.
 */
import type { ExtractedContent } from './extractContent'

export interface StoffQuelle {
  id: string
  fileName: string
  kind: 'pdf' | 'docx' | 'image' | 'text' | 'web' | 'video'
  /** Internetadresse, wenn die Unterlage von dort stammt (Webseite oder Video) */
  url?: string
  /** Der ausgelesene Text; bei einem reinen Tafelbild leer */
  text: string
  /**
   * Seiten als Bilder – bei Fotos das Bild selbst, bei gescannten PDFs die Seiten.
   * Sie gehen als Bild an die KI, damit sie auch handschriftliche Tafelbilder lesen kann.
   */
  bilder: string[]
  /** Wird diese Quelle der KI mitgegeben? */
  aktiv: boolean
  /**
   * Vollständige Quellenangabe (Urheber, Titel, Publikationsort, Datum, Fundort, Abrufdatum),
   * für Material FÜR die Arbeit von der KI aus Text und Adresse ermittelt (27.09.2026).
   */
  quellenangabe?: string
}

/** Aus einer gelesenen Datei eine Unterlage machen. */
export const stoffQuelleAus = (c: ExtractedContent, id: string): StoffQuelle => ({
  id,
  fileName: c.fileName,
  kind: c.kind,
  ...(c.url ? { url: c.url } : {}),
  text: c.text,
  bilder: c.pageImages,
  aktiv: true
})

/**
 * Die Seitenbilder der eingeschalteten Unterlagen für die Bildanalyse der KI.
 *
 * Höchstens drei je Datei und `hoechstens` insgesamt: Jedes Bild geht mit JEDER Anfrage mit –
 * bei einer Klassenarbeit also je Teil und je Fassung. Die Grenze ist eine Faustregel, die
 * Anfragen klein und das Kontingent der Lehrkraft schont; drei Seiten zeigen bei Tafelbildern
 * und Buchseiten in aller Regel, was behandelt wurde.
 */
export function stoffBilder(quellen: StoffQuelle[] | undefined, hoechstens = 6): string[] {
  return (quellen ?? [])
    .filter((q) => q.aktiv)
    .flatMap((q) => q.bilder.slice(0, 3))
    .slice(0, hoechstens)
}
