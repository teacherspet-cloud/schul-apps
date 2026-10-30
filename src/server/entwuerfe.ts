/**
 * Nicht angefertigte Tests aufräumen (30.10.2026, Auftrag der Lehrkraft: „In der Vokabeltest-, Grammatiktest-,
 * Lernzielkontrollen- und Klassenarbeiten-App: Lösche noch nicht angefertigte Tests nach 24 Stunden automatisch durch
 * den Server"). Ein Entwurf, an dem 24 Stunden nichts geändert wurde und der noch keinen Test enthält, wird gelöscht:
 *  - Vokabeltest: noch kein Test erstellt (`hasTest` aus)
 *  - Grammatiktest und Lernzielkontrolle: noch keine Aufgaben (`taskCount` 0)
 *  - Klassenarbeit: noch keine Aufgaben erzeugt (`hasTasks` aus)
 * Gezählt wird ab der letzten Änderung, damit niemandem ein Entwurf verschwindet, an dem gerade gearbeitet wird. Nur am
 * Server (die Desktop-App räumt nicht auf). Ein mit einem Termin verknüpfter, gelöschter Entwurf zeigt dort den Hinweis
 * „Diesen Test gibt es nicht mehr" (TestZumTermin.tsx).
 */
import type { SavedExamMeta, SavedGrammarTestMeta, SavedKurztestMeta, SavedTestMeta } from '@shared/types'
import { alleNutzer, protokolliereServer } from './datenbank'
import { alsNutzer } from './http'
import { imNutzer } from './kontext'
import { deleteTest, listTests } from '../main/services/storage/vocabTests'
import { deleteGrammarTest, listGrammarTests } from '../main/services/storage/grammarTests'
import { deleteKurztest, listKurztests } from '../main/services/storage/kurztests'
import { deleteExam, listExams } from '../main/services/storage/exams'

export const ENTWURF_FRIST_MS = 24 * 60 * 60 * 1000

/** Ist ein Eintrag ein alter, nicht angefertigter Entwurf? */
export const alterEntwurf = (t: { updatedAt: string; createdAt: string }, leer: boolean, jetzt: number): boolean => {
  const zuletzt = Date.parse(t.updatedAt || t.createdAt)
  return leer && Number.isFinite(zuletzt) && jetzt - zuletzt >= ENTWURF_FRIST_MS
}

const APPS: { name: string; liste: () => { id: string; updatedAt: string; createdAt: string }[]; leer: (t: never) => boolean; loeschen: (id: string) => unknown }[] = [
  { name: 'Vokabeltest', liste: listTests, leer: ((t: SavedTestMeta) => !t.hasTest) as (t: never) => boolean, loeschen: deleteTest },
  { name: 'Grammatiktest', liste: listGrammarTests, leer: ((t: SavedGrammarTestMeta) => !(t.taskCount > 0)) as (t: never) => boolean, loeschen: deleteGrammarTest },
  { name: 'Lernzielkontrolle', liste: listKurztests, leer: ((t: SavedKurztestMeta) => !(t.taskCount > 0)) as (t: never) => boolean, loeschen: deleteKurztest },
  { name: 'Klassenarbeit', liste: listExams, leer: ((t: SavedExamMeta) => !t.hasTasks) as (t: never) => boolean, loeschen: deleteExam }
]

/** Einmal für alle Lehrkräfte; gibt die Zahl der gelöschten Entwürfe je App zurück */
export function entwuerfeAufraeumen(jetzt = Date.now()): Record<string, number> {
  const zahl: Record<string, number> = {}
  for (const n of alleNutzer()) {
    if (n.rolle === 'schueler') continue
    try {
      imNutzer(alsNutzer(n), () => {
        for (const app of APPS) {
          for (const t of app.liste()) {
            if (!alterEntwurf(t, app.leer(t as never), jetzt)) continue
            try {
              app.loeschen(t.id)
              zahl[app.name] = (zahl[app.name] ?? 0) + 1
            } catch {
              /* Datei schon weg – beim nächsten Lauf nicht mehr im Verzeichnis */
            }
          }
        }
      })
    } catch {
      /* Ablage dieser Lehrkraft nicht lesbar – beim nächsten Lauf erneut */
    }
  }
  const summe = Object.values(zahl).reduce((a, b) => a + b, 0)
  if (summe) protokolliereServer('aufraeumen', `Nicht angefertigte Tests (24 h ohne Änderung) gelöscht: ${Object.entries(zahl).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  return zahl
}

/** Zeitplaner (start.ts): kurz nach dem Start, dann stündlich */
export function entwuerfeAufraeumenStarten(): void {
  const lauf = (): void => {
    try {
      entwuerfeAufraeumen()
    } catch {
      /* beim nächsten Durchgang */
    }
  }
  setTimeout(lauf, 3 * 60_000).unref?.()
  setInterval(lauf, 60 * 60_000).unref?.()
}
