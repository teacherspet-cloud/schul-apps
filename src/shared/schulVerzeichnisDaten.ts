/**
 * Schuldaten aus dem Schulverzeichnis übernehmen (09.10.2026, Wunsch der Lehrkraft).
 *
 * Wird eine Schule in der Schulsuche GEWÄHLT – in den Einstellungen, im Einrichtungsassistenten und in der Verwaltung
 * („Schule & Daten" › Schule) –, kommen Anschrift (Straße, PLZ, Ort) und Telefon aus dem Verzeichnis in die Felder,
 * die noch LEER sind. Gefüllte Felder werden nie still überschrieben: Weicht das Verzeichnis ab, bietet die Oberfläche
 * „Daten aus dem Schulverzeichnis übernehmen" an. Die Angaben stehen danach im Briefkopf der Elternbriefe (für
 * Lehrkräfte ohne eigene Angaben über die Schul-Einrichtung des Servers als Rückfall).
 *
 * Das Verzeichnis führt je Schule: Name, Ort, PLZ, Land, Schulformen, Kennung, Straße, Telefon, E-Mail (resources/schulen).
 * E-Mail seit 10.10.2026 (Befund der Lehrkraft: Die Wahl füllte die Sekretariats-Adresse nicht – das Verzeichnis führte
 * keine). Sie kommt nur aus Quellen, deren Lizenz die Weitergabe erlaubt; das Landesverzeichnis NI führt keine.
 * Ohne React: geprüft in tests/elternbriefDin.test.ts und tests/schulWahl.test.ts.
 */
import { suchform, type SchulTreffer } from './schulsuche'

/** Felder, die das Verzeichnis für Anschrift und Kontakt liefert */
export const VERZEICHNIS_FELDER = ['strasse', 'plz', 'ort', 'telefon', 'email'] as const
export type VerzeichnisFeld = (typeof VERZEICHNIS_FELDER)[number]

export const VERZEICHNIS_FELDNAME: Record<VerzeichnisFeld, string> = { strasse: 'Straße', plz: 'PLZ', ort: 'Ort', telefon: 'Telefon', email: 'E-Mail' }

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
  treffer: Partial<Pick<SchulTreffer, VerzeichnisFeld>>
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
export function verzeichnisUebernehmen(treffer: Partial<Pick<SchulTreffer, VerzeichnisFeld>>): Partial<Record<VerzeichnisFeld, string>> {
  const raus: Partial<Record<VerzeichnisFeld, string>> = {}
  for (const feld of VERZEICHNIS_FELDER) {
    const wert = treffer[feld]?.trim()
    if (wert) raus[feld] = wert
  }
  return raus
}

/** Kleine Schreibunterschiede zählen nicht als Abweichung (Str./Straße, Leerzeichen, Trennzeichen der Telefonnummer) */
function vergleichsform(wert: string, feld: VerzeichnisFeld): string {
  const w = wert.toLowerCase().replace(/\s+/g, ' ').trim()
  if (feld === 'telefon') return w.replace(/[^\d+]/g, '')
  if (feld === 'email') return w.replace(/^mailto:/, '')
  if (feld === 'strasse') return w.replace(/str\.(?=\s|\d|$)/g, 'straße').replace(/strasse/g, 'straße').replace(/[\s-]/g, '')
  return w
}

/**
 * Eigener Schulname bleibt (10.10.2026, Befund „Kreisgymnasium Wesermünde"): Das Verzeichnis führt die Schule als
 * „Gymnasium Wesermünde", im Briefkopf nennt sie sich „Kreisgymnasium Wesermünde". Wer den längeren eigenen Namen
 * eingetippt hat und dann die Schule aus der Liste wählt, behält ihn – wenn JEDES Wort des Verzeichnisnamens im
 * Eingetippten steht (gleich oder als Ende eines zusammengesetzten Wortes: „Kreis|gymnasium"). Abkürzungen („Gy
 * Wesermünde") und Bruchstücke („Weserm") ersetzt die Wahl durch den amtlichen Namen.
 */
export function eigenerNameBleibt(eingetippt: string, verzeichnisName: string): boolean {
  const eigene = suchform(eingetippt).split(' ').filter(Boolean)
  const amtlich = suchform(verzeichnisName).split(' ').filter(Boolean)
  if (!eigene.length || !amtlich.length || suchform(eingetippt) === suchform(verzeichnisName)) return false
  return amtlich.every((a) => eigene.some((e) => e === a || (a.length >= 4 && e.length > a.length && e.endsWith(a))))
}

/** Was die Wahl einer Schule aus dem Verzeichnis ändert (Verwaltung › Schule; Einstellungen der Lehrkraft) */
export interface SchulWahl {
  /** Name für das Feld – der gewählte oder der eigene längere (eigenerNameBleibt) */
  name: string
  /** Bisher leere Kontaktfelder, die das Verzeichnis kennt */
  gefuellt: Partial<Record<VerzeichnisFeld, string>>
  /** Gefüllte Felder, bei denen das Verzeichnis anderes führt – Übernahme nur auf Klick */
  abweichend: Abweichung[]
  /** Vorgabe-Logo: 'setzen' ohne bisheriges Logo, 'fragen' bei einem anderen, sonst null (keins da oder schon gesetzt) */
  logo: 'setzen' | 'fragen' | null
}

/**
 * Regeln der Schulwahl: leere Felder füllen (auch E-Mail), Abweichungen nur anbieten, eigenen längeren Namen behalten,
 * Vorgabe-Logo nur setzen, wenn noch keins da ist (ein eigenes Logo wird nie ungefragt ersetzt). `logoVorgabe` = das
 * Vorgabe-Logo der Schule (data:-URL) oder null; `logoBisher` = das gesetzte Logo oder null.
 */
export function schulWahl(
  bisher: { name?: string } & VerzeichnisWerte,
  treffer: Pick<SchulTreffer, 'name'> & Partial<Pick<SchulTreffer, VerzeichnisFeld>>,
  logoBisher: string | null,
  logoVorgabe: string | null
): SchulWahl {
  const { gefuellt, abweichend } = verzeichnisAbgleich(bisher, treffer)
  const name = bisher.name && eigenerNameBleibt(bisher.name, treffer.name) ? bisher.name.trim() : treffer.name
  const logo = !logoVorgabe || logoBisher === logoVorgabe ? null : logoBisher ? 'fragen' : 'setzen'
  return { name, gefuellt, abweichend, logo }
}
