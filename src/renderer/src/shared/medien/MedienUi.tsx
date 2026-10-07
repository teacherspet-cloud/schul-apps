/**
 * Medienbank in den Vokabeltabellen (05.10.2026): Spalten „Beispielbild", „Aussprache", „Satz-Aussprache",
 * das Bild-Pop-up (löschen, ein anderes gefundenes wählen, von der KI erzeugen lassen) und die Leiste der
 * Admins für die angezeigten Wörter. Lehrkräfte sehen und hören – bearbeiten dürfen nur Admins.
 *
 * Seit 06.10.2026 laufen Suchen und Erzeugen als Hintergrund-Aufträge in der Auftragsleiste (medienAuftrag.ts):
 * Die Leiste stößt nur an, das Pop-up darf während „Von der KI erzeugen" geschlossen werden, und bei
 * Schulbüchern lassen sich mehrere Abschnitte auf einmal in Auftrag geben (`AbschnitteDialog`).
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Image,
  Loader,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconListCheck, IconPhoto, IconPhotoSearch, IconSparkles, IconTrash, IconVolume, IconMessage2 } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { istGanzerSatz, sprachKurz, type MedienKandidat, type MedienSicht, type TonArt } from '@shared/medienbank'
import { notifyError, notifySuccess } from '../util'
import { useLaufendeSchluessel } from '../auftraege'
import { abspielen, bildKandidaten, kandidatUebernehmen, type Vokabel } from './medienbank'
import { aufMedienAenderung, medienSchluessel, offeneVokabeln, starteMedienAuftrag, type MedienArt, type MedienZiel } from './medienAuftrag'

let adminZwischen: Promise<boolean> | null = null
/** Darf diese Person die Medienbank bearbeiten? (einmal je Sitzung gefragt) */
export function useMedienAdmin(): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    adminZwischen ??= window.api.medien.admin().catch(() => false)
    void adminZwischen.then(setAdmin)
  }, [])
  return admin
}

/** Einträge der Medienbank für die Wörter einer Tabelle */
export function useMedienbank(sprache: string | undefined, woerter: string[]): { daten: Record<string, MedienSicht>; laden: () => void } {
  const [daten, setDaten] = useState<Record<string, MedienSicht>>({})
  const schluessel = woerter.filter(Boolean).join('\u0001')
  const laden = useCallback(() => {
    if (!sprache || !schluessel) return setDaten({})
    void window.api.medien.eintraege(sprachKurz(sprache), schluessel.split('\u0001')).then(setDaten, () => setDaten({}))
  }, [sprache, schluessel])
  useEffect(() => laden(), [laden])
  // Medienaufträge im Hintergrund melden jedes erledigte Wort – kurz gesammelt neu laden
  useEffect(() => {
    if (!sprache) return
    let t: ReturnType<typeof setTimeout> | undefined
    const weg = aufMedienAenderung((sp) => {
      if (sp !== sprachKurz(sprache)) return
      clearTimeout(t)
      t = setTimeout(laden, 400)
    })
    return () => {
      clearTimeout(t)
      weg()
    }
  }, [sprache, laden])
  return { daten, laden }
}

export const spiele = (q: { datei?: string; url?: string } | undefined): void => {
  if (q) void abspielen(q).catch((e: unknown) => notifyError(e, 'Abspielen nicht möglich'))
}

/** Zelle „Beispielbild" */
export function BildZelle({ sicht, wort, onOeffnen }: { sicht?: MedienSicht; wort: string; onOeffnen: () => void }): React.JSX.Element {
  const b = sicht?.bild
  return (
    <UnstyledButton onClick={onOeffnen} aria-label={`Beispielbild zu „${wort}“`} data-beispielbild={wort} disabled={!wort.trim()}>
      {b?.dataUrl || b?.url ? (
        <Image src={b.dataUrl ?? b.url} w={44} h={44} fit="cover" radius={4} alt="" />
      ) : (
        <div
          style={{ width: 44, height: 44, borderRadius: 4, border: '1px dashed var(--mantine-color-default-border)', display: 'grid', placeItems: 'center' }}
        >
          <IconPhoto size={16} color="var(--mantine-color-dimmed)" />
        </div>
      )}
    </UnstyledButton>
  )
}

