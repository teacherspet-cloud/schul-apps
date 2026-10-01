import { Alert, Badge, Box, Button, Card, Group, Image, Loader, Modal, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconDeviceTv, IconDownload, IconFilePlus, IconPhotoSearch, IconSparkles, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { dataUrlBytes } from '../../../shared/export/docxKit'
import { speichereAusgabe } from '../../../shared/export/ausgabe'
import ImagePicker from '../../../shared/components/ImagePicker'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import { browserImageServices, imageGenerationAvailable, imageSize, sourceSearchVariants, type PickedImage } from '../../../shared/images'
import type { WunschArt } from '../../../shared/kiWunsch'
import { bildKennzeichnung, IMPULS_ARTEN, impulsHinweise, lizenzHinweis, type Einstiegsimpuls } from '../../../shared/stundenverlauf/einstiegsimpuls'
import { beschaffeImpulsBild, type ImpulsBildDeps, type ImpulsBildModus } from '../../../shared/stundenverlauf/impulsBild'
import type { VerlaufsPhase } from '../../../shared/stundenverlauf/stundenverlauf'
import { notifyError, safeFileName } from '../../../shared/util'
import type { ImageBlock, Worksheet } from '../model/types'
import { aiCall, useArbeitsblatt } from '../store'

/** Suche, KI-Prüfung und Bild-KI über die App; mit Thema gelten auch die Ausblendungen dieses Themas */
export async function impulsBildDeps(thema = ''): Promise<ImpulsBildDeps> {
  const kannBilder = await imageGenerationAvailable()
  return {
    ai: aiCall,
    services: browserImageServices(thema),
    generateImage: kannBilder ? (prompt) => window.api.ai.image(prompt) : undefined,
    variants: sourceSearchVariants,
    format: async (d) => {
      const s = await imageSize(d)
      return s.width / Math.max(1, s.height)
    }
  }
}

/** Bild des Impulses einer Phase beschaffen und in den Verlauf schreiben */
export async function impulsBildHolen(phaseId: string, ws: Worksheet, modus: ImpulsBildModus, wunsch = ''): Promise<void> {
  const impuls = ws.stundenverlauf?.phasen.find((p) => p.id === phaseId)?.impuls
  if (!impuls) return
  /*
   * „Anderes Bild" heißt: Das gezeigte passt nicht (01.10.2026). Vorher merkte sich nur dieser
   * eine Impuls das Bild (`gesehen`) – im nächsten Stundenverlauf zum selben Thema kam es wieder.
   * Jetzt landet es in der gemeinsamen Ablehnungsliste, für dieses Thema.
   */
  const bisher = impuls.image?.citation?.url
  if (modus === 'suche' && bisher && impuls.image?.source !== 'ai' && ws.meta.topic.trim()) {
    await window.api.sources
      .ablehnen({
        url: bisher,
        titel: impuls.image?.citation?.title ?? impuls.bild?.motiv ?? '',
        umfang: 'thema',
        thema: ws.meta.topic,
        themaText: ws.meta.topic,
        art: 'bild',
        programm: 'stundenverlauf'
      })
      .catch(() => undefined)
  }
  const r = await beschaffeImpulsBild(impuls, ws.meta, await impulsBildDeps(ws.meta.topic), { modus, wunsch })
  useArbeitsblatt.getState().update((w) => {
    const i = w.stundenverlauf?.phasen.find((p) => p.id === phaseId)?.impuls
    if (!i) return
    i.gesehen = r.gesehen
    i.bildHinweis = r.hinweis
    if (r.image) {
      i.image = r.image
      if (r.bildFormat) i.bildFormat = r.bildFormat
      else delete i.bildFormat
    }
  })
}

const zeilen = (s: string): string[] =>
  s
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)

/**
 * Der Einstiegsimpuls einer Phase im Stundenverlauf (01.10.2026): Impulsart, Leitfrage,
 * Moderation, erwartete Beiträge, Überleitung – und bei Bildimpulsen das beschaffte Bild mit
 * Quellenangabe bzw. KI-Kennzeichnung, „Anderes Bild", „KI-Bild entwerfen", „Eigenes Bild",
 * Zauberstab-Wünsche, als Folie zeigen und aufs Blatt übernehmen.
 */
