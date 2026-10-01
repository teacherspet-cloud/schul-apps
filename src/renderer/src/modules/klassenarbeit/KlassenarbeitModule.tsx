import ZweiSchrittModul from '../../shared/testmodul/ZweiSchrittModul'
import { useRueckfrage } from '../../shared/auftraege'
import { bibliothek, defaultExamName } from './library'
import { projektDatei } from './project'
import ExamLibrary from './steps/ExamLibrary'
import FrameStep from './steps/FrameStep'
import TasksStep from './steps/TasksStep'
import { useKlassenarbeit } from './store'
import QuellenAuswahl from '../arbeitsblatt/steps/QuellenAuswahl'
import { QUELLENAUSWAHL, type QuellenFrage } from '../arbeitsblatt/auftraege'

/**
 * Programm „Klassenarbeiten".
 * Beim Öffnen erscheinen die gespeicherten Arbeiten, sofern es welche gibt. Die Hülle (Schritte,
 * Bibliothek, Leiste, Rückgängig, Datei öffnen) teilt es mit Lernzielkontrolle und Grammatiktest
 * (shared/testmodul/ZweiSchrittModul.tsx, Großprogramm 0.4). Zwei Schritte: Bis 25.09.2026 stand
 * hier ein dritter „Bearbeiten & Export", der fest gesperrt war; Bearbeiten und Ausgeben gehören
 * zum zweiten Schritt.
 */
export default function KlassenarbeitModule({ active }: { active: boolean }): React.JSX.Element {
  const docId = useKlassenarbeit((s) => s.docId)
  // Oberstufe: Der Auftrag wartet auf die Wahl der Quelle
  const quellenFrage = useRueckfrage(docId, QUELLENAUSWAHL)
  return (
    <ZweiSchrittModul
      active={active}
      modulId="klassenarbeit"
      useStore={useKlassenarbeit}
      dokument={(s) => s.exam}
      hatInhalt={(e) => Boolean(e?.parts.length)}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={defaultExamName}
      liste={() => window.api.exams.list()}
      BibliotheksSeite={ExamLibrary}
      schritte={[
        { label: 'Rahmen', description: 'Fach, Lerngruppe, Aufbau, Material' },
        { label: 'Bearbeiten & Export', description: 'Aufgaben, Erwartungshorizont, Word, PDF' }
      ]}
      einstellen={<FrameStep />}
      bearbeiten={(exam) => <TasksStep exam={exam} />}
      texte={{ meine: 'Meine Klassenarbeiten', neu: 'Neue Klassenarbeit' }}
      zusatz={
        quellenFrage && (
          <QuellenAuswahl
            treffer={(quellenFrage.daten as QuellenFrage).treffer}
            thema={(quellenFrage.daten as QuellenFrage).thema}
            programm="klassenarbeit"
            onWaehlen={(url) => quellenFrage.antworte(url)}
          />
        )
      }
    />
  )
}
