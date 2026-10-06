/**
 * Optionsmenü für Werkzeuge und Objekte auf dem freigegebenen Blatt (06.10.2026, abgestimmt mit der Lehrkraft):
 * Rechtsklick (am Tablet langes Drücken) auf ein Textkästchen, eine Linie, eine Form, einen Punkt – oder auf das
 * Werkzeug in der Leiste (Vorgaben für Neues, beim Stift auch für die nächsten Striche).
 *
 *  - Farben: Kästchen Rand, Füllung, Text; Formen Rand und Füllung; sonst eine Farbe
 *  - Linienart (durchgezogen/gestrichelt/gepunktet) und Strichstärke für Linien, Formen, Kastenrand, Stift
 *  - Pfeilspitzen und Jahreszahl für Verbindungslinien; Schriftgröße und fett für Kästchen
 *  - Duplizieren, nach vorne/hinten, Löschen (beschriftetes Kästchen nur nach Rückfrage)
 */
import type { BlattObjekt, LinienArt } from '@shared/blattObjekte'
import { ActionIcon, Button, Divider, Group, Modal, Paper, Portal, SegmentedControl, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconArrowNarrowRight,
  IconArrowsHorizontal,
  IconBold,
  IconCopy,
  IconLayersSubtract,
  IconLine,
  IconStackBack,
  IconStackFront,
  IconTrash
} from '@tabler/icons-react'
import { useEffect, useRef } from 'react'

export type OptionenArt = 'text' | 'linie' | 'form' | 'punkt' | 'stift' | 'marker'

/** Was das Menü ändern kann */
export type Stil = Pick<BlattObjekt, 'farbe' | 'rand' | 'fuellung' | 'textFarbe' | 'linienArt' | 'staerke' | 'pfeil' | 'groesse' | 'fett' | 'ohneJahr'>

export const FARBEN = ['#1d4ed8', '#111827', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04']
export const FUELLUNGEN = ['#ffffff', '#fef9c3', '#dcfce7', '#dbeafe', '#fce7f3', '#ede9fe', '#ffedd5', '#f1f5f9']
export const MARKER_FARBEN_ALLE = ['#facc15', '#4ade80', '#f472b6', '#60a5fa', '#fb923c', '#c084fc']

function Farbzeile({
  titel,
  farben,
  wert,
  setze,
  ohne
}: {
  titel: string
  farben: string[]
  wert: string | undefined
  setze: (f: string | undefined) => void
  /** Knopf „keine" (Füllung einer Form) */
  ohne?: boolean
}): React.JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        {titel}
      </Text>
      <Group gap={5}>
        {ohne && (
          <Tooltip label="Keine Füllung">
            <UnstyledButton
              onClick={() => setze(undefined)}
              aria-label="Keine Füllung"
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                border: `2px solid ${wert ? '#cbd5e1' : '#1d4ed8'}`,
                background: 'linear-gradient(135deg, #fff 45%, #dc2626 45%, #dc2626 55%, #fff 55%)'
              }}
            />
          </Tooltip>
        )}
        {farben.map((f) => (
          <UnstyledButton
            key={f}
            onClick={() => setze(f)}
            aria-label={`${titel} ${f}`}
            data-farbe={f}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: f,
              border: '1px solid #cbd5e1',
              boxShadow: wert?.toLowerCase() === f ? '0 0 0 2px var(--mantine-color-body), 0 0 0 4px #1d4ed8' : undefined
            }}
          />
        ))}
      </Group>
    </div>
  )
}

/** Symbol der Linienart */
const ArtSymbol = ({ art }: { art: LinienArt }): React.JSX.Element => (
  <svg width="30" height="10" aria-hidden>
    <line
      x1="2"
      y1="5"
      x2="28"
      y2="5"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeDasharray={art === 'strich' ? '6 4' : art === 'punkt' ? '0.1 5' : undefined}
    />
  </svg>
)

