/**
 * Grammatiktests in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern und Klassenarbeiten. Gespeichert wird unter
 * `%APPDATA%/schul-apps/grammatiktests`.
 */
import type { SavedGrammarTestStats } from '@shared/types'
import { ueberthemaVon } from '../../shared/ueberthema'
import { chosenGrammarTopics } from '../arbeitsblatt/didactics/grammar'
import { erzeugeBibliothek } from '../../shared/testmodul/bibliothek'
import type { GrammarTest } from './model/types'
import { istVerbTest, testHasContent, testPoints, testTaskCount } from './model/types'
import { useGrammatiktest } from './store'

/** Die geprüften Formen ausgeschrieben – in der Übersicht ist das die eigentliche Kennzeichnung. */
export function testTopicLine(test: GrammarTest): string {
  // Unregelmäßige Verben (30.09.2026): die Liste statt eines Grammatikthemas
  if (istVerbTest(test)) {
    const v = test.meta.verben!
    return `Unregelmäßige Verben${v.quelle === 'lehrwerk' && v.listenName ? ` (${v.listenName})` : ''}`
  }
  return chosenGrammarTopics({ ...test.meta, grammarTopics: test.meta.topics } as never)
    .map((t) => t.label)
    .join(', ')
}

export function testStats(test: GrammarTest): SavedGrammarTestStats {
  return {
    subjectLabel: test.meta.subjectLabel,
    grade: test.meta.grade,
    topics: testTopicLine(test),
    taskCount: testTaskCount(test),
    points: testPoints(test),
    minutes: test.meta.minutes,
    graded: test.meta.graded,
    varianten: test.blocksB?.length ? 2 : 1,
    stateId: test.meta.stateId,
    schoolTypeId: test.meta.schoolTypeId,
    ...(ueberthemaVon(test.meta) ? { ueberthema: ueberthemaVon(test.meta) } : {})
  }
}

/** Vorschlag für den Namen: Titel, sonst Fach und geprüfte Formen. */
export function defaultTestName(test: GrammarTest): string {
  const title = test.meta.title.trim()
  if (title) return title
  const topics = testTopicLine(test)
  return topics ? `${test.meta.subjectLabel} – ${topics}` : `Grammatiktest ${test.meta.subjectLabel}`
}

/**
 * Lohnt sich das Sichern? Schon als Entwurf, sobald eine Form gewählt oder ein Titel da ist –
 * nicht erst nach dem Erzeugen. Ein leeres Formular soll die Übersicht aber nicht füllen.
 */
export const lohntSicherung = (test: GrammarTest | null): boolean =>
  Boolean(test && (testHasContent(test) || test.meta.topics.length || test.meta.title.trim() || (istVerbTest(test) && test.meta.verben!.verben.length)))

/*
 * Speichern, Öffnen, Ablegen, Neu, automatisch Speichern: gemeinsames Gerüst mit den anderen
 * Testprogrammen (shared/testmodul/bibliothek.ts, Großprogramm 0.4). Die bisherigen Namen bleiben.
 */
export const bibliothek = erzeugeBibliothek({
  store: useGrammatiktest,
  dokument: (s) => s.test,
  setzeDokument: (s, d) => s.setTest(d),
  // Erst beim Aufruf nachschlagen – beim Laden des Moduls (auch in Tests) gibt es `window.api` noch nicht
  api: { save: (i) => window.api.grammarTests.save(i), get: (id) => window.api.grammarTests.get(id) },
  stats: testStats,
  standardName: defaultTestName,
  lohntSicherung
})

export const saveCurrentTest = bibliothek.speichern
export const openSavedTest = bibliothek.oeffnen
/** Ist genau dieses Dokument gerade im Programm offen? */
export const testOffen = bibliothek.istOffen
/** Ergebnis eines Hintergrund-Auftrags ablegen (siehe shared/auftraege.ts) */
export const legeTestAb = bibliothek.legeAb
/** Neues Dokument beginnen – das bisherige vorher sichern. */
export const newTestSafely = bibliothek.neuSicher
export const useTestAutosave = bibliothek.useAutosave
