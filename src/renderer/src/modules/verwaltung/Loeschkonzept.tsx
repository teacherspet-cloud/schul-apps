/**
 * Verwaltung › Server: Sicherung außerhalb des Servers und Löschkonzept (23.10.2026, Prüfung des Schulträgers, Punkt 7).
 *
 *  - Sicherung außerhalb des Servers: Nachtsicherung (Archiv verschlüsselt für den Betreiber-PC), monatlicher
 *    Wiederherstellungstest (grün/rot), Abholung durch den PC – Daten: GET /server/loeschkonzept › sicherung
 *    (server/sicherungen.ts › sicherungAussen).
 *  - Löschkonzept: Fristen einstellen, letzter Lauf, „Zur Löschung vorgesehen" (Aufschieben), abgegangene Lehrkräfte
 *    (nur von Hand: „Konto und Daten löschen" mit Bestätigung). Server: server/loeschkonzept.ts.
 */
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, NumberInput, SimpleGrid, Stack, Switch, Table, Text, Title, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconClockPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'

type Ampel = 'ok' | 'warnung' | 'fehler'
interface Einstellung {
  an: boolean
  abgangTage: number
  fristTage: number
  aufschubTage: number
  gastTage: number
  protokollTage: number
  schwelle: number
}
interface Vorgemerkt {
  id: string
  name: string
  benutzer: string
  klasse: string
  quelle: string
  gesehen: string
  markiert: string
  loeschenAb: string
  aufgeschoben: boolean
}
interface Lehrkraft {
  id: string
  name: string
  benutzer: string
  gesehen: string
  tage: number
}
interface Stand {
  zeit: string
  anlass: string
  zahlen: Record<string, number>
  warnung: string
  iserv: { zeit: string; ok: boolean; anzahl: number; meldung: string } | null
}
interface Daten {
  einstellung: Einstellung
  standard: Einstellung
  grenzen: Record<string, [number, number]>
  stand: Stand | null
  iservBereit: boolean
  lernende: number
  vorgemerkt: Vorgemerkt[]
  lehrkraefte: Lehrkraft[]
  sicherung: {
    nacht: { zeit: string; ok: boolean; archiv: string; groesse: number; verfahren: string; meldung: string } | null
    pruefung: {
      zeit: string
      ok: boolean
      tabellen: number
      zeilen: number
      dateien: { erwartet: number; gefunden: number } | null
      entschluesselt: { geprueft: number; ok: number }
      meldung: string
    } | null
    abgeholt: { zeit: string; archiv: string } | null
    ampel: { nacht: Ampel; pruefung: Ampel; abgeholt: Ampel }
  }
}

const datum = (z: string | undefined | null): string => (z && Number.isFinite(Date.parse(z)) ? new Date(z).toLocaleDateString('de-DE') : '–')
const zeit = (z: string | undefined | null): string =>
  z && Number.isFinite(Date.parse(z)) ? new Date(z).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'
const mb = (b: number): string => `${(b / 1024 / 1024).toFixed(1)} MB`
const FARBE: Record<Ampel, string> = { ok: 'teal', warnung: 'orange', fehler: 'red' }

function Zeile({ titel, ampel, text, unter }: { titel: string; ampel: Ampel; text: string; unter?: string }): React.JSX.Element {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" data-sicherung-zeile={titel}>
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600} size="sm">
          {titel}
        </Text>
        {unter && (
          <Text size="xs" c="dimmed">
            {unter}
          </Text>
        )}
      </Stack>
      <Badge color={FARBE[ampel]} variant="light" style={{ textTransform: 'none', flexShrink: 0 }}>
        {text}
      </Badge>
    </Group>
  )
}

