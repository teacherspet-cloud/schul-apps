import { Alert, Box, Button, Center, Group, Loader, Modal, NumberInput, ScrollArea, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconPrinter } from '@tabler/icons-react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useMemo, useState } from 'react'
import type { PrinterInfo } from '../../../../preload/index'
import { parsePageRanges } from '../printRanges'
import { notifyError, notifySuccess } from '../util'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Seiten eines PDFs als Bilder. Auch von der Prüfmechanik benutzt (`__selftest.renderPdf`). */
export async function renderPages(data: Uint8Array): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 1.3 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    pages.push(canvas.toDataURL('image/jpeg', 0.85))
  }
  await pdf.cleanup()
  return pages
}

const PRINTER_KEY = 'schulapps.printer'

/**
 * Druckvorschau mit Seitenansicht: zeigt genau die Seiten, die gedruckt werden,
 * und druckt mit gewähltem Drucker, Exemplaren, Seitenbereich, Duplex und Farbe.
 *
 * `loesung`: Lösungen (bzw. Erwartungshorizont) als EIGENER Druckauftrag nach dem Blatt.
 * Anlass (25.09.2026): „Lösungen als eigene Datei" gab es beim Drucken nicht – wer sie
 * wählte, bekam gar keine Lösungen. Ein eigener Auftrag ist das Gegenstück zur eigenen Datei:
 * 28 Blätter für die Klasse, aber nur ein Lösungsblatt. Deshalb eigene Exemplarzahl; der
 * Seitenbereich gilt nur für das Blatt.
 */
