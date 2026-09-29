import { Accordion, Badge, Group, Modal, ScrollArea, SegmentedControl, Select, Stack, Text, TextInput, ThemeIcon, UnstyledButton } from '@mantine/core'
import { IconFolder, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { pfadVon } from '@shared/themen'
import { modules } from '../../modules/registry'
import { fachAnzeige, ladeMaterialien, suche, type Material } from '../../shell/materialien'
import { ladeThemen, useThemen } from '../themenbereiche'
import { FachPunkt } from './FachFarbe'

/**
 * Material wählen wie in den Themenbereichen (29.09.2026, Wunsch der Lehrkraft): gegliedert nach
 * Fach und Themenbereich, mit Suche und Filter nach Programm – statt einer langen Auswahlliste.
 */
export default function MaterialWahl({
  offen,
  schliessen,
  programme,
  gewaehlt,
  onWahl
}: {
  offen: boolean
  schliessen: () => void
  /** Programme, deren Material in Frage kommt (Kennungen aus modules/registry.ts) */
  programme: string[]
  /** Schlüssel „programm:id" des gewählten Materials */
  gewaehlt?: string | null
  onWahl: (moduleId: string, id: string) => void
}): React.JSX.Element {
  const [alle, setAlle] = useState<Material[] | null>(null)
  const [text, setText] = useState('')
  const [programm, setProgramm] = useState('alle')
  const [fach, setFach] = useState<string | null>(null)
  const themen = useThemen((s) => s.daten)

  useEffect(() => {
    if (!offen) return
    setText('')
    void ladeThemen().catch(() => undefined)
    void ladeMaterialien()
      .then((m) => setAlle(m.filter((x) => programme.includes(x.moduleId))))
      .catch(() => setAlle([]))
  }, [offen, programme])

  const faecher = useMemo(() => [...new Set((alle ?? []).map((m) => m.fachId))].sort((a, b) => fachAnzeige(a).localeCompare(fachAnzeige(b), 'de')), [alle])
  const sichtbar = useMemo(() => {
    let liste = alle ?? []
    if (programm !== 'alle') liste = liste.filter((m) => m.moduleId === programm)
    if (fach) liste = liste.filter((m) => m.fachId === fach)
    return text.trim() ? suche(liste, text) : liste
  }, [alle, programm, fach, text])

  /** Fach → Themenbereich (Pfad) → Materialien, Bereiche alphabetisch, „Ohne Themenbereich" zuletzt */
  const gruppen = useMemo(() => {
    const nachFach = new Map<string, Map<string, Material[]>>()
    for (const m of sichtbar) {
      const bereichId = themen.zuordnungen[`${m.moduleId}:${m.id}`]?.bereichId
      const pfad = bereichId
        ? pfadVon(themen, bereichId)
            .map((b) => b.name)
            .join(' › ')
        : ''
      const f = nachFach.get(m.fachId) ?? new Map<string, Material[]>()
      f.set(pfad, [...(f.get(pfad) ?? []), m])
      nachFach.set(m.fachId, f)
    }
    return [...nachFach.entries()]
      .sort(([a], [b]) => fachAnzeige(a).localeCompare(fachAnzeige(b), 'de'))
      .map(([fachId, bereiche]) => ({
        fachId,
        anzahl: [...bereiche.values()].reduce((n, l) => n + l.length, 0),
        bereiche: [...bereiche.entries()]
          .sort(([a], [b]) => (a ? (b ? a.localeCompare(b, 'de') : -1) : 1))
          .map(([pfad, liste]) => ({ pfad, liste: [...liste].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)) }))
      }))
  }, [sichtbar, themen])

  const zeile = (m: Material): React.JSX.Element => {
    const modul = modules.find((x) => x.id === m.moduleId)
    const aktiv = gewaehlt === `${m.moduleId}:${m.id}`
    return (
      <UnstyledButton
        key={`${m.moduleId}:${m.id}`}
        className="home-material"
        onClick={() => {
          onWahl(m.moduleId, m.id)
          schliessen()
        }}
        data-material-wahl={`${m.moduleId}:${m.id}`}
        style={aktiv ? { outline: '2px solid var(--mantine-primary-color-filled)' } : undefined}
      >
        <Group gap="sm" wrap="nowrap">
          {modul?.leistenbild ? (
            <img src={modul.leistenbild} width={30} height={30} alt="" title={modul.name} draggable={false} />
          ) : (
            modul && (
              <ThemeIcon size={30} variant="light" color={modul.color} title={modul.name}>
                <modul.icon size={18} />
              </ThemeIcon>
            )
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text fw={600} size="sm" truncate>
              {m.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {[modul?.name, m.detail, new Date(m.updatedAt).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}
            </Text>
          </div>
        </Group>
      </UnstyledButton>
    )
  }

  const programmDaten = [{ value: 'alle', label: 'Alle' }, ...programme.map((p) => ({ value: p, label: modules.find((x) => x.id === p)?.name ?? p }))]

  return (
    <Modal opened={offen} onClose={schliessen} title="Material wählen" size="xl">
      <Stack gap="sm">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Suchen (Name, Thema, Fach)"
            leftSection={<IconSearch size={16} />}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
            data-autofocus
            data-material-suche
          />
          <Select
            placeholder="Alle Fächer"
            data={faecher.map((f) => ({ value: f, label: fachAnzeige(f) }))}
            value={fach}
            onChange={setFach}
            clearable
            w={200}
          />
        </Group>
        <SegmentedControl size="xs" data={programmDaten} value={programm} onChange={setProgramm} />
        <ScrollArea.Autosize mah="60vh" type="auto">
          {alle === null ? (
            <Text size="sm">Materialien werden geladen …</Text>
          ) : !gruppen.length ? (
            <Text size="sm" c="dimmed">
              {alle.length ? 'Nichts gefunden.' : 'Noch kein passendes Material gespeichert.'}
            </Text>
          ) : (
            // Neu aufgebaut, sobald Material geladen ist oder gesucht wird: wenige Fächer bzw. Treffer stehen offen
            <Accordion
              key={`${alle.length}-${text.trim() ? 'suche' : ''}-${programm}-${fach ?? ''}`}
              multiple
              defaultValue={gruppen.length <= 3 || text.trim() ? gruppen.map((g) => g.fachId) : []}
              variant="separated"
            >
              {gruppen.map((g) => (
                <Accordion.Item key={g.fachId} value={g.fachId}>
                  <Accordion.Control>
                    <Group gap="xs">
                      <FachPunkt fach={g.fachId} />
                      <Text fw={600}>{fachAnzeige(g.fachId)}</Text>
                      <Badge size="xs" variant="light" color="gray">
                        {g.anzahl}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {g.bereiche.map((b) => (
                        <div key={b.pfad || '-'}>
                          <Group gap={6} mb={4}>
                            <IconFolder size={14} />
                            <Text size="xs" fw={600} c={b.pfad ? undefined : 'dimmed'}>
                              {b.pfad || 'Ohne Themenbereich'}
                            </Text>
                          </Group>
                          <Stack gap={4}>{b.liste.map(zeile)}</Stack>
                        </div>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  )
}
