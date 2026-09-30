/**
 * Programm „Tafelbilder" (30.09.2026): übersichtliche Tafelbilder zu jedem Thema, in jedem Fach
 * und Jahrgang – mit oder ohne hineingezogenes Material, für mehrere Tafelformate zugleich.
 *
 * Aufbau des Dokuments:
 * - `meta`: Lerngruppe, Thema/Lernziel, Struktur, Regler, Formate, Zeichnungsquellen, Varianten
 * - `inhalt`: was die KI liefert – strukturierte Inhalte (Knoten, Beziehungen, Merksatz …) samt
 *   Layoutvorschlag. Daraus setzt die App das Layout je Format DETERMINISTISCH (layout.ts).
 * - `tafeln`: je gewähltem Format die gesetzten Elemente – frei bearbeitbar in der Zeichenfläche.
 *   Ansicht, PDF, PNG und PowerPoint entstehen alle aus diesen Elementen (svg.ts).
 */
import type { KiHerkunft, KiVermerk } from '@shared/kiKennzeichnung'
import type { StoffQuelle } from '../../shared/files/stoffQuelle'
import type { BilingualVorgaben } from '../arbeitsblatt/model/types'
import type { SchaltplanSpec } from '../arbeitsblatt/render/schaltplanSvg'
import { FORMAT_IDS, standardSchrift, type Farbe, type FormatId, type Schriftart } from './formate'

export type ElementTyp = 'text' | 'kasten' | 'pfeil' | 'verbinder' | 'symbol' | 'skizze' | 'bild' | 'diagramm' | 'formel' | 'merksatz'

export const ELEMENT_NAMEN: Record<ElementTyp, string> = {
  text: 'Text',
  kasten: 'Kasten',
  pfeil: 'Pfeil',
  verbinder: 'Verbinder',
  symbol: 'Symbol',
  skizze: 'Skizze',
  bild: 'Bild',
  diagramm: 'Diagramm',
  formel: 'Formel',
  merksatz: 'Merksatz'
}

export type Rahmen = 'keiner' | 'linie' | 'doppelt' | 'gestrichelt' | 'wolke'
export type PfeilArt = 'pfeil' | 'doppelpfeil' | 'linie'
export type Niveau = 1 | 2 | 3

export type DiagrammArt = 'zeitstrahl' | 'koordinatensystem' | 'schaltplan' | 'kreislauf' | 'kartenskizze' | 'tabelle'

export interface Diagramm {
  art: DiagrammArt
  /** Zeitstrahl: Ereignisse (wert = Jahr); Kreislauf: Stationen; Kartenskizze: Orte (x/y 0 … 1) */
  eintraege: { label: string; wert?: string; x?: number; y?: number }[]
  /** Koordinatensystem: Funktionsterme in x, z. B. „0.5*x^2 - 1" */
  funktionen?: string[]
  bereich?: { xMin: number; xMax: number; yMin: number; yMax: number }
  /** Schaltplan als Netzliste (wie im Arbeitsblatt) */
  schaltplan?: SchaltplanSpec
  /** Tabelle: Kopfzeile und Zeilen */
  spalten?: string[]
  zeilen?: string[][]
  /** Achsenbeschriftungen */
  xName?: string
  yName?: string
}

export interface TbElement {
  id: string
  typ: ElementTyp
  /** Lage relativ zur Fläche (0 … 1). Beim freien Pfeil: Start (x, y) und Ende (x + w, y + h). */
  x: number
  y: number
  w: number
  h: number
  /** Überschrift eines Kastens bzw. Merksatzes */
  titel?: string
  /** Inhalt; Zeilen mit „• " am Anfang sind Stichpunkte */
  text: string
  farbe: Farbe
  rahmen?: Rahmen
  /** Schriftgrad als Anteil der Flächenhöhe – gesetzt vom Layout, änderbar */
  schrift?: number
  ausrichtung?: 'links' | 'mitte'
  /** Präsentationsschritt (1 …) – Reihenfolge des Aufbaus im Unterricht */
  schritt: number
  /** In der Lückenfassung ganz leer (Schreiblinien) */
  luecke?: boolean
  /** In der Lückenfassung leere Wörter */
  lueckenWoerter?: string[]
  /** Ab welchem Niveau das Element erscheint (★ = 1: immer) */
  niveau?: Niveau
  /** Verbinder: verbundene Elemente */
  von?: string
  nach?: string
  pfeilArt?: PfeilArt
  /** Verbinder zu einem Punkt statt zu einem Element (Zeitleiste: Marke auf dem Strahl), relativ */
  zielPunkt?: { x: number; y: number }
  /** Beschriftung auf einem Pfeil oder Verbinder steht in `text` */
  /** Symbol aus dem eingebauten Vorrat (symbole.ts) */
  symbol?: string
  /** Skizze: Vorlage aus dem Vorrat und/oder freie Striche (Pfade in 0 … 1000 des Elements) */
  vorlage?: string
  pfade?: string[]
  /** Bild (data:-Adresse): KI-Bild, OpenMoji, Foto */
  bild?: string
  bildQuelle?: 'openmoji' | 'ki' | 'eigen'
  bildPrompt?: string
  diagramm?: Diagramm
  tex?: string
  /** Knoten des Inhalts, aus dem das Element entstand (für Neu-Setzen und KI-Überarbeiten) */
  knoten?: string
}

