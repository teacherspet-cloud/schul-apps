import { useState } from 'react'
import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { IconCamera, IconFileUpload, IconPhoto, IconScan, IconUpload, IconX } from '@tabler/icons-react'
import { useTouch } from '../touch/touchModus'

export const FILE_TYPES = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  csv: ['text/csv', 'text/plain'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
}

interface Props {
  onFiles: (files: File[]) => void
  accept: string[]
  title: string
  hint?: string
  loading?: boolean
  multiple?: boolean
  minHeight?: number
}

/** Läuft die Oberfläche in der iPad-/iPhone-App (Capacitor)? Am PC und im Browser: nein. */
function istIosApp(): boolean {
  const w = window as unknown as {
    __plattform?: string
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  }
  if (w.__plattform === 'ios') return true
  return !!w.Capacitor?.isNativePlatform?.() && w.Capacitor?.getPlatform?.() === 'ios'
}

function base64ZuDatei(base64: string, name: string, typ = 'image/jpeg'): File {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: typ })
}

/** Abbruch durch die Lehrkraft (Kamera/Fotos geschlossen) ist kein Fehler. */
function istAbbruch(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e)
  return /cancel|abgebrochen|dismiss/i.test(text)
}

type Quelle = 'kamera' | 'fotos' | 'scan'

/** Foto, Fotomediathek und Dokumentenscanner – nur in der iOS-App, nur wo Bilder erlaubt sind. */
function IosBildquellen({ onFiles, multiple, disabled }: { onFiles: (files: File[]) => void; multiple: boolean; disabled?: boolean }): React.JSX.Element {
  const [aktiv, setAktiv] = useState<Quelle | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const holen = async (quelle: Quelle): Promise<void> => {
    setFehler(null)
    setAktiv(quelle)
    try {
      let dateien: File[] = []
      if (quelle === 'kamera') {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
        const foto = await Camera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Base64,
          quality: 85,
          width: 2400,
          correctOrientation: true,
          saveToGallery: false
        })
        if (foto.base64String) dateien = [base64ZuDatei(foto.base64String, 'Foto 1.jpg')]
      } else if (quelle === 'fotos') {
        const { Camera } = await import('@capacitor/camera')
        const auswahl = await Camera.pickImages({ quality: 85, width: 2400, correctOrientation: true, limit: multiple ? 20 : 1 })
        dateien = await Promise.all(
          auswahl.photos.map(async (p, i) => {
            const blob = await (await fetch(p.webPath)).blob()
            const png = blob.type === 'image/png'
            return new File([blob], `Foto ${i + 1}.${png ? 'png' : 'jpg'}`, { type: png ? 'image/png' : 'image/jpeg' })
          })
        )
      } else {
        const { Scanner } = await import('schulapps-nativ')
        const { seiten } = await Scanner.scannen()
        dateien = seiten.map((b64, i) => base64ZuDatei(b64, `Scan ${i + 1}.jpg`))
      }
      if (!multiple) dateien = dateien.slice(0, 1)
      if (dateien.length) onFiles(dateien)
    } catch (e) {
      if (!istAbbruch(e)) setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setAktiv(null)
    }
  }

  const belegt = disabled || aktiv !== null
  return (
    <Stack gap={4}>
      <Group gap="xs" grow wrap="wrap" className="ios-bildquellen">
        <Button
          variant="light"
          leftSection={<IconCamera size={18} />}
          loading={aktiv === 'kamera'}
          disabled={belegt && aktiv !== 'kamera'}
          onClick={() => void holen('kamera')}
        >
          Foto aufnehmen
        </Button>
        <Button
          variant="light"
          leftSection={<IconPhoto size={18} />}
          loading={aktiv === 'fotos'}
          disabled={belegt && aktiv !== 'fotos'}
          onClick={() => void holen('fotos')}
        >
          Aus Fotos wählen
        </Button>
        <Button
          variant="light"
          leftSection={<IconScan size={18} />}
          loading={aktiv === 'scan'}
          disabled={belegt && aktiv !== 'scan'}
          onClick={() => void holen('scan')}
        >
          Dokument scannen
        </Button>
      </Group>
      {fehler && (
        <Text size="sm" c="red">
          Bild ließ sich nicht übernehmen: {fehler}
        </Text>
      )}
    </Stack>
  )
}

/** Gemeinsame Drag-&-Drop-Fläche für alle Module. */
export default function DropZone({ onFiles, accept, title, hint, loading, multiple = true, minHeight = 140 }: Props): React.JSX.Element {
  // Mit dem Finger zieht niemand Dateien auf die Fläche – dort heißt es „… auswählen" (Antippen öffnet die Auswahl)
  const touch = useTouch()
  const titel = touch ? title.replace(/ hierher ziehen( oder klicken)?$/, ' auswählen') : title
  const flaeche = (
    <Dropzone
      onDrop={onFiles}
      accept={accept}
      multiple={multiple}
      loading={loading}
      maxSize={40 * 1024 ** 2}
      radius="md"
      loaderProps={{ children: <Loader /> }}
    >
      <Group justify="center" gap="lg" mih={minHeight} style={{ pointerEvents: 'none' }}>
        <Dropzone.Accept>
          <IconUpload size={48} stroke={1.5} color="var(--mantine-primary-color-filled)" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={48} stroke={1.5} color="var(--mantine-color-red-6)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconFileUpload size={48} stroke={1.5} color="var(--mantine-color-dimmed)" />
        </Dropzone.Idle>
        <Stack gap={2}>
          <Text size="lg" fw={600}>
            {titel}
          </Text>
          {hint && (
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
      </Group>
    </Dropzone>
  )

  // Am PC unverändert: nur die Fläche.
  if (!istIosApp() || !accept.some((a) => a.startsWith('image/'))) return flaeche
  return (
    <Stack gap="xs">
      {flaeche}
      <IosBildquellen onFiles={onFiles} multiple={multiple} disabled={loading} />
    </Stack>
  )
}
