/**
 * Auf- und zuklappbare Kästen (aus VokabelTraining.tsx, 08.10.2026): Kopf mit Pfeil und Zustand je Sitzung gemerkt.
 * `rechts` steht außerhalb des Klick-Bereichs – Knöpfe dort klappen den Kasten nicht um.
 */
import { Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useState } from 'react'
import { useOffenGemerkt } from '../../../shared/sitzung'

/**
 * Aufgeklappt-Zustand eines Kastens – gemerkt für die Sitzung (shared/sitzung.ts, 09.10.2026): in einer neuen Sitzung
 * steht er wieder wie vorgegeben.
 */
export function useGemerkt(schluessel: string, vorgabe: boolean): [boolean, (v: boolean) => void] {
  const [wert, setzen] = useOffenGemerkt<boolean>(`schulapps-${schluessel}`, vorgabe)
  return [wert, (v: boolean) => setzen(v)]
}

/** Ein Schalter (kein Auf/Zu, z. B. „ohne Namen") – dauerhaft auf diesem Gerät gemerkt */
export function useGemerkterSchalter(schluessel: string, vorgabe: boolean): [boolean, (v: boolean) => void] {
  const [wert, setWert] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(`schulapps-${schluessel}`)
      return v === null ? vorgabe : v === '1'
    } catch {
      return vorgabe
    }
  })
  const setzen = (v: boolean): void => {
    setWert(v)
    try {
      localStorage.setItem(`schulapps-${schluessel}`, v ? '1' : '0')
    } catch {
      /* ohne Speicher nur für jetzt */
    }
  }
  return [wert, setzen]
}
/** Gewählte Ansicht (Text) – dauerhaft auf diesem Gerät gemerkt, kein Auf/Zu */
export function useGemerktText(schluessel: string, vorgabe: string): [string, (v: string) => void] {
  const [wert, setWert] = useState<string>(() => {
    try {
      return localStorage.getItem(`schulapps-${schluessel}`) ?? vorgabe
    } catch {
      return vorgabe
    }
  })
  const setzen = (v: string): void => {
    setWert(v)
    try {
      localStorage.setItem(`schulapps-${schluessel}`, v)
    } catch {
      /* ohne Speicher nur für jetzt */
    }
  }
  return [wert, setzen]
}

/** Kopf eines auf- und zuklappbaren Kastens */
export function KastenKopf({
  titel,
  offen,
  umschalten,
  rechts,
  ...rest
}: { titel: React.ReactNode; offen: boolean; umschalten: () => void; rechts?: React.ReactNode } & Record<
  `data-${string}`,
  string | boolean
>): React.JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap">
      <UnstyledButton onClick={umschalten} aria-expanded={offen} style={{ flex: 1 }} {...rest}>
        <Group gap="xs" wrap="nowrap">
          <IconChevronDown size={18} style={{ transform: offen ? undefined : 'rotate(-90deg)', transition: 'transform .2s' }} />
          <Text fw={700}>{titel}</Text>
        </Group>
      </UnstyledButton>
      {rechts}
    </Group>
  )
}
