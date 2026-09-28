import ZweiSchrittModul from '../../shared/testmodul/ZweiSchrittModul'
import { bibliothek, defaultTestName } from './library'
import { projektDatei } from './project'
import SetupStep from './steps/SetupStep'
import TestEditorStep from './steps/TestEditorStep'
import TestLibrary from './steps/TestLibrary'
import { useGrammatiktest } from './store'

/**
 * Programm „Grammatiktest".
 *
 * Zwei Schritte: Formen und Umfang wählen, dann den erzeugten Test bearbeiten und ausgeben.
 * Beim Öffnen erscheinen die gespeicherten Tests, sofern es welche gibt – wie in den anderen
 * Programmen. Gespeichert wird von selbst, sobald Aufgaben da sind. Hülle gemeinsam mit
 * Klassenarbeit und Lernzielkontrolle (shared/testmodul).
 */
export default function GrammatiktestModule({ active }: { active: boolean }): React.JSX.Element {
  return (
    <ZweiSchrittModul
      active={active}
      modulId="grammatiktest"
      useStore={useGrammatiktest}
      dokument={(s) => s.test}
      hatInhalt={(t) => Boolean(t?.blocks.length)}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={defaultTestName}
      liste={() => window.api.grammarTests.list()}
      BibliotheksSeite={TestLibrary}
      schritte={[
        { label: 'Formen & Umfang', description: 'Lerngruppe, geprüfte Formen' },
        { label: 'Bearbeiten & Export', description: 'Lösungen, Word, PDF' }
      ]}
      einstellen={<SetupStep />}
      bearbeiten={() => <TestEditorStep />}
      texte={{ meine: 'Meine Grammatiktests', neu: 'Neuer Test' }}
    />
  )
}
