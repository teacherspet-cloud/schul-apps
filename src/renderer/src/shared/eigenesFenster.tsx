/**
 * Programme im eigenen Fenster (02.10.2026, Wunsch der Lehrkraft: „jede einzelne App in einem
 * Pop-up-Fenster öffnen, um mehrere Fenster gleichzeitig geöffnet zu haben").
 *
 * Abgestimmt: Symbol an jeder Programmkachel und im Kopf der Programme, dazu Rechtsklick auf die
 * Leiste. In der Exe entsteht ein eigenes Fenster mit derselben Brücke (main/index.ts,
 * `fensterRegeln`); im Browser und in der Exe „Schul-Apps Online" ein neues Fenster bzw. ein Tab
 * derselben Adresse. Die iPad-App kennt keine zweiten Fenster – dort gibt es den Knopf nicht.
 *
 * Das Fenster zeigt nur dieses eine Programm (`?einzeln=<id>`), ohne Leiste und Startseite.
 * Hinweis: Wird dasselbe Dokument in zwei Fenstern bearbeitet, gilt die zuletzt gesicherte Fassung.
 */
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'
import { createContext, useContext } from 'react'
import { aufIos, aufServer } from './plattform'

/** Das Programm dieses Fensters, wenn es nur eines zeigt */
export function einzelnesProgramm(): string | null {
  if (typeof window === 'undefined') return null
  const id = new URLSearchParams(window.location.search).get('einzeln')
  return id && /^[a-z0-9-]+$/i.test(id) ? id : null
}

/** Als App vom Home-Bildschirm geöffnet (Safari: navigator.standalone, sonst display-mode) */
const alsWebApp = (): boolean =>
  (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true)

/** Nicht in der iPad-App, nicht als App vom Home-Bildschirm (dort öffnet window.open nur eine Browseransicht ohne Anmeldung) */
export const eigeneFensterMoeglich = (): boolean =>
  typeof window !== 'undefined' && typeof window.open === 'function' && !aufIos() && !einzelnesProgramm() && !alsWebApp()

export function inEigenemFenster(id: string): void {
  const u = new URL(window.location.href)
  u.search = `?einzeln=${encodeURIComponent(id)}`
  u.hash = ''
  // Auf dem Server liegt die Oberfläche unter „/" (nicht unter einem tieferen Pfad)
  if (aufServer()) u.pathname = '/'
  window.open(u.toString(), `schulapps-${id}`, 'popup,width=1280,height=860')
}

/** Das Programm, in dessen Bereich eine Komponente steht (App.tsx setzt es je Programm) */
export const AktuellesProgramm = createContext<string | null>(null)

/** Kleines Symbol „In eigenem Fenster öffnen" – z. B. im Kopf der Bibliotheken */
export function EigenesFensterKnopf({ id, name, size = 'md' }: { id?: string; name?: string; size?: 'sm' | 'md' }): React.JSX.Element | null {
  const ausKontext = useContext(AktuellesProgramm)
  const programm = id ?? ausKontext
  if (!programm || !eigeneFensterMoeglich()) return null
  return (
    <Tooltip label={`${name ?? 'Programm'} in eigenem Fenster öffnen`}>
      <ActionIcon
        variant="subtle"
        color="gray"
        size={size === 'sm' ? 'sm' : 'lg'}
        aria-label="In eigenem Fenster öffnen"
        data-eigenes-fenster={programm}
        onClick={(e) => {
          e.stopPropagation()
          inEigenemFenster(programm)
        }}
      >
        <IconExternalLink size={size === 'sm' ? 14 : 18} />
      </ActionIcon>
    </Tooltip>
  )
}