/** Zelle „Aussprache" bzw. „Satz-Aussprache" */
export function TonZelle({
  ton,
  text,
  art,
  admin,
  erzeugen
}: {
  ton?: { datei: string; url?: string; text: string }
  text: string
  art: TonArt
  admin: boolean
  erzeugen: () => Promise<void>
}): React.JSX.Element | null {
  const [laeuft, setLaeuft] = useState(false)
  if (!text.trim()) return null
  if (art === 'satz' && !istGanzerSatz(text)) return null
  const veraltet = ton && ton.text.trim() !== text.trim()
  if (ton && !veraltet)
    return (
      <Tooltip label={art === 'wort' ? 'Aussprache anhören' : 'Beispielsatz anhören'}>
        <ActionIcon variant="light" onClick={() => spiele(ton)} aria-label={`Aussprache „${text}“ anhören`} data-aussprache={art}>
          {art === 'wort' ? <IconVolume size={16} /> : <IconMessage2 size={16} />}
        </ActionIcon>
      </Tooltip>
    )
  if (!admin)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    )
  return (
    <Tooltip label={veraltet ? 'Der Text hat sich geändert – neu erzeugen' : 'Aussprache von der Sprach-KI erzeugen'}>
      <ActionIcon
        variant="subtle"
        color={veraltet ? 'orange' : 'gray'}
        loading={laeuft}
        aria-label={`Aussprache „${text}“ erzeugen`}
        data-aussprache-erzeugen={art}
        onClick={() => {
          setLaeuft(true)
          void erzeugen()
            .catch((e: unknown) => notifyError(e, 'Keine Aussprache'))
            .finally(() => setLaeuft(false))
        }}
      >
        <IconSparkles size={16} />
      </ActionIcon>
    </Tooltip>
  )
}

