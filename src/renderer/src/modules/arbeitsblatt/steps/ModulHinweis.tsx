/**
 * Zuordnung schon beim Erstellen (19.10.2026, Wunsch der Lehrkraft): In der Qualifikationsphase (Jahrgang 12/13, bisher
 * Niedersachsen) zeigt das Blatt unter dem Thema, welchem Rahmenthema und Modul des KC es zugeordnet wird (Server:
 * /server/themen/vorschau, dieselbe Zuordnung ohne KI wie in „Meine Klassen"). Ein Klick auf ein Modul übernimmt dessen
 * Namen als Thema – dann passt die Zuordnung sicher. Ohne Schul-Apps-Server (Exe ohne Netz) bleibt der Hinweis weg.
 */
import { Badge, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from '../../onlinetest/serverApi'

interface Vorschau {
  ueberthema: string | null
  semester?: string
  modul?: string
  module: { rahmenthema: string; semester?: string; name: string; art: string }[]
}

const ART: Record<string, string> = { kern: 'Kernmodul', wahlpflicht: 'Wahlpflichtmodul', wahl: 'Wahlmodul', rahmenthema: '' }

export function ModulHinweis({ fach, jahrgang, thema, setThema }: { fach: string; jahrgang: number; thema: string; setThema: (t: string) => void }): React.JSX.Element | null {
  const [v, setV] = useState<Vorschau | null>(null)
  useEffect(() => {
    if (jahrgang < 12 || !fach) {
      setV(null)
      return
    }
    let aus = false
    // Kurz warten, während getippt wird
    const t = setTimeout(() => {
      void holen<Vorschau>(`/server/themen/vorschau?fach=${encodeURIComponent(fach)}&jahrgang=${jahrgang}&thema=${encodeURIComponent(thema)}`).then(
        (x) => !aus && setV(x),
        () => !aus && setV(null)
      )
    }, 400)
    return () => {
      aus = true
      clearTimeout(t)
    }
  }, [fach, jahrgang, thema])
  if (!v || !v.module.length) return null
  return (
    <Group gap={6} wrap="wrap" data-modul-hinweis>
      <Text size="xs" c="dimmed">
        Zuordnung:
      </Text>
      {v.ueberthema ? (
        <Text size="xs" fw={600} data-modul-zuordnung={v.modul ?? v.ueberthema}>
          {[v.semester, v.ueberthema, v.modul].filter(Boolean).join(' › ')}
        </Text>
      ) : (
        <Text size="xs" c="orange">
          noch keinem Modul – bitte ein Modul wählen
        </Text>
      )}
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <UnstyledButton data-modul-waehlen>
            <Badge size="sm" variant="light" rightSection={<IconChevronDown size={10} />}>
              Modul wählen
            </Badge>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown mah={360} style={{ overflowY: 'auto' }}>
          {[...new Set(v.module.map((m) => m.rahmenthema))].map((rt) => (
            <div key={rt}>
              <Menu.Label>
                {v.module.find((m) => m.rahmenthema === rt)?.semester ? `${v.module.find((m) => m.rahmenthema === rt)?.semester} · ` : ''}
                {rt}
              </Menu.Label>
              {v.module
                .filter((m) => m.rahmenthema === rt)
                .map((m) => (
                  <Menu.Item key={m.name} onClick={() => setThema(m.name)} data-modul={m.name}>
                    {ART[m.art] ? `${ART[m.art]}: ` : ''}
                    {m.name}
                  </Menu.Item>
                ))}
            </div>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
