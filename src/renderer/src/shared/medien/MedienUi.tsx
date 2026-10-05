/**
 * Medienbank in den Vokabeltabellen (05.10.2026): Spalten „Beispielbild", „Aussprache", „Satz-Aussprache",
 * das Bild-Pop-up (löschen, ein anderes gefundenes wählen, von der KI erzeugen lassen) und die Leiste der
 * Admins für die angezeigten Wörter. Lehrkräfte sehen und hören – bearbeiten dürfen nur Admins.
 */
import { ActionIcon, Alert, Badge, Button, Group, Image, Loader, Modal, Progress, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconPhoto, IconPhotoSearch, IconPlayerStop, IconSparkles, IconTrash, IconVolume, IconMessage2 } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { istGanzerSatz, satzSchluessel, sprachKurz, type MedienKandidat, type MedienSicht, type TonArt } from '@shared/medienbank'
import { notifyError, notifySuccess } from '../util'
import { abspielen, bildErzeugen, bildKandidaten, bildSuchenUndSetzen, kandidatUebernehmen, tonErzeugen, type Vokabel } from './medienbank'

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
        <div style={{ width: 44, height: 44, borderRadius: 4, border: '1px dashed var(--mantine-color-default-border)', display: 'grid', placeItems: 'center' }}>
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
  if (!admin) return <Text size="xs" c="dimmed">–</Text>
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
  schliessen,
  geaendert
}: {
  sprache: string
  v: Vokabel
  sicht?: MedienSicht
  admin: boolean
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [kandidaten, setKandidaten] = useState<MedienKandidat[]>(sicht?.bild?.kandidaten ?? [])
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
                    const k = await bildKandidaten(sprache, v)
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
                loading={laeuft === 'ki'}
                onClick={() => void tun('ki', () => bildErzeugen(sprache, v), 'Bild erzeugt.')}
                data-bild-ki
              >
                Von der KI erzeugen
              </Button>
            </Group>
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

type Lauf = { was: string; fertig: number; gesamt: number; fehler: number; leer: number } | null

/** Leiste für Admins: Bilder suchen, Aussprache von Wörtern und Beispielsätzen erzeugen – für die angezeigten Wörter */
export function MedienLeiste({
  sprache,
  vokabeln,
  daten,
  neuLaden
}: {
  sprache: string
  vokabeln: Vokabel[]
  daten: Record<string, MedienSicht>
  neuLaden: () => void
}): React.JSX.Element {
  const [lauf, setLauf] = useState<Lauf>(null)
  const [stimme, setStimme] = useState<string | null>(null)
  const stopp = useRef(false)
  const sp = sprachKurz(sprache)
  useEffect(() => {
    void window.api.medien.stimmen().then((s) => setStimme(s[sp] ?? ''), () => setStimme(''))
  }, [sp])
  const woerter = vokabeln.filter((v) => v.term.trim())
  const ohneBild = woerter.filter((v) => !daten[v.term]?.bild)
  const ohneTon = woerter.filter((v) => !daten[v.term]?.ton || daten[v.term]?.ton?.text.trim() !== v.term.trim())
  const ohneSatz = woerter.filter((v) => istGanzerSatz(v.example) && !daten[v.term]?.saetze?.[satzSchluessel(v.example!)])

  const reihe = async (was: string, liste: Vokabel[], fn: (v: Vokabel) => Promise<boolean | void>): Promise<void> => {
    stopp.current = false
    let fertig = 0
    let fehler = 0
    let leer = 0
    setLauf({ was, fertig, gesamt: liste.length, fehler, leer })
    for (const v of liste) {
      if (stopp.current) break
      try {
        const ok = await fn(v)
        if (ok === false) leer++
      } catch (e) {
        fehler++
        if (fehler === 1) notifyError(e, `${was}: Fehler bei „${v.term}“`)
      }
      fertig++
      setLauf({ was, fertig, gesamt: liste.length, fehler, leer })
      // Zwischendurch zeigen, was schon da ist
      if (fertig % 3 === 0) neuLaden()
    }
    neuLaden()
    notifySuccess(`${was}: ${fertig - fehler - leer} von ${liste.length} erledigt${leer ? `, ${leer} ohne passendes Bild` : ''}${fehler ? `, ${fehler} Fehler` : ''}.`)
    setLauf(null)
  }
  const ohneStimme = stimme === ''
  return (
    <Alert color="violet" variant="light" p="xs" mb="xs" data-medien-leiste>
      <Stack gap={6}>
        <Group gap="xs" wrap="wrap">
          <Badge color="violet" variant="filled">
            Admin
          </Badge>
          <Text size="sm">Medienbank für die angezeigten {woerter.length} Wörter:</Text>
          <Button
            size="xs"
            leftSection={<IconPhotoSearch size={14} />}
            disabled={!!lauf || !ohneBild.length}
            onClick={() => void reihe('Beispielbilder', ohneBild, (v) => bildSuchenUndSetzen(sp, v))}
            data-medien-bilder
          >
            Beispielbilder suchen ({ohneBild.length})
          </Button>
          <Button
            size="xs"
            leftSection={<IconVolume size={14} />}
            disabled={!!lauf || !ohneTon.length || ohneStimme}
            onClick={() => void reihe('Aussprache', ohneTon, (v) => tonErzeugen(sp, v.term, 'wort', v.term, stimme!))}
            data-medien-aussprache
          >
            Aussprache erzeugen ({ohneTon.length})
          </Button>
          <Button
            size="xs"
            leftSection={<IconMessage2 size={14} />}
            disabled={!!lauf || !ohneSatz.length || ohneStimme}
            onClick={() => void reihe('Satz-Aussprache', ohneSatz, (v) => tonErzeugen(sp, v.term, 'satz', v.example!, stimme!))}
            data-medien-satz
          >
            Satz-Aussprache erzeugen ({ohneSatz.length})
          </Button>
          {lauf && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconPlayerStop size={14} />} onClick={() => (stopp.current = true)}>
              Anhalten
            </Button>
          )}
        </Group>
        {ohneStimme && (
          <Text size="xs" c="orange.8">
            Für die Aussprache fehlt eine Standardstimme für diese Sprache – Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“.
          </Text>
        )}
        {lauf && (
          <Group gap="xs" wrap="nowrap">
            <Progress value={(lauf.fertig / Math.max(1, lauf.gesamt)) * 100} style={{ flex: 1 }} animated />
            <Text size="xs">
              {lauf.was}: {lauf.fertig}/{lauf.gesamt}
            </Text>
          </Group>
        )}
      </Stack>
    </Alert>
  )
}

