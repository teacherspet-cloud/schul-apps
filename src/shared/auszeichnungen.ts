/**
 * Medaillen und Titel je Fremdsprache (10.10.2026, mit der Lehrkraft abgestimmt; Konzept
 * recherche/achievements-medaillen-titel.md) – reine Berechnung, ohne Datenbank.
 *
 *  - Je Sprache, in der die Person einen Kurs hat, eine eigene Reihe: sieben Kategorien mit je einer Medaille in sechs
 *    Stufen (Bronze, Silber, Gold, Platin, Diamant, Meister). Bronze ist in wenigen Tagen erreichbar, Meister erst nach
 *    Jahren. Mengen-Kategorien (Wortschatz, Grammatik) richten sich nach dem Jahrgang, damit Klasse 5 nicht benachteiligt
 *    ist; Fleiß-Kategorien (Dranbleiben, Hören & Sprechen, Spiele, Zusammen, Lehrwerk-Etappen) zählen für alle gleich.
 *  - Titel je Sprache aus der Summe der Medaillenstufen (Bronze = 1 … Meister = 6) – nie aus einem Vergleich mit
 *    anderen, für alle erreichbar, nie wieder entzogen. Kulturelle Ränge in der Zielsprache, jeweils männlich, weiblich
 *    und neutral; die Form wählt die Person selbst (nie aus dem Vornamen abgeleitet).
 *  - Altes (die Achievements vom 08.10.2026) wird einmalig auf Medaillen abgebildet – niemand verliert etwas.
 *
 * Jahresreihen (10.10.2026, zweite Entscheidung der Lehrkraft): Jedes Schuljahr (genau nach shared/schulkalender.ts,
 * ohne Daten ab 1. August) öffnet je Sprache eine NEUE Medaillenreihe („Wortschatz Gold · Kl. 7 (2026/27)"). Die
 * Schwellen kommen aus dem Lehrwerksband dieses Schuljahres (Wörter, Grammatik, Kapitel) bzw. aus den Schultagen des
 * Jahres; ohne Lehrwerk aus den Jahrgangstabellen unten. Sie werden beim Start der Reihe festgelegt und nur neu
 * gerechnet, wenn sich Band oder Jahrgang ändert – erreichte Medaillen bleiben immer. Gezählt wird ab Beginn des
 * Schuljahres (Zuwachs seit der letzten Auswertung im alten Jahr; Übungstage genau nach Datum). Der Haupttitel wächst
 * aus den Medaillenpunkten ALLER Jahre; dazu gibt es je Schuljahr einen Jahrestitel („Knight of Year 7"). Formeln und
 * Beispiele: recherche/achievements-medaillen-titel.md, Abschnitt 7.
 */
import { ersterSchultag, istSchultag, letzterSchultag, schulkalender, schuljahrText, schuljahrVon, tagPlus, type SchulkalenderDaten } from './schulkalender'

export type KategorieId = 'wortschatz' | 'grammatik' | 'dranbleiben' | 'hoeren' | 'lehrwerk' | 'spiele' | 'zusammen'
/** 0 = noch keine Medaille, 1 = Bronze … 6 = Meister */
export type MedaillenStufe = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type TitelForm = 'm' | 'w' | 'n'

export const STUFEN_NAMEN = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant', 'Meister'] as const
export const stufenName = (s: number): string => (s >= 1 && s <= 6 ? STUFEN_NAMEN[s - 1] : 'noch keine')

export interface Kategorie {
  id: KategorieId
  name: string
  /** Was zählt – so steht es auch bei den Lernenden */
  text: string
  /** Mengen-Kategorie: Schwellen nach Jahrgang */
  nachJahrgang: boolean
  /** Schwellen für Bronze … Meister bei Klasse 9–10 (Faktor 1) */
  basis: [number, number, number, number, number, number]
}

export const KATEGORIEN: Kategorie[] = [
  {
    id: 'wortschatz',
    name: 'Wortschatz sicher',
    text: 'Jedes Wort ab Fach 2 im Karteikasten zählt einen Punkt, jedes sichere Wort (nach einer Woche noch gewusst) einen weiteren.',
    nachJahrgang: true,
    basis: [20, 150, 500, 1200, 2500, 4500]
  },
  {
    id: 'grammatik',
    name: 'Grammatik sicher',
    text: 'Jede geübte Grammatikregel zählt einen Punkt, jede sichere Regel zwei weitere.',
    nachJahrgang: true,
    basis: [3, 15, 40, 90, 160, 260]
  },
  {
    id: 'dranbleiben',
    name: 'Dranbleiben',
    text: 'Jeder Tag, an dem du in dieser Sprache übst, zählt. Ferien und Wochenenden kosten nichts.',
    nachJahrgang: false,
    basis: [3, 12, 35, 80, 160, 300]
  },
  {
    id: 'hoeren',
    name: 'Hören & Sprechen',
    text: 'Richtige Hör- und Diktataufgaben zählen je einen Punkt, jedes beendete Hörspiel fünf.',
    nachJahrgang: false,
    basis: [10, 60, 200, 500, 1000, 2000]
  },
  {
    id: 'lehrwerk',
    name: 'Lehrwerk-Etappen',
    text: 'Eine Unit zu 80 % kennengelernt ist eine Etappe, zu 80 % sicher zwei weitere.',
    nachJahrgang: false,
    basis: [1, 4, 10, 20, 35, 55]
  },
  {
    id: 'spiele',
    name: 'Spiele',
    text: 'Jedes zu Ende gespielte Spiel zählt einen Punkt, jeder gebrochene eigene Rekord einen weiteren.',
    nachJahrgang: false,
    basis: [3, 20, 60, 150, 300, 600]
  },
  {
    id: 'zusammen',
    name: 'Zusammen spielen',
    text: 'Jede gemeinsame Runde zählt einen Punkt, jedes gemeinsam erreichte Team-Ziel einen weiteren.',
    nachJahrgang: false,
    basis: [1, 8, 25, 60, 120, 220]
  }
]
export const KATEGORIE_IDS = KATEGORIEN.map((k) => k.id)

/** Jahrgangsband und Faktor für die Mengen-Kategorien; ohne Angabe wie Klasse 7–8 */
export const JAHRGANGS_BAENDER: { von: number; bis: number; name: string; faktor: number }[] = [
  { von: 1, bis: 6, name: 'Klasse 5–6', faktor: 0.6 },
  { von: 7, bis: 8, name: 'Klasse 7–8', faktor: 0.8 },
  { von: 9, bis: 10, name: 'Klasse 9–10', faktor: 1 },
  { von: 11, bis: 13, name: 'Klasse 11–13', faktor: 1.2 }
]
export function jahrgangsBand(jahrgang: number | null | undefined): (typeof JAHRGANGS_BAENDER)[number] {
  const j = Number(jahrgang)
  return JAHRGANGS_BAENDER.find((b) => j >= b.von && j <= b.bis) ?? JAHRGANGS_BAENDER[1]
}

