/**
 * Neue Aufgabenformate der Grammatik (28.10.2026, Grammatik-Neubeginn – abgestimmt mit der Lehrkraft nach Recherche:
 * Fachdidaktik, Übungsseiten wie ego4u/Lingolia/englisch-hilfen, Ausarbeitung aller 119 englischen Formen):
 *  - Lückentext (auch Dialog): kurzer Text mit mehreren Lücken – der Zusammenhang legt die Form fest; je Lücke Grundwort
 *    bzw. Auswahl, auf Wunsch ein Wortkasten (jedes Wort passt einmal).
 *  - Sätze verbinden / Frage bilden: ganze Sätze tippen, Bindewort bzw. Fragewort und ggf. Satzanfang vorgegeben.
 *  - Markieren: im Text alle Formen antippen (Erkennen).
 *  - Sortieren: Beispiele in Gruppen ziehen (Erkennen, Unterscheiden).
 * Groß und antippbar (Handy, iPad). Die Prüfung steht in shared/grammatiktrainer.ts `pruefeGrammatik`.
 */
import { Badge, Button, Group, NativeSelect, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useMemo, useRef, useState } from 'react'
import { normiert, woerterVon, type GrammatikAufgabe, satzanfang } from '@shared/grammatiktrainer'
import type { Urteil } from '@shared/vokabeltrainer'

type Antworten = (antwort: string, wort?: string, selbst?: Urteil) => void
const mische = <T,>(l: readonly T[]): T[] => [...l].map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x)

/** Vorlauf (Situation, Zeit) über der Aufgabe – kursiv, damit klar ist: das ist Zusammenhang, keine Aufgabe */
export function KontextZeile({ a }: { a: GrammatikAufgabe }): React.JSX.Element | null {
  if (!a.kontext) return null
  return (
    <Paper withBorder radius="md" p="sm" style={{ background: 'var(--vt-a-hell, transparent)' }} data-kontext>
      <Text fs="italic" style={{ whiteSpace: 'pre-wrap' }}>
        {a.kontext}
      </Text>
    </Paper>
  )
}

export function LueckentextAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const luecken = a.luecken ?? []
  const [werte, setWerte] = useState<string[]>(() => luecken.map(() => ''))
  const teile = a.satz.split('___')
  const optionen = useMemo(() => luecken.map((l) => (l.optionen?.length ? mische(l.optionen) : [])), [a]) // eslint-disable-line react-hooks/exhaustive-deps
  const setze = (i: number, w: string): void => setWerte((v) => v.map((x, k) => (k === i ? w : x)))
  const fertig = werte.every((w) => w.trim())
  return (
    <Stack gap="sm" data-lueckentext>
      {a.wortkasten?.length ? (
        <Group gap={6} data-wortkasten>
          {a.wortkasten.map((w) => (
            <Badge key={w} size="lg" variant="light" tt="none">
              {w}
            </Badge>
          ))}
        </Group>
      ) : null}
      <Text fz={18} style={{ lineHeight: 2.3, whiteSpace: 'pre-wrap' }}>
        {teile.map((t, i) => (
          <span key={i}>
            {t}
            {i < luecken.length && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
                <Text span size="xs" c="dimmed">
                  {i + 1}
                </Text>
                {optionen[i].length ? (
                  <NativeSelect
                    size="sm"
                    data={['', ...optionen[i]]}
                    value={werte[i]}
                    onChange={(e) => setze(i, e.currentTarget.value)}
                    disabled={gesperrt}
                    style={{ display: 'inline-block', minWidth: 110 }}
                    data-luecke-nr={i}
                  />
                ) : (
                  <TextInput
                    size="sm"
                    value={werte[i]}
                    onChange={(e) => setze(i, e.currentTarget.value)}
                    disabled={gesperrt}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    w={Math.max(110, (luecken[i].loesungen[0]?.length ?? 6) * 12)}
                    style={{ display: 'inline-block' }}
                    data-luecke-nr={i}
                  />
                )}
                {luecken[i].vorgabe && (
                  <Text span size="sm" c="var(--vt-a)">
                    {luecken[i].vorgabe}
                  </Text>
                )}
              </span>
            )}
          </span>
        ))}
      </Text>
      <Button w="fit-content" disabled={gesperrt || !fertig} onClick={() => antworten(JSON.stringify(werte))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}

