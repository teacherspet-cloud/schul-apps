/**
 * Auswertung eines freigegebenen Blatts (05.10.2026, Wunsch der Lehrkraft; Server: src/server/blattAuswertung.ts).
 *
 *  - Je Person ein Knopf, dessen Farbe stufenlos von Rot über Orange zu Grün zeigt, wie korrekt und
 *    eigenständig die Aufgaben erledigt wurden (shared/blattAuswertung.ts `farbeFuer`). Klick: Pop-up mit
 *    Rückmeldung je Aufgabe, Hinweisen zur Eigenständigkeit, dem Vorschlag zur Mitarbeit und „Blatt ansehen".
 *  - Mitarbeit (++ … --) und Hilfestellungen schlägt die KI auf Knopfdruck vor – Strenge einstellbar und
 *    nachträglich änderbar (neu einschätzen). Ein Vorschlag, den die Lehrkraft prüft.
 *  - „Hilfestellungen": ein Dokument für alle, zum Drucken und Speichern.
 *  - „Gleiche Abgaben": je Aufgabe, wer gleiche oder sehr ähnliche Antworten abgegeben hat.
 */
import { Alert, Badge, Button, Group, List, Menu, Modal, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconBulb, IconCopy, IconEye, IconPrinter, IconSparkles, IconDownload } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { farbeFuer, type MitarbeitNote, type Strenge } from '@shared/blattAuswertung'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { starteAuftrag } from '../../shared/auftraege'

const MITARBEIT_FERTIG = 'blatt-mitarbeit-fertig'

type AmpelStand = 'rot' | 'gelb' | 'gruen'

interface AufgabeA {
  nr: number
  ampel: AmpelStand | null
  text: string
  auffaellig: { art: string; text: string }[]
  gleichMit: { name: string; gleich: boolean }[]
  rueckmeldung?: { gelungen?: string; fehlt?: string; schritt?: string }
  /** Geöffnete Hilfekarten (06.10.2026) */
  hilfekarten?: number
}
export interface PersonA {
  id: string
  name: string
  eingereicht: number
  korrekt: number | null
  eigen: number
  wert: number | null
  aufgaben: AufgabeA[]
  /** Geöffnete Hilfekarten insgesamt (06.10.2026) */
  hilfekarten?: number
  staerken: string[]
  schritte: string[]
}
export interface AuswertungDaten {
  personen: PersonA[]
  gleich: { nr: number; gruppen: { namen: string[]; gleich: boolean }[] }[]
  aufgaben: { nr: number; anweisung: string; hilfekarten?: number }[]
  strenge: Strenge
  mitarbeit: Record<string, { note: MitarbeitNote; begruendung: string; hilfen: string[] }>
  erstellt: number
}

export function useAuswertung(id: string): { daten: AuswertungDaten | null; laden: () => void; setDaten: (d: AuswertungDaten) => void } {
  const [daten, setDaten] = useState<AuswertungDaten | null>(null)
  const laden = useCallback(() => void holen<AuswertungDaten>(`/server/blaetter/${id}/auswertung`).then(setDaten, () => setDaten(null)), [id])
  useEffect(() => laden(), [laden])
  return { daten, laden, setDaten }
}

const AMPEL_FARBE: Record<AmpelStand, string> = { rot: 'red', gelb: 'yellow', gruen: 'green' }
const AMPEL_WORT: Record<AmpelStand, string> = { rot: 'noch nicht treffend', gelb: 'teilweise treffend', gruen: 'treffend' }
const STRENGE: { value: Strenge; label: string }[] = [
  { value: 'milde', label: 'Milde' },
  { value: 'normal', label: 'Normal' },
  { value: 'streng', label: 'Streng' }
]

