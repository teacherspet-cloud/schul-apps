/**
 * „Meine Klassen" › Unterrichtsreihen & Blätter (26.11.2026, Wunsch der Lehrkraft): nicht nur NEU erstellen, sondern
 * vorhandene Reihen und Arbeitsblätter aus der eigenen Bibliothek auswählen und der Klasse hinzufügen.
 *
 * Eine Klasse hat keine eigene Liste – angezeigt wird, was ihr freigegeben (Blatt) bzw. zugewiesen (Reihe) ist
 * (server/arbeitsblaetter.ts › blaetterDerGruppe, server/reihen.ts › reihenDerGruppe). „Hinzufügen" heißt deshalb:
 * auswählen und dann den bekannten Freigabe- bzw. Zuweisen-Dialog mit dieser Klasse vorgewählt öffnen.
 */
import { Button, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconFilePlus, IconRoute, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Auswahl } from '../freigaben/BlattWaehlen'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { holen } from '../onlinetest/serverApi'
import { Zuweisen } from '../unterrichtsreihe/ReiheEditor'
import type { Reihe } from '@shared/reihe'
import { notifyError } from '../../shared/util'

type ReiheKurz = { id: string; titel: string; fachId?: string; oberthema?: string }

export function VorhandenesBlattKnopf({ gewaehlt }: { gewaehlt: (ws: Worksheet, docId: string) => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <Button size="xs" variant="light" leftSection={<IconFilePlus size={14} />} onClick={() => setOffen(true)} data-vorhandenes-blatt>
        Vorhandenes Blatt hinzufügen
      </Button>
      {offen && (
        <Auswahl
          schliessen={() => setOffen(false)}
          gewaehlt={(ws, id) => {
            setOffen(false)
            gewaehlt(ws, id)
          }}
        />
      )}
    </>
  )
}

export function VorhandeneReiheKnopf({ gruppeId, fachId, fertig }: { gruppeId: string; fachId?: string; fertig: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [liste, setListe] = useState<ReiheKurz[] | null>(null)
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<{ id: string; reihe: Reihe } | null>(null)
  const [laedt, setLaedt] = useState<string | null>(null)
  useEffect(() => {
    if (!offen) return
    void holen<{ reihen: ReiheKurz[] }>('/server/reihen').then(
      (d) => setListe(d.reihen),
      (e: unknown) => {
        notifyError(e, 'Unterrichtsreihen nicht geladen')
        setListe([])
      }
    )
  }, [offen])
  // Reihen des Fachs der Klasse zuerst, dann die übrigen
  const sichtbar = useMemo(() => {
    const s = suche.trim().toLowerCase()
    return (liste ?? [])
      .filter((r) => !s || `${r.titel} ${r.oberthema ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => Number(b.fachId === fachId) - Number(a.fachId === fachId) || a.titel.localeCompare(b.titel, 'de'))
  }, [liste, suche, fachId])
  const waehlen = async (id: string): Promise<void> => {
    setLaedt(id)
    try {
      const d = await holen<{ reihe: Reihe }>(`/server/reihen/${id}`)
      setOffen(false)
      setGewaehlt({ id, reihe: d.reihe })
    } catch (e) {
      notifyError(e, 'Unterrichtsreihe nicht geöffnet')
    } finally {
      setLaedt(null)
    }
  }
  return (
    <>
      <Button size="xs" variant="light" leftSection={<IconRoute size={14} />} onClick={() => setOffen(true)} data-vorhandene-reihe>
        Vorhandene Reihe hinzufügen
      </Button>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Vorhandene Unterrichtsreihe hinzufügen" size="lg">
        <Stack gap="sm">
          <TextInput leftSection={<IconSearch size={14} />} placeholder="Reihe suchen …" value={suche} onChange={(e) => setSuche(e.currentTarget.value)} data-reihe-suche />
          {liste === null ? (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          ) : !sichtbar.length ? (
            <Text c="dimmed" size="sm">
              Keine Unterrichtsreihe gefunden.
            </Text>
          ) : (
            <ScrollArea.Autosize mah="60vh">
              <Stack gap={4}>
                {sichtbar.map((r) => (
                  <UnstyledButton
                    key={r.id}
                    onClick={() => void waehlen(r.id)}
                    p="xs"
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}
                    data-reihe-wahl={r.titel}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Text size="sm" fw={600}>
                          {r.titel}
                        </Text>
                        {r.oberthema && (
                          <Text size="xs" c="dimmed">
                            {r.oberthema}
                          </Text>
                        )}
                      </div>
                      {laedt === r.id && <Loader size="xs" />}
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Modal>
      {gewaehlt && (
        <Zuweisen
          reiheId={gewaehlt.id}
          reihe={gewaehlt.reihe}
          gruppeVorwahl={gruppeId}
          schliessen={() => {
            setGewaehlt(null)
            fertig()
          }}
        />
      )}
    </>
  )
}
