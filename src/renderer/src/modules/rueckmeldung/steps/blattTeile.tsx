import { ActionIcon, Button, Divider, Loader, Menu, Stack, TextInput, Tooltip } from '@mantine/core'
import { IconWand } from '@tabler/icons-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Korrekturzeichen } from '../../../shared/korrekturzeichen'
import type { Stelle, StellenModus } from '../feedbackUeberarbeiten'
import type { Abgabe, Bogen, RandKommentar, Rueckmeldung } from '../model/types'

/**
 * Bausteine des A4-Blatts (29.09.2026): gemeinsamer Zusammenhang, direkt bearbeitbarer Text und
 * der Zauberstab. Alles, was nur zum Bearbeiten da ist, trägt die Klasse `rm-nur-ansicht` –
 * im Ausdruck gibt es diese Knöpfe nicht (der Druck entsteht aus blattLayout.ts).
 */
export interface BlattZusammenhang {
  r: Rueckmeldung
  a: Abgabe
  docId: string
  zeichen: Korrekturzeichen[]
  /** Kürzel → Name (Anzeige) und zurück (Speichern) */
  n: (s: string) => string
  roh: (s: string) => string
  setzeBogen: (fn: (b: Bogen) => void, gruppe?: string) => void
  setzeRand: (fn: (rand: RandKommentar[]) => void, gruppe?: string) => void
  /** Zauberstab: Stelle neu erzeugen / überarbeiten */
  stab: (s: Stelle, modus: StellenModus, hinweis?: string) => void
  laeuft: (s: Stelle) => boolean
  /** Neu angelegte Notiz, deren Text gleich den Fokus bekommt */
  fokus: string | null
  setFokus: (id: string | null) => void
}

export const BlattKontext = createContext<BlattZusammenhang | null>(null)

export function useBlatt(): BlattZusammenhang {
  const c = useContext(BlattKontext)
  if (!c) throw new Error('Blatt-Zusammenhang fehlt')
  return c
}

/**
 * Text direkt auf dem Blatt bearbeiten: ein `contentEditable`-Bereich, der sich optisch ins Blatt
 * fügt. Solange er den Fokus hat, schreibt React nicht hinein (sonst spränge die Schreibmarke).
 */
export function Editierbar({
  wert,
  onText,
  platzhalter,
  label,
  mehrzeilig = false,
  autoFokus = false,
  className
}: {
  wert: string
  onText: (text: string) => void
  platzhalter?: string
  label: string
  mehrzeilig?: boolean
  autoFokus?: boolean
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.textContent !== wert) el.textContent = wert
  })
  useEffect(() => {
    if (!autoFokus || !ref.current) return
    ref.current.focus()
  }, [autoFokus])
  return (
    <span
      ref={ref}
      className={`rm-edit${className ? ` ${className}` : ''}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={mehrzeilig}
      spellCheck
      data-platzhalter={platzhalter ?? ''}
      data-rm-edit
      onInput={(e) => onText((e.currentTarget.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n+$/, ''))}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' && !(mehrzeilig && e.shiftKey)) || e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        // Beim Verlassen den gespeicherten Stand zeigen (z. B. Namen statt Kürzel)
        if (e.currentTarget.textContent !== wert) e.currentTarget.textContent = wert
      }}
    />
  )
}

/** Zauberstab an einer Stelle: neu erzeugen, überarbeiten, mit Hinweis überarbeiten */
export function Zauberstab({ stelle, label = 'Mit KI bearbeiten' }: { stelle: Stelle; label?: string }): React.JSX.Element {
  const c = useBlatt()
  const [hinweis, setHinweis] = useState('')
  const [offen, setOffen] = useState(false)
  const laeuft = c.laeuft(stelle)
  const mitHinweis = (): void => {
    if (!hinweis.trim()) return
    c.stab(stelle, 'hinweis', hinweis)
    setHinweis('')
    setOffen(false)
  }
  if (laeuft)
    return (
      <Tooltip label="Die KI schreibt diese Stelle …">
        <span className="rm-stab rm-stab-laeuft" data-rm-stab-laeuft>
          <Loader size={14} color="grape" />
        </span>
      </Tooltip>
    )
  return (
    <Menu opened={offen} onChange={setOffen} position="bottom-end" width={290} withinPortal closeOnItemClick>
      <Menu.Target>
        <Tooltip label={label} disabled={offen}>
          <ActionIcon className="rm-stab" size="sm" variant="subtle" color="grape" aria-label={label} data-rm-stab={stelle.art}>
            <IconWand size={15} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => c.stab(stelle, 'neu')} data-rm-stab-modus="neu">
          Neu erzeugen
        </Menu.Item>
        <Menu.Item onClick={() => c.stab(stelle, 'ueberarbeiten')} data-rm-stab-modus="ueberarbeiten">
          Überarbeiten
        </Menu.Item>
        <Divider my={4} />
        <Stack gap={6} p={6}>
          <TextInput
            size="xs"
            placeholder="Hinweis, z. B. „freundlicher“, „konkreter mit Beispiel“"
            value={hinweis}
            onChange={(e) => setHinweis(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') mitHinweis()
            }}
            aria-label="Hinweis für die Überarbeitung"
            data-rm-stab-hinweis
          />
          <Button size="xs" variant="light" color="grape" disabled={!hinweis.trim()} onClick={mitHinweis} data-rm-stab-modus="hinweis">
            Mit Hinweis überarbeiten …
          </Button>
        </Stack>
      </Menu.Dropdown>
    </Menu>
  )
}
