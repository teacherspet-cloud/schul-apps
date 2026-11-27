/**
 * Wörterbücher für Lernende (27.11.2026, abgestimmt mit der Lehrkraft): Die Lehrkraft schaltet sie je Arbeitsblatt bzw.
 * Onlinetest/Klassenarbeit frei. Die Daten liegen auf dem Server (offene Daten, siehe scripts/woerterbuch/README.md) –
 * keine Suche verlässt den Server.
 *
 *  - Quellen: Wiktionary (über kaikki.org/wiktextract, CC BY-SA 4.0), OpenThesaurus (Synonyme). Ausgeschlossen: dict.cc
 *    (nur persönliche Nutzung), DWDS (Artikel nicht herunterladbar), Duden/PONS/Langenscheidt (kostenpflichtig, Anfragen
 *    verließen den Server).
 *  - Schulfilter: ohne vulgäre, beleidigende und veraltete Bedeutungen, höchstens 6 Bedeutungen (beim Bau).
 *  - In Prüfungen (Onlinetest, Klassenarbeit) nur Treffer am Wortanfang, ohne „Meinten Sie …": Im Abitur Niedersachsen
 *    sind elektronische Wörterbücher nur ohne Rechtschreibprüfung zulässig (belegt: MK-Hinweis „Elektronische
 *    Wörterbücher", 04.12.2020). Auf Arbeitsblättern zusätzlich ähnliche Wörter bei Tippfehlern.
 */

export type WoerterbuchId = 'de' | 'en' | 'fr' | 'es' | 'de-en' | 'en-de' | 'de-fr' | 'fr-de' | 'de-es' | 'es-de' | 'la-de' | 'de-la'

export interface WoerterbuchInfo {
  id: WoerterbuchId
  /** Für die Auswahl der Lehrkraft */
  label: string
  /** Kurz für die Reiter der Lernenden */
  kurz: string
  art: 'einsprachig' | 'zweisprachig'
  /** Sprache der Suchwörter (für Sonderzeichen-Hilfe) */
  sprache: string
}

export const WOERTERBUECHER: WoerterbuchInfo[] = [
  { id: 'de', label: 'Deutsch: Bedeutungen, Rechtschreibung, Fremdwörter', kurz: 'Deutsch', art: 'einsprachig', sprache: 'de' },
  { id: 'en', label: 'Englisch einsprachig (English–English)', kurz: 'English', art: 'einsprachig', sprache: 'en' },
  { id: 'de-en', label: 'Deutsch → Englisch', kurz: 'DE → EN', art: 'zweisprachig', sprache: 'de' },
  { id: 'en-de', label: 'Englisch → Deutsch', kurz: 'EN → DE', art: 'zweisprachig', sprache: 'en' },
  { id: 'fr', label: 'Französisch einsprachig (français–français)', kurz: 'Français', art: 'einsprachig', sprache: 'fr' },
  { id: 'de-fr', label: 'Deutsch → Französisch', kurz: 'DE → FR', art: 'zweisprachig', sprache: 'de' },
  { id: 'fr-de', label: 'Französisch → Deutsch', kurz: 'FR → DE', art: 'zweisprachig', sprache: 'fr' },
  { id: 'es', label: 'Spanisch einsprachig (español–español)', kurz: 'Español', art: 'einsprachig', sprache: 'es' },
  { id: 'de-es', label: 'Deutsch → Spanisch', kurz: 'DE → ES', art: 'zweisprachig', sprache: 'de' },
  { id: 'es-de', label: 'Spanisch → Deutsch', kurz: 'ES → DE', art: 'zweisprachig', sprache: 'es' },
  { id: 'la-de', label: 'Latein → Deutsch', kurz: 'LA → DE', art: 'zweisprachig', sprache: 'la' },
  { id: 'de-la', label: 'Deutsch → Latein', kurz: 'DE → LA', art: 'zweisprachig', sprache: 'de' }
]

const IDS = new Set<string>(WOERTERBUECHER.map((w) => w.id))
export const istWoerterbuch = (x: unknown): x is WoerterbuchId => typeof x === 'string' && IDS.has(x)

/** Auswahl aus einer Eingabe bereinigen (unbekannte weg, Reihenfolge des Katalogs) */
export function woerterbuecherAus(x: unknown): WoerterbuchId[] {
  const roh = new Set(Array.isArray(x) ? x.map(String) : [])
  return WOERTERBUECHER.map((w) => w.id).filter((id) => roh.has(id))
}

/** Vorschlag je Fach (die Lehrkraft wählt selbst; Faustregel nach den Abitur-Hilfsmitteln) */
export function woerterbuchVorschlag(fachId: string | undefined): WoerterbuchId[] {
  switch (fachId) {
    case 'englisch':
      return ['en', 'en-de', 'de-en']
    case 'franzoesisch':
      return ['fr', 'fr-de', 'de-fr']
    case 'spanisch':
      return ['es', 'es-de', 'de-es']
    case 'latein':
      return ['la-de']
    case 'deutsch':
    case 'daz':
      return ['de']
    default:
      return ['de']
  }
}

/** Suchwort vereinheitlichen – genau wie beim Bau der Datenbank (scripts/woerterbuch/bauen.py › norm) */
export function woerterbuchNorm(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ein Eintrag, wie ihn der Server liefert */
export interface WoerterbuchEintrag {
  lemma: string
  wortart: string
  /** Gefunden über eine gebeugte Form („went" → go) */
  ueberForm?: string
  daten: {
    bedeutungen?: { text: string; beispiele?: string[] }[]
    uebersetzungen?: { wort: string; hinweis?: string }[]
    silben?: string
    genus?: string
    plural?: string
    formen?: string[]
    ipa?: string
    herkunft?: string
    fremdwort?: boolean
    synonyme?: string[]
  }
}

export interface WoerterbuchAntwort {
  treffer: WoerterbuchEintrag[]
  /** Nur auf Arbeitsblättern: ähnliche Wörter bei Tippfehlern */
  aehnlich?: string[]
  /** Quellenangabe (Pflicht nach CC BY-SA) */
  quelle: string
}

export const WOERTERBUCH_QUELLE = 'Wiktionary (CC BY-SA 4.0, über kaikki.org) · Synonyme: OpenThesaurus (CC BY-SA 4.0)'
