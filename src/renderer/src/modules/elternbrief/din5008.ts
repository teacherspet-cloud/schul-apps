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
  infoBreiteMm: Math.min(DIN5008.infoblock.breiteMaxMm, DIN5008.seite.breiteMm - DIN5008.rand.rechtsMm - DIN5008.infoblock.linksMm),
  /**
   * Breite des Satzspiegels (12.10.2026): Die Zeile „An die Eltern … der Klasse 9c" ist keine Postanschrift – sie nutzt
   * die volle Breite statt der 80 mm des Anschriftfelds und bricht so nicht um.
   */
  satzBreiteMm: DIN5008.seite.breiteMm - DIN5008.rand.linksMm - DIN5008.rand.rechtsMm
} as const

/** Zeile in der Anschriftzone: „An die Eltern und Erziehungsberechtigten der Klasse 6b" */
export function empfaengerZeile(klasse: string): string {
  const k = klasse.trim().replace(/^Klasse\s+/i, '')
  return `An die Eltern und Erziehungsberechtigten${k ? ` der Klasse ${k}` : ''}`
}

/*
 * Amtsbezeichnungen in der Unterschrift (12.10.2026, Wunsch der Lehrkraft): Unter dem Gruß steht nur der Name –
 * „Frau StR' Müller" → „Frau Müller", „Müller, StR" → „Müller". Im Briefkopf (Absender) bleibt die Bezeichnung
 * stehen. Akademische Titel (Dr., Prof.) bleiben. Kürzel zählen nur mit genauer Schreibung (sonst träfe es „Str."),
 * ausgeschriebene Bezeichnungen in jeder Schreibung. Ein einzelnes „L." bleibt – das ist eher ein Vorname-Kürzel.
 */
const APOSTROPH = "['’´`ʼ]"
/** Weibliche Endung an Kürzeln: StR', StR'in, StRin, StR’in */
const KURZ_WEIBLICH = `(?:${APOSTROPH}?in|${APOSTROPH})?`
/** „z. A." (zur Anstellung) hinter der Bezeichnung */
const ZUR_ANSTELLUNG = String.raw`(?:\s*z\.\s*A\.)?`
const KUERZEL = ['OStD', 'OStR', 'StD', 'StR', 'StAss', 'StRef', 'LiA', 'LAA', 'RSL', 'RL', 'KR', 'FL', 'FöL', 'Ref']
const AUSGESCHRIEBEN = [
  'Oberstudiendirektor',
  'Studiendirektor',
  'Oberstudienrat',
  'Oberstudienrätin',
  'Studienrat',
  'Studienrätin',
  'Studienassessor',
  'Studienreferendar',
  'Referendar',
  'Lehramtsanwärter',
  'Realschullehrer',
  'Förderschullehrer',
  'Fachlehrer',
  'Lehrer',
  'Lehrkraft',
  'Konrektor',
  'Rektor'
]
/** Weibliche Formen der ausgeschriebenen Bezeichnungen: -in, /in, /-in, *in, :in, (in), In */
const LANG_WEIBLICH = String.raw`(?:in|In|\/-?in|\*in|:in|\(in\))?`
const VOR = String.raw`(^|[\s,;/(])`
const NACH = String.raw`(?=$|[\s,;/)])`
const KURZ_MUSTER = new RegExp(
  String.raw`${VOR}\(?(?:(?:${KUERZEL.join('|')})${KURZ_WEIBLICH}\.?|L(?:${APOSTROPH}?in|${APOSTROPH})?)${ZUR_ANSTELLUNG}\)?${NACH}`,
  'gu'
)
const LANG_MUSTER = new RegExp(String.raw`${VOR}\(?(?:${AUSGESCHRIEBEN.join('|')})${LANG_WEIBLICH}${ZUR_ANSTELLUNG}\)?${NACH}`, 'giu')
/** Was nach dem Entfernen allein kein Name ist */
const NUR_ANREDE = /^(?:(?:Frau|Herr|Herrn|Dr\.|Prof\.|med\.|phil\.|rer\.|nat\.)\s*)*$/i

/** Name für die Unterschrift ohne Amtsbezeichnung; bleibt kein Name übrig (z. B. „Herr Lehrer"), bleibt er unverändert */
export function ohneAmtsbezeichnung(name: string): string {
  const roh = name.trim()
  if (!roh) return ''
  let s = roh
  // Zweimal: Nebeneinanderliegende Bezeichnungen teilen sich das Trennzeichen
  for (let i = 0; i < 2; i++) s = s.replace(KURZ_MUSTER, '$1').replace(LANG_MUSTER, '$1')
  s = s
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/^[\s,;/–-]+|[\s,;/–-]+$/g, '')
    .trim()
  return s && !NUR_ANREDE.test(s) ? s : roh
}
