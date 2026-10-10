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
  /**
   * Tatsächlich an die Sprach-KI geschickter Text, wenn er vom Wort abweicht (09.10.2026: Abkürzungen „YA" → „Y. A.",
   * eigene Aussprache der Lehrkraft). Ändert er sich, wird die Aufnahme neu erzeugt. Fehlt = wie `text`.
   */
  gesprochen?: string
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

/**
 * Bisheriger Schlüssel (bis 10.10.2026): ohne Artikel-Klammern und Satzzeichen am Rand, klein, Leerraum zusammengefasst.
 * Bleibt für den Rückfall: Einträge der Medienbank liegen noch unter diesen Schlüsseln (storage/medienbank.ts).
 */
export const wortNormiert = (w: string): string =>
  String(w ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?¡¿"'„“”‚‘’()[\]]+|[\s.,;:!?¡¿"'„“”‚‘’()[\]]+$/g, '')
    .trim()
    .slice(0, 160)

/**
 * Text vereinheitlichen (10.10.2026, Wunsch der Lehrkraft: gleiche Vokabel = EINE Aufnahme): Unicode NFC, typografische
 * Apostrophe und Anführungszeichen wie gerade, „…" wie „...", Leerraum um „/" weg („a / one" = „a/one"), Leerraum
 * zusammengefasst. Groß-/Kleinschreibung und Satzzeichen bleiben – das entscheidet der Aufrufer.
 */
export const textKanon = (s: string): string =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’‚‛ʼ′´`]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()

/** Initialwort („US", „YA", „R&B"): bleibt groß – die Sprach-KI buchstabiert es, „us" dagegen nicht (shared/sprechtext.ts) */
const istInitialwort = (w: string): boolean => /^[\p{Lu}\d&]{2,6}$/u.test(w) && (w.match(/\p{Lu}/gu)?.length ?? 0) >= 2

/**
 * Wort vergleichbar machen (Schlüssel der Medienbank, 10.10.2026): wie `textKanon`, dazu klein (außer Initialwörtern,
 * die anders klingen) und ohne Satzzeichen, Anführungszeichen und Klammern am Rand. Gleich sind damit „a / one" und
 * „a/one", „it’s" und „it's", „…" und „...", „Park" und „park"; verschieden bleiben „US" und „us".
 */
export const wortKanon = (w: string): string =>
  textKanon(w)
    .replace(/[\p{L}\p{M}\d&]+/gu, (t) => (istInitialwort(t) ? t : t.toLowerCase()))
    .replace(/^[\s.,;:!?¡¿"'()[\]]+|[\s.,;:!?¡¿"'()[\]]+$/g, '')
    .trim()
    .slice(0, 160)

/** Schlüssel der Medienbank: Sprache + vereinheitlichtes Wort – für alle Lehrwerke, Listen, Tests und Lernenden gleich */
export const medienSchluessel = (sprache: string, wort: string): string => `${sprachKurz(sprache)}:${wortKanon(wort)}`
/** Bisheriger Schlüssel (Rückfall beim Nachschlagen) */
export const medienSchluesselAlt = (sprache: string, wort: string): string => `${sprachKurz(sprache)}:${wortNormiert(wort)}`

/**
 * Schlüssel eines Beispielsatzes bzw. einer Verbform: vereinheitlichter Wortlaut (`textKanon`; Satzzeichen innen bleiben
 * – sie klingen mit). „read (Vergangenheit)" bleibt ein eigener Schlüssel.
 */
export const satzSchluessel = (satz: string): string => textKanon(satz).slice(0, 600)

/** Gesprochenen Text vergleichen: vereinheitlicht und klein (Initialwörter stehen dort schon buchstabiert) */
const sprechKanon = (s: string): string => textKanon(s).toLowerCase()

/**
 * Passt die Aufnahme noch zum Wort bzw. Satz und zu seinem Sprechtext? (10.10.2026 gemeinsam für Aufträge und Knöpfe:
 * Schreibvarianten wie „a / one" – „a/one" gelten als gleich, sonst würde dieselbe Vokabel doppelt erzeugt.) Ältere
 * Aufnahmen ohne `gesprochen`: Text = Sprechtext. `gesprochen` fehlt = nur den Text prüfen.
 */
export const tonPasst = (ton: { text: string; gesprochen?: string } | undefined, text: string, gesprochen?: string, art: TonArt = 'wort'): boolean => {
  if (!ton) return false
  const gleich = art === 'wort' ? wortKanon(ton.text) === wortKanon(text) : satzSchluessel(ton.text) === satzSchluessel(text)
  return gleich && (gesprochen === undefined || sprechKanon(ton.gesprochen ?? ton.text) === sprechKanon(gesprochen))
}

/** Kennung einer Aufnahme für die Erzeugungssperre (ohne Stimme und Sprechtext – die prüft `tonPasst` danach) */
export const tonKennung = (sprache: string, wort: string, art: TonArt, lage: Stimmlage, text: string): string =>
  `${medienSchluessel(sprache, wort)}|${art}|${lage}${art === 'satz' ? `|${satzSchluessel(text)}` : ''}`

/**
 * Dieselbe Aufnahme nie zweimal erzeugen (10.10.2026): Wer erzeugen will, reserviert die Kennung (`reservieren`, am Server
 * für alle Lehrkräfte gemeinsam). Ist sie belegt, wartet er und sieht danach nach, ob die Aufnahme jetzt passt (`passt`)
 * – dann ist nichts zu tun. `trotzdem` (ausdrücklich „neu erzeugen"): auch eine passende Aufnahme ersetzen.
 */
export async function einmalErzeugen(o: {
  reservieren: () => Promise<boolean>
  freigeben: () => Promise<unknown> | unknown
  passt: () => Promise<boolean>
  erzeugen: () => Promise<void>
  trotzdem?: boolean
  /** Höchstens so oft auf eine fremde Erzeugung warten, dann selbst erzeugen */
  versuche?: number
}): Promise<'erzeugt' | 'vorhanden'> {
  const max = o.versuche ?? 8
  let eigen = false
  for (let n = 0; n < max && !eigen; n++) {
    eigen = await o.reservieren()
    if (eigen) break
    // Ein anderer hat eben erzeugt (oder erzeugt noch) – passt seine Aufnahme, ist nichts mehr zu tun
    if (!o.trotzdem && (await o.passt())) return 'vorhanden'
  }
  try {
    if (!o.trotzdem && (await o.passt())) return 'vorhanden'
    await o.erzeugen()
    return 'erzeugt'
  } finally {
    if (eigen) await (async () => o.freigeben())().catch(() => undefined)
  }
}

/**
 * Erzeugungssperre (10.10.2026): Kennung → laufende Erzeugung. `reservieren` gibt true, wenn frei (dann gehört sie dem
 * Aufrufer bis `freigeben` oder bis `haltMs` abgelaufen ist – abgestürzte Seiten blockieren nicht ewig). Ist sie belegt,
 * wartet es höchstens `wartenMs` auf die Freigabe und gibt false.
 */
export class ErzeugungsSperre {
  private belegt = new Map<string, { bis: number; fertig: Promise<void>; los: () => void }>()
  constructor(
    private haltMs = 120_000,
    private wartenMs = 30_000
  ) {}
  async reservieren(kennung: string): Promise<boolean> {
    const r = this.belegt.get(kennung)
    if (r && r.bis > Date.now()) {
      let uhr: ReturnType<typeof setTimeout> | undefined
      await Promise.race([r.fertig, new Promise<void>((ok) => (uhr = setTimeout(ok, Math.min(this.wartenMs, r.bis - Date.now()))))])
      if (uhr) clearTimeout(uhr)
      return false
    }
    let los = (): void => undefined
    const fertig = new Promise<void>((ok) => (los = ok))
    this.belegt.set(kennung, { bis: Date.now() + this.haltMs, fertig, los })
    return true
  }
  freigeben(kennung: string): void {
    const r = this.belegt.get(kennung)
    if (!r) return
    this.belegt.delete(kennung)
    r.los()
  }
  get anzahl(): number {
    return this.belegt.size
  }
}

/** Ist ein ganzer Satz (nicht nur eine Wendung)? – nur dann gibt es eine Satz-Aussprache */
export const istGanzerSatz = (t: string | undefined): boolean => {
  const s = String(t ?? '').trim()
  return s.split(/\s+/).length >= 3 && /[.!?…]["'”’)]*$/.test(s)
}

/** Dateinamen der Medienbank: nur Hex mit Endung */
export const MEDIEN_DATEI = /^[a-f0-9]{24}\.(jpg|png|webp|mp3)$/
