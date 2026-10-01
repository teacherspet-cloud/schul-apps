import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import { bogenUeberschriften } from '../render/texte'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconLanguage,
  IconMapPinPlus,
  IconPlayerStop,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconSearch,
  IconVolume,
  IconX
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import { speichereAusgabe, WORD_FILTER, type AusgabeDatei } from '../../../shared/export/ausgabe'
import PrintPreview from '../../../shared/components/PrintPreview'
import { SeitenWahlSchalter, useSeitenWahl } from '../../../shared/components/SeitenAuswahl'
import { ablageZiel } from '../../../shared/export/ablageZiel'
import { FAMILIENSPRACHEN, spracheNach } from '../../../shared/familiensprachen'
import { thresholdsForSubject } from '../../../shared/gradeScale'
import { zeichenFuer, type Korrekturzeichen } from '../../../shared/korrekturzeichen'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess, safeFileName } from '../../../shared/util'
import { einstufungVon, gesamtEinstufen, offeneBestaetigungen, tabellenSumme, wertText, type SkalenKontext } from '../art'
import { AMPEL_FARBE } from '../blattLayout'
import { aufScan, boegenDocx, bogenVorlesetext, elternDocx, elternHtml } from '../ausgabe'
import { trennSchluessel } from '../abgabeAnlegen'
import { boegenDruckHtml } from '../seitenMessen'
import { elternUebersetzen, rueckmeldungenErzeugen } from '../auftrag'
import { hatAusgleich, hatMassnahme } from '../nachteilsausgleich'
import { scanBilderFuer } from '../scanBild'
import { alsMp3, vorlesen, vorlesenMoeglich, vorlesenStopp } from '../vorlesen'
import type { Abgabe, Bogen, RandKommentar, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import Blatt from './Blatt'
import { bogenStatus, ladeOffen, merkeOffen, passtZurSuche, STATUS_FARBE, STATUS_TEXT } from './bogenListe'
import EinstufungWahl from './EinstufungWahl'
import ExportSperre, { allesBestaetigen, offeneAbgaben } from './ExportSperre'
import Uebersicht from './Uebersicht'
import WeitereAbgabe from './WeitereAbgabe'

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
 *
 * Seit 29.09.2026 spät (Wunsch der Lehrkraft: „übersichtlich bleiben") ist jede Abgabe eine Zeile
 * zum Auf- und Zuklappen – standardmäßig zu, mehrere gleichzeitig offen möglich. Die Zeile zeigt
 * Name, Kürzel, Status, Einstufung und Hinweise; aufgeklappt folgen Leiste und Blatt. Darüber ein
 * Suchfeld (Name oder Kürzel, Umlaute tolerant; bei genau einem Treffer klappt er auf). Zugeklappte
 * Blätter werden nicht gezeichnet (kein Messen, kein Seitenumbruch). Der Aufklappzustand gilt für
 * die Sitzung (sessionStorage je Dokument).
 *
 * Seit 29.09.2026 nachts: PDF und Drucken mit gemessenem Seitenplan (seitenMessen.ts) – dieselben
 * Seiten wie das Blatt in der Ansicht. Oben der Knopf „Weitere Abgabe" (Fenster WeitereAbgabe.tsx):
 * Die neue Abgabe erscheint aufgeklappt in der Liste, mit Lader, bis ihr Bogen da ist.
 */
/**
 * Bögen auf den gewählten Seiten – aus den Seitenzahlen der Bögen im Druck-HTML (blattLayout.ts,
 * `data-bl-seiten`). Passt die Summe nicht zur Seitenzahl des PDFs, null (= alle Bögen).
 */
function abgabenDerSeiten(html: string, seiten: number[], anzahl: number): Set<string> | null {
  const ids = new Set<string>()
  let seite = 0
  for (const m of html.matchAll(/data-bl-blatt="([^"]*)"(?:\s+data-bl-seiten="(\d+)")?/g)) {
    const n = Number(m[2] ?? 1)
    for (let k = 1; k <= n; k++) if (seiten.includes(seite + k)) ids.add(m[1])
    seite += n
  }
  return seite === anzahl ? ids : null
}

export default function Boegen(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const settings = useAppSettings((s) => s.settings)
  const [ansicht, setAnsicht] = useState<'boegen' | 'gruppe'>('boegen')
  const [spricht, setSpricht] = useState<string | null>(null)
  const [tts, setTts] = useState(false)
  const [markerBei, setMarkerBei] = useState<string | null>(null)
  const [sperre, setSperre] = useState<{ ids: string[]; weiter: () => void } | null>(null)
  const [druck, setDruck] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<string[]>(() => ladeOffen(docId))
  const [weitere, setWeitere] = useState(false)
  // Über „Weitere Abgabe" angelegt: aufgeklappt mit Lader, bis der Bogen da ist
  const [erwartet, setErwartet] = useState<string[]>([])
  const laufend = useLaufendeSchluessel(docId)
  useEffect(() => {
    void window.api.ai
      .status()
      .then((s) => setTts(s.hasTts))
      .catch(() => undefined)
    return () => vorlesenStopp()
  }, [])
  // Anderes Dokument: dessen gemerkten Aufklappzustand holen, Suche leeren
  useEffect(() => {
    setOffen(ladeOffen(docId))
    setSuche('')
  }, [docId])
  useEffect(() => merkeOffen(docId, offen), [docId, offen])
  // Genau ein Treffer: aufklappen
  useEffect(() => {
    const d = useRueckmeldung.getState().dok
    if (!d || !suche.trim()) return
    const treffer = d.abgaben.filter((a) => passtZurSuche(a, suche))
    if (treffer.length === 1 && treffer[0].bogen) {
      const id = treffer[0].id
      setOffen((o) => (o.includes(id) ? o : [...o, id]))
    }
  }, [suche])
  if (!r) return null
  const m = r.meta
  const fertige = r.abgaben.filter((a) => a.bogen)
  const zeichen = zeichenFuer(m.subjectId, settings)
  // iPad: Ablage unter Schulmaterial/<Fach>/<Themenbereich> (shared/export/ablageZiel.ts)
  const ablage = (): ReturnType<typeof ablageZiel> => ablageZiel('rueckmeldung', docId, m.subjectId)
  const skala: SkalenKontext = { meta: m, schwellen: thresholdsForSubject(settings.gradeScale, m.subjectId) }
  const sichtbar = r.abgaben.filter((a) => passtZurSuche(a, suche))
  const umschalten = (id: string): void => setOffen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))

  /** Export erst nach bestätigter Einstufung – sonst die Sperre mit den offenen Abgaben */
  const mitFreigabe = (ids: string[], aktion: () => void): void => {
    const d = useRueckmeldung.getState().dok
    if (!d) return
    if (offeneAbgaben(d, ids).length) setSperre({ ids, weiter: aktion })
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
      void (async () => {
        // PDF: Seiten gemessen wie in der Ansicht (auch für Bögen, die gerade zugeklappt sind)
        // Word mit Seitenauswahl (01.10.2026): gewählt wird an den Seiten des PDFs, Word bekommt die Bögen dieser Seiten
        const seitenHtml = dateiart === 'docx' && useSeitenWahl.getState().gewuenscht ? await boegenDruckHtml(d, liste, { zeichen }) : null
        const datei: AusgabeDatei =
          dateiart === 'pdf'
            ? { name: `${basis}.pdf`, html: await boegenDruckHtml(d, liste, { zeichen }) }
            : {
                name: `${basis}.docx`,
                filter: WORD_FILTER,
                daten: async () => boegenDocx(d, liste, { zeichen, scanBilder: await scanBilderFuer(liste) }),
                ...(seitenHtml
                  ? {
                      seiten: {
                        html: seitenHtml,
                        hinweis: 'Gespeichert werden die Bögen, die auf den gewählten Seiten stehen.',
                        mitAuswahl: async (seiten: number[], _m: unknown, anzahl: number) => {
                          const ids = abgabenDerSeiten(seitenHtml, seiten, anzahl)
                          const auswahl = ids ? liste.filter((a) => ids.has(a.id)) : liste
                          return boegenDocx(d, auswahl, { zeichen, scanBilder: await scanBilderFuer(auswahl) })
                        }
                      }
                    }
                  : {})
              }
        await speichereAusgabe([datei], liste.length === 1 ? 'Rückmeldung gespeichert.' : `${liste.length} Rückmeldungen gespeichert.`, ablage())
      })().catch(notifyError)
    })

  const drucken = (ids: string[]): void =>
    mitFreigabe(ids, () => {
      const f = frisch(ids)
      if (!f?.liste.length) return
      // Druckvorschau mit Seitenauswahl (01.10.2026) statt gleich des Druckdialogs von Windows
      void boegenDruckHtml(f.d, f.liste, { zeichen })
        .then((html) => setDruck(html))
        .catch(notifyError)
    })

  const elternSpeichern = (dateiart: 'pdf' | 'docx'): void => {
    const liste = fertige.filter((a) => a.bogen?.eltern)
    if (!liste.length) return
    const basis = safeFileName(`Elternfassung ${m.title || r.grundlage.titel || 'Rückmeldung'}`)
    void speichereAusgabe(
      dateiart === 'pdf'
        ? [{ name: `${basis}.pdf`, html: elternHtml(r, liste) }]
        : [{ name: `${basis}.docx`, filter: WORD_FILTER, daten: () => elternDocx(r, liste) }],
      'Elternfassung gespeichert.',
      ablage()
    ).catch(notifyError)
  }

  /** Vorlesen an/aus – ein anderer Bogen beendet das laufende Vorlesen und beginnt neu */
  const vorlesenUmschalten = (a: Abgabe): void => {
    if (spricht) {
      vorlesenStopp()
      const war = spricht
      setSpricht(null)
      if (war === a.id) return
    }
    try {
      setSpricht(a.id)
      vorlesen(bogenVorlesetext(r, a), () => setSpricht(null))
    } catch (e) {
      setSpricht(null)
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
            'Audiodatei gespeichert.',
            ablage()
          )
        )
        .catch(notifyError)
    })

  const uebersetzungOffen = r.abgaben.some((a) => a.familiensprache && a.bogen?.eltern && !a.bogen.elternUebersetzt?.[a.familiensprache])
  const alleIds = fertige.map((a) => a.id)
  /** Die sichtbaren Abgaben mit Bogen – nur sie lassen sich aufklappen */
  const aufklappbar = sichtbar.filter((a) => a.bogen).map((a) => a.id)

  const aktionen: BogenAktionen = { r, docId, zeichen, skala, update, speichern, drucken, mp3, vorlesenUmschalten, spricht, tts, markerBei, setMarkerBei }

  return (
    <ScrollArea h="100%">
      <PrintPreview html={druck} title="Drucken – Rückmeldungen" onClose={() => setDruck(null)} />
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
            <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={14} />} onClick={() => setWeitere(true)} data-rm-weitere-knopf>
              Weitere Abgabe
            </Button>
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
            {/* Seitenauswahl (01.10.2026) für die nächste Ausgabe */}
            <SeitenWahlSchalter kompakt />
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
          <Stack gap="xs">
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  size="xs"
                  w={260}
                  placeholder="Name suchen"
                  aria-label="Name suchen"
                  leftSection={<IconSearch size={14} />}
                  rightSection={
                    suche ? (
                      <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSuche('')} aria-label="Suche leeren">
                        <IconX size={12} />
                      </ActionIcon>
                    ) : null
                  }
                  value={suche}
                  onChange={(e) => setSuche(e.currentTarget.value)}
                  data-rm-suche
                />
                <Text size="xs" c="dimmed" data-rm-trefferzahl>
                  {suche.trim()
                    ? `${sichtbar.length} von ${r.abgaben.length}`
                    : `${r.abgaben.length} Abgabe${r.abgaben.length === 1 ? '' : 'n'} · ${fertige.length} mit Bogen`}
                </Text>
              </Group>
              <Group gap={6}>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={!aufklappbar.some((id) => !offen.includes(id))}
                  onClick={() => setOffen((o) => [...o, ...aufklappbar.filter((id) => !o.includes(id))])}
                  data-rm-alle-auf
                >
                  Alle aufklappen
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={!aufklappbar.some((id) => offen.includes(id))}
                  onClick={() => setOffen((o) => o.filter((id) => !aufklappbar.includes(id)))}
                  data-rm-alle-zu
                >
                  Alle zuklappen
                </Button>
              </Group>
            </Group>
            {!fertige.length && <Text c="dimmed">Noch kein Bogen fertig.</Text>}
            {suche.trim() && !sichtbar.length && (
              <Text c="dimmed" size="sm">
                Kein Name passt zu „{suche.trim()}“.
              </Text>
            )}
            {sichtbar.map((a) => {
              const auf = Boolean(a.bogen) && offen.includes(a.id)
              const wartet = !a.bogen && erwartet.includes(a.id)
              const schreibt = laufend.has(`rueckmeldung-${docId}`) || laufend.has(trennSchluessel(docId))
              return (
                <Paper key={a.id} withBorder radius="md" data-rm-zeile={a.kuerzel} data-rm-id={a.id} data-rm-offen={auf || wartet ? 'ja' : 'nein'}>
                  <BogenKopf r={r} a={a} auf={auf || wartet} umschalten={() => umschalten(a.id)} />
                  {/* Zugeklappt wird das Blatt gar nicht gezeichnet – kein Messen, kein Umbruch */}
                  {auf && (
                    <div style={{ padding: '0 12px 12px' }}>
                      <BogenInhalt a={a} x={aktionen} />
                    </div>
                  )}
                  {wartet && (
                    <Group gap="sm" px="md" pb="md" data-rm-wartet>
                      {schreibt ? <Loader size="sm" /> : null}
                      <Text size="sm" c="dimmed">
                        {schreibt ? 'Die Rückmeldung wird geschrieben …' : 'Noch ohne Bogen.'}
                      </Text>
                      {!schreibt && (a.text.trim() || a.bilder.length > 0) && (
                        <Button size="compact-xs" variant="light" onClick={() => rueckmeldungenErzeugen({ ...r, abgaben: [a] }, docId)}>
                          Bogen schreiben
                        </Button>
                      )}
                    </Group>
                  )}
                </Paper>
              )
            })}
          </Stack>
        )}
      </Container>
      <ExportSperre ids={sperre?.ids ?? null} weiter={() => sperre?.weiter()} schliessen={() => setSperre(null)} />
      <WeitereAbgabe
        offen={weitere}
        schliessen={() => setWeitere(false)}
        angelegt={(id) => {
          setAnsicht('boegen')
          setSuche('')
          setErwartet((e) => [...e, id])
          setOffen((o) => (o.includes(id) ? o : [...o, id]))
          // Die neue Zeile ins Bild holen
          window.setTimeout(() => document.querySelector(`[data-rm-id="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80)
        }}
      />
    </ScrollArea>
  )
}

/** Was die aufgeklappte Abgabe vom Schritt braucht */
interface BogenAktionen {
  r: Rueckmeldung
  docId: string
  zeichen: Korrekturzeichen[]
  skala: SkalenKontext
  update: (fn: (d: Rueckmeldung) => void, gruppe?: string) => void
  speichern: (ids: string[], dateiart: 'pdf' | 'docx') => void
  drucken: (ids: string[]) => void
  mp3: (a: Abgabe) => void
  vorlesenUmschalten: (a: Abgabe) => void
  /** Abgabe, deren Bogen gerade vorgelesen wird */
  spricht: string | null
  tts: boolean
  /** Abgabe, bei der „Marker setzen" an ist */
  markerBei: string | null
  setMarkerBei: (id: string | null) => void
}

/** Die Zeile einer Abgabe: Name, Kürzel, Status, Einstufung, Hinweise – ein Klick klappt auf und zu */
function BogenKopf({ r, a, auf, umschalten }: { r: Rueckmeldung; a: Abgabe; auf: boolean; umschalten: () => void }): React.JSX.Element {
  const m = r.meta
  const art = einstufungVon(m)
  const status = bogenStatus(m, a)
  const g = a.bogen?.gesamt
  const hinweise = hinweiseVon(a.bogen)
  const name = a.name.trim() || a.kuerzel
  return (
    <UnstyledButton
      onClick={umschalten}
      disabled={!a.bogen}
      aria-expanded={auf}
      aria-label={`${name}: Rückmeldung ${auf ? 'zuklappen' : 'aufklappen'}`}
      style={{ display: 'block', width: '100%', padding: '8px 12px', cursor: a.bogen ? 'pointer' : 'default', opacity: a.bogen ? 1 : 0.65 }}
      data-rm-aufklappen
    >
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconChevronRight
            size={16}
            style={{ flex: 'none', transition: 'transform 120ms', transform: auf ? 'rotate(90deg)' : 'none', opacity: a.bogen ? 1 : 0.3 }}
          />
          <Text fw={600} truncate>
            {name}
          </Text>
          <Badge variant="light" size="sm" style={{ flex: 'none' }}>
            {a.kuerzel}
          </Badge>
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
          {a.bogen?.spracheVerfehlt && (
            <Tooltip label="Die Arbeit ist nicht in der Zielsprache geschrieben">
              <Badge size="sm" color="orange" variant="light" data-rm-sprache-verfehlt>
                Sprache verfehlt
              </Badge>
            </Tooltip>
          )}
          {hinweise.length > 0 && (
            <Tooltip label={hinweise.join(' · ')} multiline w={320}>
              <Badge size="sm" color="orange" variant="outline" leftSection={<IconAlertTriangle size={11} />} data-rm-hinweiszahl>
                {hinweise.length} Hinweis{hinweise.length === 1 ? '' : 'e'}
              </Badge>
            </Tooltip>
          )}
          {hatAusgleich(a.ausgleich) && (
            <Tooltip label="Nachteilsausgleich">
              <Badge size="sm" color="grape" variant="light">
                NA
              </Badge>
            </Tooltip>
          )}
          {gesamtEinstufen(m) && g?.wert && (
            <Tooltip label={g.bestaetigt ? 'Einstufung bestätigt' : 'Vorschlag der KI – noch zu bestätigen'}>
              <Badge size="sm" variant={g.bestaetigt ? 'light' : 'outline'} color={g.bestaetigt ? 'red' : 'gray'} data-rm-zeile-einstufung>
                {art === 'ampel' ? (
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: AMPEL_FARBE[g.wert] ?? '#999', verticalAlign: -1 }} />
                ) : (
                  wertText(art, g.wert)
                )}
              </Badge>
            </Tooltip>
          )}
          <Badge size="sm" variant="dot" color={STATUS_FARBE[status]} data-rm-status={status}>
            {STATUS_TEXT[status]}
          </Badge>
        </Group>
      </Group>
    </UnstyledButton>
  )
}

/** Die aufgeklappte Abgabe: Hinweise, Leiste (Bestätigen, PDF, Word …), das A4-Blatt, Elternfassung */
function BogenInhalt({ a, x }: { a: Abgabe; x: BogenAktionen }): React.JSX.Element | null {
  const { r, docId, zeichen, skala, update } = x
  const m = r.meta
  const art = einstufungVon(m)
  const u = bogenUeberschriften(m.anrede)
  const bogen = a.bogen
  if (!bogen) return null
  const hinweise = hinweiseVon(bogen)
  const summe = bogen.tabelle && r.tabelle ? tabellenSumme(r.tabelle, bogen.tabelle) : null
  const markerSetzen = x.markerBei === a.id

  // Änderungen gehen an DIESE Abgabe (über die Kennung – mehrere Blätter sind gleichzeitig offen)
  const setzeBogen = (fn: (b: Bogen) => void, gruppe?: string): void =>
    update((d) => {
      const b = d.abgaben.find((y) => y.id === a.id)?.bogen
      if (b) fn(b)
    }, gruppe)
  const setzeRand = (fn: (rand: RandKommentar[]) => void, gruppe?: string): void =>
    setzeBogen((b) => {
      if (!b.rand) b.rand = []
      fn(b.rand)
    }, gruppe)

  return (
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
            <Title order={5}>Rückmeldung für {a.name.trim() || a.kuerzel}</Title>
            <Badge variant="light">{a.kuerzel}</Badge>
            {gesamtEinstufen(m) && (
              <Tooltip
                label={
                  bogen.gesamt
                    ? `Erfüllungsgrad laut Vorschlag: ${bogen.gesamt.anteil} %${summe && summe.moeglich ? ` · ${summe.erreicht} von ${summe.moeglich} Punkten` : ''}${bogen.gesamt.begruendung ? ` – ${bogen.gesamt.begruendung}` : ''}`
                    : 'Noch keine Einstufung'
                }
                multiline
                w={320}
              >
                <div data-rm-einstufung>
                  <EinstufungWahl r={r} w={bogen.gesamt} setze={(w) => setzeBogen((b) => (b.gesamt = w))} />
                </div>
              </Tooltip>
            )}
          </Group>
          <Group gap={6} wrap="nowrap">
            {offeneBestaetigungen(m, bogen).length > (gesamtEinstufen(m) && !bogen.gesamt?.bestaetigt ? 1 : 0) && (
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
            {aufScan(a) && (
              <Tooltip label="Mit einem Klick ins Bild eine neue Notiz an dieser Stelle anlegen">
                <Button
                  size="xs"
                  variant={markerSetzen ? 'filled' : 'default'}
                  leftSection={<IconMapPinPlus size={14} />}
                  onClick={() => x.setMarkerBei(markerSetzen ? null : a.id)}
                  data-rm-marker-setzen
                >
                  {markerSetzen ? 'Ins Bild klicken …' : 'Marker setzen'}
                </Button>
              </Tooltip>
            )}
            <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} onClick={() => x.speichern([a.id], 'pdf')} data-rm-pdf>
              PDF
            </Button>
            <Button size="xs" variant="default" leftSection={<IconFileTypeDocx size={14} />} onClick={() => x.speichern([a.id], 'docx')} data-rm-word>
              Word
            </Button>
            <Tooltip label="Drucken">
              <ActionIcon variant="default" size="md" onClick={() => x.drucken([a.id])} aria-label="Drucken" data-rm-drucken>
                <IconPrinter size={16} />
              </ActionIcon>
            </Tooltip>
            {vorlesenMoeglich() && (
              <Tooltip label={x.spricht === a.id ? 'Vorlesen beenden' : 'Bogen vorlesen (Sprachausgabe des Rechners)'}>
                <ActionIcon variant="default" size="md" onClick={() => x.vorlesenUmschalten(a)} aria-label="Vorlesen" data-rm-vorlesen>
                  {x.spricht === a.id ? <IconPlayerStop size={16} /> : <IconVolume size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
            {x.tts && (
              <Tooltip label="Als MP3 speichern (Hörtext-Dienst)">
                <ActionIcon variant="default" size="md" onClick={() => x.mp3(a)} aria-label="Als MP3 speichern">
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
                  update((d) => {
                    const y = d.abgaben.find((z) => z.id === a.id)
                    if (y) delete y.bogen
                  })
                  const neu = useRueckmeldung.getState().dok as Rueckmeldung
                  rueckmeldungenErzeugen(neu, docId)
                }}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {(a.name.trim() || hatAusgleich(a.ausgleich)) && (
          <Text size="xs" c="dimmed" mt={4}>
            {a.name.trim() ? `Auf dem Blatt steht statt „${a.kuerzel}“ der Name – eingesetzt auf diesem Rechner, die KI kennt nur das Kürzel.` : ''}
            {hatAusgleich(a.ausgleich) && (
              <Text span size="xs" c="grape">
                {' '}
                Nachteilsausgleich berücksichtigt{hatMassnahme(a.ausgleich, 'grossdruck') ? ' · Ausdruck in Großdruck' : ''} – steht nicht auf dem Blatt.
              </Text>
            )}
          </Text>
        )}
      </Paper>
      {bogen.entfernt ? (
        <Alert color="yellow" variant="light" p="xs">
          {bogen.entfernt} Aussage{bogen.entfernt > 1 ? 'n' : ''} mit Note oder Punkten wurde{bogen.entfernt > 1 ? 'n' : ''} entfernt –{' '}
          {art === 'keine' ? 'die Rückmeldung bleibt ohne Bewertung.' : 'die Einstufung steht nur im eigenen Feld.'}
        </Alert>
      ) : null}
      <Text size="xs" c="dimmed">
        Texte direkt auf dem Blatt ändern · Nummer einer Randnotiz: Art, Zeichen, Textstelle · Textstelle im Schülertext markieren: neue Notiz · Zauberstab: neu erzeugen
        oder überarbeiten
      </Text>
      <Blatt
        r={r}
        a={a}
        docId={docId}
        zeichen={zeichen}
        skala={skala}
        setzeBogen={setzeBogen}
        setzeRand={setzeRand}
        markerSetzen={markerSetzen}
        setMarkerSetzen={(an) => x.setMarkerBei(an ? a.id : null)}
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
              value={bogen.eltern ?? ''}
              placeholder="Entsteht mit dem Bogen – hier auch selbst schreibbar"
              onChange={(e) => {
                const v = e.currentTarget.value
                setzeBogen((b) => {
                  b.eltern = v
                  // Geänderte Fassung: alte Übersetzungen passen nicht mehr
                  delete b.elternUebersetzt
                }, `rm-eltern-${a.id}`)
              }}
              aria-label="Elternfassung"
            />
            <Group gap="xs" align="flex-end">
              <Select
                size="xs"
                w={260}
                placeholder="Familiensprache (optional)"
                data={FAMILIENSPRACHEN.map((f) => ({ value: f.code, label: `${f.name} – ${f.eigen}` }))}
                value={a.familiensprache ?? null}
                onChange={(v) =>
                  update((d) => {
                    const y = d.abgaben.find((z) => z.id === a.id)
                    if (!y) return
                    if (v) y.familiensprache = v
                    else delete y.familiensprache
                  })
                }
                clearable
                searchable
                aria-label="Familiensprache"
              />
              {a.familiensprache && bogen.eltern && !bogen.elternUebersetzt?.[a.familiensprache] && (
                <Button size="xs" variant="light" leftSection={<IconLanguage size={14} />} onClick={() => elternUebersetzen(r, docId)}>
                  Übersetzen
                </Button>
              )}
            </Group>
            {a.familiensprache && bogen.elternUebersetzt?.[a.familiensprache] && (
              <Textarea
                size="xs"
                autosize
                minRows={2}
                label={spracheNach(a.familiensprache)?.eigen}
                dir={spracheNach(a.familiensprache)?.rtl ? 'rtl' : undefined}
                value={bogen.elternUebersetzt[a.familiensprache]}
                onChange={(e) => {
                  const v = e.currentTarget.value
                  const code = a.familiensprache!
                  setzeBogen((b) => (b.elternUebersetzt = { ...(b.elternUebersetzt ?? {}), [code]: v }), `rm-eltern-u-${a.id}`)
                }}
              />
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
