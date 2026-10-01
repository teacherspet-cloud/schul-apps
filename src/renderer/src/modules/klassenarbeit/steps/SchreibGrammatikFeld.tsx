import { Alert, Checkbox, Group, MultiSelect, SegmentedControl, Stack, Text, TextInput } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { hinweise, MODI, strukturenFuer, vorschlag, type GrammatikModus, type SchreibGrammatik } from '../didactics/schreibGrammatik'
import type { Exam, ExamPart } from '../model/types'

/**
 * Grammatik im Schreibteil (29.09.2026, Wunsch der Lehrkraft): Strukturen aus der
 * Grammatiktabelle (bis zum aktuellen Lernjahr), Art der Vorgabe, Unterstreichen, Bewertung –
 * mit den Hinweisen des Landes (didactics/schreibGrammatik.ts).
 */
export default function SchreibGrammatikFeld({
  exam,
  part,
  setzen
}: {
  exam: Exam
  part: ExamPart
  setzen: (g: SchreibGrammatik | undefined) => void
}): React.JSX.Element {
  const g = part.grammatik
  const liste = strukturenFuer(exam.meta)
  const aktiv = Boolean(g)
  const wert = g ?? vorschlag(exam.meta)
  const set = (p: Partial<SchreibGrammatik>): void => setzen({ ...wert, ...p })
  const mitListe = liste.length > 0
  return (
    <Stack gap={6} mt="xs" data-schreib-grammatik>
      <Checkbox
        size="xs"
        label="Grammatik ausdrücklich mitprüfen"
        description="Strukturen, die in der Schreibaufgabe verlangt und bewertet werden"
        checked={aktiv}
        onChange={(e) => setzen(e.currentTarget.checked ? vorschlag(exam.meta) : undefined)}
      />
      {aktiv && (
        <>
          {mitListe ? (
            <MultiSelect
              size="xs"
              label="Strukturen"
              placeholder="aus dem bisherigen Unterricht"
              data={liste.map(({ topic, eingefuehrt }) => ({
                value: topic.id,
                label: `${topic.term || topic.label}${topic.term ? ` (${topic.label})` : ''}${eingefuehrt ? '' : ' – erst ab nächstem Lernjahr'}`
              }))}
              value={wert.themen}
              onChange={(v) => set({ themen: v })}
              searchable
              clearable
            />
          ) : null}
          <TextInput
            size="xs"
            label={mitListe ? 'Weitere Struktur (frei, optional)' : 'Strukturen (frei)'}
            placeholder={mitListe ? 'z. B. linking words' : 'z. B. passato prossimo'}
            value={wert.frei ?? ''}
            onChange={(e) => set({ frei: e.currentTarget.value })}
          />
          <SegmentedControl
            size="xs"
            fullWidth
            value={wert.modus}
            onChange={(v) => set({ modus: v as GrammatikModus })}
            data={MODI.map((m) => ({ value: m.value, label: m.label }))}
          />
          <Text size="xs" c="dimmed">
            {MODI.find((m) => m.value === wert.modus)?.beschreibung}
          </Text>
          <Group gap="md" align="flex-end">
            {wert.modus === 'anzahl' && (
              <ZahlFeld size="xs" w={120} label="Mindestanzahl" min={1} max={10} value={wert.anzahl ?? 2} onChange={(v) => set({ anzahl: Number(v) || 2 })} />
            )}
            {wert.modus === 'anzahl' && (
              <Checkbox size="xs" label="Formen unterstreichen lassen" checked={Boolean(wert.unterstreichen)} onChange={(e) => set({ unterstreichen: e.currentTarget.checked })} />
            )}
          </Group>
          <SegmentedControl
            size="xs"
            value={wert.bewertung}
            onChange={(v) => set({ bewertung: v as SchreibGrammatik['bewertung'] })}
            data={[
              { value: 'integriert', label: 'Integriert in „Sprache"' },
              { value: 'kriterium', label: 'Eigenes Kriterium mit Punkten' }
            ]}
          />
          {hinweise(exam.meta, wert).map((h, i) => (
            <Alert
              key={i}
              p="xs"
              variant="light"
              color={h.warnung ? 'orange' : 'gray'}
              icon={h.warnung ? <IconAlertTriangle size={14} /> : <IconInfoCircle size={14} />}
            >
              <Text size="xs">{h.text}</Text>
            </Alert>
          ))}
        </>
      )}
    </Stack>
  )
}
