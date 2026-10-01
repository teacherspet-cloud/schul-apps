import { Alert, Box, Button, Center, Group, Loader, Modal, ScrollArea, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import ZahlFeld from './ZahlFeld'
import { IconPrinter } from '@tabler/icons-react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PrinterInfo } from '../../../../preload/index'
import { alleSeiten, neueNummern, seitenMarken, waehleSeitenImHtml, type SeitenMarke } from '../export/seitenAuswahl'
import { druckeImBrowser, imNetz } from '../netzZugang'
import { aufIos } from '../plattform'
import { notifyError, notifySuccess } from '../util'
import { ZoomFlaeche } from '../touch/zoom'
import { SeitenAuswahlFelder, SeitenHaken, umschalten } from './SeitenAuswahl'

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

/** Text je Seite eines PDFs – für die Prüfmechanik (`__selftest.pdfText`), z. B. ob das Überthema darin steht */
export async function pdfTexte(data: Uint8Array): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data }).promise
  const seiten: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const inhalt = await (await pdf.getPage(p)).getTextContent()
    seiten.push(inhalt.items.map((i) => ('str' in i ? i.str : '')).join(' '))
  }
  await pdf.cleanup()
  return seiten
}

const PRINTER_KEY = 'schulapps.printer'

/** Seitenzahl, mit der eine gewählte Seite gedruckt wird – zur Anzeige unter dem Seitenbild */
const druckZahl = (nr: { nr: number; von: number }): string => (nr.von > 1 ? `Seite ${nr.nr} / ${nr.von}` : 'ohne Seitenzahl')

/** Aufeinanderfolgende Seiten als Bereiche für den Drucker */
function bereicheVon(seiten: number[]): { from: number; to: number }[] {
  const aus: { from: number; to: number }[] = []
  for (const s of seiten) {
    const letzter = aus[aus.length - 1]
    if (letzter && letzter.to === s - 1) letzter.to = s
    else aus.push({ from: s, to: s })
  }
  return aus
}

