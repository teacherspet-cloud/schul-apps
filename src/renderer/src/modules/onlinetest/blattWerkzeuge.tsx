/**
 * Werkzeuge auf dem freigegebenen Arbeitsblatt (03.10.2026, abgestimmt mit der Lehrkraft):
 * eine mitwandernde Leiste mit Tastatur, Stift (Farben), Textmarker (Farben), Radierer,
 * Textkästchen, Verbindungslinie (z. B. Kästchen → Datum auf einer Zeitleiste) und Punkt mit Wert
 * (Diagramme). Kästchen, Linien und Punkte sind Objekte (shared/blattObjekte.ts) – sie bleiben
 * verschieb- und änderbar und kommen auf den Seitenbildern auch bei der KI an.
 */
import { FORMEN, formGeometrie, formMasse, linieSvg, randStil, schriftVon, staerkeVon, strichMuster, type FormArt } from '@shared/blattObjekte'
import { datumText } from '../arbeitsblatt/model/diagram'
import { KontextMenue, LoeschFrage, OptionenInhalt, type Stil } from './objektOptionen'
import { ActionIcon, ColorSwatch, Group, Menu, Paper, Text, Tooltip } from '@mantine/core'
import {
  IconArrowBackUp,
  IconArrowsDiagonal2,
  IconArrowsMove,
  IconCircleDot,
  IconEraser,
  IconHighlight,
  IconKeyboard,
  IconLine,
  IconPencil,
  IconTextPlus,
  IconX
} from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlattObjekt } from '@shared/blattObjekte'

export type Werkzeug = 'tastatur' | 'stift' | 'marker' | 'radierer' | 'text' | 'linie' | 'punkt' | 'form'

export const STIFT_FARBEN = ['#1d4ed8', '#111827', '#dc2626', '#16a34a', '#9333ea']
export const MARKER_FARBEN = ['#facc15', '#4ade80', '#f472b6', '#60a5fa', '#fb923c']

const WERKZEUGE: { w: Werkzeug; name: string; icon: React.ReactNode }[] = [
  { w: 'tastatur', name: 'Tippen', icon: <IconKeyboard size={20} /> },
  { w: 'stift', name: 'Stift', icon: <IconPencil size={20} /> },
  { w: 'marker', name: 'Textmarker', icon: <IconHighlight size={20} /> },
  { w: 'radierer', name: 'Radierer (Stift, Textmarker, Kästchen, Linien)', icon: <IconEraser size={20} /> },
  { w: 'text', name: 'Textkästchen setzen', icon: <IconTextPlus size={20} /> },
  { w: 'linie', name: 'Verbindungslinie ziehen', icon: <IconLine size={20} /> },
  { w: 'punkt', name: 'Punkt mit Wert (Diagramm)', icon: <IconCircleDot size={20} /> }
]

/** Bei Zeichenaufgaben ohne erlaubten Stift (05.10.2026): nur, was zum Zeichnen und Beschriften gehört */
const ZEICHEN_WERKZEUGE = new Set<Werkzeug>(['tastatur', 'stift', 'radierer', 'text', 'linie', 'punkt'])

/** Symbol einer Form (für das Menü und den Knopf) */
export function FormSymbol({ art, groesse = 20, farbe = 'currentColor' }: { art: FormArt; groesse?: number; farbe?: string }): React.JSX.Element {
  const g = formGeometrie(art, 2, 3, groesse - 4, art === 'pfeil' ? groesse - 6 : groesse - 6)
  return (
    <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} aria-hidden>
      {g.art === 'ellipse' ? (
        <ellipse cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} fill="none" stroke={farbe} strokeWidth={1.8} />
      ) : (
        <polygon points={g.points} fill="none" stroke={farbe} strokeWidth={1.8} strokeLinejoin="round" />
      )}
    </svg>
  )
}

/** Vorgaben je Werkzeug (Rechtsklick/langes Drücken auf das Werkzeug, 06.10.2026) */
export type VorgabeArt = 'stift' | 'marker' | 'text' | 'linie' | 'form' | 'punkt'
export type Vorgaben = Partial<Record<VorgabeArt, Stil>>
const MIT_VORGABE = new Set<Werkzeug>(['stift', 'marker', 'text', 'linie', 'form', 'punkt'])
const VORGABE_TITEL: Record<VorgabeArt, string> = {
  stift: 'Stift',
  marker: 'Textmarker',
  text: 'Neue Textkästchen',
  linie: 'Neue Verbindungslinien',
  form: 'Neue Formen',
  punkt: 'Neue Punkte'
}