const FELDER: { k: Exclude<keyof Einstellung, 'an'>; titel: string; hilfe: string }[] = [
  { k: 'abgangTage', titel: 'Karenzzeit Lernende (Tage)', hilfe: 'So lange ohne Anmeldung und nicht in der IServ-Liste, dann „zur Löschung vorgesehen" (deckt die Sommerferien).' },
  { k: 'fristTage', titel: 'Frist bis zum Löschen (Tage)', hilfe: 'In dieser Zeit steht die Person in der Liste und lässt sich aufschieben.' },
  { k: 'aufschubTage', titel: 'Aufschub (Tage)', hilfe: '„Aufschieben" verlängert die Frist um so viele Tage.' },
  { k: 'gastTage', titel: 'Gäste nach Ende der Freigabe (Tage)', hilfe: 'Ein Schuljahr: Gäste, deren Freigaben so lange beendet sind bzw. die so lange nicht da waren.' },
  { k: 'protokollTage', titel: 'Prüfprotokoll (Tage)', hilfe: 'Ältere Einträge werden gelöscht (zusätzlich höchstens 20 000).' },
  { k: 'schwelle', titel: 'Schutz vor Massenlöschung (%)', hilfe: 'Würden auf einmal mehr Lernende vorgemerkt, wird in dieser Nacht niemand vorgemerkt.' }
]

