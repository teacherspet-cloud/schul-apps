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
import type { SavedExamMeta, SavedGrammarTestMeta, SavedKurztestMeta, SavedTestMeta, SavedVocabList, SavedWorksheetMeta } from '@shared/types'

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
const zeile = (...teile: (string | undefined)[]): string => teile.filter((t) => t && t.trim()).join(' · ')

function material(moduleId: string, id: string, name: string, updatedAt: string, entwurf: boolean, detail: string, weitere: string[]): Material {
  return {
    moduleId,
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
      material('vokabeltest', t.id, t.name, t.updatedAt, !t.hasTest, zeile(`${t.vocabCount} Vokabeln`, t.hasTest ? '' : 'noch kein Test'), [])
    ),
    ...l.sheets.map((s) =>
      material('arbeitsblatt', s.id, s.name, s.updatedAt, s.sheetCount === 0, zeile(s.subjectLabel, klasse(s.grade), s.topic), [s.schoolTypeName])
    ),
    ...l.kurztests.map((t) =>
      material('lernzielkontrolle', t.id, t.name, t.updatedAt, t.taskCount === 0, zeile(t.subjectLabel, klasse(t.grade), t.thema), [t.bezeichnung])
    ),
    ...l.grammarTests.map((t) => material('grammatiktest', t.id, t.name, t.updatedAt, t.taskCount === 0, zeile(t.subjectLabel, klasse(t.grade), t.topics), [])),
    ...l.exams.map((e) => material('klassenarbeit', e.id, e.name, e.updatedAt, !e.hasTasks, zeile(e.subjectLabel, klasse(e.grade), e.topic), [])),
    ...l.vokabellisten.map((v) =>
      material('vokabelliste', v.id, v.name, v.updatedAt, false, zeile(`${v.entries.length} Vokabeln`, klasse(v.grade), v.source), [])
    )
  ]
}

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
