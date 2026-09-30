import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconArrowsMove, IconDots, IconLayoutAlignTop, IconLayoutDistributeHorizontal } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { PlacedItem } from './paginate'
import type { WsBlock } from '../model/types'

/**
 * Rahmen um einen Baustein im Editor: Anfassen, Ziehen, Ordnen.
 *
 * Gemeinsam für Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und Grammatiktest – die vier
 * zeigen dasselbe Blatt über `SheetPages`, sollen sich also auch gleich bedienen lassen.
 *
 * ZIEHEN nimmt den Baustein aus dem automatischen Satz heraus und legt ihn fest auf die
 * Seite. Das ist ausdrücklich gewünscht („frei platzieren"), hat aber einen Preis: Ein frei
 * liegender Baustein schiebt nichts mehr weiter und kann anderen Inhalt überdecken. Deshalb
 * gilt es nur für den einen gezogenen Baustein, und „wieder einreihen" holt ihn zurück.
 */

/** Maße der Seite, auf der gerade gezogen wird. */
interface Ziel {
  body: HTMLElement
  seite: number
}

/** Welche Seite liegt unter diesem Punkt? Der Messbereich der App zählt nicht mit. */
function zielUnter(x: number, y: number): Ziel | null {
  const treffer = document.elementsFromPoint(x, y).find((e) => e.classList.contains('ws-body') && !e.closest('.ws-measure'))
  if (!treffer) return null
  const seiten = [...document.querySelectorAll('.ws-page')].filter((p) => !p.closest('.ws-measure'))
  const seite = treffer.closest('.ws-page')
  const index = seite ? seiten.indexOf(seite) : -1
  return index < 0 ? null : { body: treffer as HTMLElement, seite: index + 1 }
}

/** Rollt mit, wenn der Finger an den oberen oder unteren Rand kommt. */
function mitrollen(y: number): void {
  const roller = document.querySelector<HTMLElement>('.editor-canvas .mantine-ScrollArea-viewport')
  if (!roller) return
  const r = roller.getBoundingClientRect()
  const rand = 70
  if (y < r.top + rand) roller.scrollTop -= Math.ceil((r.top + rand - y) / 6)
  else if (y > r.bottom - rand) roller.scrollTop += Math.ceil((y - (r.bottom - rand)) / 6)
}

/**
 * So weit muss der Zeiger wandern, bevor aus dem Anfassen ein Verschieben wird.
 *
 * Acht Punkte sind dieselbe Schwelle, mit der das lange Druecken eine Wischbewegung erkennt –
 * darunter liegt jeder gewoehnliche Klick, auch ein zittriger.
 */
const ZIEH_SCHWELLE = 8

