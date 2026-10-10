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
 */

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
  return KATEGORIEN.map((k) => {
    const s = schwellen(k.id, jahrgang)
    const wert = Math.max(0, Math.floor(Number(werte[k.id]) || 0))
    const g = gespeichert[k.id]
    const stufe = Math.max(stufeFuer(wert, s), Math.min(6, Math.max(0, Math.floor(g?.stufe ?? 0)))) as MedaillenStufe
    return { kategorie: k.id, name: k.name, text: k.text, stufe, wert, ziel: stufe >= 6 ? null : s[stufe], von: stufe ? s[stufe - 1] : 0, am: g?.am ?? null }
  })
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

/** Titelstufe aus Punkten: 0 = noch kein Titel, 1 … 8 */
export function titelStufe(punkte: number): number {
  let n = 0
  for (const ab of TITEL_AB) if (punkte >= ab) n++
  return n
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

/** Gespeicherter Stand je Person (in den Achievement-Daten) */
export interface AuszStand {
  medaillen: Record<string, Partial<Record<KategorieId, { stufe: number; am: number }>>>
  titel: Record<string, { stufe: number; am: number }>
}

export type AuszNeu = { art: 'medaille'; sprache: string; kategorie: KategorieId; stufe: number } | { art: 'titel'; sprache: string; stufe: number }

/**
 * Medaillen und Titel fortschreiben: nur aufwärts (nie entzogen), Neues mit Zeitpunkt. Gibt zurück, was neu ist –
 * je Kategorie nur die höchste neue Stufe.
 */
export function fortschreiben(stand: AuszStand, eingaben: SprachEingabe[], jetzt: number): AuszNeu[] {
  const neu: AuszNeu[] = []
  for (const e of eingaben) {
    const gespeichert = (stand.medaillen[e.sprache] ??= {})
    for (const m of medaillen(sprachWerte(e), e.jahrgang, gespeichert)) {
      const alt = gespeichert[m.kategorie]?.stufe ?? 0
      if (m.stufe > alt) {
        gespeichert[m.kategorie] = { stufe: m.stufe, am: jetzt }
        neu.push({ art: 'medaille', sprache: e.sprache, kategorie: m.kategorie, stufe: m.stufe })
      }
    }
    titelNachziehen(stand, e.sprache, jetzt, neu)
  }
  return neu
}

function titelNachziehen(stand: AuszStand, sprache: string, jetzt: number, neu?: AuszNeu[]): void {
  const punkte = medaillenPunkte(Object.values(stand.medaillen[sprache] ?? {}).map((x) => x?.stufe ?? 0))
  const s = titelStufe(punkte)
  if (s > (stand.titel[sprache]?.stufe ?? 0)) {
    stand.titel[sprache] = { stufe: s, am: jetzt }
    neu?.push({ art: 'titel', sprache, stufe: s })
  }
}

/** Punkte einer Sprache aus dem gespeicherten Stand */
export const punkteVon = (stand: AuszStand, sprache: string): number =>
  medaillenPunkte(Object.values(stand.medaillen[sprache] ?? {}).map((x) => x?.stufe ?? 0))

/** Hauptsprache für die Übernahme: die mit den meisten Übungstagen, dann den meisten Wörtern, sonst die erste */
export function hauptsprache(eingaben: SprachEingabe[]): string | null {
  const s = [...eingaben].sort((a, b) => b.tage - a.tage || b.woerterAb2 + b.woerterSicher - (a.woerterAb2 + a.woerterSicher))[0]
  return s?.sprache ?? null
}

/**
 * Einmalige Übernahme der alten Achievements in die Hauptsprache (die alten galten für alle Sprachen zusammen). Hebt
 * Medaillen nur an (nie ab) und zieht den Titel nach; wiederholt aufgerufen ändert sie nichts mehr.
 */
export function uebernahmeAnwenden(stand: AuszStand, erreichtAlt: Record<string, { gruppe: string; medaille: string | null; am?: number }>, sprache: string, jetzt: number): void {
  const ziel = (stand.medaillen[sprache] ??= {})
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
