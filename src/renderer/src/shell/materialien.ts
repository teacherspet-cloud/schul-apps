/**
 * Alle gespeicherten Materialien über alle Programme – für „Zuletzt bearbeitet" und die Suche
 * auf der Startseite.
 *
 * Jedes Programm hat seine eigene Ablage und Übersicht. Wer „das Arbeitsblatt von gestern"
 * sucht, musste bisher erst wissen, in welchem Programm es steckt, dort die Bibliothek öffnen
 * und darin suchen. Die Startseite sammelt deshalb die Listen aller Programme ein.
 *
 * Die Umwandlung ist bewusst ohne React geschrieben, damit sie sich ohne Oberfläche prüfen
 * lässt (tests/materialien.test.ts).
 */
import { lehrwerkAngaben } from '@shared/lehrwerkSprache'
import type { SavedExamMeta, SavedGrammarTestMeta, SavedKurztestMeta, SavedTestMeta, SavedVocabList, SavedWorksheetMeta } from '@shared/types'
import { LANGUAGES } from '../modules/vokabeltest/model/types'
import { SUBJECTS } from '../modules/arbeitsblatt/model/subjects'
import { fachIdVon, WEITERE_FAECHER } from '../shared/fachfarben'

export interface Material {
  /** Programm aus modules/registry.ts */
  moduleId: string
  id: string
  name: string
  /** Kurze Zusatzzeile: Fach, Klasse, Thema */
  detail: string
  updatedAt: string
  /** Gesichert, aber noch ohne erzeugte Aufgaben bzw. ausformuliertes Blatt */
  entwurf: boolean
  /** Name, Thema und Fach in Kleinbuchstaben – dagegen wird gesucht */
  suchtext: string
  /** Fach als Kennung, Name oder Sprachcode – für den Farbpunkt (Paket 10a, shared/fachfarben.ts) */
  fach?: string
  /** Einheitliche Fachkennung für die Themenbereiche (Paket 10b, `fachSchluessel`) */
  fachId: string
  /** Jahrgang, sofern bekannt – Filter der Themenbereiche */
  grade?: number
  /** Thema im Wortlaut des Programms – Grundlage der Vorschläge (shared/themenVorschlag.ts) */
  thema: string
  /** Bundesland und Schulform aus den Kopfdaten (Paket 13) – nur, wenn das Programm sie gesichert hat */
  land?: string
  schulform?: string
  /** Überthema des Materials (27.09.2026) – nennt es einen Themenbereich, kommt es dorthin */
  ueberthema?: string
}

export interface Listen {
  tests: SavedTestMeta[]
  sheets: SavedWorksheetMeta[]
  kurztests: SavedKurztestMeta[]
  grammarTests: SavedGrammarTestMeta[]
  exams: SavedExamMeta[]
  vokabellisten: SavedVocabList[]
}

const klasse = (g?: number): string => (g ? `Klasse ${g}` : '')
/** Fach einer Vokabelliste (en → Englisch) – damit die Suche „englisch“ sie findet */
const sprache = (code?: string): string => (code ? (LANGUAGES.find((l) => l.value === code)?.label ?? code) : '')
const zeile = (...teile: (string | undefined)[]): string => teile.filter((t) => t && t.trim()).join(' · ')

/**
 * Einheitliche Fachkennung (Paket 10b): Die Programme speichern das Fach als Kennung
 * („biologie"), als Namen („Biologie") oder – der Vokabeltest – als Sprachcode („en"). Für die
 * Themenbereiche muss „Englisch" aus dem Vokabeltest und „englisch" vom Arbeitsblatt dasselbe
 * Fach sein. Unbekannte Fächer (Niederländisch im Vokabeltest) behalten ihren Namen.
 */
export function fachSchluessel(fach?: string): string {
  return fachIdVon(fach) ?? (fach?.trim().toLocaleLowerCase('de') || 'ohne-fach')
}

/** Anzeigename zu einer Fachkennung aus `fachSchluessel` */
export function fachAnzeige(fachId: string): string {
  if (fachId === 'ohne-fach') return 'Ohne Fach'
  const label = [...SUBJECTS, ...WEITERE_FAECHER].find((s) => s.id === fachId)?.label
  if (label) return label.replace(/\s*…$/, '')
  const sprache = LANGUAGES.find((l) => l.value === fachId)?.label
  return sprache ?? fachId.charAt(0).toLocaleUpperCase('de') + fachId.slice(1)
}

