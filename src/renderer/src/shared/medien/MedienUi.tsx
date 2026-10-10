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
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconListCheck, IconPhoto, IconPhotoSearch, IconSparkles, IconTrash, IconVolume, IconMessage2 } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  BILDSTUFE_NAME,
  BILDSTUFEN,
  istGanzerSatz,
  sprachKurz,
  STIMMLAGE_NAME,
  stufeVon,
  tonPasst,
  type Bildstufe,
  type MedienKandidat,
  type MedienSicht,
  type Stimmen,
  type Stimmlage,
  type TonArt
} from '@shared/medienbank'
import { notifyError, notifySuccess } from '../util'
import { useLaufendeSchluessel } from '../auftraege'
import { abspielen, bildKandidaten, kandidatUebernehmen, type Vokabel } from './medienbank'
import { aufMedienAenderung, lagenVon, medienSchluessel, offeneVokabeln, starteMedienAuftrag, type MedienArt, type MedienZiel } from './medienAuftrag'

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

/*
 * Bildstufe der Ansicht (07.10.2026): aus der Klasse der Liste bzw. des Lehrwerks, in der Medienleiste umstellbar.
 * Die Wahl gilt für die Liste bzw. das ganze Lehrwerk, solange das Programm offen ist.
 */
const useStufenWahl = create<{ wahl: Record<string, Bildstufe>; setze: (schluessel: string, s: Bildstufe) => void }>((set) => ({
  wahl: {},
  setze: (schluessel, s) => set((x) => ({ wahl: { ...x.wahl, [schluessel]: s } }))
}))
const wahlSchluessel = (docId: string): string => docId.split('|')[0]

/** Ziel mit Bildstufe (von Hand gewählt oder aus der Klasse) */
export function useMedienZiel(ziel: MedienZiel): MedienZiel & { stufe: Bildstufe } {
  const gewaehlt = useStufenWahl((x) => x.wahl[wahlSchluessel(ziel.docId)])
  return { ...ziel, stufe: gewaehlt ?? stufeVon(ziel.klasse) }
}

/** Einträge der Medienbank für die Wörter einer Tabelle – Bilder in der Bildstufe `stufe` */
export function useMedienbank(
  sprache: string | undefined,
  woerter: string[],
  stufe?: Bildstufe
): { daten: Record<string, MedienSicht>; laden: () => void; bereit: boolean } {
  const [daten, setDaten] = useState<Record<string, MedienSicht>>({})
  const schluessel = woerter.filter(Boolean).join('\u0001')
  // Für welche Wörter die Daten gelten (09.10.2026): bis sie da sind, zählen die Knöpfe nicht „alles offen" (kein Aufblinken)
  const auftrag = `${sprache ?? ''}|${stufe ?? ''}|${schluessel}`
  const [geladenFuer, setGeladenFuer] = useState('')
  const laden = useCallback(() => {
    const fuer = `${sprache ?? ''}|${stufe ?? ''}|${schluessel}`
    if (!sprache || !schluessel) {
      setDaten({})
      return setGeladenFuer(fuer)
    }
    void window.api.medien.eintraege(sprachKurz(sprache), schluessel.split('\u0001'), stufe).then(
      (d) => {
        setDaten(d)
        setGeladenFuer(fuer)
      },
      () => {
        setDaten({})
        setGeladenFuer(fuer)
      }
    )
  }, [sprache, schluessel, stufe])
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
  return { daten, laden, bereit: geladenFuer === auftrag }
}

export const spiele = (q: { datei?: string; url?: string } | undefined): void => {
  if (q) void abspielen(q).catch((e: unknown) => notifyError(e, 'Abspielen nicht möglich'))
}

