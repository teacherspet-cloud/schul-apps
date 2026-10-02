import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { IconFileText } from '@tabler/icons-react'
import { useState } from 'react'
import { mitTranskript, videoInhaltsArt } from '../didactics/sehtext'

const ART: Record<ReturnType<typeof videoInhaltsArt>, string> = {
  untertitel: 'Video – Untertitel mit Zeitmarken',
  ki: 'Video – Inhaltsprotokoll der KI (Gemini)',
  lehrkraft: 'Video – eigenes Transkript',
  keine: 'Video – ohne Transkript'
}

/** Kurzbeschreibung eines Video-Materials: woher sein Inhalt stammt (02.10.2026) */
export const videoMaterialArt = (text: string): string => ART[videoInhaltsArt(text)]

/**
 * „Transkript einfügen" an einem Video-Material (02.10.2026, Entscheidung der Lehrkraft): wenn
 * das Video keine Untertitel hat und Gemini es nicht sehen kann (nicht öffentlich, kein
 * Google-Schlüssel) – oder wenn die Lehrkraft ein besseres Transkript hat. Mit Zeitmarken
 * („[3:20] …") nennen die Aufgaben ihren Abschnitt; ohne geht es auch.
 */
export default function VideoTranskript({ text, onChange }: { text: string; onChange: (text: string) => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [entwurf, setEntwurf] = useState('')
  const ohne = videoInhaltsArt(text) === 'keine'
  return (
    <>
      <Button
        size="compact-xs"
        variant={ohne ? 'light' : 'subtle'}
        color={ohne ? 'orange' : undefined}
        leftSection={<IconFileText size={14} />}
        onClick={() => {
          setEntwurf('')
          setOffen(true)
        }}
        data-transkript-einfuegen
      >
        Transkript einfügen
      </Button>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Transkript zum Video einfügen" size="lg">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Der Text ersetzt {ohne ? 'den Hinweis „kein Transkript"' : 'den bisherigen Inhalt'} und dient der KI als Grundlage für die Fragen. Mit Zeitmarken wie „[3:20] …" nennen
            die Aufgaben auch den Abschnitt des Videos. Auf das Blatt wird das Transkript nicht gedruckt.
          </Text>
          <Textarea autosize minRows={8} maxRows={20} value={entwurf} onChange={(e) => setEntwurf(e.currentTarget.value)} placeholder="[0:00] …" />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!entwurf.trim()}
              onClick={() => {
                onChange(mitTranskript(text, entwurf))
                setOffen(false)
              }}
            >
              Übernehmen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