function material(
  moduleId: string,
  id: string,
  name: string,
  updatedAt: string,
  entwurf: boolean,
  detail: string,
  weitere: string[],
  fach?: string,
  grade?: number,
  thema = '',
  herkunft: { stateId?: string; schoolTypeId?: string; ueberthema?: string } = {}
): Material {
  return {
    moduleId,
    fach,
    fachId: fachSchluessel(fach),
    ...(grade ? { grade } : {}),
    thema,
    ...(herkunft.stateId ? { land: herkunft.stateId } : {}),
    ...(herkunft.schoolTypeId ? { schulform: herkunft.schoolTypeId } : {}),
    ...(herkunft.ueberthema?.trim() ? { ueberthema: herkunft.ueberthema.trim() } : {}),
    id,
    name: name || 'Ohne Namen',
    detail,
    updatedAt,
    entwurf,
    suchtext: [name, detail, ...weitere].join(' ').toLocaleLowerCase('de')
  }
}

/** Führt die Listen aller Programme zusammen; die Entwurf-Regeln sind die der jeweiligen Bibliothek. */
export function vereinige(l: Listen): Material[] {
  return [
    ...l.tests.map((t) =>
      // Fach und Klasse seit Paket 7 – ältere Tests haben sie nicht, dann bleibt es bei der Vokabelzahl
      material(
        'vokabeltest',
        t.id,
        t.name,
        t.updatedAt,
        !t.hasTest,
        zeile(t.subjectLabel, klasse(t.grade), `${t.vocabCount} Vokabeln`, t.hasTest ? '' : 'noch kein Test'),
        [],
        t.language ?? t.subjectLabel ?? lehrwerkAngaben(t.name)?.language,
        t.grade ?? lehrwerkAngaben(t.name)?.grade
      )
    ),
    ...l.sheets.map((s) =>
      material(
        'arbeitsblatt',
        s.id,
        s.name,
        s.updatedAt,
        s.sheetCount === 0,
        zeile(s.subjectLabel, klasse(s.grade), s.topic),
        [s.schoolTypeName],
        s.subjectId,
        s.grade,
        s.topic,
        s
      )
    ),
    ...l.kurztests.map((t) =>
      material(
        'lernzielkontrolle',
        t.id,
        t.name,
        t.updatedAt,
        t.taskCount === 0,
        zeile(t.subjectLabel, klasse(t.grade), t.thema),
        [t.bezeichnung],
        t.subjectLabel,
        t.grade,
        t.thema,
        t
      )
    ),
    ...l.grammarTests.map((t) =>
      material(
        'grammatiktest',
        t.id,
        t.name,
        t.updatedAt,
        t.taskCount === 0,
        zeile(t.subjectLabel, klasse(t.grade), t.topics),
        [],
        t.subjectLabel,
        t.grade,
        t.topics,
        t
      )
    ),
    ...l.exams.map((e) =>
      material(
        'klassenarbeit',
        e.id,
        e.name,
        e.updatedAt,
        !e.hasTasks,
        zeile(e.subjectLabel, klasse(e.grade), e.topic),
        [],
        e.subjectLabel,
        e.grade,
        e.topic,
        e
      )
    ),
    ...l.vokabellisten.map((v) =>
      material(
        'vokabelliste',
        v.id,
        v.name,
        v.updatedAt,
        false,
        zeile(`${v.entries.length} Vokabeln`, klasse(v.grade), v.source),
        [sprache(v.language)],
        v.language,
        v.grade
      )
    )
  ]
}

/** Die Liste EINES Programms als Materialien (für die Themenbereiche in seiner Bibliothek) */
export const nurListe = (teil: Partial<Listen>): Material[] =>
  vereinige({ tests: [], sheets: [], kurztests: [], grammarTests: [], exams: [], vokabellisten: [], ...teil })

const zeit = (m: Material): number => Date.parse(m.updatedAt) || 0

/** Die zuletzt bearbeiteten zuerst. */
export function neueste(liste: Material[], anzahl: number): Material[] {
  return [...liste].sort((a, b) => zeit(b) - zeit(a)).slice(0, anzahl)
}

/**
 * Suche über Name, Thema und Fach. Alle Wörter der Eingabe müssen vorkommen, in beliebiger
 * Reihenfolge – „englisch 7 present" findet „Present Perfect" in Englisch, Klasse 7.
 */
export function suche(liste: Material[], eingabe: string): Material[] {
  const woerter = eingabe.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
  if (!woerter.length) return []
  return neueste(
    liste.filter((m) => woerter.every((w) => m.suchtext.includes(w))),
    Infinity
  )
}

/** Holt die Listen aller Programme. Fällt eine aus, fehlen nur deren Einträge. */
export async function ladeMaterialien(): Promise<Material[]> {
  const sicher = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [])
  const [tests, sheets, kurztests, grammarTests, exams, vokabellisten] = await Promise.all([
    sicher(window.api.tests.list()),
    sicher(window.api.sheets.list()),
    sicher(window.api.kurztests.list()),
    sicher(window.api.grammarTests.list()),
    sicher(window.api.exams.list()),
    sicher(window.api.library.list())
  ])
  return vereinige({ tests, sheets, kurztests, grammarTests, exams, vokabellisten })
}