/** Schwellen einer Kategorie für einen Jahrgang – gerundet, mindestens 1, streng steigend */
export function schwellen(kategorie: KategorieId, jahrgang: number | null | undefined): number[] {
  const k = KATEGORIEN.find((x) => x.id === kategorie)
  if (!k) return [1, 2, 3, 4, 5, 6]
  const f = k.nachJahrgang ? jahrgangsBand(jahrgang).faktor : 1
  const aus: number[] = []
  for (const b of k.basis) {
    const roh = Math.max(1, Math.round(b * f))
    aus.push(aus.length && roh <= aus[aus.length - 1] ? aus[aus.length - 1] + 1 : roh)
  }
  return aus
}

/** Erreichte Stufe für einen Wert */
export function stufeFuer(wert: number, s: number[]): MedaillenStufe {
  let n = 0
  for (const x of s) if (wert >= x) n++
  return Math.min(6, n) as MedaillenStufe
}

export type Werte = Record<KategorieId, number>
export const LEERE_WERTE = (): Werte => ({ wortschatz: 0, grammatik: 0, dranbleiben: 0, hoeren: 0, lehrwerk: 0, spiele: 0, zusammen: 0 })

export interface MedaillenSicht {
  kategorie: KategorieId
  name: string
  text: string
  /** Gehaltene Stufe (nie entzogen) */
  stufe: MedaillenStufe
  wert: number
  /** Schwelle der nächsten Stufe – null bei Meister */
  ziel: number | null
  /** Schwelle der gehaltenen Stufe (Start des Fortschrittsbalkens) */
  von: number
  am: number | null
}

/**
 * Medaillen einer Sprache: aus den Werten und dem Gespeicherten (die höhere Stufe gilt – nichts wird entzogen).
 */
export function medaillen(werte: Partial<Werte>, jahrgang: number | null | undefined, gespeichert: Partial<Record<KategorieId, { stufe: number; am: number }>> = {}): MedaillenSicht[] {
  return medaillenMit(werte, Object.fromEntries(KATEGORIE_IDS.map((k) => [k, schwellen(k, jahrgang)])) as Record<KategorieId, number[]>, gespeichert)
}

/** Wie `medaillen`, aber mit festen Schwellen je Kategorie (Jahresreihe) */
export function medaillenMit(
  werte: Partial<Werte>,
  s0: Partial<Record<KategorieId, number[]>>,
  gespeichert: Partial<Record<KategorieId, { stufe: number; am: number }>> = {}
): MedaillenSicht[] {
  return KATEGORIEN.map((k) => {
    const s = s0[k.id]?.length === 6 ? s0[k.id]! : schwellen(k.id, null)
    const wert = Math.max(0, Math.floor(Number(werte[k.id]) || 0))
    const g = gespeichert[k.id]
    const stufe = Math.max(stufeFuer(wert, s), Math.min(6, Math.max(0, Math.floor(g?.stufe ?? 0)))) as MedaillenStufe
    return { kategorie: k.id, name: k.name, text: k.text, stufe, wert, ziel: stufe >= 6 ? null : s[stufe], von: stufe ? s[stufe - 1] : 0, am: g?.am ?? null }
  })
}

/** Zahl mit Tausenderpunkt („1.240") */
export const zahlText = (n: number): string => Math.round(n).toLocaleString('de-DE')

/**
 * Die nächste Stufe in Worten (10.10.2026, Jahresreihen): „bei 240 Punkten (etwa 120 sichere Wörter)", „bei 38
 * Übungstagen", „bei 5 Etappen" – konkrete Zahlen statt nur eines Balkens.
 */
export function naechsteStufeText(k: KategorieId, ziel: number): string {
  const z = zahlText(ziel)
  if (k === 'wortschatz') return `bei ${z} Punkten (etwa ${zahlText(Math.ceil(ziel / 2))} sichere Wörter)`
  if (k === 'dranbleiben') return `bei ${z} ${ziel === 1 ? 'Übungstag' : 'Übungstagen'}`
  if (k === 'lehrwerk') return `bei ${z} ${ziel === 1 ? 'Etappe' : 'Etappen'}`
  return `bei ${z} ${ziel === 1 ? 'Punkt' : 'Punkten'}`
}

/** Punkte für den Titel: Summe der Stufen (Bronze = 1 … Meister = 6), höchstens 42 */
export const medaillenPunkte = (stufen: Iterable<number>): number => {
  let p = 0
  for (const s of stufen) p += Math.min(6, Math.max(0, Math.floor(Number(s) || 0)))
  return p
}

// ---------------------------------------------------------------- Titel

/**
 * Ab wie vielen Medaillenpunkten ein Titel erreicht ist. Der erste kommt mit der ersten Bronzemedaille (erste Woche),
 * die mittleren über ein Schuljahr, die obersten über mehrere Jahre. 30 von 42 möglichen Punkten genügen für den
 * höchsten – so bleibt er erreichbar, auch wenn ein Kurs etwa keine Grammatik oder kein gemeinsames Spielen anbietet.
 */
export const TITEL_AB = [1, 3, 6, 10, 15, 20, 25, 30] as const

/**
 * Haupttitel (seit den Jahresreihen, 10.10.2026): aus den Medaillenpunkten ALLER Schuljahre – je Jahr höchstens 42.
 * Die ersten vier Stufen wie bisher (niemand verliert etwas an Bedeutung), danach steiler: wer jedes Jahr rund 20 Punkte
 * sammelt, steht nach etwa vier Jahren ganz oben. Die Jahrestitel nutzen TITEL_AB mit den Punkten nur dieses Jahres.
 */
export const TITEL_AB_GESAMT = [1, 3, 6, 10, 20, 35, 55, 80] as const

export interface TitelStufe {
  m: string
  w: string
  n: string
  /** Kurze Erklärung auf Deutsch */
  de: string
}

const t = (m: string, w: string, n: string, de: string): TitelStufe => ({ m, w, n, de })

