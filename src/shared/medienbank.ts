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

/**
 * Bildstufen (07.10.2026, abgestimmt mit der Lehrkraft nach Recherche): je Wort ein Bild je Altersstufe. Mit dem Alter
 * steigt der Realismus, nicht der Detailgrad (Mayer, Kohärenz; Sundararajan & Adesope 2020); echte Proportionen in
 * jeder Stufe (Ganea u. a. 2008); Jugendliche bevorzugen Fotos/realistische Bilder; Abstrakta erst ab Kl. 7 als
 * typische Szene (Farley u. a. 2012), sonst kein Bild (mehrdeutige Bilder schaden, Boers u. a. 2009).
 * Das bisherige Feld `bild` ist die Stufe 5–6 (Bestand); die übrigen stehen in `bildStufen`.
 */
export type Bildstufe = 's1' | 's2' | 's3' | 's4'
export const BILDSTUFEN: Bildstufe[] = ['s1', 's2', 's3', 's4']
export const istStufe = (s: unknown): s is Bildstufe => BILDSTUFEN.includes(s as Bildstufe)
export const BILDSTUFE_NAME: Record<Bildstufe, string> = { s1: 'Kl. 1–4', s2: 'Kl. 5–6', s3: 'Kl. 7–10', s4: 'Kl. 11–13' }
/** Stufe zur Klasse; unbekannt = Stufe 5–6 (wie der Bestand) */
export const stufeVon = (klasse?: number | null): Bildstufe =>
  !klasse ? 's2' : klasse <= 4 ? 's1' : klasse <= 6 ? 's2' : klasse <= 10 ? 's3' : 's4'
/** Die nächstliegenden Stufen, wenn die eigene fehlt (gleich weit: zuerst die ältere – kindlicher wirkt eher störend) */
export const stufenReihe = (s: Bildstufe): Bildstufe[] => {
  const i = BILDSTUFEN.indexOf(s)
  return [...BILDSTUFEN].sort((a, b) => Math.abs(BILDSTUFEN.indexOf(a) - i) - Math.abs(BILDSTUFEN.indexOf(b) - i) || BILDSTUFEN.indexOf(b) - BILDSTUFEN.indexOf(a))
}
/** Bild genau dieser Stufe */
export const bildDerStufe = <B>(e: { bild?: B; bildStufen?: Partial<Record<Bildstufe, B>> } | undefined, s: Bildstufe): B | undefined =>
  s === 's2' ? e?.bild : e?.bildStufen?.[s]

export interface MedienEintrag {
  bild?: MedienBild
  /** Bilder der Stufen 1–4, 7–10 und 11–13 (Stufe 5–6 = `bild`) */
  bildStufen?: Partial<Record<Bildstufe, MedienBild>>
  /** Stufen, für die die KI kein eindeutiges Bild sieht (abstrakte Wörter) – werden nicht erneut versucht */
  ohneBild?: Bildstufe[]
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
  /** Bild der angefragten Stufe – fehlt es, das der nächstliegenden (dann steht deren Stufe in `bildStufe`) */
  bild?: Omit<MedienBild, 'datei'> & { datei: string; dataUrl?: string; url?: string }
  /** Stufe des gezeigten Bildes */
  bildStufe?: Bildstufe
  /** Stufen mit eigenem Bild bzw. ohne eindeutiges Bild (für die Lehrkraft) */
  bildStufenDa?: Bildstufe[]
  ohneBild?: Bildstufe[]
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