export interface TbTafel {
  format: FormatId
  elemente: TbElement[]
  schrift: Schriftart
  /** Raster in der Zeichenfläche anzeigen/einrasten */
  raster?: boolean
}

// ---------- Inhalt (KI) ----------

export type StrukturArt = 'netz' | 'tabelle' | 'fluss' | 'zeitleiste' | 'kreislauf' | 'gliederung' | 'frei'
export type StrukturWahl = 'auto' | 'netz' | 'tabelle' | 'fluss' | 'zeitleiste' | 'kreislauf'

export const STRUKTUREN: { value: StrukturWahl; label: string; beschreibung: string }[] = [
  { value: 'auto', label: 'KI wählt passend', beschreibung: 'Die Struktur folgt dem Inhalt – Vergleich, Ablauf, Begriffe oder Zeit.' },
  { value: 'netz', label: 'Mindmap / Begriffsnetz', beschreibung: 'Zentraler Begriff mit Aspekten; beschriftete Verbindungen.' },
  { value: 'tabelle', label: 'Tabelle / Gegenüberstellung', beschreibung: 'Vergleich nach Aspekten, Pro und Contra.' },
  { value: 'fluss', label: 'Flussdiagramm / Ursache–Wirkung', beschreibung: 'Schritte oder Ursachen und Folgen mit Pfeilen.' },
  { value: 'zeitleiste', label: 'Zeitleiste', beschreibung: 'Chronologie mit gleichbleibendem Maßstab.' },
  { value: 'kreislauf', label: 'Kreislauf', beschreibung: 'Wiederkehrende Abläufe als Ring.' }
]

export const STRUKTUR_NAMEN: Record<StrukturArt, string> = {
  netz: 'Begriffsnetz',
  tabelle: 'Gegenüberstellung',
  fluss: 'Flussdiagramm',
  zeitleiste: 'Zeitleiste',
  kreislauf: 'Kreislauf',
  gliederung: 'Gliederung',
  frei: 'Übernommene Anordnung'
}

export interface TbKnoten {
  id: string
  titel: string
  punkte: string[]
  /** zentrum = Mitte des Netzes; spalte = Spalte einer Gegenüberstellung */
  rolle: 'zentrum' | 'aspekt' | 'schritt' | 'ereignis' | 'spalte' | 'beispiel'
  farbe: Farbe
  symbol?: string
  /** Zeitleiste: Jahr/Datum */
  zeit?: string
  niveau: Niveau
  schritt: number
  lueckenWoerter: string[]
  /** Layoutvorschlag der KI (relativ) – genutzt bei der Übernahme eines Tafelfotos */
  lage?: { x: number; y: number; w: number; h: number }
}

export interface TbBeziehung {
  von: string
  nach: string
  beschriftung: string
  art: PfeilArt
}

export type ZeichnungArt = 'symbol' | 'skizze' | 'openmoji' | 'kibild' | 'diagramm' | 'formel'

export interface TbZeichnung {
  art: ZeichnungArt
  /** Knoten, zu dem die Zeichnung gehört ('' = frei, z. B. im Impulsfeld) */
  bezug: string
  symbol?: string
  vorlage?: string
  suchwort?: string
  prompt?: string
  tex?: string
  diagramm?: Diagramm
  beschriftung?: string
  schritt: number
  /** Nach dem Auflösen (OpenMoji, KI-Bild): das Bild */
  bild?: string
}