/** Titelleitern in der Zielsprache – je acht Stufen */
export const TITEL_LEITERN: Record<string, TitelStufe[]> = {
  en: [
    t('Traveller', 'Traveller', 'Traveller', 'Reisende Person – du bist im Land angekommen.'),
    t('Citizen', 'Citizen', 'Citizen', 'Bürgerin oder Bürger – du gehörst dazu.'),
    t('Squire', 'Squire', 'Squire', 'Knappe – in der Ausbildung zum Ritter.'),
    t('Sir', 'Dame', 'Knight', 'Ritterschlag: Sir, Dame oder Knight.'),
    t('Lord', 'Lady', 'Noble', 'Adelstitel: Lord, Lady oder Noble.'),
    t('Royal Ambassador', 'Royal Ambassador', 'Royal Ambassador', 'Botschaft der Krone im Ausland.'),
    t('Royal Councillor', 'Royal Councillor', 'Royal Councillor', 'Ratgeberin oder Ratgeber der Krone.'),
    t('Keeper of the Crown', 'Keeper of the Crown', 'Keeper of the Crown', 'Hüterin oder Hüter der Krone – über Jahre verdient.')
  ],
  fr: [
    t('Voyageur', 'Voyageuse', 'Nomade', 'Reisende Person – du bist im Land angekommen.'),
    t('Citoyen', 'Citoyenne', 'Citoyen·ne', 'Bürgerin oder Bürger – du gehörst dazu.'),
    t('Écuyer', 'Écuyère', 'Écuyer·ère', 'Knappe – in der Ausbildung zum Ritter.'),
    t('Chevalier', 'Chevalière', 'Chevalier·ère', 'Ritterin oder Ritter.'),
    t('Marquis', 'Marquise', 'Noble', 'Adelstitel: Marquis oder Marquise.'),
    t('Duc', 'Duchesse', 'Altesse', 'Herzogin oder Herzog – „Altesse" ist die neutrale Anrede.'),
    t('Ambassadeur', 'Ambassadrice', 'Diplomate', 'Botschafterin oder Botschafter.'),
    t('Gardien de la Couronne', 'Gardienne de la Couronne', 'Garde de la Couronne', 'Hüterin oder Hüter der Krone – über Jahre verdient.')
  ],
  es: [
    t('Viajero', 'Viajera', 'Trotamundos', 'Reisende Person – du bist im Land angekommen.'),
    t('Ciudadano', 'Ciudadana', 'Habitante', 'Bürgerin oder Bürger – du gehörst dazu.'),
    t('Escudero', 'Escudera', 'Aprendiz', 'Knappe – in der Ausbildung zum Ritter.'),
    t('Caballero', 'Dama', 'Adalid', 'Ritter oder Dame; „Adalid" heißt Anführerin oder Anführer.'),
    t('Hidalgo', 'Hidalga', 'Noble', 'Niederer Adel Spaniens.'),
    t('Conde', 'Condesa', 'Excelencia', 'Gräfin oder Graf – „Excelencia" ist die neutrale Anrede.'),
    t('Embajador', 'Embajadora', 'Representante', 'Botschafterin oder Botschafter.'),
    t('Guardián de la Corona', 'Guardiana de la Corona', 'Guarda de la Corona', 'Hüterin oder Hüter der Krone – über Jahre verdient.')
  ],
  la: [
    t('Peregrinus', 'Peregrina', 'Hospes', 'Fremde Person in Rom; „hospes" heißt Gast.'),
    t('Civis', 'Civis', 'Civis', 'Bürgerin oder Bürger Roms.'),
    t('Quaestor', 'Quaestor', 'Quaestor', 'Erstes Amt der Ämterlaufbahn (cursus honorum): Kasse und Finanzen.'),
    t('Aedilis', 'Aedilis', 'Aedilis', 'Zuständig für Märkte, Straßen und Spiele.'),
    t('Praetor', 'Praetor', 'Praetor', 'Richterin oder Richter.'),
    t('Consul', 'Consul', 'Consul', 'Höchstes Jahresamt der Republik.'),
    t('Senator', 'Senator', 'Senator', 'Mitglied des Senats – Rat der Erfahrenen.'),
    t('Pater Patriae', 'Mater Patriae', 'Custos Patriae', 'Vater, Mutter oder Hüter des Vaterlandes – über Jahre verdient.')
  ],
  it: [
    t('Viaggiatore', 'Viaggiatrice', 'Giramondo', 'Reisende Person – du bist im Land angekommen.'),
    t('Cittadino', 'Cittadina', 'Abitante', 'Bürgerin oder Bürger – du gehörst dazu.'),
    t('Scudiero', 'Scudiera', 'Apprendista', 'Knappe – in der Ausbildung zum Ritter.'),
    t('Cavaliere', 'Dama', 'Cavaliere', 'Ritter oder Dame (Cavaliere gilt in Italien für alle).'),
    t('Marchese', 'Marchesa', 'Nobile', 'Adelstitel.'),
    t('Conte', 'Contessa', 'Eccellenza', 'Gräfin oder Graf – „Eccellenza" ist die neutrale Anrede.'),
    t('Ambasciatore', 'Ambasciatrice', 'Rappresentante', 'Botschafterin oder Botschafter.'),
    t('Custode della Corona', 'Custode della Corona', 'Custode della Corona', 'Hüterin oder Hüter der Krone – über Jahre verdient.')
  ],
  /** Alle anderen Sprachen: eine neutrale Leiter auf Deutsch (gleiche Form für alle) */
  allgemein: [
    t('Gast', 'Gast', 'Gast', 'Du bist angekommen.'),
    t('Mitglied', 'Mitglied', 'Mitglied', 'Du gehörst dazu.'),
    t('Talent', 'Talent', 'Talent', 'Man sieht, was in dir steckt.'),
    t('Ehrengast', 'Ehrengast', 'Ehrengast', 'Gern gesehen.'),
    t('Ehrenmitglied', 'Ehrenmitglied', 'Ehrenmitglied', 'Mit Auszeichnung dabei.'),
    t('Vorbild', 'Vorbild', 'Vorbild', 'Dein Dranbleiben steckt an.'),
    t('Sprachgenie', 'Sprachgenie', 'Sprachgenie', 'Die Sprache sitzt.'),
    t('Legende', 'Legende', 'Legende', 'Über Jahre verdient.')
  ]
}

export const titelLeiter = (sprache: string): TitelStufe[] => TITEL_LEITERN[sprache] ?? TITEL_LEITERN.allgemein

/** Titelstufe aus Punkten (Jahrestitel – Punkte eines Schuljahres): 0 = noch kein Titel, 1 … 8 */
export function titelStufe(punkte: number): number {
  let n = 0
  for (const ab of TITEL_AB) if (punkte >= ab) n++
  return n
}

/** Stufe des Haupttitels aus den Punkten aller Schuljahre */
export function titelStufeGesamt(punkte: number): number {
  let n = 0
  for (const ab of TITEL_AB_GESAMT) if (punkte >= ab) n++
  return n
}