export function BausteinRahmen({
  block,
  placed,
  children,
  extras,
  onUpdate,
  onMove,
  menue,
  busy
}: {
  block: WsBlock
  placed: PlacedItem
  children: React.ReactNode
  /** Zusätzliche Knöpfe des jeweiligen Programms (KI, Löschen, Einstellungen …) */
  extras?: React.ReactNode
  /**
   * Ändert den Baustein – Lage beim Ziehen, Anordnung über das Menü.
   * `gruppe` kennzeichnet eine Geste: Alle Änderungen eines Zuges sind EIN Verlaufsschritt.
   */
  onUpdate: (fn: (d: WsBlock) => void, gruppe?: string) => void
  /** Eine Stelle nach oben (-1) oder unten (+1); fehlt, wenn das Programm es nicht kann */
  onMove?: (richtung: -1 | 1) => void
  /**
   * Einträge des „⋯“-Menüs (Menu.Item) für seltene Aktionen – Duplizieren, darüber/darunter
   * einfügen, Löschen … (Paket 6: vorher stand jede Aktion als eigenes Symbol am Rand, bis zu
   * zehn übereinander). Fehlt es, gibt es kein „⋯“.
   */
  menue?: React.ReactNode
  busy?: boolean
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  // Abstand zwischen Fingerspitze und linker oberer Ecke – sonst springt der Baustein
  const griff = useRef<{ dx: number; dy: number; breite: number } | null>(null)
  const halten = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  /*
   * ANGEKLICKT: Die Werkzeugleiste erscheint sonst nur beim Überfahren (editor.css). Ein Klick
   * in den Baustein hält sie offen, bis irgendwo anders geklickt wird – auch auf dem Tablet,
   * wo es kein Überfahren gibt. Klicks in ein aufgeklapptes Menü oder Pop-up (Mantine-Portal
   * außerhalb des Bausteins) gelten als „drinnen“, sonst schlösse die Leiste beim Auswählen.
   */
  const [aktiv, setAktiv] = useState(false)
  const leiste = useRef<HTMLDivElement>(null)

  /*
   * Die Leiste bleibt auf der Seite (26.09.2026).
   *
   * Sie hängt 6 mm unter der Oberkante des Bausteins und ist bei kurzen Bausteinen länger
   * als er. Am unteren Seitenrand ragte sie damit aus der Seite und wurde abgeschnitten
   * (`clip-path` der Inhaltsfläche) – die unteren Knöpfe waren nicht zu erreichen. Vor dem
   * Einblenden wird deshalb gemessen und die Leiste so weit nach oben gerückt, dass sie ganz
   * auf der Seite steht; notfalls beginnt sie über dem Baustein.
   */
  const ausrichten = (): void => {
    const t = leiste.current
    const seite = box.current?.closest<HTMLElement>('.ws-page')
    const rahmen = box.current
    if (!t || !seite || !rahmen) return
    t.style.top = ''
    const tr = t.getBoundingClientRect()
    const sr = seite.getBoundingClientRect()
    const br = rahmen.getBoundingClientRect()
    const rand = 8
    const ueberhang = tr.bottom - (sr.bottom - rand)
    if (ueberhang <= 0) return
    const hoechstensHoch = sr.top + rand - br.top
    t.style.top = `${Math.max(hoechstensHoch, t.offsetTop - ueberhang)}px`
  }
  useEffect(() => {
    if (aktiv) ausrichten()
  })
  useEffect(() => {
    if (!aktiv) return
    const draussen = (e: PointerEvent): void => {
      const ziel = e.target as HTMLElement | null
      if (!ziel || box.current?.contains(ziel)) return
      if (ziel.closest('.mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Modal-root, .mantine-Tooltip-tooltip')) return
      setAktiv(false)
    }
    document.addEventListener('pointerdown', draussen, true)
    return () => document.removeEventListener('pointerdown', draussen, true)
  }, [aktiv])

  const setzen = (ziel: Ziel, x: number, y: number, breite: number, geste: string): void =>
    onUpdate((d) => {
      d.free = {
        page: ziel.seite,
        // Nicht über den Rand hinaus – ein Baustein außerhalb des Blattes wäre unauffindbar
        x: Math.round(Math.min(100 - breite, Math.max(0, x))),
        y: Math.round(Math.min(98, Math.max(0, y))),
        width: breite
      }
    }, geste)

  /*
   * Die Verfolgung hängt am FENSTER, nicht am Baustein.
   *
   * Beim ersten Anfassen verlässt der Baustein den Fluss und wird neu aufgebaut. Hingen die
   * Zeigerereignisse an ihm, risse die Verfolgung genau dann ab – der Baustein blieb an der
   * Stelle liegen, an der er angefasst wurde, und ließ sich nicht bewegen. Genau das hat die
   * Wache `tests/e2e/ziehen.mjs` gefunden.
   */
  const beginnen = (x: number, y: number, vomGriff = false): void => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ziel = zielUnter(x, y) ?? zielUnter(r.left + r.width / 2, r.top + 4)
    if (!ziel) return
    const b = ziel.body.getBoundingClientRect()
    const breite = block.free?.width ?? Math.min(100, Math.max(15, Math.round((r.width / b.width) * 100)))
    /*
     * Wo hängt der Baustein am Finger?
     *
     * Beim langen Drücken bleibt der Punkt erhalten, an dem angefasst wurde – der Baustein
     * wandert genau mit. Der ANFASSKNOPF sitzt dagegen 40 Punkte neben dem Baustein; würde
     * man diesen Abstand beibehalten, liefe der Baustein weit links vom Finger hinterher und
     * verschwände bei einem Zug nach links sofort am Blattrand. Deshalb hängt er dann an
     * seiner linken oberen Ecke.
     */
    griff.current = vomGriff ? { dx: Math.min(24, r.width / 2), dy: Math.min(20, r.height / 2), breite } : { dx: x - r.left, dy: y - r.top, breite }

    /*
     * Der Baustein verlaesst den Fluss erst, wenn der Zeiger sich WIRKLICH bewegt.
     *
     * Gemeldet am 25.09.2026: „Ich habe im Menü ‚Bearbeiten & Export' in ein Textfeld geklickt
     * (ohne etwas zu ändern darin)" – danach stand das ganze Blatt auf einer einzigen Seite
     * uebereinander. Ursache: Langes Druecken legte die freie Lage sofort an, ohne Bewegung.
     * Wer beim Klicken kurz zoegert, hat damit ungewollt verschoben; ein frei gelegter
     * Baustein wird aus der Seitenberechnung genommen und hat danach keine gemessene Hoehe
     * mehr – alles landet auf Seite 1 und laeuft unten heraus.
     */
    let laeuft = Boolean(block.free)
    const anfang = { x, y }
    /*
     * Jede Mausbewegung ändert die Lage – bis 25.09.2026 war das je ein Eintrag im Verlauf.
     * Ein Zug quer übers Blatt füllte ihn damit ganz, und Strg+Z führte nur Pixel für Pixel
     * zurück. Mit einer Kennung je Zug wird daraus ein einziger Schritt.
     */
    const geste = `ziehen:${block.id}:${Date.now()}`

    const bewegen = (ev: PointerEvent): void => {
      if (!griff.current) return
      if (!laeuft) {
        if (Math.abs(ev.clientX - anfang.x) < ZIEH_SCHWELLE && Math.abs(ev.clientY - anfang.y) < ZIEH_SCHWELLE) return
        laeuft = true
      }
      ev.preventDefault()
      mitrollen(ev.clientY)
      const z = zielUnter(ev.clientX, ev.clientY)
      if (!z) return
      const bb = z.body.getBoundingClientRect()
      setzen(
        z,
        ((ev.clientX - griff.current.dx - bb.left) / bb.width) * 100,
        ((ev.clientY - griff.current.dy - bb.top) / bb.height) * 100,
        griff.current.breite,
        geste
      )
    }
    const schluss = (): void => {
      griff.current = null
      window.removeEventListener('pointermove', bewegen)
      window.removeEventListener('pointerup', schluss)
      window.removeEventListener('pointercancel', schluss)
    }
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', schluss)
    window.addEventListener('pointercancel', schluss)
  }

  const abbrechen = (): void => {
    if (halten.current) window.clearTimeout(halten.current)
    halten.current = null
    start.current = null
  }

  /*
   * Langes Drücken als zweiter Weg (ausdrücklich gewünscht, 24.09.2026).
   *
   * Zwei Sicherungen, damit es nicht beim Lesen und Schreiben dazwischenfunkt: In Textfeldern
   * wird gar nicht erst gezählt, und wandert der Finger vorher mehr als acht Punkte, war es
   * eine Wischbewegung zum Rollen – dann wird abgebrochen.
   */
  const druckBeginn = (e: React.PointerEvent): void => {
    /*
     * Ein ZWEITER Finger heißt Zoomen (shared/touch/zoom.tsx), nicht Verschieben: Der Zug des
     * ersten Fingers wird abgebrochen. Vorher lief dessen Uhr weiter – der Baustein löste sich
     * beim Aufziehen mit zwei Fingern aus dem Fluss (30.09.2026).
     */
    if (!e.isPrimary) {
      abbrechen()
      return
    }
    /*
     * ACHTUNG: `[contenteditable="true"]` reicht NICHT. Die bearbeitbaren Texte dieser App
     * stehen auf `contenteditable="plaintext-only"` – mit der engeren Abfrage hätte langes
     * Drücken mitten im Schreiben den Baustein weggezogen.
     */
    const ziel = e.target as HTMLElement
    const editierbar = ziel.closest('[contenteditable]')
    /*
     * `.rt-editable` und `[role="textbox"]` gehoeren dazu: Ein formatierter Text traegt im
     * Ruhezustand GAR KEIN `contenteditable` – das entsteht erst durch den Klick, der das
     * Eingabefeld oeffnet. Die alte Abfrage lief dort ins Leere, und langes Druecken im Text
     * zog den Baustein aus dem Fluss (gemeldet 25.09.2026).
     */
    if (
      (editierbar && editierbar.getAttribute('contenteditable') !== 'false') ||
      ziel.closest('input, textarea, button, a, [role="textbox"], .rt-editable, .vt-editable')
    )
      return
    abbrechen()
    const x = e.clientX
    const y = e.clientY
    start.current = { x, y }
    halten.current = window.setTimeout(() => {
      halten.current = null
      beginnen(x, y)
    }, 400)
  }

  const druckBewegung = (e: React.PointerEvent): void => {
    if (!start.current || !halten.current) return
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) abbrechen()
  }

  return (
    <div
      ref={box}
      className={`editor-block ${busy ? 'editor-block-busy' : ''} ${block.free ? 'editor-block-frei' : ''} ${aktiv ? 'editor-block-aktiv' : ''}`}
      onPointerDown={(e) => {
        setAktiv(true)
        druckBeginn(e)
      }}
      onPointerEnter={ausrichten}
      onPointerMove={druckBewegung}
      onPointerUp={abbrechen}
      onPointerCancel={abbrechen}
    >
      {!placed.continued && (
        <div className="editor-block-toolbar" ref={leiste}>
          {/*
            Der Anfassknopf. Er ist bewusst groß (Fingerbreite) und trägt `touch-action: none`:
            Nur hier beginnt das Ziehen, überall sonst bleibt Wischen zum Rollen.
          */}
          <Tooltip label="Ziehen: frei auf der Seite platzieren" position="right">
            <ActionIcon
              size="sm"
              variant={block.free ? 'filled' : 'default'}
              className="editor-block-griff"
              aria-label="Baustein verschieben"
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                beginnen(e.clientX, e.clientY, true)
              }}
            >
              <IconArrowsMove size={14} />
            </ActionIcon>
          </Tooltip>
          {block.free && (
            <Tooltip label="Wieder in den Fluss einreihen" position="right">
              <ActionIcon size="sm" variant="default" aria-label="Wieder einreihen" onClick={() => onUpdate((d) => delete d.free)}>
                <IconLayoutAlignTop size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {/*
            ANORDNUNG für Bild und Tabelle – in allen vier Programmen an derselben Stelle.
            „daneben" heißt: Der folgende Baustein steht daneben und läuft darunter in voller
            Breite weiter. Frei platzierte Bausteine kennen keine Anordnung mehr.
          */}
          {(block.type === 'image' || block.type === 'table') && !block.free && (
            <Menu position="right-start" withArrow>
              <Menu.Target>
                <Tooltip label="Anordnung auf dem Blatt" position="right">
                  <ActionIcon size="sm" variant="default" aria-label="Anordnung">
                    <IconLayoutDistributeHorizontal size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Anordnung auf dem Blatt</Menu.Label>
                {(
                  [
                    ...(block.type === 'image' ? [{ wert: undefined, text: 'Automatisch' }] : []),
                    { wert: 'none' as const, text: 'Untereinander' },
                    { wert: 'left' as const, text: 'Links daneben' },
                    { wert: 'right' as const, text: 'Rechts daneben' }
                  ] as { wert: 'left' | 'right' | 'none' | undefined; text: string }[]
                ).map((o) => (
                  <Menu.Item
                    key={o.text}
                    fw={block.side === o.wert ? 700 : undefined}
                    onClick={() => onUpdate((d) => (d.type === 'image' || d.type === 'table' ? (d.side = o.wert) : undefined))}
                  >
                    {o.text}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
          {onMove && !block.free && (
            <>
              <Tooltip label="Nach oben" position="right">
                <ActionIcon size="sm" variant="default" aria-label="Nach oben" onClick={() => onMove(-1)}>
                  <IconArrowUp size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Nach unten" position="right">
                <ActionIcon size="sm" variant="default" aria-label="Nach unten" onClick={() => onMove(1)}>
                  <IconArrowDown size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          {extras}
          {menue && (
            <Menu position="left-start" withArrow shadow="md">
              <Menu.Target>
                <Tooltip label="Weitere Aktionen" position="right">
                  <ActionIcon size="sm" variant="default" aria-label="Weitere Aktionen">
                    <IconDots size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>{menue}</Menu.Dropdown>
            </Menu>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
