import { Box, Button, Group, Modal, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconCertificate, IconPencil, IconTrash } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/types'
import DropZone, { FILE_TYPES } from '../shared/components/DropZone'
import { notifyError, notifySuccess, readFileAsDataUrl } from '../shared/util'

/**
 * Briefkopf der Elternbriefe (29.09.2026): Absender (Lehrkraft, Anschrift, Telefon der Schule),
 * Bild der Unterschrift und – wahlweise – digitale Signatur der Brief-PDFs mit einem Zertifikat.
 * Anschrift und Telefon füllt die Schulsuche vor; alles bleibt änderbar.
 */

type Briefkopf = NonNullable<AppSettings['briefkopf']>

/** Heller Hintergrund eines Fotos/Scans wird durchsichtig, das Bild auf die Unterschrift zugeschnitten */
export async function unterschriftAusBild(dataUrl: string): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const skala = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight))
  const b = Math.round(img.naturalWidth * skala)
  const h = Math.round(img.naturalHeight * skala)
  const c = document.createElement('canvas')
  c.width = b
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, b, h)
  const bild = g.getImageData(0, 0, b, h)
  const p = bild.data
  let x0 = b
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let i = 0; i < b * h; i++) {
    const hell = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3
    // Papier und Schatten weg, Tinte bleibt; weicher Übergang gegen Treppenkanten
    const deckung = hell > 200 ? 0 : hell < 120 ? 1 : (200 - hell) / 80
    p[i * 4 + 3] = Math.round(p[i * 4 + 3] * deckung)
    if (deckung > 0.3) {
      const x = i % b
      const y = (i - x) / b
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) throw new Error('Auf dem Bild ist keine Unterschrift zu erkennen.')
  g.putImageData(bild, 0, 0)
  const rand = 6
  const zu = document.createElement('canvas')
  zu.width = x1 - x0 + 1 + 2 * rand
  zu.height = y1 - y0 + 1 + 2 * rand
  zu.getContext('2d')!.drawImage(c, x0 - rand, y0 - rand, zu.width, zu.height, 0, 0, zu.width, zu.height)
  return zu.toDataURL('image/png')
}

