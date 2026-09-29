/**
 * Verlagsmaterial in einzelne Aufgaben zerlegen (29.09.2026).
 *
 * Entscheidung der Lehrkraft (Englisch, Klassenarbeit): Klassenarbeitsvorschläge, Testhefte und
 * Lehrerbände (PDF, Scan, Word) dürfen hineingezogen werden – nach Rechtshinweis und Bestätigung
 * (siehe `rechtshinweis.ts`). Die KI
 * - analysiert das Material,
 * - verbessert die Formatierung (Layout der App, Lücken, Tabellen, Nummerierung),
 * - zerlegt es in einzelne Aufgaben MIT dem dazugehörigen Material,
 * - übernimmt Inhalte WÖRTLICH,
 * - ordnet ein mitgegebenes Lösungsblatt den Aufgaben zu,
 * - ergänzt fehlende Punkte und Erwartungshorizonte als ENTWURF (gekennzeichnet),
 * - stuft Verstehensitems nach dem Raster ein (shared/verstehen/stufen.ts).
 *
 * Die Lehrkraft wählt danach aus, was übernommen wird (`uebernahme.ts`). Alles steht in EINER
 * Anfrage: Was die Lehrkraft abwählt (Entwürfe, Stufen), wird beim Übernehmen verworfen – das
 * spart eine zweite Anfrage mit demselben Material.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, bool, enumOf, int, obj, str } from '../../../shared/aiSchema'
import { inhalt, type GeleseneDatei } from '../../rueckmeldung/aufgabeAusMaterial'
import { stufenRaster } from '../../../shared/verstehen/regeln'
import { stufeAus, type VerstehensStufe } from '../../../shared/verstehen/stufen'
import type { Exam } from '../model/types'

export type { GeleseneDatei }

export const KOMPETENZEN = ['listening', 'reading', 'viewing', 'writing', 'mediation', 'grammar', 'vocabulary', 'sonstiges'] as const
export type ImportKompetenz = (typeof KOMPETENZEN)[number]

export const KOMPETENZ_NAMEN: Record<ImportKompetenz, string> = {
  listening: 'Hörverstehen',
  reading: 'Leseverstehen',
  viewing: 'Hör-Seh-Verstehen',
  writing: 'Schreiben',
  mediation: 'Sprachmittlung',
  grammar: 'Grammatik',
  vocabulary: 'Wortschatz',
  sonstiges: 'Sonstiges'
}

/** Antwortformen, die sich aus Verlagsmaterial sauber übertragen lassen */
export const IMPORT_ANTWORTEN = ['lines', 'none', 'gapText', 'matching', 'multipleChoice', 'trueFalse', 'ordering', 'tableFill'] as const
export type ImportAntwortArt = (typeof IMPORT_ANTWORTEN)[number]

const ANTWORT = obj({
  kind: enumOf([...IMPORT_ANTWORTEN]),
  count: int('lines: Zahl der Schreiblinien'),
  gapText: str('gapText: Text mit [[Lösung]] je Lücke (Lösung leer lassen, wenn unbekannt: [[ ]])'),
  left: arr(str(), 'matching: linke Seite'),
  right: arr(str(), 'matching: rechte Seite in der Reihenfolge des Materials'),
  pairs: arr(int(), 'matching: Index in right je Eintrag in left; -1 = unbekannt'),
  options: arr(str(), 'multipleChoice: Antwortmöglichkeiten in der Reihenfolge des Materials'),
  correct: arr(int(), 'multipleChoice: Indizes der richtigen; leer = unbekannt'),
  statements: arr(obj({ text: str(), isTrue: bool(), stufe: int('Schwierigkeitsstufe 1–5, 0 = keine') }), 'trueFalse'),
  items: arr(str(), 'ordering: Elemente in RICHTIGER Reihenfolge'),
  displayOrder: arr(int(), 'ordering: Reihenfolge, in der sie im Material stehen (Indizes in items)'),
  headers: arr(str(), 'tableFill: Spaltenköpfe'),
  rows: arr(arr(str()), 'tableFill: Zeilen; leere Zelle = auszufüllen'),
  solutionRows: arr(arr(str()), 'tableFill: Lösungen der leeren Zellen')
})

