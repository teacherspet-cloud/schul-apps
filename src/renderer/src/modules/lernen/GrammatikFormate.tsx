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
import { useMemo, useState } from 'react'
import { woerterVon, type GrammatikAufgabe, satzanfang } from '@shared/grammatiktrainer'
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
    antworten(satzanfang(a.anfang) ? `${satzanfang(a.anfang)} ${text.trim()}` : text.trim())
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
const UMBRUCH = {
  root: { height: 'auto', minHeight: 36, maxWidth: '100%', paddingTop: 6, paddingBottom: 6 },
  label: { whiteSpace: 'normal' as const, textAlign: 'left' as const, lineHeight: 1.3 }
}

export function SortierenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const elemente = a.elemente ?? []
  const gruppen = a.gruppen ?? []
  const reihenfolge = useMemo(() => mische(elemente.map((_, i) => i)), [a]) // eslint-disable-line react-hooks/exhaustive-deps
  const [wahl, setWahl] = useState<(number | null)[]>(() => elemente.map(() => null))
  const [aktiv, setAktiv] = useState<number | null>(null)
  const zuteilen = (g: number): void => {
    if (aktiv === null || gesperrt) return
    setWahl((w) => w.map((x, i) => (i === aktiv ? g : x)))
    setAktiv(null)
  }
  const offen = reihenfolge.filter((i) => wahl[i] === null)
  return (
    <Stack gap="sm" data-sortieren>
      <Text size="sm" c="dimmed">
        Antippen, dann die Gruppe wählen.
      </Text>
      <Group gap={6}>
        {offen.map((i) => (
          <Button
            key={i}
            variant={aktiv === i ? 'filled' : 'default'}
            disabled={gesperrt}
            onClick={() => setAktiv(aktiv === i ? null : i)}
            styles={UMBRUCH}
            data-sortier-element={elemente[i].text}
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
            style={{ cursor: aktiv !== null ? 'pointer' : 'default', minHeight: 80 }}
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
                    onClick={(e) => (e.stopPropagation(), setWahl((w) => w.map((x, j) => (j === i ? null : x))))}
                    styles={UMBRUCH}
                  >
                    {elemente[i].text}
                  </Button>
                ))}
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Button w="fit-content" disabled={gesperrt || offen.length > 0} onClick={() => antworten(JSON.stringify(wahl))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}
