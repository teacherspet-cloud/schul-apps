import { Alert, Group, List, Select, Stack, Switch, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import type { BilingualForm, BilingualVorgaben, Pruefsprache, WorksheetMeta } from '../model/types'
import { bewertungsregel, bilingualAktiv, bilingualHinweise, PRUEFUNGSSPRACHE_HINWEIS } from '../didactics/bilingual'
import { istUebungsklausur } from '../generation/abiturPrompt'

/**
 * Schalter „bilingual unterrichten" beim Sachfach.
 *
 * Entscheidung der Lehrkraft (25.09.2026): eingeschaltet wird beim Fach, mit Arbeitssprache
 * und Form. Die Hinweise (Mathematik, unbelegtes Land, fehlende Operatorenliste) sperren
 * nichts – sie stehen zur Kenntnis darunter.
 */
const SPRACHEN = [
  { value: 'en', label: 'Englisch' },
  { value: 'fr', label: 'Französisch' },
  { value: 'es', label: 'Spanisch' },
  { value: 'it', label: 'Italienisch' }
]

// Kurz genug für das halbe Feld; die ausführliche Bezeichnung (FORM_LABEL) steht im Prompt
const FORMEN: { value: BilingualForm; label: string }[] = [
  { value: 'zug', label: 'Bilingualer Zug' },
  { value: 'sachfach', label: 'Durchgängig im Fach' },
  { value: 'modul', label: 'Bilinguales Modul' }
]

const STANDARD: BilingualVorgaben = { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'sachfach' }

const PRUEFSPRACHEN: { value: Pruefsprache; label: string }[] = [
  { value: 'ziel', label: 'In der Arbeitssprache' },
  { value: 'gemischt', label: 'Gemischt (mind. eine Aufgabe auf Deutsch)' },
  { value: 'deutsch', label: 'Auf Deutsch (Material in der Arbeitssprache)' }
]

export default function BilingualSchalter({
  meta,
  onChange,
  pruefung = false
}: {
  meta: Pick<WorksheetMeta, 'subjectId' | 'stateId' | 'grade' | 'bilingual'> & Partial<Pick<WorksheetMeta, 'abitur'>>
  onChange: (bilingual: BilingualVorgaben | undefined) => void
  /** Klassenarbeit: Prüfungssprache wählbar, Hinweis zur Prüfungssprache immer sichtbar */
  pruefung?: boolean
}): React.JSX.Element | null {
  // Nur in Sachfächern – Deutsch und die Fremdsprachen sind keine
  if (!bilingualAktiv({ subjectId: meta.subjectId, bilingual: STANDARD })) return null
  const b = meta.bilingual
  const an = bilingualAktiv(meta)
  const klausur = pruefung || istUebungsklausur(meta as WorksheetMeta)
  const setze = (teil: Partial<BilingualVorgaben>): void => onChange({ ...(b ?? STANDARD), ...teil, an: true })

  return (
    <Stack gap="xs">
      <Switch
        label="Bilingual unterrichten"
        description="Aufgaben und Material in der Arbeitssprache, Fachbegriffe zweisprachig, Bewertung nach den Vorgaben des Landes."
        checked={an}
        onChange={(e) => (e.currentTarget.checked ? onChange({ ...(b ?? STANDARD), an: true }) : onChange(b ? { ...b, an: false } : undefined))}
      />
      {an && b && (
        <>
          <Group grow align="start">
            <Select
              label="Arbeitssprache"
              data={SPRACHEN}
              value={b.sprache}
              onChange={(v) => v && setze({ sprache: v, spracheLabel: SPRACHEN.find((s) => s.value === v)?.label ?? v })}
              allowDeselect={false}
            />
            <Select label="Form" data={FORMEN} value={b.form} onChange={(v) => v && setze({ form: v as BilingualForm })} allowDeselect={false} />
          </Group>
          {pruefung && (
            <Select
              label="Aufgabenstellungen"
              description="Reine Fremdsprache unterschätzt die Sachleistung; Mischformate sind amtlich gedeckt."
              data={PRUEFSPRACHEN}
              value={b.pruefsprache ?? 'ziel'}
              onChange={(v) => v && setze({ pruefsprache: v as Pruefsprache })}
              allowDeselect={false}
            />
          )}
          <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} title="Bewertung in diesem Land" data-testid="bilingual-hinweise">
            <Text size="sm">{bewertungsregel(meta).regel}</Text>
            {(bilingualHinweise(meta).length > 0 || klausur) && (
              <List size="sm" mt="xs">
                {bilingualHinweise(meta).map((h) => (
                  <List.Item key={h}>{h}</List.Item>
                ))}
                {klausur && <List.Item>{PRUEFUNGSSPRACHE_HINWEIS}</List.Item>}
              </List>
            )}
          </Alert>
        </>
      )}
    </Stack>
  )
}
