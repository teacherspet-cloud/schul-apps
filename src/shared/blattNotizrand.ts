/**
 * Notizrand für Lernende (03.11.2026, abgestimmt mit der Lehrkraft): rechts neben jeder Seite ein Streifen für eigene
 * Notizen – das Blatt selbst bleibt unverändert (Text, Umbrüche, Einträge). Stift, Marker und Textkästchen wie auf dem
 * Blatt; gespeichert getrennt vom Blatt:
 *  - Tinte des Rands je Seite unter `rand:<Seite>` (wie die Bilder unter `bild:b<n>`),
 *  - Objekte (Textkästchen, Linien …) auf „Seite" RAND_SEITE + Seitennummer (wie BILD_SEITE bei Bildern),
 *  - ein/aus unter `notizrand` in den Antworten.
 * Ausgeblendet trotz Notizen: Fähnchen am Seitenrand auf der Höhe der Notizen (BlattNotizrand.tsx). Die Notizen gehen
 * nicht an die KI (arbeitsblaetter.ts `blattExtra`, druck.ts) – die Lehrkraft sieht sie in „Blatt ansehen".
 */
export const RAND_SEITE = 41
export const RAND_SEITEN_HOECHSTENS = 20
/** Breite des Streifens in Blattpunkten (A4 = 794) – gut 5 cm */
export const RAND_BREITE = 200
export const NOTIZRAND_SCHLUESSEL = 'notizrand'
export const randTinteSchluessel = (seite: number): string => `rand:${seite}`
export const RAND_TINTE_MUSTER = /^rand:(1?\d)$/
export const istRandObjekt = (o: { s: number }): boolean => o.s >= RAND_SEITE && o.s < RAND_SEITE + RAND_SEITEN_HOECHSTENS