/** Klassenstufe in der Zielsprache – für den Jahrestitel („of Year 7", „de la 5e" …) */
const KLASSE_FR: Record<number, string> = {
  5: 'du CM2',
  6: 'de la 6e',
  7: 'de la 5e',
  8: 'de la 4e',
  9: 'de la 3e',
  10: 'de la Seconde',
  11: 'de la Première',
  12: 'de la Terminale',
  13: 'de la 13e année'
}
const KLASSE_ES: Record<number, string> = {
  5: 'de 5.º de Primaria',
  6: 'de 6.º de Primaria',
  7: 'de 1.º de ESO',
  8: 'de 2.º de ESO',
  9: 'de 3.º de ESO',
  10: 'de 4.º de ESO',
  11: 'de 1.º de Bachillerato',
  12: 'de 2.º de Bachillerato',
  13: 'del 13.º curso'
}
const KLASSE_IT: Record<number, string> = {
  5: 'della quinta elementare',
  6: 'della prima media',
  7: 'della seconda media',
  8: 'della terza media',
  9: 'del primo anno',
  10: 'del secondo anno',
  11: 'del terzo anno',
  12: 'del quarto anno',
  13: 'del quinto anno'
}
const ORDINAL_LA: Record<number, string> = {
  1: 'primi',
  2: 'secundi',
  3: 'tertii',
  4: 'quarti',
  5: 'quinti',
  6: 'sexti',
  7: 'septimi',
  8: 'octavi',
  9: 'noni',
  10: 'decimi',
  11: 'undecimi',
  12: 'duodecimi',
  13: 'tertii decimi'
}

/**
 * Jahrestitel (10.10.2026): der Titel der Stufe, die in diesem Schuljahr erreicht wurde, mit Klassenstufe in der
 * Zielsprache – „Knight of Year 7", „Chevalière de la 5e", „Caballero de 1.º de ESO", „Consul anni septimi",
 * „Talent der Klasse 7". Ohne Jahrgang mit dem Schuljahr („Knight of 2026/27"). null ohne Titel.
 */
export function jahresTitelText(sprache: string, stufe: number, form: TitelForm | null | undefined, jahrgang: number | null | undefined, schuljahr: number): string | null {
  const t = titelText(sprache, stufe, form)
  if (!t) return null
  const j = Number(jahrgang) >= 1 && Number(jahrgang) <= 13 ? Math.floor(Number(jahrgang)) : null
  const sj = schuljahrText(schuljahr)
  switch (TITEL_LEITERN[sprache] ? sprache : 'allgemein') {
    case 'en':
      return j ? `${t} of Year ${j}` : `${t} of ${sj}`
    case 'fr':
      return j && KLASSE_FR[j] ? `${t} ${KLASSE_FR[j]}` : `${t} de l’année ${sj}`
    case 'es':
      return j && KLASSE_ES[j] ? `${t} ${KLASSE_ES[j]}` : `${t} del curso ${sj}`
    case 'it':
      return j && KLASSE_IT[j] ? `${t} ${KLASSE_IT[j]}` : `${t} dell’anno ${sj}`
    case 'la':
      return j && ORDINAL_LA[j] ? `${t} anni ${ORDINAL_LA[j]}` : `${t} anni ${sj}`
    default:
      return j ? `${t} der Klasse ${j}` : `${t} ${sj}`
  }
}

/** Titel in der gewählten Form; ohne Wahl neutral. null ohne Titel */
export function titelText(sprache: string, stufe: number, form: TitelForm | null | undefined): string | null {
  const l = titelLeiter(sprache)
  const s = Math.min(l.length, Math.floor(stufe))
  if (s < 1) return null
  const x = l[s - 1]
  return form === 'm' ? x.m : form === 'w' ? x.w : x.n
}

/** Unterscheiden sich die Formen dieser Stufe? (Sonst muss nicht gewählt werden.) */
export const hatFormen = (sprache: string, stufe: number): boolean => {
  const x = titelLeiter(sprache)[Math.floor(stufe) - 1]
  return Boolean(x && (x.m !== x.w || x.m !== x.n))
}

/** Anzeige vor dem Namen: „Sir Lars", ohne Titel nur der Name */
export function mitTitel(titel: string | null | undefined, name: string): string {
  const n = name.trim()
  const ti = (titel ?? '').trim()
  return ti ? (n ? `${ti} ${n}` : ti) : n
}

/** Was die Person gewählt hat: Form und angezeigter Titel ('aus' = keiner; ohne Wahl der höchste) */
export interface TitelWahl {
  form?: TitelForm
  anzeige?: { sprache: string; stufe: number } | 'aus'
}

/**
 * Der angezeigte Titel (Startseite): gewählter Titel, wenn noch erreicht; ohne Wahl der höchste über alle Sprachen
 * (bei Gleichstand die Sprache mit mehr Punkten); 'aus' = keiner.
 */
export function angezeigterTitel(erreicht: Record<string, { stufe: number; punkte?: number }>, wahl: TitelWahl): { sprache: string; stufe: number; text: string } | null {
  if (wahl.anzeige === 'aus') return null
  const form = wahl.form
  if (wahl.anzeige && typeof wahl.anzeige === 'object') {
    const { sprache, stufe } = wahl.anzeige
    if ((erreicht[sprache]?.stufe ?? 0) >= stufe && stufe >= 1) {
      const text = titelText(sprache, stufe, form)
      if (text) return { sprache, stufe, text }
    }
  }
  const beste = Object.entries(erreicht)
    .filter(([, e]) => e.stufe >= 1)
    .sort((a, b) => b[1].stufe - a[1].stufe || (b[1].punkte ?? 0) - (a[1].punkte ?? 0) || a[0].localeCompare(b[0]))[0]
  if (!beste) return null
  const text = titelText(beste[0], beste[1].stufe, form)
  return text ? { sprache: beste[0], stufe: beste[1].stufe, text } : null
}

/**
 * Titel im Spielraum (Lobby) einer Sprache: der dort erreichte – der gewählte, wenn er aus dieser Sprache stammt, sonst
 * der höchste dieser Sprache. 'aus' = keiner.
 */
export function titelFuerSprache(sprache: string, stufe: number, wahl: TitelWahl): string | null {
  if (wahl.anzeige === 'aus' || stufe < 1) return null
  const s = wahl.anzeige && typeof wahl.anzeige === 'object' && wahl.anzeige.sprache === sprache && wahl.anzeige.stufe <= stufe ? wahl.anzeige.stufe : stufe
  return titelText(sprache, s, wahl.form)
}

// ---------------------------------------------------------------- Sprachen

const SPRACH_NAMEN: Record<string, string> = {
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  la: 'Latein',
  ru: 'Russisch',
  grc: 'Griechisch',
  el: 'Neugriechisch',
  nl: 'Niederländisch',
  pl: 'Polnisch',
  cs: 'Tschechisch',
  pt: 'Portugiesisch',
  tr: 'Türkisch',
  zh: 'Chinesisch',
  ja: 'Japanisch',
  ar: 'Arabisch',
  da: 'Dänisch'
}
export const sprachName = (s: string): string => SPRACH_NAMEN[s] ?? s.toUpperCase()

// ---------------------------------------------------------------- Übernahme der alten Achievements

