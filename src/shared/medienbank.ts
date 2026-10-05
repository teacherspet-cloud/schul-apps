/**
 * Medienbank der Vokabeln (05.10.2026, Wunsch der Lehrkraft): Beispielbild, Aussprache des Wortes und
 * Aussprache des Beispielsatzes – EINMAL je Sprache und Wort, für alle Lehrwerke, Listen und Lernenden.
 *
 * „Auf Knopfdruck durch einen Admin soll die eingestellte KI nach geeigneten Beispielbildern suchen; das
 * geeignetste kommt in die Datenbank. Ein Klick aufs Bild öffnet ein Pop-up: löschen, ein anderes gefundenes
 * wählen oder eines von der KI erzeugen lassen." Dazu die Aussprache von einer hinterlegten Sprach-KI
 * (ElevenLabs) mit einer Standardstimme je Sprache; die Lernenden hören sie statt der Windows-Stimme.
 *
 * Ablage: am Server einmal für alle (<DATEN>/medienbank), in der Exe im eigenen Ordner. Bearbeiten dürfen
 * am Server nur Admins (server/freigaben.ts ADMIN_KANAELE); lesen alle Lehrkräfte und Lernenden.
 */

/** Ein Bild zur Auswahl (Treffer der Bildsuche) */
export interface MedienKandidat {
  url: string
  vorschau: string
  titel: string
  urheber: string
  lizenz: string
  quelle: string
}

export interface MedienBild {
  /** Dateiname in der Medienbank (zufällig, nie erratbar) */
  datei: string
  /** Woher: Bildsuche (Lizenzangabe) oder KI-erzeugt */
  herkunft: 'suche' | 'ki'
  /** Bildnachweis wie im Arbeitsblatt („Titel – Urheber, Lizenz, Quelle" bzw. „KI-generiert") */
  nachweis: string
  /** Weitere gefundene Bilder zum Umwählen */
  kandidaten?: MedienKandidat[]
  zeit: number
}

export interface MedienTon {
  datei: string
  /** Stimme (ElevenLabs-/OpenAI-Kennung) */
  stimme: string
  /** Gesprochener Text – ändert sich das Wort/der Satz, passt der Ton nicht mehr */
  text: string
  zeit: number
}

export interface MedienEintrag {
  bild?: MedienBild
  ton?: MedienTon
  /** Aussprache von Beispielsätzen, je Satz (Schlüssel: satzSchluessel) */
  saetze?: Record<string, MedienTon>
}

/** Was die Oberfläche je Wort bekommt: Bilder gleich als data-URL, Töne über ihre Datei */
export interface MedienSicht {
  bild?: Omit<MedienBild, 'datei'> & { datei: string; dataUrl?: string; url?: string }
  ton?: MedienTon & { url?: string }
  saetze?: Record<string, MedienTon & { url?: string }>
}

export type TonArt = 'wort' | 'satz'

/** Sprachcode vereinheitlichen: „en-GB" → „en" */
export const sprachKurz = (s: string): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
    .slice(0, 8) || 'xx'

/** Wort vergleichbar machen: ohne Artikel-Klammern und Satzzeichen am Rand, klein, Leerraum zusammengefasst */
export const wortNormiert = (w: string): string =>
  String(w ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?¡¿"'„“”‚‘’()[\]]+|[\s.,;:!?¡¿"'„“”‚‘’()[\]]+$/g, '')
    .trim()
    .slice(0, 160)

export const medienSchluessel = (sprache: string, wort: string): string => `${sprachKurz(sprache)}:${wortNormiert(wort)}`

/** Schlüssel eines Beispielsatzes: normierter Wortlaut (Satzzeichen innen bleiben – sie klingen mit) */
export const satzSchluessel = (satz: string): string =>
  String(satz ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600)

/** Ist ein ganzer Satz (nicht nur eine Wendung)? – nur dann gibt es eine Satz-Aussprache */
export const istGanzerSatz = (t: string | undefined): boolean => {
  const s = String(t ?? '').trim()
  return s.split(/\s+/).length >= 3 && /[.!?…]["'”’)]*$/.test(s)
}

/** Dateinamen der Medienbank: nur Hex mit Endung */
export const MEDIEN_DATEI = /^[a-f0-9]{24}\.(jpg|png|webp|mp3)$/