export function OptionenInhalt({
  art,
  wert,
  aendern,
  aktionen,
  mitJahr
}: {
  art: OptionenArt
  wert: Stil
  aendern: (patch: Partial<Stil>) => void
  aktionen?: { duplizieren?: () => void; vorne?: () => void; hinten?: () => void; loeschen?: () => void }
  /** Linie liegt auf einer Zeitleiste (Jahreszahl schaltbar) */
  mitJahr?: boolean
}): React.JSX.Element {
  const linien = art === 'linie' || art === 'form' || art === 'text' || art === 'stift'
  return (
    <Stack gap={10} data-optionen={art}>
      {art === 'text' ? (
        <>
          <Farbzeile titel="Randfarbe" farben={FARBEN} wert={wert.rand ?? wert.farbe} setze={(f) => aendern({ rand: f })} />
          <Farbzeile titel="Füllfarbe" farben={FUELLUNGEN} wert={wert.fuellung ?? '#ffffff'} setze={(f) => aendern({ fuellung: f })} />
          <Farbzeile titel="Textfarbe" farben={FARBEN} wert={wert.textFarbe ?? wert.farbe} setze={(f) => aendern({ textFarbe: f })} />
        </>
      ) : art === 'form' ? (
        <>
          <Farbzeile titel="Randfarbe" farben={FARBEN} wert={wert.rand ?? wert.farbe} setze={(f) => aendern({ rand: f })} />
          <Farbzeile titel="Füllfarbe" farben={FUELLUNGEN} wert={wert.fuellung} setze={(f) => aendern({ fuellung: f })} ohne />
        </>
      ) : (
        <Farbzeile titel="Farbe" farben={art === 'marker' ? MARKER_FARBEN_ALLE : FARBEN} wert={wert.farbe} setze={(f) => f && aendern({ farbe: f })} />
      )}
      {linien && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            {art === 'text' ? 'Rand' : 'Linie'}
          </Text>
          <SegmentedControl
            size="xs"
            fullWidth
            value={wert.linienArt ?? 'voll'}
            onChange={(v) => aendern({ linienArt: v === 'voll' ? undefined : (v as LinienArt) })}
            data={[
              {
                value: 'voll',
                label: (
                  <Tooltip label="durchgezogen">
                    <span>
                      <ArtSymbol art="voll" />
                    </span>
                  </Tooltip>
                )
              },
              {
                value: 'strich',
                label: (
                  <Tooltip label="gestrichelt">
                    <span>
                      <ArtSymbol art="strich" />
                    </span>
                  </Tooltip>
                )
              },
              {
                value: 'punkt',
                label: (
                  <Tooltip label="gepunktet">
                    <span>
                      <ArtSymbol art="punkt" />
                    </span>
                  </Tooltip>
                )
              }
            ]}
            data-linienart
          />
        </div>
      )}
      {(linien || art === 'marker') && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Strichstärke
          </Text>
          <SegmentedControl
            size="xs"
            fullWidth
            value={String(wert.staerke ?? 2)}
            onChange={(v) => aendern({ staerke: v === '2' ? undefined : (Number(v) as 1 | 3) })}
            data={[
              { value: '1', label: 'dünn' },
              { value: '2', label: 'mittel' },
              { value: '3', label: 'dick' }
            ]}
            data-staerke
          />
        </div>
      )}
      {art === 'linie' && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Pfeilspitzen
          </Text>
          <SegmentedControl
            size="xs"
            fullWidth
            value={wert.pfeil ?? 'keine'}
            onChange={(v) => aendern({ pfeil: v === 'keine' ? undefined : (v as 'ende' | 'beide') })}
            data={[
              { value: 'keine', label: <IconLine size={16} /> },
              { value: 'ende', label: <IconArrowNarrowRight size={16} /> },
              { value: 'beide', label: <IconArrowsHorizontal size={16} /> }
            ]}
            data-pfeil
          />
        </div>
      )}
      {art === 'linie' && mitJahr && (
        <Button size="xs" variant="light" onClick={() => aendern({ ohneJahr: wert.ohneJahr ? undefined : true })} data-jahr-umschalten>
          {wert.ohneJahr ? 'Jahreszahl zeigen' : 'Jahreszahl ausblenden'}
        </Button>
      )}
      {art === 'text' && (
        <Group gap={6} wrap="nowrap">
          <SegmentedControl
            size="xs"
            style={{ flex: 1 }}
            value={wert.groesse ?? 'normal'}
            onChange={(v) => aendern({ groesse: v === 'normal' ? undefined : (v as 'klein' | 'gross') })}
            data={[
              { value: 'klein', label: 'A-' },
              { value: 'normal', label: 'A' },
              { value: 'gross', label: 'A+' }
            ]}
            data-groesse
          />
          <Tooltip label="fett">
            <ActionIcon variant={wert.fett ? 'filled' : 'default'} onClick={() => aendern({ fett: wert.fett ? undefined : true })} aria-label="fett" data-fett>
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
      {aktionen && (
        <>
          <Divider />
          <Group gap={4} justify="space-between" wrap="nowrap">
            <Group gap={4} wrap="nowrap">
              {aktionen.duplizieren && (
                <Tooltip label="Duplizieren">
                  <ActionIcon variant="subtle" onClick={aktionen.duplizieren} aria-label="Duplizieren" data-duplizieren>
                    <IconCopy size={17} />
                  </ActionIcon>
                </Tooltip>
              )}
              {aktionen.vorne && (
                <Tooltip label="Nach vorne">
                  <ActionIcon variant="subtle" onClick={aktionen.vorne} aria-label="Nach vorne" data-nach-vorne>
                    <IconStackFront size={17} />
                  </ActionIcon>
                </Tooltip>
              )}
              {aktionen.hinten && (
                <Tooltip label="Nach hinten">
                  <ActionIcon variant="subtle" onClick={aktionen.hinten} aria-label="Nach hinten" data-nach-hinten>
                    <IconStackBack size={17} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            {aktionen.loeschen && (
              <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={aktionen.loeschen} data-objekt-loeschen>
                Löschen
              </Button>
            )}
          </Group>
        </>
      )}
    </Stack>
  )
}

/** Schwebendes Menü an der Stelle des Klicks; schließt bei Klick daneben, Escape oder Scrollen */
export function KontextMenue({
  x,
  y,
  titel,
  schliessen,
  children
}: {
  x: number
  y: number
  titel: string
  schliessen: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const weg = (e: Event): void => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      // Mantine-Tooltips/Ausklapper liegen im Portal – die zählen nicht als „daneben"
      if (e.target instanceof Element && e.target.closest('.mantine-Tooltip-tooltip')) return
      schliessen()
    }
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') schliessen()
    }
    // Erst nach dem auslösenden Klick lauschen
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', weg, true)
      window.addEventListener('keydown', taste)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', weg, true)
      window.removeEventListener('keydown', taste)
    }
  }, [schliessen])
  // Im Fenster halten
  const breite = 292
  const links = Math.max(8, Math.min(window.innerWidth - breite - 8, x))
  const oben = Math.max(8, Math.min(window.innerHeight - 420, y))
  // Im Portal: Das Blatt ist skaliert (transform) – darin wäre `position: fixed` nicht mehr am Fenster ausgerichtet
  return (
    <Portal>
      <Paper
        ref={ref}
        shadow="lg"
        radius="md"
        withBorder
        p="sm"
        style={{ position: 'fixed', left: links, top: oben, width: breite, zIndex: 400 }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        data-kontextmenue
      >
        <Group gap={6} mb={8}>
          <IconLayersSubtract size={15} />
          <Text size="sm" fw={600}>
            {titel}
          </Text>
        </Group>
        {children}
      </Paper>
    </Portal>
  )
}

/** Rückfrage vor dem Löschen eines beschrifteten Kästchens */
export function LoeschFrage({ text, ja, nein }: { text: string; ja: () => void; nein: () => void }): React.JSX.Element {
  return (
    <Modal opened onClose={nein} title="Textkästchen löschen?" size="sm" centered data-loesch-frage>
      <Stack gap="sm">
        <Text size="sm">In diesem Kästchen steht schon Text:</Text>
        <Paper withBorder p="xs" radius="sm">
          <Text size="sm" lineClamp={4} style={{ whiteSpace: 'pre-wrap' }}>
            {text}
          </Text>
        </Paper>
        <Group justify="flex-end">
          <Button variant="default" onClick={nein} data-loesch-nein>
            Behalten
          </Button>
          <Button color="red" onClick={ja} data-autofocus data-loesch-ja>
            Löschen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