export function EinstiegsimpulsKarte({
  phase,
  ws,
  dauer,
  laedt
}: {
  phase: VerlaufsPhase
  ws: Worksheet
  dauer: number
  /** Das Bild wird gerade automatisch beschafft (nach dem Erstellen des Verlaufs) */
  laedt?: boolean
}): React.JSX.Element | null {
  const update = useArbeitsblatt((s) => s.update)
  const [eigenBusy, setBusy] = useState<ImpulsBildModus | null>(null)
  const busy: ImpulsBildModus | null = eigenBusy ?? (laedt ? 'auto' : null)
  const [picker, setPicker] = useState(false)
  const [folie, setFolie] = useState(false)
  const [frageZeigen, setFrageZeigen] = useState(false)
  const i = phase.impuls
  if (!i) return null
  const bildArt = IMPULS_ARTEN[i.art]?.bild || Boolean(i.image)

  const setze = (fn: (x: Einstiegsimpuls) => void, gruppe?: string): void =>
    update((w) => {
      const x = w.stundenverlauf?.phasen.find((p) => p.id === phase.id)?.impuls
      if (x) fn(x)
    }, gruppe)

  const holen = async (modus: ImpulsBildModus, wunsch = ''): Promise<void> => {
    setBusy(modus)
    try {
      await impulsBildHolen(phase.id, useArbeitsblatt.getState().worksheet ?? ws, modus, wunsch)
    } catch (e) {
      notifyError(e, modus === 'ki' ? 'Das KI-Bild konnte nicht entworfen werden' : 'Die Bildsuche ist fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const eigenesBild = (img: PickedImage): void =>
    setze((x) => {
      x.image = { dataUrl: img.dataUrl, source: img.source, ...(img.credit ? { credit: img.credit } : {}) }
      x.bildHinweis = img.source === 'ai' ? 'KI-Bild aus der Bildauswahl – beim Zeigen als KI-Bild kennzeichnen.' : 'Bild selbst gewählt.'
      delete x.bildFormat
      void imageSize(img.dataUrl)
        .then((s) => setze((y) => (y.bildFormat = s.width / Math.max(1, s.height))))
        .catch(() => undefined)
    })

  const aufsBlatt = (): void => {
    if (!i.image) return
    const block: ImageBlock = {
      id: Math.random().toString(36).slice(2, 10),
      type: 'image',
      role: 'motivation',
      description: i.bild?.motiv || i.beschreibung || i.titel,
      caption: i.titel,
      widthPercent: 70,
      image: { ...i.image },
      ...(i.bild?.suche ? { search: i.bild.suche } : {}),
      ...(i.bild?.original ? { original: true } : {})
    }
    update((w) => {
      for (const s of w.sheets) {
        // Nach den Lernzielen am Blattanfang, sonst ganz oben
        let at = 0
        while (at < s.blocks.length && s.blocks[at].type === 'learningGoals') at++
        s.blocks.splice(at, 0, { ...block, id: `${block.id}${w.sheets.length > 1 ? `-${s.id}` : ''}` })
      }
    })
  }

  const speichern = (): void => {
    if (!i.image) return
    const { data, type } = dataUrlBytes(i.image.dataUrl)
    const endung = type === 'jpg' ? 'jpg' : type
    void speichereAusgabe(
      [
        {
          name: `${safeFileName(`${ws.meta.title || ws.meta.topic} - Einstiegsbild`)}.${endung}`,
          filter: [{ name: 'Bild', extensions: [endung] }],
          daten: data
        }
      ],
      'Einstiegsbild gespeichert.'
    ).catch(notifyError)
  }

  const onWunsch = (art: WunschArt, wunsch: string): void => void holen(art === 'ueberarbeiten' ? 'ki' : 'auto', wunsch)
  const hinweise = impulsHinweise(i, phase.minuten, dauer, ws.meta.grade)
  const kennung = bildKennzeichnung(i.image)

  return (
    <Card withBorder p="sm" radius="md" data-einstiegsimpuls bg="var(--mantine-color-gray-0)">
      <Stack gap={6}>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge variant="light" color="teal" data-impuls-art={i.art}>
              {IMPULS_ARTEN[i.art]?.label ?? 'Impuls'}
            </Badge>
            <Text fw={600} size="sm" truncate>
              {phase.phase}: {i.titel}
            </Text>
          </Group>
        </Group>
        <Group align="flex-start" gap="md" wrap="wrap">
          {bildArt && (
            <Stack gap={4} w={340} maw="100%">
              <Group gap={6} align="flex-start" wrap="nowrap">
                <Box
                  pos="relative"
                  style={{
                    flex: 1,
                    border: '1px solid var(--mantine-color-gray-4)',
                    borderRadius: 6,
                    background: '#fff',
                    minHeight: 160,
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  {busy ? (
                    <Group gap={6} p="md">
                      <Loader size="sm" />
                      <Text size="xs" c="dimmed">
                        {busy === 'ki' ? 'Die Bild-KI entwirft ein Bild …' : 'Passendes Bild wird gesucht und geprüft …'}
                      </Text>
                    </Group>
                  ) : i.image ? (
                    <Image src={i.image.dataUrl} alt={i.bild?.motiv ?? i.titel} mah={220} fit="contain" data-impuls-bild={i.image.source} />
                  ) : (
                    <Text size="xs" c="dimmed" p="md" ta="center">
                      Noch kein Bild
                      {i.bild?.motiv ? ` – geplant: ${i.bild.motiv}` : ''}
                    </Text>
                  )}
                </Box>
                <KiWunschKnoepfe
                  blockId={`impuls-${phase.id}`}
                  name="Einstiegsbild"
                  busy={Boolean(busy)}
                  kontext={() => ({
                    typ: 'einstiegsbild',
                    typLabel: 'Einstiegsbild (Bildimpuls)',
                    material: 'Stundenverlauf',
                    fachId: ws.meta.subjectId,
                    fachLabel: ws.meta.subjectLabel,
                    klasse: ws.meta.grade,
                    thema: ws.meta.topic,
                    lernziel: ws.meta.learningGoals,
                    inhalt: [i.titel, i.bild?.motiv, `Leitfrage: ${i.leitfrage}`].filter(Boolean).join('\n')
                  })}
                  onAusfuehren={onWunsch}
                />
              </Group>
              {i.image && (
                <Text size="10px" c={i.image.source === 'ai' ? 'grape' : 'dimmed'} data-impuls-kennung>
                  {kennung}
                  {lizenzHinweis(i.image) ? ` · ${lizenzHinweis(i.image)}` : ''}
                </Text>
              )}
              <Group gap={4} wrap="wrap">
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconPhotoSearch size={13} />}
                  disabled={Boolean(busy)}
                  onClick={() => void holen('suche')}
                  data-impuls-anderes
                >
                  Anderes Bild
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="grape"
                  leftSection={<IconSparkles size={13} />}
                  disabled={Boolean(busy)}
                  onClick={() => void holen('ki')}
                  data-impuls-ki
                >
                  KI-Bild entwerfen
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="gray"
                  leftSection={<IconUpload size={13} />}
                  disabled={Boolean(busy)}
                  onClick={() => setPicker(true)}
                  data-impuls-eigenes
                >
                  Eigenes Bild
                </Button>
              </Group>
              {i.image && (
                <Group gap={4} wrap="wrap">
                  <Button size="compact-xs" variant="default" leftSection={<IconDeviceTv size={13} />} onClick={() => setFolie(true)} data-impuls-folie>
                    Als Folie zeigen
                  </Button>
                  <Tooltip label="Das Bild als Abbildung an den Anfang jedes Blattes setzen" multiline w={220}>
                    <Button size="compact-xs" variant="default" leftSection={<IconFilePlus size={13} />} onClick={aufsBlatt} data-impuls-aufs-blatt>
                      Aufs Blatt
                    </Button>
                  </Tooltip>
                  <Button size="compact-xs" variant="default" leftSection={<IconDownload size={13} />} onClick={speichern}>
                    Bild speichern
                  </Button>
                </Group>
              )}
            </Stack>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 260 }}>
            {i.zitat && (
              <Text size="sm" fs="italic" data-impuls-zitat>
                „{i.zitat.text}“{' '}
                <Text span size="xs" c={i.zitat.quelle ? 'dimmed' : 'red'} fs="normal">
                  – {i.zitat.quelle || 'Quelle fehlt'}
                </Text>
              </Text>
            )}
            <TextInput
              size="xs"
              label="Leitfrage"
              value={i.leitfrage}
              onChange={(e) => {
                const x = e.currentTarget.value
                setze((y) => (y.leitfrage = x), `impuls-${phase.id}-frage`)
              }}
              data-impuls-leitfrage
            />
            <Textarea
              size="xs"
              label="Impuls"
              autosize
              minRows={1}
              value={i.beschreibung}
              onChange={(e) => {
                const x = e.currentTarget.value
                setze((y) => (y.beschreibung = x), `impuls-${phase.id}-text`)
              }}
            />
            {i.bezug && (
              <Text size="xs" c="dimmed">
                Bezug zum Stundenziel: {i.bezug}
              </Text>
            )}
            <Textarea
              size="xs"
              label="Moderation (ein Schritt je Zeile)"
              autosize
              minRows={2}
              value={i.moderation.join('\n')}
              onChange={(e) => {
                const x = e.currentTarget.value
                setze((y) => (y.moderation = zeilen(x)), `impuls-${phase.id}-mod`)
              }}
            />
            <Textarea
              size="xs"
              label="Erwartete Beiträge (je Zeile, Reaktion nach →)"
              autosize
              minRows={2}
              value={i.erwartungen.join('\n')}
              onChange={(e) => {
                const x = e.currentTarget.value
                setze((y) => (y.erwartungen = zeilen(x)), `impuls-${phase.id}-erw`)
              }}
            />
            <TextInput
              size="xs"
              label="Überleitung"
              value={i.ueberleitung}
              onChange={(e) => {
                const x = e.currentTarget.value
                setze((y) => (y.ueberleitung = x), `impuls-${phase.id}-ueber`)
              }}
            />
          </Stack>
        </Group>
        {(i.bildHinweis || hinweise.length > 0) && (
          <Alert color={i.image?.source === 'ai' ? 'grape' : 'blue'} variant="light" p={6} data-impuls-hinweis>
            <Stack gap={2}>
              {i.bildHinweis && <Text size="xs">{i.bildHinweis}</Text>}
              {hinweise.map((h) => (
                <Text size="xs" key={h}>
                  {h}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
      <ImagePicker
        opened={picker}
        onClose={() => setPicker(false)}
        onPick={eigenesBild}
        keywords={[i.bild?.suche || i.titel].filter(Boolean)}
        {...(i.bild?.original ? { sourceSearch: i.bild.werk || i.bild.suche } : {})}
      />
      <Modal
        opened={folie}
        onClose={() => setFolie(false)}
        fullScreen
        withCloseButton={false}
        padding={0}
        styles={{ body: { background: '#000', height: '100%' } }}
      >
        <Box
          data-impuls-foliensicht
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            cursor: 'pointer'
          }}
          onClick={() => setFolie(false)}
        >
          {i.image && (
            <img
              src={i.image.dataUrl}
              alt={i.bild?.motiv ?? i.titel}
              style={{ maxWidth: '96vw', maxHeight: frageZeigen ? '78vh' : '90vh', objectFit: 'contain' }}
            />
          )}
          {frageZeigen && i.leitfrage && (
            <Text c="white" fz={32} fw={600} ta="center" mt="md" px="xl">
              {i.leitfrage}
            </Text>
          )}
          <Text c="gray.5" size="xs" mt="xs" ta="center" px="md">
            {kennung}
          </Text>
          <Group gap="xs" mt="sm" onClick={(e) => e.stopPropagation()}>
            <Button size="xs" variant="default" onClick={() => setFrageZeigen((x) => !x)} data-impuls-frage-zeigen>
              {frageZeigen ? 'Leitfrage ausblenden' : 'Leitfrage einblenden'}
            </Button>
            <Button size="xs" variant="default" onClick={() => setFolie(false)}>
              Schließen
            </Button>
          </Group>
        </Box>
      </Modal>
    </Card>
  )
}
