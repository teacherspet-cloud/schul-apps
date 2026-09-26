import { ActionIcon, AppShell, Button, Indicator, Tooltip } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconHome, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSettings } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useEffect, useRef, useState } from 'react'
import { useAppSettings } from './shared/settingsStore'
import { modules } from './modules/registry'
import Home from './shell/Home'
import SettingsPage from './shell/SettingsPage'
import Themenuebersicht from './shell/Themenuebersicht'
import NetzAnmeldung from './shell/NetzAnmeldung'
import Einrichtung from './shell/Einrichtung'
import AuftragsLayer from './shell/AuftragsLayer'
import { useSichtbareProgramme } from './shell/programme'
import { abgemeldet, imNetz } from './shared/netzZugang'
import { sichereAlles } from './shared/autosave'
import { druckeAktives, openModule, useNavigation } from './shared/navigation'

/** Breite Leiste (Symbol und Name) oder schmale (nur Symbole) – gemerkt je Rechner */
const LEISTE_KEY = 'schul-apps-leiste-breit'
const leseLeiste = (): boolean => {
  try {
    return localStorage.getItem(LEISTE_KEY) === '1'
  } catch {
    return false
  }
}

export default function App(): React.JSX.Element {
  /*
   * Kommt die Oberfläche aus dem Netz, steht die PIN-Abfrage davor. Ohne Anmeldung weist der
   * Server ohnehin jeden Aufruf ab – dann lieber einmal klar fragen, als die Oberfläche mit
   * lauter Fehlermeldungen aufbauen.
   */
  const [angemeldet, setAngemeldet] = useState(() => !imNetz() || !abgemeldet())
  // Wohin die App zeigt, steht im Navigations-Store – so können auch Hinweise und die Startseite dorthin führen
  const active = useNavigation((s) => s.active)
  const laufpunkte = useNavigation((s) => s.laufpunkte)
  const current = modules.find((m) => m.id === active)
  // Nur die Programme zu den eigenen Fächern (Paket 12) – geladen bleiben trotzdem alle
  const sichtbar = useSichtbareProgramme()
  // Der Tastenhorcher (unten) bleibt stehen; die aktuelle Liste liest er hier
  const sichtbarRef = useRef(sichtbar)
  sichtbarRef.current = sichtbar

  /*
   * Ausklappbare Leiste (Wunsch der Lehrkraft, 25.09.2026): Die Symbole allein waren nicht
   * für jedes Programm selbsterklärend. Auf schmalen Bildschirmen (Tablet hochkant, kleines
   * Fenster) bleibt sie schmal – dort braucht das Blatt jeden Zentimeter.
   */
  const [breitGewuenscht, setBreitGewuenscht] = useState(leseLeiste)
  const schmalerBildschirm = useMediaQuery('(max-width: 1100px)') ?? false
  const breit = breitGewuenscht && !schmalerBildschirm
  const umschalten = (): void => {
    const neu = !breitGewuenscht
    setBreitGewuenscht(neu)
    try {
      localStorage.setItem(LEISTE_KEY, neu ? '1' : '0')
    } catch {
      // ohne lokalen Speicher gilt die Wahl nur für diese Sitzung
    }
  }

  /*
   * Vor dem Schließen des Fensters alles sichern und dem Hauptprozess Bescheid geben – das
   * übernimmt die Auftragsleiste (shell/AuftragsLayer.tsx), weil sie vorher fragen muss,
   * wenn noch Aufträge laufen.
   */
  // Im Browser (Zugang aus dem Netz) gibt es kein Schließen-Ereignis – dort zumindest anstoßen
  useEffect(() => {
    const weg = (): void => void sichereAlles()
    window.addEventListener('pagehide', weg)
    return () => window.removeEventListener('pagehide', weg)
  }, [])

  /*
   * Tastenkürzel der Hauptapp: Strg+1 … Strg+6 öffnen die SICHTBAREN Programme in der
   * Reihenfolge der Leiste (ausgeblendete zählen nicht mit – sonst stimmte die Ziffer nicht mit
   * der Stelle in der Leiste überein), Strg+0 die Startseite, Strg+P den Druck des vorderen Programms – aber nur, wenn
   * dort ein Editor mit Druck offen ist. Sonst bleibt Strg+P ohne Wirkung (am Rechner) bzw.
   * beim Browser (Zugang aus dem Netz).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented) return
      const ziffer = /^(Digit|Numpad)(\d)$/.exec(e.code)?.[2]
      if (ziffer !== undefined) {
        const n = Number(ziffer)
        const ziel = n === 0 ? 'home' : sichtbarRef.current[n - 1]?.id
        if (!ziel) return
        e.preventDefault()
        openModule(ziel)
        return
      }
      if (e.code === 'KeyP' && druckeAktives()) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    <AppShell navbar={{ width: breit ? 232 : 76, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar p={10} className="app-leiste" data-breit={breit}>
        <AppShell.Section>
          <NavIcon label="Startseite" breit={breit} active={active === 'home' || active === 'themen'} onClick={() => openModule('home')}>
            <IconHome size={22} />
          </NavIcon>
        </AppShell.Section>
        {/*
          Die Programmliste rollt nur senkrecht und ohne eigenen Balken-Rahmen. Vorher lag sie in
          einer ScrollArea, deren waagerechter Balken unten als grauer Streifen über dem
          Einstellungs-Symbol stehen blieb.
        */}
        <AppShell.Section grow className="leiste-liste" mt="md">
          {sichtbar.map((m) => (
            <NavIcon
              key={m.id}
              label={m.name}
              breit={breit}
              active={active === m.id}
              badge={laufpunkte[m.id]}
              bild={m.leistenbild}
              onClick={() => openModule(m.id)}
            >
              <m.icon size={22} />
            </NavIcon>
          ))}
        </AppShell.Section>
        <AppShell.Section>
          {!schmalerBildschirm && (
            <Tooltip label={breit ? 'Leiste einklappen' : 'Leiste mit Namen ausklappen'} position="right" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                className="leiste-umschalter"
                onClick={umschalten}
                aria-label={breit ? 'Leiste einklappen' : 'Leiste ausklappen'}
                aria-expanded={breit}
                size={36}
                mb={6}
              >
                {breit ? <IconLayoutSidebarLeftCollapse size={20} /> : <IconLayoutSidebarLeftExpand size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
          <NavIcon label="Einstellungen" breit={breit} active={active === 'settings'} onClick={() => openModule('settings')}>
            <IconSettings size={22} />
          </NavIcon>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Nach dem ersten Start und nach dem Zurücksetzen: die Einrichtung in drei Schritten */}
      <Einrichtung />

      <AppShell.Main className="app-main">
        {/* Die Startseite wird bei jedem Zurückkommen neu aufgebaut – damit ist „Zuletzt bearbeitet" aktuell */}
        {active === 'home' && <Home />}
        {active === 'settings' && <SettingsPage />}
        {/* Themenbereiche über alle Programme (Paket 10b) – erreichbar von der Startseite */}
        {active === 'themen' && <Themenuebersicht />}
        {modules.map((m) => (
          // Module bleiben gemountet, damit angefangene Arbeit beim Wechseln erhalten bleibt.
          <div key={m.id} hidden={m.id !== current?.id} className="module-container">
            <m.component active={m.id === current?.id} />
          </div>
        ))}
      </AppShell.Main>

      {/* Laufende und fertige Hintergrund-Aufträge – unten rechts über allen Programmen */}
      <AuftragsLayer />
    </AppShell>
  )
}

