import { Card, Collapse, Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useState } from 'react'
import { AlleOptionenKopf, useNotausgang, useVerborgeneAbweichungen } from './NurExperte'

/**
 * Einklappbarer Bereich „Weitere Optionen" für selten Geändertes.
 *
 * Wunsch der Lehrkraft (Paket 6, 25.09.2026): Oben im Formular nur das Nötige (Fach, Thema,
 * Lerngruppe, Umfang); Sozialformen, Differenzierung, Bilder, Design und Ähnliches darunter
 * eingeklappt. Der Zustand gilt je Programm und wird gemerkt – wer die Optionen oft braucht,
 * lässt den Bereich einfach offen.
 *
 * Damit nichts versteckt wirkt, nennt die eingeklappte Überschrift, was vom Standard abweicht
 * („3 geändert: Differenzierung ★/★★, …"). Wer ein Blatt öffnet, dessen Optionen jemand
 * verstellt hat, sieht das also auch zugeklappt.
 *
 * Standardmodus (07.10.2026): Der Kasten wird zum Notausgang „Alle Optionen" des Schritts – aufgeklappt
 * zeigt er seinen Inhalt UND die übrigen Expertenfelder des Schritts (NurExperte.tsx), nur für diesen
 * Vorgang und ohne gemerkten Zustand. Die Zusammenfassung nennt auch die Abweichungen verborgener Felder.
 */
export default function WeitereOptionen({
  modul,
  geaendert,
  children
}: {
  /** Kennung für den gemerkten Zustand, z. B. „arbeitsblatt" */
  modul: string
  /** Kurzbeschreibungen der vom Standard abweichenden Optionen */
  geaendert: string[]
  children: React.ReactNode
}): React.JSX.Element {
  const [offen, setOffen] = useState(() => weitereOptionenOffen(modul))
  const notausgang = useNotausgang()
  const verborgen = useVerborgeneAbweichungen()
  const umschalten = (): void => {
    setOffen(!offen)
    merkeWeitereOptionen(modul, !offen)
  }
  if (notausgang)
    return (
      <div>
        <AlleOptionenKopf offen={notausgang.offen} umschalten={() => notausgang.setOffen(!notausgang.offen)} geaendert={[...geaendert, ...verborgen]} />
        <Collapse expanded={notausgang.offen}>
          <Card withBorder padding={0} mt={6} className="weitere-optionen" data-offen>
            <div className="weitere-optionen-inhalt">{children}</div>
          </Card>
        </Collapse>
      </div>
    )
  return (
    <Card withBorder padding={0} className="weitere-optionen" data-offen={offen}>
      <UnstyledButton onClick={umschalten} aria-expanded={offen} px="md" py="sm" w="100%" className="weitere-optionen-kopf">
        <Group gap="xs" wrap="nowrap">
          {offen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <Text fw={600}>Weitere Optionen</Text>
          {geaendert.length > 0 && (
            <Text size="sm" c="dimmed" truncate data-testid="weitere-optionen-zusammenfassung">
              {geaendert.length} geändert: {geaendert.join(', ')}
            </Text>
          )}
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <div className="weitere-optionen-inhalt">{children}</div>
      </Collapse>
    </Card>
  )
}

const schluessel = (modul: string): string => `schul-apps-weitere-optionen-${modul}`

/** Standard: eingeklappt – so steht der Hauptteil des Formulars ohne Scrollen da */
export function weitereOptionenOffen(modul: string): boolean {
  try {
    return localStorage.getItem(schluessel(modul)) === '1'
  } catch {
    return false
  }
}

export function merkeWeitereOptionen(modul: string, offen: boolean): void {
  try {
    localStorage.setItem(schluessel(modul), offen ? '1' : '0')
  } catch {
    // ohne lokalen Speicher gilt die Wahl nur bis zum Neustart
  }
}
