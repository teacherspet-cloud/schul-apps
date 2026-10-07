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

/**
 * Aussprache in zwei Fassungen (07.10.2026, Wunsch der Lehrkraft): weiblich (w) und männlich (m). Die bisherigen
 * Felder `ton`/`saetze` sind die weibliche Fassung – so bleiben ältere Einträge gültig; die männliche steht in
 * `tonM`/`saetzeM`. Lernende wählen ihre Fassung, fehlt sie, gilt die andere.
 */
export type Stimmlage = 'w' | 'm'
export const STIMMLAGEN: Stimmlage[] = ['w', 'm']
export const STIMMLAGE_NAME: Record<Stimmlage, string> = { w: 'weiblich', m: 'männlich' }
/** Standardstimmen einer Sprache */
export type Stimmen = Partial<Record<Stimmlage, string>>

export interface MedienEintrag {
  bild?: MedienBild
  ton?: MedienTon
  /** Aussprache von Beispielsätzen, je Satz (Schlüssel: satzSchluessel) */
  saetze?: Record<string, MedienTon>
  /** Männliche Fassung */
  tonM?: MedienTon
  saetzeM?: Record<string, MedienTon>
}

type TonSicht = MedienTon & { url?: string }

/** Was die Oberfläche je Wort bekommt: Bilder gleich als data-URL, Töne über ihre Datei */
export interface MedienSicht {
  bild?: Omit<MedienBild, 'datei'> & { datei: string; dataUrl?: string; url?: string }
  ton?: TonSicht
  saetze?: Record<string, TonSicht>
  tonM?: TonSicht
  saetzeM?: Record<string, TonSicht>
}

/** Ton bzw. Sätze einer Fassung */
export const tonVon = <T extends MedienTon>(e: { ton?: T; tonM?: T } | undefined, lage: Stimmlage): T | undefined => (lage === 'm' ? e?.tonM : e?.ton)
export const saetzeVon = <T extends MedienTon>(
  e: { saetze?: Record<string, T>; saetzeM?: Record<string, T> } | undefined,
  lage: Stimmlage
): Record<string, T> | undefined => (lage === 'm' ? e?.saetzeM : e?.saetze)

/** Gespeicherte Stimmen lesen – früher eine Kennung je Sprache (sie gilt dann als weibliche Fassung) */
export function stimmenNormiert(roh: unknown): Record<string, Stimmen> {
  const aus: Record<string, Stimmen> = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [sp, w] of Object.entries(roh as Record<string, unknown>)) {
    if (typeof w === 'string' && w) aus[sp] = { w }
    else if (w && typeof w === 'object') {
      const s: Stimmen = {}
      for (const l of STIMMLAGEN) {
        const id = (w as Record<string, unknown>)[l]
        if (typeof id === 'string' && id) s[l] = id
      }
      if (s.w || s.m) aus[sp] = s
    }
  }
  return aus
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
