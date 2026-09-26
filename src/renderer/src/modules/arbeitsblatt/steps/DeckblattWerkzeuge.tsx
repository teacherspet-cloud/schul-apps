import {
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconFiles, IconPhotoPlus, IconRestore, IconSparkles } from '@tabler/icons-react'
import { normalizeImage, notifyError, readFileAsDataUrl } from '../../../shared/util'
import type { Worksheet } from '../model/types'
import { COVER_DESIGNS, FACH_COVER_ID } from '../render/coverDesigns'
import { deckblattLage, type DeckblattVorschau } from '../render/CoverPage'
import {
  DECKBLATT_HOECHSTENS,
  DECKBLATT_KOEPFE,
  DECKBLATT_LAYOUTS,
  DECKBLATT_MASKOTTCHEN,
  DECKBLATT_TIERE,
  geltenderRahmen,
  istQuer,
  type DeckblattKopf,
  type DeckblattLayout,
  type DeckblattMaskottchen,
  type DeckblattTier
} from '../render/deckblatt'

/**
 * Werkzeugleiste des Deckblatts (Paket 11): Layout, Kopf, Rahmen, Farbe, Maskottchen, Seiten
 * und „Anordnung zurücksetzen".
 *
 * Sie steht ÜBER der Deckblattseite im Editor, nicht darauf – so kann nichts davon in den
 * Druck geraten. Jede Änderung ist ein Rückgängig-Schritt; Layoutwechsel und Zurücksetzen
 * verwerfen die frei gezogene Anordnung (Strg+Z holt sie zurück).
 */
