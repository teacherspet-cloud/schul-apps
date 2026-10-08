/**
 * Lernziele bearbeiten (Reihe und Schritt): auswählen aus dem Kerncurriculum, von der KI vorschlagen
 * lassen, von Hand schreiben. Je Ziel die Fassung für die Lehrkraft und „Ich kann …" für die Lernenden.
 *
 * Kompakt (08.10.2026, Plan „Übersicht" B2): Im Standardmodus steht je Ziel eine Zeile „Ich kann …"; die
 * Kompetenzformulierung erscheint erst beim Bearbeiten (Stift) – im Expertenmodus wie bisher beide Felder.
 */
import { ActionIcon, Button, Checkbox, Group, Modal, Paper, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconBook2, IconCheck, IconPencil, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import type { Lernziel } from '@shared/reihe'
import { notifyError } from '../../shared/util'
import { useExperte } from '../../shared/settingsStore'

export interface KcAuszug {
  /** Zeilen des Kerncurriculums zum gewählten Oberthema (Unterthemen, Kompetenzsätze) */
  zeilen: string[]
  quelle: string
}

export function LernzieleFeld(props: {
  ziele: Lernziel[]
  setze: (z: Lernziel[]) => void
  /** Vorschlag der KI (Reihe: aus dem Kerncurriculum; Schritt: aus dem Inhalt) */
  vorschlagen?: () => Promise<Lernziel[]>
  /** Schülerfassungen ergänzen */
  ichKann?: (z: Lernziel[]) => Promise<Lernziel[]>
  kc?: KcAuszug | null
  titel?: string
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [vorschlaege, setVorschlaege] = useState<{ ziele: Lernziel[]; gewaehlt: boolean[] } | null>(null)
  const [kcOffen, setKcOffen] = useState(false)
  const [kcWahl, setKcWahl] = useState<boolean[]>([])
  const experte = useExperte()
  // Im Standardmodus aufgeklappte Ziele (Bearbeiten); neue, leere Ziele stehen immer offen
  const [offen, setOffen] = useState<number[]>([])
  const entfernen = (i: number): void => {
    props.setze(props.ziele.filter((_, k) => k !== i))
    setOffen((o) => o.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)))
  }
  const aendern = (i: number, teil: Partial<Lernziel>): void => props.setze(props.ziele.map((z, k) => (k === i ? { ...z, ...teil } : z)))
  const ki = async (): Promise<void> => {
    if (!props.vorschlagen) return
    setLaeuft('ki')
    try {
      const z = await props.vorschlagen()
      setVorschlaege({ ziele: z, gewaehlt: z.map(() => true) })
    } catch (e) {
      notifyError(e, 'Keine Vorschläge')
    } finally {
      setLaeuft(null)
    }
  }
  const ausKc = async (): Promise<void> => {
    if (!props.kc) return
    const neu = props.kc.zeilen.filter((_, i) => kcWahl[i]).map((t) => ({ text: t, ichKann: '', quelle: props.kc!.quelle }))
    setKcOffen(false)
    if (!neu.length) return
    let alle = [...props.ziele, ...neu]
    props.setze(alle)
    if (props.ichKann) {
      setLaeuft('ich')
      try {
        alle = await props.ichKann(alle)
        props.setze(alle)
      } catch (e) {
        notifyError(e, '„Ich kann …" nicht formuliert – bitte von Hand ergänzen')
      } finally {
        setLaeuft(null)
      }
    }
  }
  return (
    <Stack gap={6} data-lernziele>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {props.titel ?? 'Lernziele'}
        </Text>
        <Group gap={6}>
          {props.kc && props.kc.zeilen.length > 0 && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconBook2 size={14} />}
              onClick={() => {
                setKcWahl(props.kc!.zeilen.map(() => false))
                setKcOffen(true)
              }}
              data-kc-auswahl
            >
              Aus dem Kerncurriculum
            </Button>
          )}
          {props.vorschlagen && (
            <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} loading={laeuft === 'ki'} onClick={() => void ki()} data-lernziele-ki>
              KI schlägt vor
            </Button>
          )}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setOffen((o) => [...o, props.ziele.length])
              props.setze([...props.ziele, { text: '', ichKann: '' }])
            }}
          >
            Eigenes
          </Button>
        </Group>
      </Group>
      {props.ziele.length === 0 && (
        <Text size="xs" c="dimmed">
          Noch keine Lernziele.
        </Text>
      )}
      {props.ziele.map((z, i) =>
        experte || offen.includes(i) || (!z.text.trim() && !z.ichKann.trim()) ? (
          <Paper key={i} withBorder p={6} radius="sm" data-lernziel-offen>
            <Group gap={6} wrap="nowrap" align="start">
              <Stack gap={4} style={{ flex: 1 }}>
                <TextInput size="xs" placeholder="Kompetenz (für die Lehrkraft)" value={z.text} onChange={(e) => aendern(i, { text: e.currentTarget.value })} />
                <TextInput
                  size="xs"
                  placeholder="Ich kann … (sehen die Lernenden)"
                  value={z.ichKann}
                  onChange={(e) => aendern(i, { ichKann: e.currentTarget.value })}
                />
                {z.quelle && (
                  <Text size="xs" c="dimmed">
                    {z.quelle}
                  </Text>
                )}
              </Stack>
              {!experte && offen.includes(i) && (
                <Tooltip label="Fertig">
                  <ActionIcon variant="subtle" color="gray" onClick={() => setOffen((o) => o.filter((k) => k !== i))} aria-label="Lernziel fertig">
                    <IconCheck size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label="Entfernen">
                <ActionIcon variant="subtle" color="gray" onClick={() => entfernen(i)} aria-label="Lernziel entfernen">
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>
        ) : (
          <Group key={i} gap={6} wrap="nowrap" className="lernziel-zeile" data-lernziel-zeile>
            <Text size="sm" style={{ flex: 1, minWidth: 0 }} title={z.text && z.ichKann ? `Kompetenz: ${z.text}` : z.quelle}>
              {z.ichKann.trim() || (
                <>
                  {z.text}{' '}
                  <Text span size="xs" c="dimmed">
                    (noch ohne „Ich kann …")
                  </Text>
                </>
              )}
            </Text>
            <Tooltip label="Bearbeiten (auch die Fassung für die Lehrkraft)">
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setOffen((o) => [...o, i])} aria-label="Lernziel bearbeiten" data-lernziel-bearbeiten>
                <IconPencil size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Entfernen">
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => entfernen(i)} aria-label="Lernziel entfernen">
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )
      )}
      {laeuft === 'ich' && (
        <Text size="xs" c="dimmed">
          „Ich kann …" wird formuliert …
        </Text>
      )}
      {vorschlaege && (
        <Modal opened onClose={() => setVorschlaege(null)} title="Vorschläge der KI" size="lg">
          <Stack>
            {vorschlaege.ziele.map((z, i) => (
              <Checkbox
                key={i}
                checked={vorschlaege.gewaehlt[i]}
                onChange={(e) => {
                  const g = [...vorschlaege.gewaehlt]
                  g[i] = e.currentTarget.checked
                  setVorschlaege({ ...vorschlaege, gewaehlt: g })
                }}
                label={
                  <div>
                    <Text size="sm">{z.text}</Text>
                    <Text size="xs" c="dimmed">
                      {z.ichKann}
                    </Text>
                  </div>
                }
              />
            ))}
            <Group justify="flex-end">
              <Button
                onClick={() => {
                  props.setze([...props.ziele, ...vorschlaege.ziele.filter((_, i) => vorschlaege.gewaehlt[i])])
                  setVorschlaege(null)
                }}
                data-vorschlaege-uebernehmen
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      {kcOffen && props.kc && (
        <Modal opened onClose={() => setKcOffen(false)} title={`Kerncurriculum – ${props.kc.quelle}`} size="lg">
          <Stack gap={6}>
            <Text size="sm" c="dimmed">
              Ankreuzen, was Lernziel werden soll. Die Fassung „Ich kann …" formuliert die KI anschließend; beides lässt sich danach ändern.
            </Text>
            {props.kc.zeilen.map((t, i) => (
              <Checkbox
                key={i}
                label={t}
                checked={kcWahl[i] ?? false}
                onChange={(e) => {
                  const w = [...kcWahl]
                  w[i] = e.currentTarget.checked
                  setKcWahl(w)
                }}
              />
            ))}
            <Group justify="flex-end">
              <Button onClick={() => void ausKc()} disabled={!kcWahl.some(Boolean)}>
                Übernehmen
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  )
}
