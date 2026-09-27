/**
 * Grammatiktests in der App speichern und wieder öffnen – wie bei Vokabeltests,
 * Arbeitsblättern und Klassenarbeiten. Gespeichert wird unter
 * `%APPDATA%/schul-apps/grammatiktests`.
 */
import type { SavedGrammarTestStats } from '@shared/types'
import { einsortierenNachSpeichern } from '../../shared/themenbereiche'
import { ueberthemaVon } from '../../shared/ueberthema'
import { dokumentName, sichereAlles } from '../../shared/autosave'
import { legeAb } from '../../shared/auftraege'
import { useStoreAutosave } from '../../shared/useAutosave'
import { chosenGrammarTopics } from '../arbeitsblatt/didactics/grammar'
import type { GrammarTest } from './model/types'
import { testHasContent, testPoints, testTaskCount } from './model/types'
import { useGrammatiktest } from './store'

/** Die geprüften Formen ausgeschrieben – in der Übersicht ist das die eigentliche Kennzeichnung. */
export function testTopicLine(test: GrammarTest): string {
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
  Boolean(test && (testHasContent(test) || test.meta.topics.length || test.meta.title.trim()))

export async function saveCurrentTest(name?: string): Promise<void> {
  const state = useGrammatiktest.getState()
  const test = state.test
  if (!test || !lohntSicherung(test)) return
  const id = state.docId
  const meta = await window.api.grammarTests.save({
    id,
    name: name?.trim() || dokumentName(id, state.docName, defaultTestName(test)),
    stats: testStats(test),
    payload: test
  })
  void einsortierenNachSpeichern()
  useGrammatiktest.getState().markSaved(meta.id, meta.updatedAt, meta.name)
}

export async function openSavedTest(id: string): Promise<void> {
  // Was am bisherigen Test noch ansteht, zuerst sichern – sonst ginge es beim Wechsel verloren
  await sichereAlles()
  const saved = await window.api.grammarTests.get(id)
  useGrammatiktest.getState().openSaved(saved.id, saved.name, saved.payload as GrammarTest, saved.updatedAt)
}

/** Ist genau dieser Test gerade im Programm offen? */
export const testOffen = (docId: string): boolean => {
  const s = useGrammatiktest.getState()
  return s.docId === docId && s.test !== null
}

/**
 * Ergebnis eines Hintergrund-Auftrags im Test `docId` ablegen (siehe shared/auftraege.ts):
 * im offenen Test als Rückgängig-Schritt (und zum Editor), sonst direkt in der Bibliothek.
 */
export function legeTestAb(docId: string, schnappschuss: GrammarTest, einarbeiten: (t: GrammarTest) => GrammarTest, schritt?: number): Promise<void> {
  return legeAb<GrammarTest>(
    {
      istOffen: testOffen,
      imOffenen: (f) => {
        const s = useGrammatiktest.getState()
        if (!s.test) return
        s.setTest(f(s.test))
        if (schritt !== undefined) s.setStep(schritt)
      },
      laden: async (id) => {
        const t = await window.api.grammarTests.get(id)
        return { name: t.name, dok: t.payload as GrammarTest }
      },
      speichern: async (id, name, test) => {
        await window.api.grammarTests.save({ id, name: name ?? defaultTestName(test), stats: testStats(test), payload: test })
        void einsortierenNachSpeichern()
      }
    },
    docId,
    schnappschuss,
    einarbeiten
  )
}

/** Neuen Test beginnen – den bisherigen vorher sichern. */
export async function newTestSafely(): Promise<void> {
  await sichereAlles()
  useGrammatiktest.getState().reset()
}

/**
 * Automatisches Speichern – als Entwurf ab dem ersten Schritt, danach nach jeder Änderung.
 * Verzögert, damit nicht jede Eingabe im Editor eine Datei schreibt.
 */
export function useTestAutosave(): void {
  useStoreAutosave({
    store: useGrammatiktest,
    dokument: (s) => s.docId,
    gesichert: (s) => Boolean(s.savedAt),
    bereit: (s) => lohntSicherung(s.test),
    // Ein geänderter Name zählt nur, wenn ihn die Lehrkraft geändert hat – nicht die Bestätigung des Speicherns
    geaendert: (s, prev) => s.test !== prev.test || (s.docName !== prev.docName && s.savedAt === prev.savedAt),
    speichern: () => saveCurrentTest()
  })
}