/** Zelle „Beispielbild" – `stufe`: Bildstufe der Ansicht; ein Bild einer anderen Stufe erscheint blass mit deren Namen */
export function BildZelle({ sicht, wort, onOeffnen, stufe }: { sicht?: MedienSicht; wort: string; onOeffnen: () => void; stufe?: Bildstufe }): React.JSX.Element {
  const b = sicht?.bild
  const fremd = Boolean(stufe && sicht?.bildStufe && sicht.bildStufe !== stufe)
  return (
    <UnstyledButton
      onClick={onOeffnen}
      aria-label={`Beispielbild zu „${wort}“`}
      data-beispielbild={wort}
      data-bildstufe={sicht?.bildStufe}
      disabled={!wort.trim()}
      title={fremd ? `Bild aus Stufe ${BILDSTUFE_NAME[sicht!.bildStufe!]} – für ${BILDSTUFE_NAME[stufe!]} gibt es noch keins` : undefined}
      style={{ position: 'relative' }}
    >
      {b?.dataUrl || b?.url ? (
        <>
          <Image src={b.dataUrl ?? b.url} w={44} h={44} fit="cover" radius={4} alt="" style={fremd ? { opacity: 0.45 } : undefined} />
          {fremd && (
            <Text
              size="9px"
              fw={700}
              style={{ position: 'absolute', bottom: 1, left: 1, right: 1, textAlign: 'center', background: 'var(--mantine-color-body)', borderRadius: 3, lineHeight: 1.3 }}
            >
              {BILDSTUFE_NAME[sicht!.bildStufe!].replace('Kl. ', '')}
            </Text>
          )}
        </>
      ) : stufe && sicht?.ohneBild?.includes(stufe) ? (
        <div
          style={{ width: 44, height: 44, borderRadius: 4, border: '1px dashed var(--mantine-color-default-border)', display: 'grid', placeItems: 'center' }}
          title="Für diese Stufe ohne Bild – kein eindeutiges Motiv (abstraktes Wort)"
          data-ohne-bild
        >
          <Text size="10px" c="dimmed">
            –
          </Text>
        </div>
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
  erzeugen,
  lage,
  gesprochen
}: {
  ton?: { datei: string; url?: string; text: string; gesprochen?: string }
  text: string
  /** Erwarteter Sprechtext (Abkürzungen, eigene Aussprache, 09.10.2026) – weicht die Aufnahme ab, ist sie veraltet */
  gesprochen?: string
  art: TonArt
  admin: boolean
  erzeugen: () => Promise<void>
  /** Fassung (07.10.2026) – steht klein am Knopf, wenn es zwei gibt */
  lage?: Stimmlage
}): React.JSX.Element | null {
  const [laeuft, setLaeuft] = useState(false)
  if (!text.trim()) return null
  if (art === 'satz' && !istGanzerSatz(text)) return null
  // Schreibvarianten („a / one" – „a/one", „it’s" – „it's") gelten als dieselbe Aufnahme (10.10.2026, shared/medienbank.ts)
  const veraltet = ton && !tonPasst(ton, text, gesprochen, art)
  const fassung = lage ? ` (${STIMMLAGE_NAME[lage]})` : ''
  const marke = (knopf: React.JSX.Element): React.JSX.Element =>
    lage ? (
      <Group gap={1} wrap="nowrap" data-lage={lage}>
        {knopf}
        <Text size="10px" c="dimmed" fw={600}>
          {lage}
        </Text>
      </Group>
    ) : (
      knopf
    )
  if (ton && !veraltet)
    return marke(
      <Tooltip label={(art === 'wort' ? 'Aussprache anhören' : 'Beispielsatz anhören') + fassung}>
        <ActionIcon variant="light" onClick={() => spiele(ton)} aria-label={`Aussprache „${text}“ anhören${fassung}`} data-aussprache={art}>
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
  return marke(
    <Tooltip label={(veraltet ? 'Der Text hat sich geändert – neu erzeugen' : 'Aussprache von der Sprach-KI erzeugen') + fassung}>
      <ActionIcon
        variant="subtle"
        color={veraltet ? 'orange' : 'gray'}
        loading={laeuft}
        aria-label={`Aussprache „${text}“ erzeugen${fassung}`}
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
  const stufe = ziel.stufe ?? stufeVon(ziel.klasse)
  const b = sicht?.bild
  // Bild einer anderen Stufe (Rückfall) – löschen träfe dann nicht das gezeigte
  const fremd = Boolean(b && sicht?.bildStufe && sicht.bildStufe !== stufe)
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
            {fremd && (
              <Text size="xs" c="orange.8" ta="center" data-bild-fremde-stufe>
                Bild der Stufe {BILDSTUFE_NAME[sicht!.bildStufe!]} – für {BILDSTUFE_NAME[stufe]} gibt es noch kein eigenes. Lernende dieser Stufe sehen bis dahin dieses.
              </Text>
            )}
          </Stack>
        ) : (
          <Text c="dimmed" ta="center" py="lg">
            {sicht?.ohneBild?.includes(stufe)
              ? `Für ${BILDSTUFE_NAME[stufe]} ohne Bild: Die KI sieht kein eindeutiges Motiv (abstraktes Wort). Von Hand suchen oder erzeugen geht trotzdem.`
              : 'Noch kein Beispielbild.'}
          </Text>
        )}
        <Text size="xs" c="dimmed" ta="center">
          Bildstufe: {BILDSTUFE_NAME[stufe]}
        </Text>
        {admin && (
          <>
            <Group justify="center" gap="xs">
              {b && !fremd && (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={16} />}
                  loading={laeuft === 'loeschen'}
                  onClick={() => void tun('loeschen', () => window.api.medien.bildLoeschen(sprache, v.term, stufe), 'Bild gelöscht.')}
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
                    const k = await bildKandidaten(sprache, v, { klasse: ziel.klasse, stufe })
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
                        onClick={() => void tun(`k:${k.url}`, () => kandidatUebernehmen(sprache, v.term, k, kandidaten, stufe), 'Bild übernommen.')}
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

/** Standardstimmen der Sprache (weiblich/männlich) – null, solange unbekannt */
export function useStandardstimmen(sprache: string): Stimmen | null {
  const [stimmen, setStimmen] = useState<Stimmen | null>(null)
  const sp = sprachKurz(sprache)
  useEffect(() => {
    void window.api.medien.stimmen().then(
      (s) => setStimmen(s[sp] ?? {}),
      () => setStimmen({})
    )
  }, [sp])
  return stimmen
}

/** Ist eine Bild-KI eingerichtet? */
export function useBildKiDa(): boolean {
  const [da, setDa] = useState(false)
  useEffect(() => {
    let weg = false
    void window.api.ai
      .status()
      .then((s) => !weg && setDa(Boolean(s.hasImageKey)))
      .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [])
  return da
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
  mehr,
  bereit = true
}: {
  sprache: string
  vokabeln: Vokabel[]
  daten: Record<string, MedienSicht>
  ziel: MedienZiel
  mehr?: React.ReactNode
  /** Medienbank-Daten für diese Wörter geladen? Vorher Knöpfe gesperrt ohne Zahl (09.10.2026) */
  bereit?: boolean
}): React.JSX.Element {
  const stimmen = useStandardstimmen(sprache)
  const lagen = lagenVon(stimmen ?? undefined)
  const laufend = useLaufendeSchluessel(ziel.docId)
  const bildKi = useBildKiDa()
  const sp = sprachKurz(sprache)
  const woerter = vokabeln.filter((v) => v.term.trim())
  const stufe = ziel.stufe ?? stufeVon(ziel.klasse)
  const setzeStufe = useStufenWahl((x) => x.setze)
  const ohneBild = offeneVokabeln('bilder', woerter, daten, ['w'], stufe, sp)
  const ohneTon = offeneVokabeln('aussprache', woerter, daten, lagen.length ? lagen : ['w'], stufe, sp)
  const ohneSatz = offeneVokabeln('satz', woerter, daten, lagen.length ? lagen : ['w'], stufe, sp)
  const ohneStimme = stimmen !== null && !lagen.length
  const start = (art: MedienArt, liste: Vokabel[]): void => void starteMedienAuftrag({ art, sprache: sp, vokabeln: liste, ziel })
  const knopf = (art: MedienArt, label: string, liste: Vokabel[], icon: React.ReactNode, kennung: string, braucheStimme = false): React.JSX.Element => {
    const laeuft = laufend.has(medienSchluessel(art))
    return (
      <Button
        size="xs"
        leftSection={icon}
        loading={laeuft}
        disabled={!bereit || laeuft || !liste.length || (braucheStimme && ohneStimme)}
        onClick={() => start(art, liste)}
        {...{ [kennung]: true }}
      >
        {label} ({bereit ? liste.length : '…'})
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
          {/* Mit eingerichteter Bild-KI (07.10.2026): für Wörter ohne Bild gleich ein KI-Bild erzeugen lassen */}
          {bildKi && knopf('bildKi', 'Beispielbild von KI generieren lassen', ohneBild, <IconSparkles size={14} />, 'data-medien-bild-ki')}
          {knopf('aussprache', 'Aussprache erzeugen', ohneTon, <IconVolume size={14} />, 'data-medien-aussprache', true)}
          {knopf('satz', 'Satz-Aussprache erzeugen', ohneSatz, <IconMessage2 size={14} />, 'data-medien-satz', true)}
          {mehr}
        </Group>
        <Group gap="xs" wrap="wrap">
          <Text size="sm">Bildstufe:</Text>
          <SegmentedControl
            size="xs"
            value={stufe}
            onChange={(s) => setzeStufe(wahlSchluessel(ziel.docId), s as Bildstufe)}
            data={BILDSTUFEN.map((s) => ({ value: s, label: BILDSTUFE_NAME[s] }))}
            data-bildstufe-wahl
          />
          <Text size="xs" c="dimmed">
            {ziel.klasse ? `aus Klasse ${ziel.klasse}` : 'Klasse unbekannt'} – je Stufe ein eigenes Bild; fehlt es, sehen Lernende das der nächsten Stufe.
          </Text>
        </Group>
        {ohneStimme && (
          <Text size="xs" c="orange.8">
            Für die Aussprache fehlt eine Standardstimme für diese Sprache – Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Läuft im Hintergrund – Fortschritt in der Auftragsleiste unten rechts. Bei ausgelasteten Diensten wartet der Auftrag und macht danach weiter.
          {
            {
              s1: ' Kl. 1–4: freundliche Illustrationen mit echten Proportionen, nur konkrete Wörter.',
              s2: ' Kl. 5–6: halbrealistische Illustrationen, Verben als einfache Szene; abstrakte Wörter bleiben ohne Bild.',
              s3: ' Kl. 7–10: Fotos bzw. realistische Bilder, Abstrakta als typische Szene.',
              s4: ' Kl. 11–13: sachliche Fotos; im Zweifel kein Bild.'
            }[stufe]
          }
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
  const stimmen = useStandardstimmen(sprache)
  const ohneStimme = stimmen !== null && !lagenVon(stimmen).length
  const bildKi = useBildKiDa()
  const key = (a: MedienAbschnitt): string => a.ziel.docId
  const alle = wahl.length === abschnitte.length && abschnitte.length > 0
  const tonOhneStimme = ohneStimme && arten.some((a) => a === 'aussprache' || a === 'satz')
  const starten = (): void => {
    let n = 0
    for (const a of abschnitte.filter((x) => wahl.includes(key(x)))) {
      for (const art of arten) {
        if (ohneStimme && (art === 'aussprache' || art === 'satz')) continue
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
              ...(bildKi ? [['bildKi', 'Beispielbild von KI']] : []),
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
