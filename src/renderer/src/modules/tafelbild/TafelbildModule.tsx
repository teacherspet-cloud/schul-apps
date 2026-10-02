import { useEffect } from 'react'
import { useAppSettings } from '../../shared/settingsStore'
import { nimmFachVorgabe } from '../../shared/fachVorgabe'
import EinfacheBibliothek from '../../shared/testmodul/EinfacheBibliothek'
import ZweiSchrittModul, { type BibliotheksSeiteProps } from '../../shared/testmodul/ZweiSchrittModul'
import { subjectById } from '../arbeitsblatt/model/subjects'
import './auftrag'
import { hatTafel, leeresTafelbild, standardName, type Tafelbild } from './model'
import { TafelVorschau } from './editor/TafelVorschau'
import Bearbeiten from './steps/Bearbeiten'
import Einrichten from './steps/Einrichten'
import { bibliothek, projektDatei, useTafelbild } from './store'

/** Neues Tafelbild mit Land und Schulform aus den Einstellungen, Fach ggf. aus dem Themenbereich */
export function neuesTafelbild(): Tafelbild {
  const d = useAppSettings.getState().settings.defaults
  const vorgabe = nimmFachVorgabe('tafelbild')
  const fach = vorgabe && subjectById(vorgabe).id === vorgabe ? subjectById(vorgabe) : null
  return leeresTafelbild({
    stateId: d?.stateId,
    schoolTypeId: d?.schoolTypeId,
    ...(fach ? { subjectId: fach.id, subjectLabel: fach.label } : {})
  })
}

function TafelbildBibliothek(props: BibliotheksSeiteProps): React.JSX.Element {
  return (
    <EinfacheBibliothek
      props={props}
      api={window.api.tafelbilder}
      moduleId="tafelbild"
      titel="Meine Tafelbilder"
      einzahl="Ein Tafelbild"
      mehrzahl="Tafelbilder"
      neuText="Neues Tafelbild"
      offeneId={() => useTafelbild.getState().docId}
      umbenannt={(m) => useTafelbild.getState().markSaved(m.id, m.updatedAt, m.name)}
      geloescht={() => useTafelbild.getState().forgetSaved()}
      oeffnen={bibliothek.oeffnen}
      info={(m) => [String(m.thema ?? ''), String(m.formate ?? '')]}
    />
  )
}

/** Programm „Tafelbilder" (30.09.2026) */
export default function TafelbildModule({ active }: { active: boolean }): React.JSX.Element {
  const dok = useTafelbild((s) => s.dok)
  useEffect(() => {
    if (!dok) useTafelbild.getState().setDok(neuesTafelbild())
  }, [dok])
  return (
    <ZweiSchrittModul
      active={active}
      modulId="tafelbild"
      useStore={useTafelbild}
      dokument={(s) => s.dok}
      hatInhalt={hatTafel}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={standardName}
      liste={() => window.api.tafelbilder.list()}
      BibliotheksSeite={TafelbildBibliothek}
      schritte={[
        { label: 'Thema & Einstellungen', description: 'Lerngruppe, Material, Formate, Regler' },
        { label: 'Tafelbild', description: 'Zeichenfläche, Präsentation, Ausgabe' }
      ]}
      einstellen={<Einrichten />}
      bearbeiten={() => <Bearbeiten />}
      texte={{ meine: 'Meine Tafelbilder', neu: 'Neues Tafelbild' }}
      // Live-Vorschau (02.10.2026): Entwurf, Korrektur, Zeichnungen – das Formular bleibt dahinter offen
      vorschau={(z) => <TafelVorschau z={z} />}
    />
  )
}
