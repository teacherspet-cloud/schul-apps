/**
 * Ein Antwortfeld mit Handschrift (02.10.2026, abgestimmt mit der Lehrkraft).
 *
 *  - Schreiben in die Schreibfläche; nach kurzem Absetzen erkennt die KI die Schrift (schnell,
 *    damit die Lernenden prüfen können) und der Text erscheint als WORTKÄRTCHEN („erkannt als").
 *  - Bearbeiten mitten im Satz:
 *      Wort antippen → neu schreiben (ersetzt) · „+" zwischen zwei Wörtern → Wort einfügen ·
 *      Kärtchen gedrückt halten und ziehen → verschieben
 *    und mit Korrekturzeichen direkt über den Kärtchen (tinte.ts):
 *      durchkritzeln oder durchstreichen → löschen · ∧ → einfügen · Kreis → ersetzen
 *  - Rückgängig, Radierer, Leeren, vergrößerte Schreibfläche, Wechsel zur Tastatur.
 *  - Keine Rechtschreibhilfe: Die Erkennung schreibt buchstabengetreu ab (handschrift.ts), die
 *    Tastatur ist ohne Autokorrektur und Rechtschreibprüfung.
 */
import { ActionIcon, Badge, Button, Group, Loader, Modal, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconEraser, IconKeyboard, IconMaximize, IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { woerterVon, type Erkennung } from './handschrift'
import { Schreibflaeche, type Werkzeug } from './Schreibflaeche'
import { geste, rahmen, schriftbild, type Strich } from './tinte'

interface Karte {
  id: string
  text: string
  unsicher?: boolean
}

type Erkennen = (segment: string, png: string) => Promise<Erkennung>

const neueId = (): string => Math.random().toString(36).slice(2, 10)
const alsKarten = (text: string, unsicher = false): Karte[] => woerterVon(text).map((t) => ({ id: neueId(), text: t, ...(unsicher ? { unsicher } : {}) }))

const KEINE_HILFE = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false } as const

