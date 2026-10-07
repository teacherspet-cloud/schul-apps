import { Alert, Select, Stack, Switch, Text } from '@mantine/core'
import { NurExperte } from '../../../shared/components/NurExperte'
import { grammarQueryForMeta, LANGUAGE_SEQUENCES, learningYear, sequenceOf, needsSequence } from '../didactics/grammar'
import type { WorksheetMeta } from '../model/types'
import GrammatikAuswahl from './GrammatikAuswahl'

const sequenceLabel = (seq: string): string => LANGUAGE_SEQUENCES.find((s) => s.value === seq)?.label ?? 'Fremdsprache'

/**
 * Auswahl der Grammatikthemen – das Gegenstück zum Vokabel-Picker.
 *
 * Gezeigt wird, was für Fach, Fremdsprachenfolge und Lernjahr üblich ist, mit einem Jahr
 * Spielraum nach oben und unten. Die Lehrkraft kann das Fenster jederzeit aufmachen und die
 * gesamte Liste des Fachs sehen: Die Zuordnung ist eine Orientierung, kein Lehrplanzitat.
 *
 * Zu jedem Thema stehen die typischen Fehlerquellen und die Übungsformate, die dazu passen –
 * beides fließt in den Auftrag an die KI ein, statt dass sie es selbst erfinden muss.
 *
 * Die Auswahl selbst (Lehrwerk-Schnellwahl, Suche, Master-Detail mit Teilformen, Chips) steckt seit 06.10.2026 in
 * GrammatikAuswahl.tsx; hier bleiben die Angaben zur Lerngruppe (Fremdsprachenfolge, DaZ-Erwerbsstufe).
 */
export default function GrammarPicker({ meta, onChange }: { meta: WorksheetMeta; onChange: (patch: Partial<WorksheetMeta>) => void }): React.JSX.Element {
  const chosen = meta.grammarTopics ?? []
  const sequence = sequenceOf(meta)
  const daz = meta.subjectId === 'daz'
  const year = learningYear(meta.grade, sequence, meta.stateId)
  const scaleWord = daz ? 'Erwerbsstufe' : meta.subjectId === 'deutsch' ? 'Jahrgang' : 'Lernjahr'
  // Das gewählte GER-Niveau begrenzt die Auswahl nach oben (Fremdsprachen; grammarTopicsFor)
  const niveau = needsSequence(meta.subjectId) && meta.cefrLevel ? meta.cefrLevel : undefined

  return (
    <Stack gap="xs">
      <NurExperte>
        {needsSequence(meta.subjectId) && (
          <Alert color="gray" p="xs">
            <Text size="xs">
              {sequenceLabel(sequence)} in Klasse {meta.grade} = <b>{year}. Lernjahr</b>. Danach richtet sich die Auswahl – der Jahrgang allein genügt nicht:
              Dieselbe Klasse {meta.grade} steht je nach Folge im ersten oder im dritten Lernjahr. Die Fremdsprachenfolge lässt sich oben unter „Fremdsprache"
              ändern.
            </Text>
            {meta.grade >= 10 && (
              <NurExperte geaendert={Boolean(meta.lateStartLanguage) && 'spät beginnende Fremdsprache'}>
                <Switch
                  mt={6}
                  size="xs"
                  label="Spät beginnende Fremdsprache (Beginn in der Oberstufe)"
                  description="Eigene, stark verdichtete Progression – vor allem in Spanisch."
                  checked={Boolean(meta.lateStartLanguage)}
                  onChange={(e) => onChange({ lateStartLanguage: e.currentTarget.checked })}
                />
              </NurExperte>
            )}
          </Alert>
        )}
      </NurExperte>

      {daz && (
        <Select
          label="Erreichte Erwerbsstufe"
          description="Themen mehr als eine Stufe darüber werden ausgeblendet: Solche Strukturen lassen sich noch nicht verarbeiten, egal wie gut das Blatt ist."
          data={[
            { value: '', label: 'nicht bekannt – alle Themen zeigen' },
            { value: '0', label: 'Stufe 0: feste Wendungen' },
            { value: '1', label: 'Stufe 1: einfacher Satz, Verbzweitstellung' },
            { value: '2', label: 'Stufe 2: Klammerstruktur' },
            { value: '3', label: 'Stufe 3: Inversion, besetztes Vorfeld' },
            { value: '4', label: 'Stufe 4: Nebensatz mit Verbendstellung' },
            { value: '5', label: 'Stufe 5: eingeschobene Nebensätze' },
            { value: '6', label: 'Stufe 6: Bildungssprache' }
          ]}
          value={meta.acquisitionStage === undefined ? '' : String(meta.acquisitionStage)}
          onChange={(v) => onChange({ acquisitionStage: v ? Number(v) : undefined })}
          allowDeselect={false}
        />
      )}

      <GrammatikAuswahl
        query={grammarQueryForMeta(meta)}
        wahl={{ themen: chosen, teilformen: meta.grammarTeilformen ?? [] }}
        onChange={(w) => onChange({ grammarTopics: w.themen, grammarTeilformen: w.teilformen })}
        lehrwerk={meta.knownVocab}
        beschreibung={`Vorgeschlagen wird, was im ${scaleWord} ${daz ? '' : String(meta.subjectId === 'deutsch' ? meta.grade : year) + ' '}üblich ist${
          niveau ? ` und zum Niveau ${niveau} passt` : ''
        }. Die Zuordnung ist eine Orientierung, kein Lehrplanzitat.`}
      />

      {chosen.length > 1 && (
        <Alert color="orange" p="xs">
          <Text size="xs">
            Ein Blatt trägt in der Regel genau ein Grammatikthema: Alles darauf dient dann derselben Form. Mehrere sind für ein Wiederholungsblatt sinnvoll –
            sonst zerfällt das Blatt.
          </Text>
        </Alert>
      )}
    </Stack>
  )
}