export interface TbInhalt {
  titel: string
  struktur: StrukturArt
  strukturGrund: string
  impuls: string
  knoten: TbKnoten[]
  beziehungen: TbBeziehung[]
  merksatz: { titel: string; text: string; lueckenWoerter: string[] } | null
  hausaufgabe: string
  /** Gegenüberstellung: Vergleichsaspekte als Zeilen (optional) */
  aspekte?: string[]
  zeichnungen: TbZeichnung[]
  farbLegende: { farbe: Farbe; bedeutung: string }[]
  /** Planungshilfe: je Schritt Phase und Impuls der Lehrkraft */
  schritte: { nr: number; phase: string; impuls: string }[]
}

// ---------- Einstellungen ----------

export type Stufe = 1 | 2 | 3
export type Sprachniveau = 'einfach' | 'standard' | 'fach'
export type Textstil = 'stichpunkte' | 'ausformuliert'
export type ZeichnungQuelle = 'skizzen' | 'piktogramme' | 'kibilder' | 'fachdiagramme'

export interface Regler {
  detail: Stufe
  zeichnungen: 0 | 1 | 2
  textmenge: Stufe
  sprache: Sprachniveau
  /** Wurde die Textschwierigkeit von Hand gesetzt? Sonst folgt sie Jahrgang und Schulform. */
  spracheGewaehlt?: boolean
  stil: Textstil
  stilGewaehlt?: boolean
}

export interface Varianten {
  luecke: boolean
  schritte: boolean
  niveaus: boolean
  merksatz: boolean
}

export interface AppMaterial {
  moduleId: string
  id: string
  name: string
  text: string
  aktiv: boolean
}

export interface TafelbildMeta {
  title: string
  subjectId: string
  subjectLabel: string
  grade: number
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  /** Bilingualer Sachfachunterricht – dieselben Vorgaben wie im Arbeitsblatt (BilingualSchalter) */
  bilingual?: BilingualVorgaben
  thema: string
  lernziel: string
  operatoren: string[]
  struktur: StrukturWahl
  regler: Regler
  formate: FormatId[]
  quellen: ZeichnungQuelle[]
  varianten: Varianten
  /** neu = aus Thema/Material; foto = ein fotografiertes Tafelbild übernehmen */
  modus: 'neu' | 'foto'
  stoffQuellen: StoffQuelle[]
  appMaterial: AppMaterial[]
  /** Weitere Wünsche an die KI */
  wuensche: string
  ueberthema?: string
  ki?: KiHerkunft
  kiVermerk?: KiVermerk
}

/**
 * Vorschläge, die die App zu einem Befund mit einem Klick umsetzt („Vorschlag der App umsetzen",
 * wie im Arbeitsblatt): KI kürzt die betroffenen Kästen bzw. die App fasst zwei Kästen zusammen.
 */
export type TbVorschlag = 'kiKuerzen' | 'zusammenfassen'

export interface Befund {
  format?: FormatId
  element?: string
  /** Alle betroffenen Elemente (z. B. alle mit zu kleiner Schrift) */
  elemente?: string[]
  art: 'text' | 'schrift' | 'farbe' | 'ueberlappung' | 'rand' | 'kontrast' | 'aufbau' | 'bild'
  text: string
  schwer?: boolean
  vorschlaege?: TbVorschlag[]
}

export interface Tafelbild {
  version: 1
  meta: TafelbildMeta
  inhalt: TbInhalt | null
  tafeln: TbTafel[]
  pruefung?: Befund[]
  createdAt: string
  /** Für die gemeinsame Projektdatei (shared/testmodul/projekt.ts) – ungenutzt */
  design?: unknown
}

// ---------- Hilfen ----------

export const hatTafel = (t: Tafelbild | null): boolean => Boolean(t?.tafeln.some((x) => x.elemente.length))
export const lohntSicherung = (t: Tafelbild | null): boolean => Boolean(t && (t.meta.thema.trim() || t.meta.title.trim() || hatTafel(t) || t.meta.stoffQuellen.length))
export const standardName = (t: Tafelbild): string => t.meta.title.trim() || t.inhalt?.titel || (t.meta.thema.trim() ? `Tafelbild: ${t.meta.thema.trim()}` : 'Tafelbild')

