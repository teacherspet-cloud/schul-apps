/**
 * Freigegebene Arbeitsblätter (03.10.2026, Wunsch der Lehrkraft: „Es fehlt für die Lehrer noch eine
 * App, in der freigegebene Arbeitsblätter des Nutzers angezeigt werden"). Liste aller Freigaben mit
 * Stand, je Freigabe die Lernenden; jedes ausgefüllte Blatt lässt sich ansehen – mit Stift,
 * Kästchen, Markierungen und Randkommentaren, wie die Lernenden es sehen – und als PDF sichern.
 */
import { AppKopf } from '../../shared/components/AppKopf'
import {
  Badge,
  Button,
  Chip,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { IconArrowLeft, IconEye, IconQrcode, IconSearch, IconTrash, IconUserMinus, IconUsersGroup } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { Zugang } from '../onlinetest/OnlinetestModule'
import { Ausfuellen, type BlattDaten } from '../onlinetest/BlattAusfuellen'
import { notifyError } from '../../shared/util'
import { BlattWaehlenKnopf } from './BlattWaehlen'
import { abgabeTeile, FortschrittsBalken } from '../../shared/components/FortschrittsBalken'
import { AuswertungKnopf, AuswertungLeiste, AuswertungModal, useAuswertung, type PersonA } from './Auswertung'
import type { Ampel } from '@shared/blattFreigabe'
import { useDokumentOeffner, useRueckweg } from '../../shared/navigation'
import { ThemenBibliothek } from '../../shared/components/ThemenBibliothek'
import { ProgrammSymbol } from '../../shared/components/ProgrammSymbol'
import type { ThemenEintrag } from '../../shared/themenBibliothek'
import { ladeThemen, themenbereichVon, useThemen } from '../../shared/themenbereiche'
import { fachIdVon } from '../../shared/fachfarben'
import { obersterBereich, type ThemenDaten } from '@shared/themen'
import type { SavedWorksheetMeta } from '@shared/types'

export interface Freigabe {
  id: string
  titel: string
  status: string
  erstellt: string
  fach: string
  zuletzt: number
  lerngruppe: string
  schueler: number
  code?: string
  link?: string
  abgaben: number
  begonnen: number
  /** Für wie viele Personen (Fortschrittsbalken, 05.10.2026) */
  gesamt?: number
  /** Thema des Blattes und von Hand gewählter Themenbereich (09.10.2026, ThemenBibliothek) */
  thema?: string
  themenbereich?: string
  /** Mit `quelle.docId` = das Arbeitsblatt, aus dem die Freigabe stammt */
  einstellungen?: { quelle?: { docId?: string } }
}

/** Eine Freigabe als Eintrag der Themen-Bibliothek */
export type FreigabeEintrag = ThemenEintrag & { f: Freigabe; bild?: string }

const ALLE = '__alle__'

/**
 * Freigaben → Einträge der Themen-Bibliothek (09.10.2026). Klasse, Überthema, Vorschaubild und
 * Themenbereich kommen vom Arbeitsblatt, aus dem die Freigabe stammt; ohne Blatt die Klasse aus
 * dem Namen der Lerngruppe („9b" → 9).
 */
export function freigabeEintraege(liste: Freigabe[], blaetter: SavedWorksheetMeta[], themen: ThemenDaten): FreigabeEintrag[] {
  const nachId = new Map(blaetter.map((b) => [b.id, b]))
  return liste.map((f) => {
    const docId = f.einstellungen?.quelle?.docId
    const b = docId ? nachId.get(docId) : undefined
    const bereich = docId ? themenbereichVon('arbeitsblatt', docId, themen) : null
    const ausGruppe = Number(/^\s*(\d{1,2})(?!\d)/.exec(f.lerngruppe)?.[1] ?? 0)
    const grade = b?.grade || (ausGruppe >= 1 && ausGruppe <= 13 ? ausGruppe : undefined)
    const fach = f.fach || b?.subjectLabel || ''
    return {
      id: f.id,
      titel: f.titel,
      fach,
      fachId: b?.subjectId || fachIdVon(fach) || '',
      ...(grade ? { grade } : {}),
      thema: f.thema || b?.topic || '',
      ueberthema: b?.ueberthema ?? '',
      updatedAt: f.erstellt,
      themenbereich: f.themenbereich ?? '',
      bereichVorgabe: bereich ? (obersterBereich(themen, bereich.id)?.name ?? bereich.name) : '',
      suchtext: f.lerngruppe || 'Gäste',
      ...(b?.stateId ? { land: b.stateId } : {}),
      ...(b?.schoolTypeId ? { schulform: b.schoolTypeId } : {}),
      ...(b?.thumb ? { bild: b.thumb } : {}),
      f
    }
  })
}

interface Detail {
  id: string
  titel: string
  status: string
  /** Aufgabennummern in Blattreihenfolge */
  aufgaben?: number[]
  einstellungen?: { schrittweise?: boolean; merkAmEnde?: boolean; aufgabenFeedback?: boolean }
  abgaben: {
    /** Ampel je Aufgabe (05.10.2026) */
    ampeln?: Record<string, Ampel>
    /** Konto-Kennung (zum Entfernen) */
    id: string
    name: string
    benutzer: string
    /** Gast ohne IServ-Konto */
    gast?: boolean
    /** Per Code/QR beigetreten – lässt sich aus dieser Freigabe entfernen (05.10.2026) */
    perCode?: boolean
    eingereicht: number
    aktualisiert: number
    fassungen: { nr: number; zeit: string; fehler?: string }[]
  }[]
}

export function useFreigaben(active = true): { liste: Freigabe[] | null; laden: () => void } {
  const [liste, setListe] = useState<Freigabe[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ blaetter: Freigabe[] }>('/server/blaetter').then(
        (d) => setListe(d.blaetter),
        () => setListe([])
      ),
    []
  )
  useEffect(() => {
    if (!active) return
    laden()
    // Aktuell halten (05.10.2026): Fortschritt ändert sich, während die Liste offen ist – jede Minute und
    // sobald das Fenster wieder vorn ist
    const zeit = setInterval(laden, 60_000)
    const vorn = (): void => {
      if (document.visibilityState === 'visible') laden()
    }
    window.addEventListener('focus', vorn)
    document.addEventListener('visibilitychange', vorn)
    return () => {
      clearInterval(zeit)
      window.removeEventListener('focus', vorn)
      document.removeEventListener('visibilitychange', vorn)
    }
  }, [active, laden])
  return { liste, laden }
}

