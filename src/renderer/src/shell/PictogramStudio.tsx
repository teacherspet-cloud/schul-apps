import { Alert, Button, Group, Modal, ScrollArea, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconRefresh, IconSparkles, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { PICTOGRAMS, pictogramPrompt } from '../modules/arbeitsblatt/render/pictograms'
import type { Pictogram } from '../modules/arbeitsblatt/render/pictograms'
import { PictogramIcon } from '../modules/arbeitsblatt/render/Pictogram'
import { generateAiImage, imageGenerationAvailable } from '../shared/images'
import { useAppSettings } from '../shared/settingsStore'
import { notifyError, notifySuccess } from '../shared/util'
import { useEffect } from 'react'

/**
 * Werkstatt für die Piktogramme.
 *
 * Die App liefert einen eigenen, gezeichneten Satz mit. Wer ein Symbol anders haben möchte,
 * lässt es hier von der Bild-KI neu gestalten – das Ergebnis gilt dann in allen Programmen,
 * nicht nur auf dem gerade geöffneten Blatt.
 *
 * Der Auftrag verlangt einen neongrünen Hintergrund; die App schneidet ihn nach dem Erzeugen
 * heraus (Chromakeying), sodass das Symbol frei auf dem Blatt steht. Ein eigenes Bild kann die
 * Textfarbe nicht mehr übernehmen – das ist der Preis für die freie Gestaltung.
 */
export default function PictogramStudio({ opened, onClose }: { opened: boolean; onClose: () => void }): React.JSX.Element {
  const { pictograms, setPictogram, resetPictograms } = useAppSettings()
  const [busy, setBusy] = useState<string | null>(null)
  const [style, setStyle] = useState('')
  const [canGenerate, setCanGenerate] = useState<boolean | null>(null)

  useEffect(() => {
    if (!opened) return
    imageGenerationAvailable()
      .then(setCanGenerate)
      .catch(() => setCanGenerate(false))
  }, [opened])

  const redraw = async (picto: Pictogram): Promise<void> => {
    setBusy(picto.id)
    try {
      const image = await generateAiImage(pictogramPrompt(picto, style), 256)
      await setPictogram(picto.id, image.dataUrl)
      notifySuccess(`„${picto.label}" neu gestaltet.`)
    } catch (e) {
      notifyError(e, `„${picto.label}" konnte nicht neu gestaltet werden`)
    } finally {
      setBusy(null)
    }
  }

  const ownCount = PICTOGRAMS.filter((p) => pictograms[p.id]).length

  return (
    <Modal opened={opened} onClose={onClose} title="Piktogramme gestalten" size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Diese Symbole stehen an Arbeitsanweisungen und Sozialformen. Ein Druck auf das Stift-Zeichen lässt die Bild-KI das Symbol neu gestalten; es gilt
          danach in allen Programmen. Der neongrüne Hintergrund wird dabei automatisch entfernt.
        </Text>

        {canGenerate === false && (
          <Alert color="orange" p="xs">
            <Text size="xs">
              Es ist keine Bild-KI eingerichtet. Trage in den Einstellungen einen Anbieter mit Bilderzeugung ein, dann lassen sich die Symbole hier neu
              gestalten. Der mitgelieferte Satz funktioniert auch ohne.
            </Text>
          </Alert>
        )}

        <TextInput
          label="Gestaltungswunsch (gilt für alle neu erzeugten Symbole)"
          description="Zum Beispiel: freundlich und rund · kindlich gezeichnet · streng geometrisch. Leer lassen für den Standard."
          placeholder="ohne besonderen Wunsch"
          value={style}
          onChange={(e) => setStyle(e.currentTarget.value)}
        />

        <ScrollArea.Autosize mah="52vh">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
            {PICTOGRAMS.map((picto) => {
              const own = Boolean(pictograms[picto.id])
              return (
                <Group key={picto.id} gap={6} wrap="nowrap" p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}>
                  <div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <PictogramIcon picto={picto} size={30} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" fw={500} truncate>
                      {picto.label}
                    </Text>
                    {own && (
                      <Text size="xs" c="dimmed">
                        selbst gestaltet
                      </Text>
                    )}
                  </div>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label={own ? 'Noch einmal neu gestalten lassen' : 'Von der Bild-KI neu gestalten lassen'} position="top">
                      <Button
                        size="compact-xs"
                        variant="light"
                        px={6}
                        loading={busy === picto.id}
                        disabled={canGenerate === false || (busy !== null && busy !== picto.id)}
                        onClick={() => void redraw(picto)}
                        aria-label={`${picto.label} neu gestalten`}
                      >
                        {own ? <IconRefresh size={13} /> : <IconSparkles size={13} />}
                      </Button>
                    </Tooltip>
                    {own && (
                      <Tooltip label="Mitgeliefertes Symbol wiederherstellen" position="top">
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          px={5}
                          onClick={() => void setPictogram(picto.id, null)}
                          aria-label={`${picto.label} zurücksetzen`}
                        >
                          <IconX size={13} />
                        </Button>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
              )
            })}
          </SimpleGrid>
        </ScrollArea.Autosize>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {ownCount ? `${ownCount} von ${PICTOGRAMS.length} selbst gestaltet` : 'Alle Symbole sind die mitgelieferten.'}
          </Text>
          <Group gap="xs">
            {ownCount > 0 && (
              <Button size="compact-sm" variant="subtle" color="red" onClick={() => void resetPictograms()}>
                Alle zurücksetzen
              </Button>
            )}
            <Button size="compact-sm" variant="default" onClick={onClose}>
              Schließen
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
