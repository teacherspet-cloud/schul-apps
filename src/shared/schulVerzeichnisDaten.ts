/**
 * Schuldaten aus dem Schulverzeichnis übernehmen (09.10.2026, Wunsch der Lehrkraft).
 *
 * Wird eine Schule in der Schulsuche GEWÄHLT – in den Einstellungen, im Einrichtungsassistenten und in der Verwaltung
 * („Schule & Daten" › Schule) –, kommen Anschrift (Straße, PLZ, Ort) und Telefon aus dem Verzeichnis in die Felder,
 * die noch LEER sind. Gefüllte Felder werden nie still überschrieben: Weicht das Verzeichnis ab, bietet die Oberfläche
 * „Daten aus dem Schulverzeichnis übernehmen" an. Die Angaben stehen danach im Briefkopf der Elternbriefe (für
 * Lehrkräfte ohne eigene Angaben über die Schul-Einrichtung des Servers als Rückfall).
 *
 * Das Verzeichnis führt je Schule: Name, Ort, PLZ, Land, Schulformen, Kennung, Straße, Telefon (resources/schulen).
 * Ohne React: geprüft in tests/elternbriefDin.test.ts.
 */
import type { SchulTreffer } from './schulsuche'

/** Felder, die das Verzeichnis für die Anschrift liefert */
export const VERZEICHNIS_FELDER = ['strasse', 'plz', 'ort', 'telefon'] as const
export type VerzeichnisFeld = (typeof VERZEICHNIS_FELDER)[number]

export const VERZEICHNIS_FELDNAME: Record<VerzeichnisFeld, string> = { strasse: 'Straße', plz: 'PLZ', ort: 'Ort', telefon: 'Telefon' }

export type VerzeichnisWerte = Partial<Record<VerzeichnisFeld, string | undefined>>

export interface Abweichung {
  feld: VerzeichnisFeld
  bisher: string
  verzeichnis: string
}

/**
 * Vergleicht die bisherigen Werte mit dem gewählten Treffer: `gefuellt` = Werte für bisher leere Felder (das
 * Verzeichnis kennt sie), `abweichend` = gefüllte Felder, bei denen das Verzeichnis etwas anderes führt.
 */
export function verzeichnisAbgleich(
  bisher: VerzeichnisWerte | null | undefined,
  treffer: Pick<SchulTreffer, VerzeichnisFeld>
): { gefuellt: Partial<Record<VerzeichnisFeld, string>>; abweichend: Abweichung[] } {
  const gefuellt: Partial<Record<VerzeichnisFeld, string>> = {}
  const abweichend: Abweichung[] = []
  for (const feld of VERZEICHNIS_FELDER) {
    const alt = (bisher?.[feld] ?? '').trim()
    const neu = (treffer[feld] ?? '').trim()
    if (!neu) continue
    if (!alt) gefuellt[feld] = neu
    else if (vergleichsform(alt, feld) !== vergleichsform(neu, feld)) abweichend.push({ feld, bisher: alt, verzeichnis: neu })
  }
  return { gefuellt, abweichend }
}

/** Alle Felder, die das Verzeichnis kennt, übernehmen (nach ausdrücklichem Klick) */
export function verzeichnisUebernehmen(treffer: Pick<SchulTreffer, VerzeichnisFeld>): Partial<Record<VerzeichnisFeld, string>> {
  const raus: Partial<Record<VerzeichnisFeld, string>> = {}
  for (const feld of VERZEICHNIS_FELDER) if (treffer[feld]?.trim()) raus[feld] = treffer[feld].trim()
  return raus
}

/** Kleine Schreibunterschiede zählen nicht als Abweichung (Str./Straße, Leerzeichen, Trennzeichen der Telefonnummer) */
function vergleichsform(wert: string, feld: VerzeichnisFeld): string {
  const w = wert.toLowerCase().replace(/\s+/g, ' ').trim()
  if (feld === 'telefon') return w.replace(/[^\d+]/g, '')
  if (feld === 'strasse') return w.replace(/str\.(?=\s|\d|$)/g, 'straße').replace(/strasse/g, 'straße').replace(/[\s-]/g, '')
  return w
}
