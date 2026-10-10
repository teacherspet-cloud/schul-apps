import { Loader } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type AppSettings, type DeepPartial } from '@shared/types'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'
import { useAppSettings } from '../../shared/settingsStore'
import { KlappKarte } from '../../shared/components/KlappKarte'
import FachfarbenSettings from '../../shell/FachfarbenSettings'

/**
 * Verwaltung › Schule › Fachfarben (09.10.2026, Entscheidung der Lehrkraft): Die Fachfarben gelten für die ganze
 * Schule – Materialien aller Lehrkräfte, Fachordner der Lernenden, „Meine Klassen". Festgelegt nur hier (Admin),
 * gespeichert auf dem Server (src/server/fachfarben.ts). Derselbe Editor wie früher in den eigenen Einstellungen.
 * 10.10.2026: Statuszeile mit der Zahl der festgelegten Fächer; offen/zu dauerhaft je Gerät (wie alle Kästen unter „Schule").
 */
export function SchulFachfarben(): React.JSX.Element {
  const [farben, setFarben] = useState<Record<string, string> | null>(null)
  const stand = useRef<Record<string, string>>({})
  const neuLaden = useAppSettings((s) => s.load)

  useEffect(() => {
    void holen<{ farben: Record<string, string> }>('/server/fachfarben')
      .then((d) => {
        stand.current = d.farben ?? {}
        setFarben(stand.current)
      })
      .catch((e: unknown) => {
        setFarben({})
        notifyError(e)
      })
  }, [])

  const update = (patch: DeepPartial<AppSettings>): void => {
    const neu = { ...stand.current, ...((patch.fachfarben ?? {}) as Record<string, string>) }
    for (const [k, v] of Object.entries(neu)) if (!v) delete neu[k]
    stand.current = neu
    setFarben(neu)
    void senden<{ farben: Record<string, string> }>('/server/fachfarben', { farben: neu })
      .then((d) => {
        stand.current = d.farben
        setFarben(d.farben)
        // Die eigene Oberfläche färbt sofort mit (die Einstellungen liefern am Server die Farben der Schule)
        void neuLaden()
      })
      .catch((e: unknown) => notifyError(e))
  }

  return (
    <KlappKarte
      id="verwaltung-fachfarben"
      dauerhaft
      titel="Fachfarben"
      status={
        farben === null
          ? 'gelten für alle Lehrkräfte und Lernenden'
          : `${Object.keys(farben).length ? `${Object.keys(farben).length} Fächer festgelegt` : 'Vorschläge des Katalogs'} · gelten für alle`
      }
      rahmen={{ 'data-schul-fachfarben': true }}
    >
      {farben === null ? <Loader size="sm" /> : <FachfarbenSettings settings={{ ...DEFAULT_SETTINGS, fachfarben: farben }} update={update} eingebettet />}
    </KlappKarte>
  )
}
