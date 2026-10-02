/**
 * Schülerkonten aus einer Klassenliste (02.10.2026, Verwaltung; Server: src/server/klassenliste.ts).
 *
 * Namensliste einfügen (eine Zeile je Kind, auch direkt aus Excel), Klasse angeben → Konten mit
 * Startpasswort (bei der ersten Anmeldung zu ändern). Danach: Zugangskarten zum Ausschneiden mit
 * Name, Benutzername, Startpasswort und QR-Code zur Anmeldeseite (Benutzername schon eingetragen).
 * Die Passwörter stehen nur jetzt im Klartext da – der Server speichert sie nicht.
 */
import { Alert, Button, Card, Group, Stack, Table, Text, TextInput, Textarea } from '@mantine/core'
import { IconPrinter, IconUsersPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { qrSvg } from '../arbeitsblatt/render/qr'
import { senden } from '../onlinetest/serverApi'
import { notifyError } from '../../shared/util'

interface Konto {
  name: string
  benutzer: string
  passwort: string
  schonDa?: boolean
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[z]!)

/** Zugangskarten (8 je A4-Seite) zum Ausschneiden */
export function zugangskartenHtml(klasse: string, konten: Konto[], adresse: string): string {
  const karten = konten
    .filter((k) => k.passwort)
    .map((k) => {
      const link = `${adresse}/anmelden?ziel=/s/&benutzer=${encodeURIComponent(k.benutzer)}`
      return `<div class="karte"><div class="text"><div class="name">${esc(k.name)}</div><div class="klasse">Klasse ${esc(klasse)}</div>
<div class="feld">Benutzername</div><div class="wert">${esc(k.benutzer)}</div>
<div class="feld">Startpasswort</div><div class="wert">${esc(k.passwort)}</div>
<div class="hinweis">QR-Code scannen oder ${esc(adresse.replace(/^https?:\/\//, ''))} öffnen. Beim ersten Anmelden ein eigenes Passwort festlegen.</div></div>
<div class="qr">${qrSvg(link, 28)}</div></div>`
    })
    .join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zugangskarten ${esc(klasse)}</title><style>
@page { size: A4; margin: 10mm; }
body { margin: 0; font: 10pt/1.35 "Segoe UI", Arial, sans-serif; color: #111; }
.raster { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.karte { display: flex; justify-content: space-between; gap: 4mm; border: 0.3mm dashed #888; padding: 5mm; height: 63mm; box-sizing: border-box; break-inside: avoid; }
.name { font-size: 13pt; font-weight: 700; } .klasse { color: #555; margin-bottom: 2mm; }
.feld { color: #666; font-size: 8.5pt; margin-top: 1.5mm; } .wert { font: 600 12pt Consolas, monospace; }
.hinweis { color: #555; font-size: 8pt; margin-top: 3mm; } .qr { width: 28mm; flex-shrink: 0; align-self: center; }
</style></head><body><div class="raster">${karten}</div></body></html>`
}

export function KlassenlisteKarte({ fertig }: { fertig: () => void }): React.JSX.Element {
  const [klasse, setKlasse] = useState('')
  const [namen, setNamen] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ klasse: string; angelegt: Konto[] } | null>(null)
  const anlegen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      setErgebnis(await senden<{ klasse: string; angelegt: Konto[] }>('/server/verwaltung/klassenliste', { klasse, namen }))
      setNamen('')
      fertig()
    } catch (e) {
      notifyError(e, 'Konten nicht angelegt')
    } finally {
      setLaeuft(false)
    }
  }
  const drucken = (pdf: boolean): void => {
    if (!ergebnis) return
    const html = zugangskartenHtml(ergebnis.klasse, ergebnis.angelegt, window.location.origin)
    void (pdf ? window.api.exporter.pdf(html, `Zugangskarten ${ergebnis.klasse}.pdf`) : window.api.exporter.print(html)).catch((e: unknown) => notifyError(e))
  }
  const neu = ergebnis?.angelegt.filter((k) => !k.schonDa) ?? []
  return (
    <Card withBorder data-klassenliste>
      <Text fw={600} mb="xs">
        Schülerkonten aus einer Klassenliste
      </Text>
      <Stack gap="xs">
        <TextInput label="Klasse" placeholder="10b" value={klasse} onChange={(e) => setKlasse(e.currentTarget.value)} w={160} data-feld="klasse" />
        <Textarea
          label="Namen (eine Zeile je Kind)"
          description="„Vorname Nachname“ oder „Nachname, Vorname“ – auch direkt aus Excel eingefügt (Nachname | Vorname)."
          autosize
          minRows={4}
          maxRows={14}
          value={namen}
          onChange={(e) => setNamen(e.currentTarget.value)}
          data-feld="namen"
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Benutzername vorname.nachname, Startpasswort zum Abtippen; bei der ersten Anmeldung legen die Lernenden ein eigenes Passwort fest. Lehrkräfte wählen die Klasse dann beim Anlegen einer Lerngruppe.
          </Text>
          <Button leftSection={<IconUsersPlus size={16} />} loading={laeuft} disabled={!klasse.trim() || !namen.trim()} onClick={() => void anlegen()}>
            Konten anlegen
          </Button>
        </Group>
        {ergebnis && (
          <Stack gap="xs" data-klassenliste-ergebnis>
            <Alert color="orange" variant="light">
              {neu.length} Konto{neu.length === 1 ? '' : 'en'} für Klasse {ergebnis.klasse} angelegt. Die Startpasswörter stehen nur jetzt da – bitte die Zugangskarten gleich drucken oder als PDF sichern.
            </Alert>
            <Group gap="xs">
              <Button leftSection={<IconPrinter size={16} />} onClick={() => drucken(false)}>
                Zugangskarten drucken
              </Button>
              <Button variant="light" onClick={() => drucken(true)}>
                Als PDF
              </Button>
            </Group>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Benutzername</Table.Th>
                  <Table.Th>Startpasswort</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ergebnis.angelegt.map((k) => (
                  <Table.Tr key={k.benutzer}>
                    <Table.Td>{k.name}</Table.Td>
                    <Table.Td>{k.benutzer}</Table.Td>
                    <Table.Td>{k.schonDa ? <Text size="sm" c="dimmed">schon vorhanden</Text> : <code>{k.passwort}</code>}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
