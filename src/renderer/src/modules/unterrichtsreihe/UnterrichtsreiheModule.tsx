/**
 * Programm „Unterrichtsreihe" (Etappe 6, 02.10.2026; nur mit dem Schul-Apps-Server – src/server/reihen.ts).
 *
 * Lernpfad für Lernende: Die Lehrkraft baut eine Reihe zu einem Oberthema aus Schritten (Arbeitsblatt,
 * Test, Schreibaufgabe, Zwischenaufgabe, Lernkarten, Selbsteinschätzung, Diagnose, Präsenz,
 * Wissensspeicher, Abschlussprodukt, Sprechaufgabe), legt Lernziele fest (Kerncurriculum oder KI)
 * und weist sie zu. Wer einen Schritt schafft, schaltet den nächsten frei (Regeln: shared/reihe.ts).
 */
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { create } from 'zustand'
import { Badge, Button, Card, Group, Loader, Menu, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconChartDots, IconDots, IconPlus, IconRoute, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Reihe } from '@shared/reihe'
import { fachVon } from '@shared/faecher'
import { useAppSettings } from '../../shared/settingsStore'
import { notifyError } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { ReiheEditor } from './ReiheEditor'
import { useDokumentOeffner, useZielZeiger } from '../../shared/navigation'
import { reiheAusPlanSchluessel, usePlaene } from './planungAuftrag'
import { Uebersicht } from './Uebersicht'

interface ReiheKurz {
  id: string
  titel: string
  fach: string
  fachId: string
  oberthema: string
  schritte: number
  geaendert: string
  zuweisungen: { id: string; lerngruppe: string; schueler: number; status: string }[]
}

/** Vorgabe für eine neue Reihe (08.10.2026, „Unterrichtsreihe erstellen" in Meine Klassen): Fach und Jahrgang der Klasse */
export interface ReihenVorgabe {
  fachId?: string
  grade?: number
  titel?: string
}

function neueReihe(vorgabe?: ReihenVorgabe | null): Reihe {
  const { settings } = useAppSettings.getState()
  const fachId = vorgabe?.fachId || (settings.eigeneFaecher?.[0] ?? 'englisch')
  return {
    id: '',
    titel: vorgabe?.titel ?? '',
    fachId,
    fachLabel: fachVon(fachId)?.label ?? fachId,
    stateId: settings.defaults.stateId,
    schoolTypeId: settings.defaults.schoolTypeId,
    grade: vorgabe?.grade && vorgabe.grade >= 1 && vorgabe.grade <= 13 ? vorgabe.grade : 7,
    oberthema: '',
    lernziele: [],
    schritte: []
  }
}

/**
 * Sprungziel von außen (Laufende Reihen, Startseite): die Übersicht einer Zuweisung öffnen – oder
 * (08.10.2026, „Reihen planen" in Laufende Reihen) gleich den Editor für eine neue Reihe. Als
 * Zustand abgelegt, damit es greift, ob die App schon offen ist oder erst geladen wird.
 */
export const useReihenZiel = create<{
  zid: string | null
  neu: boolean
  /** Fach/Jahrgang für die neue Reihe (Meine Klassen) */
  vorgabe: ReihenVorgabe | null
  setze: (zid: string | null) => void
  setzeNeu: (neu: boolean, vorgabe?: ReihenVorgabe | null) => void
}>((set) => ({
  zid: null,
  neu: false,
  vorgabe: null,
  setze: (zid) => set({ zid }),
  setzeNeu: (neu, vorgabe = null) => set(neu ? { neu, vorgabe } : { neu })
}))