const MATERIAL = obj({
  art: enumOf(['text', 'hoertext', 'tabelle', 'bild']),
  titel: str('Überschrift wie im Material'),
  text: str('text: WÖRTLICH, Absätze erhalten; hoertext: das Transkript, jede Sprecherzeile „Name: Text"; bild: genaue Beschreibung des Bildes'),
  zeilen: arr(arr(str()), 'tabelle: Zeilen, erste Zeile = Kopfzeile; sonst leer'),
  quelle: str('Quellenangabe, wenn sie im Material steht – sonst leer')
})

const TEIL = obj({
  anweisung: str('Frage bzw. Item WÖRTLICH'),
  antwort: ANTWORT,
  loesung: str('Lösung dieses Items'),
  punkte: int('Punkte dieses Items; 0 = keine Angabe'),
  stufe: int('Schwierigkeitsstufe 1–5; 0 = kein Verstehensitem'),
  stufeGrund: str('Kurze Begründung der Stufe (Textstelle, Synonym …)')
})

const AUFGABE = obj({
  nummer: str('Nummer bzw. Bezeichnung wie im Material, z. B. „2" oder „Listening, Part 1"'),
  titel: str('Kurzer Titel, z. B. „Radio interview: school trip"'),
  kompetenz: enumOf([...KOMPETENZEN]),
  material: arr(MATERIAL, 'Material, auf das sich GENAU diese Aufgabe bezieht (Text, Hörtext-Transkript, Tabelle, Bild); leer, wenn keines'),
  anweisung: str('Arbeitsanweisung WÖRTLICH; der Operator fett in **…**'),
  operator: str(),
  afb: enumOf(['', 'I', 'II', 'III']),
  antwort: ANTWORT,
  teile: arr(TEIL, 'Einzelne Items a), b), 1., 2. … – oder leer bei einer Aufgabe ohne Items'),
  loesung: str('Lösung bzw. Erwartungshorizont der ganzen Aufgabe'),
  loesungQuelle: enumOf(['material', 'loesungsblatt', 'entwurf', 'keine']),
  punkte: int('Punkte der ganzen Aufgabe'),
  punkteQuelle: enumOf(['material', 'entwurf', 'keine']),
  stufe: int('Schwierigkeitsstufe 1–5, wenn die Aufgabe EIN Verstehensitem ist; sonst 0'),
  stufeGrund: str(),
  hinweis: str('Hinweis für die Lehrkraft: Unklarheiten, unleserliche Stellen, Seitenverweise – sonst leer')
})

export const ZERLEGUNG_SCHEMA = obj({
  titel: str('Titel des Materials (z. B. „Klassenarbeitsvorschlag Unit 3")'),
  aufgaben: arr(AUFGABE),
  unklar: arr(str(), 'Stellen, die sich nicht sicher übertragen ließen')
})

export interface ImportAntwort {
  kind: ImportAntwortArt
  count: number
  gapText: string
  left: string[]
  right: string[]
  pairs: number[]
  options: string[]
  correct: number[]
  statements: { text: string; isTrue: boolean; stufe?: VerstehensStufe }[]
  items: string[]
  displayOrder: number[]
  headers: string[]
  rows: string[][]
  solutionRows: string[][]
}

export interface ImportMaterial {
  art: 'text' | 'hoertext' | 'tabelle' | 'bild'
  titel: string
  text: string
  zeilen: string[][]
  quelle: string
}

export interface ImportTeil {
  anweisung: string
  antwort: ImportAntwort
  loesung: string
  punkte: number
  stufe?: VerstehensStufe
  stufeGrund: string
}

export interface ImportAufgabe {
  nummer: string
  titel: string
  kompetenz: ImportKompetenz
  material: ImportMaterial[]
  anweisung: string
  operator: string
  afb: '' | 'I' | 'II' | 'III'
  antwort: ImportAntwort
  teile: ImportTeil[]
  loesung: string
  loesungQuelle: 'material' | 'loesungsblatt' | 'entwurf' | 'keine'
  punkte: number
  punkteQuelle: 'material' | 'entwurf' | 'keine'
  stufe?: VerstehensStufe
  stufeGrund: string
  hinweis: string
}

export interface Zerlegung {
  titel: string
  aufgaben: ImportAufgabe[]
  unklar: string[]
  /** Dateinamen, aus denen die Zerlegung stammt – für die Anzeige */
  dateien: string[]
}