function Zeichenflaeche({ offen, schliessen, fertig }: { offen: boolean; schliessen: () => void; fertig: (png: string) => void }): React.JSX.Element {
  const flaeche = useRef<HTMLCanvasElement | null>(null)
  const zeichnet = useRef(false)
  const [leer, setLeer] = useState(true)
  useEffect(() => {
    if (!offen) return
    setLeer(true)
    const t = setTimeout(() => {
      const c = flaeche.current
      if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    }, 50)
    return () => clearTimeout(t)
  }, [offen])
  const punkt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height]
  }
  return (
    <Modal opened={offen} onClose={schliessen} title="Unterschrift zeichnen" size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Mit Maus, Stift oder Finger in das Feld schreiben.
        </Text>
        <canvas
          ref={flaeche}
          width={900}
          height={300}
          style={{
            width: '100%',
            aspectRatio: '3 / 1',
            border: '1px dashed var(--mantine-color-gray-5)',
            borderRadius: 6,
            touchAction: 'none',
            background: '#fff'
          }}
          onPointerDown={(e) => {
            zeichnet.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            const g = e.currentTarget.getContext('2d')!
            const [x, y] = punkt(e)
            g.beginPath()
            g.moveTo(x, y)
          }}
          onPointerMove={(e) => {
            if (!zeichnet.current) return
            const g = e.currentTarget.getContext('2d')!
            g.lineWidth = 4 + (e.pressure || 0.5) * 3
            g.lineCap = 'round'
            g.lineJoin = 'round'
            g.strokeStyle = '#1a2a5a'
            const [x, y] = punkt(e)
            g.lineTo(x, y)
            g.stroke()
            setLeer(false)
          }}
          onPointerUp={() => (zeichnet.current = false)}
          data-unterschrift-flaeche
        />
        <Group justify="space-between">
          <Button
            variant="default"
            onClick={() => {
              const c = flaeche.current
              if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
              setLeer(true)
            }}
          >
            Leeren
          </Button>
          <Button disabled={leer} onClick={() => flaeche.current && fertig(flaeche.current.toDataURL('image/png'))} data-unterschrift-uebernehmen>
            Übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export default function BriefkopfFelder({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => void }): React.JSX.Element {
  const kopf: Briefkopf = settings.briefkopf ?? {}
  const [werte, setWerte] = useState<Briefkopf>(kopf)
  const [unterschrift, setUnterschrift] = useState<string | null>(null)
  const [zeichnen, setZeichnen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  // Die Schulwahl füllt Anschrift und Telefon von außen – dann die Felder nachziehen
  useEffect(() => setWerte(settings.briefkopf ?? {}), [settings.briefkopf])
  useEffect(() => {
    window.api.branding
      .getUnterschrift()
      .then(setUnterschrift)
      .catch(() => setUnterschrift(null))
  }, [])

  const setze = (feld: keyof Briefkopf, wert: string | boolean | undefined): void => update({ briefkopf: { ...(settings.briefkopf ?? {}), [feld]: wert } })
  const feld = (name: keyof Briefkopf, label: string, placeholder = ''): React.JSX.Element => (
    <TextInput
      label={label}
      placeholder={placeholder}
      value={String(werte[name] ?? '')}
      onChange={(e) => {
        const x = e.currentTarget.value
        setWerte((w) => ({ ...w, [name]: x }))
      }}
      onBlur={() => werte[name] !== kopf[name] && setze(name, String(werte[name] ?? '').trim())}
      data-briefkopf={name}
    />
  )

  const speichereUnterschrift = async (png: string): Promise<void> => {
    await window.api.branding.setUnterschrift(png)
    setUnterschrift(png)
    notifySuccess('Unterschrift gespeichert.')
  }

  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={500}>
          Briefkopf der Elternbriefe
        </Text>
        <Text size="xs" c="dimmed">
          Absender oben links im Brief. Anschrift und Telefon kommen bei der Wahl der Schule aus dem Schulverzeichnis, soweit es sie führt.
        </Text>
      </div>
      {feld('lehrkraft', 'Name der Lehrkraft', 'z. B. Frau Müller')}
      {feld('strasse', 'Straße und Hausnummer')}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        {feld('plz', 'PLZ')}
        {feld('ort', 'Ort')}
        {feld('telefon', 'Telefon der Schule')}
      </SimpleGrid>

      <div>
        <Text size="sm" fw={500}>
          Unterschrift
        </Text>
        <Text size="xs" c="dimmed" mb={6}>
          Erscheint in Elternbriefen über dem Namen. Bleibt auf diesem Rechner – nicht im Netzzugang, nicht in Schulpaketen, nie an eine KI.
        </Text>
        <Group align="stretch" wrap="nowrap">
          {unterschrift && (
            <Stack gap={6} align="center" justify="center" className="picker-tile" p="sm" w={200}>
              <img src={unterschrift} alt="Unterschrift" style={{ maxWidth: 170, maxHeight: 70, objectFit: 'contain' }} data-unterschrift-bild />
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={12} />}
                onClick={() =>
                  void window.api.branding
                    .removeUnterschrift()
                    .then(() => setUnterschrift(null))
                    .catch(notifyError)
                }
              >
                Entfernen
              </Button>
            </Stack>
          )}
          <Box style={{ flex: 1 }}>
            <DropZone
              onFiles={async (files) => {
                if (!files[0]) return
                setLaedt(true)
                try {
                  // Über die Zeichenfläche wie normalizeImage: Metadaten (EXIF) fallen dabei weg
                  await speichereUnterschrift(await unterschriftAusBild(await readFileAsDataUrl(files[0])))
                } catch (e) {
                  notifyError(e)
                } finally {
                  setLaedt(false)
                }
              }}
              accept={FILE_TYPES.image}
              multiple={false}
              loading={laedt}
              minHeight={80}
              title="Foto oder Scan der Unterschrift hierher ziehen oder klicken"
              hint="Auf weißem Papier, dunkler Stift – der Hintergrund wird durchsichtig"
            />
            <Button mt={6} size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => setZeichnen(true)} data-unterschrift-zeichnen>
              Stattdessen zeichnen …
            </Button>
          </Box>
        </Group>
      </div>
      <Zeichenflaeche
        offen={zeichnen}
        schliessen={() => setZeichnen(false)}
        fertig={(png) => {
          setZeichnen(false)
          void unterschriftAusBild(png).then(speichereUnterschrift).catch(notifyError)
        }}
      />

      <div>
        <Text size="sm" fw={500}>
          Digitale Signatur der Brief-PDFs
        </Text>
        <Text size="xs" c="dimmed" mb={6}>
          Mit einem Zertifikat (.pfx oder .p12) wird das PDF kryptografisch signiert: PDF-Programme zeigen, von wem es stammt und dass es danach nicht verändert
          wurde. Das Passwort wird bei jedem Signieren abgefragt und nie gespeichert. Ein selbst erstelltes Zertifikat gilt nur als „Identität unbekannt"; eine
          qualifizierte Signatur (ersetzt die handschriftliche) braucht ein Zertifikat eines Vertrauensdiensteanbieters bzw. des Dienstherrn.
        </Text>
        <Group gap="sm">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconCertificate size={14} />}
            onClick={() =>
              void window.api.briefkopf
                .zertifikatWaehlen()
                .then((pfad) => pfad && update({ briefkopf: { ...(settings.briefkopf ?? {}), zertifikat: pfad, signieren: true } }))
                .catch(notifyError)
            }
            data-zertifikat-waehlen
          >
            {kopf.zertifikat ? 'Anderes Zertifikat …' : 'Zertifikat wählen …'}
          </Button>
          {kopf.zertifikat && (
            <>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all', flex: 1 }}>
                {kopf.zertifikat}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => update({ briefkopf: { ...(settings.briefkopf ?? {}), zertifikat: '', signieren: false } })}
              >
                Entfernen
              </Button>
            </>
          )}
        </Group>
        <Switch
          mt="xs"
          label="Brief-PDFs beim Speichern digital signieren"
          disabled={!kopf.zertifikat}
          checked={Boolean(kopf.zertifikat && kopf.signieren)}
          onChange={(e) => setze('signieren', e.currentTarget.checked)}
        />
      </div>
    </Stack>
  )
}