/** Sätze verbinden bzw. Frage bilden: ganze Sätze tippen; Bindewort/Fragewort und Satzanfang stehen dabei */
export function SatzAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const [text, setText] = useState('')
  const absenden = (): void => {
    if (gesperrt || !text.trim()) return
    // Hat das Kind den vorgegebenen Anfang überlesen und mitgetippt, nicht noch einmal davorsetzen (29.10.2026)
    const anfang = satzanfang(a.anfang)
    antworten(anfang && !normiert(text).startsWith(normiert(anfang)) ? `${anfang} ${text.trim()}` : text.trim())
  }
  return (
    <form onSubmit={(e) => (e.preventDefault(), absenden())} data-satzaufgabe={a.art}>
      <Text fz={20} fw={600} style={{ whiteSpace: 'pre-wrap' }}>
        {a.art === 'frage' ? `Antwort: ${a.satz}` : a.satz}
      </Text>
      {a.vorgabe && (
        <Text c="var(--vt-a)" mt={4}>
          {a.vorgabe}
        </Text>
      )}
      <Group mt="sm" gap={6} wrap="nowrap" align="center">
        {a.anfang && (
          <Text fz={18} fw={600} style={{ whiteSpace: 'nowrap' }} data-satzanfang>
            {satzanfang(a.anfang)}
          </Text>
        )}
        <TextInput
          size="lg"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          disabled={gesperrt}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{ flex: 1 }}
          data-satz-eingabe
        />
      </Group>
      <Button mt="sm" type="submit" disabled={gesperrt || !text.trim()} data-pruefen>
        Prüfen
      </Button>
    </form>
  )
}