/** Kategorie eines alten Achievements (08.10.2026) – null: zählt für keine Medaille */
export function alteKategorie(id: string, gruppe: string): KategorieId | null {
  if (id.startsWith('diktat-')) return 'hoeren'
  if (id.startsWith('hand-')) return 'wortschatz'
  if (id.startsWith('stammformen-')) return 'grammatik'
  if (gruppe === 'dranbleiben' || gruppe === 'lehrwerk' || gruppe === 'wortschatz' || gruppe === 'grammatik' || gruppe === 'spiele' || gruppe === 'zusammen')
    return gruppe
  return null
}

const ALTE_STUFE: Record<string, MedaillenStufe> = { bronze: 1, silber: 2, gold: 3 }

/**
 * Einmalige Übernahme (10.10.2026): Jedes erreichte alte Achievement gibt in seiner Kategorie mindestens seine alte
 * Stufe (Bronze/Silber/Gold; ohne Stufe Bronze). Höher als Gold geht es nie – Platin und darüber gab es vorher nicht.
 */
export function uebernahmeAusAlt(erreicht: Record<string, { gruppe: string; medaille: string | null }>): Partial<Record<KategorieId, MedaillenStufe>> {
  const aus: Partial<Record<KategorieId, MedaillenStufe>> = {}
  for (const [id, a] of Object.entries(erreicht)) {
    const k = alteKategorie(id, a.gruppe)
    if (!k) continue
    const s = ALTE_STUFE[a.medaille ?? ''] ?? 1
    if (s > (aus[k] ?? 0)) aus[k] = s
  }
  return aus
}

// ---------------------------------------------------------------- Zähler je Sprache

/** Was sich nur im Moment des Geschehens zählen lässt – je Sprache */
export interface SprachZaehler {
  /** Einzelspiele zu Ende gespielt */
  spielrunden: number
  /** Eigene Rekorde gebrochen */
  rekorde: number
  /** Richtige Hör- und Diktataufgaben + 5 je Hörspiel */
  hoeren: number
  /** Gemeinsame Runden (Kooperativ und Versus) */
  zusammenRunden: number
  teamZiele: number
}
export const LEERE_SPRACH_ZAEHLER = (): SprachZaehler => ({ spielrunden: 0, rekorde: 0, hoeren: 0, zusammenRunden: 0, teamZiele: 0 })

/** Übungen im Kasten, die Hören trainieren */
export const HOER_UEBUNGEN = new Set(['hoeren', 'diktat', 'buchstaben'])
/** Spiele (Rekordbuch-Schlüssel), die Hören trainieren */
export const HOER_SPIELE = new Set([
  'vok:hoeren',
  'vok:satzhoeren',
  'vok:diktat',
  'vok:hoermemory',
  'vok:richtiggehoert',
  'vok:buchstaben',
  'vok:hoerbingo',
  'vok:formenblitz',
  'gram:formenblitz',
  'koop:hoerkette'
])
export const HOERSPIEL_PUNKTE = 5

/** Werte einer Sprache, die aus Zählern stammen */
export function zaehlerWerte(z: Partial<SprachZaehler>): Pick<Werte, 'hoeren' | 'spiele' | 'zusammen'> {
  const n = (x: unknown): number => Math.max(0, Math.floor(Number(x) || 0))
  return { hoeren: n(z.hoeren), spiele: n(z.spielrunden) + n(z.rekorde), zusammen: n(z.zusammenRunden) + n(z.teamZiele) }
}

// ---------------------------------------------------------------- Fortschreiben (Server: achievements.ts)

/** Was der Server je Sprache sammelt */
export interface SprachEingabe {
  sprache: string
  /** Jahrgang des Kurses (der neueste mit Angabe), sonst null */
  jahrgang: number | null
  /** Wörter ab Fach 2 und sichere Wörter (gleiches Wort zählt einmal) */
  woerterAb2: number
  woerterSicher: number
  regelnGeuebt: number
  regelnSicher: number
  /** Verschiedene Übungstage in dieser Sprache */
  tage: number
  /** Units aus den eigenen Kursen: Wörter gesamt, kennengelernt, sicher */
  units: { gesamt: number; gelernt: number; sicher: number }[]
  zaehler: Partial<SprachZaehler>
  /** Schuljahr dieser Auswertung (Jahresreihe, 10.10.2026) – ohne Angabe: Schuljahr von `jetzt`, Grundlage nach Jahrgang */
  jahr?: JahresKontext
}

/** Lehrwerk-Etappen: Unit zu 80 % kennengelernt = 1, zu 80 % sicher = 2 weitere */
export function etappen(units: SprachEingabe['units']): number {
  let n = 0
  for (const u of units) {
    if (!u.gesamt) continue
    if (u.gelernt / u.gesamt >= 0.8 - 1e-9) n++
    if (u.sicher / u.gesamt >= 0.8 - 1e-9) n += 2
  }
  return n
}

export function sprachWerte(e: SprachEingabe): Werte {
  const n = (x: unknown): number => Math.max(0, Math.floor(Number(x) || 0))
  return {
    wortschatz: n(e.woerterAb2) + n(e.woerterSicher),
    grammatik: n(e.regelnGeuebt) + 2 * n(e.regelnSicher),
    dranbleiben: n(e.tage),
    lehrwerk: etappen(e.units),
    ...zaehlerWerte(e.zaehler)
  }
}

// ---------------------------------------------------------------- Schuljahr (Jahresreihen, 10.10.2026)

/** Woraus die Schwellen eines Schuljahres gerechnet werden – fest für dieses Jahr */
export interface JahresGrundlage {
  jahrgang: number | null
  /** Band des Schuljahres (Kennung und Name) – null ohne Lehrwerk */
  band: { id: string; name: string } | null
  /** Wörter des Bands (verschiedene Begriffe) – null: unbekannt (Platzhalter, kein Band) */
  woerter: number | null
  /** Grammatikthemen des Bands – null: unbekannt */
  grammatik: number | null
  /** Kapitel (Units) des Bands mit Wörtern – null: unbekannt */
  units: number | null
  /** Schultage des ganzen Schuljahres (Montag–Freitag ohne Ferien und Feiertage) */
  schultage: number
}

/** Was die Auswertung je Sprache für das laufende Schuljahr mitbringt */
export interface JahresKontext {
  /** Beginn-Jahr (2026 = 2026/27) */
  schuljahr: number
  grundlage: JahresGrundlage
  /** Verschiedene Übungstage dieser Sprache im Schuljahr */
  tageImJahr: number
  /** Lehrwerk-Etappen im Band des Jahres (alle seine Kapitel); null = Band unbekannt → Zuwachs seit Jahresbeginn */
  bandEtappen: number | null
}