/** Die Anfrage: Material (und optional Lösungsblatt) zerlegen. */
export function zerlegenAnfrage(exam: Pick<Exam, 'meta'>, material: GeleseneDatei[], loesungsblatt: GeleseneDatei[] = []): StructuredRequest {
  const m = inhalt(material)
  const l = loesungsblatt.length ? inhalt(loesungsblatt) : { text: '', bilder: [] as string[] }
  const bilder = [...m.bilder, ...l.bilder].slice(0, 10)
  return {
    system:
      'Du bereitest Material einer Lehrkraft für eine Klassenarbeit auf. Du überträgst WORTGETREU – auch aus Scans und Fotos – und erfindest keine Inhalte. Was im Material steht, bleibt unverändert; du verbesserst nur die Form.',
    user: [
      `Fach: ${exam.meta.subjectLabel}${exam.meta.grade ? `, Klasse ${exam.meta.grade}` : ''}${exam.meta.cefrLevel ? `, Niveau ${exam.meta.cefrLevel}` : ''}.`,
      'AUFTRAG:',
      '1. Analysiere das Material und zerlege es in EINZELNE Aufgaben – so, wie sie im Material nummeriert sind. Jede Aufgabe bekommt GENAU das Material, auf das sie sich bezieht (Lesetext, Hörtext-Transkript, Tabelle, Bild). Gemeinsames Material steht bei der ersten Aufgabe, die es braucht; spätere Aufgaben verweisen in der Anweisung darauf.',
      '2. Übernimm Arbeitsanweisungen, Items, Antwortmöglichkeiten und Texte WÖRTLICH. Nichts kürzen, nichts umformulieren, nichts ergänzen.',
      '3. Verbessere nur die FORM: Lücken als [[Lösung]], Tabellen als Tabellen, Ankreuzformate als multipleChoice bzw. trueFalse, Zuordnungen als matching, Items als einzelne teile. Seitenzahlen, Kopfzeilen, Verlagsvermerke, Punkteleisten und Hinweise für die Lehrkraft gehören NICHT in die Aufgabe.',
      '4. Punkte: Stehen sie im Material, übernimm sie (punkteQuelle = material). Sonst schlage angemessene Punkte vor (punkteQuelle = entwurf) – bei Verstehensitems in der Regel 1 Punkt je Item.',
      '5. Lösungen: Stehen sie im Material, übernimm sie wörtlich (loesungQuelle = material). Stehen sie im beigefügten LÖSUNGSBLATT, ordne sie der passenden Aufgabe und dem passenden Item zu (loesungQuelle = loesungsblatt; bei multipleChoice auch correct, bei trueFalse isTrue, bei gapText die Lücken, bei matching pairs). Fehlen sie, entwirf einen knappen Erwartungshorizont (loesungQuelle = entwurf).',
      '6. Stufe: Stufe jedes Verstehensitem (Hören, Lesen, Hör-Seh-Verstehen) nach dem Raster unten ein; andere Aufgaben bekommen Stufe 0.',
      '7. Hörverstehen: Liegt ein Transkript vor, gehört es als Material (art hoertext) zur Aufgabe. Fehlt es, bleibt material leer und hinweis nennt das.',
      '',
      stufenRaster(),
      '',
      'MATERIAL:',
      m.text,
      loesungsblatt.length ? `\nLÖSUNGSBLATT (nur zum Zuordnen der Lösungen, nicht als Aufgabe übernehmen):\n${l.text}` : ''
    ]
      .filter((z) => z !== '')
      .join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'verlagsmaterial_zerlegen',
    schema: ZERLEGUNG_SCHEMA
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const text = (v: any): string => (typeof v === 'string' ? v.trim() : '')
const texte = (v: any): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')) : [])
const zahl = (v: any): number => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0)
const zahlen = (v: any): number[] => (Array.isArray(v) ? v.map(zahl) : [])
const aus = <T extends string>(v: any, erlaubt: readonly T[], sonst: T): T => (erlaubt.includes(v) ? (v as T) : sonst)

export function antwortAus(a: any): ImportAntwort {
  return {
    kind: aus(a?.kind, IMPORT_ANTWORTEN, 'lines'),
    count: Math.max(0, Math.min(30, zahl(a?.count) || 3)),
    gapText: text(a?.gapText),
    left: texte(a?.left),
    right: texte(a?.right),
    pairs: zahlen(a?.pairs),
    options: texte(a?.options),
    correct: zahlen(a?.correct).filter((i) => i >= 0),
    statements: (Array.isArray(a?.statements) ? a.statements : []).map((s: any) => {
      const stufe = stufeAus(s?.stufe)
      return { text: text(s?.text), isTrue: Boolean(s?.isTrue), ...(stufe ? { stufe } : {}) }
    }),
    items: texte(a?.items),
    displayOrder: zahlen(a?.displayOrder),
    headers: texte(a?.headers),
    rows: (Array.isArray(a?.rows) ? a.rows : []).map(texte),
    solutionRows: (Array.isArray(a?.solutionRows) ? a.solutionRows : []).map(texte)
  }
}

/** Antwort der KI prüfen und in feste Form bringen. */
export function zerlegungAus(daten: unknown, dateien: string[] = []): Zerlegung {
  const d = (daten ?? {}) as any
  const aufgaben: ImportAufgabe[] = (Array.isArray(d.aufgaben) ? d.aufgaben : [])
    .map((a: any): ImportAufgabe => {
      const stufe = stufeAus(a?.stufe)
      return {
        nummer: text(a?.nummer),
        titel: text(a?.titel),
        kompetenz: aus(a?.kompetenz, KOMPETENZEN, 'sonstiges'),
        material: (Array.isArray(a?.material) ? a.material : [])
          .map((mt: any) => ({
            art: aus(mt?.art, ['text', 'hoertext', 'tabelle', 'bild'] as const, 'text'),
            titel: text(mt?.titel),
            text: typeof mt?.text === 'string' ? mt.text.replace(/\r\n/g, '\n').trim() : '',
            zeilen: (Array.isArray(mt?.zeilen) ? mt.zeilen : []).map(texte),
            quelle: text(mt?.quelle)
          }))
          .filter((mt: ImportMaterial) => mt.text || mt.zeilen.length),
        anweisung: text(a?.anweisung),
        operator: text(a?.operator),
        afb: aus(a?.afb, ['', 'I', 'II', 'III'] as const, ''),
        antwort: antwortAus(a?.antwort),
        teile: (Array.isArray(a?.teile) ? a.teile : [])
          .map((t: any): ImportTeil => {
            const s = stufeAus(t?.stufe)
            return {
              anweisung: text(t?.anweisung),
              antwort: antwortAus(t?.antwort),
              loesung: text(t?.loesung),
              punkte: Math.max(0, zahl(t?.punkte)),
              ...(s ? { stufe: s } : {}),
              stufeGrund: text(t?.stufeGrund)
            }
          })
          .filter((t: ImportTeil) => t.anweisung || t.antwort.options.length || t.antwort.statements.length || t.antwort.gapText),
        loesung: text(a?.loesung),
        loesungQuelle: aus(a?.loesungQuelle, ['material', 'loesungsblatt', 'entwurf', 'keine'] as const, 'keine'),
        punkte: Math.max(0, zahl(a?.punkte)),
        punkteQuelle: aus(a?.punkteQuelle, ['material', 'entwurf', 'keine'] as const, 'keine'),
        ...(stufe ? { stufe } : {}),
        stufeGrund: text(a?.stufeGrund),
        hinweis: text(a?.hinweis)
      }
    })
    .filter((a: ImportAufgabe) => a.anweisung || a.teile.length)
  if (!aufgaben.length) throw new Error('Im Material waren keine Aufgaben zu erkennen.')
  return { titel: text(d.titel), aufgaben, unklar: texte(d.unklar).filter(Boolean), dateien }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Zahl der Items einer Aufgabe (für die Auswahlliste) */
export function itemZahl(a: ImportAufgabe): number {
  if (a.teile.length) return a.teile.length
  if (a.antwort.kind === 'trueFalse') return Math.max(1, a.antwort.statements.length)
  if (a.antwort.kind === 'matching') return Math.max(1, a.antwort.left.length)
  if (a.antwort.kind === 'gapText') return Math.max(1, (a.antwort.gapText.match(/\[\[/g) ?? []).length)
  return 1
}
