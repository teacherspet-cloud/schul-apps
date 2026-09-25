import {
  Alert,
  Button,
  Group,
  Image,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  UnstyledButton
} from '@mantine/core'
import { IconMoodSmile, IconPhoto, IconSearch, IconSparkles, IconUpload } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { OnlineImageHit, OnlineImageSource, OpenMojiHit } from '@shared/types'
import { aiImagePrompt, generateAiImage, imageCredit, openMojiAsPng, PickedImage, preparePickedImage } from '../images'
import { notifyError, readFileAsDataUrl, svgToDataUrl } from '../util'
import DropZone, { FILE_TYPES } from './DropZone'

interface Props {
  opened: boolean
  onClose: () => void
  onPick: (img: PickedImage) => void
  /** Vorbelegte Suchbegriffe (englisch) */
  keywords: string[]
  /** Bilder aus dem Material der Lehrkraft (optional eigener Reiter) */
  materialImages?: { name: string; dataUrl: string }[]
  /** Historische Bildquelle: direkt im Reiter „Online“ mit Wikimedia Commons beginnen */
  sourceSearch?: string
}

/** Bildauswahl mit vier Quellen: Piktogramme, eigene Bilder, Online-Suche, KI – optional Material. */
export default function ImagePicker({ opened, onClose, onPick, keywords, materialImages, sourceSearch }: Props): React.JSX.Element {
  const [tab, setTab] = useState<string | null>(sourceSearch ? 'online' : materialImages?.length ? 'material' : 'openmoji')
  const pick = (img: PickedImage): void => {
    onPick(img)
    onClose()
  }
  return (
    <Modal opened={opened} onClose={onClose} title="Bild auswählen" size="xl">
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          {materialImages && materialImages.length > 0 && (
            <Tabs.Tab value="material" leftSection={<IconPhoto size={16} />}>
              Material
            </Tabs.Tab>
          )}
          <Tabs.Tab value="openmoji" leftSection={<IconMoodSmile size={16} />}>
            Piktogramme
          </Tabs.Tab>
          <Tabs.Tab value="own" leftSection={<IconUpload size={16} />}>
            Eigenes Bild
          </Tabs.Tab>
          <Tabs.Tab value="online" leftSection={<IconPhoto size={16} />}>
            Online-Suche
          </Tabs.Tab>
          <Tabs.Tab value="ai" leftSection={<IconSparkles size={16} />}>
            KI-Bild
          </Tabs.Tab>
        </Tabs.List>
        {materialImages && materialImages.length > 0 && (
          <Tabs.Panel value="material">
            <SimpleGrid cols={4} spacing="xs">
              {materialImages.map((m, i) => (
                <UnstyledButton key={i} className="picker-tile" onClick={() => pick({ dataUrl: m.dataUrl, source: 'own', credit: m.name })}>
                  <Image src={m.dataUrl} h={110} fit="contain" />
                  <Text size="10px" lineClamp={1}>
                    {m.name}
                  </Text>
                </UnstyledButton>
              ))}
            </SimpleGrid>
          </Tabs.Panel>
        )}
        <Tabs.Panel value="openmoji">
          <OpenMojiTab keywords={keywords} onPick={pick} />
        </Tabs.Panel>
        <Tabs.Panel value="own">
          <DropZone
            accept={FILE_TYPES.image}
            multiple={false}
            title="Bild hierher ziehen oder klicken"
            hint="JPG, PNG, WEBP, GIF"
            minHeight={220}
            onFiles={async (files) => {
              try {
                const url = await preparePickedImage(await readFileAsDataUrl(files[0]), 800)
                pick({ dataUrl: url, source: 'own' })
              } catch (e) {
                notifyError(e)
              }
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="online">
          <OnlineTab keywords={sourceSearch ? [sourceSearch, ...keywords] : keywords} onPick={pick} initialSource={sourceSearch ? 'wikimedia' : 'openverse'} />
        </Tabs.Panel>
        <Tabs.Panel value="ai">
          <AiTab keywords={keywords} onPick={pick} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}

function SearchBar({ initial, onSearch, loading }: { initial: string; onSearch: (q: string) => void; loading: boolean }): React.JSX.Element {
  const [q, setQ] = useState(initial)
  return (
    <Group mb="md">
      <TextInput
        style={{ flex: 1 }}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch(q)}
        placeholder="Suchbegriff (englisch)"
        leftSection={<IconSearch size={16} />}
      />
      <Button onClick={() => onSearch(q)} loading={loading}>
        Suchen
      </Button>
    </Group>
  )
}

function OpenMojiTab({ keywords, onPick }: { keywords: string[]; onPick: (img: PickedImage) => void }): React.JSX.Element {
  const [hits, setHits] = useState<(OpenMojiHit & { preview?: string })[]>([])
  const [loading, setLoading] = useState(false)

  const search = async (q: string): Promise<void> => {
    setLoading(true)
    try {
      const found = await window.api.images.searchOpenMoji(q)
      const withPreview = await Promise.all(
        found.slice(0, 48).map(async (h) => ({ ...h, preview: svgToDataUrl(await window.api.images.openMojiSvg(h.hexcode)) }))
      )
      setHits(withPreview)
    } catch (e) {
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void search(keywords[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <SearchBar initial={keywords[0] ?? ''} onSearch={search} loading={loading} />
      {keywords.length > 1 && (
        <Group gap={6} mb="sm">
          <Text size="xs" c="dimmed">
            Vorschläge:
          </Text>
          {keywords.map((k) => (
            <Button key={k} size="compact-xs" variant="light" onClick={() => search(k)}>
              {k}
            </Button>
          ))}
        </Group>
      )}
      <ScrollArea h={380}>
        {!loading && hits.length === 0 && <Text c="dimmed">Keine Piktogramme gefunden. Anderen Begriff versuchen.</Text>}
        <SimpleGrid cols={8} spacing="xs">
          {hits.map((h) => (
            <UnstyledButton
              key={h.hexcode}
              title={h.annotation}
              onClick={async () => onPick({ dataUrl: await openMojiAsPng(h.hexcode), source: 'openmoji', credit: 'OpenMoji, CC BY-SA 4.0' })}
              className="picker-tile"
            >
              <Image src={h.preview} h={64} fit="contain" />
              <Text size="10px" ta="center" lineClamp={1}>
                {h.annotation}
              </Text>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </ScrollArea>
    </>
  )
}

function OnlineTab({
  keywords,
  onPick,
  initialSource
}: {
  keywords: string[]
  onPick: (img: PickedImage) => void
  initialSource: OnlineImageSource
}): React.JSX.Element {
  const [source, setSource] = useState<OnlineImageSource>(initialSource)
  const [hits, setHits] = useState<OnlineImageHit[]>([])
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  const search = async (q: string): Promise<void> => {
    if (!q.trim()) return
    setLoading(true)
    try {
      setHits(await window.api.images.searchOnline(q, source))
    } catch (e) {
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SegmentedControl
        mb="sm"
        value={source}
        onChange={(v) => setSource(v as OnlineImageSource)}
        data={[
          { value: 'openverse', label: 'Openverse (CC-Lizenzen)' },
          { value: 'wikimedia', label: 'Wikimedia Commons (Bildquellen)' },
          { value: 'clipart', label: 'Cliparts (gemeinfrei)' },
          { value: 'pixabay', label: 'Pixabay' }
        ]}
      />
      <SearchBar initial={keywords[0] ?? ''} onSearch={search} loading={loading} />
      <Alert color="gray" mb="sm" p="xs">
        <Text size="xs">Bitte die angezeigte Lizenz beachten. Der Bildnachweis wird automatisch unten auf dem Test vermerkt.</Text>
      </Alert>
      <ScrollArea h={340}>
        <SimpleGrid cols={5} spacing="xs">
          {hits.map((h) => (
            <UnstyledButton
              key={h.id}
              disabled={picking !== null}
              onClick={async () => {
                setPicking(h.id)
                try {
                  const raw = await window.api.images.fetch(h.url)
                  onPick({
                    dataUrl: await preparePickedImage(raw, 800),
                    source: h.source,
                    credit: imageCredit(h)
                  })
                } catch (e) {
                  notifyError(e)
                } finally {
                  setPicking(null)
                }
              }}
              className="picker-tile"
              style={{ position: 'relative' }}
            >
              <Image src={h.thumbnail} h={100} fit="contain" />
              <Text size="10px" lineClamp={1}>
                {h.license} · {h.creator}
              </Text>
              {picking === h.id && <Loader size="sm" style={{ position: 'absolute', top: 8, right: 8 }} />}
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </ScrollArea>
    </>
  )
}

function AiTab({ keywords, onPick }: { keywords: string[]; onPick: (img: PickedImage) => void }): React.JSX.Element {
  const [prompt, setPrompt] = useState(aiImagePrompt(keywords[0] ?? ''))
  const [result, setResult] = useState<PickedImage | null>(null)
  const [loading, setLoading] = useState(false)
  return (
    <Stack>
      <Textarea label="Bildbeschreibung" autosize minRows={3} value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} />
      <Group>
        <Button
          leftSection={<IconSparkles size={16} />}
          loading={loading}
          onClick={async () => {
            setLoading(true)
            try {
              setResult(await generateAiImage(prompt))
            } catch (e) {
              notifyError(e)
            } finally {
              setLoading(false)
            }
          }}
        >
          Bild erzeugen
        </Button>
        <Text size="xs" c="dimmed">
          Dauert etwa 10–40 Sekunden und kostet einige Cent.
        </Text>
      </Group>
      {result && (
        <Group align="end">
          <Image src={result.dataUrl} h={220} w={220} fit="contain" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }} />
          <Button onClick={() => onPick(result)}>Dieses Bild verwenden</Button>
        </Group>
      )}
    </Stack>
  )
}
