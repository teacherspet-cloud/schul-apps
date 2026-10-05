/**
 * „Blatt freigeben" direkt in der App „Freigegebene Blätter" (03.10.2026, Wunsch der Lehrkraft:
 * „Ansonsten kann man es nur umständlich über die Arbeitsblatt-App").
 *
 * Erst ein gespeichertes Arbeitsblatt wählen (Suche, Vorschaubild), dann derselbe Freigabe-Dialog wie im
 * Editor (BlattFreigabeKnopf.tsx) – Lerngruppe oder einzelne Lernende, Gäste, Feedback. Ein Weg, eine
 * Rechnung: Schülerfassung, Lösungen und Rückmeldung entstehen genauso wie aus dem Editor.
 */
import { useProgrammFarbe } from '../../shared/components/AppKopf'
import { Button, Center, Group, Image, Loader, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconFileText, IconPlus, IconSearch } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { SavedWorksheetMeta } from '@shared/types'
import { BlattFreigabeDialog } from '../arbeitsblatt/BlattFreigabeKnopf'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { useAppSettings } from '../../shared/settingsStore'
import { notifyError } from '../../shared/util'

const datum = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function BlattWaehlenKnopf({ freigegeben }: { freigegeben: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const farbe = useProgrammFarbe()
  const [blatt, setBlatt] = useState<Worksheet | null>(null)
  const { logoDataUrl, settings } = useAppSettings()
  return (
    <>
      <Button leftSection={<IconPlus size={16} />} radius="md" color={farbe} onClick={() => setOffen(true)} data-blatt-waehlen-knopf>
        Blatt freigeben
      </Button>
      {offen && (
        <Auswahl
          schliessen={() => setOffen(false)}
          gewaehlt={(ws) => {
            setOffen(false)
            setBlatt(ws)
          }}
        />
      )}
      {blatt && (
        <BlattFreigabeDialog
          ws={blatt}
          layouts={new Map()}
          logo={logoDataUrl ?? null}
          schoolName={settings.schoolName ?? ''}
          schliessen={() => setBlatt(null)}
          ohneListe
          freigegeben={freigegeben}
        />
      )}
    </>
  )
}

function Auswahl({ schliessen, gewaehlt }: { schliessen: () => void; gewaehlt: (ws: Worksheet) => void }): React.JSX.Element {
  const [liste, setListe] = useState<SavedWorksheetMeta[] | null>(null)
  const [suche, setSuche] = useState('')
  const [laedt, setLaedt] = useState<string | null>(null)
  useEffect(() => {
    window.api.sheets.list().then(
      (l) => setListe([...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
      (e: unknown) => {
        notifyError(e, 'Arbeitsblätter nicht geladen')
        setListe([])
      }
    )
  }, [])
  const waehlen = async (id: string): Promise<void> => {
    setLaedt(id)
    try {
      const w = await window.api.sheets.get(id)
      const ws = w.payload as Worksheet
      if (!ws?.sheets?.length) throw new Error('Das Arbeitsblatt ist leer.')
      // Der gespeicherte Name ist der Titel, unter dem die Lehrkraft das Blatt kennt
      gewaehlt(ws.meta.title || ws.meta.topic ? ws : { ...ws, meta: { ...ws.meta, title: w.name } })
    } catch (e) {
      notifyError(e, 'Arbeitsblatt nicht geöffnet')
    } finally {
      setLaedt(null)
    }
  }
  const q = suche.trim().toLowerCase()
  const sichtbar = (liste ?? []).filter((m) => !q || `${m.name} ${m.subjectLabel} ${m.topic} ${m.ueberthema ?? ''} ${m.grade}`.toLowerCase().includes(q))
  return (
    <Modal opened onClose={schliessen} title="Arbeitsblatt zum Freigeben wählen" size="lg">
      <Stack>
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Titel, Fach, Thema, Klasse …"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          data-autofocus
          data-blatt-suche
        />
        {!liste ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : sichtbar.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="xl">
            {liste.length ? 'Kein Arbeitsblatt passt zur Suche.' : 'Noch keine gespeicherten Arbeitsblätter – sie entstehen in der App „Arbeitsblatt".'}
          </Text>
        ) : (
          <ScrollArea.Autosize mah="60vh" type="auto">
            <Stack gap={6}>
              {sichtbar.map((m) => (
                <UnstyledButton
                  key={m.id}
                  onClick={() => void waehlen(m.id)}
                  disabled={!!laedt}
                  data-blatt-wahl={m.name}
                  style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, padding: 8 }}
                >
                  <Group wrap="nowrap" gap="sm">
                    {m.thumb ? (
                      <Image
                        src={m.thumb}
                        w={42}
                        h={58}
                        fit="cover"
                        radius={4}
                        style={{ flex: 'none', border: '1px solid var(--mantine-color-default-border)' }}
                      />
                    ) : (
                      <Center w={42} h={58} style={{ flex: 'none' }}>
                        <IconFileText size={26} stroke={1.4} />
                      </Center>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={600} size="sm" truncate>
                        {m.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[m.subjectLabel, m.grade ? `Klasse ${m.grade}` : '', m.topic && m.topic !== m.name ? m.topic : '', datum(m.updatedAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </div>
                    {laedt === m.id && <Loader size="sm" />}
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  )
}
