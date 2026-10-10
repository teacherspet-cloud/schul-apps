import { Alert, Box, Button, Center, Group, Loader, Modal, SegmentedControl, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconDeviceFloppy, IconEye } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { pdfMitSeiten } from '@shared/seitenPdf'
import { renderPages } from '../components/PrintPreview'
import { aufIos } from '../plattform'
import { notifyError } from '../util'
import { alsVorschau, vorschauArt, vorschauPdfs, type VorschauPdf, type VorschauQuelle } from './pdfVorschauLogik'

/**
 * Das Vorschaufenster für PDFs (10.10.2026, Logik in export/pdfVorschauLogik.ts).
 *
 * Zeigt dieselben PDFs, die gespeichert würden – ohne sie irgendwo abzulegen. Am PC (Exe und
 * Browser) im Rahmen mit dem PDF-Betrachter, auf iPad/iPhone, Android und ohne eingebauten
 * Betrachter als Seitenbilder (pdf.js). Auf dem Handy füllt es den Bildschirm. „PDF speichern"
 * nimmt danach den gewohnten Weg (Speichern-Dialog, Download, Ablage der iPad-App).
 */

interface Anfrage {
  pdfs: VorschauPdf[]
  /** Dateien, die beim Speichern dazukommen, aber keine Vorschau haben (Word, MP3, Bilder) */
  weitere: string[]
  fertig: (speichern: boolean) => void
}

const useVorschau = create<{ anfrage: Anfrage | null }>(() => ({ anfrage: null }))

/** Fenster zeigen; true = „PDF speichern", false = geschlossen */
export function zeigePdfVorschau(pdfs: VorschauPdf[], weitere: string[] = []): Promise<boolean> {
  return new Promise((fertig) => useVorschau.setState({ anfrage: { pdfs, weitere, fertig } }))
}

/** Die PDFs der Ausgabe im Speicher bauen – mit den Werkzeugen der Umgebung (PC, Server, iPad) */
export const baueVorschau = (quellen: VorschauQuelle[]): Promise<VorschauPdf[]> =>
  vorschauPdfs(quellen, {
    preview: (html) => window.api.exporter.preview(html),
    fillablePreview: (html, audio) => window.api.exporter.fillablePreview(html, audio),
    mitSeiten: pdfMitSeiten
  })

/**
 * Vorschau für Programme, die `exporter.pdf` direkt aufrufen (Zugangskarten, Ergebnislisten …):
 * erst zeigen, mit „PDF speichern" dann `speichern` – derselbe Aufruf wie ihr PDF-Knopf.
 */
export async function pdfVorschauAusHtml(html: string, name: string, speichern: () => Promise<unknown>): Promise<void> {
  try {
    const pdfs = await baueVorschau([{ name, html }])
    if (await zeigePdfVorschau(pdfs)) await speichern()
  } catch (e) {
    notifyError(e, 'Die Vorschau ließ sich nicht erstellen')
  }
}

/**
 * Knopf „Vorschau" neben „PDF"/„Speichern …": führt `ausgabe` (den PDF-Weg des Programms) als
 * Vorschau aus. `nachSpeichern` läuft, wenn aus dem Fenster heraus gespeichert wurde (z. B. den
 * Ausgabe-Dialog schließen).
 */