/**
 * Ein Eintrag der Leiste: schmal nur das Symbol mit Tooltip, breit Symbol und Name.
 * `badge` setzt einen Punkt ans Symbol (z. B. solange im Programm ein Auftrag läuft).
 *
 * `bild` (Paket 10a, Entscheidung der Lehrkraft): Die Programme zeigen hier ihre
 * Illustration von der Startseite, verkleinert – dieselben Bilder überall, statt zweier
 * Bildsprachen. Das Bild bringt seine eigene farbige Kachel mit; deshalb wird es nicht
 * eingefärbt. Der aktive Knopf hebt sich durch die Fläche UM das Bild ab (Themenfarbe, in
 * der farbigen Leiste weiß), die ruhenden Knöpfe bleiben ohne Fläche. Ohne Bild gilt das
 * Vektorsymbol wie bisher.
 */
function NavIcon(props: {
  label: string
  active: boolean
  breit: boolean
  badge?: boolean
  bild?: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  // Farben kommen aus dem gewählten Thema (bei farbiger Leiste per app.css)
  const variant = props.active ? 'filled' : props.bild ? 'subtle' : 'light'
  const color = props.active ? undefined : 'gray'
  const symbol = (
    <Indicator disabled={!props.badge} size={10} offset={props.bild ? 2 : 4} processing color="orange" position="top-end">
      {props.bild ? (
        <img src={props.bild} className="nav-bild" width={props.breit ? 30 : 40} height={props.breit ? 30 : 40} alt="" draggable={false} />
      ) : (
        props.children
      )}
    </Indicator>
  )
  if (props.breit)
    return (
      <Button
        onClick={props.onClick}
        aria-label={props.label}
        className="nav-icon nav-breit"
        data-active={props.active}
        data-bild={Boolean(props.bild)}
        variant={variant}
        color={color}
        leftSection={symbol}
        justify="flex-start"
        fullWidth
        h={48}
        radius="md"
        mb={8}
      >
        {props.label}
      </Button>
    )
  return (
    <Tooltip label={props.label} position="right" withArrow>
      <ActionIcon
        onClick={props.onClick}
        aria-label={props.label}
        className="nav-icon"
        data-active={props.active}
        data-bild={Boolean(props.bild)}
        variant={variant}
        color={color}
        size={56}
        radius="md"
        mb={8}
      >
        {symbol}
      </ActionIcon>
    </Tooltip>
  )
}
