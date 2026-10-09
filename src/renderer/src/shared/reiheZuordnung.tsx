/**
 * Material aus Unterrichtsreihen in Bibliotheken, Startseite und Suche (09.10.2026) – Regeln in shared/reiheMaterial.ts.
 *
 * Die Zuordnung Dokument → Reihe kommt aus der Liste der Reihen (`/server/reihen`, je Reihe die verknüpften Dokumente)
 * und wird bei jedem Öffnen einer Bibliothek bzw. der Startseite frisch geholt – ein Aufruf, ohne Inhalte der Reihen.
 * Ohne Server (Exe, iPad) gibt es keine Reihen: Dann ist nichts ausgeblendet und der Schalter fehlt.
 *
 * „Einblenden" merkt sich das Gerät (localStorage) – für alle Bibliotheken zugleich.
 */
import { Anchor, Badge, Switch, Text, Tooltip } from '@mantine/core'
import { IconRoute } from '@tabler/icons-react'
import { create } from 'zustand'
import { zuordnungAus, type ReiheMitMaterial, type ReiheVerweis, type ReiheZuordnung } from '@shared/reiheMaterial'
import { holen } from '../modules/onlinetest/serverApi'
import { aufServer } from './plattform'
import { openDocument } from './navigation'

const SCHLUESSEL = 'schulapps-reihe-material-einblenden'

function gemerkt(): boolean {
  try {
    return window.localStorage.getItem(SCHLUESSEL) === '1'
  } catch {
    return false
  }
}

interface ReiheZuordnungZustand {
  zuordnung: ReiheZuordnung
  /** Liste der Reihen mit ihrem Material (für das Löschen einer Reihe) */
  reihen: ReiheMitMaterial[]
  einblenden: boolean
  setEinblenden: (an: boolean) => void
  /** Frisch vom Server holen (nur auf dem Server; Fehler lassen die bisherige Zuordnung stehen) */
  laden: () => Promise<void>
}

let laufend: Promise<void> | null = null

export const useReiheZuordnung = create<ReiheZuordnungZustand>((set) => ({
  zuordnung: new Map(),
  reihen: [],
  einblenden: typeof window !== 'undefined' ? gemerkt() : false,
  setEinblenden: (an) => {
    try {
      window.localStorage.setItem(SCHLUESSEL, an ? '1' : '0')
    } catch {
      /* ohne Speicher gilt es nur für diese Sitzung */
    }
    set({ einblenden: an })
  },
  laden: () => {
    if (!aufServer()) return Promise.resolve()
    // Mehrere Bibliotheken bzw. Startseite und Suche zugleich: ein Aufruf genügt
    laufend ??= holen<{ reihen: ReiheMitMaterial[] }>('/server/reihen')
      .then((d) => set({ reihen: d.reihen ?? [], zuordnung: zuordnungAus(d.reihen ?? []) }))
      .catch(() => undefined)
      .finally(() => (laufend = null))
    return laufend
  }
}))

/** Zuordnung nach dem Löschen einer Reihe sofort anpassen (ihr Material ist dann gewöhnliches Material) */
export function reiheVergessen(reiheId: string): void {
  const reihen = useReiheZuordnung.getState().reihen.filter((r) => r.id !== reiheId)
  useReiheZuordnung.setState({ reihen, zuordnung: zuordnungAus(reihen) })
}

/** Marke „Reihe: <Titel>" – ein Klick öffnet die Reihe */
export function ReiheMarke({ verweis, size = 'sm' }: { verweis: ReiheVerweis; size?: 'xs' | 'sm' }): React.JSX.Element {
  return (
    <Tooltip label="Gehört zu dieser Unterrichtsreihe – zur Reihe wechseln" withinPortal>
      <Badge
        size={size}
        variant="light"
        color="indigo"
        leftSection={<IconRoute size={11} />}
        style={{ cursor: 'pointer', textTransform: 'none', maxWidth: 260 }}
        // Als Verweis-Fläche statt <button>: Die Marke steht auch in Knöpfen (Startseite) – Knopf im Knopf ist kein gültiges HTML
        component="span"
        role="link"
        tabIndex={0}
        data-reihe-marke={verweis.titel}
        onClick={(e: React.MouseEvent) => {
          // Nicht zugleich das Dokument öffnen (die Marke steht in der Öffnen-Fläche)
          e.stopPropagation()
          e.preventDefault()
          void openDocument('unterrichtsreihe', verweis.reiheId)
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void openDocument('unterrichtsreihe', verweis.reiheId)
          }
        }}
      >
        Reihe: {verweis.titel}
      </Badge>
    </Tooltip>
  )
}

/** Schalter „Material aus Unterrichtsreihen einblenden (n)" – nur, wenn es solches Material gibt */
export function ReiheSchalter({ anzahl }: { anzahl: number }): React.JSX.Element | null {
  const einblenden = useReiheZuordnung((s) => s.einblenden)
  const setEinblenden = useReiheZuordnung((s) => s.setEinblenden)
  if (!anzahl) return null
  return (
    <Switch
      size="sm"
      checked={einblenden}
      onChange={(e) => setEinblenden(e.currentTarget.checked)}
      label={`Material aus Unterrichtsreihen einblenden (${anzahl})`}
      data-reihe-material-schalter
    />
  )
}

/** Hinweis über einem Suchergebnis, das nur aus Material von Reihen besteht */
export function NurReiheHinweis({ onEinblenden }: { onEinblenden?: () => void }): React.JSX.Element {
  return (
    <Text size="xs" c="dimmed" data-nur-reihe-treffer>
      Nur Treffer aus Unterrichtsreihen – sonst ausgeblendet.
      {onEinblenden && (
        <>
          {' '}
          <Anchor component="button" type="button" size="xs" onClick={onEinblenden}>
            Immer einblenden
          </Anchor>
        </>
      )}
    </Text>
  )
}