export function HandFeld({
  feld,
  wert,
  setze,
  erkenne,
  lang,
  beschriftung,
  zurTastatur
}: {
  feld: string
  wert: string
  setze: (feld: string, wert: string) => void
  erkenne: Erkennen
  /** Langer Text (Sätze): höhere Schreibfläche */
  lang?: boolean
  beschriftung?: string
  zurTastatur: () => void
}): React.JSX.Element {
  const [karten, setKarten] = useState<Karte[]>(() => alsKarten(wert))
  const [striche, setStriche] = useState<Strich[]>([])
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('stift')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const [fenster, setFenster] = useState<null | { art: 'einfuegen'; pos: number } | { art: 'ersetzen'; index: number } | { art: 'anhaengen' }>(null)
  const verlauf = useRef<{ karten: Karte[]; striche: Strich[] }[]>([])
  const stand = useRef({ karten, striche })
  stand.current = { karten, striche }

  // Die Antwort ist der Satz aus den Kärtchen
  useEffect(() => {
    setze(feld, karten.map((k) => k.text).join(' '))
    // setze/feld sind fest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karten])

  const merke = (): void => {
    verlauf.current.push({ karten: stand.current.karten, striche: stand.current.striche })
    if (verlauf.current.length > 60) verlauf.current.shift()
  }
  const aendereKarten = (neu: Karte[]): void => {
    merke()
    setKarten(neu)
  }
  const rueckgaengig = (): void => {
    const v = verlauf.current.pop()
    if (!v) return
    setKarten(v.karten)
    setStriche(v.striche)
  }

  /** Schrift der Schreibfläche erkennen und als Kärtchen anhängen */
  const erkenneHaupt = useCallback(async (): Promise<void> => {
    const s = stand.current.striche
    if (!s.length || laeuftRef.current) return
    const png = schriftbild(s)
    if (!png) return
    laeuftRef.current = true
    setLaeuft(true)
    setFehler('')
    try {
      const e = await erkenne(neueId(), png)
      merke()
      // Nur die erkannten Striche entfernen – was inzwischen dazukam, bleibt für die nächste Runde
      setStriche((jetzt) => jetzt.slice(s.length))
      setKarten((k) => [...k, ...alsKarten(e.text, e.unsicher)])
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
    } finally {
      laeuftRef.current = false
      setLaeuft(false)
    }
    // erkenne ist fest je Teilnahme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const laeuftRef = useRef(false)

  return (
    <Stack gap={4} data-handfeld={feld}>
      {beschriftung && (
        <Text size="sm" fw={500}>
          {beschriftung}
        </Text>
      )}
      {karten.length > 0 && (
        <KartenZeile
          karten={karten}
          aendern={aendereKarten}
          oeffne={(f) => setFenster(f)}
        />
      )}
      <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, background: 'var(--mantine-color-body)' }}>
        <Schreibflaeche
          striche={striche}
          onChange={(s) => {
            merke()
            setStriche(s)
          }}
          hoehe={lang ? 150 : 84}
          werkzeug={werkzeug}
          onRuhe={() => void erkenneHaupt()}
          beschriftung={karten.length ? 'weiterschreiben …' : 'hier schreiben …'}
        />
      </div>
      <Group gap={4} justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Stift">
            <ActionIcon variant={werkzeug === 'stift' ? 'filled' : 'subtle'} onClick={() => setWerkzeug('stift')} aria-label="Stift" size="lg">
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Radierer">
            <ActionIcon variant={werkzeug === 'radierer' ? 'filled' : 'subtle'} onClick={() => setWerkzeug('radierer')} aria-label="Radierer" size="lg" data-radierer>
              <IconEraser size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Rückgängig">
            <ActionIcon variant="subtle" onClick={rueckgaengig} aria-label="Rückgängig" size="lg" data-rueckgaengig>
              <IconArrowBackUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Feld leeren">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                merke()
                setStriche([])
                setKarten([])
              }}
              aria-label="Feld leeren"
              size="lg"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Größer schreiben">
            <ActionIcon variant="subtle" onClick={() => setFenster({ art: 'anhaengen' })} aria-label="Größer schreiben" size="lg" data-vergroessern>
              <IconMaximize size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap={6} wrap="nowrap">
          {laeuft && <Loader size="xs" />}
          <Tooltip label="Mit der Tastatur schreiben">
            <ActionIcon variant="subtle" onClick={zurTastatur} aria-label="Tastatur" size="lg">
              <IconKeyboard size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {fehler && (
        <Text size="xs" c="orange.8">
          Erkennung gerade nicht möglich – deine Schrift ist gespeichert, deine Lehrkraft kann sie lesen. ({fehler})
        </Text>
      )}
      {fenster && (
        <GrossesFeld
          titel={fenster.art === 'ersetzen' ? `„${karten[fenster.index]?.text ?? ''}“ ersetzen` : fenster.art === 'einfuegen' ? 'Wort einfügen' : 'Schreiben'}
          erkenne={erkenne}
          schliessen={() => setFenster(null)}
          uebernehmen={(e) => {
            const neu = alsKarten(e.text, e.unsicher)
            if (fenster.art === 'ersetzen') aendereKarten([...karten.slice(0, fenster.index), ...neu, ...karten.slice(fenster.index + 1)])
            else if (fenster.art === 'einfuegen') aendereKarten([...karten.slice(0, fenster.pos), ...neu, ...karten.slice(fenster.pos)])
            else aendereKarten([...karten, ...neu])
            setFenster(null)
          }}
        />
      )}
    </Stack>
  )
}

/**
 * Die erkannten Wörter als Kärtchen. Darüber liegt eine Ebene für Korrekturzeichen: Antippen
 * eines Kärtchens oder eines „+", Gedrückthalten zum Verschieben, sonst gezeichnete Zeichen.
 */
