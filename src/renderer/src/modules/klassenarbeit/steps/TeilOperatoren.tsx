import { Button, Modal, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import OperatorenWahl from '../../../shared/components/OperatorenWahl'
import { wahlEintraege } from '../../../shared/operatorenWahl'
import { amtlicheListe, anlageWunsch } from '../didactics/operatorenliste'
import type { Exam, ExamPart } from '../model/types'

/**
 * Operatoren je Teil der Arbeit (10.11.2026, Wunsch der Lehrkraft: „konkrete Operatoren aus dem KC
 * auswählen, anhand derer die Aufgaben gestellt werden sollen"). Dieselbe Auswahl wie in
 * Lernzielkontrolle und Tafelbild, gespeist aus der Liste, die auch als Anlage dient (amtlich bzw.
 * KC des Landes). Anders als dort ist die Wahl hier VERBINDLICH: Die Aufgaben des Teils werden mit
 * genau diesen Operatoren gestellt (generation/generateExam.ts, partNotes).
 */
export default function TeilOperatoren({ exam, part, setzen }: { exam: Exam; part: ExamPart; setzen: (operatoren: string[]) => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const m = exam.meta
  const liste = useMemo(() => amtlicheListe(m.stateId, m.subjectId, anlageWunsch(m)), [m])
  const eintraege = useMemo(
    () =>
      liste
        ? wahlEintraege(
            liste.operatoren
              .filter((d) => !d.nurFaecher?.length || d.nurFaecher.includes(m.subjectId))
              .map((d) => ({ name: d.operator, synonyme: d.formen, definition: d.definition, afb: d.afb, teilkompetenz: d.kompetenzbereich })),
            liste.sprache
          )
        : [],
    [liste, m.subjectId]
  )
  const gewaehlt = part.operatoren ?? []
  if (!liste || !eintraege.length)
    return (
      <Text size="xs" c="dimmed">
        Operatoren: für dieses Land und Fach keine Liste hinterlegt
      </Text>
    )
  return (
    <>
      <Button size="compact-xs" variant={gewaehlt.length ? 'light' : 'default'} onClick={() => setOffen(true)} data-teil-operatoren={part.id}>
        {gewaehlt.length ? `Operatoren: ${gewaehlt.join(', ')}` : 'Operatoren wählen'}
      </Button>
      <Modal opened={offen} onClose={() => setOffen(false)} title={`Operatoren für „${part.label}"`} size="lg">
        <Stack gap="sm">
          <Text size="sm">
            Die Aufgaben dieses Teils werden mit genau diesen Operatoren gestellt – je gewähltem Operator mindestens eine Aufgabe. Ohne Auswahl wählt die KI
            passend zum Format.
          </Text>
          <OperatorenWahl
            eintraege={eintraege}
            gewaehlt={gewaehlt}
            onChange={setzen}
            quelle={liste.quelle}
            auswahlText={(n) => (n ? `${n} gewählt – verbindlich für diesen Teil` : 'Anklicken, um die Operatoren dieses Teils festzulegen')}
          />
          <Button onClick={() => setOffen(false)}>Fertig</Button>
        </Stack>
      </Modal>
    </>
  )
}
