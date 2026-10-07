import { ActionIcon, Button, Drawer, Indicator, Stack, Text } from '@mantine/core'
import ModusSchalter from '../../shell/ModusSchalter'
import { IconApps, IconHome, IconLayoutSidebarLeftExpand, IconSettings } from '@tabler/icons-react'
import { useEffect } from 'react'
import type { SchulModule } from '../../modules/registry'

/**
 * Navigation mit dem Finger (30.09.2026, recherche/mobile-bedienung-2026-09-30.md).
 *
 *  - iPhone (Telefonbreite): Leiste UNTEN mit Startseite, dem offenen Programm, „Programme"
 *    und Einstellungen – im Daumenbereich, wie die Tab-Leisten von iOS. Die Seitenleiste mit
 *    zehn Symbolen nähme sonst ein Fünftel der Breite.
 *  - iPad: Die Seitenleiste bleibt; sie lässt sich ausblenden (mehr Platz für das Blatt). Dann
 *    öffnet ein runder Knopf unten links oder ein Wischen vom linken Rand die Programmliste.
 *
 * Die Programmliste ist eine Schublade mit Bild UND Namen – die Symbole allein sind nicht für
 * jedes Programm selbsterklärend (Wunsch der Lehrkraft, 25.09.2026).
 */

type Programm = Pick<SchulModule, 'id' | 'name' | 'icon' | 'leistenbild'>

export interface NavigationsDaten {
  programme: Programm[]
  active: string
  laufpunkte: Record<string, boolean | undefined>
  oeffnen: (id: string) => void
}

function Bild({ p, groesse }: { p: Programm; groesse: number }): React.JSX.Element {
  return p.leistenbild ? <img src={p.leistenbild} alt="" width={groesse} height={groesse} draggable={false} /> : <p.icon size={groesse - 6} />
}

/** Die Programmliste als Schublade (unten auf dem iPhone, links auf dem iPad) */
export function ProgrammSchublade({
  offen,
  onClose,
  position,
  daten,
  onLeisteEinblenden
}: {
  offen: boolean
  onClose: () => void
  position: 'left' | 'bottom'
  daten: NavigationsDaten
  /** Nur auf dem iPad mit ausgeblendeter Leiste */
  onLeisteEinblenden?: () => void
}): React.JSX.Element {
  const waehle = (id: string): void => {
    daten.oeffnen(id)
    onClose()
  }
  const eintrag = (id: string, name: string, symbol: React.ReactNode): React.JSX.Element => (
    <button key={id} type="button" className="mobil-programm" data-aktiv={daten.active === id} onClick={() => waehle(id)} aria-label={name}>
      <Indicator disabled={!daten.laufpunkte[id]} size={10} processing color="orange" position="top-end">
        {symbol}
      </Indicator>
      <span>{name}</span>
    </button>
  )
  return (
    <Drawer
      opened={offen}
      onClose={onClose}
      position={position}
      size={position === 'bottom' ? 'auto' : 320}
      title="Programme"
      zIndex={300}
      data-programm-schublade
      styles={position === 'bottom' ? { content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } } : undefined}
    >
      <Stack gap="md">
        <div className="mobil-programme">
          {eintrag('home', 'Startseite', <IconHome size={30} />)}
          {daten.programme.map((p) => eintrag(p.id, p.name, <Bild p={p} groesse={36} />))}
          {eintrag('settings', 'Einstellungen', <IconSettings size={30} />)}
        </div>
        {/* Standard-/Expertenmodus (07.10.2026) – wie links in der Leiste am PC */}
        <ModusSchalter breit />
        {onLeisteEinblenden && (
          <Button
            variant="light"
            leftSection={<IconLayoutSidebarLeftExpand size={18} />}
            onClick={() => {
              onLeisteEinblenden()
              onClose()
            }}
          >
            Seitenleiste wieder einblenden
          </Button>
        )}
        <Text size="xs" c="dimmed">
          Auch mit einem Wischen vom linken Rand erreichbar.
        </Text>
      </Stack>
    </Drawer>
  )
}

/** Tab-Leiste unten (iPhone): Startseite, offenes Programm, Programme, Einstellungen */
export function MobilTabs({ daten, onProgramme }: { daten: NavigationsDaten; onProgramme: () => void }): React.JSX.Element {
  const offen = daten.programme.find((p) => p.id === daten.active)
  const laeuftWo = daten.programme.some((p) => daten.laufpunkte[p.id])
  return (
    <nav className="mobil-tabs" aria-label="Navigation" data-mobil-tabs>
      <button
        type="button"
        className="mobil-tab"
        data-aktiv={daten.active === 'home' || daten.active === 'themen'}
        onClick={() => daten.oeffnen('home')}
        aria-label="Startseite"
      >
        <IconHome size={24} />
        Start
      </button>
      {offen && (
        <button type="button" className="mobil-tab" data-aktiv onClick={() => daten.oeffnen(offen.id)} aria-label={offen.name}>
          <Bild p={offen} groesse={28} />
          <span style={{ maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offen.name}</span>
        </button>
      )}
      <button type="button" className="mobil-tab" onClick={onProgramme} aria-label="Programme" data-programme-knopf>
        <Indicator disabled={!laeuftWo} size={9} processing color="orange" position="top-end">
          <IconApps size={24} />
        </Indicator>
        Programme
      </button>
      <button type="button" className="mobil-tab" data-aktiv={daten.active === 'settings'} onClick={() => daten.oeffnen('settings')} aria-label="Einstellungen">
        <IconSettings size={24} />
        Einstellungen
      </button>
    </nav>
  )
}

/** Runder Knopf unten links, solange die Seitenleiste auf dem iPad ausgeblendet ist */
export function LeistenGriff({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <ActionIcon className="leiste-griff" size={52} radius="xl" variant="filled" aria-label="Programme" onClick={onClick} data-leiste-griff>
      <IconApps size={24} />
    </ActionIcon>
  )
}

/** Wischen vom linken Rand (gesten.ts) öffnet die Schublade */
export function useRandWischen(aktiv: boolean, oeffnen: () => void): void {
  useEffect(() => {
    if (!aktiv) return
    window.addEventListener('schulapps:randwischen', oeffnen)
    return () => window.removeEventListener('schulapps:randwischen', oeffnen)
  }, [aktiv, oeffnen])
}