export default function PrintPreview({
  html,
  title,
  onClose,
  loesung
}: {
  html: string | null
  title?: string
  onClose: () => void
  loesung?: { html: string; titel: string } | null
}): React.JSX.Element {
  const [pages, setPages] = useState<string[] | null>(null)
  const [loesungPages, setLoesungPages] = useState<string[] | null>(null)
  const [loesungExemplare, setLoesungExemplare] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState<string | null>(null)
  const [copies, setCopies] = useState(1)
  const [rangeMode, setRangeMode] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')
  const [duplex, setDuplex] = useState<'simplex' | 'longEdge' | 'shortEdge'>('simplex')
  const [color, setColor] = useState<'color' | 'bw'>('bw')
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!html) return
    let cancelled = false
    setPages(null)
    setLoesungPages(null)
    setLoesungExemplare(1)
    setError(null)
    window.api.exporter
      .preview(html)
      .then((data) => renderPages(data))
      .then((p) => !cancelled && setPages(p))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    if (loesung)
      window.api.exporter
        .preview(loesung.html)
        .then((data) => renderPages(data))
        .then((p) => !cancelled && setLoesungPages(p))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    window.api.exporter
      .printers()
      .then((list) => {
        if (cancelled) return
        setPrinters(list)
        let saved: string | null = null
        try {
          saved = localStorage.getItem(PRINTER_KEY)
        } catch {
          // ohne gespeicherten Drucker
        }
        const pick = list.find((p) => p.name === saved) ?? list.find((p) => p.isDefault) ?? list[0]
        setPrinter(pick?.name ?? null)
      })
      .catch(notifyError)
    return () => {
      cancelled = true
    }
  }, [html]) // eslint-disable-line react-hooks/exhaustive-deps -- `loesung` entsteht immer zusammen mit `html`

  const pageCount = pages?.length ?? 0
  const ranges = useMemo(() => (rangeMode === 'range' ? parsePageRanges(range, pageCount) : undefined), [rangeMode, range, pageCount])
  const selected = useMemo(() => {
    if (!pages) return new Set<number>()
    if (!ranges) return new Set(pages.map((_, i) => i + 1))
    const set = new Set<number>()
    for (const r of ranges) for (let p = r.from; p <= r.to; p++) set.add(p)
    return set
  }, [pages, ranges])
  const invalidRange = rangeMode === 'range' && ranges === null
  const sheets = duplex === 'simplex' ? selected.size : Math.ceil(selected.size / 2)
  const loesungSeiten = loesungPages?.length ?? 0
  const loesungBlaetter = duplex === 'simplex' ? loesungSeiten : Math.ceil(loesungSeiten / 2)
  const mitLoesung = Boolean(loesung) && loesungExemplare > 0

  const print = async (): Promise<void> => {
    if (!html || !printer) return
    setPrinting(true)
    try {
      try {
        localStorage.setItem(PRINTER_KEY, printer)
      } catch {
        // nicht kritisch
      }
      await window.api.exporter.print(html, { deviceName: printer, copies, duplex, color: color === 'color', pages: ranges ?? undefined })
      if (loesung && mitLoesung)
        await window.api.exporter.print(loesung.html, { deviceName: printer, copies: loesungExemplare, duplex, color: color === 'color' })
      notifySuccess(loesung && mitLoesung ? `Zwei Druckaufträge gesendet (Blatt und ${loesung.titel}).` : 'Druckauftrag gesendet.')
      onClose()
    } catch (e) {
      notifyError(e, 'Drucken fehlgeschlagen')
    } finally {
      setPrinting(false)
    }
  }

  const systemDialog = async (): Promise<void> => {
    if (!html) return
    try {
      await window.api.exporter.print(html)
      if (loesung && mitLoesung) await window.api.exporter.print(loesung.html)
      onClose()
    } catch (e) {
      notifyError(e, 'Drucken fehlgeschlagen')
    }
  }

  return (
    <Modal opened={html !== null} onClose={onClose} title={title ?? 'Drucken'} size="min(1100px, 95vw)" padding="md">
      <Group align="stretch" wrap="nowrap" gap="md" className="pv-raum">
        <ScrollArea style={{ flex: 1, minWidth: 0 }} className="editor-canvas pv-vorschau" type="auto">
          {error ? (
            <Alert color="red" m="md">
              Vorschau konnte nicht erstellt werden: {error}
            </Alert>
          ) : !pages ? (
            <Center h="60vh">
              <Stack align="center" gap="xs">
                <Loader />
                <Text size="sm" c="dimmed">
                  Seitenansicht wird erstellt …
                </Text>
              </Stack>
            </Center>
          ) : (
            <Stack align="center" gap="lg" py="lg">
              {pages.map((src, i) => (
                <Box key={i} style={{ textAlign: 'center' }}>
                  <img
                    src={src}
                    alt={`Seite ${i + 1}`}
                    data-print-page={i + 1}
                    style={{
                      width: 'min(560px, 100%)',
                      background: '#fff',
                      boxShadow: '0 3px 16px rgba(0,0,0,0.18)',
                      filter: color === 'bw' ? 'grayscale(1)' : undefined,
                      opacity: selected.has(i + 1) ? 1 : 0.35
                    }}
                  />
                  <Text size="xs" c="dimmed" mt={4}>
                    Seite {i + 1} von {pages.length}
                    {!selected.has(i + 1) && ' · wird nicht gedruckt'}
                  </Text>
                </Box>
              ))}
              {loesung && loesungPages && (
                <Text size="sm" fw={600} c="dimmed" data-loesung-trenner>
                  {loesung.titel} – eigener Druckauftrag{loesungExemplare === 0 ? ' (wird nicht gedruckt)' : ''}
                </Text>
              )}
              {loesung &&
                loesungPages?.map((src, i) => (
                  <Box key={`l${i}`} style={{ textAlign: 'center' }}>
                    <img
                      src={src}
                      alt={`${loesung.titel}, Seite ${i + 1}`}
                      data-print-loesung={i + 1}
                      style={{
                        width: 'min(560px, 100%)',
                        background: '#fff',
                        boxShadow: '0 3px 16px rgba(0,0,0,0.18)',
                        filter: color === 'bw' ? 'grayscale(1)' : undefined,
                        opacity: loesungExemplare > 0 ? 1 : 0.35
                      }}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      {loesung.titel}, Seite {i + 1} von {loesungPages.length}
                    </Text>
                  </Box>
                ))}
            </Stack>
          )}
        </ScrollArea>

        {/*
         * Die Einstellungen rollen, die Knöpfe bleiben stehen.
         *
         * Gemeldet am 25.09.2026 (Tablet, Webversion): „beim druckdialog wird nicht alles
         * angezeigt, insb. nicht der button zum drucken". Die Spalte hatte die feste Höhe des
         * Dialogs, aber keinen eigenen Rollbereich – auf einem flachen Bildschirm stand
         * „Drucken" unterhalb des Randes und war nicht erreichbar.
         */}
        <Stack className="pv-seite" gap="sm">
          <ScrollArea className="pv-felder" type="auto" offsetScrollbars>
            <Stack gap="sm">
              <Select
                label="Drucker"
                data={printers.map((p) => ({ value: p.name, label: p.displayName }))}
                value={printer}
                onChange={setPrinter}
                placeholder={printers.length ? 'Drucker wählen' : 'Kein Drucker gefunden'}
                allowDeselect={false}
                searchable
              />
              <NumberInput label="Exemplare" min={1} max={999} value={copies} onChange={(v) => setCopies(Math.max(1, Number(v) || 1))} />
              {loesung && (
                <NumberInput
                  label={`Exemplare ${loesung.titel}`}
                  description="0 = nicht drucken"
                  min={0}
                  max={999}
                  value={loesungExemplare}
                  onChange={(v) => setLoesungExemplare(Math.max(0, Number(v) || 0))}
                />
              )}
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Seiten
                </Text>
                <SegmentedControl
                  fullWidth
                  value={rangeMode}
                  onChange={(v) => setRangeMode(v as 'all' | 'range')}
                  data={[
                    { value: 'all', label: 'Alle' },
                    { value: 'range', label: 'Auswahl' }
                  ]}
                />
                {rangeMode === 'range' && (
                  <TextInput
                    mt={6}
                    placeholder="z. B. 1-2, 4"
                    value={range}
                    onChange={(e) => setRange(e.currentTarget.value)}
                    error={invalidRange && range.trim() ? `Seiten 1 bis ${pageCount}, z. B. 1-2, 4` : undefined}
                  />
                )}
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Doppelseitig
                </Text>
                <SegmentedControl
                  fullWidth
                  orientation="vertical"
                  value={duplex}
                  onChange={(v) => setDuplex(v as typeof duplex)}
                  data={[
                    { value: 'simplex', label: 'Einseitig' },
                    { value: 'longEdge', label: 'Beidseitig (lange Kante)' },
                    { value: 'shortEdge', label: 'Beidseitig (kurze Kante)' }
                  ]}
                />
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Farbe
                </Text>
                <SegmentedControl
                  fullWidth
                  value={color}
                  onChange={(v) => setColor(v as 'color' | 'bw')}
                  data={[
                    { value: 'bw', label: 'Schwarzweiß' },
                    { value: 'color', label: 'Farbe' }
                  ]}
                />
              </div>
              {pages && (
                <Text size="xs" c="dimmed">
                  {selected.size} {selected.size === 1 ? 'Seite' : 'Seiten'} × {copies} = {sheets * copies} {sheets * copies === 1 ? 'Blatt' : 'Blätter'}
                  {mitLoesung && loesungPages && `, dazu ${loesungBlaetter * loesungExemplare} für ${loesung!.titel}`}
                </Text>
              )}
            </Stack>
          </ScrollArea>
          {/* Auf flachen Bildschirmen stehen die beiden Knöpfe nebeneinander – das spart eine Zeile */}
          <div className="pv-knoepfe">
            <Button
              className="pv-drucken"
              leftSection={<IconPrinter size={16} />}
              onClick={() => void print()}
              loading={printing}
              disabled={!pages || !printer || invalidRange || (Boolean(loesung) && !loesungPages)}
            >
              Drucken
            </Button>
            <Button className="pv-abbrechen" variant="default" onClick={onClose}>
              Abbrechen
            </Button>
          </div>
          <Button className="pv-systemdialog" variant="subtle" size="xs" onClick={() => void systemDialog()} disabled={!html}>
            Druckdialog von Windows öffnen
          </Button>
        </Stack>
      </Group>
    </Modal>
  )
}
