import { useEffect } from 'react'
import { useAppSettings } from '../../shared/settingsStore'
import ZweiSchrittModul, { type BibliotheksSeiteProps } from '../../shared/testmodul/ZweiSchrittModul'
import { hatText, standardName, type Elternbrief } from './model'
import BriefBibliothek from './steps/Bibliothek'
import Brief from './steps/Brief'
import Inhalt from './steps/Inhalt'
import { bibliothek, projektDatei, useElternbrief } from './store'

export function leererBrief(): Elternbrief {
  return {
    version: 1,
    meta: {
      title: '',
      anlass: 'Allgemeine Information',
      ton: 'freundlich',
      stichpunkte: '',
      klasse: '',
      // Name der Lehrkraft aus Einstellungen › Schule (29.09.2026) – am Brief änderbar
      absender: useAppSettings.getState().settings.briefkopf?.lehrkraft ?? '',
      datum: new Date().toISOString().slice(0, 10),
      ruecklauf: false
    },
    text: null,
    uebersetzungen: [],
    createdAt: new Date().toISOString()
  }
}

/** Bibliotheksseite (stabil außerhalb des Programms) – Schuljahr → Klasse → Briefe (09.10.2026, steps/Bibliothek.tsx) */
function ElternbriefBibliothek(props: BibliotheksSeiteProps): React.JSX.Element {
  return <BriefBibliothek props={props} />
}

/** Programm „Elternbrief" (Großprogramm 0.4, F7; Strg+7) */
export default function ElternbriefModule({ active }: { active: boolean }): React.JSX.Element {
  const dok = useElternbrief((s) => s.dok)
  // Nach „Neuer Elternbrief" (und beim ersten Öffnen) ein leeres Dokument anlegen
  useEffect(() => {
    if (!dok) useElternbrief.getState().setDok(leererBrief())
  }, [dok])
  return (
    <ZweiSchrittModul
      active={active}
      modulId="elternbrief"
      useStore={useElternbrief}
      dokument={(s) => s.dok}
      hatInhalt={hatText}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={standardName}
      liste={() => window.api.elternbriefe.list()}
      BibliotheksSeite={ElternbriefBibliothek}
      schritte={[
        { label: 'Anlass & Stichpunkte', description: 'Ton, Rücklauf, Unterschrift' },
        { label: 'Brief & Übersetzungen', description: 'Bearbeiten, Sprachen, Word, PDF' }
      ]}
      einstellen={<Inhalt />}
      bearbeiten={() => <Brief />}
      texte={{ meine: 'Meine Elternbriefe', neu: 'Neuer Elternbrief' }}
    />
  )
}