export function LoeschkonzeptKarten({ sichtbar }: { sichtbar: boolean }): React.JSX.Element | null {
  const [d, setD] = useState<Daten | null>(null)
  const [entwurf, setEntwurf] = useState<Einstellung | null>(null)
  const [arbeitet, setArbeitet] = useState('')
  const [loeschen, setLoeschen] = useState<Lehrkraft | null>(null)
  const [bestaetigt, setBestaetigt] = useState(false)

  const laden = useCallback(() => {
    void holen<Daten>('/server/loeschkonzept')
      .then((x) => {
        setD(x)
        setEntwurf(x.einstellung)
      })
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(() => {
    if (sichtbar) laden()
  }, [sichtbar, laden])
  if (!sichtbar) return null
  if (!d || !entwurf) return <Loader size="sm" />

  const s = d.sicherung
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(d.einstellung)
  const speichern = (): void => {
    setArbeitet('einstellung')
    void senden<{ einstellung: Einstellung }>('/server/loeschkonzept/einstellung', entwurf)
      .then(() => (notifySuccess('Löschkonzept gespeichert.'), laden()))
      .catch((e: unknown) => notifyError(e))
      .finally(() => setArbeitet(''))
  }
  const jetzt = (): void => {
    setArbeitet('jetzt')
    void senden('/server/loeschkonzept/jetzt', {}, 10 * 60_000)
      .then(() => (notifySuccess('Lauf beendet.'), laden()))
      .catch((e: unknown) => notifyError(e))
      .finally(() => setArbeitet(''))
  }
  // Nach dem Zurückspielen einer Sicherung (23.10.2026, deploy/strato/WIEDERHERSTELLEN.md): gelöschte Konten erneut löschen
  const nachziehen = (): void => {
    setArbeitet('nachziehen')
    void senden<{ nachgezogen: number }>('/server/loeschkonzept/nachziehen', {})
      .then((r) => (notifySuccess(`Löschungen nachgezogen: ${r.nachgezogen} Konten.`), laden()))
      .catch((e: unknown) => notifyError(e))
      .finally(() => setArbeitet(''))
  }
  const aufschieben = (v: Vorgemerkt): void => {
    setArbeitet(v.id)
    void senden('/server/loeschkonzept/aufschieben', { id: v.id })
      .then(() => (notifySuccess(`Löschung um ${d.einstellung.aufschubTage} Tage aufgeschoben.`), laden()))
      .catch((e: unknown) => notifyError(e))
      .finally(() => setArbeitet(''))
  }
  const lehrkraftLoeschen = (): void => {
    if (!loeschen) return
    setArbeitet(loeschen.id)
    void senden('/server/loeschkonzept/lehrkraft-loeschen', { id: loeschen.id, bestaetigt: true })
      .then(() => (notifySuccess('Konto und Daten gelöscht.'), setLoeschen(null), laden()))
      .catch((e: unknown) => notifyError(e))
      .finally(() => setArbeitet(''))
  }

  const z = d.stand?.zahlen ?? {}
  const ampelGesamt: Ampel = [s.ampel.nacht, s.ampel.pruefung, s.ampel.abgeholt].includes('fehler')
    ? 'fehler'
    : [s.ampel.nacht, s.ampel.pruefung, s.ampel.abgeholt].includes('warnung')
      ? 'warnung'
      : 'ok'

  return (
    <Stack data-loeschkonzept>
      <Card withBorder padding="lg" data-sicherung-aussen={ampelGesamt}>
        <Title order={5} mb="sm">
          Sicherung außerhalb des Servers
        </Title>
        <Stack gap="sm">
          <Zeile
            titel="Nachtsicherung (Datenbank und Dateien)"
            ampel={s.ampel.nacht}
            text={
              !s.nacht
                ? 'noch keine'
                : !s.nacht.verfahren || !s.nacht.archiv
                  ? 'keine Kopie für den PC (Schlüssel fehlt)'
                  : !s.nacht.ok
                    ? 'fehlgeschlagen'
                    : `${zeit(s.nacht.zeit)} · ${mb(s.nacht.groesse)}`
            }
            unter={s.nacht ? `${s.nacht.archiv || '–'} · ${s.nacht.verfahren ? `verschlüsselt (${s.nacht.verfahren})` : 'nicht verschlüsselt abgelegt'} · ${s.nacht.meldung}` : 'Das Skript des Servers (schul-apps-sicherung.sh) hat noch keinen Stand gemeldet.'}
          />
          <Zeile
            titel="Wiederherstellungstest (monatlich)"
            ampel={s.ampel.pruefung}
            text={!s.pruefung ? 'noch nicht gelaufen' : s.pruefung.ok ? `bestanden ${datum(s.pruefung.zeit)}` : `fehlgeschlagen ${datum(s.pruefung.zeit)}`}
            unter={
              s.pruefung
                ? `${s.pruefung.tabellen} Tabellen, ${s.pruefung.zeilen} Zeilen, ${s.pruefung.dateien?.gefunden ?? 0} Dateien, ${s.pruefung.entschluesselt.ok} von ${s.pruefung.entschluesselt.geprueft} Stichproben entschlüsselt – ${s.pruefung.meldung}`
                : 'Läuft am 1. jedes Monats nach der Nachtsicherung.'
            }
          />
          <Zeile
            titel="Abgeholt vom Betreiber-PC"
            ampel={s.ampel.abgeholt}
            text={s.abgeholt ? zeit(s.abgeholt.zeit) : 'noch nie'}
            unter={s.abgeholt ? s.abgeholt.archiv : 'Geplante Aufgabe am PC: scripts/sicherung-holen-einrichten.ps1'}
          />
        </Stack>
      </Card>

      <KlappKarte
        id="verwaltung-loeschkonzept"
        titel="Löschkonzept"
        ton={d.stand?.warnung || d.vorgemerkt.length ? 'warnung' : 'neutral'}
        status={`${d.einstellung.an ? 'automatisch' : 'aus'} · ${d.vorgemerkt.length} zur Löschung vorgesehen · letzter Lauf ${zeit(d.stand?.zeit)}`}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Daten der Lernenden bleiben bis zum Ende der Schullaufbahn. Wer weder sich anmeldet noch in der IServ-Benutzerliste steht, gilt nach der
            Karenzzeit als abgegangen und ist dann für die Dauer der Frist „zur Löschung vorgesehen"; danach werden Konto und alle Daten gelöscht.
            Lehrkräfte werden nie automatisch gelöscht. Jeder Lauf steht mit Zahlen im Protokoll.
          </Text>
          {!d.iservBereit && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              Ohne IServ-Anbindung zählt nur die letzte Anmeldung.
            </Alert>
          )}
          {d.stand?.iserv && !d.stand.iserv.ok && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="IServ-Benutzerliste nicht verfügbar">
              {d.stand.iserv.meldung || 'Keine Konten geliefert.'} Ohne die Liste zählt nur die letzte Anmeldung.
            </Alert>
          )}
          {d.stand?.warnung && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {d.stand.warnung}
            </Alert>
          )}

          <Switch checked={entwurf.an} onChange={(e) => setEntwurf({ ...entwurf, an: e.currentTarget.checked })} label="Konten abgegangener Lernender und alter Gäste automatisch löschen" />
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {FELDER.map((f) => (
              <NumberInput
                key={f.k}
                label={f.titel}
                description={f.hilfe}
                value={entwurf[f.k]}
                min={d.grenzen[f.k]?.[0]}
                max={d.grenzen[f.k]?.[1]}
                onChange={(v) => setEntwurf({ ...entwurf, [f.k]: Number(v) || d.standard[f.k] })}
              />
            ))}
          </SimpleGrid>
          <Group>
            <Button onClick={speichern} disabled={!geaendert} loading={arbeitet === 'einstellung'}>
              Speichern
            </Button>
            <Button variant="default" onClick={() => setEntwurf(d.standard)}>
              Vorgaben
            </Button>
            <Button variant="light" leftSection={<IconPlayerPlay size={16} />} onClick={jetzt} loading={arbeitet === 'jetzt'}>
              Jetzt ausführen
            </Button>
            <Tooltip label="Nach dem Zurückspielen einer Sicherung: Konten, die schon gelöscht waren, erneut löschen" multiline w={280}>
              <Button variant="subtle" onClick={nachziehen} loading={arbeitet === 'nachziehen'} data-loeschungen-nachziehen>
                Löschungen nachziehen
              </Button>
            </Tooltip>
          </Group>
          {d.stand && (
            <Text size="sm" c="dimmed" data-loeschkonzept-stand>
              Letzter Lauf {zeit(d.stand.zeit)}: {z.vorgemerkt ?? 0} vorgemerkt, {z.zurueck ?? 0} zurückgenommen, {z.geloescht ?? 0} Lernende und {z.gaeste ?? 0} Gäste gelöscht,{' '}
              {z.krisen ?? 0} Krisenhinweise, {z.vorfaelle ?? 0} Vorfälle und {z.protokoll ?? 0} Protokollzeilen entfernt
              {z.aufsicht ? `, ${z.aufsicht} Aufsichtsprotokolle verdichtet` : ''}
              {z.nachgezogen ? `, ${z.nachgezogen} Löschungen nachgezogen` : ''}. Geprüft werden {d.lernende} Konten von Lernenden.
            </Text>
          )}

          <Title order={5}>Zur Löschung vorgesehen ({d.vorgemerkt.length})</Title>
          {d.vorgemerkt.length ? (
            <Table striped withTableBorder data-vorgemerkt>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Klasse</Table.Th>
                  <Table.Th>Zuletzt gesehen</Table.Th>
                  <Table.Th>Löschung ab</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.vorgemerkt.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      {v.name} <Text span size="xs" c="dimmed">({v.benutzer})</Text>
                    </Table.Td>
                    <Table.Td>{v.klasse || '–'}</Table.Td>
                    <Table.Td>{datum(v.gesehen)}</Table.Td>
                    <Table.Td>
                      {datum(v.loeschenAb)}
                      {v.aufgeschoben && (
                        <Badge ml="xs" size="xs" variant="light">
                          aufgeschoben
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="subtle" leftSection={<IconClockPause size={14} />} loading={arbeitet === v.id} onClick={() => aufschieben(v)}>
                        Aufschieben
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              Niemand.
            </Text>
          )}

          <Title order={5}>Abgegangene Lehrkräfte ({d.lehrkraefte.length})</Title>
          <Text size="sm" c="dimmed">
            Länger als die Karenzzeit nicht gesehen. Wird nie automatisch gelöscht – das Material der Lehrkraft geht beim Löschen mit.
          </Text>
          {d.lehrkraefte.length > 0 && (
            <Table striped withTableBorder data-abgegangene-lehrkraefte>
              <Table.Tbody>
                {d.lehrkraefte.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>
                      {l.name} <Text span size="xs" c="dimmed">({l.benutzer})</Text>
                    </Table.Td>
                    <Table.Td>
                      zuletzt {datum(l.gesehen)} ({l.tage} Tage)
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="subtle"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => {
                          setBestaetigt(false)
                          setLoeschen(l)
                        }}
                      >
                        Konto und Daten löschen
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </KlappKarte>

      <Modal opened={Boolean(loeschen)} onClose={() => setLoeschen(null)} title="Konto und Daten löschen">
        <Stack>
          <Text size="sm">
            Das Konto von {loeschen?.name} wird mit allem gelöscht: Material, Lerngruppen, Freigaben samt Abgaben der Lernenden, Einstellungen und Ablage.
            Das lässt sich nicht rückgängig machen (nur aus einer Sicherung).
          </Text>
          <Checkbox checked={bestaetigt} onChange={(e) => setBestaetigt(e.currentTarget.checked)} label="Endgültig löschen" />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setLoeschen(null)}>
              Abbrechen
            </Button>
            <Button color="red" disabled={!bestaetigt} loading={Boolean(loeschen && arbeitet === loeschen.id)} onClick={lehrkraftLoeschen}>
              Löschen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
