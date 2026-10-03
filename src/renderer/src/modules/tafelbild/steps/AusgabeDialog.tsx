import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core'
import { aufServer } from '../../../shared/plattform'
import { senden } from '../../onlinetest/serverApi'
import { LernendeWahl, type LernendeAuswahl } from '../../lernen/LernendeWahl'
import { tafelSvg } from '../svg'
import { IconFileTypePdf, IconPhoto, IconPresentation, IconPrinter, IconUsersGroup } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { speichereAusgabe, type AusgabeDatei } from '../../../shared/export/ausgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { SeitenWahlSchalter } from '../../../shared/components/SeitenAuswahl'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import { pdfHtml, pngFuer, pptxFuer, standardPdfWahl, type PdfWahl } from '../ausgabe'
import { formatInfo } from '../formate'
import { standardName, type Tafelbild } from '../model'

export const PNG_FILTER = [{ name: 'PNG-Bild', extensions: ['png'] }]
export const PPTX_FILTER = [{ name: 'PowerPoint', extensions: ['pptx'] }]

/**
 * Ausgabe des Tafelbilds: PDF (Druck, je Format eine Seite, Lückenfassung, Niveaus, Planungshilfe),
 * PNG in hoher Auflösung, PowerPoint mit schrittweisem Aufbau, Drucken.
 */