export function DeckblattWerkzeuge({
  ws,
  vorschau,
  update,
  onZeichnen,
  onSeitenwahl
}: {
  ws: Worksheet
  vorschau: DeckblattVorschau
  update: (fn: (w: Worksheet) => void) => void
  /** Fuchs bzw. Tier von der KI neu zeichnen lassen (Hintergrund-Auftrag) */
  onZeichnen: () => void
  onSeitenwahl: () => void
}): React.JSX.Element {
  const m = ws.meta
  const maskottchen = m.coverMascot ?? 'fuchs'
  const layout = m.coverLayout ?? 'faecher'
  const { karten } = deckblattLage(m, vorschau.kandidaten)
  const eigen = Boolean(m.coverArrangement?.length)

  return (
    <Paper withBorder p="xs" radius="md" className="deckblatt-werkzeuge" w="100%" maw={900}>
      <Group gap="xs" wrap="wrap" align="flex-end">
        <Select
          size="xs"
          w={130}
          label="Anordnung"
          data={DECKBLATT_LAYOUTS}
          value={layout}
          allowDeselect={false}
          // Ein neues Layout ordnet neu – die frei gezogene Lage gilt für das alte
          onChange={(v) =>
            v &&
            update((w) => {
              w.meta.coverLayout = v as DeckblattLayout
              delete w.meta.coverArrangement
            })
          }
        />
        <Select
          size="xs"
          w={150}
          label="Kopf"
          data={DECKBLATT_KOEPFE}
          value={m.coverHead ?? 'band'}
          allowDeselect={false}
          onChange={(v) => v && update((w) => (w.meta.coverHead = v as DeckblattKopf))}
        />
        <div>
          <Text size="xs" fw={500} mb={3}>
            Rahmen
          </Text>
          <SegmentedControl
            size="xs"
            aria-label="Rahmen der Seitenvorschauen"
            data={[
              { value: 'schlicht', label: 'Schlicht' },
              { value: 'polaroid', label: 'Polaroid' }
            ]}
            value={geltenderRahmen(layout, m.coverFrame)}
            onChange={(v) => update((w) => (w.meta.coverFrame = v as 'schlicht' | 'polaroid'))}
          />
        </div>
        <Select
          size="xs"
          w={120}
          label="Farbe"
          // Ohne eigene Wahl folgt das Deckblatt der Fachfarbe (Paket 10a)
          data={[{ value: FACH_COVER_ID, label: 'Fachfarbe' }, ...COVER_DESIGNS.map((d) => ({ value: d.id, label: d.label }))]}
          value={m.coverDesign ?? FACH_COVER_ID}
          allowDeselect={false}
          onChange={(v) => v && update((w) => (w.meta.coverDesign = v))}
        />
        <Select
          size="xs"
          w={140}
          label="Maskottchen"
          data={DECKBLATT_MASKOTTCHEN}
          value={maskottchen}
          allowDeselect={false}
          onChange={(v) => v && update((w) => (w.meta.coverMascot = v as DeckblattMaskottchen))}
        />
        {maskottchen === 'tier' && (
          <Select
            size="xs"
            w={110}
            label="Tier"
            data={DECKBLATT_TIERE.map((t) => ({ value: t.value, label: t.label }))}
            value={m.coverAnimal ?? 'eule'}
            allowDeselect={false}
            onChange={(v) =>
              v &&
              update((w) => {
                w.meta.coverAnimal = v as DeckblattTier
                // Das gezeichnete Bild gehörte zum bisherigen Tier
                delete w.meta.coverAnimalImage
              })
            }
          />
        )}
        {(maskottchen === 'fuchs' || maskottchen === 'tier') && (
          <Tooltip label="Die Bild-KI zeichnet ein neues Maskottchen passend zu Fach und Thema – im Hintergrund, mit Kontingent" multiline w={260}>
            <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} onClick={onZeichnen}>
              Neu zeichnen (KI)
            </Button>
          </Tooltip>
        )}
        {maskottchen === 'bild' && (
          <FileButton
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={async (datei) => {
              if (!datei) return
              try {
                // Verkleinert: Das Bild liegt im Blatt selbst und soll es nicht aufblähen
                const bild = await normalizeImage(await readFileAsDataUrl(datei), 800)
                update((w) => (w.meta.coverOwnImage = bild))
              } catch (e) {
                notifyError(e, 'Das Bild konnte nicht gelesen werden')
              }
            }}
          >
            {(props) => (
              <Button size="xs" variant="light" leftSection={<IconPhotoPlus size={14} />} {...props}>
                {m.coverOwnImage ? 'Anderes Bild …' : 'Bild wählen …'}
              </Button>
            )}
          </FileButton>
        )}
        <Button size="xs" variant="default" leftSection={<IconFiles size={14} />} onClick={onSeitenwahl}>
          Seiten ({karten.length}) …
        </Button>
        <Tooltip label="Alle Seiten wieder nach dem Layout legen">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRestore size={14} />}
            disabled={!eigen}
            onClick={() => update((w) => delete w.meta.coverArrangement)}
          >
            Anordnung zurücksetzen
          </Button>
        </Tooltip>
      </Group>
      <Text size="xs" c="dimmed" mt={6}>
        Seiten auf dem Deckblatt ziehen, am runden Griff drehen, an der Ecke vergrößern; ein Klick zeigt „Nach vorn", „Nach hinten", „Austauschen".
      </Text>
    </Paper>
  )
}

/** Verkleinerte Seite als Knopf in der Seitenwahl */
function Miniatur({ inhalt, quer }: { inhalt: React.ReactNode; quer: boolean }): React.JSX.Element {
  const breitePx = quer ? 150 : 106
  const seiteMm = quer ? 297 : 210
  const skala = breitePx / ((seiteMm * 96) / 25.4)
  return (
    <div className="deckblatt-miniatur" style={{ width: breitePx, height: breitePx * (quer ? 210 / 297 : 297 / 210) }}>
      <div style={{ width: `${seiteMm}mm`, height: `${quer ? 210 : 297}mm`, transform: `scale(${skala})`, transformOrigin: 'top left' }}>{inhalt}</div>
    </div>
  )
}

/**
 * Seitenwahl mit Miniaturen: hinzufügen und entfernen (bis acht) – oder, mit `tausch`, die
 * Seite einer Karte gegen eine andere austauschen. Die Karte behält dabei ihre Lage.
 */