export function VorschauKnopf({
  ausgabe,
  nachSpeichern,
  disabled,
  size = 'sm',
  variant = 'default'
}: {
  ausgabe: () => Promise<unknown>
  nachSpeichern?: () => void
  disabled?: boolean
  size?: 'xs' | 'sm' | 'compact-sm' | 'compact-xs'
  variant?: 'default' | 'light' | 'subtle'
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  return (
    <Button
      size={size}
      variant={variant}
      leftSection={<IconEye size={size.startsWith('compact') || size === 'xs' ? 14 : 16} />}
      loading={laeuft}
      disabled={disabled}
      data-pdf-vorschau-knopf
      onClick={async () => {
        setLaeuft(true)
        try {
          const n = await alsVorschau(ausgabe)
          if (n > 0) nachSpeichern?.()
        } catch (e) {
          notifyError(e, 'Die Vorschau ließ sich nicht erstellen')
        } finally {
          setLaeuft(false)
        }
      }}
    >
      Vorschau
    </Button>
  )
}

/** Eine Datei im Fenster: Rahmen mit dem Betrachter des Browsers oder Seitenbilder */
function Anzeige({ pdf, art }: { pdf: VorschauPdf; art: 'rahmen' | 'seiten' }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [bilder, setBilder] = useState<string[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  useEffect(() => {
    setBilder(null)
    setFehler(null)
    if (art === 'rahmen') {
      const u = URL.createObjectURL(new Blob([new Uint8Array(pdf.bytes).slice().buffer], { type: 'application/pdf' }))
      setUrl(u)
      // Beim Schließen bzw. Wechsel der Datei freigeben
      return () => URL.revokeObjectURL(u)
    }
    let aus = false
    renderPages(new Uint8Array(pdf.bytes))
      .then((b) => !aus && setBilder(b))
      .catch((e: unknown) => !aus && setFehler(e instanceof Error ? e.message : String(e)))
    return () => {
      aus = true
    }
  }, [pdf, art])

  if (art === 'rahmen')
    return url ? (
      <iframe src={url} title={pdf.name} data-pdf-vorschau-rahmen style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#525659' }} />
    ) : (
      <Center h="100%">
        <Loader />
      </Center>
    )
  if (fehler)
    return (
      <Alert color="red" title="Die Seiten ließen sich nicht zeigen">
        {fehler}
      </Alert>
    )
  if (!bilder)
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  return (
    <Box h="100%" style={{ overflow: 'auto', background: 'var(--mantine-color-gray-6)', WebkitOverflowScrolling: 'touch' }} p="sm" data-pdf-vorschau-seiten>
      <Stack gap="sm" align="center">
        {bilder.map((b, i) => (
          <img
            key={i}
            src={b}
            alt={`Seite ${i + 1}`}
            data-pdf-vorschau-seite={i + 1}
            style={{ width: '100%', maxWidth: 900, height: 'auto', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }}
          />
        ))}
      </Stack>
    </Box>
  )
}

/** Einmal in main.tsx eingehängt – zeigt das Fenster, sobald eine Vorschau ansteht */
export function PdfVorschauHost(): React.JSX.Element | null {
  const anfrage = useVorschau((s) => s.anfrage)
  const [index, setIndex] = useState(0)
  const handy = useMediaQuery('(max-width: 48em)')
  useEffect(() => setIndex(0), [anfrage])
  if (!anfrage) return null
  const art = vorschauArt({
    pdfViewerEnabled: typeof navigator !== 'undefined' ? (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled : false,
    ios: aufIos() || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    userAgent: navigator.userAgent
  })
  const ende = (speichern: boolean): void => {
    useVorschau.setState({ anfrage: null })
    anfrage.fertig(speichern)
  }
  const pdf = anfrage.pdfs[Math.min(index, anfrage.pdfs.length - 1)]
  return (
    <Modal
      opened
      onClose={() => ende(false)}
      fullScreen={handy}
      size="min(1100px, 96vw)"
      title="Vorschau – noch nicht gespeichert"
      zIndex={400}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 8, height: handy ? 'calc(100dvh - 60px)' : 'min(82vh, 1200px)' } }}
      data-pdf-vorschau
    >
      {anfrage.pdfs.length > 1 && (
        <SegmentedControl
          size="xs"
          value={String(index)}
          onChange={(v) => setIndex(Number(v))}
          data={anfrage.pdfs.map((p, i) => ({ value: String(i), label: p.name.replace(/\.pdf$/i, '') }))}
        />
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>{pdf && <Anzeige key={index} pdf={pdf} art={art} />}</Box>
      {anfrage.weitere.length > 0 && (
        <Text size="xs" c="dimmed">
          Beim Speichern kommen dazu: {anfrage.weitere.join(', ')}
        </Text>
      )}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={() => ende(false)} data-pdf-vorschau-schliessen>
          Schließen
        </Button>
        <Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => ende(true)} data-pdf-vorschau-speichern>
          {anfrage.weitere.length || anfrage.pdfs.length > 1 ? 'Speichern' : 'PDF speichern'}
        </Button>
      </Group>
    </Modal>
  )
}
