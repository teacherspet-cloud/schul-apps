import { Badge, Button, CloseButton, Group, SegmentedControl, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { wahlGruppen, type WahlEintrag } from '../operatorenWahl'

/**
 * Operatoren vor der Erstellung auswählen – EINE Komponente für alle Programme (30.09.2026).
 *
 * Rückmeldung der Lehrkraft: Die Auswahl listete die Operatoren „unübersichtlich auf und auch
 * ungetrennt zwischen bilingual und normalem Fachunterricht". Deshalb:
 * - gruppiert nach Anforderungsbereich (bzw. Kompetenzbereich), alphabetisch innerhalb
 * - Erläuterung der Liste als Tooltip
 * - Suchfeld bei langen Listen
 * - die Auswahl oben, im Verzeichnis markiert
 * - Fachunterricht und bilingualer Unterricht getrennt umschaltbar
 * - Quelle und Stand klein darunter
 */

export interface BilingualUmschaltung {
  an: boolean
  sprache: string
  sprachen: { value: string; label: string }[]
  onChange: (an: boolean, sprache: string) => void
}

interface Props {
  eintraege: WahlEintrag[]
  gewaehlt: string[]
  onChange: (gewaehlt: string[]) => void
  quelle?: string
  stand?: string
  /** Nur in Sachfächern: Umschaltung Fachunterricht / bilingual */
  bilingual?: BilingualUmschaltung
  /** Text unter der Auswahl, je nach Zahl der gewählten Operatoren */
  auswahlText?: (anzahl: number) => string
}

const SUCHE_AB = 12

function tooltipText(e: WahlEintrag): string {
  return [
    e.definition,
    e.weitere.length ? `gleichwertig: ${e.weitere.join(', ')}` : '',
    e.deutsch.length ? `deutsch: ${e.deutsch.join(', ')}` : '',
    e.afb ? `Anforderungsbereich ${e.afb}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export default function OperatorenWahl({ eintraege, gewaehlt, onChange, quelle, stand, bilingual, auswahlText }: Props): React.JSX.Element {
  const [suche, setSuche] = useState('')
  const gruppen = useMemo(() => wahlGruppen(eintraege, suche), [eintraege, suche])
  const umschalten = (name: string): void => onChange(gewaehlt.includes(name) ? gewaehlt.filter((x) => x !== name) : [...gewaehlt, name])
  const text =
    auswahlText ??
    ((n: number): string => (n ? `${n} bevorzugt – als Vorschlag, nicht als Zwang` : 'Anklicken, um Operatoren für dieses Material vorzuschlagen'))

  return (
    <Stack gap={8}>
      {bilingual && (
        <Group gap="xs" wrap="nowrap" align="center">
          <SegmentedControl
            size="xs"
            aria-label="Unterrichtsform"
            value={bilingual.an ? 'bilingual' : 'fach'}
            onChange={(v) => bilingual.onChange(v === 'bilingual', bilingual.sprache)}
            data={[
              { value: 'fach', label: 'Fachunterricht' },
              { value: 'bilingual', label: 'bilingual' }
            ]}
          />
          {bilingual.an && (
            <Select
              size="xs"
              w={130}
              aria-label="Arbeitssprache"
              data={bilingual.sprachen}
              value={bilingual.sprache}
              allowDeselect={false}
              onChange={(v) => v && bilingual.onChange(true, v)}
            />
          )}
        </Group>
      )}
      {bilingual?.an && (
        <Text size="xs" c="dimmed">
          Bilingual: Sachfach in der Fremdsprache – nur die zielsprachigen Operatoren, getrennt von der deutschen Liste des Fachs.
        </Text>
      )}

      {/* Die Auswahl oben – abwählbar, ohne im Verzeichnis zu suchen */}
      {gewaehlt.length > 0 && (
        <Group gap={4} aria-label="Ausgewählte Operatoren">
          <Text size="xs" fw={600} mr={4}>
            Ausgewählt:
          </Text>
          {gewaehlt.map((n) => (
            <Badge
              key={n}
              size="sm"
              variant="filled"
              color="grape"
              tt="none"
              pr={2}
              rightSection={<CloseButton size="xs" variant="transparent" c="white" aria-label={`${n} abwählen`} onClick={() => umschalten(n)} />}
            >
              {n}
            </Badge>
          ))}
        </Group>
      )}

      {eintraege.length > SUCHE_AB && (
        <TextInput
          size="xs"
          placeholder="Operator suchen"
          aria-label="Operator suchen"
          leftSection={<IconSearch size={14} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          rightSection={suche ? <CloseButton size="xs" aria-label="Suche leeren" onClick={() => setSuche('')} /> : null}
        />
      )}

      {gruppen.map((g) => (
        <div key={g.titel}>
          <Group gap={6} mb={4}>
            <Text size="xs" fw={700}>
              {g.titel}
            </Text>
            {g.untertitel && (
              <Text size="xs" c="dimmed">
                {g.untertitel}
              </Text>
            )}
          </Group>
          <Group gap={4}>
            {g.eintraege.map((e) => {
              const an = gewaehlt.includes(e.name)
              const tip = tooltipText(e)
              const badge = (
                <Badge
                  key={e.name}
                  size="sm"
                  variant={an ? 'filled' : 'outline'}
                  color={an ? 'grape' : 'gray'}
                  tt="none"
                  style={{ cursor: 'pointer' }}
                  role="checkbox"
                  aria-checked={an}
                  tabIndex={0}
                  onClick={() => umschalten(e.name)}
                  onKeyDown={(ev) => {
                    if (ev.key === ' ' || ev.key === 'Enter') {
                      ev.preventDefault()
                      umschalten(e.name)
                    }
                  }}
                >
                  {e.name}
                </Badge>
              )
              return tip ? (
                <Tooltip key={e.name} label={tip} multiline w={320} openDelay={300} withinPortal style={{ whiteSpace: 'pre-line' }}>
                  {badge}
                </Tooltip>
              ) : (
                badge
              )
            })}
          </Group>
        </div>
      ))}
      {!gruppen.length && suche && (
        <Text size="xs" c="dimmed">
          Kein Operator passt zu „{suche}".
        </Text>
      )}

      <Group gap="xs" justify="space-between">
        <Text size="xs" c="dimmed">
          {text(gewaehlt.length)}
        </Text>
        {gewaehlt.length > 0 && (
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onChange([])}>
            Auswahl aufheben
          </Button>
        )}
      </Group>
      {(quelle || stand) && (
        <Text size="xs" c="dimmed" fz={11}>
          {quelle}
          {stand ? ` · Stand ${stand}` : ''}
        </Text>
      )}
    </Stack>
  )
}