/** Farbiger Knopf je Person; zeigt den Mitarbeitsvorschlag, falls vorhanden */
export function AuswertungKnopf({ p, note, onClick }: { p: PersonA; note?: MitarbeitNote; onClick: () => void }): React.JSX.Element {
  const farbe = p.wert === null ? 'var(--mantine-color-gray-6)' : farbeFuer(p.wert)
  const titel = p.wert === null ? 'Noch keine Einschätzung' : `Korrekt ${Math.round((p.korrekt ?? 0) * 100)} % · eigenständig ${Math.round(p.eigen * 100)} %`
  return (
    <UnstyledButton
      onClick={onClick}
      title={titel}
      data-auswertung-knopf={p.name}
      data-wert={p.wert === null ? '' : p.wert.toFixed(2)}
      style={{
        background: farbe,
        color: '#fff',
        borderRadius: 8,
        padding: '3px 10px',
        fontSize: 13,
        fontWeight: 700,
        minWidth: 74,
        textAlign: 'center'
      }}
    >
      {note ? `Mitarbeit ${note}` : 'Auswertung'}
    </UnstyledButton>
  )
}

/** Pop-up mit der Auswertung einer Person */
export function AuswertungModal({
  p,
  vorschlag,
  schliessen,
  ansehen,
  karten = {}
}: {
  p: PersonA
  vorschlag?: { note: MitarbeitNote; begruendung: string; hilfen: string[] }
  schliessen: () => void
  ansehen: () => void
  /** Vorhandene Hilfekarten je Aufgabe (06.10.2026) */
  karten?: Record<number, number>
}): React.JSX.Element {
  return (
    <Modal opened onClose={schliessen} title={`Auswertung – ${p.name}`} size="lg" data-auswertung-modal>
      <Stack gap="sm">
        <Group gap="xs">
          <Badge color={p.wert === null ? 'gray' : undefined} style={p.wert === null ? undefined : { background: farbeFuer(p.wert) }}>
            {p.wert === null ? 'noch keine Einschätzung' : `korrekt ${Math.round((p.korrekt ?? 0) * 100)} % · eigenständig ${Math.round(p.eigen * 100)} %`}
          </Badge>
          <Text size="sm" c="dimmed">
            {p.eingereicht ? `${p.eingereicht}× eingereicht` : 'nicht eingereicht'}
          </Text>
          {Object.keys(karten).length > 0 && (
            <Badge variant="light" color="yellow" leftSection={<IconBulb size={12} />} data-hilfekarten-person>
              {p.hilfekarten ? `${p.hilfekarten} Hilfekarte${p.hilfekarten === 1 ? '' : 'n'} geöffnet` : 'keine Hilfekarten geöffnet'}
            </Badge>
          )}
        </Group>
        {vorschlag && (
          <Alert color="blue" title={`Vorschlag Mitarbeit: ${vorschlag.note}`} icon={<IconSparkles size={16} />}>
            <Text size="sm">{vorschlag.begruendung}</Text>
            {vorschlag.hilfen.length > 0 && (
              <>
                <Text size="sm" fw={600} mt={6}>
                  Hilfestellungen
                </Text>
                <List size="sm">
                  {vorschlag.hilfen.map((h, i) => (
                    <List.Item key={i}>{h}</List.Item>
                  ))}
                </List>
              </>
            )}
            <Text size="xs" c="dimmed" mt={6}>
              Vorschlag der KI – bitte prüfen.
            </Text>
          </Alert>
        )}
        {p.aufgaben.map((a) => (
          <Stack key={a.nr} gap={2} style={{ borderLeft: `4px solid var(--mantine-color-${a.ampel ? AMPEL_FARBE[a.ampel] : 'gray'}-6)`, paddingLeft: 8 }}>
            <Text size="sm" fw={600}>
              Aufgabe {a.nr}:{' '}
              {!a.text.trim() && (!a.ampel || a.ampel === 'rot') ? 'nicht bearbeitet' : a.ampel ? AMPEL_WORT[a.ampel] : 'bearbeitet, noch nicht eingeschätzt'}
            </Text>
            {karten[a.nr] ? (
              <Text size="xs" c={a.hilfekarten ? 'yellow.8' : 'dimmed'} data-hilfekarten-aufgabe={a.nr}>
                💡 {a.hilfekarten ? `${a.hilfekarten} von ${karten[a.nr]} Hilfekarten geöffnet` : `keine der ${karten[a.nr]} Hilfekarten geöffnet`}
              </Text>
            ) : null}
            {a.rueckmeldung?.gelungen && <Text size="sm">✓ {a.rueckmeldung.gelungen}</Text>}
            {a.rueckmeldung?.fehlt && <Text size="sm">○ {a.rueckmeldung.fehlt}</Text>}
            {a.auffaellig.map((x, i) => (
              <Text key={i} size="sm" c="orange.8">
                <IconAlertTriangle size={13} style={{ verticalAlign: 'middle' }} /> {x.text}
              </Text>
            ))}
          </Stack>
        ))}
        {(p.staerken.length > 0 || p.schritte.length > 0) && (
          <Stack gap={2}>
            <Text size="sm" fw={600}>
              Aus dem Feedback nach dem Einreichen
            </Text>
            {p.staerken.map((s, i) => (
              <Text key={`s${i}`} size="sm">
                ✓ {s}
              </Text>
            ))}
            {p.schritte.map((s, i) => (
              <Text key={`n${i}`} size="sm">
                → {s}
              </Text>
            ))}
          </Stack>
        )}
        <Text size="xs" c="dimmed">
          Hinweise zur Eigenständigkeit (eingefügt, sehr schnell, aus dem Material, gleich wie andere) sind Anhaltspunkte, keine Beweise.
        </Text>
        <Group justify="flex-end">
          <Button variant="light" leftSection={<IconEye size={16} />} onClick={ansehen} disabled={!p.aufgaben.some((a) => a.text.trim()) && !p.eingereicht}>
            Blatt ansehen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/** Kopfleiste der Auswertung: Mitarbeit einschätzen (Strenge), Hilfestellungen, gleiche Abgaben */
export function AuswertungLeiste({
  id,
  titel,
  daten,
  setDaten
}: {
  id: string
  titel: string
  daten: AuswertungDaten
  setDaten: (d: AuswertungDaten) => void
}): React.JSX.Element {
  const [strenge, setStrenge] = useState<Strenge>(daten.strenge)
  const [laeuft, setLaeuft] = useState(false)
  const [hilfen, setHilfen] = useState(false)
  /*
   * Als Auftrag in der Auftragsleiste (09.10.2026, Wunsch der Lehrkraft): Die KI-Einschätzung läuft im Hintergrund weiter,
   * auch wenn man die Auswertung verlässt; fertig landet sie hier (Ereignis) bzw. beim nächsten Öffnen vom Server.
   */
  useEffect(() => {
    const fertig = (e: Event): void => {
      const d = (e as CustomEvent<{ id: string; r: Pick<AuswertungDaten, 'strenge' | 'mitarbeit'> & { erstellt: number } }>).detail
      if (d?.id === id) setDaten({ ...daten, ...d.r })
    }
    window.addEventListener(MITARBEIT_FERTIG, fertig)
    return () => window.removeEventListener(MITARBEIT_FERTIG, fertig)
  }, [id, daten, setDaten])
  const einschaetzen = async (s: Strenge): Promise<void> => {
    setLaeuft(true)
    try {
      await starteAuftrag({
        moduleId: 'freigaben',
        docId: id,
        titel: `Mitarbeit: ${titel}`,
        art: 'Mitarbeit einschätzen',
        eingabe: { strenge: s },
        sperrt: false,
        schluessel: `mitarbeit:${id}`,
        fehlerTitel: 'Keine Einschätzung',
        arbeit: async (e) =>
          senden<{ strenge: Strenge; mitarbeit: AuswertungDaten['mitarbeit']; erstellt: number }>(`/server/blaetter/${id}/mitarbeit`, { strenge: e.strenge }),
        ablegen: async (r) => {
          window.dispatchEvent(new CustomEvent(MITARBEIT_FERTIG, { detail: { id, r } }))
          notifySuccess(`Vorschläge zu Mitarbeit und Hilfen für „${titel}" erstellt.`)
        },
        abschluss: () => 'Mitarbeit eingeschätzt'
      })
    } catch (e) {
      notifyError(e, 'Keine Einschätzung')
    } finally {
      setLaeuft(false)
    }
  }
  const gleichAnzahl = daten.gleich.reduce((s, g) => s + g.gruppen.length, 0)
  // Hilfekarten (06.10.2026): je Aufgabe wie viele Lernende wie viele Karten geöffnet haben
  const mitKarten = daten.aufgaben.filter((a) => a.hilfekarten)
  const karten = mitKarten.map((a) => {
    const nutzer = daten.personen.map((p) => p.aufgaben.find((x) => x.nr === a.nr)?.hilfekarten ?? 0).filter((n) => n > 0)
    return { nr: a.nr, vorhanden: a.hilfekarten!, lernende: nutzer.length, geoeffnet: nutzer.reduce((s, n) => s + n, 0) }
  })
  const kartenGesamt = karten.reduce((s, k) => s + k.geoeffnet, 0)
  const vorhanden = Object.keys(daten.mitarbeit).length > 0
  return (
    <Group gap="xs" wrap="wrap" mb="sm" data-auswertung-leiste>
      <Text size="sm" fw={600}>
        Mitarbeit:
      </Text>
      <SegmentedControl size="xs" data={STRENGE} value={strenge} onChange={(v) => setStrenge(v as Strenge)} data-strenge />
      <Button
        size="xs"
        leftSection={<IconSparkles size={14} />}
        loading={laeuft}
        onClick={() => void einschaetzen(strenge)}
        data-mitarbeit-einschaetzen
        variant={vorhanden && strenge === daten.strenge ? 'light' : 'filled'}
      >
        {vorhanden ? (strenge === daten.strenge ? 'Neu einschätzen' : 'Mit dieser Strenge neu einschätzen') : 'Mitarbeit einschätzen'}
      </Button>
      <Button size="xs" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => setHilfen(true)} disabled={!vorhanden} data-hilfen-uebersicht>
        Hilfestellungen
      </Button>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Button size="xs" variant="light" color={gleichAnzahl ? 'orange' : 'gray'} leftSection={<IconCopy size={14} />} data-gleiche-abgaben>
            Gleiche Abgaben{gleichAnzahl ? ` (${gleichAnzahl})` : ''}
          </Button>
        </Menu.Target>
        <Menu.Dropdown maw={420}>
          {daten.gleich.map((g) => (
            <div key={g.nr}>
              <Menu.Label>Aufgabe {g.nr}</Menu.Label>
              {g.gruppen.length ? (
                g.gruppen.map((x, i) => (
                  <Menu.Item key={i} closeMenuOnClick={false} data-gleich-aufgabe={g.nr}>
                    <Text size="sm">
                      {x.gleich ? 'Gleich' : 'Sehr ähnlich'}: {x.namen.join(', ')}
                    </Text>
                  </Menu.Item>
                ))
              ) : (
                <Menu.Item disabled>
                  <Text size="xs">keine Auffälligkeit</Text>
                </Menu.Item>
              )}
            </div>
          ))}
        </Menu.Dropdown>
      </Menu>
      {karten.length > 0 && (
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <Button size="xs" variant="light" color="yellow" leftSection={<IconBulb size={14} />} data-hilfekarten-summe>
              Hilfekarten: {kartenGesamt} geöffnet
            </Button>
          </Menu.Target>
          <Menu.Dropdown maw={420}>
            <Menu.Label>Geöffnete Hilfekarten je Aufgabe</Menu.Label>
            {karten.map((k) => (
              <Menu.Item key={k.nr} closeMenuOnClick={false} data-hilfekarten-zeile={k.nr}>
                <Text size="sm">
                  Aufgabe {k.nr}: {k.lernende ? `${k.lernende} Lernende, ${k.geoeffnet} Karte${k.geoeffnet === 1 ? '' : 'n'}` : 'nicht genutzt'}{' '}
                  <Text span size="xs" c="dimmed">
                    (von {k.vorhanden} je Person)
                  </Text>
                </Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      {daten.erstellt > 0 && (
        <Text size="xs" c="dimmed">
          Vorschläge vom {new Date(daten.erstellt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} (
          {STRENGE.find((s) => s.value === daten.strenge)?.label})
        </Text>
      )}
      {hilfen && <HilfenUebersicht titel={titel} daten={daten} schliessen={() => setHilfen(false)} />}
    </Group>
  )
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Druckbares Dokument: welche Hilfen wer braucht, mit Mitarbeitsvorschlag */
function hilfenHtml(titel: string, d: AuswertungDaten): string {
  const zeilen = d.personen
    .filter((p) => d.mitarbeit[p.id])
    .map((p) => {
      const m = d.mitarbeit[p.id]
      return `<tr><td><b>${esc(p.name)}</b></td><td class="note">${esc(m.note)}</td><td>${m.hilfen.length ? `<ul>${m.hilfen.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '–'}</td><td class="note">${p.hilfekarten ?? 0}</td><td class="klein">${esc(m.begruendung)}</td></tr>`
    })
    .join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Hilfestellungen – ${esc(titel)}</title>
<style>@page{size:A4;margin:16mm}body{font:11pt/1.4 system-ui,sans-serif;color:#111}h1{font-size:15pt;margin:0 0 2mm}p{margin:0 0 4mm;color:#555}table{width:100%;border-collapse:collapse}th,td{border:0.3mm solid #999;padding:2mm;vertical-align:top;text-align:left}th{background:#eee}.note{text-align:center;font-weight:700;width:14mm}.klein{font-size:9pt;color:#444;width:55mm}ul{margin:0;padding-left:4mm}</style></head>
<body><h1>Hilfestellungen – ${esc(titel)}</h1><p>Stand ${new Date(d.erstellt || Date.now()).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} · Strenge: ${esc(STRENGE.find((s) => s.value === d.strenge)?.label ?? '')} · Vorschläge der KI, von der Lehrkraft zu prüfen</p>
<table><thead><tr><th>Name</th><th>Mitarbeit</th><th>Hilfestellungen</th><th>Hilfe-karten</th><th>Begründung</th></tr></thead><tbody>${zeilen}</tbody></table></body></html>`
}

function HilfenUebersicht({ titel, daten, schliessen }: { titel: string; daten: AuswertungDaten; schliessen: () => void }): React.JSX.Element {
  const html = hilfenHtml(titel, daten)
  return (
    <Modal opened onClose={schliessen} title="Hilfestellungen für die Lerngruppe" size="xl" data-hilfen-modal>
      <Stack>
        <Group justify="flex-end">
          <Button
            variant="light"
            leftSection={<IconPrinter size={16} />}
            onClick={() => void window.api.exporter.print(html).catch((e: unknown) => notifyError(e))}
          >
            Drucken
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={() =>
              void window.api.exporter.pdf(html, `Hilfestellungen – ${titel}.pdf`).then(
                (p) => p && notifySuccess('Gespeichert.'),
                (e: unknown) => notifyError(e)
              )
            }
          >
            Als PDF speichern
          </Button>
        </Group>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Mitarbeit</Table.Th>
              <Table.Th>Hilfestellungen</Table.Th>
              <Table.Th>Begründung</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {daten.personen
              .filter((p) => daten.mitarbeit[p.id])
              .map((p) => {
                const m = daten.mitarbeit[p.id]
                return (
                  <Table.Tr key={p.id} data-hilfen-zeile={p.name}>
                    <Table.Td fw={600}>{p.name}</Table.Td>
                    <Table.Td ta="center" fw={700}>
                      {m.note}
                    </Table.Td>
                    <Table.Td>
                      <List size="sm">
                        {m.hilfen.map((h, i) => (
                          <List.Item key={i}>{h}</List.Item>
                        ))}
                      </List>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {m.begruendung}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
          </Table.Tbody>
        </Table>
      </Stack>
    </Modal>
  )
}