/** Eine Jahresreihe einer Sprache */
export interface JahrStand {
  jahrgang: number | null
  /** Band + Jahrgang, aus denen die Schwellen stammen – ändert er sich, werden sie neu gerechnet */
  basis?: string
  grundlage?: JahresGrundlage
  schwellen?: Partial<Record<KategorieId, number[]>>
  /** Gesamtwerte zu Beginn der Reihe – gezählt wird der Zuwachs */
  start: Partial<Werte>
  /** Gesamtwerte bei der letzten Auswertung in diesem Jahr (Start der nächsten Reihe) */
  zuletzt?: Partial<Werte>
  medaillen: Partial<Record<KategorieId, { stufe: number; am: number }>>
  /** Jahrestitel */
  titel?: { stufe: number; am: number }
}

/** Anteile der Höchstpunkte für Bronze … Meister (Wortschatz, Grammatik) */
export const ANTEILE = [0.02, 0.1, 0.25, 0.45, 0.7, 0.9] as const
/** Lehrwerk-Etappen: Bronze = 1 Etappe, Meister = alle Kapitel zu 80 % sicher (3 Etappen je Kapitel) */
export const ETAPPEN_ANTEILE = [0, 0.15, 0.35, 0.55, 0.75, 1] as const
/** Zeit-Kategorien: Anteile der Jahresbasis für Silber … Meister (Bronze fest, in der ersten Woche erreichbar) */
export const ZEIT_ANTEILE = [0, 0.08, 0.2, 0.4, 0.6, 0.8] as const
/** Zeit-Kategorien: Bronze und Basis (Dranbleiben: Schultage des Jahres; sonst Punkte je Schulwoche × Schulwochen) */
export const ZEIT_KATEGORIEN: Record<'dranbleiben' | 'spiele' | 'hoeren' | 'zusammen', { bronze: number; jeWoche: number | null }> = {
  dranbleiben: { bronze: 3, jeWoche: null },
  spiele: { bronze: 3, jeWoche: 12 },
  hoeren: { bronze: 10, jeWoche: 40 },
  zusammen: { bronze: 1, jeWoche: 3 }
}
/** Ohne Kalenderdaten: übliche Zahl der Schultage (Niedersachsen, rund 38 Schulwochen) */
export const SCHULTAGE_UEBLICH = 188

/** Gut lesbar runden: bis 50 genau, bis 200 auf 5, darüber auf 10 */
export const schoeneZahl = (x: number): number => {
  const r = Math.round(x)
  return r <= 50 ? r : r <= 200 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10
}

/** Streng steigend, mindestens 1 */
function steigend(werte: number[]): number[] {
  const aus: number[] = []
  for (const w of werte) {
    const x = Math.max(1, Math.round(w))
    aus.push(aus.length && x <= aus[aus.length - 1] ? aus[aus.length - 1] + 1 : x)
  }
  return aus
}

/**
 * Typischer Band (10.10.2026, Entscheidung der Lehrkraft): gilt, wenn Wörter, Grammatik oder Kapitel des Bands nicht
 * bekannt sind (kein Lehrwerk, Platzhalter ohne Wortliste) – statt der früheren Jahrgangstabellen.
 */
export const TYPISCHER_BAND = { woerter: 900, grammatik: 15, units: 9 } as const

const etappenSchwellen = (u: number): number[] => steigend(ETAPPEN_ANTEILE.map((p, i) => (i === 0 ? 1 : i === 5 ? 3 * u : Math.round(p * 3 * u))))

/** Schwellen eines Schuljahres aus seiner Grundlage (ohne bekannten Umfang: ein typischer Band) */
export function jahresSchwellen(g: JahresGrundlage): Record<KategorieId, number[]> {
  const anteilig = (max: number, mindest: number): number[] => steigend(ANTEILE.map((p, i) => (i === 0 ? Math.max(mindest, Math.round(p * max)) : schoeneZahl(p * max))))
  const wochen = Math.max(1, g.schultage) / 5
  const zeit = (k: keyof typeof ZEIT_KATEGORIEN): number[] => {
    const z = ZEIT_KATEGORIEN[k]
    const basis = z.jeWoche === null ? Math.max(1, g.schultage) : z.jeWoche * wochen
    return steigend(ZEIT_ANTEILE.map((p, i) => (i === 0 ? z.bronze : schoeneZahl(p * basis))))
  }
  return {
    // Ohne bekannten Umfang (10.10.2026, Entscheidung der Lehrkraft): ein typischer Band statt der Jahrgangstabellen
    wortschatz: anteilig(2 * (g.woerter || TYPISCHER_BAND.woerter), 5),
    grammatik: anteilig(3 * (g.grammatik || TYPISCHER_BAND.grammatik), 2),
    lehrwerk: etappenSchwellen(g.units || TYPISCHER_BAND.units),
    dranbleiben: zeit('dranbleiben'),
    spiele: zeit('spiele'),
    hoeren: zeit('hoeren'),
    zusammen: zeit('zusammen')
  }
}

/**
 * Schlüssel der Grundlage: Band, Jahrgang und welche Umfänge bekannt sind (ändert er sich, werden die Schwellen neu
 * gerechnet – etwa wenn ein Platzhalter-Band Wörter bekommt). Geänderte Zahlen allein ändern nichts.
 */
export const grundlageSchluessel = (g: JahresGrundlage): string =>
  // „v2": Rückfall typischer Band statt Jahrgangstabelle – ältere Schwellen werden einmal neu gerechnet (Erreichtes bleibt)
  `v2|${g.band?.id ?? '-'}|${g.jahrgang ?? '-'}|${g.woerter ? 'w' : '-'}${g.grammatik ? 'g' : '-'}${g.units ? 'u' : '-'}`

/** Erster und letzter Tag eines Schuljahres und seine Schultage (ohne Kalenderdaten: 1.8.–31.7., übliche Zahl) */
export function schuljahrRahmen(schuljahr: number, k: SchulkalenderDaten | null = schulkalender()): { schuljahr: number; beginn: string; ende: string; schultage: number; geschaetzt: boolean } {
  const erster = ersterSchultag(schuljahr, k)
  const naechster = ersterSchultag(schuljahr + 1, k)
  const beginn = erster ?? `${schuljahr}-08-01`
  const ende = naechster ? tagPlus(naechster, -1) : `${schuljahr + 1}-07-31`
  const letzter = letzterSchultag(schuljahr, k)
  if (!k || !erster || !letzter) return { schuljahr, beginn, ende, schultage: SCHULTAGE_UEBLICH, geschaetzt: true }
  let n = 0
  for (let t = erster, i = 0; t <= letzter && i < 400; t = tagPlus(t, 1), i++) if (istSchultag(t, k)) n++
  return { schuljahr, beginn, ende, schultage: n || SCHULTAGE_UEBLICH, geschaetzt: !n }
}

