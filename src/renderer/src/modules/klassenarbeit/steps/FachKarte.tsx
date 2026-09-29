import { Card, Group, NumberInput, Stack, Switch, Text, Title } from '@mantine/core'
import VersuchKarte from '../../arbeitsblatt/steps/VersuchKarte'
import { useAppSettings } from '../../../shared/settingsStore'
import { fachDerArbeit, hatVersuche } from '../model/faecher'
import { fehlerZeile } from '../model/fehlerquote'
import { uebersetzungFuer } from '../generation/fachRegeln'
import type { Exam, ExamMeta } from '../model/types'

/**
 * Fachbesonderheiten der Klassenarbeit (29.09.2026, Wunsch der Lehrkraft): Mathematik mit
 * hilfsmittelfreiem Teil A, Informatik auf Papier oder am Rechner, Versuch mit Protokoll in
 * den Naturwissenschaften. Erscheint nur, wenn das Fach etwas davon hat.
 */
export default function FachKarte({ exam, patch }: { exam: Exam; patch: (p: Partial<ExamMeta>) => void }): React.JSX.Element | null {
  const m = exam.meta
  const art = fachDerArbeit(m.subjectId).art
  useAppSettings((s) => s.settings)
  const versuch = hatVersuche(m.subjectId)
  if (art !== 'mathematik' && art !== 'informatik' && !versuch) return null
  return (
    <Stack gap="md" data-fach-karte>
      {(art === 'mathematik' || art === 'informatik') && (
        <Card withBorder>
          <Title order={4} mb="sm">
            {art === 'mathematik' ? 'Mathematik' : 'Informatik'}
          </Title>
          {art === 'mathematik' ? (
            <Switch
              label="Teil A ohne Hilfsmittel"
              description="Basisaufgaben ohne Taschenrechner und Formelsammlung, abgegeben vor Ausgabe der Hilfsmittel (wie ZP10 und Abitur; dort etwa 30 %)."
              checked={m.hilfsmittelfreierTeil !== false}
              onChange={(e) => patch({ hilfsmittelfreierTeil: e.currentTarget.checked })}
              data-teil-a
            />
          ) : (
            <Switch
              label="Am Rechner schreiben"
              description="Sonst auf Papier mit Sprachreferenz als Material. Am Rechner u. a. in Niedersachsen und im NRW-Wahlpflichtfach zulässig."
              checked={Boolean(m.amRechner)}
              onChange={(e) => patch({ amRechner: e.currentTarget.checked })}
            />
          )}
        </Card>
      )}
      {versuch && (
        <VersuchKarte
          lerngruppe={{ subjectId: m.subjectId, subjectLabel: m.subjectLabel, grade: m.grade, schoolTypeName: m.schoolTypeName, topic: m.topic }}
          versuch={m.versuch}
          patchVersuch={(v) => patch({ versuch: v })}
          pruefung
        />
      )}
    </Stack>
  )
}

/** Wortzahl und Grenze der Fehlerquote für die Übersetzung (Latein, Griechisch) */
export function FehlerquoteFelder({ exam, patch }: { exam: Exam; patch: (p: Partial<ExamMeta>) => void }): React.JSX.Element {
  const teil = exam.parts.find((p) => /-uebersetzung$/.test(p.formatId))
  const q = uebersetzungFuer(exam, teil)
  return (
    <Stack gap={4} data-fehlerquote>
      <Group grow>
        <NumberInput
          size="xs"
          label="Wörter im Übersetzungstext"
          min={20}
          max={400}
          step={5}
          value={q.woerter}
          onChange={(v) => patch({ uebersetzung: { ...q, woerter: Number(v) || q.woerter } })}
        />
        <NumberInput
          size="xs"
          label={"„ausreichend“ bis … Fehler je 100 Wörter"}
          min={5}
          max={25}
          step={0.5}
          decimalSeparator=","
          value={q.grenzeAusreichend}
          onChange={(v) => patch({ uebersetzung: { ...q, grenzeAusreichend: Number(v) || q.grenzeAusreichend } })}
        />
      </Group>
      <Text size="xs" c="dimmed">
        Fehlerschlüssel (Richtwert): {fehlerZeile(q)}. Grenze nach EPA 10, in Niedersachsen 15 Fehler je 100 Wörter; die übrigen Stufen legt die Fachkonferenz fest.
      </Text>
    </Stack>
  )
}
