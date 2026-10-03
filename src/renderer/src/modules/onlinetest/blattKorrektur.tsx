/**
 * Feedback „wie eine korrigierte Arbeit" auf dem digitalen Arbeitsblatt (03.10.2026, abgestimmt mit
 * der Lehrkraft): Stellen im Text der Lernenden markiert (Fehler rot gewellt, Hinweise orange,
 * Gelungenes grün), Randkommentare auf Höhe der Stelle – sie hängen an den Linien und scrollen mit.
 *
 * Die Markierung liegt als Spiegel UNTER dem Eingabefeld: gleiche Schrift, gleiche Zeilen, Text
 * unsichtbar, nur die Hintergründe/Unterstreichungen sichtbar. So bleibt das Feld bearbeitbar.
 */
import { Popover, Text } from '@mantine/core'
import { useLayoutEffect, useRef } from 'react'

export interface Anmerkung {
  /** laufende Nummer (wie am Rand) */
  nr: number
  zitat: string
  art: 'lob' | 'fehler' | 'hinweis'
  text: string
  zeichen?: string
  /** Aus dem Feedback zu dieser Aufgabe – markiert nur in ihren Feldern (sonst irgendwo im Blatt) */
  aufgabe?: number
}

export const ANMERKUNG_FARBE: Record<Anmerkung['art'], string> = { fehler: '#e03131', hinweis: '#f08c00', lob: '#2f9e44' }

/** Fundstellen der Anmerkungen in einem Text (erste, nicht überlappende Fundstelle je Zitat) */
export function fundstellen(wert: string, anmerkungen: Anmerkung[]): { start: number; ende: number; a: Anmerkung }[] {
  const aus: { start: number; ende: number; a: Anmerkung }[] = []
  const klein = wert.toLowerCase()
  for (const a of anmerkungen) {
    const z = a.zitat.trim()
    if (z.length < 2) continue
    let i = wert.indexOf(z)
    if (i < 0) i = klein.indexOf(z.toLowerCase())
    while (i >= 0 && aus.some((x) => i < x.ende && i + z.length > x.start)) {
      const naechste = klein.indexOf(z.toLowerCase(), i + 1)
      i = naechste
    }
    if (i >= 0) aus.push({ start: i, ende: i + z.length, a })
  }
  return aus.sort((x, y) => x.start - y.start)
}

/** Spiegel des Feldes mit den Markierungen; meldet die Höhe jeder markierten Stelle (Seitenpixel) */
export function FeldMarkierung(p: {
  wert: string
  treffer: { start: number; ende: number; a: Anmerkung }[]
  stil: React.CSSProperties
  einzeilig: boolean
  lage: (nr: number, y: number) => void
}): React.JSX.Element {
  const huelle = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = huelle.current
    if (!el) return
    el.querySelectorAll<HTMLElement>('[data-anm]').forEach((s) => p.lage(Number(s.dataset.anm), s.offsetTop))
  })
  const teile: React.ReactNode[] = []
  let pos = 0
  for (const t of p.treffer) {
    if (t.start > pos) teile.push(p.wert.slice(pos, t.start))
    const farbe = ANMERKUNG_FARBE[t.a.art]
    teile.push(
      <span
        key={t.a.nr}
        data-anm={t.a.nr}
        style={{
          background: t.a.art === 'lob' ? 'rgba(47,158,68,0.16)' : t.a.art === 'hinweis' ? 'rgba(240,140,0,0.14)' : 'rgba(224,49,49,0.10)',
          textDecoration: t.a.art === 'lob' ? 'none' : `underline ${t.a.art === 'fehler' ? 'wavy' : 'solid'} ${farbe}`,
          textDecorationThickness: 2,
          textUnderlineOffset: 3,
          borderRadius: 2
        }}
      >
        {p.wert.slice(t.start, t.ende)}
      </span>,
      <sup key={`n${t.a.nr}`} style={{ color: farbe, fontWeight: 800, fontSize: '0.7em', visibility: 'visible' }}>
        {t.a.nr}
      </sup>
    )
    pos = t.ende
  }
  teile.push(p.wert.slice(pos))
  return (
    <div
      ref={huelle}
      aria-hidden
      style={{
        ...p.stil,
        color: 'transparent',
        background: 'transparent',
        whiteSpace: p.einzeilig ? 'pre' : 'pre-wrap',
        overflowWrap: 'break-word',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}
      data-markierung
    >
      {teile}
    </div>
  )
}

/**
 * Randkommentare. Neben Schreiblinien (x/w gesetzt) stehen sie im Korrekturrand auf Höhe der Stelle –
 * kurz gefasst, ein Tipp zeigt den ganzen Text; andere Stellen (Lücken, Kästchen) bekommen eine Marke.
 */
export function Rand(p: { eintraege: { a: Anmerkung; y: number; x?: number; w?: number }[]; randX: number }): React.JSX.Element {
  // Untereinander, ohne Überlappung (ein Kommentar rutscht unter den vorigen)
  const sortiert = [...p.eintraege].sort((x, y) => x.y - y.y)
  let unten = -Infinity
  return (
    <>
      {sortiert.map(({ a, y, x, w }) => {
        const farbe = ANMERKUNG_FARBE[a.art]
        if (x === undefined || w === undefined)
          return (
            <Popover key={a.nr} position="left" withArrow shadow="md" width={240}>
              <Popover.Target>
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    left: p.randX,
                    top: y,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    border: 0,
                    background: farbe,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    zIndex: 25
                  }}
                  aria-label={`Randkommentar ${a.nr}`}
                  data-rand-marke={a.nr}
                >
                  {a.nr}
                </button>
              </Popover.Target>
              <Popover.Dropdown p="xs">
                <Text size="sm">
                  {a.zeichen ? <b>{a.zeichen}: </b> : null}
                  {a.text}
                </Text>
              </Popover.Dropdown>
            </Popover>
          )
        const top = Math.max(y - 2, unten + 4)
        const zeilen = Math.min(5, Math.ceil(((a.zeichen ? a.zeichen.length + 2 : 0) + a.text.length + 3) / Math.max(10, Math.floor(w / 6.2))))
        unten = top + 6 + zeilen * 14
        return (
          <Popover key={a.nr} position="right" withArrow shadow="md" width={260}>
            <Popover.Target>
              <div
                style={{
                  position: 'absolute',
                  left: x,
                  top,
                  width: w,
                  borderLeft: `3px solid ${farbe}`,
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  fontSize: 11,
                  lineHeight: '14px',
                  color: '#222',
                  zIndex: 25,
                  cursor: 'pointer',
                  display: '-webkit-box',
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
                data-rand-kommentar={a.nr}
              >
                <b style={{ color: farbe }}>{a.nr}</b> {a.zeichen ? <b style={{ color: farbe }}>{a.zeichen} </b> : null}
                {a.text}
              </div>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              <Text size="sm">
                {a.zeichen ? <b>{a.zeichen}: </b> : null}
                {a.text}
              </Text>
            </Popover.Dropdown>
          </Popover>
        )
      })}
    </>
  )
}