export default function UnterrichtsreiheModule(): React.JSX.Element {
  const [ansicht, setAnsicht] = useState<{ art: 'liste' } | { art: 'editor'; reihe: Reihe } | { art: 'uebersicht'; zid: string }>({ art: 'liste' })
  const ziel = useReihenZiel((z) => z.zid)
  useEffect(() => {
    if (!ziel) return
    setAnsicht({ art: 'uebersicht', zid: ziel })
    useReihenZiel.getState().setze(null)
  }, [ziel])
  // Ungespeicherte Änderungen im offenen Editor (meldet der Editor selbst)
  const editorGeaendert = useRef(false)
  const neuGewuenscht = useReihenZiel((z) => z.neu)
  const [neuZaehler, setNeuZaehler] = useState(0)
  useEffect(() => {
    if (!neuGewuenscht) return
    const vorgabe = useReihenZiel.getState().vorgabe
    useReihenZiel.getState().setzeNeu(false)
    // Wie „Neue Reihe" in der Liste – nur nichts Ungespeichertes stillschweigend verwerfen
    if (editorGeaendert.current && !window.confirm('Die geöffnete Reihe hat ungespeicherte Änderungen. Trotzdem eine neue Reihe beginnen?')) return
    editorGeaendert.current = false
    setNeuZaehler((n) => n + 1)
    setAnsicht({ art: 'editor', reihe: neueReihe(vorgabe) })
  }, [neuGewuenscht])
  /*
   * Aus der Auftragsleiste (08.10.2026, KI-Planung und Platzhalter im Hintergrund): Ein Auftrag gehört zu einer Reihe
   * (`docId`) – „Öffnen" lädt genau diese Reihe in den Editor, auch wenn inzwischen eine andere offen ist (nach
   * Rückfrage, falls die offene ungespeicherte Änderungen hat). Eine fertige Planung zeigt danach ihre Vorschau.
   */
  const ansichtRef = useRef(ansicht)
  ansichtRef.current = ansicht
  useDokumentOeffner('unterrichtsreihe', async (id) => {
    const jetzt = ansichtRef.current
    if (jetzt.art === 'editor' && jetzt.reihe.id === id) return
    if (jetzt.art === 'editor' && editorGeaendert.current && !window.confirm('Die geöffnete Reihe hat ungespeicherte Änderungen. Trotzdem die andere Reihe öffnen?'))
      return
    const d = await holen<{ reihe: Reihe }>(`/server/reihen/${id}`)
    editorGeaendert.current = false
    setAnsicht({ art: 'editor', reihe: d.reihe })
  })
  useZielZeiger('unterrichtsreihe', (z) => {
    const reiheId = reiheAusPlanSchluessel(z.baustein)
    if (reiheId) usePlaene.getState().setzeZeigen(reiheId)
  })
  const [liste, setListe] = useState<ReiheKurz[] | null>(null)
  const farbe = useProgrammFarbe()
  const laden = useCallback(
    () =>
      void holen<{ reihen: ReiheKurz[] }>('/server/reihen').then(
        (d) => setListe(d.reihen),
        (e: unknown) => notifyError(e)
      ),
    []
  )
  useEffect(() => {
    if (ansicht.art === 'liste') laden()
  }, [ansicht.art, laden])
  if (ansicht.art === 'editor')
    return (
      <Rahmen>
        <ReiheEditor
          // Neue Reihe aus einer offenen heraus: frisch aufbauen statt alten Zustand behalten
          key={ansicht.reihe.id || `neu-${neuZaehler}`}
          start={ansicht.reihe}
          zurueck={() => {
            editorGeaendert.current = false
            setAnsicht({ art: 'liste' })
          }}
          meldeGeaendert={(g) => {
            editorGeaendert.current = g
          }}
        />
      </Rahmen>
    )
  if (ansicht.art === 'uebersicht')
    return (
      <Rahmen>
        <Uebersicht zid={ansicht.zid} zurueck={() => setAnsicht({ art: 'liste' })} />
      </Rahmen>
    )
  const oeffnen = (id: string): void =>
    void holen<{ reihe: Reihe }>(`/server/reihen/${id}`).then(
      (d) => setAnsicht({ art: 'editor', reihe: d.reihe }),
      (e: unknown) => notifyError(e)
    )
  return (
    <Rahmen>
      <Stack data-reihen-liste>
        {/* Gemeinsamer Kopf (Phase 6a) */}
        <AppKopf
          suche={false}
          beschreibung="Lernpfade für Lernende: Schritt für Schritt freischalten, mit Lernzielen aus dem Kerncurriculum, eigenem Tempo und Haltepunkten – von Hand oder mit KI geplant."
          hauptknopf={
            <Button
              leftSection={<IconPlus size={16} />}
              radius="md"
              color={farbe}
              onClick={() => setAnsicht({ art: 'editor', reihe: neueReihe() })}
              data-reihe-neu
            >
              Neue Reihe
            </Button>
          }
        />
        <Eingang oeffnen={(zid) => setAnsicht({ art: 'uebersicht', zid })} />
        {!liste && <Loader size="sm" />}
        {liste?.length === 0 && (
          <Text c="dimmed">
            Noch keine Reihe. Tipp: Erst Arbeitsblätter, Tests und Rückmeldungs-Aufgaben in den anderen Apps anlegen – hier werden sie zu Schritten.
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
          {liste?.map((r) => (
            <Card key={r.id} withBorder padding="md" data-reihe-karte={r.titel}>
              <Group justify="space-between" wrap="nowrap" align="start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={700} truncate>
                    {r.titel}
                  </Text>
                  <Text size="sm" c="dimmed" truncate>
                    {r.fach} · {r.oberthema || 'ohne Oberthema'} · {r.schritte} Schritte
                  </Text>
                </div>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <Button variant="subtle" size="xs" px={6} aria-label="Mehr">
                      <IconDots size={16} />
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => {
                        if (window.confirm(`„${r.titel}“ löschen? Zuweisungen und Fortschritt der Lernenden gehen verloren.`))
                          void senden(`/server/reihen/${r.id}/loeschen`).then(laden, (e: unknown) => notifyError(e))
                      }}
                    >
                      Löschen
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Group gap={6} mt="sm">
                <Button size="xs" leftSection={<IconRoute size={14} />} onClick={() => oeffnen(r.id)} data-reihe-oeffnen>
                  Bearbeiten
                </Button>
                {r.zuweisungen.map((z) => (
                  <Button
                    key={z.id}
                    size="xs"
                    variant="light"
                    leftSection={<IconChartDots size={14} />}
                    onClick={() => setAnsicht({ art: 'uebersicht', zid: z.id })}
                    data-zuweisung-oeffnen
                  >
                    {z.lerngruppe}
                    {z.schueler ? ` (${z.schueler})` : ''}
                    {z.status !== 'offen' && (
                      <Badge size="xs" color="gray" ml={4}>
                        beendet
                      </Badge>
                    )}
                  </Button>
                ))}
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Rahmen>
  )
}

function Rahmen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ padding: 'var(--mantine-spacing-lg)', maxWidth: 1400, margin: '0 auto', width: '100%' }}>{children}</div>
}

interface EingangEintrag {
  art: string
  schueler?: string
  name?: string
  schritt?: string
  text: string
  frage?: number
  zid: string
  reihe: string
  gruppe: string
}

/**
 * Korrektur-Eingang über alle Reihen (03.10.2026, Idee aus LearningView): was zu bestätigen, zu
 * beantworten, abzuhaken oder freizugeben ist – eine Liste statt Suchen im Raster.
 */
export function Eingang({ oeffnen }: { oeffnen: (zid: string) => void }): React.JSX.Element | null {
  const [liste, setListe] = useState<EingangEintrag[] | null>(null)
  const [antwort, setAntwort] = useState<Record<number, string>>({})
  const laden = useCallback(
    () =>
      void holen<{ eintraege: EingangEintrag[] }>('/server/reihen/eingang').then(
        (d) => setListe(d.eintraege),
        () => setListe([])
      ),
    []
  )
  useEffect(() => {
    laden()
    const t = setInterval(laden, 30000)
    return () => clearInterval(t)
  }, [laden])
  if (!liste?.length) return null
  const aktion = (e: EingangEintrag, k: Record<string, unknown>): void =>
    void senden(`/server/reihen/z/${e.zid}/aktion`, { schueler: e.schueler, schritt: e.schritt, ...k }).then(laden, (x: unknown) => notifyError(x))
  return (
    <Card withBorder data-eingang>
      <Group gap="xs" mb="xs">
        <Text fw={700}>Korrekturen &amp; Fragen</Text>
        <Badge color="red">{liste.length}</Badge>
      </Group>
      <Stack gap={6}>
        {liste.slice(0, 30).map((e, i) => (
          <Group key={i} justify="space-between" wrap="nowrap" align="start">
            <div style={{ minWidth: 0 }}>
              <Text size="sm">
                {e.name ? <b>{e.name}: </b> : null}
                {e.text}
              </Text>
              <Text size="xs" c="dimmed">
                {e.reihe} · {e.gruppe}
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              {e.art === 'frage' && (
                <>
                  <TextInput
                    size="xs"
                    placeholder="Antwort …"
                    value={antwort[i] ?? ''}
                    onChange={(x) => setAntwort({ ...antwort, [i]: x.currentTarget.value })}
                    w={200}
                    data-eingang-antwort
                  />
                  <Button
                    size="xs"
                    disabled={!(antwort[i] ?? '').trim()}
                    onClick={() => aktion(e, { art: 'antworten', frage: e.frage, text: antwort[i] })}
                    data-eingang-antworten
                  >
                    Senden
                  </Button>
                </>
              )}
              {e.art === 'praesenz' && (
                <Button size="xs" onClick={() => aktion(e, { art: 'praesenz' })}>
                  Abhaken
                </Button>
              )}
              {e.art === 'halt' && (
                <Button size="xs" onClick={() => aktion(e, { art: 'halt' })}>
                  Weiter freigeben
                </Button>
              )}
              {e.art === 'hilferuf' && (
                <Button size="xs" variant="light" onClick={() => aktion(e, { art: 'hilfe-erledigt' })}>
                  Erledigt
                </Button>
              )}
              <Button size="xs" variant="subtle" onClick={() => oeffnen(e.zid)}>
                Zur Übersicht
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  )
}
