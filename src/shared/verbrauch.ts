/**
 * Verbrauch der eigenen KI-Zugänge – Daten und Auswertung (09.10.2026, Einstellungen › KI-Zugang › Verbrauch).
 *
 * Gezählt wird im Hauptprozess (main/services/ai/verbrauch.ts): je Monat und Modell wie bisher, dazu je Tag und
 * Anbieter sowie je Tag und Auftragsart (shared/kiArten.ts) und die zuletzt erreichten Limits. Hier steckt die reine
 * Auswertung für die Diagramme – ohne Oberfläche, damit sie sich prüfen lässt (tests/verbrauchAuswertung.test.ts).
 * Eine Kostenrechnung ist es weiterhin nicht: Preise hängen am Vertrag bzw. Abo.
 */
import { KI_ARTEN, type KiArt } from './kiArten'

export interface VerbrauchsZaehler {
  anfragen: number
  wiederholungen: number
  eingabe: number
  ausgabe: number
  bilder: number
  ttsZeichen: number
}

/** Zähler eines Anbieters an einem Tag; `n` = Aufrufe (Anfragen, Bilder, Vertonungen), `limits` = erreichte Limits */
export type TagesZaehler = Partial<VerbrauchsZaehler & { n: number; limits: number }>

export interface VerbrauchsTag {
  anbieter: Record<string, TagesZaehler>
  /** Aufrufe je Auftragsart */
  arten: Partial<Record<KiArt, number>>
}

export interface LimitEreignis {
  /** ISO-Zeitpunkt */
  zeit: string
  anbieter: string
  art?: KiArt
  /** Anfang der Fehlermeldung (ohne Inhalte der Anfrage) */
  meldung: string
}

export interface VerbrauchsDaten {
  /** Monat (JJJJ-MM) → „anbieter · modell" → Zähler */
  monate: Record<string, Record<string, VerbrauchsZaehler>>
  /** Tag (JJJJ-MM-TT, Ortszeit) → Zähler */
  tage: Record<string, VerbrauchsTag>
  limits: LimitEreignis[]
}

export const leererTag = (): VerbrauchsTag => ({ anbieter: {}, arten: {} })

/**
 * Den Verbrauch zeigen? Nur wenn mindestens ein KI-Zugang eingerichtet ist – Text, Bild oder Vertonung
 * (Wunsch der Lehrkraft, 09.10.2026). Ohne Zugang gäbe es nichts zu zählen.
 */
export function verbrauchSichtbar(status: { hasTextKey?: boolean; hasImageKey?: boolean; hasTts?: boolean } | null | undefined): boolean {
  return Boolean(status && (status.hasTextKey || status.hasImageKey || status.hasTts))
}

const zwei = (n: number): string => String(n).padStart(2, '0')
export const tagSchluessel = (d: Date): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
export const monatSchluessel = (d: Date): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}`

/** Die letzten `anzahl` Tage (Ortszeit), älteste zuerst */
export function letzteTage(anzahl: number, jetzt = new Date()): string[] {
  return Array.from({ length: anzahl }, (_, i) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - (anzahl - 1 - i))
    return tagSchluessel(d)
  })
}

/** Aufrufe eines Tageszählers (ältere Einträge ohne `n`: Anfragen + Bilder) */
const aufrufe = (z: TagesZaehler): number => z.n ?? (z.anfragen ?? 0) + (z.bilder ?? 0)

export interface VerbrauchsAuswertung {
  tage: string[]
  jeTag: { tag: string; anbieter: Record<string, number>; arten: Partial<Record<KiArt, number>>; summe: number; limits: number }[]
  /** Anbieter nach Aufrufen im Zeitraum, häufigster zuerst */
  anbieter: { id: string; aufrufe: number }[]
  /** Aufrufe je Auftragsart im Zeitraum, häufigste zuerst */
  arten: { art: KiArt; name: string; wert: number }[]
  kennzahlen: {
    /** seit Montag */
    woche: number
    /** im laufenden Kalendermonat (aus der Monatszählung, reicht weiter zurück als die Tage) */
    monat: number
    zeitraum: number
    eingabe: number
    ausgabe: number
    bilder: number
    ttsZeichen: number
    wiederholungen: number
    limits: number
    /** Anteil der Anfragen ohne Wiederholung (0–1); null ohne Anfragen */
    ohneWiederholung: number | null
  }
  /** Limits im Zeitraum, neueste zuerst */
  limits: LimitEreignis[]
}

export function werteVerbrauchAus(daten: VerbrauchsDaten, jetzt = new Date(), anzahl = 30): VerbrauchsAuswertung {
  const tage = letzteTage(anzahl, jetzt)
  const montag = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - ((jetzt.getDay() + 6) % 7))
  const abWoche = tagSchluessel(montag)
  const anbieterSumme = new Map<string, number>()
  const artSumme = new Map<KiArt, number>()
  const k = { woche: 0, monat: 0, zeitraum: 0, eingabe: 0, ausgabe: 0, bilder: 0, ttsZeichen: 0, wiederholungen: 0, limits: 0 }
  let anfragen = 0
  const jeTag = tage.map((tag) => {
    const t = daten.tage?.[tag]
    const anbieter: Record<string, number> = {}
    let summe = 0
    let limits = 0
    for (const [id, z] of Object.entries(t?.anbieter ?? {})) {
      const n = aufrufe(z)
      if (n) anbieter[id] = n
      summe += n
      limits += z.limits ?? 0
      anbieterSumme.set(id, (anbieterSumme.get(id) ?? 0) + n)
      k.eingabe += z.eingabe ?? 0
      k.ausgabe += z.ausgabe ?? 0
      k.bilder += z.bilder ?? 0
      k.ttsZeichen += z.ttsZeichen ?? 0
      k.wiederholungen += z.wiederholungen ?? 0
      anfragen += z.anfragen ?? 0
    }
    const arten: Partial<Record<KiArt, number>> = {}
    for (const [art, n] of Object.entries(t?.arten ?? {}) as [KiArt, number][])
      if (n) {
        arten[art] = n
        artSumme.set(art, (artSumme.get(art) ?? 0) + n)
      }
    k.zeitraum += summe
    k.limits += limits
    if (tag >= abWoche) k.woche += summe
    return { tag, anbieter, arten, summe, limits }
  })
  for (const z of Object.values(daten.monate?.[monatSchluessel(jetzt)] ?? {})) k.monat += (z.anfragen ?? 0) + (z.bilder ?? 0)
  const ab = tage[0]
  return {
    tage,
    jeTag,
    anbieter: [...anbieterSumme]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, aufrufe]) => ({ id, aufrufe })),
    arten: [...artSumme]
      .sort((a, b) => b[1] - a[1])
      .map(([art, wert]) => ({ art, name: KI_ARTEN[art] ?? art, wert })),
    kennzahlen: { ...k, ohneWiederholung: anfragen ? Math.max(0, 1 - k.wiederholungen / anfragen) : null },
    limits: (daten.limits ?? [])
      .filter((l) => tagSchluessel(new Date(l.zeit)) >= ab)
      .sort((a, b) => b.zeit.localeCompare(a.zeit))
  }
}