function KartenZeile({ karten, aendern, oeffne }: { karten: Karte[]; aendern: (k: Karte[]) => void; oeffne: (f: { art: 'einfuegen'; pos: number } | { art: 'ersetzen'; index: number }) => void }): React.JSX.Element {
  const huelle = useRef<HTMLDivElement>(null)
  const [strich, setStrich] = useState<[number, number][] | null>(null)
  const [zieht, setZieht] = useState<{ index: number; x: number; y: number } | null>(null)
  const druck = useRef<{ start: [number, number]; zeit: ReturnType<typeof setTimeout> | null; index: number | null } | null>(null)

  const punkt = (e: React.PointerEvent): [number, number] => {
    const r = huelle.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  /** Lage der Kärtchen und Lücken (+) relativ zur Zeile */
  const lage = (sel: string): { i: number; x: number; y: number; b: number; h: number }[] => {
    const r = huelle.current!.getBoundingClientRect()
    return [...huelle.current!.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const q = el.getBoundingClientRect()
      return { i: Number(el.dataset.i), x: q.left - r.left, y: q.top - r.top, b: q.width, h: q.height }
    })
  }
  const kartenLage = (): ReturnType<typeof lage> => lage('[data-karte]')
  const lueckenLage = (): ReturnType<typeof lage> => lage('[data-luecke]')
  const trifft = (p: [number, number], l: { x: number; y: number; b: number; h: number }, rand = 4): boolean =>
    p[0] >= l.x - rand && p[0] <= l.x + l.b + rand && p[1] >= l.y - rand && p[1] <= l.y + l.h + rand
  const naechsteLuecke = (p: [number, number]): number => {
    const ls = lueckenLage()
    let best = ls[0]
    for (const l of ls) if (Math.hypot(l.x + l.b / 2 - p[0], l.y + l.h / 2 - p[1]) < Math.hypot(best.x + best.b / 2 - p[0], best.y + best.h / 2 - p[1])) best = l
    return best?.i ?? karten.length
  }

  return (
    <div>
      <Text size="xs" c="dimmed" mb={2}>
        erkannt als:
      </Text>
      <div
        ref={huelle}
        style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: '4px 2px', touchAction: 'none', userSelect: 'none' }}
        data-kartenzeile
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = punkt(e)
          const karte = kartenLage().find((l) => trifft(p, l, 0))
          druck.current = {
            start: p,
            index: karte?.i ?? null,
            // Gedrückt halten → Kärtchen verschieben
            zeit: karte
              ? setTimeout(() => {
                  setStrich(null)
                  setZieht({ index: karte.i, x: p[0], y: p[1] })
                }, 450)
              : null
          }
          setStrich([p])
        }}
        onPointerMove={(e) => {
          const d = druck.current
          if (!d) return
          const p = punkt(e)
          if (zieht) return setZieht({ ...zieht, x: p[0], y: p[1] })
          if (d.zeit && Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > 8) {
            clearTimeout(d.zeit)
            d.zeit = null
          }
          setStrich((s) => (s ? [...s, p] : [p]))
        }}
        onPointerUp={(e) => {
          const d = druck.current
          druck.current = null
          if (d?.zeit) clearTimeout(d.zeit)
          const p = punkt(e)
          if (zieht) {
            // Ablegen: an der nächsten Lücke
            const ziel = naechsteLuecke(p)
            const k = [...karten]
            const [weg] = k.splice(zieht.index, 1)
            k.splice(ziel > zieht.index ? ziel - 1 : ziel, 0, weg)
            setZieht(null)
            aendern(k)
            return
          }
          const s = strich ?? []
          setStrich(null)
          const r = rahmen(s.length ? s : [p])
          // Antippen
          if (r.b < 8 && r.h < 8) {
            const luecke = lueckenLage().find((l) => trifft(p, l, 6))
            if (luecke) return oeffne({ art: 'einfuegen', pos: luecke.i })
            const karte = kartenLage().find((l) => trifft(p, l))
            if (karte) return oeffne({ art: 'ersetzen', index: karte.i })
            return
          }
          // Korrekturzeichen
          const g = geste(s)
          const ueber = kartenLage().filter((l) => {
            const b = Math.max(0, Math.min(r.x + r.b, l.x + l.b) - Math.max(r.x, l.x))
            const h = Math.max(0, Math.min(r.y + r.h, l.y + l.h) - Math.max(r.y, l.y))
            return b > 0.4 * l.b && h > 0
          })
          if ((g === 'kritzeln' || g === 'streichen') && ueber.length) {
            const weg = new Set(ueber.map((l) => l.i))
            aendern(karten.filter((_, i) => !weg.has(i)))
          } else if (g === 'einfuegen') {
            // Spitze des ∧ zeigt auf die Stelle
            const spitze = s.reduce((a, q) => (q[1] < a[1] ? q : a), s[0])
            oeffne({ art: 'einfuegen', pos: naechsteLuecke([spitze[0], r.y]) })
          } else if (g === 'kreis' && ueber.length) oeffne({ art: 'ersetzen', index: ueber[0].i })
        }}
        onPointerCancel={() => {
          druck.current = null
          setStrich(null)
          setZieht(null)
        }}
      >
        <Luecke i={0} />
        {karten.map((k, i) => (
          <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Badge
              data-karte
              data-i={i}
              size="xl"
              radius="sm"
              variant={zieht?.index === i ? 'filled' : 'light'}
              color={k.unsicher ? 'orange' : 'blue'}
              style={{ textTransform: 'none', fontSize: 18, fontWeight: 600, height: 38, cursor: 'pointer', opacity: zieht?.index === i ? 0.5 : 1 }}
              title={k.unsicher ? 'Nicht sicher erkannt – bitte prüfen' : undefined}
            >
              {k.text}
            </Badge>
            <Luecke i={i + 1} />
          </span>
        ))}
        {strich && strich.length > 1 && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <polyline points={strich.map((q) => q.join(',')).join(' ')} fill="none" stroke="rgba(224,49,49,0.85)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {zieht && (
          <div style={{ position: 'absolute', left: zieht.x - 30, top: zieht.y - 20, pointerEvents: 'none' }}>
            <Badge size="xl" radius="sm" style={{ textTransform: 'none', fontSize: 18, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
              {karten[zieht.index]?.text}
            </Badge>
          </div>
        )}
      </div>
      <Text size="xs" c="dimmed">
        Wort antippen = ersetzen · + = einfügen · gedrückt halten und ziehen = verschieben · durchstreichen oder durchkritzeln = löschen · ∧ = einfügen
      </Text>
    </div>
  )
}