export function MarkierenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const woerter = woerterVon(a.satz)
  const [an, setAn] = useState<number[]>([])
  const ziele = new Set(a.ziele ?? [])
  return (
    <Stack gap="sm" data-markieren>
      <Group gap={6}>
        {woerter.map((w, i) => {
          const gewaehlt = an.includes(i)
          const farbe = gesperrt ? (ziele.has(i) ? 'green' : gewaehlt ? 'red' : undefined) : gewaehlt ? undefined : undefined
          return (
            <Button
              key={i}
              size="md"
              variant={gewaehlt || (gesperrt && ziele.has(i)) ? 'filled' : 'default'}
              color={farbe}
              onClick={() => !gesperrt && setAn(gewaehlt ? an.filter((x) => x !== i) : [...an, i])}
              data-markier-wort={w}
            >
              {w}
            </Button>
          )
        })}
      </Group>
      <Button w="fit-content" disabled={gesperrt || !an.length} onClick={() => antworten(JSON.stringify(an))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}

/**
 * Lange Elemente (ganze Sätze, Durchlauf der Bank 28.10.2026): Knöpfe brechen um statt über den Rand zu ragen – sonst
 * ließen sie sich am Telefon nicht antippen
 */
export const UMBRUCH = {
  root: { height: 'auto', minHeight: 36, maxWidth: '100%', paddingTop: 6, paddingBottom: 6 },
  label: { whiteSpace: 'normal' as const, textAlign: 'left' as const, lineHeight: 1.3 }
}

/**
 * Spalten für Auswahlknöpfe (29.10.2026, Befund der Lehrkraft: „Jack, who is our class captain will speak firs" – der Rest
 * des Satzes war abgeschnitten): ganze Sätze untereinander in voller Breite, kurze Formen nebeneinander
 */
export const auswahlSpalten = (optionen: readonly string[]): number => (optionen.some((o) => o.length > 24) ? 1 : 2)

/**
 * Sortieren (28.10.2026) – seit 29.10.2026 (Wunsch der Lehrkraft) auch per Drag-and-drop: Wort mit Maus oder Finger
 * festhalten und in eine Gruppe ziehen; über der Wortleiste losgelassen, kommt es zurück. Antippen und dann die Gruppe
 * wählen geht weiter. Pointer-Ereignisse – gleich für Maus, Stift und Finger; die Wörter selbst scrollen nicht mit
 * (touch-action: none), die Seite daneben schon.
 */
const ZIEH_SCHWELLE = 6

export function SortierenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const elemente = a.elemente ?? []
  const gruppen = a.gruppen ?? []
  const reihenfolge = useMemo(() => mische(elemente.map((_, i) => i)), [a]) // eslint-disable-line react-hooks/exhaustive-deps
  const [wahl, setWahl] = useState<(number | null)[]>(() => elemente.map(() => null))
  const [aktiv, setAktiv] = useState<number | null>(null)
  // Ziehen: welches Element, wo der Zeiger ist, über welcher Gruppe (-1 = Wortleiste, null = nirgends)
  const [zug, setZug] = useState<{ i: number; x: number; y: number; ueber: number | null } | null>(null)
  const start = useRef<{ i: number; x: number; y: number; id: number; zieht: boolean } | null>(null)
  const nachZug = useRef(false)
  const setze = (i: number, g: number | null): void => setWahl((w) => w.map((x, j) => (j === i ? g : x)))
  const zuteilen = (g: number): void => {
    if (aktiv === null || gesperrt) return
    setze(aktiv, g)
    setAktiv(null)
  }
  /** Gruppe unter dem Zeiger: Index, -1 für die Wortleiste, null für nichts */
  const ziel = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-sortier-gruppe], [data-sortier-leiste]')
    if (!el) return null
    if (el.hasAttribute('data-sortier-leiste')) return -1
    const k = gruppen.indexOf(el.getAttribute('data-sortier-gruppe') ?? '')
    return k >= 0 ? k : null
  }
  const ziehbar = (i: number): React.HTMLAttributes<HTMLElement> => ({
    onPointerDown: (e) => {
      if (gesperrt || e.button > 0) return
      start.current = { i, x: e.clientX, y: e.clientY, id: e.pointerId, zieht: false }
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    onPointerMove: (e) => {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      if (!s.zieht && Math.hypot(e.clientX - s.x, e.clientY - s.y) < ZIEH_SCHWELLE) return
      s.zieht = true
      setZug({ i: s.i, x: e.clientX, y: e.clientY, ueber: ziel(e.clientX, e.clientY) })
    },
    onPointerUp: (e) => {
      const s = start.current
      start.current = null
      if (!s || !s.zieht) return
      const k = ziel(e.clientX, e.clientY)
      if (k !== null) setze(s.i, k >= 0 ? k : null)
      setZug(null)
      setAktiv(null)
      // Den folgenden Klick (Antippen) nach einem Zug nicht werten
      nachZug.current = true
      setTimeout(() => (nachZug.current = false), 0)
    },
    onPointerCancel: () => {
      start.current = null
      setZug(null)
    },
    style: { touchAction: 'none', cursor: gesperrt ? undefined : 'grab', opacity: zug?.i === i ? 0.4 : undefined }
  })
  const offen = reihenfolge.filter((i) => wahl[i] === null)
  const hell = (k: number): React.CSSProperties =>
    zug?.ueber === k ? { outline: '2px solid var(--mantine-primary-color-filled)', background: 'var(--mantine-primary-color-light)' } : {}
  return (
    <Stack gap="sm" data-sortieren>
      <Text size="sm" c="dimmed">
        Wörter in die passende Gruppe ziehen – oder antippen und dann die Gruppe wählen.
      </Text>
      <Group gap={6} mih={40} p={4} style={{ borderRadius: 8, ...hell(-1) }} data-sortier-leiste>
        {offen.map((i) => (
          <Button
            key={i}
            variant={aktiv === i ? 'filled' : 'default'}
            disabled={gesperrt}
            onClick={() => !nachZug.current && setAktiv(aktiv === i ? null : i)}
            styles={UMBRUCH}
            data-sortier-element={elemente[i].text}
            {...ziehbar(i)}
          >
            {elemente[i].text}
          </Button>
        ))}
      </Group>
      <SimpleGrid cols={{ base: 1, xs: Math.min(3, gruppen.length) }}>
        {gruppen.map((g, k) => (
          <Paper
            key={k}
            withBorder
            radius="md"
            p="sm"
            onClick={() => zuteilen(k)}
            style={{ cursor: aktiv !== null ? 'pointer' : 'default', minHeight: 80, ...hell(k) }}
            data-sortier-gruppe={g}
          >
            <Text fw={700} mb={6}>
              {g}
            </Text>
            <Group gap={4}>
              {reihenfolge
                .filter((i) => wahl[i] === k)
                .map((i) => (
                  <Button
                    key={i}
                    size="xs"
                    variant="light"
                    color={gesperrt ? (elemente[i].gruppe === k ? 'green' : 'red') : undefined}
                    disabled={gesperrt}
                    onClick={(e) => (e.stopPropagation(), !nachZug.current && setze(i, null))}
                    styles={UMBRUCH}
                    data-sortier-eingeordnet={elemente[i].text}
                    {...ziehbar(i)}
                  >
                    {elemente[i].text}
                  </Button>
                ))}
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      {/* Das gezogene Wort folgt dem Zeiger */}
      {zug && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: zug.x,
            top: zug.y,
            transform: 'translate(-50%, -60%)',
            pointerEvents: 'none',
            zIndex: 1000,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'var(--mantine-primary-color-filled)',
            color: 'var(--mantine-primary-color-contrast)',
            fontWeight: 600,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            maxWidth: 320
          }}
          data-sortier-zug
        >
          {elemente[zug.i].text}
        </div>
      )}
      <Button w="fit-content" disabled={gesperrt || offen.length > 0} onClick={() => antworten(JSON.stringify(wahl))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}
