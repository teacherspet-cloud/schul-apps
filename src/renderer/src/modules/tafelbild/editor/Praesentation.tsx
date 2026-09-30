import { ActionIcon, Button, Group, SegmentedControl, Text, Tooltip } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconMaximize, IconNotes, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { schrittZahl, type TbInhalt, type TbTafel } from '../model'
import { tafelSvg } from '../svg'

/**
 * Vollbild-Präsentation mit schrittweisem Aufdecken (30.09.2026): Weiter mit Pfeil rechts,
 * Leertaste, Klick bzw. Tippen auf die rechte Hälfte oder Wischen nach links; zurück entsprechend.
 * Esc schließt. Auf dem iPad genügt Tippen – die Leiste bleibt über dem Home-Balken.
 */
export default function Praesentation({ tafel, inhalt, schliessen, mitLuecke }: { tafel: TbTafel; inhalt: TbInhalt | null; schliessen: () => void; mitLuecke: boolean }): React.JSX.Element {
  const n = schrittZahl(tafel)
  const [schritt, setSchritt] = useState(1)
  const [notiz, setNotiz] = useState(true)
  const [fassung, setFassung] = useState<'voll' | 'luecke'>('voll')
  const wisch = useRef<{ x: number; t: number } | null>(null)
  const svg = useMemo(() => tafelSvg(tafel, { schritt, ...(fassung === 'luecke' ? { luecke: true, wortspeicher: true } : {}) }), [tafel, schritt, fassung])
  const weiter = (): void => setSchritt((s) => Math.min(n, s + 1))
  const zurueck = (): void => setSchritt((s) => Math.max(1, s - 1))

  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') schliessen()
      else if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) weiter()
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) zurueck()
      else if (e.key === 'Home') setSchritt(1)
      else if (e.key === 'End') setSchritt(n)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  })

  const plan = inhalt?.schritte.find((x) => x.nr === schritt)
  return createPortal(
    <div className="tb-praesentation" data-tb-praesentation data-schritt={schritt} role="dialog" aria-label="Präsentation des Tafelbilds">
      <div
        className="tb-p-buehne"
        onPointerDown={(e) => (wisch.current = { x: e.clientX, t: Date.now() })}
        onPointerUp={(e) => {
          const w = wisch.current
          wisch.current = null
          if (!w) return
          const dx = e.clientX - w.x
          if (Math.abs(dx) > 60) return dx < 0 ? weiter() : zurueck()
          // Tippen: rechte Hälfte weiter, linke zurück
          if (e.clientX > window.innerWidth / 2) weiter()
          else zurueck()
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="tb-p-leiste">
        <Tooltip label="Zurück (Pfeil links)">
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Zurück" onClick={zurueck} disabled={schritt <= 1}>
            <IconChevronLeft />
          </ActionIcon>
        </Tooltip>
        <Text size="sm" c="gray.4" data-tb-schrittanzeige>
          Schritt {schritt} von {n}
        </Text>
        <Tooltip label="Weiter (Pfeil rechts, Leertaste)">
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Weiter" onClick={weiter} disabled={schritt >= n} data-tb-weiter>
            <IconChevronRight />
          </ActionIcon>
        </Tooltip>
        <div className="tb-p-notiz">{notiz && plan ? `${plan.phase}${plan.impuls ? ` – ${plan.impuls}` : ''}` : ''}</div>
        <Group gap={6} wrap="nowrap">
          {mitLuecke && (
            <SegmentedControl
              size="xs"
              value={fassung}
              onChange={(v) => setFassung(v as 'voll' | 'luecke')}
              data={[
                { value: 'voll', label: 'Tafelbild' },
                { value: 'luecke', label: 'Lückenfassung' }
              ]}
            />
          )}
          <Button size="xs" variant="subtle" color="gray" onClick={() => setSchritt(n)}>
            Alles zeigen
          </Button>
          <Tooltip label="Notizen der Planungshilfe ein/aus">
            <ActionIcon variant="subtle" color="gray" aria-label="Notizen" onClick={() => setNotiz((x) => !x)}>
              <IconNotes size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Vollbild">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Vollbild"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => undefined)}
            >
              <IconMaximize size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Schließen (Esc)">
            <ActionIcon variant="subtle" color="gray" aria-label="Präsentation schließen" onClick={schliessen} data-tb-praesentation-schliessen>
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
    </div>,
    document.body
  )
}
