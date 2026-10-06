/**
 * Suchfeld im Kopf JEDER App (06.10.2026, Wunsch der Lehrkraft: „Bei einigen Apps ist oben ein Suchfeld eingebaut, bei
 * manchen nicht. Mach das Suchfeld bei allen Apps verfügbar.").
 *
 * Zwei Arten, gleich aussehend:
 *  - `ListenSuche`: filtert, was die App gerade zeigt (Onlinetests, laufende Reihen, Nutzer …) – die App gibt Wert und
 *    Setzer.
 *  - `DokumentSuche` (Standard): durchsucht die gespeicherten Dokumente DIESER App (Materialliste, shell/materialien.ts)
 *    und öffnet den Treffer – auch mitten im Editor.
 */
import { Combobox, Group, Text, TextInput, useCombobox } from '@mantine/core'
import { IconSearch, IconX } from '@tabler/icons-react'
import { useContext, useMemo, useState } from 'react'
import { ladeMaterialien, suche, type Material } from '../../shell/materialien'
import { AktuellesProgramm } from '../eigenesFenster'
import { openDocument } from '../navigation'

const BREITE = 240

export function ListenSuche({
  wert,
  setzen,
  platzhalter = 'Suchen …'
}: {
  wert: string
  setzen: (v: string) => void
  platzhalter?: string
}): React.JSX.Element {
  return (
    <TextInput
      size="sm"
      radius="md"
      w={BREITE}
      leftSection={<IconSearch size={14} />}
      rightSection={wert ? <IconX size={14} style={{ cursor: 'pointer' }} onClick={() => setzen('')} aria-label="Suche leeren" /> : null}
      placeholder={platzhalter}
      value={wert}
      onChange={(e) => setzen(e.currentTarget.value)}
      aria-label="Suchen"
      data-app-suche="liste"
    />
  )
}

const datum = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function DokumentSuche({ platzhalter, alle }: { platzhalter?: string; alle?: boolean }): React.JSX.Element | null {
  const programm = useContext(AktuellesProgramm)
  const [eingabe, setEingabe] = useState('')
  const [liste, setListe] = useState<Material[] | null>(null)
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })
  // `alle` (Verwaltung „Daten und Material"): alle Materialien, geöffnet in ihrer App
  const eigene = useMemo(() => (liste ?? []).filter((m) => alle || m.moduleId === programm), [liste, programm, alle])
  const treffer = useMemo(() => (eingabe.trim() ? suche(eigene, eingabe) : eigene).slice(0, 8), [eigene, eingabe])
  if (!programm && !alle) return null
  const laden = (): void => {
    if (liste) return
    void ladeMaterialien()
      .then(setListe)
      .catch(() => setListe([]))
  }
  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-end"
      width={360}
      onOptionSubmit={(wert) => {
        combobox.closeDropdown()
        setEingabe('')
        const [modul, ...rest] = wert.split('::')
        void openDocument(modul, rest.join('::'))
      }}
    >
      <Combobox.Target>
        <TextInput
          size="sm"
          radius="md"
          w={BREITE}
          leftSection={<IconSearch size={14} />}
          placeholder={platzhalter ?? 'In dieser App suchen …'}
          value={eingabe}
          onChange={(e) => {
            setEingabe(e.currentTarget.value)
            combobox.openDropdown()
          }}
          onFocus={() => {
            laden()
            combobox.openDropdown()
          }}
          onClick={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          aria-label="In dieser App suchen"
          data-app-suche="dokumente"
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={360} style={{ overflowY: 'auto' }}>
          {!liste ? (
            <Combobox.Empty>Wird geladen …</Combobox.Empty>
          ) : treffer.length === 0 ? (
            <Combobox.Empty>{eigene.length ? 'Nichts gefunden.' : 'Noch nichts gespeichert.'}</Combobox.Empty>
          ) : (
            treffer.map((m) => (
              <Combobox.Option value={`${m.moduleId}::${m.id}`} key={`${m.moduleId}::${m.id}`} data-suchtreffer={m.id}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {m.name || 'Ohne Titel'}
                    </Text>
                    {m.detail && (
                      <Text size="xs" c="dimmed" truncate>
                        {m.detail}
                      </Text>
                    )}
                  </div>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {datum(m.updatedAt)}
                  </Text>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
