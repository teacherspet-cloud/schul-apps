/**
 * Maße des Elternbriefs nach DIN 5008, Form B (09.10.2026, Wunsch der Lehrkraft) – eine Quelle für PDF/Druck (HTML)
 * und Word. Recherche mit Quellen: recherche/din5008-elternbrief.md.
 *
 * Recherchierte Werte (DIN 5008:2020, Geschäftsbrief Form B, A4 = 210 × 297 mm):
 * - Seitenrand links 25 mm, rechts mindestens 20 mm (ältere Fassungen: mindestens 10 mm).
 * - Briefkopf Form B 45 mm hoch (Form A: 27 mm).
 * - Anschriftfeld: 45 mm von oben, 20 mm von links, 85 × 45 mm; oben 17,7 mm Zusatz- und Vermerkzone, darunter
 *   27,3 mm Anschriftzone (höchstens 6 Zeilen). Die Schrift darin beginnt wie der Brieftext bei 25 mm.
 * - Informationsblock: rechts neben dem Anschriftfeld, 125 mm vom linken Blattrand, beginnt 50 mm von oben
 *   (Form B), höchstens 75 mm breit; das Datum steht darin.
 * - Falzmarken Form B bei 105 mm und 210 mm, Lochmarke bei 148,5 mm (hier nicht gedruckt).
 * - Schrift 10–12 pt, einzeiliger Zeilenabstand; eine Leerzeile = eine Zeile in der Schriftgröße des Brieftextes.
 * - Betreff ohne das Wort „Betreff", darf fett sein; zwei Leerzeilen unter Anschriftfeld/Informationsblock.
 * - Zwei Leerzeilen zwischen Betreff und Anrede, eine nach der Anrede und zwischen den Absätzen, eine vor dem Gruß,
 *   drei Leerzeilen Raum für die handschriftliche Unterschrift, danach Name (und Funktion).
 *
 * Statt der Empfängeranschrift steht in der Anschriftzone die Zeile „An die Eltern und Erziehungsberechtigten der
 * Klasse …" – Elternbriefe werden verteilt, nicht verschickt. Der Rückmeldeabschnitt folgt nach zwei Leerzeilen
 * hinter einer Schnittlinie „✂ – – –".
 *
 * Die Druckränder oben/unten (15/20 mm) gelten für Folgeseiten; auf der ersten Seite einer Fassung liegt der
 * Kopfbereich fest bis zum Ende des Anschriftfelds (90 mm von oben).
 */

export const DIN5008 = {
  seite: { breiteMm: 210, hoeheMm: 297 },
  rand: { obenMm: 15, untenMm: 20, linksMm: 25, rechtsMm: 20 },
  briefkopfHoeheMm: 45,
  anschriftfeld: { obenMm: 45, linksMm: 20, breiteMm: 85, hoeheMm: 45, vermerkzoneMm: 17.7, anschriftzoneMm: 27.3 },
  infoblock: { linksMm: 125, obenMm: 50, breiteMaxMm: 75 },
  falzmarkenMm: [105, 210],
  lochmarkeMm: 148.5,
  /** Schrift des Brieftextes (DIN: 10–12 pt) und Zeilenhöhe als Vielfaches davon (einzeilig) */
  schriftPt: 11,
  zeilenFaktor: 1.2,
  /** Kleinere Schrift im Briefkopf und Informationsblock (DIN: nicht unter 8 pt) */
  kopfSchriftPt: 9,
  leerzeilen: {
    vorBetreff: 2,
    nachBetreff: 2,
    nachAnrede: 1,
    zwischenAbsaetzen: 1,
    vorGruss: 1,
    unterschrift: 3,
    vorAbschnitt: 2
  }
} as const

/** Höhe einer Zeile (und damit einer Leerzeile) in pt */
export const ZEILE_PT = Math.round(DIN5008.schriftPt * DIN5008.zeilenFaktor * 100) / 100

/** n Leerzeilen in pt */
export const leerPt = (n: number): number => Math.round(n * ZEILE_PT * 100) / 100

/** n Leerzeilen in Twips (Word: 1 pt = 20 Twips) */
export const leerTwips = (n: number): number => Math.round(n * ZEILE_PT * 20)

/** Millimeter in Twips (1 mm = 56,6929 Twips) */
export const mmTwips = (mm: number): number => Math.round((mm * 1440) / 25.4)

/**
 * Lage der Kopfteile auf der ersten Seite, gemessen ab dem oberen bzw. linken Druckrand (HTML und Word setzen die
 * Teile innerhalb des Satzspiegels).
 */
export const KOPF = {
  /** Höhe des Briefkopfs innerhalb des Satzspiegels (45 mm ab Blattkante minus oberer Rand) */
  briefkopfMm: DIN5008.anschriftfeld.obenMm - DIN5008.rand.obenMm,
  /** Gesamter Kopfbereich bis zum Ende des Anschriftfelds */
  kopfbereichMm: DIN5008.anschriftfeld.obenMm + DIN5008.anschriftfeld.hoeheMm - DIN5008.rand.obenMm,
  /** Beginn der Anschriftzone ab oberem Druckrand */
  anschriftzoneObenMm: Math.round((DIN5008.anschriftfeld.obenMm + DIN5008.anschriftfeld.vermerkzoneMm - DIN5008.rand.obenMm) * 10) / 10,
  /** Breite der Schrift im Anschriftfeld (Feld 85 mm, Schrift ab 25 mm statt 20 mm) */
  anschriftBreiteMm: DIN5008.anschriftfeld.breiteMm - (DIN5008.rand.linksMm - DIN5008.anschriftfeld.linksMm),
  /** Informationsblock ab linkem/oberem Druckrand und seine nutzbare Breite bis zum rechten Rand */
  infoLinksMm: DIN5008.infoblock.linksMm - DIN5008.rand.linksMm,
  infoObenMm: DIN5008.infoblock.obenMm - DIN5008.rand.obenMm,
  infoBreiteMm: Math.min(DIN5008.infoblock.breiteMaxMm, DIN5008.seite.breiteMm - DIN5008.rand.rechtsMm - DIN5008.infoblock.linksMm)
} as const

/** Zeile in der Anschriftzone: „An die Eltern und Erziehungsberechtigten der Klasse 6b" */
export function empfaengerZeile(klasse: string): string {
  const k = klasse.trim().replace(/^Klasse\s+/i, '')
  return `An die Eltern und Erziehungsberechtigten${k ? ` der Klasse ${k}` : ''}`
}
