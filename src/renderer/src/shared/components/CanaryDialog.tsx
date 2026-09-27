import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { CANARY_MAX, CANARY_WORDS, canaryText, canaryWords } from '../aiCanary'

/**
 * Wortwahl für den KI-Test – bis 27.09.2026 nur im Arbeitsblatt, jetzt für alle Programme
 * (Blattoptionen, shared/components/BlattoptionenFelder.tsx).
 */
export default function CanaryDialog({
  offen,
  vorschlag,
  wert,
  onAbbruch,
  onFertig
}: {
  offen: boolean
  vorschlag: string
  wert: string
  onAbbruch: () => void
  onFertig: (woerter: string) => void
}): React.ReactElement {
  const [text, setText] = useState(wert)
  // Beim Öffnen mit dem Vorschlag beginnen, wenn noch nichts gewählt wurde
  useEffect(() => {
    if (offen) setText(wert || vorschlag)
  }, [offen, wert, vorschlag])

  const woerter = canaryWords(text, vorschlag)
  return (
    <Modal opened={offen} onClose={onAbbruch} title="Wörter für den KI-Test" size="lg">
      <Stack gap="sm">
        <Text size="sm">
          Auf dem Schülerblatt steht ein für Lernende unsichtbarer Satz, der ein Sprachmodell dazu bringt, diese Wörter je einmal beiläufig und sachlich richtig
          mitten in einen Absatz einzubauen – nicht am Anfang, nicht erklärt, damit Lernende es beim Abschreiben nicht bemerken. Tauchen sie in einer Abgabe
          auf, ist der Blatttext durch eine KI gelaufen. Auch ein Wort, das nicht zum Thema passt, ist möglich: Das Modell darf es als Vergleich oder Abgrenzung
          einbauen, statt etwas Falsches zu behaupten.
        </Text>
        <TextInput
          label={`Wort oder Wörter (durch Komma getrennt, höchstens ${CANARY_MAX})`}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Vorschläge:
          </Text>
          {CANARY_WORDS.map((w) => (
            <Button key={w} size="compact-xs" variant="light" onClick={() => setText(w)}>
              {w}
            </Button>
          ))}
        </Group>
        <Alert variant="light" color="gray">
          <Text size="xs">Auf dem Blatt steht dann unsichtbar: „{canaryText(woerter)}"</Text>
        </Alert>
        {/*
         * Was der Test leistet und was nicht – vor dem Einschalten, nicht erst hinterher.
         *
         * Die Angaben stammen aus der Recherche vom 25.09.2026: Die Model Spec von OpenAI
         * entzieht Anweisungen aus Dateianhängen ausdrücklich die Verbindlichkeit, und
         * Reasoning-Modelle erkennen versteckte Fremdanweisungen. Eine Lehrkraft, die das
         * nicht weiß, hält einen fehlenden Treffer für einen Freispruch.
         */}
        <Alert variant="light" color="yellow" title="Was der Test leisten kann">
          <Text size="xs">
            Ein Treffer ist ein <b>Indiz für das Gespräch</b>, kein Nachweis. Am ehesten wirkt der Test, wenn der Aufgabentext kopiert und eingefügt wird. Beim
            Hochladen der PDF-Datei behandeln ChatGPT und Claude Anweisungen aus Anhängen regelgemäß als bloße Information; beim Abfotografieren geht der Satz
            gar nicht mit. Wer eine Vorlesefunktion nutzt, bekommt ihn vorgelesen – die Vorgabe ist deshalb bewusst harmlos und ändert nichts an der Lösung.
          </Text>
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onAbbruch}>
            Abbrechen
          </Button>
          <Button onClick={() => onFertig(woerter.join(', '))} disabled={!woerter.length}>
            KI-Test einschalten
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
