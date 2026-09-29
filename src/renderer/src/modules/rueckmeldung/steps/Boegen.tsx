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
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip
} from '@mantine/core'
import { bogenUeberschriften } from '../render/texte'
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconLanguage,
  IconMapPinPlus,
  IconPlayerStop,
  IconPrinter,
  IconRefresh,
  IconVolume
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { speichereAusgabe, WORD_FILTER } from '../../../shared/export/ausgabe'
import { FAMILIENSPRACHEN, spracheNach } from '../../../shared/familiensprachen'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { zeichenFuer } from '../../../shared/korrekturzeichen'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import { einstufungVon, gesamtEinstufen, offeneBestaetigungen, tabellenSumme, type SkalenKontext } from '../art'
import { aufScan, boegenDocx, boegenHtml, bogenVorlesetext, elternDocx, elternHtml } from '../ausgabe'
import { elternUebersetzen, rueckmeldungenErzeugen } from '../auftrag'
import { hatAusgleich, hatMassnahme } from '../nachteilsausgleich'
import { scanBilderFuer } from '../scanBild'
import { alsMp3, vorlesen, vorlesenMoeglich, vorlesenStopp } from '../vorlesen'
import type { Abgabe, Bogen, RandKommentar, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import Blatt from './Blatt'
import EinstufungWahl from './EinstufungWahl'
import ExportSperre, { allesBestaetigen, offeneAbgaben } from './ExportSperre'
import Uebersicht from './Uebersicht'

/** Hinweise der Prüfung am Bogen (z. B. Sprache verfehlt) – nur für die Lehrkraft, nicht im Ausdruck */
const hinweiseVon = (b: Bogen | undefined): string[] => (Array.isArray(b?.hinweise) ? b.hinweise.filter((h): h is string => typeof h === 'string' && Boolean(h.trim())) : [])

/**
 * Schritt 2 der Rückmeldung (Großprogramm 0.4, F3): die Bögen durchsehen, bearbeiten und als
 * PDF oder Word speichern – einzeln oder alle in einer Datei (je Bogen ein Blatt).
 *
 * Seit 29.09.2026 abends (Wunsch der Lehrkraft) steht statt vieler Textfelder das A4-BLATT
 * (Blatt.tsx), direkt bearbeitbar und genau wie im Ausdruck. Über dem Blatt eine schmale Leiste:
 * Einstufung mit Bestätigung, PDF, Word, Drucken, Vorlesen/MP3, Marker setzen (Scans), neu
 * schreiben. Vor jedem Export mit noch unbestätigter Einstufung erscheint die Export-Sperre.
 */
export default function Boegen(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const settings = useAppSettings((s) => s.settings)
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'boegen' | 'gruppe'>('boegen')
  const [spricht, setSpricht] = useState(false)
  const [tts, setTts] = useState(false)
  const [markerSetzen, setMarkerSetzen] = useState(false)
  const [sperre, setSperre] = useState<{ ids: string[]; weiter: () => void } | null>(null)
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

  /** Export erst nach bestätigter Einstufung – sonst die Sperre mit den offenen Abgaben */
  const mitFreigabe = (ids: string[], aktion: () => void): void => {
    const d = useRueckmeldung.getState().dok
    if (!d) return
    const offen = offeneAbgaben(d, ids)
    if (offen.length) setSperre({ ids, weiter: aktion })
    else aktion()
  }
  /** Die Abgaben zum Zeitpunkt des Exports (nach einer Bestätigung frisch aus dem Store) */
  const frisch = (ids: string[]): { d: Rueckmeldung; liste: Abgabe[] } | null => {
    const d = useRueckmeldung.getState().dok
    return d ? { d, liste: d.abgaben.filter((a) => ids.includes(a.id) && a.bogen) } : null
  }

  const speichern = (ids: string[], dateiart: 'pdf' | 'docx'): void =>
    mitFreigabe(ids, () => {
      const f = frisch(ids)
      if (!f?.liste.length) return
      const { d, liste } = f
      const basis = safeFileName(`${d.meta.title || d.grundlage.titel || 'Rückmeldung'}${liste.length === 1 ? ` - ${liste[0].name.trim() || liste[0].kuerzel}` : ''}`)
      void speichereAusgabe(
        dateiart === 'pdf'
          ? [{ name: `${basis}.pdf`, html: boegenHtml(d, liste, { zeichen }) }]
          : [{ name: `${basis}.docx`, filter: WORD_FILTER, daten: async () => boegenDocx(d, liste, { zeichen, scanBilder: await scanBilderFuer(liste) }) }],
        liste.length === 1 ? 'Rückmeldung gespeichert.' : `${liste.length} Rückmeldungen gespeichert.`
      ).catch(notifyError)
    })

  const drucken = (ids: string[]): void =>
    mitFreigabe(ids, () => {
      const f = frisch(ids)
      if (!f?.liste.length) return
      void window.api.exporter.print(boegenHtml(f.d, f.liste, { zeichen })).catch(notifyError)
    })

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

  const mp3 = (a: Abgabe): void =>
    mitFreigabe([a.id], () => {
      const f = frisch([a.id])
      if (!f?.liste[0]) return
      const x = f.liste[0]
      void alsMp3(bogenVorlesetext(f.d, x), `${docId}-${x.kuerzel}`, settings)
        .then((daten) =>
          speichereAusgabe(
            [{ name: `${safeFileName(`Rückmeldung ${x.name.trim() || x.kuerzel}`)}.mp3`, filter: [{ name: 'MP3-Audio', extensions: ['mp3'] }], daten }],
            'Audiodatei gespeichert.'
          )
        )
        .catch(notifyError)
    })

  const uebersetzungOffen = r.abgaben.some((a) => a.familiensprache && a.bogen?.eltern && !a.bogen.elternUebersetzt?.[a.familiensprache])
  const summe = aktiv?.bogen?.tabelle && r.tabelle ? tabellenSumme(r.tabelle, aktiv.bogen.tabelle) : null
  const alleIds = fertige.map((a) => a.id)
  const hinweise = hinweiseVon(aktiv?.bogen)

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
            <Button size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />} disabled={!fertige.length} onClick={() => speichern(alleIds, 'pdf')} data-rm-alle-pdf>
              Alle als PDF
            </Button>
            <Button size="xs" variant="light" leftSection={<IconFileTypeDocx size={14} />} disabled={!fertige.length} onClick={() => speichern(alleIds, 'docx')}>
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
            <Grid.Col span={{ base: 12, md: 3, xl: 2.5 }}>
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
                        <Group gap={4} wrap="nowrap">
                          {a.bogen?.spracheVerfehlt && (
                            <Tooltip label="Die Arbeit ist nicht in der Zielsprache geschrieben">
                              <Badge size="xs" color="orange" variant="light" data-rm-sprache-verfehlt>
                                Sprache verfehlt
                              </Badge>
                            </Tooltip>
                          )}
                          {hatAusgleich(a.ausgleich) && (
                            <Badge size="xs" color="grape" variant="light">
                              NA
                            </Badge>
                          )}
                        </Group>
                      }
                      onClick={() => {
                        setAuswahl(a.id)
                        setMarkerSetzen(false)
                      }}
                    />
                  )
                })}
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 9, xl: 9.5 }}>
              {!aktiv?.bogen ? (
                <Text c="dimmed">Noch kein Bogen fertig.</Text>
              ) : (
                <Stack gap="sm">
                  {hinweise.length > 0 && (
                    <Alert color="orange" variant="light" p="xs" icon={<IconAlertTriangle size={16} />} data-rm-hinweise>
                      <Stack gap={2}>
                        {hinweise.map((h, k) => (
                          <Text key={k} size="sm">
                            {h}
                          </Text>
                        ))}
                        <Text size="xs" c="dimmed">
                          Nur für die Lehrkraft – steht nicht im Ausdruck.
                        </Text>
                      </Stack>
                    </Alert>
                  )}
                  <Paper withBorder p="xs" radius="md" data-rm-leiste style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <Group justify="space-between" gap="xs" wrap="wrap">
                      <Group gap="xs" wrap="nowrap">
                        <Title order={5}>Rückmeldung für {aktiv.name.trim() || aktiv.kuerzel}</Title>
                        <Badge variant="light">{aktiv.kuerzel}</Badge>
                        {gesamtEinstufen(m) && (
                          <Tooltip
                            label={
                              aktiv.bogen.gesamt
                                ? `Erfüllungsgrad laut Vorschlag: ${aktiv.bogen.gesamt.anteil} %${summe && summe.moeglich ? ` · ${summe.erreicht} von ${summe.moeglich} Punkten` : ''}${aktiv.bogen.gesamt.begruendung ? ` – ${aktiv.bogen.gesamt.begruendung}` : ''}`
                                : 'Noch keine Einstufung'
                            }
                            multiline
                            w={320}
                          >
                            <div data-rm-einstufung>
                              <EinstufungWahl r={r} w={aktiv.bogen.gesamt} setze={(w) => setzeBogen((b) => (b.gesamt = w))} />
                            </div>
                          </Tooltip>
                        )}
                      </Group>
                      <Group gap={6} wrap="nowrap">
                        {offeneBestaetigungen(m, aktiv.bogen).length > (gesamtEinstufen(m) && !aktiv.bogen.gesamt?.bestaetigt ? 1 : 0) && (
                          <Button
                            size="xs"
                            color="teal"
                            variant="light"
                            leftSection={<IconCheck size={14} />}
                            onClick={() => {
                              setzeBogen(allesBestaetigen)
                              notifySuccess('Einstufung bestätigt.')
                            }}
                            data-rm-alles-bestaetigen
                          >
                            Alle Vorschläge bestätigen
                          </Button>
                        )}
                        {aufScan(aktiv) && (
                          <Tooltip label="Mit einem Klick ins Bild eine neue Notiz an dieser Stelle anlegen">
                            <Button
                              size="xs"
                              variant={markerSetzen ? 'filled' : 'default'}
                              leftSection={<IconMapPinPlus size={14} />}
                              onClick={() => setMarkerSetzen(!markerSetzen)}
                              data-rm-marker-setzen
                            >
                              {markerSetzen ? 'Ins Bild klicken …' : 'Marker setzen'}
                            </Button>
                          </Tooltip>
                        )}
                        <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} onClick={() => speichern([aktiv.id], 'pdf')} data-rm-pdf>
                          PDF
                        </Button>
                        <Button size="xs" variant="default" leftSection={<IconFileTypeDocx size={14} />} onClick={() => speichern([aktiv.id], 'docx')} data-rm-word>
                          Word
                        </Button>
                        <Tooltip label="Drucken">
                          <ActionIcon variant="default" size="md" onClick={() => drucken([aktiv.id])} aria-label="Drucken" data-rm-drucken>
                            <IconPrinter size={16} />
                          </ActionIcon>
                        </Tooltip>
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
                        <Tooltip label="Bogen neu schreiben lassen">
                          <ActionIcon
                            variant="subtle"
                            size="md"
                            aria-label="Neu schreiben"
                            onClick={() => {
                              update((d) => delete d.abgaben[i].bogen)
                              const neu = useRueckmeldung.getState().dok as Rueckmeldung
                              rueckmeldungenErzeugen(neu, docId)
                            }}
                          >
                            <IconRefresh size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                    {(aktiv.name.trim() || hatAusgleich(aktiv.ausgleich)) && (
                      <Text size="xs" c="dimmed" mt={4}>
                        {aktiv.name.trim() ? `Auf dem Blatt steht statt „${aktiv.kuerzel}“ der Name – eingesetzt auf diesem Rechner, die KI kennt nur das Kürzel.` : ''}
                        {hatAusgleich(aktiv.ausgleich) && (
                          <Text span size="xs" c="grape">
                            {' '}
                            Nachteilsausgleich berücksichtigt{hatMassnahme(aktiv.ausgleich, 'grossdruck') ? ' · Ausdruck in Großdruck' : ''} – steht nicht auf dem Blatt.
                          </Text>
                        )}
                      </Text>
                    )}
                  </Paper>
                  {aktiv.bogen.entfernt ? (
                    <Alert color="yellow" variant="light" p="xs">
                      {aktiv.bogen.entfernt} Aussage{aktiv.bogen.entfernt > 1 ? 'n' : ''} mit Note oder Punkten wurde{aktiv.bogen.entfernt > 1 ? 'n' : ''} entfernt –{' '}
                      {art === 'keine' ? 'die Rückmeldung bleibt ohne Bewertung.' : 'die Einstufung steht nur im eigenen Feld.'}
                    </Alert>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    Texte direkt auf dem Blatt ändern · Nummer einer Randnotiz: Art, Zeichen, Textstelle · Textstelle im Schülertext markieren: neue Notiz · Zauberstab: neu
                    erzeugen oder überarbeiten
                  </Text>
                  <Blatt
                    r={r}
                    a={aktiv}
                    docId={docId}
                    zeichen={zeichen}
                    skala={skala}
                    setzeBogen={setzeBogen}
                    setzeRand={setzeRand}
                    markerSetzen={markerSetzen}
                    setMarkerSetzen={setMarkerSetzen}
                  />

                  {m.elternfassung && (
                    <Card withBorder data-rm-elternfassung>
                      <Stack gap={4}>
                        <Text fw={600}>{u.eltern}</Text>
                        <Text size="xs" c="dimmed">
                          Eigenes Blatt für die Eltern – nicht Teil der Rückmeldung an die Lernenden.
                        </Text>
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
                    </Card>
                  )}
                </Stack>
              )}
            </Grid.Col>
          </Grid>
        )}
      </Container>
      <ExportSperre ids={sperre?.ids ?? null} weiter={() => sperre?.weiter()} schliessen={() => setSperre(null)} />
    </ScrollArea>
  )
}
