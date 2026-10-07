import { Card, Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react'
import { useExperte } from '../settingsStore'

/**
 * Standard- und Expertenmodus (07.10.2026, abgestimmt mit der Lehrkraft):
 *
 * - EINE Oberfläche. Im Standardmodus blendet `<NurExperte>` Feineinstellungen aus, im Expertenmodus
 *   steht alles wie bisher da. Ausblenden ändert nie einen Wert – was im Expertenmodus eingestellt
 *   wurde, gilt weiter.
 * - Notausgang am Ort: Jeder Schritt hat unten „Alle Optionen" (`<AlleOptionen>` bzw. der Kasten
 *   „Weitere Optionen"). Aufgeklappt zeigt er die Expertenfelder nur in diesem Schritt und nur für
 *   diesen Vorgang, ohne den Modus umzuschalten (Lehre aus Home Assistant: ein Schalter weit weg
 *   vom Ort seiner Wirkung wird vergessen).
 * - Weicht ein verborgener Wert vom Standard ab, meldet `<NurExperte geaendert="…">` das; der
 *   Kopf von „Alle Optionen" nennt es („2 angepasst: Fassungen A/B, Design").
 *
 * Ohne `<OptionenBereich>` (Stelle nicht umgestellt) bleibt alles sichtbar – lieber zu viel als
 * eine Option, die man nicht mehr erreicht.
 */
interface Bereich {
  offen: boolean
  setOffen: (offen: boolean) => void
  geaendert: string[]
  melde: (id: string, text: string | null) => void
}

const BereichContext = createContext<Bereich | null>(null)

/** Ein Schritt mit eigenem „Alle Optionen" – umschließt das ganze Formular des Schritts */
export function OptionenBereich({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [meldungen, setMeldungen] = useState<Record<string, string>>({})
  const melde = useCallback((id: string, text: string | null) => {
    setMeldungen((m) => {
      if ((m[id] ?? null) === text) return m
      const neu = { ...m }
      if (text) neu[id] = text
      else delete neu[id]
      return neu
    })
  }, [])
  const wert = useMemo(() => ({ offen, setOffen, geaendert: Object.values(meldungen), melde }), [offen, meldungen, melde])
  return <BereichContext.Provider value={wert}>{children}</BereichContext.Provider>
}

/** Sind die Expertenfelder hier zu sehen? (Expertenmodus, aufgeklappter Notausgang oder Stelle ohne Bereich) */
export function useAlleOptionen(): boolean {
  const experte = useExperte()
  const bereich = useContext(BereichContext)
  return experte || !bereich || bereich.offen
}

/**
 * Feineinstellung: nur im Expertenmodus bzw. bei aufgeklapptem „Alle Optionen".
 * `geaendert`: kurze Beschreibung, wenn der Wert vom Standard abweicht (sonst weglassen/false).
 */
export function NurExperte({ geaendert, children }: { geaendert?: string | false | null; children: React.ReactNode }): React.JSX.Element | null {
  const sichtbar = useAlleOptionen()
  const bereich = useContext(BereichContext)
  const id = useId()
  const text = geaendert || null
  const melde = bereich?.melde
  useEffect(() => {
    if (!melde) return
    melde(id, text)
    return () => melde(id, null)
  }, [melde, id, text])
  return sichtbar ? <>{children}</> : null
}

/** Nur im Standardmodus: Abweichungen der verborgenen Felder (für den Kopf von „Weitere Optionen") */
export function useVerborgeneAbweichungen(): string[] {
  const experte = useExperte()
  const bereich = useContext(BereichContext)
  return experte || !bereich ? [] : bereich.geaendert
}

/** Steuerung des Notausgangs für „Weitere Optionen" (null = Expertenmodus oder kein Bereich) */
export function useNotausgang(): Pick<Bereich, 'offen' | 'setOffen'> | null {
  const experte = useExperte()
  const bereich = useContext(BereichContext)
  return experte || !bereich ? null : bereich
}

/**
 * „Alle Optionen" am Ende eines Schritts ohne „Weitere Optionen"-Kasten. Erscheint nur im
 * Standardmodus und nur, wenn der Schritt überhaupt Expertenfelder hat (`vorhanden`).
 */
export function AlleOptionen({ geaendert = [], vorhanden = true }: { geaendert?: string[]; vorhanden?: boolean }): React.JSX.Element | null {
  const notausgang = useNotausgang()
  const verborgen = useVerborgeneAbweichungen()
  if (!notausgang || !vorhanden) return null
  return <AlleOptionenKopf offen={notausgang.offen} umschalten={() => notausgang.setOffen(!notausgang.offen)} geaendert={[...geaendert, ...verborgen]} />
}

export function AlleOptionenKopf({
  offen,
  umschalten,
  geaendert,
  titel = 'Alle Optionen'
}: {
  offen: boolean
  umschalten: () => void
  geaendert: string[]
  titel?: string
}): React.JSX.Element {
  return (
    <Card withBorder padding={0} className="weitere-optionen alle-optionen" data-offen={offen} data-alle-optionen>
      <UnstyledButton onClick={umschalten} aria-expanded={offen} px="md" py="sm" w="100%" className="weitere-optionen-kopf">
        <Group gap="xs" wrap="nowrap">
          {offen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <Text fw={600}>{titel}</Text>
          <Text size="sm" c="dimmed" truncate data-testid="alle-optionen-zusammenfassung">
            {geaendert.length > 0
              ? `${geaendert.length} angepasst: ${geaendert.join(', ')}`
              : offen
              ? 'für diesen Vorgang eingeblendet'
              : 'Feineinstellungen des Expertenmodus'}
          </Text>
        </Group>
      </UnstyledButton>
    </Card>
  )
}