/** Mitwandernde Leiste: bleibt beim Scrollen oben sichtbar */
export function Werkzeugleiste(p: {
  werkzeug: Werkzeug
  setWerkzeug: (w: Werkzeug) => void
  stiftFarbe: string
  setStiftFarbe: (f: string) => void
  markerFarbe: string
  setMarkerFarbe: (f: string) => void
  rueckgaengig?: () => void
  /** Gewählte Form (Werkzeug „Formen", 05.10.2026) */
  form: FormArt
  setForm: (f: FormArt) => void
  /** Stift nicht erlaubt, aber das Blatt hat Zeichenaufgaben: nur die Zeichenwerkzeuge (05.10.2026) */
  nurZeichnen?: boolean
  vorgaben?: Vorgaben
  setVorgabe?: (art: VorgabeArt, patch: Partial<Stil>) => void
}): React.JSX.Element {
  // Optionen eines Werkzeugs: Rechtsklick oder langes Drücken (Touch) auf den Knopf
  const [optionen, setOptionen] = useState<{ art: VorgabeArt; x: number; y: number } | null>(null)
  const druck = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionenFuer = (w: Werkzeug): React.HTMLAttributes<HTMLElement> =>
    MIT_VORGABE.has(w) && p.setVorgabe
      ? {
          onContextMenu: (e) => {
            e.preventDefault()
            setOptionen({ art: w as VorgabeArt, x: e.clientX, y: e.clientY + 8 })
          },
          onPointerDown: (e) => {
            if (e.pointerType === 'mouse') return
            const { clientX, clientY } = e
            druck.current = setTimeout(() => setOptionen({ art: w as VorgabeArt, x: clientX, y: clientY + 8 }), 550)
          },
          onPointerUp: () => druck.current && clearTimeout(druck.current),
          onPointerLeave: () => druck.current && clearTimeout(druck.current)
        }
      : {}
  const optionenWert = (art: VorgabeArt): Stil => ({
    farbe: art === 'stift' ? p.stiftFarbe : art === 'marker' ? p.markerFarbe : p.stiftFarbe,
    ...p.vorgaben?.[art]
  })
  const hinweis: Record<Werkzeug, string> = {
    tastatur: 'In die Felder tippen',
    stift: 'Aufs Blatt schreiben oder zeichnen',
    marker: 'Text auf dem Blatt markieren',
    radierer: 'Über Striche wischen; Kästchen und Linien antippen',
    text: 'Auf die Stelle tippen, an die das Kästchen soll',
    linie: 'Von einem Punkt zum anderen ziehen',
    punkt: 'Auf die Stelle im Diagramm tippen, dann den Wert eintragen',
    form: 'Form aufziehen (oder antippen); mit dem Radierer wieder entfernen'
  }
  return (
    <Paper withBorder shadow="sm" p={6} radius="md" style={{ position: 'sticky', top: 8, zIndex: 30 }} data-werkzeuge>
      <Group gap={4} wrap="wrap">
        {WERKZEUGE.filter((x) => !p.nurZeichnen || ZEICHEN_WERKZEUGE.has(x.w)).map((x) => {
          const aktiv = p.werkzeug === x.w
          const farbe = x.w === 'stift' ? p.stiftFarbe : x.w === 'marker' ? p.markerFarbe : undefined
          const knopf = (
            <ActionIcon
              size="lg"
              variant={aktiv ? 'filled' : 'subtle'}
              color={aktiv ? 'blue' : 'gray'}
              onClick={() => p.setWerkzeug(x.w)}
              {...optionenFuer(x.w)}
              aria-label={x.name}
              data-werkzeug={x.w}
              style={farbe ? { boxShadow: `inset 0 -4px 0 ${farbe}` } : undefined}
            >
              {x.icon}
            </ActionIcon>
          )
          return (
            <Tooltip key={x.w} label={x.name}>
              {knopf}
            </Tooltip>
          )
        })}
        {/* Formen: Knopf mit Ausklappmenü – Symbol der gewählten Form */}
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <Tooltip label="Geometrische Form auf das Blatt legen">
              <ActionIcon
                {...optionenFuer('form')}
                size="lg"
                variant={p.werkzeug === 'form' ? 'filled' : 'subtle'}
                color={p.werkzeug === 'form' ? 'blue' : 'gray'}
                aria-label="Formen"
                data-werkzeug="form"
              >
                <FormSymbol art={p.form} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown data-formen-menue>
            {FORMEN.map((f) => (
              <Menu.Item
                key={f.art}
                leftSection={<FormSymbol art={f.art} />}
                onClick={() => {
                  p.setForm(f.art)
                  p.setWerkzeug('form')
                }}
                data-form={f.art}
              >
                {f.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        {(p.werkzeug === 'stift' || p.werkzeug === 'marker') && (
          <Group gap={5} ml={4} data-farben>
            {(p.werkzeug === 'stift' ? STIFT_FARBEN : MARKER_FARBEN).map((f) => {
              const gewaehlt = (p.werkzeug === 'stift' ? p.stiftFarbe : p.markerFarbe) === f
              return (
                <ColorSwatch
                  key={f}
                  component="button"
                  type="button"
                  color={f}
                  size={24}
                  onClick={() => (p.werkzeug === 'stift' ? p.setStiftFarbe(f) : p.setMarkerFarbe(f))}
                  aria-label={`Farbe ${f}`}
                  style={{ cursor: 'pointer', outline: gewaehlt ? '2px solid var(--mantine-color-text)' : undefined, outlineOffset: 2 }}
                  data-farbe={f}
                />
              )
            })}
          </Group>
        )}
        {p.rueckgaengig && (
          <Tooltip label="Rückgängig">
            <ActionIcon size="lg" variant="subtle" color="gray" onClick={p.rueckgaengig} aria-label="Rückgängig" data-rueckgaengig>
              <IconArrowBackUp size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        <Text size="xs" c="dimmed" ml={4}>
          {hinweis[p.werkzeug]}
          {p.setVorgabe && MIT_VORGABE.has(p.werkzeug) ? ' · Optionen: Rechtsklick bzw. lange drücken' : ''}
        </Text>
      </Group>
      {optionen && p.setVorgabe && (
        <KontextMenue x={optionen.x} y={optionen.y} titel={VORGABE_TITEL[optionen.art]} schliessen={() => setOptionen(null)}>
          <OptionenInhalt
            art={optionen.art}
            wert={optionenWert(optionen.art)}
            aendern={(patch) => {
              const { farbe, ...rest } = patch
              if (farbe && optionen.art === 'stift') p.setStiftFarbe(farbe)
              else if (farbe && optionen.art === 'marker') p.setMarkerFarbe(farbe)
              p.setVorgabe!(optionen.art, optionen.art === 'stift' || optionen.art === 'marker' ? rest : patch)
              if (p.werkzeug !== optionen.art) p.setWerkzeug(optionen.art)
            }}
          />
        </KontextMenue>
      )}
    </Paper>
  )
}

const neueId = (): string => Math.random().toString(36).slice(2, 10)
const abstand = (px: number, py: number, o: { x: number; y: number; x2?: number; y2?: number }): number => {
  const x2 = o.x2 ?? o.x
  const y2 = o.y2 ?? o.y
  const dx = x2 - o.x
  const dy = y2 - o.y
  const l = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - o.x) * dx + (py - o.y) * dy) / l))
  return Math.hypot(px - (o.x + t * dx), py - (o.y + t * dy))
}

/**
 * Andockstellen des Blatts (03.10.2026, Wunsch der Lehrkraft: Verbindungslinien sollen an Achse/Leiste
 * und Kästchen/Text einrasten, und es soll leicht festzulegen sein, WO): Punkte (Markierungen einer
 * Achse, Beschriftungen) rasten vorrangig ein, sonst die nächste Stelle auf einer Strecke (Achse).
 * Lage in Seitenpixeln.
 */
export type Andock =
  | { art: 'punkt'; x: number; y: number }
  | { art: 'strecke'; x1: number; y1: number; x2: number; y2: number }
  /** Achse einer Zeitleiste mit Skala (06.10.2026): rastet jahresgenau ein (Einheit der Leiste) */
  | { art: 'skala'; x1: number; y1: number; x2: number; y2: number; a: number; b: number; einheit: 'year' | 'month' | 'day'; mitJahr: boolean }

const SKALA_RADIUS = 16

/** Nächste ganze Einheit (Jahr, Monat, Tag) auf einer Zeitleisten-Achse – mit Beschriftung */
export function aufSkala(q: { x: number; y: number }, s: Extract<Andock, { art: 'skala' }>): { x: number; y: number; wert: string; d: number } | null {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const l = dx * dx + dy * dy || 1
  const t = ((q.x - s.x1) * dx + (q.y - s.y1) * dy) / l
  if (t < -0.03 || t > 1.03) return null
  const tk = Math.max(0, Math.min(1, t))
  const d = Math.hypot(q.x - (s.x1 + tk * dx), q.y - (s.y1 + tk * dy))
  if (d >= SKALA_RADIUS) return null
  const lo = Math.min(s.a, s.b)
  const hi = Math.max(s.a, s.b)
  const v = Math.max(Math.ceil(lo - 1e-9), Math.min(Math.floor(hi + 1e-9), Math.round(s.a + tk * (s.b - s.a))))
  const tv = (v - s.a) / (s.b - s.a)
  return { x: s.x1 + tv * dx, y: s.y1 + tv * dy, wert: datumText(v, s.einheit, s.mitJahr), d }
}

const PUNKT_RADIUS = 14
const STRECKE_RADIUS = 10
/** Kleinste Höhe eines Kästchens (eine Zeile) */
const KASTEN_MIN_H = 28

/** Lage eines Kästchens: Höhe aus dem Objekt oder gemessen */
interface Kasten {
  id: string
  x: number
  y: number
  w: number
  h: number
}

function einrasten(
  q: { x: number; y: number },
  andocken: Andock[],
  kaesten: Kasten[]
): { x: number; y: number; kasten?: string; art: 'punkt' | 'strecke'; wert?: string } | null {
  // Kästchen: Mitten und Ecken als Punkte, Kanten als Strecken
  const ausKasten = kaesten.flatMap((k) => {
    const r = k.x + k.w
    const u = k.y + k.h
    return [
      ...[
        [k.x + k.w / 2, k.y],
        [k.x + k.w / 2, u],
        [k.x, k.y + k.h / 2],
        [r, k.y + k.h / 2],
        [k.x, k.y],
        [r, k.y],
        [k.x, u],
        [r, u]
      ].map(([x, y]) => ({ art: 'punkt' as const, x, y, kasten: k.id })),
      ...[
        [k.x, k.y, r, k.y],
        [k.x, u, r, u],
        [k.x, k.y, k.x, u],
        [r, k.y, r, u]
      ].map(([x1, y1, x2, y2]) => ({ art: 'strecke' as const, x1, y1, x2, y2, kasten: k.id }))
    ]
  })
  const alle: (Andock & { kasten?: string })[] = [...andocken, ...ausKasten]
  let best: { x: number; y: number; kasten?: string; art: 'punkt' | 'strecke'; d: number; wert?: string } | null = null
  const punkteIn = (liste: typeof alle): void => {
    for (const a of liste)
      if (a.art === 'punkt') {
        const d = Math.hypot(q.x - a.x, q.y - a.y)
        if (d < PUNKT_RADIUS && (!best || best.art !== 'punkt' || d < best.d)) best = { x: a.x, y: a.y, kasten: a.kasten, art: 'punkt', d }
      }
  }
  // Reihenfolge: Ecken/Mitten der Kästchen, dann Zeitleisten (jahresgenau), dann Punkte und Strecken des Blatts
  punkteIn(ausKasten)
  if (best) return best
  for (const a of andocken)
    if (a.art === 'skala') {
      const s = aufSkala(q, a)
      if (s && (!best || s.d < best.d)) best = { x: s.x, y: s.y, art: 'strecke', d: s.d, wert: s.wert }
    }
  if (best) return best
  punkteIn(andocken)
  if (best) return best
  for (const a of alle)
    if (a.art === 'strecke') {
      const d = abstand(q.x, q.y, { x: a.x1, y: a.y1, x2: a.x2, y2: a.y2 })
      if (d >= STRECKE_RADIUS || (best && d >= best.d)) continue
      const dx = a.x2 - a.x1
      const dy = a.y2 - a.y1
      const l = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((q.x - a.x1) * dx + (q.y - a.y1) * dy) / l))
      best = { x: a.x1 + t * dx, y: a.y1 + t * dy, kasten: a.kasten, art: 'strecke', d }
    }
  return best
}