/**
 * Druckvorschau mit Seitenansicht: zeigt genau die Seiten, die gedruckt werden,
 * und druckt mit gewähltem Drucker, Exemplaren, Seitenauswahl, Duplex und Farbe.
 *
 * `loesung`: Lösungen (bzw. Erwartungshorizont) als EIGENER Druckauftrag nach dem Blatt.
 * Anlass (25.09.2026): „Lösungen als eigene Datei" gab es beim Drucken nicht – wer sie
 * wählte, bekam gar keine Lösungen. Ein eigener Auftrag ist das Gegenstück zur eigenen Datei:
 * 28 Blätter für die Klasse, aber nur ein Lösungsblatt. Deshalb eigene Exemplarzahl.
 *
 * SEITENAUSWAHL (01.10.2026): Seiten per Eingabe („1-4, 6"), Antippen der Seitenbilder oder
 * Schnellauswahl (components/SeitenAuswahl.tsx). Blatt und Lösungen bilden EINE Seitenfolge, wie
 * die Vorschau sie zeigt. Gedruckt wird die Auswahl als eigenes Dokument: Seiten mit Marken
 * werden vor dem Umrechnen gewählt und neu gezählt („Seite 1 / 5" statt „Seite 1 / 9",
 * export/seitenAuswahl.ts). Dokumente ohne Marken (ohne Seitenzahlen) druckt der PC mit
 * Seitenbereichen; auf dem iPad und im Browser wählt dort der Druckdialog des Geräts.
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
  /** Gewählte Seiten (1-basiert) über Blatt UND Lösungen, wie die Vorschau sie zeigt */
  const [auswahl, setAuswahl] = useState<number[]>([])
  const [auswahlGueltig, setAuswahlGueltig] = useState(true)
  /** Die Seite, die gerade am meisten zu sehen ist – für „Aktuelle Seite" */
  const [sichtbar, setSichtbar] = useState(1)
  const vorschauRef = useRef<HTMLDivElement>(null)
  const [duplex, setDuplex] = useState<'simplex' | 'longEdge' | 'shortEdge'>('simplex')
  const [color, setColor] = useState<'color' | 'bw'>('bw')
  const [printing, setPrinting] = useState(false)
  // iPad: Drucker, Exemplare, Duplex und Farbe wählt AirPrint selbst
  const ios = aufIos()

  useEffect(() => {
    if (!html) return
    let cancelled = false
    setPages(null)
    setLoesungPages(null)
    setLoesungExemplare(1)
    setAuswahl([])
    setAuswahlGueltig(true)
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
  const loesungSeiten = loesungPages?.length ?? 0
  const bereit = Boolean(pages) && (!loesung || Boolean(loesungPages))
  const gesamt = pageCount + loesungSeiten

  // Marken der Seiten (Teil, Zählgruppe) – nur, wenn sie zu den erzeugten Seiten passen
  const blattMarken = useMemo(() => (html ? seitenMarken(html) : []), [html])
  const loesungMarken = useMemo(() => (loesung ? seitenMarken(loesung.html) : []), [loesung])
  const blattMarkiert = blattMarken.length > 0 && blattMarken.length === pageCount
  const loesungMarkiert = loesungMarken.length > 0 && loesungMarken.length === loesungSeiten
  const teile = useMemo(
    () => [
      ...Array.from({ length: pageCount }, (_, i) => (blattMarkiert ? blattMarken[i].teil : undefined)),
      ...Array.from({ length: loesungSeiten }, (_, i) => (loesungMarkiert ? loesungMarken[i].teil : 'loesung'))
    ],
    [pageCount, loesungSeiten, blattMarkiert, loesungMarkiert, blattMarken, loesungMarken]
  )
  // Sobald alle Seiten da sind: alles gewählt
  useEffect(() => {
    if (bereit) setAuswahl(alleSeiten(gesamt))
  }, [bereit, gesamt])

  /** Auswahl getrennt nach Blatt (1 … pageCount) und Lösungen (1 … loesungSeiten) */
  const blattAuswahl = auswahl.filter((s) => s <= pageCount)
  const loesungAuswahl = auswahl.filter((s) => s > pageCount).map((s) => s - pageCount)
  const alleBlatt = blattAuswahl.length === pageCount
  const alleLoesung = loesungAuswahl.length === loesungSeiten
  // Ohne Marken lässt sich nur am PC (Seitenbereiche des Druckers) auswählen
  const auswahlMoeglich = (blattMarkiert && (!loesung || loesungMarkiert)) || (!ios && !imNetz())
  const gewaehlt = (seite: number): boolean => auswahl.includes(seite)
  // Neue Seitenzahlen der gewählten Seiten – zur Anzeige unter den Seitenbildern
  const nummern = useMemo(() => {
    const zahlen = (marken: SeitenMarke[], ok: boolean, wahl: number[]): Map<number, { nr: number; von: number }> => (ok ? neueNummern(marken, wahl) : new Map())
    return { blatt: zahlen(blattMarken, blattMarkiert, blattAuswahl), loesung: zahlen(loesungMarken, loesungMarkiert, loesungAuswahl) }
  }, [auswahl.join(','), blattMarkiert, loesungMarkiert]) // eslint-disable-line react-hooks/exhaustive-deps

  const mitBlatt = blattAuswahl.length > 0
  const mitLoesung = Boolean(loesung) && loesungExemplare > 0 && loesungAuswahl.length > 0
  const sheets = duplex === 'simplex' ? blattAuswahl.length : Math.ceil(blattAuswahl.length / 2)
  const loesungBlaetter = duplex === 'simplex' ? loesungAuswahl.length : Math.ceil(loesungAuswahl.length / 2)

  /** Das Druck-HTML der Auswahl – mit Marken gekürzt und neu gezählt, sonst unverändert */
  const blattHtml = (): string | null => (!html || !mitBlatt ? null : blattMarkiert && !alleBlatt ? waehleSeitenImHtml(html, blattAuswahl) : html)
  const loesungHtml = (): string | null =>
    !loesung || !mitLoesung ? null : loesungMarkiert && !alleLoesung ? waehleSeitenImHtml(loesung.html, loesungAuswahl) : loesung.html
  /** Seitenbereiche für den Drucker – nur ohne Marken (sonst ist das HTML schon gekürzt) */
  const bereiche = (wahl: number[], markiert: boolean, anzahl: number): { from: number; to: number }[] | undefined =>
    markiert || wahl.length === anzahl ? undefined : bereicheVon(wahl)

  // „Aktuelle Seite": die Seite, die in der Vorschau am meisten zu sehen ist
  useEffect(() => {
    const wurzel = vorschauRef.current
    if (!wurzel || !bereit || typeof IntersectionObserver === 'undefined') return
    const anteile = new Map<number, number>()
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) anteile.set(Number((e.target as HTMLElement).dataset.vorschauSeite), e.intersectionRatio)
        let beste = 1
        let max = -1
        for (const [seite, anteil] of anteile)
          if (anteil > max) {
            max = anteil
            beste = seite
          }
        setSichtbar(beste)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    wurzel.querySelectorAll('[data-vorschau-seite]').forEach((el) => beobachter.observe(el))
    return () => beobachter.disconnect()
  }, [bereit, gesamt])

  /*
   * Im Browser (Tablet) gibt es keinen Drucker des Rechners: Blatt und – falls gewählt –
   * Lösungen gehen als EIN PDF in EINEN neuen Tab (netzZugang.ts, `druckeImBrowser`). Zwei
   * Druckaufträge hießen dort zwei Tabs, und den zweiten verwirft der Popup-Blocker.
   * Muss ohne vorheriges `await` aufgerufen werden, sonst gilt der Tab nicht mehr als Folge des Klicks.
   */
  const druckeImNetz = async (): Promise<void> => {
    if (!html) return
    setPrinting(true)
    try {
      const teileZumDruck = [blattHtml(), loesungHtml()].filter((t): t is string => Boolean(t))
      const wie = await druckeImBrowser(teileZumDruck, `${title ?? 'Druck'}.pdf`)
      const was = loesung && mitLoesung ? (mitBlatt ? `Blatt und ${loesung.titel}` : loesung.titel) : 'Blatt'
      notifySuccess(
        wie === 'tab' ? `Druckansicht im neuen Tab geöffnet (${was}).` : `Der Browser hat den neuen Tab blockiert – das PDF (${was}) wurde heruntergeladen.`
      )
      onClose()
    } catch (e) {
      notifyError(e, 'Drucken fehlgeschlagen')
    } finally {
      setPrinting(false)
    }
  }

  /** Blatt und Lösungen über den Druckdialog des Systems – iPad (AirPrint) und „Druckdialog von Windows" */
  const druckeMitDialog = async (): Promise<void> => {
    const blatt = blattHtml()
    const loes = loesungHtml()
    if (blatt) await window.api.exporter.print(blatt)
    if (loes) await window.api.exporter.print(loes)
  }

  /** iPad: je Dokument der Druckdialog von AirPrint (main/kanaele.ts → mobil/export/druckmaschine.ts) */
  const druckeAufIos = async (): Promise<void> => {
    if (!html) return
    setPrinting(true)
    try {
      await druckeMitDialog()
      onClose()
    } catch (e) {
      notifyError(e, 'Drucken fehlgeschlagen')
    } finally {
      setPrinting(false)
    }
  }

  const print = async (): Promise<void> => {
    if (imNetz()) return druckeImNetz()
    if (ios) return druckeAufIos()
    if (!html || !printer) return
    setPrinting(true)
    try {
      try {
        localStorage.setItem(PRINTER_KEY, printer)
      } catch {
        // nicht kritisch
      }
      const blatt = blattHtml()
      const loes = loesungHtml()
      if (blatt)
        await window.api.exporter.print(blatt, { deviceName: printer, copies, duplex, color: color === 'color', pages: bereiche(blattAuswahl, blattMarkiert, pageCount) })
      if (loes)
        await window.api.exporter.print(loes, {
          deviceName: printer,
          copies: loesungExemplare,
          duplex,
          color: color === 'color',
          pages: bereiche(loesungAuswahl, loesungMarkiert, loesungSeiten)
        })
      notifySuccess(blatt && loes ? `Zwei Druckaufträge gesendet (Blatt und ${loesung!.titel}).` : 'Druckauftrag gesendet.')
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
      // Der Dialog von Windows bekommt die gekürzte Fassung; ohne Marken wählt man dort selbst
      await druckeMitDialog()
      onClose()
    } catch (e) {
      notifyError(e, 'Drucken fehlgeschlagen')
    }
  }

  /** Ein Seitenbild – Antippen wählt die Seite ab bzw. wieder an (Maus oder Finger) */
  const seitenBild = (src: string, seite: number, an: boolean, alt: string, attr: Record<string, number>): React.JSX.Element => (
    <Box
      component="button"
      type="button"
      onClick={() => auswahlMoeglich && setAuswahl((a) => umschalten(a, seite))}
      aria-pressed={an}
      aria-label={`${alt} ${an ? 'abwählen' : 'wählen'}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: 0,
        border: 0,
        background: 'none',
        cursor: auswahlMoeglich ? 'pointer' : 'default',
        touchAction: 'manipulation',
        width: 'min(560px, 100%)'
      }}
    >
      <img
        src={src}
        alt={alt}
        {...attr}
        style={{
          width: '100%',
          display: 'block',
          background: '#fff',
          boxShadow: '0 3px 16px rgba(0,0,0,0.18)',
          filter: color === 'bw' && !ios ? 'grayscale(1)' : undefined,
          opacity: an ? 1 : 0.35
        }}
      />
      {auswahlMoeglich && gesamt > 1 && <SeitenHaken an={gewaehlt(seite)} />}
    </Box>
  )

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
            // Mit dem Finger: Zwei-Finger-Zoom und Zoom-Knöpfe (shared/touch/zoom.tsx); am PC unverändert
            <ZoomFlaeche>
              <Stack align="center" gap="lg" py="lg" ref={vorschauRef}>
                {pages.map((src, i) => {
                  const an = gewaehlt(i + 1)
                  const nr = nummern.blatt.get(i + 1)
                  return (
                    <Box key={i} style={{ textAlign: 'center' }} data-vorschau-seite={i + 1}>
                      {seitenBild(src, i + 1, an, `Seite ${i + 1}`, { 'data-print-page': i + 1 })}
                      <Text size="xs" c="dimmed" mt={4} data-seite-unterschrift={i + 1}>
                        Seite {i + 1} von {gesamt}
                        {!an ? ' · wird nicht gedruckt' : !alleBlatt && nr ? ` · gedruckt mit „${druckZahl(nr)}“` : ''}
                      </Text>
                    </Box>
                  )
                })}
                {loesung && loesungPages && (
                  <Text size="sm" fw={600} c="dimmed" data-loesung-trenner>
                    {loesung.titel} – eigener Druckauftrag{loesungExemplare === 0 ? ' (wird nicht gedruckt)' : ''}
                  </Text>
                )}
                {loesung &&
                  loesungPages?.map((src, i) => {
                    const seite = pageCount + i + 1
                    const an = gewaehlt(seite) && loesungExemplare > 0
                    const nr = nummern.loesung.get(i + 1)
                    return (
                      <Box key={`l${i}`} style={{ textAlign: 'center' }} data-vorschau-seite={seite}>
                        {seitenBild(src, seite, an, `${loesung.titel}, Seite ${i + 1}`, { 'data-print-loesung': i + 1 })}
                        <Text size="xs" c="dimmed" mt={4} data-seite-unterschrift={seite}>
                          Seite {seite} von {gesamt} ({loesung.titel}, Seite {i + 1})
                          {!an ? ' · wird nicht gedruckt' : !alleLoesung && nr ? ` · gedruckt mit „${druckZahl(nr)}“` : ''}
                        </Text>
                      </Box>
                    )
                  })}
              </Stack>
            </ZoomFlaeche>
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
              {ios && (
                <Text size="sm" c="dimmed" data-airprint-hinweis>
                  Drucker, Exemplare, Doppelseitig und Farbe stehen im Druckdialog von AirPrint.
                </Text>
              )}
              {bereit && gesamt > 1 && auswahlMoeglich && (
                <SeitenAuswahlFelder
                  teile={teile}
                  value={auswahl}
                  onChange={setAuswahl}
                  onGueltig={setAuswahlGueltig}
                  aktuelleSeite={sichtbar}
                  loesungsBegriff={loesung?.titel}
                />
              )}
              {bereit && gesamt > 1 && !auswahlMoeglich && (
                <Text size="xs" c="dimmed">
                  Einzelne Seiten lassen sich im Druckdialog des Geräts wählen.
                </Text>
              )}
              {!ios && (
                <Select
                  label="Drucker"
                  data={printers.map((p) => ({ value: p.name, label: p.displayName }))}
                  value={printer}
                  onChange={setPrinter}
                  placeholder={printers.length ? 'Drucker wählen' : 'Kein Drucker gefunden'}
                  allowDeselect={false}
                  searchable
                />
              )}
              {!ios && <ZahlFeld label="Exemplare" min={1} max={999} value={copies} onChange={(v) => setCopies(Math.max(1, Number(v) || 1))} />}
              {loesung && (
                <ZahlFeld
                  label={ios ? `${loesung.titel} drucken (1 = ja, 0 = nein)` : `Exemplare ${loesung.titel}`}
                  description="0 = nicht drucken"
                  min={0}
                  max={999}
                  value={loesungExemplare}
                  onChange={(v) => setLoesungExemplare(Math.max(0, Number(v) || 0))}
                />
              )}
              {!ios && (
                <>
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
                </>
              )}
              {pages && !ios && (
                <Text size="xs" c="dimmed" data-blattzahl>
                  {blattAuswahl.length} {blattAuswahl.length === 1 ? 'Seite' : 'Seiten'} × {copies} = {sheets * copies} {sheets * copies === 1 ? 'Blatt' : 'Blätter'}
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
              disabled={!bereit || (!printer && !imNetz() && !ios) || !auswahlGueltig || (!mitBlatt && !mitLoesung)}
            >
              Drucken
            </Button>
            <Button className="pv-abbrechen" variant="default" onClick={onClose}>
              Abbrechen
            </Button>
          </div>
          {/* Im Browser gäbe es nur den Dialog des entfernten Rechners – dort druckt „Drucken" über den Tab */}
          {!imNetz() && !ios && (
            <Button className="pv-systemdialog" variant="subtle" size="xs" onClick={() => void systemDialog()} disabled={!html || (!mitBlatt && !mitLoesung)}>
              Druckdialog von Windows öffnen
            </Button>
          )}
        </Stack>
      </Group>
    </Modal>
  )
}
