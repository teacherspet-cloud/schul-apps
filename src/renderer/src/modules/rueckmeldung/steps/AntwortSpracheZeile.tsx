import { Group, Select, Text } from '@mantine/core'
import { IconLanguage } from '@tabler/icons-react'
import { antwortSpracheAus, spracheName, type AntwortSprache } from '../antwortSprache'
import type { Rueckmeldung } from '../model/types'
import { fremdsprachlich } from '../teilbewertung'

/**
 * Antwortsprache unter der Aufgabe (29.09.2026, Wunsch der Lehrkraft): gleich nach der Wahl der
 * Aufgabe sichtbar, in welcher Sprache die Antworten verlangt sind – je Teil, sonst für die ganze
 * Aufgabe (änderbar). Daran hängen Hinweis und Wertung bei deutschen Abgaben.
 */
export default function AntwortSpracheZeile({
  r,
  update
}: {
  r: Rueckmeldung
  update: (f: (d: Rueckmeldung) => void, gruppe?: string) => void
}): React.JSX.Element | null {
  if (!fremdsprachlich(r.meta.subjectId) || !r.grundlage.aufgaben.trim()) return null
  const fach = r.meta.subjectLabel
  const teile = r.grundlage.teile ?? []
  if (teile.length)
    return (
      <Group gap={6} wrap="wrap" data-rm-antwortsprache>
        <IconLanguage size={14} />
        <Text size="xs">
          Antwortsprache: {teile.map((t) => `${t.titel} – ${spracheName(t.ergebnisSprache, fach)}`).join(' · ')}
        </Text>
        <Text size="xs" c="dimmed">
          (änderbar unter „Bewertung nach Teilen")
        </Text>
      </Group>
    )
  const erkannt = antwortSpracheAus(r.grundlage.aufgaben, r.meta.subjectId)
  return (
    <Group gap={6} align="center" data-rm-antwortsprache>
      <IconLanguage size={14} />
      <Select
        size="xs"
        label="Antwortsprache"
        w={260}
        data={[
          { value: 'auto', label: `automatisch – ${erkannt ? `erkannt: ${spracheName(erkannt, fach)}` : 'nicht eindeutig'}` },
          { value: 'zielsprache', label: fach || 'Zielsprache' },
          { value: 'deutsch', label: 'Deutsch' }
        ]}
        value={r.grundlage.antwortSprache ?? 'auto'}
        onChange={(v) =>
          update((d) => {
            if (v === 'zielsprache' || v === 'deutsch') d.grundlage.antwortSprache = v as AntwortSprache
            else delete d.grundlage.antwortSprache
          })
        }
        allowDeselect={false}
      />
    </Group>
  )
}
