/**
 * Familiensprachen für Übersetzungen von Elternbriefen (Großprogramm 0.4, F7).
 *
 * Auswahl nach den häufigsten Herkunftssprachen von Schülerinnen und Schülern in Deutschland
 * (Mikrozensus, Schulstatistiken der Länder) und den Sprachen der Fluchtbewegungen seit 2015
 * und 2022. `rtl` = von rechts nach links – der Brief wird dann gespiegelt gesetzt.
 */
export interface Familiensprache {
  code: string
  name: string
  /** Eigenbezeichnung der Sprache (steht über der Übersetzung) */
  eigen: string
  rtl?: boolean
}

export const FAMILIENSPRACHEN: Familiensprache[] = [
  { code: 'tr', name: 'Türkisch', eigen: 'Türkçe' },
  { code: 'ar', name: 'Arabisch', eigen: 'العربية', rtl: true },
  { code: 'uk', name: 'Ukrainisch', eigen: 'Українська' },
  { code: 'ru', name: 'Russisch', eigen: 'Русский' },
  { code: 'pl', name: 'Polnisch', eigen: 'Polski' },
  { code: 'en', name: 'Englisch', eigen: 'English' },
  { code: 'ro', name: 'Rumänisch', eigen: 'Română' },
  { code: 'bg', name: 'Bulgarisch', eigen: 'Български' },
  { code: 'fa', name: 'Persisch (Farsi)', eigen: 'فارسی', rtl: true },
  { code: 'prs', name: 'Dari', eigen: 'دری', rtl: true },
  { code: 'ps', name: 'Paschtu', eigen: 'پښتو', rtl: true },
  { code: 'kmr', name: 'Kurdisch (Kurmandschi)', eigen: 'Kurmancî' },
  { code: 'sq', name: 'Albanisch', eigen: 'Shqip' },
  { code: 'sr', name: 'Serbisch/Kroatisch/Bosnisch', eigen: 'Srpski / Hrvatski / Bosanski' },
  { code: 'it', name: 'Italienisch', eigen: 'Italiano' },
  { code: 'es', name: 'Spanisch', eigen: 'Español' },
  { code: 'fr', name: 'Französisch', eigen: 'Français' },
  { code: 'el', name: 'Griechisch', eigen: 'Ελληνικά' },
  { code: 'vi', name: 'Vietnamesisch', eigen: 'Tiếng Việt' },
  { code: 'ti', name: 'Tigrinya', eigen: 'ትግርኛ' },
  { code: 'so', name: 'Somali', eigen: 'Soomaali' }
]

export const spracheNach = (code: string): Familiensprache | undefined => FAMILIENSPRACHEN.find((s) => s.code === code)
