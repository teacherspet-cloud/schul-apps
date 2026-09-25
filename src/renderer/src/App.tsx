import { ActionIcon, AppShell, ScrollArea, Tooltip } from '@mantine/core'
import { IconHome, IconSettings } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useEffect, useState } from 'react'
import { useAppSettings } from './shared/settingsStore'
import { modules } from './modules/registry'
import Home from './shell/Home'
import SettingsPage from './shell/SettingsPage'
import NetzAnmeldung from './shell/NetzAnmeldung'
import Einrichtung from './shell/Einrichtung'
import { abgemeldet, imNetz } from './shared/netzZugang'

export default function App(): React.JSX.Element {
  /*
   * Kommt die Oberfläche aus dem Netz, steht die PIN-Abfrage davor. Ohne Anmeldung weist der
   * Server ohnehin jeden Aufruf ab – dann lieber einmal klar fragen, als die Oberfläche mit
   * lauter Fehlermeldungen aufbauen.
   */
  const [angemeldet, setAngemeldet] = useState(() => !imNetz() || !abgemeldet())
  const [active, setActive] = useState<string>('home')
  const current = modules.find((m) => m.id === active)

  // Hinweis, wenn die Modellliste im Hintergrund die KI-Auswahl aktualisiert hat
  useEffect(
    () =>
      window.api.ai.onModelsUpdated((notes) => {
        void useAppSettings.getState().load()
        notifications.show({ title: 'KI-Modelle aktualisiert', message: notes.join(' '), autoClose: 12000 })
      }),
    []
  )

  /*
   * Nach der Anmeldung die Einstellungen holen – VOR dem ersten Zeichnen der Oberflaeche.
   *
   * Vorher lief der Ladeaufruf schon beim Seitenaufbau, also bevor die PIN eingegeben war,
   * und scheiterte mit „Nicht angemeldet". Das Schullogo fehlte dann auf jedem Blatt
   * (gemeldet am 24.09.2026), ebenso Schulname, Farbschema und die uebrigen Einstellungen.
   */
  if (!angemeldet)
    return (
      <NetzAnmeldung
        onFertig={async () => {
          await useAppSettings.getState().load()
          setAngemeldet(true)
        }}
      />
    )

  return (
    <AppShell navbar={{ width: 76, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar p={10}>
        <AppShell.Section>
          <NavIcon label="Startseite" active={active === 'home'} onClick={() => setActive('home')}>
            <IconHome size={22} />
          </NavIcon>
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} mt="md">
          {modules.map((m) => (
            <NavIcon key={m.id} label={m.name} active={active === m.id} onClick={() => setActive(m.id)}>
              <m.icon size={22} />
            </NavIcon>
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <NavIcon label="Einstellungen" active={active === 'settings'} onClick={() => setActive('settings')}>
            <IconSettings size={22} />
          </NavIcon>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Nach dem ersten Start und nach dem Zurücksetzen: die Einrichtung in drei Schritten */}
      <Einrichtung />

      <AppShell.Main className="app-main">
        {active === 'home' && <Home onOpen={setActive} />}
        {active === 'settings' && <SettingsPage />}
        {modules.map((m) => (
          // Module bleiben gemountet, damit angefangene Arbeit beim Wechseln erhalten bleibt.
          <div key={m.id} hidden={m.id !== current?.id} className="module-container">
            <m.component active={m.id === current?.id} />
          </div>
        ))}
      </AppShell.Main>
    </AppShell>
  )
}

function NavIcon(props: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <Tooltip label={props.label} position="right" withArrow>
      <ActionIcon
        onClick={props.onClick}
        aria-label={props.label}
        className="nav-icon"
        data-active={props.active}
        // Farben kommen aus dem gewählten Thema (bei farbiger Leiste per app.css)
        variant={props.active ? 'filled' : 'light'}
        color={props.active ? undefined : 'gray'}
        size={56}
        radius="md"
        mb={8}
      >
        {props.children}
      </ActionIcon>
    </Tooltip>
  )
}