/** Übungstage im Schuljahr (nach Datum) */
export const tageImRahmen = (tage: Iterable<string>, r: { beginn: string; ende: string }): number => {
  let n = 0
  for (const t of new Set(tage)) if (t >= r.beginn && t <= r.ende) n++
  return n
}

/** „Kl. 7 (2026/27)" bzw. „2026/27" ohne Jahrgang */
export const jahresLabel = (jahrgang: number | null | undefined, schuljahr: number): string => (jahrgang ? `Kl. ${jahrgang} (${schuljahrText(schuljahr)})` : schuljahrText(schuljahr))

/** Kontext ohne Server-Angaben (Tests, Übernahme): Schuljahr von `jetzt`, Grundlage nach Jahrgang, alle Tage zählen */
export function standardKontext(e: Pick<SprachEingabe, 'jahrgang' | 'tage'>, jetzt: number): JahresKontext {
  const schuljahr = schuljahrVon(jetzt)
  return {
    schuljahr,
    grundlage: { jahrgang: e.jahrgang, band: null, woerter: null, grammatik: null, units: null, schultage: schuljahrRahmen(schuljahr).schultage },
    tageImJahr: Math.max(0, Math.floor(Number(e.tage) || 0)),
    bandEtappen: null
  }
}

/** Werte des Schuljahres: Zuwachs seit Beginn der Reihe; Tage nach Datum; Etappen im Band des Jahres */
export function jahresWerte(gesamt: Werte, start: Partial<Werte>, k: Pick<JahresKontext, 'tageImJahr' | 'bandEtappen'>): Werte {
  const zuwachs = (x: KategorieId): number => Math.max(0, gesamt[x] - Math.max(0, Math.floor(Number(start[x]) || 0)))
  return {
    wortschatz: zuwachs('wortschatz'),
    grammatik: zuwachs('grammatik'),
    dranbleiben: Math.max(0, Math.floor(k.tageImJahr)),
    lehrwerk: k.bandEtappen === null ? zuwachs('lehrwerk') : Math.max(0, Math.floor(k.bandEtappen)),
    spiele: zuwachs('spiele'),
    hoeren: zuwachs('hoeren'),
    zusammen: zuwachs('zusammen')
  }
}

/** Gespeicherter Stand je Person (in den Achievement-Daten) */
export interface AuszStand {
  /** Beste je erreichte Stufe je Kategorie über alle Jahre (Bilder der Sammlung, Profilbild) */
  medaillen: Record<string, Partial<Record<KategorieId, { stufe: number; am: number }>>>
  /** Haupttitel (aus den Punkten aller Jahre) */
  titel: Record<string, { stufe: number; am: number }>
  /** Jahresreihen je Sprache und Schuljahr („2026") – fehlt vor der Umstellung (`jahreUmstellen`) */
  jahre?: Record<string, Record<string, JahrStand>>
}

export type AuszNeu =
  | { art: 'medaille'; sprache: string; kategorie: KategorieId; stufe: number; schuljahr?: number; jahrgang?: number | null }
  | { art: 'titel'; sprache: string; stufe: number }
  | { art: 'jahrestitel'; sprache: string; stufe: number; schuljahr: number; jahrgang: number | null }

/**
 * Einmalige Umstellung auf Jahresreihen (10.10.2026, Entscheidung der Lehrkraft): Die bisherigen Medaillen gehören zum
 * laufenden Schuljahr – nichts geht verloren, der Jahrestitel kommt aus ihren Punkten. Gezählt wurde bis dahin ab null,
 * also beginnt diese Reihe bei null. Wiederholt aufgerufen ändert sie nichts (Merker: `jahre` ist da).
 */
export function jahreUmstellen(stand: AuszStand, schuljahr: number, jetzt: number): boolean {
  if (stand.jahre && typeof stand.jahre === 'object') return false
  stand.jahre = {}
  for (const [sprache, m] of Object.entries(stand.medaillen ?? {})) {
    const medaillen: JahrStand['medaillen'] = {}
    for (const [k, x] of Object.entries(m ?? {})) if (x && x.stufe >= 1) medaillen[k as KategorieId] = { stufe: Math.min(6, Math.floor(x.stufe)), am: x.am }
    const js: JahrStand = { jahrgang: null, start: {}, medaillen }
    const p = medaillenPunkte(Object.values(medaillen).map((x) => x?.stufe ?? 0))
    if (titelStufe(p) >= 1) js.titel = { stufe: titelStufe(p), am: Math.max(0, ...Object.values(medaillen).map((x) => x?.am ?? 0)) || jetzt }
    stand.jahre[sprache] = { [String(schuljahr)]: js }
  }
  return true
}

/** Jahresreihe einer Sprache holen bzw. beginnen: Start = Stand der letzten Auswertung im Vorjahr (sonst null) */
export function jahrHolen(stand: AuszStand, sprache: string, schuljahr: number): JahrStand {
  const je = ((stand.jahre ??= {})[sprache] ??= {})
  const da = je[String(schuljahr)]
  if (da) return da
  const vorher = Object.keys(je)
    .map(Number)
    .filter((j) => j < schuljahr)
    .sort((a, b) => b - a)[0]
  const v = vorher !== undefined ? je[String(vorher)] : undefined
  const js: JahrStand = { jahrgang: null, start: { ...(v?.zuletzt ?? v?.start ?? {}) }, medaillen: {} }
  je[String(schuljahr)] = js
  return js
}

/** Schwellen der Reihe festlegen – neu nur, wenn sich Band oder Jahrgang geändert hat (Erreichtes bleibt) */
export function jahrGrundlageSetzen(js: JahrStand, g: JahresGrundlage): void {
  const schluessel = grundlageSchluessel(g)
  if (js.schwellen && js.basis === schluessel && js.grundlage) return
  js.basis = schluessel
  js.grundlage = g
  js.schwellen = jahresSchwellen(g)
  if (g.jahrgang) js.jahrgang = g.jahrgang
}

/** Punkte einer Jahresreihe */
export const jahresPunkte = (js: JahrStand | undefined): number => medaillenPunkte(Object.values(js?.medaillen ?? {}).map((x) => x?.stufe ?? 0))

/** Medaillen der Jahresreihe (Sicht mit Wert, Ziel und Start des Balkens) */
export function jahresMedaillen(js: JahrStand, werte: Partial<Werte>): MedaillenSicht[] {
  return medaillenMit(werte, schwellenVon(js), js.medaillen)
}

/** Schwellen einer Jahresreihe (gespeichert, sonst aus der Grundlage) – auch für die Stufen-Übersicht der Sammlung (10.10.2026) */
export function schwellenVon(js: JahrStand): Partial<Record<KategorieId, number[]>> {
  return js.schwellen ?? jahresSchwellen(js.grundlage ?? { jahrgang: js.jahrgang, band: null, woerter: null, grammatik: null, units: null, schultage: SCHULTAGE_UEBLICH })
}

