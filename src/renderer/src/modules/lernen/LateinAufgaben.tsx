/**
 * Aufgabenarten für Latein im Grammatiktraining (07.10.2026, abgestimmt mit der Lehrkraft – Regeln in
 * shared/grammatiktrainer.ts): Bestimmen (alle Lesarten, Teilpunkte), Mehrfachauswahl, Paradigma-Tabelle, Übersetzen
 * mit Selbstvergleich. Groß und antippbar (Handy, iPad); Längenzeichen werden angezeigt, bei der Eingabe nicht verlangt.
 */
import { Button, Chip, Group, Paper, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { normiert, type GrammatikAufgabe, type Lesart } from '@shared/grammatiktrainer'
import type { Urteil } from '@shared/vokabeltrainer'

type Antworten = (antwort: string, wort?: string, selbst?: Urteil) => void

/** Die Form im Satz hervorheben (bestimmen mit Satz) */
function SatzMitForm({ satz, form }: { satz: string; form: string }): React.JSX.Element {
  const i = normiert(satz).indexOf(normiert(form))
  if (!form || i < 0) return <>{satz}</>
  // Stelle im Originaltext über die Wortgrenzen finden (normiert ändert die Länge nur bei Längenzeichen)
  const woerter = satz.split(/(\s+)/)
  return (
    <>
      {woerter.map((w, k) =>
        normiert(w.replace(/[.,;:!?]/g, '')) === normiert(form) ? (
          <Text key={k} span c="var(--vt-a)" fw={800} td="underline">
            {w}
          </Text>
        ) : (
          <span key={k}>{w}</span>
        )
      )}
    </>
  )
}

export function BestimmenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const merkmale = a.merkmale ?? []
  const imSatz = Boolean(a.satz && a.form && normiert(a.satz).includes(normiert(a.form)))
  const leer = (): Lesart => merkmale.map(() => '')
  const [lesarten, setLesarten] = useState<Lesart[]>([leer()])
  const setze = (i: number, j: number, wert: string): void => setLesarten((l) => l.map((x, k) => (k === i ? x.map((w, m) => (m === j ? wert : w)) : x)))
  const vollstaendig = lesarten.every((l) => l.every(Boolean))
  return (
    <Stack gap="sm" data-bestimmen>
      {imSatz ? (
        <Text fz={20} fw={600}>
          <SatzMitForm satz={a.satz} form={a.form!} />
        </Text>
      ) : (
        <Text fz={28} fw={800} c="var(--vt-a)" data-bestimmen-form>
          {a.form}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {imSatz ? 'Bestimme die Form so, wie sie im Satz steht.' : 'Gib alle Möglichkeiten an – manche Formen sind mehrdeutig.'}
      </Text>
      {lesarten.map((l, i) => (
        <Paper key={i} withBorder radius="md" p="xs" data-lesart={i}>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={600}>
              {lesarten.length > 1 ? `Möglichkeit ${i + 1}` : 'Bestimmung'}
            </Text>
            {lesarten.length > 1 && !gesperrt && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={12} />}
                onClick={() => setLesarten(lesarten.filter((_, k) => k !== i))}
              >
                Entfernen
              </Button>
            )}
          </Group>
          <Stack gap={6}>
            {merkmale.map((m, j) => (
              <Group key={m} gap={6} wrap="wrap" align="center">
                <Text size="xs" c="dimmed" w={86}>
                  {m}
                </Text>
                <Chip.Group value={l[j]} onChange={(v) => !gesperrt && setze(i, j, String(v))}>
                  <Group gap={4}>
                    {(a.werte?.[j] ?? []).map((w) => (
                      <Chip key={w} value={w} size="sm" radius="sm" disabled={gesperrt} data-wert={w}>
                        {w}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Group>
            ))}
          </Stack>
        </Paper>
      ))}
      <Group>
        {!imSatz && lesarten.length < 6 && (
          <Button
            variant="light"
            leftSection={<IconPlus size={14} />}
            disabled={gesperrt}
            onClick={() => setLesarten([...lesarten, leer()])}
            data-weitere-lesart
          >
            Weitere Möglichkeit
          </Button>
        )}
        <Button disabled={gesperrt || !vollstaendig} onClick={() => antworten(JSON.stringify(lesarten))} data-pruefen>
          Prüfen
        </Button>
      </Group>
    </Stack>
  )
}

export function MehrfachAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const optionen = useMemo(() => [...(a.optionen ?? [])].sort(() => Math.random() - 0.5), [a])
  const [gewaehlt, setGewaehlt] = useState<string[]>([])
  const richtig = new Set(a.loesungen.map(normiert))
  return (
    <Stack gap="sm" data-mehrfach>
      {a.satz && (
        <Text fz={20} fw={600}>
          {a.satz}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Mehrere Antworten können richtig sein.
      </Text>
      <SimpleGrid cols={2}>
        {optionen.map((o) => {
          const an = gewaehlt.includes(o)
          const farbe = gesperrt ? (richtig.has(normiert(o)) ? 'green' : an ? 'red' : undefined) : undefined
          return (
            <Button
              key={o}
              size="lg"
              variant={an || (gesperrt && farbe === 'green') ? 'filled' : 'default'}
              color={farbe}
              onClick={() => !gesperrt && setGewaehlt(an ? gewaehlt.filter((x) => x !== o) : [...gewaehlt, o])}
              data-option={o}
              data-an={an || undefined}
            >
              {o}
            </Button>
          )
        })}
      </SimpleGrid>
      <Button w="fit-content" disabled={gesperrt || !gewaehlt.length} onClick={() => antworten(JSON.stringify(gewaehlt))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}

/** Eine Variante oder die ganze Zelle („was/were") – wie die Prüfung in shared/grammatiktrainer.ts */
const zelleRichtig = (loesung: string, antwort: string): boolean =>
  normiert(loesung.replace(/\s*\/\s*/g, '/')) === normiert(antwort.replace(/\s*\/\s*/g, '/')) ||
  loesung.split('/').some((v) => normiert(v) === normiert(antwort))

export function TabellenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const zeilen = a.zeilen ?? []
  const [zellen, setZellen] = useState<string[][]>(() => zeilen.map((z) => z.loesungen.map((l, j) => (z.vorgabe?.[j] ? l : ''))))
  const offen = zeilen.some((z, i) => z.loesungen.some((l, j) => l && !z.vorgabe?.[j] && !zellen[i]?.[j]?.trim()))
  return (
    <Stack gap="sm" data-tabelle>
      {a.satz && (
        <Text fz={18} fw={600}>
          {a.satz}
        </Text>
      )}
      <Table withTableBorder withColumnBorders verticalSpacing={4} horizontalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            {(a.spalten ?? []).map((s) => (
              <Table.Th key={s}>{s}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {zeilen.map((z, i) => (
            <Table.Tr key={z.name + i}>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {z.name}
                </Text>
              </Table.Td>
              {z.loesungen.map((l, j) => (
                <Table.Td key={j}>
                  {z.vorgabe?.[j] ? (
                    <Text size="sm">{l}</Text>
                  ) : gesperrt ? (
                    <Text size="sm" c={zelleRichtig(l, zellen[i]?.[j] ?? '') ? 'green' : 'red'}>
                      {zellen[i]?.[j] || '–'}
                      {zelleRichtig(l, zellen[i]?.[j] ?? '') ? '' : ` → ${l}`}
                    </Text>
                  ) : (
                    <TextInput
                      size="sm"
                      value={zellen[i]?.[j] ?? ''}
                      onChange={(e) => {
                        const v = e.currentTarget.value
                        setZellen((alt) => alt.map((x, k) => (k === i ? x.map((w, m) => (m === j ? v : w)) : x)))
                      }}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-label={`${z.name}, ${a.spalten?.[j] ?? ''}`}
                      data-zelle={`${i}-${j}`}
                    />
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Button w="fit-content" disabled={gesperrt || offen} onClick={() => antworten(JSON.stringify(zellen))} data-pruefen>
        Prüfen
      </Button>
    </Stack>
  )
}

export function UebersetzenAufgabe({ a, gesperrt, antworten }: { a: GrammatikAufgabe; gesperrt: boolean; antworten: Antworten }): React.JSX.Element {
  const [text, setText] = useState('')
  const [vergleich, setVergleich] = useState(false)
  const pruefen = (): void => {
    if (!text.trim() || gesperrt) return
    // Wörtlich wie eine Musterlösung: gleich werten lassen; sonst selbst vergleichen
    if (a.loesungen.some((l) => normiert(l) === normiert(text))) return antworten(text)
    setVergleich(true)
  }
  return (
    <Stack gap="sm" data-uebersetzen>
      <Text fz={22} fw={700} c="var(--vt-a)">
        {a.satz}
      </Text>
      <Textarea
        autosize
        minRows={2}
        size="md"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        disabled={gesperrt || vergleich}
        placeholder="Deine Übersetzung"
        data-uebersetzen-eingabe
      />
      {!vergleich ? (
        <Button w="fit-content" disabled={gesperrt || !text.trim()} onClick={pruefen} data-pruefen>
          Prüfen
        </Button>
      ) : (
        <Paper withBorder radius="md" p="sm" data-selbstvergleich>
          <Text size="sm" fw={600}>
            Vergleiche mit der Musterlösung:
          </Text>
          {a.loesungen.map((l) => (
            <Text key={l} size="sm">
              → {l}
            </Text>
          ))}
          {!gesperrt && (
            <Group mt="sm" gap="xs">
              <Button color="green" onClick={() => antworten(text, undefined, 'richtig')} data-selbst="richtig">
                Stimmt
              </Button>
              <Button color="yellow" onClick={() => antworten(text, undefined, 'fast')} data-selbst="fast">
                Fast
              </Button>
              <Button color="red" variant="light" onClick={() => antworten(text, undefined, 'falsch')} data-selbst="falsch">
                Stimmt nicht
              </Button>
            </Group>
          )}
        </Paper>
      )}
    </Stack>
  )
}

/** Kurzfassung einer Latein-Aufgabe für die Sichtung der Lehrkraft (Entwurf) */
export function lateinVorschau(a: GrammatikAufgabe): { aufgabe: string; loesung: string } | null {
  if (a.art === 'bestimmen')
    return {
      aufgabe: `${a.form}${a.satz ? ` (im Satz: ${a.satz})` : ''} – ${(a.merkmale ?? []).join(', ')}`,
      loesung: (a.lesarten ?? []).map((l) => l.join(' ')).join(' / ')
    }
  if (a.art === 'mehrfach') return { aufgabe: `${a.satz} [${(a.optionen ?? []).join(' | ')}]`, loesung: a.loesungen.join(' | ') }
  if (a.art === 'tabelle')
    return {
      aufgabe: `${a.satz || 'Tabelle'} (${(a.spalten ?? []).join(' | ')})`,
      loesung: (a.zeilen ?? []).map((z) => `${z.name}: ${z.loesungen.map((l, j) => (z.vorgabe?.[j] ? `[${l}]` : l)).join(' | ')}`).join('; ')
    }
  return null
}
