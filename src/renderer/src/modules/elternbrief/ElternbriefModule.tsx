import { useEffect } from 'react'
import { useAppSettings } from '../../shared/settingsStore'
import EinfacheBibliothek from '../../shared/testmodul/EinfacheBibliothek'
import ZweiSchrittModul, { type BibliotheksSeiteProps } from '../../shared/testmodul/ZweiSchrittModul'
import { hatText, standardName, type Elternbrief } from './model'
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

/** Bibliotheksseite (stabil außerhalb des Programms) */
function ElternbriefBibliothek(props: BibliotheksSeiteProps): React.JSX.Element {
  return (
    <EinfacheBibliothek
      props={props}
      api={window.api.elternbriefe}
      moduleId="elternbrief"
      titel="Meine Elternbriefe"
      einzahl="Ein Elternbrief"
      mehrzahl="Elternbriefe"
      neuText="Neuer Elternbrief"
      offeneId={() => useElternbrief.getState().docId}
      umbenannt={(m) => useElternbrief.getState().markSaved(m.id, m.updatedAt, m.name)}
      geloescht={() => useElternbrief.getState().forgetSaved()}
      oeffnen={bibliothek.oeffnen}
      info={(m) => [String(m.thema ?? ''), Number(m.sprachen) ? `${m.sprachen} Übersetzungen` : '']}
    />
  )
}

/** Programm „Elternbrief" (Großprogramm 0.4, F7; Strg+8) */
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