/**
 * Objekte einer Seite: Kästchen (bearbeitbar, verschiebbar, in Breite und Höhe ziehbar), Linien
 * (rasten an Kästchen, Achsen, Markierungen und Beschriftungen ein; an Kästchen gehängte Enden wandern
 * beim Verschieben mit), Punkte mit Wert. Radierer: Linie, Punkt oder Kästchen antippen; Striche
 * des Stifts radiert die Stift-Ebene darunter. Lage in Seitenpixeln; Kästchen bleiben auf der Seite.
 */
export function ObjektEbene(p: {
  seite: number
  lage: { x: number; y: number; w: number; h: number }
  objekte: BlattObjekt[]
  aendern: (neu: BlattObjekt[]) => void
  werkzeug: Werkzeug
  farbe: string
  gesperrt: boolean
  andocken?: Andock[]
  /** Gewählte Form für das Werkzeug „Formen" */
  form?: FormArt
  /** Vorgaben für neue Objekte (Rechtsklick aufs Werkzeug, 06.10.2026) */
  vorgabe?: Partial<Record<'text' | 'linie' | 'form' | 'punkt', Stil>>
}): React.JSX.Element {
  const flaeche = useRef<HTMLDivElement>(null)
  // Optionsmenü (Rechtsklick/langes Drücken) und Rückfrage vor dem Löschen eines beschrifteten Kästchens
  const [menue, setMenue] = useState<{ id: string; x: number; y: number } | null>(null)
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null)
  // Form wird aufgezogen: Anfang und aktuelle Ecke
  const [formZug, setFormZug] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null)
  const [zieht, setZieht] = useState<{ x: number; y: number; x2: number; y2: number; v1?: string; v2?: string; jahr1?: string; jahr2?: string } | null>(null)
  const [ziel, setZiel] = useState<{ x: number; y: number; wert?: string } | null>(null)
  const [fokus, setFokus] = useState<string | null>(null)
  // Verschieben/Größe ändern eines Kästchens: Ausgangslage und Zeiger beim Anfassen
  const griff = useRef<{ id: string; art: 'schieben' | 'groesse'; px: number; py: number; o: BlattObjekt; h: number } | null>(null)
  /*
   * Neues Kästchen/neuer Punkt: Eingabe fokussieren – mit kurzer Verzögerung, weil der Browser nach
   * dem Antippen den Fokus sonst auf die Fläche zurücksetzt (gemessen: Wert ging ins Leere).
   */
  useEffect(() => {
    if (!fokus) return
    const t = setTimeout(() => flaeche.current?.querySelector<HTMLElement>(`[data-objekt-id="${fokus}"]`)?.focus(), 40)
    return () => clearTimeout(t)
  }, [fokus])
  const eigene = p.objekte.filter((o) => o.s === p.seite)
  const fremde = p.objekte.filter((o) => o.s !== p.seite)
  const setzeEigene = (neu: BlattObjekt[]): void => p.aendern([...fremde, ...neu])
  const punkt = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = flaeche.current!.getBoundingClientRect()
    // Die Ebene ist mit dem Blatt skaliert: Bildschirm- in Seitenpixel umrechnen
    return { x: ((e.clientX - r.left) / r.width) * p.lage.w, y: ((e.clientY - r.top) / r.height) * p.lage.h }
  }
  const massstab = (): number => {
    const r = flaeche.current?.getBoundingClientRect()
    return r && r.width ? p.lage.w / r.width : 1
  }
  /** Höhe eines Kästchens: gespeichert, sonst gemessen */
  const hoeheVon = (o: BlattObjekt): number => {
    if (o.h) return o.h
    const el = flaeche.current?.querySelector<HTMLElement>(`[data-kasten="${o.id}"]`)
    return el ? el.getBoundingClientRect().height * massstab() : KASTEN_MIN_H
  }
  const kaesten = (): Kasten[] => eigene.filter((o) => o.t === 'text').map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w ?? 170, h: hoeheVon(o) }))
  /** Auf der Seite halten */
  const klemmen = (o: BlattObjekt, h: number): BlattObjekt => {
    const w = Math.min(o.w ?? 170, p.lage.w - 4)
    return { ...o, w, x: Math.max(2, Math.min(p.lage.w - w - 2, o.x)), y: Math.max(2, Math.min(p.lage.h - h - 2, o.y)) }
  }
  /** Entfernen – Linien an einem Kästchen bleiben, verlieren aber die Verbindung */
  const entfernen = (id: string): void =>
    setzeEigene(
      eigene
        .filter((x) => x.id !== id)
        .map((x) => (x.v1 === id || x.v2 === id ? { ...x, v1: x.v1 === id ? undefined : x.v1, v2: x.v2 === id ? undefined : x.v2 } : x))
    )
  /** Beschriftetes Kästchen nur nach Rückfrage löschen, leeres sofort (06.10.2026) */
  const bitteLoeschen = (o: BlattObjekt): void => {
    if (o.t === 'text' && (o.text ?? '').trim()) setLoeschFrage(o.id)
    else entfernen(o.id)
  }
  const aendereObjekt = (id: string, patch: Partial<BlattObjekt>): void =>
    setzeEigene(
      eigene.map((x) => {
        if (x.id !== id) return x
        const neu = { ...x, ...patch } as BlattObjekt & Record<string, unknown>
        for (const k of Object.keys(patch)) if (neu[k] === undefined) delete neu[k]
        return neu
      })
    )
  /** Objekt unter einer Stelle (oberstes zuerst) – für Rechtsklick und langes Drücken */
  const trefferBei = (q: { x: number; y: number }): BlattObjekt | null => {
    for (const o of [...eigene].reverse()) {
      if (o.t === 'text') {
        const h = hoeheVon(o)
        if (q.x >= o.x - 4 && q.x <= o.x + (o.w ?? 170) + 4 && q.y >= o.y - 4 && q.y <= o.y + h + 4) return o
      } else if (o.t === 'punkt') {
        if (Math.hypot(q.x - o.x, q.y - o.y) < 12) return o
      } else if (o.t === 'linie') {
        if (abstand(q.x, q.y, { x: o.x, y: o.y, x2: o.x2 ?? o.x, y2: o.y2 ?? o.y }) < 9) return o
      } else if (o.t === 'form') {
        if (q.x >= o.x - 6 && q.x <= o.x + (o.w ?? 90) + 6 && q.y >= o.y - 6 && q.y <= o.y + (o.h ?? 70) + 6) return o
      }
    }
    return null
  }
  const linieAktiv = !p.gesperrt && (p.werkzeug === 'linie' || p.werkzeug === 'text' || p.werkzeug === 'punkt' || p.werkzeug === 'form')
  const radiert = !p.gesperrt && p.werkzeug === 'radierer'

  // Kästchen ziehen (Verschieben oder Größe) – über das ganze Fenster, damit schnelle Bewegungen nicht abreißen
  const bewegen = (e: PointerEvent): void => {
    const g = griff.current
    if (!g) return
    const k = massstab()
    const dx = (e.clientX - g.px) * k
    const dy = (e.clientY - g.py) * k
    const neu =
      g.art === 'schieben'
        ? klemmen({ ...g.o, x: g.o.x + dx, y: g.o.y + dy }, g.h)
        : { ...g.o, w: Math.max(60, Math.min(p.lage.w - g.o.x - 2, (g.o.w ?? 170) + dx)), h: Math.max(KASTEN_MIN_H, Math.min(p.lage.h - g.o.y - 2, g.h + dy)) }
    const ddx = neu.x - g.o.x
    const ddy = neu.y - g.o.y
    setzeEigene(
      eigene.map((x) => {
        if (x.id === g.id) return neu
        // Angehängte Linienenden wandern mit
        if (x.t === 'linie' && g.art === 'schieben' && (x.v1 === g.id || x.v2 === g.id)) {
          return {
            ...x,
            ...(x.v1 === g.id ? { x: (linienStart.current.get(x.id)?.x ?? x.x) + ddx, y: (linienStart.current.get(x.id)?.y ?? x.y) + ddy } : {}),
            ...(x.v2 === g.id ? { x2: (linienStart.current.get(x.id)?.x2 ?? x.x2!) + ddx, y2: (linienStart.current.get(x.id)?.y2 ?? x.y2!) + ddy } : {})
          }
        }
        return x
      })
    )
  }
  const linienStart = useRef(new Map<string, { x: number; y: number; x2: number; y2: number }>())
  const loslassen = (): void => {
    griff.current = null
    window.removeEventListener('pointermove', bewegen)
    window.removeEventListener('pointerup', loslassen)
  }
  const anfassen = (e: React.PointerEvent, o: BlattObjekt, art: 'schieben' | 'groesse'): void => {
    if (p.gesperrt) return
    e.preventDefault()
    e.stopPropagation()
    griff.current = { id: o.id, art, px: e.clientX, py: e.clientY, o, h: hoeheVon(o) }
    linienStart.current = new Map(eigene.filter((x) => x.t === 'linie').map((x) => [x.id, { x: x.x, y: x.y, x2: x.x2 ?? x.x, y2: x.y2 ?? x.y }]))
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', loslassen)
  }
  useEffect(() => loslassen, []) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Rechtsklick (überall, auch über der Stift-Ebene) und langes Drücken (Touch/Stift; nicht beim Schreiben mit dem
   * Stift oder Textmarker) öffnen das Optionsmenü des Objekts unter dem Zeiger.
   */
  const trefferRef = useRef(trefferBei)
  trefferRef.current = trefferBei
  const imBlatt = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const r = flaeche.current?.getBoundingClientRect()
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null
      return { x: ((e.clientX - r.left) / r.width) * p.lage.w, y: ((e.clientY - r.top) / r.height) * p.lage.h }
    },
    [p.lage.w, p.lage.h]
  )
  const werkzeugRef = useRef(p.werkzeug)
  werkzeugRef.current = p.werkzeug
  useEffect(() => {
    if (p.gesperrt) return
    const rechts = (e: MouseEvent): void => {
      const q = imBlatt(e)
      if (!q) return
      // Rechtsklick im Textfeld eines Kästchens: dort bleibt das Menü des Browsers (Rechtschreibung), außer leer
      const o = trefferRef.current(q)
      if (!o) return
      e.preventDefault()
      setMenue({ id: o.id, x: e.clientX, y: e.clientY })
    }
    let uhr: ReturnType<typeof setTimeout> | null = null
    let start: { x: number; y: number } | null = null
    const stop = (): void => {
      if (uhr) clearTimeout(uhr)
      uhr = null
      start = null
    }
    const runter = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' || werkzeugRef.current === 'stift' || werkzeugRef.current === 'marker') return
      const q = imBlatt(e)
      if (!q) return
      const o = trefferRef.current(q)
      if (!o) return
      start = { x: e.clientX, y: e.clientY }
      const { clientX, clientY } = e
      uhr = setTimeout(() => {
        uhr = null
        // Ein angefangenes Ziehen abbrechen – das Menü übernimmt
        griff.current = null
        setZieht(null)
        setMenue({ id: o.id, x: clientX, y: clientY })
      }, 550)
    }
    const bewegt = (e: PointerEvent): void => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) stop()
    }
    window.addEventListener('contextmenu', rechts)
    window.addEventListener('pointerdown', runter, true)
    window.addEventListener('pointermove', bewegt, true)
    window.addEventListener('pointerup', stop, true)
    window.addEventListener('pointercancel', stop, true)
    return () => {
      stop()
      window.removeEventListener('contextmenu', rechts)
      window.removeEventListener('pointerdown', runter, true)
      window.removeEventListener('pointermove', bewegt, true)
      window.removeEventListener('pointerup', stop, true)
      window.removeEventListener('pointercancel', stop, true)
    }
  }, [p.gesperrt, imBlatt])

  const andocken = p.andocken ?? []
  const menueObjekt = menue ? eigene.find((o) => o.id === menue.id) : undefined
  const frageObjekt = loeschFrage ? eigene.find((o) => o.id === loeschFrage) : undefined
  const reihenfolge = (id: string, vorne: boolean): void => {
    const o = eigene.find((x) => x.id === id)
    if (!o) return
    const rest = eigene.filter((x) => x.id !== id)
    setzeEigene(vorne ? [...rest, o] : [o, ...rest])
  }
  const MENUE_TITEL: Record<BlattObjekt['t'], string> = { text: 'Textkästchen', linie: 'Verbindungslinie', form: 'Form', punkt: 'Punkt' }
  return (
    <div
      ref={flaeche}
      style={{
        position: 'absolute',
        left: p.lage.x,
        top: p.lage.y,
        width: p.lage.w,
        height: p.lage.h,
        zIndex: 12,
        // Radierer: die Fläche lässt durch (Stift-Ebene darunter radiert); Linien, Punkte, Kästchen fangen selbst
        pointerEvents: linieAktiv ? 'auto' : 'none',
        touchAction: linieAktiv ? 'none' : 'auto'
      }}
      data-objekte={p.seite}
      onPointerDown={(e) => {
        // Nur die Haupttaste zeichnet – die rechte öffnet das Optionsmenü
        if (!linieAktiv || e.button !== 0 || (e.target as HTMLElement).closest('[data-objekt-text]')) return
        const q = punkt(e)
        if (p.werkzeug === 'form') {
          flaeche.current!.setPointerCapture(e.pointerId)
          setFormZug({ x: q.x, y: q.y, x2: q.x, y2: q.y })
          return
        }
        if (p.werkzeug === 'text') {
          const id = neueId()
          setzeEigene([
            ...eigene,
            klemmen({ id, s: p.seite, t: 'text', x: q.x, y: q.y - 12, w: 170, text: '', farbe: p.farbe, ...p.vorgabe?.text }, KASTEN_MIN_H)
          ])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'punkt') {
          const id = neueId()
          const r = einrasten(q, andocken, [])
          setzeEigene([...eigene, { id, s: p.seite, t: 'punkt', x: r?.x ?? q.x, y: r?.y ?? q.y, text: '', farbe: p.farbe, ...p.vorgabe?.punkt }])
          setFokus(id)
          return
        }
        if (p.werkzeug === 'linie') {
          flaeche.current!.setPointerCapture(e.pointerId)
          const r = einrasten(q, andocken, kaesten())
          const a = r ?? q
          setZieht({ x: a.x, y: a.y, x2: a.x, y2: a.y, ...(r?.kasten ? { v1: r.kasten } : {}), ...(r?.wert ? { jahr1: r.wert } : {}) })
          setZiel(r ? { x: r.x, y: r.y, wert: r.wert } : null)
        }
      }}
      onPointerMove={(e) => {
        if (formZug) {
          const q = punkt(e)
          setFormZug({ ...formZug, x2: q.x, y2: q.y })
          return
        }
        if (p.werkzeug !== 'linie' || !linieAktiv) return
        const q = punkt(e)
        const r = einrasten(q, andocken, kaesten())
        setZiel(r ? { x: r.x, y: r.y, wert: r.wert } : null)
        if (!zieht) return
        const { v2: _alt, jahr2: _j, ...rest } = zieht
        setZieht({ ...rest, x2: r?.x ?? q.x, y2: r?.y ?? q.y, ...(r?.kasten ? { v2: r.kasten } : {}), ...(r?.wert ? { jahr2: r.wert } : {}) })
      }}
      onPointerLeave={() => !zieht && setZiel(null)}
      onPointerUp={() => {
        if (formZug) {
          const f = p.form ?? 'rechteck'
          const w0 = Math.abs(formZug.x2 - formZug.x)
          const h0 = Math.abs(formZug.y2 - formZug.y)
          // Nur angetippt: Standardgröße, mittig um die Stelle
          const klein = w0 < 12 && h0 < 12
          const { w, h } = formMasse(f, klein ? 90 : Math.max(12, w0), klein ? (f === 'quadrat' || f === 'kreis' ? 90 : 64) : Math.max(12, h0))
          const x = klein ? formZug.x - w / 2 : Math.min(formZug.x, formZug.x2)
          const y = klein ? formZug.y - h / 2 : Math.min(formZug.y, formZug.y2)
          setzeEigene([
            ...eigene,
            {
              id: neueId(),
              s: p.seite,
              t: 'form',
              f,
              x: Math.max(1, Math.min(p.lage.w - w - 1, x)),
              y: Math.max(1, Math.min(p.lage.h - h - 1, y)),
              w,
              h,
              farbe: p.farbe,
              ...p.vorgabe?.form
            }
          ])
          setFormZug(null)
          return
        }
        if (!zieht) return
        if (Math.hypot(zieht.x2 - zieht.x, zieht.y2 - zieht.y) > 8)
          setzeEigene([...eigene, { id: neueId(), s: p.seite, t: 'linie', ...zieht, farbe: p.farbe, ...p.vorgabe?.linie }])
        setZieht(null)
        setZiel(null)
      }}
    >
      <svg width={p.lage.w} height={p.lage.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {/* Linie-Werkzeug: Andockpunkte des Blatts zart zeigen, den gerade gewählten deutlich */}
        {p.werkzeug === 'linie' &&
          !p.gesperrt &&
          andocken.map((a, i) =>
            a.art === 'punkt' ? <circle key={`a${i}`} cx={a.x} cy={a.y} r={2.4} fill="none" stroke="#0ca678" strokeOpacity={0.55} strokeWidth={1} /> : null
          )}
        {ziel && <circle cx={ziel.x} cy={ziel.y} r={7} fill="rgba(12,166,120,0.18)" stroke="#0ca678" strokeWidth={2} data-andock-ziel />}
        {/* Jahr live beim Ziehen (06.10.2026) – über dem Finger, damit er es nicht verdeckt; Hilfslinie zur Stelle */}
        {ziel?.wert && (
          <g data-jahr-blase={ziel.wert} style={{ pointerEvents: 'none' }}>
            <line x1={ziel.x} y1={ziel.y - 8} x2={ziel.x} y2={ziel.y - 34} stroke="#0ca678" strokeWidth={1.5} strokeDasharray="2 2" />
            <rect
              x={ziel.x - Math.max(26, ziel.wert.length * 5.2)}
              y={ziel.y - 62}
              width={Math.max(52, ziel.wert.length * 10.4)}
              height={28}
              rx={14}
              fill="#0ca678"
            />
            <text x={ziel.x} y={ziel.y - 42.5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#fff" fontFamily="system-ui, sans-serif">
              {ziel.wert}
            </text>
          </g>
        )}
        {/* Formen (05.10.2026): beim Radieren antippbar */}
        {[
          ...eigene.filter((o) => o.t === 'form'),
          ...(formZug
            ? [
                {
                  id: 'neu',
                  s: p.seite,
                  t: 'form' as const,
                  f: p.form ?? 'rechteck',
                  x: Math.min(formZug.x, formZug.x2),
                  y: Math.min(formZug.y, formZug.y2),
                  w: Math.max(4, Math.abs(formZug.x2 - formZug.x)),
                  h: Math.max(4, Math.abs(formZug.y2 - formZug.y)),
                  farbe: p.farbe
                }
              ]
            : [])
        ].map((o) => {
          const g = formGeometrie(o.f ?? 'rechteck', o.x, o.y, o.w ?? 90, o.h ?? 70)
          const sw = staerkeVon(o)
          const muster = strichMuster(o.linienArt, sw)
          const stil = {
            fill: radiert ? 'rgba(220,38,38,0.08)' : (o.fuellung ?? 'none'),
            stroke: o.rand ?? o.farbe ?? '#1d4ed8',
            strokeWidth: sw,
            strokeLinejoin: 'round' as const,
            ...(muster ? { strokeDasharray: muster, strokeLinecap: 'round' as const } : {}),
            ...(radiert && o.id !== 'neu' ? { pointerEvents: 'all' as const, cursor: 'pointer' } : {})
          }
          const weg = radiert && o.id !== 'neu' ? (e: React.PointerEvent): void => (e.stopPropagation(), entfernen(o.id)) : undefined
          return g.art === 'ellipse' ? (
            <ellipse key={o.id} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} style={stil} onPointerDown={weg} data-objekt-form={o.f} />
          ) : (
            <polygon key={o.id} points={g.points} style={stil} onPointerDown={weg} data-objekt-form={o.f} />
          )
        })}
        {[
          ...eigene.filter((o) => o.t === 'linie'),
          ...(zieht ? [{ id: 'neu', s: p.seite, t: 'linie' as const, ...zieht, farbe: p.farbe, ...p.vorgabe?.linie }] : [])
        ].map((o) => (
          <g key={o.id} data-objekt-linie>
            {radiert && o.id !== 'neu' && (
              <line
                x1={o.x}
                y1={o.y}
                x2={o.x2}
                y2={o.y2}
                stroke="transparent"
                strokeWidth={18}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  entfernen(o.id)
                }}
                data-radier-linie
              />
            )}
            {/* Linie, Enden/Pfeilspitzen und Jahreszahlen wie im Druck (shared/blattObjekte.ts) */}
            <g dangerouslySetInnerHTML={{ __html: linieSvg(o) }} />
          </g>
        ))}
        {eigene
          .filter((o) => o.t === 'punkt')
          .map((o) => (
            <circle
              key={o.id}
              cx={o.x}
              cy={o.y}
              r={radiert ? 9 : 4.5}
              fill={o.farbe ?? '#1d4ed8'}
              fillOpacity={radiert ? 0.5 : 1}
              style={radiert ? { pointerEvents: 'all', cursor: 'pointer' } : undefined}
              onPointerDown={
                radiert
                  ? (e) => {
                      e.stopPropagation()
                      entfernen(o.id)
                    }
                  : undefined
              }
              data-objekt-punkt
            />
          ))}
      </svg>
      {eigene
        .filter((o) => o.t === 'punkt')
        .map((o) => (
          <input
            key={o.id}
            value={o.text ?? ''}
            disabled={p.gesperrt}
            data-objekt-id={o.id}
            placeholder="Wert"
            onChange={(e) => setzeEigene(eigene.map((x) => (x.id === o.id ? { ...x, text: e.currentTarget.value } : x)))}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: o.x + 8,
              top: o.y - 22,
              width: Math.max(44, ((o.text ?? '').length + 2) * 8),
              height: 20,
              fontSize: 13,
              border: (o.text ?? '') ? '0' : '1px dashed #94a3b8',
              background: 'rgba(255,255,255,0.85)',
              color: o.farbe ?? '#1d4ed8',
              padding: '0 3px',
              pointerEvents: radiert ? 'none' : 'auto'
            }}
            data-objekt-text
          />
        ))}
      {eigene
        .filter((o) => o.t === 'text')
        .map((roh) => {
          // Auch ältere Kästchen außerhalb der Seite wieder hereinholen (sonst weder sichtbar noch greifbar)
          const o = klemmen(roh, roh.h ?? KASTEN_MIN_H)
          const farbe = o.farbe ?? '#1d4ed8'
          const randFarbe = o.rand ?? farbe
          const schrift = schriftVon(o)
          return (
            <div
              key={o.id}
              style={{ position: 'absolute', left: o.x, top: o.y, width: o.w ?? 170, ...(o.h ? { height: o.h } : {}), pointerEvents: 'auto' }}
              data-objekt-text
              data-kasten={o.id}
              onPointerDown={(e) => {
                e.stopPropagation()
                // Radierer: Kästchen antippen entfernt es (beschriftet nur nach Rückfrage, 06.10.2026)
                if (radiert) bitteLoeschen(roh)
              }}
            >
              <textarea
                value={o.text ?? ''}
                disabled={p.gesperrt}
                readOnly={radiert}
                data-objekt-id={o.id}
                onChange={(e) => {
                  const t = e.currentTarget
                  const text = t.value
                  // Wächst mit dem Text, schrumpft aber nicht unter die gezogene Höhe
                  t.style.height = 'auto'
                  const noetig = t.scrollHeight + 2
                  t.style.height = ''
                  setzeEigene(eigene.map((x) => (x.id === o.id ? { ...x, text, ...(noetig > (x.h ?? 0) ? { h: Math.min(900, noetig) } : {}) } : x)))
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: KASTEN_MIN_H,
                  resize: 'none',
                  overflow: 'hidden',
                  fontSize: schrift.size,
                  lineHeight: `${schrift.zeile}px`,
                  fontWeight: o.fett ? 700 : undefined,
                  padding: '4px 5px',
                  border: `${staerkeVon(o)}px ${randStil(o.linienArt)} ${randFarbe}`,
                  borderRadius: 4,
                  background: o.fuellung ? `${o.fuellung}eb` : 'rgba(255,255,255,0.92)',
                  color: o.textFarbe ?? farbe,
                  fontFamily: 'system-ui, sans-serif',
                  display: 'block',
                  cursor: radiert ? 'pointer' : undefined
                }}
                data-kaestchen={o.id}
              />
              {!p.gesperrt && !radiert && (
                <>
                  {/* Anfassen zum Verschieben (oben links) */}
                  <div
                    role="button"
                    aria-label="Kästchen verschieben"
                    onPointerDown={(e) => anfassen(e, o, 'schieben')}
                    style={{ ...GRIFF, left: -11, top: -11, cursor: 'move', borderColor: randFarbe }}
                    data-kasten-schieben={o.id}
                  >
                    <IconArrowsMove size={12} color={farbe} />
                  </div>
                  {/* Ziehen für Breite und Höhe (unten rechts) */}
                  <div
                    role="button"
                    aria-label="Kästchen größer oder kleiner ziehen"
                    onPointerDown={(e) => anfassen(e, o, 'groesse')}
                    style={{ ...GRIFF, right: -9, bottom: -9, width: 18, height: 18, cursor: 'nwse-resize', borderColor: randFarbe }}
                    data-kasten-groesse={o.id}
                  >
                    <IconArrowsDiagonal2 size={10} color={farbe} />
                  </div>
                  <button
                    type="button"
                    aria-label="Kästchen entfernen"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => bitteLoeschen(roh)}
                    style={{ ...GRIFF, right: -9, top: -9, width: 18, height: 18, cursor: 'pointer' }}
                    data-kasten-weg={o.id}
                  >
                    <IconX size={11} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      {menue && menueObjekt && (
        <KontextMenue x={menue.x} y={menue.y} titel={MENUE_TITEL[menueObjekt.t]} schliessen={() => setMenue(null)}>
          <OptionenInhalt
            art={menueObjekt.t}
            wert={menueObjekt}
            mitJahr={Boolean(menueObjekt.jahr1 || menueObjekt.jahr2)}
            aendern={(patch) => aendereObjekt(menueObjekt.id, patch)}
            aktionen={{
              duplizieren: () => {
                const { v1: _a, v2: _b, ...kopie } = menueObjekt
                const d = 14
                setzeEigene([
                  ...eigene,
                  {
                    ...kopie,
                    id: neueId(),
                    x: kopie.x + d,
                    y: kopie.y + d,
                    ...(kopie.t === 'linie' ? { x2: (kopie.x2 ?? kopie.x) + d, y2: (kopie.y2 ?? kopie.y) + d, jahr1: undefined, jahr2: undefined } : {})
                  }
                ])
                setMenue(null)
              },
              vorne: () => reihenfolge(menueObjekt.id, true),
              hinten: () => reihenfolge(menueObjekt.id, false),
              loeschen: () => {
                setMenue(null)
                bitteLoeschen(menueObjekt)
              }
            }}
          />
        </KontextMenue>
      )}
      {frageObjekt && (
        <LoeschFrage
          text={frageObjekt.text ?? ''}
          ja={() => {
            entfernen(frageObjekt.id)
            setLoeschFrage(null)
          }}
          nein={() => setLoeschFrage(null)}
        />
      )}
    </div>
  )
}

const GRIFF: React.CSSProperties = {
  position: 'absolute',
  width: 22,
  height: 22,
  borderRadius: 11,
  border: '1px solid #94a3b8',
  background: '#fff',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  zIndex: 2
}
