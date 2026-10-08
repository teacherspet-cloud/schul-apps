/**
 * Grammatik im Kurs (Sprachenlernen, 08.10.2026, abgestimmt): eine sortier- und filterbare Tabelle mit allen
 * Grammatik-Übungen des Kurses – freigegebene, Extra-Aufgaben einzelner Kinder und Entwürfe (KI fertig, noch nicht
 * freigegeben). Ein Klick öffnet das große Grammatik-Fenster: Aufgaben bearbeiten bzw. Lernstand und Einstellungen.
 * Dazu der Start der Förder-/Forderaufgaben (KI im Hintergrund, Ergebnis als Entwurf zum Prüfen).
 */
import { Badge, Button, Card, Group, Loader, Modal, Stack, Table, Tabs, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { paketBereinigt, type GrammatikPaket } from '@shared/grammatiktrainer'
import { holen, senden } from '../../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../../shared/util'
import { starteAuftrag } from '../../../shared/auftraege'
import { AktiveFilter, SortKopf, useSortierTabelle, type Spalte } from '../../../shared/components/SortierTabelle'
import { EntwurfAnsehen, ladeEntwuerfe, Lernstand, speichereEntwuerfe, useEntwuerfe, type Entwurf } from '../GrammatikTraining'
import { erzeugeGrammatikPaket } from '../grammatikErzeugen'
import { AufgabenEditor } from './AufgabenEditor'

export interface GrammatikZeile {
  id: string
  titel: string
  thema: string
  vokId?: string
  art?: string
  fuer?: { id: string; name: string }[]
  aufgaben: number
  lernende: number
  sicherSchnitt: number
  bearbeitetSchnitt?: number
  status: string
  erstellt: string
}

/** Zeile der Tabelle: freigegeben oder Entwurf */
type Zeile = { art: 'frei'; g: GrammatikZeile } | { art: 'entwurf'; e: Entwurf }

const ART_TEXT = (art: string | undefined, fuer?: { name: string }[]): string =>
  art === 'foerder' || art === 'forder' ? `Extra für ${(fuer ?? []).map((f) => f.name).join(', ')}` : 'ganzer Kurs'

/** Grammatik-Fenster: Aufgaben bearbeiten | Lernstand und Einstellungen */
export function GrammatikFenster({ id, schliessen }: { id: string; schliessen: () => void }): React.JSX.Element {
  const [d, setD] = useState<{ titel: string; paket: GrammatikPaket } | null>(null)
  const [paket, setPaket] = useState<GrammatikPaket | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const laden = useCallback(
    () =>
      void holen<{ titel: string; paket: GrammatikPaket }>(`/server/grammatik/${id}`).then(
        (r) => (setD(r), setPaket(r.paket)),
        (e: unknown) => notifyError(e)
      ),
    [id]
  )
  useEffect(laden, [laden])
  const geaendert = Boolean(d && paket && JSON.stringify(d.paket) !== JSON.stringify(paket))
  const speichern = async (): Promise<void> => {
    if (!paket) return
    setLaeuft(true)
    try {
      const r = await senden<{ aufgaben: number; paket: GrammatikPaket }>(`/server/grammatik/${id}/paket`, { paket })
      const weg = paket.aufgaben.length - r.aufgaben
      notifySuccess(weg > 0 ? `Gespeichert – ${weg} unvollständige Aufgabe(n) wurden entfernt.` : 'Gespeichert – die Lernenden sehen die Änderungen sofort.')
      setD({ ...d!, paket: r.paket })
      setPaket(r.paket)
    } catch (e) {
      notifyError(e, 'Nicht gespeichert')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title={d?.titel ?? 'Grammatik'} size="xl" fullScreen={window.matchMedia?.('(max-width: 700px)').matches}>
      <Tabs defaultValue="aufgaben" data-grammatik-fenster>
        <Tabs.List mb="md">
          <Tabs.Tab value="aufgaben">Aufgaben</Tabs.Tab>
          <Tabs.Tab value="lernstand" data-reiter-lernstand>
            Lernstand und Einstellungen
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="aufgaben">
          {!paket ? (
            <Loader size="sm" />
          ) : (
            <Stack>
              <AufgabenEditor paket={paket} aendern={setPaket} />
              <Group justify="flex-end" pos="sticky" bottom={0} py="xs" bg="var(--mantine-color-body)">
                <Button variant="default" disabled={!geaendert} onClick={() => setPaket(d!.paket)}>
                  Verwerfen
                </Button>
                <Button loading={laeuft} disabled={!geaendert} onClick={() => void speichern()} data-grammatik-speichern>
                  Änderungen speichern
                </Button>
              </Group>
            </Stack>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="lernstand">
          <Lernstand id={id} zurueck={schliessen} imFenster />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}

/** Die Grammatik-Tabelle des Kurses */
export function KursGrammatik({
  vokId,
  hinzufuegen,
  geoeffnet,
  oeffnen,
  stand
}: {
  vokId: string
  /** Knopf „+ Grammatik hinzufügen" */
  hinzufuegen: () => void
  /** Von außen geöffnete Grammatik (z. B. aus „Meine Klassen") */
  geoeffnet: string | null
  oeffnen: (id: string | null) => void
  /** Zähler zum Neuladen (nach Freigaben) */
  stand: number
}): React.JSX.Element {
  const [liste, setListe] = useState<GrammatikZeile[] | null>(null)
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null)
  const entwuerfe = useEntwuerfe().filter((e) => e.empfaenger.vokId === vokId)
  const laden = useCallback(
    () =>
      void holen<{ zuweisungen: GrammatikZeile[] }>('/server/grammatik').then(
        (r) => setListe(r.zuweisungen.filter((g) => g.vokId === vokId)),
        () => setListe([])
      ),
    [vokId]
  )
  useEffect(laden, [laden, stand])
  const zeilen: Zeile[] = [...entwuerfe.map((e) => ({ art: 'entwurf' as const, e })), ...(liste ?? []).map((g) => ({ art: 'frei' as const, g }))]
  const spalten: Spalte<Zeile>[] = [
    {
      id: 'titel',
      label: 'Grammatik',
      wert: (z) => (z.art === 'frei' ? z.g.titel : z.e.titel).toLowerCase(),
      filter: 'text',
      filterWert: (z) => (z.art === 'frei' ? `${z.g.titel} ${z.g.thema}` : z.e.titel)
    },
    {
      id: 'fuer',
      label: 'Für',
      wert: (z) => (z.art === 'frei' ? ART_TEXT(z.g.art, z.g.fuer) : ART_TEXT(z.e.empfaenger.art, z.e.empfaenger.fuer)),
      filterWert: (z) => ((z.art === 'frei' ? z.g.art : z.e.empfaenger.art) ? 'Extra einzelner' : 'ganzer Kurs'),
      filter: 'auswahl'
    },
    { id: 'aufgaben', label: 'Aufgaben', wert: (z) => (z.art === 'frei' ? z.g.aufgaben : z.e.paket.aufgaben.length), absteigend: true },
    { id: 'bearbeitet', label: 'bearbeitet Ø', wert: (z) => (z.art === 'frei' ? z.g.bearbeitetSchnitt ?? 0 : -1), absteigend: true },
    { id: 'sicher', label: 'sicher Ø', wert: (z) => (z.art === 'frei' ? z.g.sicherSchnitt : -1), absteigend: true },
    {
      id: 'status',
      label: 'Status',
      wert: (z) => (z.art === 'entwurf' ? 'Entwurf' : z.g.status === 'offen' ? 'läuft' : 'abgeschlossen'),
      filter: 'auswahl'
    }
  ]
  const t = useSortierTabelle(zeilen, spalten, { spalte: 'status', ab: true })
  return (
    <Card withBorder data-kurs-grammatik>
      <Group justify="space-between" mb="xs">
        <Text fw={700}>Grammatik ({zeilen.length})</Text>
        <Button size="xs" variant="light" color="grape" leftSection={<IconPlus size={14} />} onClick={hinzufuegen} data-vokabel-grammatik>
          Grammatik hinzufügen
        </Button>
      </Group>
      {!liste ? (
        <Loader size="sm" />
      ) : zeilen.length === 0 ? (
        <Text size="sm" c="dimmed">
          Noch keine Grammatik in diesem Kurs – mit „Grammatik hinzufügen“ ein Thema erstellen lassen oder ein fertiges verbinden.
        </Text>
      ) : (
        <>
          <AktiveFilter spalten={spalten} tabelle={t} />
          <Table data-karten highlightOnHover data-grammatik-gruppe-tabelle>
            <Table.Thead>
              <Table.Tr>
                {spalten.map((sp) => (
                  <SortKopf key={sp.id} spalte={sp} tabelle={t} />
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {t.sichtbar.map((z) =>
                z.art === 'entwurf' ? (
                  <Table.Tr key={z.e.schluessel} style={{ cursor: 'pointer' }} onClick={() => setEntwurf(z.e)} data-grammatik-entwurf={z.e.titel}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {z.e.titel}
                      </Text>
                    </Table.Td>
                    <Table.Td>{ART_TEXT(z.e.empfaenger.art, z.e.empfaenger.fuer)}</Table.Td>
                    <Table.Td>{z.e.paket.aufgaben.length}</Table.Td>
                    <Table.Td>–</Table.Td>
                    <Table.Td>–</Table.Td>
                    <Table.Td>
                      <Badge color="yellow" variant="light" tt="none">
                        Entwurf – prüfen
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  <Table.Tr key={z.g.id} style={{ cursor: 'pointer' }} onClick={() => oeffnen(z.g.id)} data-grammatik-zeile={z.g.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {z.g.titel}
                      </Text>
                      {z.g.thema && z.g.thema !== z.g.titel && (
                        <Text size="xs" c="dimmed">
                          {z.g.thema}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={z.g.art ? 'teal' : 'grape'} tt="none">
                        {ART_TEXT(z.g.art, z.g.fuer)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{z.g.aufgaben}</Table.Td>
                    <Table.Td>{Math.round((z.g.bearbeitetSchnitt ?? 0) * 100)} %</Table.Td>
                    <Table.Td>{Math.round(z.g.sicherSchnitt * 100)} %</Table.Td>
                    <Table.Td>{z.g.status === 'offen' ? 'läuft' : 'abgeschlossen'}</Table.Td>
                  </Table.Tr>
                )
              )}
            </Table.Tbody>
          </Table>
        </>
      )}
      {geoeffnet && <GrammatikFenster id={geoeffnet} schliessen={() => (oeffnen(null), laden())} />}
      {entwurf && <EntwurfAnsehen e={entwurf} schliessen={() => setEntwurf(null)} fertig={() => (setEntwurf(null), laden())} />}
    </Card>
  )
}

/** Punkt aus Stärken/Schwächen (Server: grammatikProfil) */
export interface ProfilPunkt {
  titel: string
  erklaerung: string
  beispiele: string[]
  versuche: number
  quote: number
  fehler: { antwort: string; richtig: string }[]
  themen: string[]
  /** Katalog-Kennungen, zuletzt geübt (ms), mittleres Fach, Band/Unit der Freigabe (08.10.2026, Details je Lernende/r) */
  kennungen?: string[]
  zuletzt?: number
  fach?: number
  lehrwerk?: { buch: string; unit: string }
}

/**
 * Förder- oder Forderaufgaben für ein Kind erstellen lassen (KI im Hintergrund). Das Ergebnis liegt als Entwurf in der
 * Grammatik-Tabelle des Kurses – mit dem Angebot, es auch für Kinder mit derselben Schwäche/Stärke freizuschalten.
 */
export function extraStarten(k: {
  art: 'foerder' | 'forder'
  vokId: string
  fach: string
  sprache: string
  jahrgang: number
  fuer: { id: string; name: string }
  punkte: ProfilPunkt[]
  gleiche: { id: string; name: string }[]
  bekannt: string[]
  woerter: string[]
}): void {
  const thema = k.punkte.map((p) => p.titel).join(' · ')
  const titel = `${k.art === 'foerder' ? 'Förderung' : 'Forderung'}: ${thema}`
  void starteAuftrag({
    moduleId: 'sprachenlernen',
    docId: `extra-${Date.now()}`,
    titel: `${titel} (${k.fuer.name})`,
    art: k.art === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben',
    eingabe: {
      thema,
      fach: k.fach,
      sprache: k.sprache,
      jahrgang: k.jahrgang,
      ...(k.woerter.length ? { woerter: k.woerter.slice(0, 300), wortQuelle: 'Vokabeln des Kurses' } : {}),
      extra: {
        art: k.art,
        regeln: k.punkte.map((p) => ({ titel: p.titel, erklaerung: p.erklaerung, beispiele: p.beispiele })),
        // Fehlertexte gekürzt – keine Namen oder sonstigen Angaben zum Kind
        fehler: k.punkte
          .flatMap((p) => p.fehler)
          .map((f) => ({ antwort: f.antwort.slice(0, 120), richtig: f.richtig.slice(0, 120) }))
          .slice(0, 10),
        bekannt: k.bekannt
      }
    },
    sperrt: false,
    fehlerTitel: 'Extra-Aufgaben konnten nicht erstellt werden',
    arbeit: async (e, h) => erzeugeGrammatikPaket(e, h.ai, (x) => h.melde(x)),
    ablegen: async (paket) => {
      const p = paketBereinigt(paket, thema)
      speichereEntwuerfe([
        ...ladeEntwuerfe(),
        {
          schluessel: `${Date.now()}`,
          titel,
          fach: k.fach,
          sprache: k.sprache,
          thema,
          empfaenger: {
            lerngruppeId: '',
            schueler: [],
            gaeste: false,
            bis: null,
            gruppe: k.fuer.name,
            vokId: k.vokId,
            art: k.art,
            fuer: [k.fuer],
            gleiche: k.gleiche
          },
          info: { themen: [], teilformen: [], jahrgang: k.jahrgang, fuerRegeln: k.punkte.map((x) => x.titel) },
          paket: p
        }
      ])
      notifySuccess(`${titel} für ${k.fuer.name} ist fertig – in der Grammatik des Kurses prüfen und freischalten.`)
    },
    abschluss: (p) => `${p.aufgaben.length} Aufgaben fertig – prüfen und freischalten`
  })
  notifySuccess(
    `Die KI erstellt ${k.art === 'foerder' ? 'Förderaufgaben' : 'Forderaufgaben'} für ${k.fuer.name} – sie erscheinen gleich als Entwurf beim Kurs.`
  )
}