/** Sprungziel von außen (Startseite) */
let sprung: string | null = null
export const oeffneFreigabe = (id: string): void => {
  sprung = id
  window.dispatchEvent(new Event('freigabe-oeffnen'))
}

export default function FreigegebeneBlaetterModule({ active }: { active: boolean }): React.JSX.Element {
  const { liste, laden } = useFreigaben(active)
  const [filter, setFilter] = useState<'offen' | 'beendet' | 'alle'>('offen')
  const [suche, setSuche] = useState('')
  const [lerngruppe, setLerngruppe] = useState<string | null>(null)
  // Die Arbeitsblätter hinter den Freigaben: Klasse, Überthema, Vorschaubild und ihr Themenbereich (09.10.2026)
  const [blaetter, setBlaetter] = useState<SavedWorksheetMeta[]>([])
  const themen = useThemen((s) => s.daten)
  useEffect(() => {
    if (!active) return
    void ladeThemen().catch(() => undefined)
    window.api.sheets
      .list()
      .then(setBlaetter)
      .catch(() => undefined)
  }, [active])
  const eintraege = useMemo(
    () => (liste ? freigabeEintraege(liste.filter((f) => filter === 'alle' || f.status === filter), blaetter, themen) : null),
    [liste, filter, blaetter, themen]
  )
  const lerngruppeFilter = useCallback((e: FreigabeEintrag) => lerngruppe === null || e.f.lerngruppe === lerngruppe, [lerngruppe])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [leeren, setLeeren] = useState(false)
  const [loescht, setLoescht] = useState(false)
  useEffect(() => {
    const auf = (): void => {
      if (sprung) setGewaehlt(sprung)
      sprung = null
    }
    auf()
    window.addEventListener('freigabe-oeffnen', auf)
    return () => window.removeEventListener('freigabe-oeffnen', auf)
  }, [])
  // openDocument('freigaben', id) – z. B. aus „Meine Klassen" (06.10.2026)
  useDokumentOeffner('freigaben', async (id) => setGewaehlt(id))
  if (gewaehlt) return <FreigabeDetail id={gewaehlt} zurueck={() => (setGewaehlt(null), laden())} />
  if (!liste)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  const sichtbar = liste.filter((f) => filter === 'alle' || f.status === filter)
  // Lerngruppen als Filter (09.10.2026; bis dahin die Gliederung der Liste); Gäste per QR am Ende
  const gruppen = [...new Set(sichtbar.map((f) => f.lerngruppe))].sort((x, y) => (!x ? 1 : !y ? -1 : x.localeCompare(y, 'de', { numeric: true })))
  const abgeschlossen = liste.filter((f) => f.status !== 'offen').length
  const allesLeeren = async (): Promise<void> => {
    setLoescht(true)
    try {
      await senden('/server/blaetter/abgeschlossene-loeschen', {})
      setLeeren(false)
      laden()
    } catch (e) {
      notifyError(e)
    } finally {
      setLoescht(false)
    }
  }
  return (
    <Container size="lg" py="lg" data-freigaben>
      {/* Gemeinsamer Kopf (Phase 6a): Filter links, Suche rechts */}
      <AppKopf
        suche={false}
        beschreibung={
          'Wer hat begonnen, wer eingereicht? Neue Blätter lassen sich direkt hier freigeben – oder im Editor der App „Arbeitsblatt" (Knopf „Für Lernende").'
        }
        hauptknopf={<BlattWaehlenKnopf freigegeben={laden} />}
        links={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[
              { value: 'offen', label: 'Laufend' },
              { value: 'beendet', label: 'Abgeschlossen' },
              { value: 'alle', label: 'Alle' }
            ]}
          />
        }
        rechts={
          <>
            {filter === 'beendet' && abgeschlossen > 0 && (
              <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={() => setLeeren(true)} data-abgeschlossene-leeren>
                Liste leeren
              </Button>
            )}
            <TextInput
              leftSection={<IconSearch size={14} />}
              placeholder="Titel, Thema, Lerngruppe, Fach …"
              value={suche}
              onChange={(e) => setSuche(e.currentTarget.value)}
              w={260}
            />
          </>
        }
      />
      <Modal opened={leeren} onClose={() => setLeeren(false)} title="Abgeschlossene Blätter löschen?">
        <Text size="sm" mb="md">
          {abgeschlossen === 1 ? 'Das abgeschlossene Blatt wird' : `Alle ${abgeschlossen} abgeschlossenen Blätter werden`} endgültig gelöscht – samt
          ausgefüllter Blätter, Stift-Einträge, Feedback und der Gastzugänge. Das lässt sich nicht rückgängig machen. Die Vorlagen in der App „Arbeitsblatt"
          bleiben erhalten.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setLeeren(false)}>
            Abbrechen
          </Button>
          <Button color="red" loading={loescht} onClick={() => void allesLeeren()} data-leeren-bestaetigen>
            Endgültig löschen
          </Button>
        </Group>
      </Modal>
      {/* Fach → Themenbereich (09.10.2026, Entscheidung der Lehrkraft); die Lerngruppe als Filter und an jeder Karte */}
      <ThemenBibliothek<FreigabeEintrag>
        speicherSchluessel="freigaben"
        eintraege={eintraege}
        suche={suche}
        symbol={<ProgrammSymbol form="arbeitsblatt" farbe="indigo" size={40} />}
        oeffnen={(e) => setGewaehlt(e.f.id)}
        themenbereichSetzen={async (e, name) => {
          await senden(`/server/blaetter/${e.f.id}/themenbereich`, { themenbereich: name ?? '' })
          laden()
        }}
        vorschau={(e) => (e.bild ? () => Promise.resolve({ bild: e.bild! }) : undefined)}
        datum={(e) => e.f.erstellt}
        info={(e) => ['freigegeben', e.f.code && e.f.lerngruppe ? 'auch per QR' : ''].filter(Boolean)}
        leerText={`Keine Freigaben${filter === 'offen' ? ' laufen gerade' : ''}.`}
        filter={lerngruppeFilter}
        attribute={(e) => ({ 'data-freigabe': e.f.id })}
        leiste={
          gruppen.length > 1 ? (
            <Chip.Group multiple={false} value={lerngruppe ?? ALLE} onChange={(v) => setLerngruppe(v === ALLE ? null : v)}>
              <Group gap={6} data-freigabe-lerngruppen>
                <Chip value={ALLE} size="xs" variant="light">
                  Alle Lerngruppen
                </Chip>
                {gruppen.map((g) => (
                  <Chip
                    key={g || '-'}
                    value={g}
                    size="xs"
                    variant="light"
                    wrapperProps={{ 'data-freigabe-lerngruppe': g || 'gaeste' }}
                  >
                    {g || 'Gäste per QR-Code'} ({sichtbar.filter((f) => f.lerngruppe === g).length})
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          ) : undefined
        }
        kennzeichen={(e) => (
          <>
            <Badge
              size="xs"
              variant="light"
              color="blue"
              leftSection={<IconUsersGroup size={11} />}
              style={{ textTransform: 'none' }}
              data-freigabe-gruppe={e.f.lerngruppe || 'gaeste'}
            >
              {e.f.lerngruppe || 'Gäste per QR-Code'}
            </Badge>
            {e.f.status !== 'offen' && (
              <Badge size="xs" color="gray">
                abgeschlossen
              </Badge>
            )}
          </>
        )}
        aktionen={(e) => (
          <>
            {e.f.gesamt ? (
              <div style={{ width: '100%', maxWidth: 220 }}>
                <FortschrittsBalken gesamt={e.f.gesamt} teile={abgabeTeile(e.f.gesamt, e.f.begonnen, e.f.abgaben)} />
              </div>
            ) : (
              <>
                <Badge variant="light">{e.f.begonnen} begonnen</Badge>
                <Badge variant="light" color="green">
                  {e.f.abgaben} eingereicht
                </Badge>
              </>
            )}
            <Button size="xs" onClick={() => setGewaehlt(e.f.id)} data-freigabe-oeffnen>
              Öffnen
            </Button>
          </>
        )}
      />
    </Container>
  )
}

function FreigabeDetail({ id, zurueck }: { id: string; zurueck: () => void }): React.JSX.Element {
  const rueck = useRueckweg('freigaben', zurueck, 'Alle Freigaben')
  const [d, setD] = useState<Detail | null>(null)
  const [kurz, setKurz] = useState<Freigabe | null>(null)
  const [blatt, setBlatt] = useState<BlattDaten | null>(null)
  const [qr, setQr] = useState(false)
  const [entfernen, setEntfernen] = useState<Detail['abgaben'][number] | null>(null)
  // Auswertung je Person (05.10.2026, Auswertung.tsx)
  const auswertung = useAuswertung(id)
  const [auswahl, setAuswahl] = useState<PersonA | null>(null)
  const auswertungLaden = auswertung.laden
  // Mit jedem Neuladen der Liste (Freischalten, Entfernen …) auch die Auswertung
  useEffect(() => auswertungLaden(), [d, auswertungLaden])
  const laden = useCallback(() => {
    void holen<Detail>(`/server/blaetter/${id}`).then(setD, (e: unknown) => notifyError(e))
    void holen<{ blaetter: Freigabe[] }>('/server/blaetter').then((x) => setKurz(x.blaetter.find((f) => f.id === id) ?? null))
  }, [id])
  useEffect(() => laden(), [laden])
  if (blatt)
    return (
      <Container size="xl" py="lg">
        <Ausfuellen d={blatt} lehrkraft={{ zurueck: () => setBlatt(null) }} />
      </Container>
    )
  if (!d)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  const ansehen = (benutzer: string): void =>
    void holen<BlattDaten>(`/server/blaetter/${id}/abgabe?schueler=${encodeURIComponent(benutzer)}`).then(setBlatt, (e: unknown) => notifyError(e))
  return (
    <Container size="lg" py="lg" data-freigabe-detail>
      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        px={4}
        onClick={rueck.los}
        mb="xs"
        data-zurueck={rueck.aus ? 'meineklassen' : undefined}
      >
        {rueck.name}
      </Button>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{d.titel}</Title>
          <Text size="sm" c="dimmed">
            {kurz?.lerngruppe || 'ohne Lerngruppe'} · {d.status === 'offen' ? 'läuft' : 'abgeschlossen'}
          </Text>
        </div>
        <Group gap="xs">
          {kurz?.code && kurz.link && (
            <Button variant="light" leftSection={<IconQrcode size={16} />} onClick={() => setQr(true)}>
              QR-Code
            </Button>
          )}
          <Button
            variant="default"
            onClick={() =>
              void senden(`/server/blaetter/${id}/status`, { status: d.status === 'offen' ? 'beendet' : 'offen' }).then(laden, (e: unknown) => notifyError(e))
            }
          >
            {d.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
          </Button>
        </Group>
      </Group>
      {auswertung.daten && d.abgaben.length > 0 && <AuswertungLeiste id={id} titel={d.titel} daten={auswertung.daten} setDaten={auswertung.setDaten} />}
      {!d.abgaben.length ? (
        <Text c="dimmed">Noch hat niemand begonnen.</Text>
      ) : (
        <Table striped highlightOnHover data-karten>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Stand</Table.Th>
              <Table.Th>Auswertung</Table.Th>
              {(d.aufgaben?.length ?? 0) > 0 && d.einstellungen?.aufgabenFeedback && <Table.Th>Aufgaben</Table.Th>}
              <Table.Th>Zuletzt</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {d.abgaben.map((a) => (
              <Table.Tr key={a.benutzer || a.name}>
                <Table.Td>
                  {a.name || a.benutzer}
                  {a.perCode && (
                    <Badge size="xs" variant="outline" color="gray" ml={6}>
                      {a.gast ? 'Gast per QR' : 'per Code'}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {(() => {
                    const p = auswertung.daten?.personen.find((x) => x.id === a.id)
                    return p ? <AuswertungKnopf p={p} note={auswertung.daten?.mitarbeit[p.id]?.note} onClick={() => setAuswahl(p)} /> : null
                  })()}
                </Table.Td>
                <Table.Td>
                  {a.eingereicht ? (
                    <Badge color="green" variant="light">
                      {a.eingereicht}× eingereicht
                    </Badge>
                  ) : a.aktualisiert ? (
                    <Badge variant="light">in Arbeit</Badge>
                  ) : (
                    <Badge variant="light" color="gray">
                      beigetreten
                    </Badge>
                  )}
                  {a.fassungen.at(-1)?.fehler ? (
                    <Badge color="orange" variant="light" ml={4}>
                      Feedback fehlgeschlagen
                    </Badge>
                  ) : null}
                </Table.Td>
                {(d.aufgaben?.length ?? 0) > 0 && d.einstellungen?.aufgabenFeedback && (
                  <Table.Td>
                    <AmpelReihe
                      nummern={d.aufgaben ?? []}
                      ampeln={a.ampeln ?? {}}
                      freischalten={
                        d.einstellungen?.schrittweise
                          ? (nr, weg) => void senden(`/server/blaetter/${id}/freischalten`, { id: a.id, nr, weg }).then(laden, (e: unknown) => notifyError(e))
                          : undefined
                      }
                    />
                  </Table.Td>
                )}
                <Table.Td>{a.aktualisiert ? new Date(a.aktualisiert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconEye size={14} />}
                    onClick={() => ansehen(a.benutzer)}
                    disabled={!a.benutzer || !a.aktualisiert}
                    data-blatt-ansehen
                  >
                    Blatt ansehen
                  </Button>
                  {a.perCode && (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconUserMinus size={14} />}
                      ml={4}
                      onClick={() => setEntfernen(a)}
                      data-gast-entfernen={a.name}
                    >
                      Entfernen
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal opened={Boolean(entfernen)} onClose={() => setEntfernen(null)} title="Aus dieser Freigabe entfernen?">
        {entfernen && (
          <Stack gap="sm">
            <Text size="sm">
              „{entfernen.name || entfernen.benutzer}“ verliert sofort den Zugang zu diesem Blatt; die Einträge auf dem Blatt werden gelöscht.
              {entfernen.gast ? ' Das Gastkonto wird ganz gelöscht.' : ' Das IServ-Konto selbst bleibt bestehen.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEntfernen(null)}>
                Abbrechen
              </Button>
              <Button
                color="red"
                data-gast-entfernen-bestaetigen
                onClick={() =>
                  void senden(`/server/blaetter/${id}/gast-entfernen`, { id: entfernen.id }).then(
                    () => (setEntfernen(null), laden()),
                    (e: unknown) => notifyError(e)
                  )
                }
              >
                Entfernen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      {auswahl && (
        <AuswertungModal
          p={auswahl}
          vorschlag={auswertung.daten?.mitarbeit[auswahl.id]}
          karten={Object.fromEntries((auswertung.daten?.aufgaben ?? []).filter((x) => x.hilfekarten).map((x) => [x.nr, x.hilfekarten!]))}
          schliessen={() => setAuswahl(null)}
          ansehen={() => {
            const b = d.abgaben.find((x) => x.id === auswahl.id)?.benutzer
            setAuswahl(null)
            if (b) ansehen(b)
          }}
        />
      )}
      {qr && kurz?.code && kurz.link && (
        <Modal opened onClose={() => setQr(false)} title={d.titel} size="lg">
          <Zugang code={kurz.code} link={kurz.link} />
        </Modal>
      )}
    </Container>
  )
}

const AMPEL_FARBE: Record<Ampel, string> = { rot: 'var(--mantine-color-red-6)', gelb: 'var(--mantine-color-yellow-6)', gruen: 'var(--mantine-color-green-7)' }
const AMPEL_TEXT: Record<Ampel, string> = { rot: 'noch nicht', gelb: 'teilweise treffend', gruen: 'treffend' }

/**
 * Ampel je Aufgabe einer Person (05.10.2026). Bei schrittweiser Freischaltung: Klick auf eine rote Aufgabe
 * schaltet die nächste frei (zählt wie „teilweise"); Klick auf eine so freigeschaltete nimmt es zurück.
 */
function AmpelReihe({
  nummern,
  ampeln,
  freischalten
}: {
  nummern: number[]
  ampeln: Record<string, Ampel>
  freischalten?: (nr: number, weg: boolean) => void
}): React.JSX.Element {
  return (
    <Group gap={4} wrap="nowrap" data-ampel-reihe>
      {nummern.map((nr) => {
        const stand = ampeln[String(nr)] ?? 'rot'
        const klick = freischalten && stand !== 'gruen' ? () => freischalten(nr, stand === 'gelb') : undefined
        return (
          <Tooltip
            key={nr}
            label={`Aufgabe ${nr}: ${AMPEL_TEXT[stand]}${klick ? (stand === 'rot' ? ' – Klick: als erledigt freischalten' : ' – Klick: Freischaltung zurücknehmen') : ''}`}
          >
            <UnstyledButton
              onClick={klick}
              disabled={!klick}
              data-ampel-aufgabe={nr}
              data-ampel={stand}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: AMPEL_FARBE[stand],
                color: stand === 'gelb' ? '#1a1b1e' : '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                cursor: klick ? 'pointer' : 'default'
              }}
            >
              {nr}
            </UnstyledButton>
          </Tooltip>
        )
      })}
    </Group>
  )
}
