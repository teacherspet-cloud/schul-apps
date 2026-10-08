/**
 * Lernende in ein Vokabeltraining eintragen (08.10.2026, Wunsch der Lehrkraft): Namen eintippen oder aus einer
 * Klassenliste (PDF, Word, CSV, Excel, Text) übernehmen. Jede Person bekommt ein Konto „Vorname N." mit einem
 * persönlichen Anmeldecode; dazu Zettel zum Ausschneiden mit Symbol, Lernadresse, Code und kurzer Anleitung.
 * Der Code gilt für alle Vokabeltrainings, in die die Lehrkraft diese Person einträgt.
 */
import { Alert, Button, FileButton, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { IconFileImport, IconPrinter, IconUsersPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { htmlAlsZeilen, kurzNamen, namenAusText } from '@shared/namenListe'
import { senden } from '../onlinetest/serverApi'
import PrintPreview from '../../shared/components/PrintPreview'
// Symbol eingebettet (08.10.2026): als Internetadresse kam es im Druckfenster nicht an – nur ein leeres Bildsymbol
import webSymbol from '../../assets/web-symbol.png?inline'
import { notifyError, notifySuccess } from '../../shared/util'

export interface Zettel {
  name: string
  zugang: string
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z]!))

/** Zettel zum Ausschneiden (10 je A4-Seite) */
export function zettelHtml(titel: string, zettel: Zettel[], adresse: string): string {
  const basis = adresse.replace(/\/$/, '')
  const anzeige = `${basis.replace(/^https?:\/\//, '')}/s/`
  const karten = zettel
    .filter((z) => z.zugang)
    .map(
      (z) => `<div class="zettel"><div class="kopf"><img src="${webSymbol}" alt=""><div><div class="titel">Vokabeltraining</div>
<div class="name">${esc(z.name)}</div></div></div>
<div class="zeile"><span class="feld">Adresse</span><span class="wert">${esc(anzeige)}</span></div>
<div class="zeile"><span class="feld">Dein Code</span><span class="wert code">${esc(z.zugang)}</span></div>
<ol><li>Öffne <b>${esc(anzeige)}</b> im Browser (Handy, Tablet oder Computer).</li>
<li>Gib bei „Mit Code öffnen“ deinen Code ein und tippe auf „Öffnen“.</li>
<li>Schon bist du bei deinen Vokabeln. Bewahre den Zettel auf und gib den Code nicht weiter.</li></ol></div>`
    )
    .join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zugangszettel ${esc(titel)}</title><style>
@page { size: A4; margin: 10mm; }
body { margin: 0; font: 9.5pt/1.35 "Segoe UI", Arial, sans-serif; color: #111; }
.raster { display: grid; grid-template-columns: 1fr 1fr; }
.zettel { border: 0.3mm dashed #888; padding: 4mm 5mm; height: 55mm; box-sizing: border-box; break-inside: avoid; }
.kopf { display: flex; gap: 3mm; align-items: center; margin-bottom: 2mm; } .kopf img { width: 11mm; height: 11mm; border-radius: 2.5mm; }
.titel { font-size: 8pt; color: #666; } .name { font-size: 12.5pt; font-weight: 700; }
.zeile { display: flex; align-items: baseline; gap: 3mm; } .feld { color: #666; font-size: 8pt; width: 16mm; flex-shrink: 0; }
.wert { font-weight: 600; font-size: 11pt; } .code { font: 700 15pt Consolas, monospace; letter-spacing: 1.5pt; }
ol { margin: 2mm 0 0; padding-left: 4.5mm; font-size: 8pt; color: #333; } li { margin: 0.4mm 0; }
</style></head><body><div class="raster">${karten}</div></body></html>`
}

/** Zettel als PDF sichern */
export function zettelAlsPdf(titel: string, zettel: Zettel[], adresse: string): void {
  void window.api.exporter.pdf(zettelHtml(titel, zettel, adresse), `Zugangszettel ${titel}.pdf`).catch((e: unknown) => notifyError(e))
}

/**
 * Zettel drucken – mit der Druckvorschau der App wie bei Arbeitsblättern (08.10.2026: der Windows-Druckdialog direkt
 * meldete „Diese App unterstützt keine Seitenansicht").
 */
export function ZettelDruck({
  titel,
  zettel,
  adresse,
  schliessen
}: {
  titel: string
  zettel: Zettel[]
  adresse: string
  schliessen: () => void
}): React.JSX.Element {
  return <PrintPreview html={zettelHtml(titel, zettel, adresse)} title={`Zugangszettel ${titel}`} onClose={schliessen} />
}

/** Text einer Klassenliste aus PDF, Word, CSV, Excel oder Text */
async function dateiText(f: File): Promise<string> {
  const n = f.name.toLowerCase()
  if (/\.(xlsx|xls)$/.test(n)) {
    const { excelAlsText } = await import('../rueckmeldung/tabelle')
    return excelAlsText(f)
  }
  if (/\.(csv|txt|tsv)$/.test(n) || f.type.startsWith('text/')) return f.text()
  const { extractContent } = await import('../../shared/files/extractContent')
  const c = await extractContent(f, () => undefined, { renderPages: false })
  return c.format === 'html' ? htmlAlsZeilen(c.text) : c.text
}

export function LernendeEintragen({
  id,
  titel,
  adresse,
  schonDa,
  schliessen
}: {
  id: string
  titel: string
  adresse: string
  schonDa: string[]
  schliessen: () => void
}): React.JSX.Element {
  const [namen, setNamen] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [hinweis, setHinweis] = useState('')
  const [fertig, setFertig] = useState<Zettel[] | null>(null)
  const [druck, setDruck] = useState(false)
  const ausDatei = async (f: File | null): Promise<void> => {
    if (!f) return
    try {
      const gefunden = kurzNamen(namenAusText(await dateiText(f)), schonDa)
      if (!gefunden.length) {
        setHinweis(
          `In „${f.name}“ wurden keine Namen erkannt. Bei Scans oder Fotos die Namen bitte abtippen; Tabellen brauchen eine Spalte „Name“ bzw. „Nachname“ und „Vorname“.`
        )
        return
      }
      const bisher = namen.split('\n').filter((z) => z.trim())
      setNamen([...bisher, ...gefunden.filter((g) => !bisher.includes(g))].join('\n'))
      setHinweis(`${gefunden.length} Namen aus „${f.name}“ übernommen – bitte kurz prüfen.`)
    } catch (e) {
      notifyError(e, 'Datei nicht gelesen')
    }
  }
  const eintragen = async (): Promise<void> => {
    // Eingetippte volle Namen werden wie die aus Dateien zu „Vorname N."
    const zeilen = namen
      .split('\n')
      .map((z) => z.trim())
      .filter(Boolean)
    const kurz = zeilen.map((z) => (/^\S.* \p{L}{1,3}\.$/u.test(z) ? z : kurzNamen(namenAusText(z))[0] ?? z))
    setLaeuft(true)
    try {
      const r = await senden<{ eingetragen: Zettel[] }>(`/server/vokabeln/${id}/eintragen`, { namen: kurz })
      const unerkannt = kurz.length - r.eingetragen.length
      setFertig(r.eingetragen)
      if (r.eingetragen.length) notifySuccess(`${r.eingetragen.length} Lernende eingetragen.`)
      if (unerkannt > 0) setHinweis(`${unerkannt} Zeile(n) übersprungen – schon dabei oder kein Name im Format „Vorname Nachname“.`)
    } catch (e) {
      notifyError(e, 'Nicht eingetragen')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Lernende eintragen" size="lg">
      {fertig ? (
        <Stack data-eingetragen>
          <Text size="sm">
            {fertig.length} Lernende eingetragen. Jede/r meldet sich mit dem persönlichen Code vom Zettel an – unter „Mit Code öffnen“ auf der Lernseite.
          </Text>
          {hinweis && (
            <Alert color="yellow" variant="light">
              {hinweis}
            </Alert>
          )}
          <Group>
            <Button leftSection={<IconPrinter size={16} />} disabled={!fertig.length} onClick={() => setDruck(true)}>
              Zettel drucken
            </Button>
            <Button variant="light" disabled={!fertig.length} onClick={() => zettelAlsPdf(titel, fertig, adresse)} data-zettel-pdf>
              Als PDF speichern
            </Button>
            <Button variant="default" onClick={schliessen}>
              Fertig
            </Button>
          </Group>
          {druck && <ZettelDruck titel={titel} zettel={fertig} adresse={adresse} schliessen={() => setDruck(false)} />}
        </Stack>
      ) : (
        <Stack>
          <Text size="sm" c="dimmed">
            Ein Name je Zeile, z. B. „Anna Müller“ oder „Müller, Anna“ – oder eine Klassenliste einlesen. Gespeichert wird nur Vorname und Anfangsbuchstabe
            („Anna M.“). Wer schon in einem anderen Ihrer Vokabeltrainings eingetragen ist, behält seinen Code.
          </Text>
          <Group>
            <FileButton onChange={(f) => void ausDatei(f)} accept=".pdf,.docx,.csv,.tsv,.txt,.xlsx,.xls,text/plain,text/csv,application/pdf">
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconFileImport size={16} />} data-namen-datei>
                  Klassenliste einlesen (PDF, Word, CSV, Excel)
                </Button>
              )}
            </FileButton>
          </Group>
          {hinweis && (
            <Alert color="blue" variant="light">
              {hinweis}
            </Alert>
          )}
          <Textarea
            label="Namen"
            autosize
            minRows={6}
            maxRows={16}
            value={namen}
            onChange={(e) => setNamen(e.currentTarget.value)}
            placeholder={'Anna Müller\nSchmidt, Ben'}
            data-namen-eingabe
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button leftSection={<IconUsersPlus size={16} />} loading={laeuft} disabled={!namen.trim()} onClick={() => void eintragen()} data-namen-eintragen>
              Eintragen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