function Luecke({ i }: { i: number }): React.JSX.Element {
  return (
    <span
      data-luecke
      data-i={i}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 30, color: 'var(--mantine-color-dimmed)', fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}
      aria-label="Hier einfügen"
    >
      +
    </span>
  )
}

/** Vergrößerte Schreibfläche: Einfügen, Ersetzen oder einfach größer schreiben */
function GrossesFeld({ titel, erkenne, schliessen, uebernehmen }: { titel: string; erkenne: Erkennen; schliessen: () => void; uebernehmen: (e: Erkennung) => void }): React.JSX.Element {
  const [striche, setStriche] = useState<Strich[]>([])
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('stift')
  const [ergebnis, setErgebnis] = useState<Erkennung | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const verlauf = useRef<Strich[][]>([])
  const aktuell = useRef(striche)
  aktuell.current = striche
  const erkennen = async (): Promise<Erkennung | null> => {
    const png = schriftbild(aktuell.current)
    if (!png) return null
    setLaeuft(true)
    setFehler('')
    try {
      const e = await erkenne(neueId(), png)
      setErgebnis(e)
      return e
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title={titel} size="xl" centered data-grosses-feld>
      <Stack gap="xs">
        <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
          <Schreibflaeche
            striche={striche}
            onChange={(s) => {
              verlauf.current.push(striche)
              setStriche(s)
              setErgebnis(null)
            }}
            hoehe={220}
            werkzeug={werkzeug}
            onRuhe={() => void erkennen()}
            beschriftung="hier schreiben …"
          />
        </div>
        <Group justify="space-between">
          <Group gap={4}>
            <ActionIcon variant={werkzeug === 'stift' ? 'filled' : 'subtle'} onClick={() => setWerkzeug('stift')} aria-label="Stift" size="lg">
              <IconPencil size={18} />
            </ActionIcon>
            <ActionIcon variant={werkzeug === 'radierer' ? 'filled' : 'subtle'} onClick={() => setWerkzeug('radierer')} aria-label="Radierer" size="lg">
              <IconEraser size={18} />
            </ActionIcon>
            <ActionIcon variant="subtle" onClick={() => setStriche(verlauf.current.pop() ?? [])} aria-label="Rückgängig" size="lg">
              <IconArrowBackUp size={18} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                verlauf.current.push(striche)
                setStriche([])
                setErgebnis(null)
              }}
              aria-label="Leeren"
              size="lg"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
          <Group gap="xs">
            {laeuft ? (
              <Loader size="sm" />
            ) : ergebnis ? (
              <Text size="lg" fw={600} c={ergebnis.unsicher ? 'orange.8' : undefined} data-erkannt>
                erkannt als: {ergebnis.text || '—'}
              </Text>
            ) : null}
          </Group>
        </Group>
        {fehler && (
          <Text size="xs" c="orange.8">
            Erkennung gerade nicht möglich ({fehler})
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            disabled={!striche.length || laeuft}
            onClick={() =>
              void (async () => {
                const e = ergebnis ?? (await erkennen())
                if (e) uebernehmen(e)
              })()
            }
            data-uebernehmen
          >
            Übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Tastatur-Feld ohne jede Schreibhilfe; ein Stift auf dem Feld wechselt zur Schreibfläche (statt Scribble) */
export function TastaturFeld({
  wert,
  onChange,
  lang,
  beschriftung,
  placeholder,
  zumStift
}: {
  wert: string
  onChange: (w: string) => void
  lang?: boolean
  beschriftung?: string
  placeholder?: string
  zumStift?: () => void
}): React.JSX.Element {
  const stift = zumStift
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType !== 'pen') return
          // Apple Scribble & Co. korrigieren die Rechtschreibung – mit dem Stift geht es in die eigene Schreibfläche
          e.preventDefault()
          zumStift()
        }
      }
    : {}
  return (
    <Group gap={4} align="end" wrap="nowrap">
      {lang ? (
        <Textarea_ value={wert} onChange={onChange} beschriftung={beschriftung} {...stift} />
      ) : (
        <TextInput style={{ flex: 1 }} value={wert} onChange={(e) => onChange(e.currentTarget.value)} label={beschriftung} placeholder={placeholder} size="md" {...KEINE_HILFE} {...stift} />
      )}
      {zumStift && (
        <Tooltip label="Mit dem Stift schreiben">
          <ActionIcon variant="subtle" size="lg" mb={4} onClick={zumStift} aria-label="Mit dem Stift schreiben" data-zum-stift>
            <IconPencil size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  )
}

function Textarea_({ value, onChange, beschriftung, onPointerDown }: { value: string; onChange: (w: string) => void; beschriftung?: string; onPointerDown?: (e: React.PointerEvent) => void }): React.JSX.Element {
  return (
    <div style={{ flex: 1 }}>
      {beschriftung && (
        <Text size="sm" fw={500}>
          {beschriftung}
        </Text>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onPointerDown={onPointerDown}
        rows={3}
        style={{ width: '100%', font: 'inherit', fontSize: 16, padding: 8, borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)', color: 'inherit', resize: 'vertical' }}
        {...KEINE_HILFE}
      />
    </div>
  )
}
