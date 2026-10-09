/**
 * Arten von KI-Aufträgen (09.10.2026) – aus dem Schemanamen der Anfrage.
 *
 * Gemeinsam für die Zählung der Schulschlüssel am Server (server/kiNutzung.ts, Verwaltung › KI-Zugänge) und den
 * eigenen Verbrauch der Lehrkraft (main/services/ai/verbrauch.ts, Einstellungen › KI-Zugang › Verbrauch).
 */

export const KI_ARTEN = {
  arbeitsblatt: 'Arbeitsblatt',
  pruefung: 'Tests und Arbeiten',
  vokabeln: 'Vokabeln',
  grammatik: 'Grammatik',
  reihe: 'Unterrichtsreihe',
  rueckmeldung: 'Rückmeldung',
  onlinetest: 'Onlinetest',
  tafelbild: 'Tafelbild',
  material: 'Material',
  elternbrief: 'Elternbrief',
  bild: 'Bilder',
  hoertext: 'Vertonung',
  sonstiges: 'Sonstiges'
} as const
export type KiArt = keyof typeof KI_ARTEN

const ART_MUSTER: [RegExp, KiArt][] = [
  [
    /^(worksheet|outline|task_solution|solved_example|glossar|zusatzfragen|figurbeschreibung|zeitleiste|sprechblasen|versuch|schaltplan|zeichnung|stoff|competence|lernziele|ich_kann|vorwissen|blatt_|textauswahl|text_lesbarkeit|mc_|review|bewertungsraster|hoertext|listening|hoervokabular|baustein)/,
    'arbeitsblatt'
  ],
  [/^(exam|lernzielkontrolle|testplan|speaking_exam|grammar_test|vocabulary_test)/, 'pruefung'],
  [/^(vocab|vokabel|verb|abkuerzung)/, 'vokabeln'],
  [/^grammatik/, 'grammatik'],
  [/^(reihe|stundenverlauf|schritt_)/, 'reihe'],
  [/^(rueckmeldung|schueler_lerntipp)/, 'rueckmeldung'],
  [/^onlinetest/, 'onlinetest'],
  [/^tafelbild/, 'tafelbild'],
  [/^(material|verlagsmaterial|schulbuch|image_choice)/, 'material'],
  [/^elternbrief/, 'elternbrief'],
  [/^(bild|tts)$/, 'bild']
]

export function artVonSchema(schemaName: string | undefined, kanal = 'ai:structured'): KiArt {
  if (kanal === 'ai:image') return 'bild'
  if (kanal === 'ai:websuche') return 'material'
  const n = (schemaName ?? '').toLowerCase()
  return ART_MUSTER.find(([re]) => re.test(n))?.[1] ?? 'sonstiges'
}

/** Begrenzung erreicht (429, Kontingent, Guthaben)? */
export const istLimit = (meldung: string): boolean => /\b429\b|limit|kontingent|guthaben|quota|rate/i.test(meldung)