let zaehler = 0
export const neueId = (vorsilbe = 'e'): string => `${vorsilbe}${Date.now().toString(36)}${(zaehler++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

/** Textschwierigkeit nach Jahrgang und Schulform (voreingestellt, solange nicht von Hand gewählt) */
export function standardSprache(grade: number, schulform = ''): Sprachniveau {
  if (/förder|foerder|lernen|haupt|mittelschule/i.test(schulform) || grade <= 5) return 'einfach'
  if (grade >= 11) return 'fach'
  return 'standard'
}

/** Ganze Sätze nur in den unteren Jahrgängen (boardDesign.ts: „In den unteren Jahrgängen sind ganze Sätze erlaubt") */
export const standardStil = (grade: number): Textstil => (grade <= 6 ? 'ausformuliert' : 'stichpunkte')

export function leeresTafelbild(o: { stateId?: string; schoolTypeId?: string; schoolTypeName?: string; subjectId?: string; subjectLabel?: string; grade?: number } = {}): Tafelbild {
  const grade = o.grade ?? 7
  return {
    version: 1,
    meta: {
      title: '',
      subjectId: o.subjectId ?? 'geschichte',
      subjectLabel: o.subjectLabel ?? 'Geschichte',
      grade,
      stateId: o.stateId ?? 'NI',
      schoolTypeId: o.schoolTypeId ?? 'gymnasium',
      schoolTypeName: o.schoolTypeName ?? 'Gymnasium',
      thema: '',
      lernziel: '',
      operatoren: [],
      struktur: 'auto',
      regler: { detail: 2, zeichnungen: 1, textmenge: 2, sprache: standardSprache(grade, o.schoolTypeName), stil: standardStil(grade) },
      formate: ['klapptafel', 'heft'],
      quellen: ['skizzen', 'piktogramme', 'fachdiagramme'],
      varianten: { luecke: true, schritte: true, niveaus: false, merksatz: true },
      modus: 'neu',
      stoffQuellen: [],
      appMaterial: [],
      wuensche: ''
    },
    inhalt: null,
    tafeln: [],
    createdAt: new Date().toISOString()
  }
}

/** Ältere oder unvollständige Stände auf den heutigen Aufbau bringen */
export function normalisiere(t: Tafelbild): Tafelbild {
  const leer = leeresTafelbild()
  const meta = { ...leer.meta, ...(t.meta ?? {}) }
  meta.formate = (meta.formate ?? []).filter((f) => FORMAT_IDS.includes(f))
  if (!meta.formate.length) meta.formate = ['klapptafel']
  meta.regler = { ...leer.meta.regler, ...(meta.regler ?? {}) }
  meta.varianten = { ...leer.meta.varianten, ...(meta.varianten ?? {}) }
  meta.stoffQuellen = meta.stoffQuellen ?? []
  meta.appMaterial = meta.appMaterial ?? []
  meta.operatoren = meta.operatoren ?? []
  meta.quellen = meta.quellen ?? leer.meta.quellen
  const tafeln = (t.tafeln ?? []).map((x) => ({ ...x, schrift: x.schrift ?? standardSchrift(x.format), elemente: x.elemente ?? [] }))
  return { ...leer, ...t, meta, tafeln, inhalt: t.inhalt ?? null }
}

/** Anzahl Präsentationsschritte einer Tafel */
export const schrittZahl = (tafel: TbTafel): number => Math.max(1, ...tafel.elemente.map((e) => e.schritt || 1))

/** Wörter eines Textes (Stichpunkt-Zeichen zählen nicht) */
export const worte = (s: string): number => s.replace(/[•\-–]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

/** Text eines Elements, wie er auf der Tafel steht (Überschrift + Inhalt) */
export const elementText = (e: TbElement): string => {
  const d = e.diagramm
  const diag = d ? [...d.eintraege.map((x) => `${x.wert ? `${x.wert} ` : ''}${x.label}`), ...(d.spalten ?? []), ...(d.zeilen ?? []).flat()].join(' ') : ''
  return [e.titel ?? '', e.text, diag].filter(Boolean).join(' ')
}

export const istTextElement = (e: TbElement): boolean => e.typ === 'text' || e.typ === 'kasten' || e.typ === 'merksatz'
export const istLinie = (e: TbElement): boolean => e.typ === 'pfeil' || e.typ === 'verbinder'