/**
 * Medaillen und Titel fortschreiben: nur aufwärts (nie entzogen), Neues mit Zeitpunkt. Gibt zurück, was neu ist –
 * je Kategorie nur die höchste neue Stufe. Seit den Jahresreihen: in der Reihe des laufenden Schuljahres, dazu die beste
 * Stufe je Kategorie (Sammlung), der Jahrestitel und der Haupttitel aus den Punkten aller Jahre.
 */
export function fortschreiben(stand: AuszStand, eingaben: SprachEingabe[], jetzt: number): AuszNeu[] {
  const neu: AuszNeu[] = []
  jahreUmstellen(stand, eingaben[0]?.jahr?.schuljahr ?? schuljahrVon(jetzt), jetzt)
  for (const e of eingaben) {
    const k = e.jahr ?? standardKontext(e, jetzt)
    const js = jahrHolen(stand, e.sprache, k.schuljahr)
    jahrGrundlageSetzen(js, k.grundlage)
    if (e.jahrgang && !js.jahrgang) js.jahrgang = e.jahrgang
    const gesamt = sprachWerte(e)
    for (const m of jahresMedaillen(js, jahresWerte(gesamt, js.start, k))) {
      const alt = js.medaillen[m.kategorie]?.stufe ?? 0
      if (m.stufe > alt) {
        js.medaillen[m.kategorie] = { stufe: m.stufe, am: jetzt }
        neu.push({ art: 'medaille', sprache: e.sprache, kategorie: m.kategorie, stufe: m.stufe, schuljahr: k.schuljahr, jahrgang: js.jahrgang })
      }
    }
    js.zuletzt = gesamt
    besteNachziehen(stand, e.sprache)
    const jt = titelStufe(jahresPunkte(js))
    if (jt > (js.titel?.stufe ?? 0)) {
      js.titel = { stufe: jt, am: jetzt }
      neu.push({ art: 'jahrestitel', sprache: e.sprache, stufe: jt, schuljahr: k.schuljahr, jahrgang: js.jahrgang })
    }
    titelNachziehen(stand, e.sprache, jetzt, neu)
  }
  // Haupttitel vor dem Jahrestitel melden (der Glückwunsch zeigt höchstens zwei)
  return neu.sort((a, b) => RANG[a.art] - RANG[b.art])
}
const RANG: Record<AuszNeu['art'], number> = { medaille: 0, titel: 1, jahrestitel: 2 }

/** Beste Stufe je Kategorie über alle Jahre (für Sammlung und Profilbild) – nur aufwärts */
function besteNachziehen(stand: AuszStand, sprache: string): void {
  const beste = (stand.medaillen[sprache] ??= {})
  for (const js of Object.values(stand.jahre?.[sprache] ?? {}))
    for (const [k, x] of Object.entries(js.medaillen ?? {}) as [KategorieId, { stufe: number; am: number }][])
      if (x && x.stufe > (beste[k]?.stufe ?? 0)) beste[k] = { stufe: x.stufe, am: x.am }
}

function titelNachziehen(stand: AuszStand, sprache: string, jetzt: number, neu?: AuszNeu[]): void {
  const s = titelStufeGesamt(punkteVon(stand, sprache))
  if (s > (stand.titel[sprache]?.stufe ?? 0)) {
    stand.titel[sprache] = { stufe: s, am: jetzt }
    neu?.push({ art: 'titel', sprache, stufe: s })
  }
}

/** Punkte einer Sprache: Summe über alle Jahresreihen (vor der Umstellung: die gespeicherten Medaillen) */
export const punkteVon = (stand: AuszStand, sprache: string): number => {
  const jahre = stand.jahre?.[sprache]
  if (jahre && Object.keys(jahre).length) return Object.values(jahre).reduce((a, js) => a + jahresPunkte(js), 0)
  return medaillenPunkte(Object.values(stand.medaillen[sprache] ?? {}).map((x) => x?.stufe ?? 0))
}

/** Hauptsprache für die Übernahme: die mit den meisten Übungstagen, dann den meisten Wörtern, sonst die erste */
export function hauptsprache(eingaben: SprachEingabe[]): string | null {
  const s = [...eingaben].sort((a, b) => b.tage - a.tage || b.woerterAb2 + b.woerterSicher - (a.woerterAb2 + a.woerterSicher))[0]
  return s?.sprache ?? null
}

/**
 * Einmalige Übernahme der alten Achievements in die Hauptsprache (die alten galten für alle Sprachen zusammen). Hebt
 * Medaillen nur an (nie ab) und zieht den Titel nach; wiederholt aufgerufen ändert sie nichts mehr. Gibt es schon
 * Jahresreihen, landet das Übernommene in der Reihe des laufenden Schuljahres.
 */
export function uebernahmeAnwenden(
  stand: AuszStand,
  erreichtAlt: Record<string, { gruppe: string; medaille: string | null; am?: number }>,
  sprache: string,
  jetzt: number,
  schuljahr = schuljahrVon(jetzt)
): void {
  const ziel = stand.jahre ? jahrHolen(stand, sprache, schuljahr).medaillen : (stand.medaillen[sprache] ??= {})
  for (const [k, s] of Object.entries(uebernahmeAusAlt(erreichtAlt)) as [KategorieId, MedaillenStufe][]) {
    if (s > (ziel[k]?.stufe ?? 0)) {
      // Zeitpunkt: das früheste alte Achievement dieser Kategorie
      const am = Math.min(
        jetzt,
        ...Object.entries(erreichtAlt)
          .filter(([id, a]) => alteKategorie(id, a.gruppe) === k && typeof a.am === 'number')
          .map(([, a]) => a.am as number)
      )
      ziel[k] = { stufe: s, am }
    }
  }
  if (stand.jahre) {
    besteNachziehen(stand, sprache)
    const js = jahrHolen(stand, sprache, schuljahr)
    const jt = titelStufe(jahresPunkte(js))
    if (jt > (js.titel?.stufe ?? 0)) js.titel = { stufe: jt, am: jetzt }
  } else stand.medaillen[sprache] ??= {}
  titelNachziehen(stand, sprache, jetzt)
}

/** Zähler der Hauptsprache aus den alten, sprachübergreifenden Zählern (einmalig) */
export function zaehlerAusAlt(
  alt: { rekordeGebrochen?: number; diktate?: number; koopRunden?: number; versusSpiele?: number; teamZiele?: number },
  gespielteSpiele: number
): SprachZaehler {
  const n = (x: unknown): number => Math.max(0, Math.floor(Number(x) || 0))
  return {
    spielrunden: n(gespielteSpiele),
    rekorde: n(alt.rekordeGebrochen),
    hoeren: n(alt.diktate),
    zusammenRunden: n(alt.koopRunden) + n(alt.versusSpiele),
    teamZiele: n(alt.teamZiele)
  }
}