export default function AusgabeDialog({
  t,
  docId,
  offen,
  schliessen
}: {
  t: Tafelbild
  docId: string
  offen: boolean
  schliessen: () => void
}): React.JSX.Element {
  const [w, setW] = useState<PdfWahl>(() => standardPdfWahl(t))
  const [laeuft, setLaeuft] = useState<string | null>(null)
  /** Druckvorschau mit Seitenauswahl (01.10.2026) – vorher öffnete „Drucken" gleich den Dialog von Windows */
  const [druck, setDruck] = useState<string | null>(null)
  const schule = useAppSettings((s) => s.settings.schoolName)
  useEffect(() => {
    if (offen) setW(standardPdfWahl(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen])
  const name = safeFileName(standardName(t))
  const ziel = (): ReturnType<typeof ablageZiel> => ablageZiel('tafelbild', docId, t.meta.subjectId)
  const tafeln = t.tafeln.filter((x) => w.formate.includes(x.format))
  const hatLuecken = t.tafeln.some((x) => x.elemente.some((e) => e.lueckenWoerter?.length || e.luecke))

  const los = async (art: string, fn: () => Promise<void>): Promise<void> => {
    setLaeuft(art)
    try {
      await fn()
    } catch (e) {
      notifyError(e, 'Die Ausgabe ist fehlgeschlagen')
    } finally {
      setLaeuft(null)
    }
  }

  const pdf = (): Promise<void> =>
    los('pdf', async () => void (await speichereAusgabe([{ name: `${name}.pdf`, html: pdfHtml(t, w, schule) }], 'Tafelbild als PDF gespeichert.', ziel())))
  const drucken = (): Promise<void> => los('druck', async () => setDruck(pdfHtml(t, w, schule)))
  const png = (): Promise<void> =>
    los('png', async () => {
      const dateien: AusgabeDatei[] = []
      for (const tafel of tafeln) {
        const kurz = safeFileName(formatInfo(tafel.format).kurz)
        dateien.push({ name: `${name} – ${kurz}.png`, filter: PNG_FILTER, daten: () => pngFuer(tafel) })
        if (w.luecke && tafel.elemente.some((e) => e.lueckenWoerter?.length || e.luecke))
          dateien.push({ name: `${name} – ${kurz} – Lückenfassung.png`, filter: PNG_FILTER, daten: () => pngFuer(tafel, { luecke: true, wortspeicher: true }) })
      }
      await speichereAusgabe(dateien, `${dateien.length} Bild${dateien.length === 1 ? '' : 'er'} gespeichert.`, ziel())
    })
  const pptx = (): Promise<void> =>
    los('pptx', async () => {
      await speichereAusgabe(
        [{ name: `${name}.pptx`, filter: PPTX_FILTER, daten: () => pptxFuer(t, w.formate, w.luecke) }],
        'PowerPoint-Datei gespeichert.',
        ziel()
      )
    })

  const schalter = (feld: keyof Omit<PdfWahl, 'formate'>, label: string, aus?: boolean): React.JSX.Element => (
    <Checkbox label={label} checked={w[feld]} disabled={aus} onChange={(e) => setW({ ...w, [feld]: e.currentTarget.checked })} />
  )

  return (
    <>
      <PrintPreview html={druck} title={`Drucken – ${standardName(t)}`} onClose={() => setDruck(null)} />
      <Modal opened={offen} onClose={schliessen} title="Tafelbild ausgeben" size="lg">
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            Formate
          </Text>
          <Group gap="md">
            {t.tafeln.map((x) => (
              <Checkbox
                key={x.format}
                label={formatInfo(x.format).label}
                checked={w.formate.includes(x.format)}
                onChange={(e) => setW({ ...w, formate: e.currentTarget.checked ? [...w.formate, x.format] : w.formate.filter((f) => f !== x.format) })}
              />
            ))}
          </Group>
          <Text size="sm" fw={500}>
            Fassungen (PDF, Drucken, PNG, PowerPoint)
          </Text>
          <Stack gap={6}>
            {schalter('vollstaendig', 'Vollständiges Tafelbild')}
            {schalter('luecke', 'Lückenfassung (mit Wortspeicher)', !hatLuecken)}
            {schalter('niveaus', 'Differenziert ★ / ★★ (nur PDF)')}
            {schalter('planung', 'Planungshilfe: Aufbau in Schritten, Farbbedeutung, Lösungen (nur PDF)')}
          </Stack>
          <Text size="xs" c="dimmed">
            PowerPoint baut das Tafelbild Folie für Folie in den Aufbauschritten auf. PNG in hoher Auflösung für Beamer und digitale Tafel.
          </Text>
          {/* Seitenauswahl (01.10.2026): für PDF und PNG; beim Drucken in der Druckvorschau */}
          <SeitenWahlSchalter beschreibung="Gilt für PDF (Seiten) und PNG (Bilder): Vor dem Speichern erscheinen sie zum Auswählen." />
          <Group gap="xs" mt="sm">
            <Button leftSection={<IconFileTypePdf size={16} />} loading={laeuft === 'pdf'} disabled={!tafeln.length} onClick={() => void pdf()} data-tb-pdf>
              PDF
            </Button>
            <Button
              variant="light"
              leftSection={<IconPhoto size={16} />}
              loading={laeuft === 'png'}
              disabled={!tafeln.length}
              onClick={() => void png()}
              data-tb-png
            >
              PNG
            </Button>
            <Button
              variant="light"
              leftSection={<IconPresentation size={16} />}
              loading={laeuft === 'pptx'}
              disabled={!tafeln.length}
              onClick={() => void pptx()}
              data-tb-pptx
            >
              PowerPoint
            </Button>
            <Button
              variant="default"
              leftSection={<IconPrinter size={16} />}
              loading={laeuft === 'druck'}
              disabled={!tafeln.length}
              onClick={() => void drucken()}
            >
              Drucken
            </Button>
          </Group>
          {/* Lern-App (03.10.2026): Tafelbild in die Mappen der Lernenden (nur mit Server) */}
          {aufServer() && <TafelFreigabe t={t} />}
        </Stack>
      </Modal>
    </>
  )
}

function TafelFreigabe({ t }: { t: Tafelbild }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [wer, setWer] = useState<LernendeAuswahl | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  if (!offen)
    return (
      <Button variant="subtle" leftSection={<IconUsersGroup size={16} />} onClick={() => setOffen(true)} w="fit-content" data-tb-freigeben>
        Für Lernende freigeben (Mappe in der Lern-App)
      </Button>
    )
  return (
    <Stack gap="xs" mt="xs">
      <Text size="sm" fw={600}>
        Für Lernende freigeben
      </Text>
      <LernendeWahl wahl={setWer} />
      <Group>
        <Button
          loading={laeuft}
          disabled={!wer}
          onClick={() => {
            setLaeuft(true)
            const bilder = t.tafeln.map((x) => tafelSvg(x, { ohneKorn: true }))
            void senden('/server/tafeln/freigeben', {
              ...wer,
              titel: t.inhalt?.titel || t.meta.title || 'Tafelbild',
              fach: t.meta.subjectLabel,
              thema: t.meta.thema,
              bilder
            })
              .then(() => (notifySuccess('Freigegeben – das Tafelbild liegt jetzt in der Mappe der Lernenden.'), setOffen(false)))
              .catch((e: unknown) => notifyError(e))
              .finally(() => setLaeuft(false))
          }}
          data-tb-freigeben-los
        >
          Freigeben
        </Button>
        <Button variant="subtle" color="gray" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </Group>
    </Stack>
  )
}