/** Pop-up eines Beispielbilds: groß ansehen; Admins: löschen, anderes wählen, neu suchen, KI erzeugen */
export function BildDialog({
  sprache,
  v,
  sicht,
  admin,
  ziel,
  schliessen,
  geaendert
}: {
  sprache: string
  v: Vokabel
  sicht?: MedienSicht
  admin: boolean
  /** Stelle der Vokabel – Ziel von „Öffnen" in der Auftragsleiste */
  ziel: MedienZiel
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [kandidaten, setKandidaten] = useState<MedienKandidat[]>(sicht?.bild?.kandidaten ?? [])
  // „Von der KI erzeugen" läuft als Auftrag weiter, auch wenn das Pop-up zugeht
  const kiLaeuft = useLaufendeSchluessel(ziel.docId).has(medienSchluessel('bildKi', v.term))
  const b = sicht?.bild
  const tun = async (was: string, fn: () => Promise<unknown>, meldung?: string): Promise<void> => {
    setLaeuft(was)
    try {
      await fn()
      geaendert()
      if (meldung) notifySuccess(meldung)
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(null)
    }
  }
  return (
    <Modal opened onClose={schliessen} title={`Beispielbild – ${v.term}`} size="lg" data-bild-dialog>
      <Stack>
        {b ? (
          <Stack gap={4} align="center">
            <Image src={b.dataUrl ?? b.url} mah={320} fit="contain" radius="sm" alt={v.term} />
            <Text size="xs" c="dimmed" ta="center">
              {b.herkunft === 'ki' ? 'KI-generiert' : b.nachweis}
            </Text>
          </Stack>
        ) : (
          <Text c="dimmed" ta="center" py="lg">
            Noch kein Beispielbild.
          </Text>
        )}
        {admin && (
          <>
            <Group justify="center" gap="xs">
              {b && (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={16} />}
                  loading={laeuft === 'loeschen'}
                  onClick={() => void tun('loeschen', () => window.api.medien.bildLoeschen(sprache, v.term), 'Bild gelöscht.')}
                  data-bild-loeschen
                >
                  Löschen
                </Button>
              )}
              <Button
                variant="light"
                leftSection={<IconPhotoSearch size={16} />}
                loading={laeuft === 'suchen'}
                onClick={() =>
                  void tun('suchen', async () => {
                    const k = await bildKandidaten(sprache, v, { klasse: ziel.klasse })
                    setKandidaten(k)
                    if (!k.length) throw new Error('Die Bildsuche hat nichts gefunden.')
                  })
                }
                data-bild-neu-suchen
              >
                Andere Bilder suchen
              </Button>
              <Button
                leftSection={<IconSparkles size={16} />}
                loading={kiLaeuft}
                onClick={() => void starteMedienAuftrag({ art: 'bildKi', sprache, vokabeln: [v], ziel, einzeln: true })}
                data-bild-ki
              >
                Von der KI erzeugen
              </Button>
            </Group>
            {kiLaeuft && (
              <Text size="xs" c="dimmed" ta="center" data-bild-ki-hintergrund>
                Die Bild-KI arbeitet im Hintergrund (Auftragsleiste unten rechts) – das Pop-up kann geschlossen werden.
              </Text>
            )}
            {kandidaten.length > 0 && (
              <>
                <Text size="sm" fw={600}>
                  Gefundene Bilder – anklicken zum Übernehmen
                </Text>
                <SimpleGrid cols={{ base: 3, sm: 5 }} spacing="xs">
                  {kandidaten.map((k) => (
                    <Tooltip key={k.url} label={[k.titel, k.urheber, k.lizenz].filter(Boolean).join(' · ')}>
                      <UnstyledButton
                        onClick={() => void tun(`k:${k.url}`, () => kandidatUebernehmen(sprache, v.term, k, kandidaten), 'Bild übernommen.')}
                        style={{ position: 'relative' }}
                        data-bild-kandidat
                      >
                        <Image src={k.vorschau} h={80} fit="cover" radius={4} alt="" />
                        {laeuft === `k:${k.url}` && <Loader size="xs" style={{ position: 'absolute', top: 4, right: 4 }} />}
                      </UnstyledButton>
                    </Tooltip>
                  ))}
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                  Lizenzangaben stehen beim Bild. Bilder aus der Bildsuche ohne Lizenzangabe vor dem Einsatz prüfen.
                </Text>
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}

/** Hinweis, wenn für die Aussprache noch keine Stimme gewählt ist */
function useStandardstimme(sprache: string): string | null {
  const [stimme, setStimme] = useState<string | null>(null)
  const sp = sprachKurz(sprache)
  useEffect(() => {
    void window.api.medien.stimmen().then(
      (s) => setStimme(s[sp] ?? ''),
      () => setStimme('')
    )
  }, [sp])
  return stimme
}

/**
 * Leiste für Admins: Bilder suchen, Aussprache von Wörtern und Beispielsätzen erzeugen – für die angezeigten
 * Wörter. Jeder Knopf gibt einen Auftrag in die Auftragsleiste; solange er läuft, ist der Knopf gesperrt.
 * `mehr`: weitere Knöpfe (bei Schulbüchern „Mehrere Abschnitte …").
 */
export function MedienLeiste({
  sprache,
  vokabeln,
  daten,
  ziel,
  mehr
}: {
  sprache: string
  vokabeln: Vokabel[]
  daten: Record<string, MedienSicht>
  ziel: MedienZiel
  mehr?: React.ReactNode
}): React.JSX.Element {
  const stimme = useStandardstimme(sprache)
  const laufend = useLaufendeSchluessel(ziel.docId)
  const sp = sprachKurz(sprache)
  const woerter = vokabeln.filter((v) => v.term.trim())
  const ohneBild = offeneVokabeln('bilder', woerter, daten)
  const ohneTon = offeneVokabeln('aussprache', woerter, daten)
  const ohneSatz = offeneVokabeln('satz', woerter, daten)
  const ohneStimme = stimme === ''
  const start = (art: MedienArt, liste: Vokabel[]): void => void starteMedienAuftrag({ art, sprache: sp, vokabeln: liste, ziel })
  const knopf = (art: MedienArt, label: string, liste: Vokabel[], icon: React.ReactNode, kennung: string, braucheStimme = false): React.JSX.Element => {
    const laeuft = laufend.has(medienSchluessel(art))
    return (
      <Button
        size="xs"
        leftSection={icon}
        loading={laeuft}
        disabled={laeuft || !liste.length || (braucheStimme && ohneStimme)}
        onClick={() => start(art, liste)}
        {...{ [kennung]: true }}
      >
        {label} ({liste.length})
      </Button>
    )
  }
  return (
    <Alert color="violet" variant="light" p="xs" mb="xs" data-medien-leiste>
      <Stack gap={6}>
        <Group gap="xs" wrap="wrap">
          <Badge color="violet" variant="filled">
            Admin
          </Badge>
          <Text size="sm">Medienbank für die angezeigten {woerter.length} Wörter:</Text>
          {knopf('bilder', 'Beispielbilder suchen', ohneBild, <IconPhotoSearch size={14} />, 'data-medien-bilder')}
          {knopf('aussprache', 'Aussprache erzeugen', ohneTon, <IconVolume size={14} />, 'data-medien-aussprache', true)}
          {knopf('satz', 'Satz-Aussprache erzeugen', ohneSatz, <IconMessage2 size={14} />, 'data-medien-satz', true)}
          {mehr}
        </Group>
        {ohneStimme && (
          <Text size="xs" c="orange.8">
            Für die Aussprache fehlt eine Standardstimme für diese Sprache – Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Läuft im Hintergrund – Fortschritt in der Auftragsleiste unten rechts. Bei ausgelasteten Diensten wartet der Auftrag und macht danach weiter.
          {ziel.klasse && ziel.klasse <= 6 ? ' Für jüngere Lernende werden zuerst Cliparts gesucht.' : ''}
        </Text>
      </Stack>
    </Alert>
  )
}

/** Ein Abschnitt eines Schulbuchs für den Sammelauftrag */
export interface MedienAbschnitt {
  unit: string
  abschnitt: string
  vokabeln: Vokabel[]
  ziel: MedienZiel
}

/**
 * Mehrere Abschnitte eines Schulbuchs auf einmal in Auftrag geben (06.10.2026): je Abschnitt und Art ein Auftrag
 * in der Auftragsleiste – so führt „Öffnen" jeweils genau zu seinem Abschnitt. Es laufen höchstens zwei zugleich.
 */
export function AbschnitteDialog({
  opened,
  onClose,
  sprache,
  abschnitte
}: {
  opened: boolean
  onClose: () => void
  sprache: string
  abschnitte: MedienAbschnitt[]
}): React.JSX.Element {
  const [wahl, setWahl] = useState<string[]>([])
  const [arten, setArten] = useState<MedienArt[]>(['bilder', 'aussprache'])
  const stimme = useStandardstimme(sprache)
  const key = (a: MedienAbschnitt): string => a.ziel.docId
  const alle = wahl.length === abschnitte.length && abschnitte.length > 0
  const tonOhneStimme = stimme === '' && arten.some((a) => a === 'aussprache' || a === 'satz')
  const starten = (): void => {
    let n = 0
    for (const a of abschnitte.filter((x) => wahl.includes(key(x)))) {
      for (const art of arten) {
        if (stimme === '' && (art === 'aussprache' || art === 'satz')) continue
        void starteMedienAuftrag({ art, sprache: sprachKurz(sprache), vokabeln: a.vokabeln, ziel: a.ziel })
        n++
      }
    }
    if (n) notifySuccess(`${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} in der Auftragsleiste – sie laufen nacheinander im Hintergrund.`)
    setWahl([])
    onClose()
  }
  return (
    <Modal opened={opened} onClose={onClose} title="Mehrere Abschnitte bearbeiten" size="lg" data-medien-abschnitte>
      <Stack>
        <Group gap="md">
          {(
            [
              ['bilder', 'Beispielbilder suchen'],
              ['aussprache', 'Aussprache'],
              ['satz', 'Satz-Aussprache']
            ] as [MedienArt, string][]
          ).map(([art, label]) => (
            <Checkbox
              key={art}
              label={label}
              checked={arten.includes(art)}
              onChange={(e) => {
                const an = e.currentTarget.checked
                setArten((x) => (an ? [...x, art] : x.filter((y) => y !== art)))
              }}
              data-medien-art={art}
            />
          ))}
        </Group>
        {tonOhneStimme && (
          <Text size="xs" c="orange.8">
            Ohne Standardstimme für diese Sprache wird keine Aussprache erzeugt (Einstellungen › Bilder und Hörtexte).
          </Text>
        )}
        <Checkbox
          label="Alle Abschnitte"
          checked={alle}
          indeterminate={wahl.length > 0 && !alle}
          onChange={(e) => setWahl(e.currentTarget.checked ? abschnitte.map(key) : [])}
        />
        <ScrollArea.Autosize mah={360} type="auto">
          <Stack gap={4}>
            {abschnitte.map((a) => (
              <Checkbox
                key={key(a)}
                label={`${a.unit} · ${a.abschnitt} (${a.vokabeln.filter((v) => v.term.trim()).length} Wörter)`}
                checked={wahl.includes(key(a))}
                onChange={(e) => {
                  const an = e.currentTarget.checked
                  setWahl((x) => (an ? [...x, key(a)] : x.filter((y) => y !== key(a))))
                }}
                data-medien-abschnitt={key(a)}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed">
          Je Abschnitt und Art entsteht ein Auftrag; bearbeitet wird nur, was noch fehlt. Bei ausgelasteten Diensten (zu viele Anfragen, Kontingent) warten die
          Aufträge und machen danach von selbst weiter.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button leftSection={<IconListCheck size={16} />} disabled={!wahl.length || !arten.length} onClick={starten} data-medien-abschnitte-start>
            In Auftrag geben
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
