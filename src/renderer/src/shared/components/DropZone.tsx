import { useEffect, useRef, useState } from 'react'
import { notifyInfo } from '../util'
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
  /**
   * Eingefügtes erst sammeln (07.10.2026): Für Ablagen, die bei jeder Datei neu auswerten und ersetzen (z. B. die
   * Aufgabe einer Rückmeldung). Mehrere Screenshots nacheinander mit Strg+V – übernommen wird alles zusammen.
   */
  sammeln?: boolean
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

/*
 * Einfügen aus der Zwischenablage (07.10.2026, Wunsch der Lehrkraft): Strg+V legt kopierte Bilder und Text in
 * die Ablage – wie hineingezogene Dateien. Text wird zur Datei „Eingefügter Text.txt" (alle Ablagen, die Text
 * annehmen, lesen .txt). In Eingabefeldern bleibt Strg+V das normale Einfügen.
 *
 * Welche Ablage? Die zuletzt angeklickte oder überfahrene, sonst die erste sichtbare – bei offenem Dialog nur
 * die im Dialog. Zugeklappte und ausgeblendete Programme zählen nicht.
 */
let zuletzt: HTMLElement | null = null

const sichtbar = (el: HTMLElement): boolean => el.isConnected && el.offsetParent !== null

function zielAblage(): HTMLElement | null {
  const alle = [...document.querySelectorAll<HTMLElement>('[data-drop-ablage]')].filter(sichtbar)
  const imDialog = alle.filter((el) => el.closest('.mantine-Modal-content'))
  const kandidaten = imDialog.length ? imDialog : alle
  if (zuletzt && kandidaten.includes(zuletzt)) return zuletzt
  return kandidaten[0] ?? null
}

const passt = (accept: string[], typ: string, name: string): boolean =>
  accept.some((a) => a === typ || (a.endsWith('/*') && typ.startsWith(a.slice(0, -1))) || (a.startsWith('.') && name.toLowerCase().endsWith(a)))

/**
 * Fortlaufende Nummern für eingefügte Bilder und Texte (07.10.2026, Wunsch der Lehrkraft: mehrere Screenshots
 * nacheinander einfügen, bevor das Material entsteht) – jede Einfügung kommt hinzu und ist in der Liste unterscheidbar.
 */
let bilder = 0
let texte = 0

/** Dateien aus der Zwischenablage, passend zur Ablage; Text als .txt, wenn die Ablage Text annimmt */
export function ausZwischenablage(daten: DataTransfer, accept: string[]): { dateien: File[]; abgelehnt: boolean } {
  const roh = [...daten.files]
  const dateien = roh
    .filter((f) => passt(accept, f.type, f.name))
    .map((f) => {
      // Kopierte Bilder heißen meist „image.png" – ein sprechender, fortlaufender Name (mehrere Screenshots nacheinander)
      if (!f.type.startsWith('image/') || !/^image\.\w+$/i.test(f.name)) return f
      return new File([f], `Eingefügtes Bild ${++bilder}.${f.type.split('/')[1] || 'png'}`, { type: f.type })
    })
  const text = daten.getData('text/plain')
  if (!dateien.length && text.trim() && passt(accept, 'text/plain', 'Eingefügter Text.txt')) {
    texte++
    dateien.push(new File([text], texte > 1 ? `Eingefügter Text ${texte}.txt` : 'Eingefügter Text.txt', { type: 'text/plain' }))
  }
  return { dateien, abgelehnt: !dateien.length && (roh.length > 0 || Boolean(text.trim())) }
}

/** Gemeinsame Drag-&-Drop-Fläche für alle Module. */
export default function DropZone({ onFiles, accept, title, hint, loading, multiple = true, minHeight = 140, sammeln }: Props): React.JSX.Element {
  // Mit dem Finger zieht niemand Dateien auf die Fläche – dort heißt es „… auswählen" (Antippen öffnet die Auswahl)
  const touch = useTouch()
  const titel = touch ? title.replace(/ hierher ziehen( oder klicken)?$/, ' auswählen') : title
  const huelle = useRef<HTMLDivElement>(null)
  // Gesammelte Einfügungen (nur mit `sammeln`)
  const [gesammelt, setGesammelt] = useState<File[]>([])
  // Immer die aktuellen Werte – der Horcher bleibt stehen
  const aktuell = useRef({ onFiles, accept, multiple, loading, sammeln })
  aktuell.current = { onFiles, accept, multiple, loading, sammeln }
  useEffect(() => {
    const beimEinfuegen = (e: ClipboardEvent): void => {
      const el = huelle.current
      if (!el || !e.clipboardData || e.defaultPrevented) return
      const ziel = e.target instanceof HTMLElement ? e.target : null
      // In Eingabefeldern bleibt Einfügen Einfügen
      if (ziel?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') && !el.contains(ziel)) return
      if (zielAblage() !== el) return
      const { onFiles: weiter, accept: erlaubt, multiple: mehrere, loading: laedt, sammeln: sammle } = aktuell.current
      if (laedt) return
      const { dateien, abgelehnt } = ausZwischenablage(e.clipboardData, erlaubt)
      if (abgelehnt) {
        notifyInfo('Das Eingefügte passt hier nicht – erlaubt sind die in der Ablage genannten Dateiarten.')
        return
      }
      if (!dateien.length) return
      e.preventDefault()
      if (sammle && mehrere) setGesammelt((g) => [...g, ...dateien])
      else weiter(mehrere ? dateien : dateien.slice(0, 1))
    }
    document.addEventListener('paste', beimEinfuegen)
    return () => {
      document.removeEventListener('paste', beimEinfuegen)
      if (zuletzt === huelle.current) zuletzt = null
    }
  }, [])
  const merken = (): void => {
    zuletzt = huelle.current
  }
  const einfuegenHinweis = touch ? '' : 'oder mit Strg+V einfügen'
  const flaeche = (
    <div ref={huelle} data-drop-ablage onPointerEnter={merken} onPointerDown={merken} onFocusCapture={merken}>
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
            {(hint || einfuegenHinweis) && (
              <Text size="sm" c="dimmed">
                {[hint, einfuegenHinweis].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Stack>
        </Group>
      </Dropzone>
      {gesammelt.length > 0 && (
        <Group justify="space-between" gap="xs" mt={6} wrap="nowrap" data-gesammelt={gesammelt.length}>
          <Text size="sm" truncate>
            {gesammelt.length === 1 ? '1 Einfügung' : `${gesammelt.length} Einfügungen`} gesammelt: {gesammelt.map((f) => f.name).join(', ')}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Button size="compact-sm" variant="default" onClick={() => setGesammelt([])}>
              Verwerfen
            </Button>
            <Button
              size="compact-sm"
              onClick={() => {
                const alle = gesammelt
                setGesammelt([])
                onFiles(alle)
              }}
              data-gesammelt-uebernehmen
            >
              Übernehmen
            </Button>
          </Group>
        </Group>
      )}
    </div>
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
