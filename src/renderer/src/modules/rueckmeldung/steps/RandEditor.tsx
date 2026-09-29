import { ActionIcon, Badge, Box, Button, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { Fragment } from 'react'
import type { Korrekturzeichen } from '../../../shared/korrekturzeichen'
import { newId } from '../../vokabeltest/model/random'
import { mitName } from '../ausgabe'
import { randLayout } from '../korrekturrand'
import type { Abgabe, RandKommentar } from '../model/types'

export const ART_FARBE: Record<RandKommentar['art'], string> = { fehler: '#c62828', lob: '#2e7d32', hinweis: '#1565c0' }
export const ARTEN = [
  { value: 'fehler', label: 'Fehler' },
  { value: 'lob', label: 'Lob' },
  { value: 'hinweis', label: 'Hinweis' }
]

/** Eine Zeile der Kommentarliste – für Korrekturrand und Scan gleich */
export function KommentarZeile({
  nr,
  k,
  zeichen,
  aendern,
  entfernen,
  mitZitat = true,
  gefunden = true
}: {
  nr: number
  k: RandKommentar
  zeichen: Korrekturzeichen[]
  aendern: (fn: (k: RandKommentar) => void, gruppe?: string) => void
  entfernen: () => void
  mitZitat?: boolean
  gefunden?: boolean
}): React.JSX.Element {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start" data-rand-kommentar>
      <Badge size="sm" circle style={{ background: ART_FARBE[k.art], flex: 'none' }} mt={4}>
        {nr}
      </Badge>
      <Stack gap={2} style={{ flex: 1 }}>
        <Group gap={4} wrap="nowrap">
          <Select
            size="xs"
            w={92}
            data={ARTEN}
            value={k.art}
            onChange={(v) => v && aendern((x) => (x.art = v as RandKommentar['art']))}
            allowDeselect={false}
            aria-label="Art"
          />
          <Select
            size="xs"
            w={86}
            placeholder="Zeichen"
            data={zeichen.filter((z) => z.zeichen).map((z) => ({ value: z.zeichen, label: z.zeichen }))}
            value={k.zeichen ?? null}
            onChange={(v) =>
              aendern((x) => {
                if (v) x.zeichen = v
                else delete x.zeichen
              })
            }
            clearable
            aria-label="Korrekturzeichen"
          />
          {mitZitat && (
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              value={k.zitat}
              placeholder="Textstelle (wörtlich)"
              error={!gefunden}
              onChange={(e) => {
                const v = e.currentTarget.value
                aendern((x) => (x.zitat = v), `zitat-${k.id}`)
              }}
              aria-label="Textstelle"
            />
          )}
          <ActionIcon size="sm" variant="subtle" color="red" onClick={entfernen} aria-label="Kommentar entfernen">
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
        <Textarea
          size="xs"
          autosize
          minRows={1}
          value={k.text}
          placeholder="Kommentar"
          onChange={(e) => {
            const v = e.currentTarget.value
            aendern((x) => (x.text = v), `text-${k.id}`)
          }}
          aria-label="Kommentar"
        />
        {!gefunden && (
          <Text size="xs" c="orange">
            Textstelle nicht im Text gefunden – der Kommentar steht im Ausdruck unter „Ohne Stelle im Text".
          </Text>
        )}
        {k.ohneWertung && (
          <Text size="xs" c="dimmed">
            Hinweis ohne Wertung (Notenschutz)
          </Text>
        )}
      </Stack>
    </Group>
  )
}

/**
 * Korrekturrand am digitalen Text (29.09.2026): links der Text mit markierten, nummerierten
 * Stellen, rechts die Kommentare – so, wie der Ausdruck aussieht. Darunter lassen sich die
 * Kommentare bearbeiten, ergänzen und löschen.
 */
export default function RandEditor({
  a,
  zeichen,
  setzeRand
}: {
  a: Abgabe
  zeichen: Korrekturzeichen[]
  setzeRand: (fn: (rand: RandKommentar[]) => void, gruppe?: string) => void
}): React.JSX.Element {
  const rand = a.bogen?.rand ?? []
  const n = (s: string): string => mitName(s, a)
  const layout = randLayout(n(a.text), rand, n)
  const ohne = new Set(layout.ohneStelle.map((g) => g.k.id))
  const nummer = new Map([...layout.absaetze.flatMap((x) => x.kommentare), ...layout.ohneStelle].map((g) => [g.k.id, g.nr]))

  return (
    <Stack gap="sm" data-rm-rand>
      <Box style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6, overflow: 'hidden' }}>
        {layout.absaetze.map((abs, i) => (
          <Group key={i} gap={0} wrap="nowrap" align="stretch" style={{ borderTop: i ? '1px solid var(--mantine-color-default-border)' : undefined }}>
            <Text size="sm" p="xs" style={{ flex: 2, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {abs.teile.map((t, j) =>
                t.art ? (
                  <Fragment key={j}>
                    <span style={{ textDecoration: 'underline', textDecorationColor: ART_FARBE[t.art], textDecorationThickness: 2, textUnderlineOffset: 3 }}>
                      {t.text}
                    </span>
                    {t.nr != null && <sup style={{ color: ART_FARBE[t.art], fontWeight: 700 }}>{t.nr}</sup>}
                  </Fragment>
                ) : (
                  <Fragment key={j}>{t.text}</Fragment>
                )
              )}
            </Text>
            <Stack gap={2} p="xs" style={{ flex: 1, background: 'var(--mantine-color-default-hover)' }}>
              {abs.kommentare.map((g) => (
                <Text key={g.k.id} size="xs">
                  <b style={{ color: ART_FARBE[g.k.art] }}>{g.nr}</b> {g.k.zeichen ? <b>{g.k.zeichen} </b> : null}
                  {n(g.k.text)}
                </Text>
              ))}
            </Stack>
          </Group>
        ))}
      </Box>
      <Text fw={600} size="sm">
        Kommentare bearbeiten
      </Text>
      {rand.map((k, i) => (
        <KommentarZeile
          key={k.id}
          nr={nummer.get(k.id) ?? i + 1}
          k={k}
          zeichen={zeichen}
          gefunden={!ohne.has(k.id)}
          aendern={(fn, gruppe) => setzeRand((r) => fn(r[i]), gruppe)}
          entfernen={() => setzeRand((r) => r.splice(i, 1))}
        />
      ))}
      <Button
        size="compact-xs"
        variant="subtle"
        w="fit-content"
        leftSection={<IconPlus size={12} />}
        onClick={() => setzeRand((r) => r.push({ id: newId(), zitat: '', text: '', art: 'hinweis' }))}
      >
        Kommentar hinzufügen
      </Button>
    </Stack>
  )
}
