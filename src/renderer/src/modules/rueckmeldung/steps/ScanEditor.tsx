import { Box, Button, Group, Stack, Text } from '@mantine/core'
import { IconMapPinPlus } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import type { Korrekturzeichen } from '../../../shared/korrekturzeichen'
import { newId } from '../../vokabeltest/model/random'
import { klemme, scanReihenfolge } from '../korrekturrand'
import type { Abgabe, RandKommentar } from '../model/types'
import { ART_FARBE, KommentarZeile } from './RandEditor'

/**
 * Kommentare neben dem eingescannten Schülertext (29.09.2026, abgestimmt: „halbautomatisch,
 * zum Feinjustieren ziehbar"): Die KI setzt nummerierte Marker ungefähr an die Stelle; hier
 * lassen sie sich mit der Maus oder dem Finger genau hinziehen. Mit „Marker setzen" und einem
 * Klick ins Bild entsteht ein eigener Kommentar an dieser Stelle.
 */
export default function ScanEditor({
  a,
  zeichen,
  setzeRand
}: {
  a: Abgabe
  zeichen: Korrekturzeichen[]
  setzeRand: (fn: (rand: RandKommentar[]) => void, gruppe?: string) => void
}): React.JSX.Element {
  const rand = a.bogen?.rand ?? []
  const reihe = scanReihenfolge(rand)
  const nummer = new Map(reihe.map((g) => [g.k.id, g.nr]))
  const [setzen, setSetzen] = useState(false)
  const [zieht, setZieht] = useState<string | null>(null)
  const flaechen = useRef<(HTMLDivElement | null)[]>([])

  const lage = (s: number, e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
    const el = flaechen.current[s]
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: klemme(((e.clientX - b.left) / b.width) * 100), y: klemme(((e.clientY - b.top) / b.height) * 100) }
  }

  const index = (id: string): number => rand.findIndex((k) => k.id === id)

  return (
    <Stack gap="sm" data-rm-scan>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Marker ziehen, um sie genau an die Stelle zu setzen.
        </Text>
        <Button
          size="compact-xs"
          variant={setzen ? 'filled' : 'light'}
          leftSection={<IconMapPinPlus size={14} />}
          onClick={() => setSetzen((x) => !x)}
          data-rm-marker-setzen
        >
          {setzen ? 'Jetzt ins Bild klicken …' : 'Marker setzen'}
        </Button>
      </Group>
      {(a.scans ?? []).map((src, s) => {
        const hier = reihe.filter((g) => (g.k.seite ?? 0) === s)
        return (
          <Group key={s} gap="md" align="flex-start" wrap="nowrap">
            <Box
              ref={(el: HTMLDivElement | null) => {
                flaechen.current[s] = el
              }}
              pos="relative"
              style={{ width: '62%', flex: 'none', cursor: setzen ? 'crosshair' : undefined, touchAction: zieht ? 'none' : undefined, userSelect: 'none' }}
              onClick={(e) => {
                if (!setzen) return
                const p = lage(s, e)
                if (!p) return
                setzeRand((r) => r.push({ id: newId(), zitat: '', text: '', art: 'hinweis', seite: s, x: p.x, y: p.y, gesetzt: true }))
                setSetzen(false)
              }}
              data-scan-seite={s}
            >
              <img src={src} alt={`Seite ${s + 1}`} style={{ width: '100%', display: 'block', border: '1px solid var(--mantine-color-default-border)' }} draggable={false} />
              {hier.map(({ nr, k }) => (
                <Box
                  key={k.id}
                  pos="absolute"
                  style={{
                    left: `${k.x ?? 50}%`,
                    top: `${k.y ?? 50}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: ART_FARBE[k.art],
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,.4)',
                    cursor: 'grab',
                    touchAction: 'none'
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    setZieht(k.id)
                  }}
                  onPointerMove={(e) => {
                    if (zieht !== k.id) return
                    const p = lage(s, e)
                    const i = index(k.id)
                    if (p && i >= 0)
                      setzeRand((r) => {
                        r[i].x = Math.round(p.x * 10) / 10
                        r[i].y = Math.round(p.y * 10) / 10
                        r[i].gesetzt = true
                      }, `marker-${k.id}`)
                  }}
                  onPointerUp={(e) => {
                    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                    setZieht(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Marker ${nr}`}
                  data-marker={nr}
                >
                  {nr}
                </Box>
              ))}
            </Box>
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text size="xs" c="dimmed">
                Seite {s + 1}
              </Text>
              {hier.map(({ nr, k }) => (
                <KommentarZeile
                  key={k.id}
                  nr={nummer.get(k.id) ?? nr}
                  k={k}
                  zeichen={zeichen}
                  mitZitat={false}
                  aendern={(fn, gruppe) => setzeRand((r) => fn(r[index(k.id)]), gruppe)}
                  entfernen={() => setzeRand((r) => r.splice(index(k.id), 1))}
                />
              ))}
            </Stack>
          </Group>
        )
      })}
    </Stack>
  )
}
