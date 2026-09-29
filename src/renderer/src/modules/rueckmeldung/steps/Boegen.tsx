import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  NavLink,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { bogenUeberschriften } from '../render/texte'
import {
  IconCheck,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconLanguage,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconVolume,
  IconDownload
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { FAMILIENSPRACHEN, spracheNach } from '../../../shared/familiensprachen'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { zeichenFuer } from '../../../shared/korrekturzeichen'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import {
  einstufungVon,
  gesamtAusTabelle,
  gesamtEinstufen,
  hatForm,
  kriterienEinstufen,
  offeneBestaetigungen,
  skalenWerte,
  tabellenSumme,
  wertText,
  type SkalenKontext
} from '../art'
import { aufScan, boegenDocx, boegenHtml, bogenVorlesetext, elternDocx, elternHtml } from '../ausgabe'
import { elternUebersetzen, rueckmeldungenErzeugen } from '../auftrag'
import TeileWertung from './TeileWertung'
import { hatAusgleich, hatMassnahme } from '../nachteilsausgleich'
import { scanBilderFuer } from '../scanBild'
import { alsMp3, vorlesen, vorlesenMoeglich, vorlesenStopp } from '../vorlesen'
import type { Abgabe, Bogen, Einschaetzung, Einstufungswert, RandKommentar, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import RandEditor from './RandEditor'
import ScanEditor from './ScanEditor'
import Uebersicht from './Uebersicht'

/** Auswahl einer Einstufung mit Vorschlag der KI und Bestätigung */
function EinstufungWahl({
  r,
  w,
  setze,
  klein = false
}: {
  r: Rueckmeldung
  w: Einstufungswert | null | undefined
  setze: (neu: Einstufungswert) => void
  klein?: boolean
}): React.JSX.Element {
  const art = einstufungVon(r.meta)
  const werte = skalenWerte(art)
  return (
    <Group gap={6} wrap="nowrap">
      <Select
        size="xs"
        w={klein ? 90 : 130}
        data={werte.map((v) => ({ value: v, label: klein ? v : wertText(art, v) }))}
        value={w?.wert || null}
        placeholder="–"
        onChange={(v) => v && setze({ anteil: w?.anteil ?? 0, ...(w?.begruendung ? { begruendung: w.begruendung } : {}), wert: v, bestaetigt: true })}
        allowDeselect={false}
        aria-label="Einstufung"
      />
      {w?.wert &&
        (w.bestaetigt ? (
          <Badge size="xs" color="teal" variant="light" leftSection={<IconCheck size={10} />}>
            bestätigt
          </Badge>
        ) : (
          <Button size="compact-xs" variant="light" color="orange" onClick={() => setze({ ...w, bestaetigt: true })} data-rm-bestaetigen>
            Vorschlag bestätigen
          </Button>
        ))}
    </Group>
  )
}

/**
 * Schritt 2 der Rückmeldung (Großprogramm 0.4, F3): die Bögen durchsehen, bearbeiten und als
 * PDF oder Word speichern – einzeln oder alle in einer Datei (je Bogen eine Seite).
 *
 * Seit 29.09.2026: Einstufung mit Vorschlag der KI und Bestätigung (Export erst danach),
 * Wertung der Bewertungstabelle, Korrekturrand und Scan-Marker zum Ziehen, Überarbeitungsauftrag,
 * Elternfassung mit Übersetzung, Vorlesen/MP3 und die Übersicht der Lerngruppe.
 */
export default function Boegen(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const settings = useAppSettings((s) => s.settings)
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'boegen' | 'gruppe'>('boegen')
  const [spricht, setSpricht] = useState(false)
  const [tts, setTts] = useState(false)
  useEffect(() => {
    void window.api.ai
      .status()
      .then((s) => setTts(s.hasTts))
      .catch(() => undefined)
    return () => vorlesenStopp()
  }, [])
  if (!r) return null
  const m = r.meta
  const art = einstufungVon(m)
  const fertige = r.abgaben.filter((a) => a.bogen)
  const aktiv = r.abgaben.find((a) => a.id === auswahl && a.bogen) ?? fertige[0]
  const i = aktiv ? r.abgaben.indexOf(aktiv) : -1
  const u = bogenUeberschriften(m.anrede)
  const zeichen = zeichenFuer(m.subjectId, settings)
  const skala: SkalenKontext = { meta: m, schwellen: thresholdsForSubject(settings.gradeScale, m.subjectId) }

  const speichern = (liste: Abgabe[], dateiart: 'pdf' | 'docx'): void => {
    const offen = liste.filter((a) => offeneBestaetigungen(m, a.bogen).length)
    if (offen.length) {
      notifyError(
        new Error(`Erst die Einstufung bestätigen: ${offen.map((a) => a.name.trim() || a.kuerzel).join(', ')}. Die KI schlägt nur vor – exportiert wird, was bestätigt ist.`),
        'Export noch nicht möglich'
      )
      return
    }
    const basis = safeFileName(`${m.title || r.grundlage.titel || 'Rückmeldung'}${liste.length === 1 ? ` - ${liste[0].name.trim() || liste[0].kuerzel}` : ''}`)
    void speichereAusgabe(
      dateiart === 'pdf'
        ? [{ name: `${basis}.pdf`, html: boegenHtml(r, liste, { zeichen }) }]
        : [{ name: `${basis}.docx`, filter: WORD_FILTER, daten: async () => boegenDocx(r, liste, { zeichen, scanBilder: await scanBilderFuer(liste) }) }],
      liste.length === 1 ? 'Rückmeldung gespeichert.' : `${liste.length} Rückmeldungen gespeichert.`
    ).catch(notifyError)
  }

  const elternSpeichern = (dateiart: 'pdf' | 'docx'): void => {
    const liste = fertige.filter((a) => a.bogen?.eltern)
    if (!liste.length) return
    const basis = safeFileName(`Elternfassung ${m.title || r.grundlage.titel || 'Rückmeldung'}`)
    void speichereAusgabe(
      dateiart === 'pdf'
        ? [{ name: `${basis}.pdf`, html: elternHtml(r, liste) }]
        : [{ name: `${basis}.docx`, filter: WORD_FILTER, daten: () => elternDocx(r, liste) }],
      'Elternfassung gespeichert.'
    ).catch(notifyError)
  }

  const setzeBogen = (fn: (b: Bogen) => void, gruppe?: string): void =>
    update((d) => {
      const b = d.abgaben[i]?.bogen
      if (b) fn(b)
    }, gruppe)

  const setzeRand = (fn: (rand: RandKommentar[]) => void, gruppe?: string): void =>
    setzeBogen((b) => {
      if (!b.rand) b.rand = []
      fn(b.rand)
    }, gruppe)

  const liste = (feld: 'staerken' | 'schritte', titel: string): React.JSX.Element => (
    <Stack gap={4}>
      <Text fw={600}>{titel}</Text>
      {aktiv!.bogen![feld].map((s, k) => (
        <Group key={k} gap={4} wrap="nowrap" align="flex-start">
          <Textarea
            style={{ flex: 1 }}
            size="xs"
            autosize
            minRows={1}
            value={s}
            onChange={(e) => {
              const x = e.currentTarget.value
              setzeBogen((b) => (b[feld][k] = x), `rm-${aktiv!.id}-${feld}-${k}`)
            }}
          />
          <ActionIcon size="sm" variant="subtle" color="red" aria-label="Zeile entfernen" onClick={() => setzeBogen((b) => b[feld].splice(k, 1))}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} w="fit-content" onClick={() => setzeBogen((b) => b[feld].push(''))}>
        Zeile hinzufügen
      </Button>
    </Stack>
  )

  const vorlesenUmschalten = (a: Abgabe): void => {
    if (spricht) {
      vorlesenStopp()
      setSpricht(false)
      return
    }
    try {
      setSpricht(true)
      vorlesen(bogenVorlesetext(r, a), () => setSpricht(false))
    } catch (e) {
      setSpricht(false)
      notifyError(e)
    }
  }

  const mp3 = (a: Abgabe): void => {
    void alsMp3(bogenVorlesetext(r, a), `${docId}-${a.kuerzel}`, settings)
      .then((daten) =>
        speichereAusgabe(
          [{ name: `${safeFileName(`Rückmeldung ${a.name.trim() || a.kuerzel}`)}.mp3`, filter: [{ name: 'MP3-Audio', extensions: ['mp3'] }], daten }],
          'Audiodatei gespeichert.'
        )
      )
      .catch(notifyError)
  }

  const uebersetzungOffen = r.abgaben.some((a) => a.familiensprache && a.bogen?.eltern && !a.bogen.elternUebersetzt?.[a.familiensprache])
  const summe = aktiv?.bogen?.tabelle && r.tabelle ? tabellenSumme(r.tabelle, aktiv.bogen.tabelle) : null

  return (
    <ScrollArea h="100%">
      <Container size="xl" py="lg">
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Title order={2}>Rückmeldungen</Title>
            <SegmentedControl
              size="xs"
              value={ansicht}
              onChange={(v) => setAnsicht(v as 'boegen' | 'gruppe')}
              data={[
                { value: 'boegen', label: 'Bögen' },
                { value: 'gruppe', label: 'Lerngruppe' }
              ]}
              data-rm-ansicht
            />
          </Group>
          <Group gap="xs">
            {r.abgaben.some((a) => !a.bogen && (a.text.trim() || a.bilder.length)) && (
              <Button size="xs" variant="light" onClick={() => rueckmeldungenErzeugen(r, docId)}>
                Fehlende Bögen schreiben
              </Button>
            )}
            <Button size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />} disabled={!fertige.length} onClick={() => speichern(fertige, 'pdf')}>
              Alle als PDF
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileTypeDocx size={14} />} disabled={!fertige.length} onClick={() => speichern(fertige, 'docx')}>
              Alle als Word
            </Button>
            {m.elternfassung && (
              <>
                {uebersetzungOffen && (
                  <Button size="xs" variant="light" color="yellow" leftSection={<IconLanguage size={14} />} onClick={() => elternUebersetzen(r, docId)} data-rm-uebersetzen>
                    Elternfassungen übersetzen
                  </Button>
                )}
                <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} disabled={!fertige.some((a) => a.bogen?.eltern)} onClick={() => elternSpeichern('pdf')}>
                  Elternfassung PDF
                </Button>
                <Button size="xs" variant="default" leftSection={<IconFileTypeDocx size={14} />} disabled={!fertige.some((a) => a.bogen?.eltern)} onClick={() => elternSpeichern('docx')}>
                  Elternfassung Word
                </Button>
              </>
            )}
          </Group>
        </Group>
        {ansicht === 'gruppe' ? (
          <Uebersicht r={r} />
        ) : (
          <Grid>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Card withBorder padding={4}>
                {r.abgaben.map((a) => {
                  const offen = offeneBestaetigungen(m, a.bogen).length > 0
                  return (
                    <NavLink
                      key={a.id}
                      active={a.id === aktiv?.id}
                      disabled={!a.bogen}
                      label={a.name.trim() || a.kuerzel}
                      description={a.bogen ? `${a.kuerzel} · ${offen ? 'Einstufung offen' : 'Bogen fertig'}${a.bogen.gesamt?.wert ? ` · ${a.bogen.gesamt.wert}` : ''}` : `${a.kuerzel} · noch ohne Bogen`}
                      rightSection={
                        hatAusgleich(a.ausgleich) ? (
                          <Badge size="xs" color="grape" variant="light">
                            NA
                          </Badge>
                        ) : undefined
                      }
                      onClick={() => setAuswahl(a.id)}
                    />
                  )
                })}
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 9 }}>
              {!aktiv?.bogen ? (
                <Text c="dimmed">Noch kein Bogen fertig.</Text>
              ) : (
                <Card withBorder>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Title order={4}>Rückmeldung für {aktiv.name.trim() || aktiv.kuerzel}</Title>
                        <Badge variant="light">{aktiv.kuerzel}</Badge>
                      </Group>
                      <Group gap="xs">
                        <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} onClick={() => speichern([aktiv], 'pdf')}>
                          PDF
                        </Button>
                        <Button size="xs" variant="default" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern([aktiv], 'docx')}>
                          Word
                        </Button>
                        {vorlesenMoeglich() && (
                          <Tooltip label={spricht ? 'Vorlesen beenden' : 'Bogen vorlesen (Sprachausgabe des Rechners)'}>
                            <ActionIcon variant="default" size="md" onClick={() => vorlesenUmschalten(aktiv)} aria-label="Vorlesen" data-rm-vorlesen>
                              {spricht ? <IconPlayerStop size={16} /> : <IconVolume size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {tts && (
                          <Tooltip label="Als MP3 speichern (Hörtext-Dienst)">
                            <ActionIcon variant="default" size="md" onClick={() => mp3(aktiv)} aria-label="Als MP3 speichern">
                              <IconDownload size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Button
                          size="xs"
                          variant="subtle"
                          leftSection={<IconRefresh size={14} />}
                          onClick={() => {
                            update((d) => delete d.abgaben[i].bogen)
                            const neu = useRueckmeldung.getState().dok as Rueckmeldung
                            rueckmeldungenErzeugen(neu, docId)
                          }}
                        >
                          Neu schreiben
                        </Button>
                      </Group>
                    </Group>
                    {aktiv.name.trim() && (
                      <Text size="xs" c="dimmed">
                        Im Ausdruck (PDF, Word) steht statt „{aktiv.kuerzel}" der Name „{aktiv.name.trim()}" – eingesetzt auf diesem Rechner.
                      </Text>
                    )}
                    {hatAusgleich(aktiv.ausgleich) && (
                      <Text size="xs" c="grape">
                        Nachteilsausgleich berücksichtigt{hatMassnahme(aktiv.ausgleich, 'grossdruck') ? ' · Ausdruck in Großdruck' : ''} – steht nicht auf dem Bogen.
                      </Text>
                    )}
                    {aktiv.bogen.entfernt ? (
                      <Alert color="yellow" variant="light" p="xs">
                        {aktiv.bogen.entfernt} Aussage{aktiv.bogen.entfernt > 1 ? 'n' : ''} mit Note oder Punkten wurde{aktiv.bogen.entfernt > 1 ? 'n' : ''} entfernt –{' '}
                        {art === 'keine' ? 'die Rückmeldung bleibt ohne Bewertung.' : 'die Einstufung steht nur im eigenen Feld.'}
                      </Alert>
                    ) : null}

                    {gesamtEinstufen(m) && (
                      <Card withBorder padding="sm" bg="var(--mantine-color-default-hover)" data-rm-einstufung>
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <Text fw={600}>{u.einstufung}</Text>
                            {aktiv.bogen.gesamt && (
                              <Text size="xs" c="dimmed">
                                Erfüllungsgrad laut Vorschlag: {aktiv.bogen.gesamt.anteil} %{summe && summe.moeglich ? ` · ${summe.erreicht} von ${summe.moeglich} Punkten` : ''}
                              </Text>
                            )}
                            {aktiv.bogen.gesamt?.begruendung && <Text size="xs">{aktiv.bogen.gesamt.begruendung}</Text>}
                          </Stack>
                          <EinstufungWahl r={r} w={aktiv.bogen.gesamt} setze={(w) => setzeBogen((b) => (b.gesamt = w))} />
                        </Group>
                      </Card>
                    )}

                    <TeileWertung r={r} bogen={aktiv.bogen} art={art} skala={skala} setzeBogen={setzeBogen} />
                    {hatForm(m, 'schriftlich') && liste('staerken', u.staerken)}
                    {hatForm(m, 'tipps') && liste('schritte', u.schritte)}

                    {(hatForm(m, 'schriftlich') || kriterienEinstufen(m)) && aktiv.bogen.kriterien.length > 0 && (
                      <Stack gap={4}>
                        <Text fw={600}>{u.kriterien}</Text>
                        <Table withTableBorder verticalSpacing={4} fz="xs">
                          <Table.Tbody>
                            {aktiv.bogen.kriterien.map((k, n) => (
                              <Table.Tr key={n}>
                                <Table.Td w="30%">
                                  <TextInput
                                    size="xs"
                                    variant="unstyled"
                                    value={k.kriterium}
                                    onChange={(e) => {
                                      const x = e.currentTarget.value
                                      setzeBogen((b) => (b.kriterien[n].kriterium = x), `rm-k-${n}`)
                                    }}
                                    aria-label="Kriterium"
                                  />
                                </Table.Td>
                                <Table.Td w={kriterienEinstufen(m) ? '24%' : '16%'}>
                                  {kriterienEinstufen(m) ? (
                                    <EinstufungWahl
                                      r={r}
                                      klein
                                      w={aktiv.bogen!.kriterienStufen?.[n]}
                                      setze={(w) =>
                                        setzeBogen((b) => {
                                          if (!b.kriterienStufen) b.kriterienStufen = b.kriterien.map(() => null)
                                          b.kriterienStufen[n] = w
                                        })
                                      }
                                    />
                                  ) : (
                                    <Select
                                      size="xs"
                                      variant="unstyled"
                                      data={['sicher', 'teilweise', 'noch nicht']}
                                      value={k.einschaetzung}
                                      onChange={(x) => x && setzeBogen((b) => (b.kriterien[n].einschaetzung = x as Einschaetzung))}
                                      aria-label="Einschätzung"
                                      allowDeselect={false}
                                    />
                                  )}
                                </Table.Td>
                                <Table.Td>
                                  <Textarea
                                    size="xs"
                                    variant="unstyled"
                                    autosize
                                    minRows={1}
                                    value={k.beleg ?? ''}
                                    onChange={(e) => {
                                      const x = e.currentTarget.value
                                      setzeBogen((b) => (b.kriterien[n].beleg = x), `rm-b-${n}`)
                                    }}
                                    aria-label="Beleg"
                                  />
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Stack>
                    )}

                    {hatForm(m, 'tabelle') && r.tabelle && aktiv.bogen.tabelle && (
                      <Stack gap={4} data-rm-wertung>
                        <Group justify="space-between">
                          <Text fw={600}>{u.tabelle}</Text>
                          {summe && summe.moeglich > 0 && (
                            <Text size="xs" c="dimmed">
                              {summe.erreicht} von {summe.moeglich} Punkten
                            </Text>
                          )}
                        </Group>
                        <Table withTableBorder verticalSpacing={4} fz="xs">
                          <Table.Tbody>
                            {r.tabelle.kriterien.map((k) => {
                              const w = aktiv.bogen!.tabelle!.find((x) => x.kriteriumId === k.id)
                              const setzeWertung = (fn: (x: { punkte?: number; stufe?: number; begruendung?: string }) => void, gruppe?: string): void =>
                                setzeBogen((b) => {
                                  if (!b.tabelle) b.tabelle = []
                                  let x = b.tabelle.find((y) => y.kriteriumId === k.id)
                                  if (!x) {
                                    x = { kriteriumId: k.id }
                                    b.tabelle.push(x)
                                  }
                                  fn(x)
                                  // Punkte geändert: Die Einstufung folgt als neuer Vorschlag (wieder zu bestätigen)
                                  if (gesamtEinstufen(m) && r.tabelle) b.gesamt = gesamtAusTabelle(r.tabelle, b, art, skala)
                                }, gruppe)
                              return (
                                <Table.Tr key={k.id}>
                                  <Table.Td w="34%">
                                    {k.bereich && (
                                      <Text size="xs" c="dimmed">
                                        {k.bereich}
                                      </Text>
                                    )}
                                    <Text size="xs" fw={600}>
                                      {k.kriterium}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td w="20%">
                                    {k.punkte ? (
                                      <NumberInput
                                        size="xs"
                                        min={0}
                                        max={k.punkte}
                                        step={0.5}
                                        value={w?.punkte ?? ''}
                                        suffix={` / ${k.punkte}`}
                                        onChange={(v) => setzeWertung((x) => (x.punkte = v === '' ? undefined : Math.min(k.punkte!, Math.max(0, Number(v)))), `rm-w-${k.id}`)}
                                        aria-label={`Punkte ${k.kriterium}`}
                                      />
                                    ) : (
                                      <Select
                                        size="xs"
                                        data={r.tabelle!.stufen.map((s, n) => ({ value: String(n), label: s }))}
                                        value={w?.stufe != null ? String(w.stufe) : null}
                                        onChange={(v) => v != null && setzeWertung((x) => (x.stufe = Number(v)))}
                                        aria-label={`Stufe ${k.kriterium}`}
                                      />
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    <Textarea
                                      size="xs"
                                      variant="unstyled"
                                      autosize
                                      minRows={1}
                                      value={w?.begruendung ?? ''}
                                      placeholder="Begründung"
                                      onChange={(e) => {
                                        const x = e.currentTarget.value
                                        setzeWertung((y) => (y.begruendung = x), `rm-wb-${k.id}`)
                                      }}
                                      aria-label="Begründung"
                                    />
                                  </Table.Td>
                                </Table.Tr>
                              )
                            })}
                          </Table.Tbody>
                        </Table>
                      </Stack>
                    )}

                    {hatForm(m, 'ueberarbeitung') && (
                      <Stack gap={4}>
                        <Text fw={600}>{u.ueberarbeitung}</Text>
                        <TextInput
                          size="xs"
                          placeholder="Textstelle (wörtlich)"
                          value={aktiv.bogen.ueberarbeitung?.zitat ?? ''}
                          onChange={(e) => {
                            const x = e.currentTarget.value
                            setzeBogen((b) => (b.ueberarbeitung = { auftrag: b.ueberarbeitung?.auftrag ?? '', zitat: x }), `rm-ue-z-${aktiv.id}`)
                          }}
                          aria-label="Textstelle für den Überarbeitungsauftrag"
                        />
                        <Textarea
                          size="xs"
                          autosize
                          minRows={2}
                          placeholder="Auftrag"
                          value={aktiv.bogen.ueberarbeitung?.auftrag ?? ''}
                          onChange={(e) => {
                            const x = e.currentTarget.value
                            setzeBogen((b) => (b.ueberarbeitung = { zitat: b.ueberarbeitung?.zitat ?? '', auftrag: x }), `rm-ue-a-${aktiv.id}`)
                          }}
                          aria-label="Überarbeitungsauftrag"
                        />
                      </Stack>
                    )}

                    {hatForm(m, 'schriftlich') && (
                      <Textarea
                        label="Schlusssatz"
                        size="xs"
                        autosize
                        minRows={1}
                        value={aktiv.bogen.schluss ?? ''}
                        onChange={(e) => {
                          const x = e.currentTarget.value
                          setzeBogen((b) => (b.schluss = x), `rm-schluss-${aktiv.id}`)
                        }}
                      />
                    )}

                    {aufScan(aktiv) ? (
                      <Stack gap={4}>
                        <Text fw={600}>{u.scan}</Text>
                        <ScanEditor a={aktiv} zeichen={zeichen} setzeRand={setzeRand} />
                      </Stack>
                    ) : hatForm(m, 'rand') && aktiv.text.trim() ? (
                      <Stack gap={4}>
                        <Text fw={600}>{u.rand}</Text>
                        <RandEditor a={aktiv} zeichen={zeichen} setzeRand={setzeRand} />
                      </Stack>
                    ) : null}

                    {m.elternfassung && (
                      <Stack gap={4} data-rm-elternfassung>
                        <Text fw={600}>{u.eltern}</Text>
                        <Textarea
                          size="xs"
                          autosize
                          minRows={3}
                          value={aktiv.bogen.eltern ?? ''}
                          placeholder="Entsteht mit dem Bogen – hier auch selbst schreibbar"
                          onChange={(e) => {
                            const x = e.currentTarget.value
                            setzeBogen((b) => {
                              b.eltern = x
                              // Geänderte Fassung: alte Übersetzungen passen nicht mehr
                              delete b.elternUebersetzt
                            }, `rm-eltern-${aktiv.id}`)
                          }}
                          aria-label="Elternfassung"
                        />
                        <Group gap="xs" align="flex-end">
                          <Select
                            size="xs"
                            w={260}
                            placeholder="Familiensprache (optional)"
                            data={FAMILIENSPRACHEN.map((f) => ({ value: f.code, label: `${f.name} – ${f.eigen}` }))}
                            value={aktiv.familiensprache ?? null}
                            onChange={(v) =>
                              update((d) => {
                                if (v) d.abgaben[i].familiensprache = v
                                else delete d.abgaben[i].familiensprache
                              })
                            }
                            clearable
                            searchable
                            aria-label="Familiensprache"
                          />
                          {aktiv.familiensprache && aktiv.bogen.eltern && !aktiv.bogen.elternUebersetzt?.[aktiv.familiensprache] && (
                            <Button size="xs" variant="light" leftSection={<IconLanguage size={14} />} onClick={() => elternUebersetzen(r, docId)}>
                              Übersetzen
                            </Button>
                          )}
                        </Group>
                        {aktiv.familiensprache && aktiv.bogen.elternUebersetzt?.[aktiv.familiensprache] && (
                          <Textarea
                            size="xs"
                            autosize
                            minRows={2}
                            label={spracheNach(aktiv.familiensprache)?.eigen}
                            dir={spracheNach(aktiv.familiensprache)?.rtl ? 'rtl' : undefined}
                            value={aktiv.bogen.elternUebersetzt[aktiv.familiensprache]}
                            onChange={(e) => {
                              const x = e.currentTarget.value
                              const code = aktiv.familiensprache!
                              setzeBogen((b) => (b.elternUebersetzt = { ...(b.elternUebersetzt ?? {}), [code]: x }), `rm-eltern-u-${aktiv.id}`)
                            }}
                          />
                        )}
                      </Stack>
                    )}
                    {offeneBestaetigungen(m, aktiv.bogen).length > 0 && (
                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          color="teal"
                          leftSection={<IconCheck size={14} />}
                          onClick={() => {
                            setzeBogen((b) => {
                              if (b.gesamt?.wert) b.gesamt.bestaetigt = true
                              b.kriterienStufen?.forEach((s) => s?.wert && (s.bestaetigt = true))
                            })
                            notifySuccess('Einstufung bestätigt.')
                          }}
                          data-rm-alles-bestaetigen
                        >
                          Alle Vorschläge dieses Bogens bestätigen
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </Card>
              )}
            </Grid.Col>
          </Grid>
        )}
      </Container>
    </ScrollArea>
  )
}
