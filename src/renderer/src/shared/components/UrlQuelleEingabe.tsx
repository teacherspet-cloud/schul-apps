import { Button, Group, TextInput } from '@mantine/core'
import { IconLink, IconMovie } from '@tabler/icons-react'
import { useState } from 'react'
import type { ExtractedContent } from '../files/extractContent'
import { istVideoAdresse, ladeUrlAlsInhalt, siehtAusWieAdresse } from '../files/urlQuelle'
import { notifyError } from '../util'

/**
 * Eingabe einer Internetadresse neben der Ablagefläche für Dateien.
 *
 * Wunsch der Lehrkraft (26.09.2026): Überall, wo Material hineingezogen werden kann, soll
 * auch eine Adresse genügen – Webseite oder Video. Das Ergebnis hat dieselbe Form wie eine
 * gelesene Datei und landet über `onInhalt` in derselben Liste.
 */
export default function UrlQuelleEingabe({ onInhalt, mt }: { onInhalt: (c: ExtractedContent) => void; mt?: number | string }): React.JSX.Element {
  const [adresse, setAdresse] = useState('')
  const [stand, setStand] = useState<string | null>(null)
  const gueltig = siehtAusWieAdresse(adresse)

  const laden = async (): Promise<void> => {
    if (!gueltig || stand) return
    setStand('lädt …')
    try {
      const inhalt = await ladeUrlAlsInhalt(adresse, setStand)
      onInhalt(inhalt)
      setAdresse('')
    } catch (e) {
      notifyError(e, 'Die Adresse ließ sich nicht laden')
    } finally {
      setStand(null)
    }
  }

  return (
    <Group gap="xs" wrap="nowrap" align="flex-end" mt={mt}>
      <TextInput
        style={{ flex: 1 }}
        size="xs"
        label="Oder eine Internetadresse"
        description="Webseite oder YouTube-Video – Text bzw. Transkript wird als Material gelesen"
        placeholder="https://…"
        value={adresse}
        onChange={(e) => setAdresse(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void laden()
          }
        }}
        leftSection={istVideoAdresse(adresse) ? <IconMovie size={14} /> : <IconLink size={14} />}
        aria-label="Internetadresse als Material"
      />
      <Button size="xs" variant="light" loading={Boolean(stand)} disabled={!gueltig} onClick={() => void laden()}>
        Laden
      </Button>
    </Group>
  )
}
