import { useEffect } from 'react'
import { STANDARD_ANREDE } from './render/texte'
import { useAppSettings } from '../../shared/settingsStore'
import EinfacheBibliothek from '../../shared/testmodul/EinfacheBibliothek'
import { RueckmeldungVorschau } from './steps/RueckmeldungVorschau'
import ZweiSchrittModul, { type BibliotheksSeiteProps } from '../../shared/testmodul/ZweiSchrittModul'
import { notifyError } from '../../shared/util'
import { subjectById } from '../arbeitsblatt/model/subjects'
import { schulformVon } from '@shared/schulformen'
import { ladeGrundlage } from './generation'
import { hatInhalt, standardName, type Rueckmeldung } from './model/types'
import Boegen from './steps/Boegen'
import Einrichten from './steps/Einrichten'
import { bibliothek, projektDatei, useRueckmeldung } from './store'
import { aeltereRueckmeldungZu, horcheAufVorgabe, nimmRueckmeldungVorgabe, rueckmeldungIdZu } from './vorgabe'

/** Eine leere Rückmeldung mit den Voreinstellungen der Schule */
export function leereRueckmeldung(): Rueckmeldung {
  const { defaults } = useAppSettings.getState().settings
  return {
    version: 1,
    meta: {
      title: '',
      subjectId: 'deutsch',
      subjectLabel: subjectById('deutsch').label,
      grade: 7,
      stateId: defaults.stateId,
      schoolTypeId: defaults.schoolTypeId,
      schoolTypeName: schulformVon(defaults.stateId, defaults.schoolTypeId)?.name ?? '',
      anrede: STANDARD_ANREDE,
      schwerpunkt: ''
    },
    grundlage: { art: 'frei', titel: '', aufgaben: '' },
    abgaben: [],
    createdAt: new Date().toISOString()
  }
}

/** Bibliotheksseite (stabil außerhalb des Programms, sonst entstünde sie bei jedem Zeichnen neu) */
function RueckmeldungBibliothek(props: BibliotheksSeiteProps): React.JSX.Element {
  return (
    <EinfacheBibliothek
      props={props}
      api={window.api.rueckmeldungen}
      moduleId="rueckmeldung"
      titel="Meine Rückmeldungen"
      einzahl="Eine Rückmeldung"
      mehrzahl="Rückmeldungen"
      neuText="Neue Rückmeldung"
      offeneId={() => useRueckmeldung.getState().docId}
      umbenannt={(m) => useRueckmeldung.getState().markSaved(m.id, m.updatedAt, m.name)}
      geloescht={() => useRueckmeldung.getState().forgetSaved()}
      oeffnen={bibliothek.oeffnen}
      info={(m) => [String(m.thema ?? ''), `${m.abgaben ?? 0} Abgaben`, `${m.fertig ?? 0} Bögen`]}
    />
  )
}

/**
 * Programm „Rückmeldung" (Großprogramm 0.4, F3; Strg+6): lernförderliche Rückmeldung ohne Note
 * zu Schülerarbeiten – aus einem gespeicherten Material heraus oder zu einer eigenen Aufgabe.
 */
export default function RueckmeldungModule({ active }: { active: boolean }): React.JSX.Element {
  const dok = useRueckmeldung((s) => s.dok)
  // Nach „Neue Rückmeldung" (und beim ersten Öffnen) ein leeres Dokument anlegen
  useEffect(() => {
    if (!dok) useRueckmeldung.getState().setDok(leereRueckmeldung())
  }, [dok])
  /*
   * „Rückmeldung …" aus einem anderen Programm (08.10.2026: je Material eine Rückmeldung): die
   * vorhandene öffnen, sonst eine neue mit diesem Material anlegen und gleich sichern – so steht
   * sie sofort in „Meine Rückmeldungen" und der nächste Klick findet sie.
   */
  useEffect(() => {
    const uebernehmen = (): void => {
      const v = nimmRueckmeldungVorgabe()
      if (!v) return
      void (async () => {
        const vorhanden = await rueckmeldungIdZu(v.art, v.id)
        if (vorhanden) return bibliothek.oeffnen(vorhanden)
        await bibliothek.neuSicher()
        const { grundlage, fach } = await ladeGrundlage(v.art, v.id)
        const aeltere = await aeltereRueckmeldungZu(v.art, v.id, grundlage.titel)
        if (aeltere) {
          await bibliothek.oeffnen(aeltere)
          // Neu sichern, damit die Quelle ins Verzeichnis kommt (rueckmeldungStats)
          return bibliothek.speichern()
        }
        const r = leereRueckmeldung()
        r.grundlage = grundlage
        if (fach.id) Object.assign(r.meta, { subjectId: fach.id, subjectLabel: fach.label || subjectById(fach.id).label, grade: fach.grade || r.meta.grade })
        useRueckmeldung.getState().setDok(r)
        useRueckmeldung.getState().setStep(0)
        // Gleiche Kennung wie das automatische Speichern – es überschreibt nur, legt nichts doppelt an
        await bibliothek.speichern()
      })().catch(notifyError)
    }
    uebernehmen()
    return horcheAufVorgabe(uebernehmen)
  }, [])
  return (
    <ZweiSchrittModul
      active={active}
      modulId="rueckmeldung"
      useStore={useRueckmeldung}
      dokument={(s) => s.dok}
      hatInhalt={hatInhalt}
      bibliothek={bibliothek}
      projekt={projektDatei}
      standardName={standardName}
      liste={() => window.api.rueckmeldungen.list()}
      BibliotheksSeite={RueckmeldungBibliothek}
      schritte={[
        { label: 'Grundlage & Abgaben', description: 'Aufgabe, Lerngruppe, Arbeiten' },
        { label: 'Bögen & Export', description: 'Durchsehen, Word, PDF' }
      ]}
      einstellen={<Einrichten />}
      bearbeiten={() => <Boegen />}
      texte={{ meine: 'Meine Rückmeldungen', neu: 'Neue Rückmeldung' }}
      // Live-Vorschau (02.10.2026): jeder Bogen, sobald er geschrieben ist
      vorschau={(z) => <RueckmeldungVorschau z={z} />}
    />
  )
}