export function DeckblattSeitenwahl({
  ws,
  vorschau,
  tausch,
  offen,
  onClose,
  update
}: {
  ws: Worksheet
  vorschau: DeckblattVorschau
  /** Schlüssel der Seite, die ersetzt werden soll; null = hinzufügen/entfernen */
  tausch: string | null
  offen: boolean
  onClose: () => void
  update: (fn: (w: Worksheet) => void) => void
}): React.JSX.Element {
  const { karten } = deckblattLage(ws.meta, vorschau.kandidaten)
  const gezeigt = karten.map((k) => k.seite)
  const voll = gezeigt.length >= DECKBLATT_HOECHSTENS

  const waehle = (schluessel: string): void => {
    if (tausch) {
      update((w) => {
        w.meta.coverPages = gezeigt.map((s) => (s === tausch ? schluessel : s))
        // Die neue Seite übernimmt Lage, Größe und Drehung der alten
        const liste = w.meta.coverArrangement?.length ? w.meta.coverArrangement : karten.map((k) => ({ ...k }))
        w.meta.coverArrangement = liste.map((k) => (k.seite === tausch ? { ...k, seite: schluessel } : k))
      })
      onClose()
      return
    }
    update((w) => {
      if (gezeigt.includes(schluessel)) {
        w.meta.coverPages = gezeigt.filter((s) => s !== schluessel)
        if (w.meta.coverArrangement) w.meta.coverArrangement = w.meta.coverArrangement.filter((k) => k.seite !== schluessel)
        // Eine neu hinzugefügte Seite bekommt ihren Platz aus dem Layout (siehe `geltendeAnordnung`)
      } else w.meta.coverPages = [...gezeigt, schluessel]
    })
  }

  return (
    <Modal
      opened={offen}
      onClose={onClose}
      size="xl"
      title={tausch ? 'Seite austauschen' : `Seiten auf dem Deckblatt (${gezeigt.length} von höchstens ${DECKBLATT_HOECHSTENS})`}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {tausch
              ? 'Die gewählte Seite nimmt Platz, Größe und Drehung der bisherigen ein.'
              : 'Ein Klick nimmt eine Seite auf oder heraus. Ohne eigene Wahl zeigt das Deckblatt vier bis sechs aussagekräftige Seiten.'}
          </Text>
          {!tausch && (
            <Button
              size="xs"
              variant="default"
              disabled={!ws.meta.coverPages}
              onClick={() =>
                update((w) => {
                  delete w.meta.coverPages
                  delete w.meta.coverArrangement
                })
              }
            >
              Automatisch wählen
            </Button>
          )}
        </Group>
        <ScrollArea.Autosize mah="65vh">
          <SimpleGrid cols={{ base: 3, sm: 4, md: 5 }} spacing="sm">
            {vorschau.kandidaten.map((k) => {
              const drin = gezeigt.includes(k.schluessel)
              const gesperrt = tausch ? drin : !drin && voll
              return (
                <UnstyledButton
                  key={k.schluessel}
                  className={`deckblatt-kandidat ${drin ? 'deckblatt-kandidat-drin' : ''}`}
                  data-kandidat={k.schluessel}
                  disabled={gesperrt}
                  aria-pressed={tausch ? undefined : drin}
                  aria-label={`${k.titel}${drin ? ' (auf dem Deckblatt)' : ''}`}
                  onClick={() => waehle(k.schluessel)}
                >
                  <Stack gap={4} align="center">
                    <Miniatur inhalt={vorschau.seite(k.schluessel)} quer={istQuer(k.schluessel)} />
                    <Group gap={4} wrap="nowrap">
                      {!tausch && <Checkbox size="xs" checked={drin} readOnly tabIndex={-1} aria-hidden />}
                      <Text size="xs" ta="center" lineClamp={2}>
                        {k.titel}
                      </Text>
                    </Group>
                    {tausch && drin && (
                      <Badge size="xs" variant="light">
                        schon da
                      </Badge>
                    )}
                  </Stack>
                </UnstyledButton>
              )
            })}
          </SimpleGrid>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  )
}
