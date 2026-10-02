import ZweiSchrittModul from '../../shared/testmodul/ZweiSchrittModul'
import { bibliothek, defaultKurztestName, hatInhalt } from './library'
import { projektDatei } from './project'
import EditorStep from './steps/EditorStep'
import KurztestLibrary from './steps/KurztestLibrary'
import SetupStep from './steps/SetupStep'
import { useLernzielkontrolle } from './store'
import { ZwischenstandsBlatt } from '../arbeitsblatt/render/BlattVorschau'
import { kurztestToWorksheetAlle } from './render/kurztestWorksheet'
import type { Kurztest } from './model/types'

/**
 * Programm „Lernzielkontrolle".
 *
 * Zwei Schritte: Lerngruppe und Landesformat wählen, dann die erzeugte Kontrolle ansehen,
 * bearbeiten und ausgeben. Beim Öffnen erscheinen die gespeicherten Kontrollen, sofern es
 * welche gibt – wie in den anderen Programmen. Gespeichert wird von selbst, sobald Aufgaben
 * da sind. Hülle gemeinsam mit Klassenarbeit und Grammatiktest (shared/testmodul).
 *
 * Warum es ein eigenes Programm ist und keine Einstellung der Klassenarbeit: Das Format hat
 * eine eigene Rechtsgrundlage je Bundesland (Bezeichnung, Höchstdauer, Ankündigungspflicht,
 * Stoffgrenze), eine engere Operatorenauswahl und eine andere Bauregel – auf das Blatt
 * gehören nur Aufgaben und Material, keine Lernhilfen. Als Schalter in der Klassenarbeit
 * wäre das alles unsichtbar gewesen.
 */
export default function LernzielkontrolleModule({ active }: { active: boolean }): React.JSX.Element {
  return (
    <ZweiSchrittModul
      active={active}
      modulId="lernzielkontrolle"
      useStore={useLernzielkontrolle}
      dokument={(s) => s.test}
      hatInhalt={hatInhalt}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={defaultKurztestName}
      liste={() => window.api.kurztests.list()}
      BibliotheksSeite={KurztestLibrary}
      schritte={[
        { label: 'Lerngruppe & Format', description: 'Bundesland, Zeit, Stoff' },
        { label: 'Bearbeiten & Export', description: 'Prüfung, Word, PDF' }
      ]}
      einstellen={<SetupStep />}
      bearbeiten={() => <EditorStep />}
      texte={{ meine: 'Meine Lernzielkontrollen', neu: 'Neue Kontrolle' }}
      // Live-Vorschau (02.10.2026): die entstehenden Fassungen
      vorschau={(z) => <ZwischenstandsBlatt<Kurztest> z={z} alsBlatt={(t) => kurztestToWorksheetAlle(t)} />}
    />
  )
}
