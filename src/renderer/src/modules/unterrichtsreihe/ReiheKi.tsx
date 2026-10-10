/**
 * Oberfläche der KI-Planung (05.10.2026, reihePlanungKi.ts): Stundenraster, Planungsfenster mit
 * Vorschau und Übernahme, Knopf „Mit KI erstellen" an Platzhaltern.
 */
import { MATERIAL_ACCEPT } from '../../shared/files/extractContent'
import DropZone from '../../shared/components/DropZone'
import { schulbuchAusDateien } from '../../shared/schulbuch/SchulbuchDialog'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip
} from '@mantine/core'
import { IconArrowDown, IconArrowRight, IconArrowUp, IconBook, IconEye, IconGripVertical, IconPlus, IconPrinter, IconSparkles } from '@tabler/icons-react'
import { schritteInStunde, stundeAnhaengen, stundeEntfernen, stundeVerschieben, type StundenPatch } from './stundenRaster'
import { dokumentOeffnenWennBereit, useNavigation } from '../../shared/navigation'
import { useEffect, useState } from 'react'
import { SCHRITT_ARTEN, STUNDEN_MINUTEN, type Reihe, type Schritt, type StundenArt } from '@shared/reihe'
import { notifyError, notifySuccess } from '../../shared/util'
import { direktErzeugbar, materialKandidaten, type MaterialKandidat, type ReihenPlan } from './reihePlanungKi'
import { starteReihenPlanung, usePlaene, usePlantGerade, type PlanErgebnis } from './planungAuftrag'
import { erzeugeFuerPlatzhalter, useErzeugtGerade } from './platzhalterAuftrag'
import { KiEntwurfMarke, SchrittKiStatus } from './SchrittStatus'
import { reiheAusgeben, schrittAusgeben, type DruckArt } from './reiheDruck'
import { alsVorschau } from '../../shared/export/pdfVorschauLogik'
import type { ReiheNiveau } from '@shared/reihe'
import { NiveauWahl } from './ReiheNiveau'
import { pruefeAbdeckung } from './planAbdeckung'
import { reihenmusterFuer, reihentypVon } from '@shared/reihenmuster'

const stundenName = (a: StundenArt): string => (a === 'doppel' ? 'Doppelstunde' : 'Einzelstunde')

/**
 * Stundenraster: Einzel- und Doppelstunden in ihrer Reihenfolge. `liste` (08.10.2026, im Fenster
 * „Mit KI planen"): eine Zeile je Stunde mit Ziehgriff und Pfeilen (Pfeile auch fürs iPad, wo
 * natives Ziehen nicht zuverlässig geht). Beide Formen ändern über `setze` denselben Stand der Reihe;
 * die Schritte wandern beim Verschieben mit ihrer Stunde mit.
 */
export function StundenLeiste({
  reihe,
  setze,
  liste
}: {
  reihe: Pick<Reihe, 'stunden' | 'schritte'> & Pick<Partial<Reihe>, 'verlauf'>
  setze: (p: StundenPatch) => void
  liste?: boolean
}): React.JSX.Element {
  const stunden = reihe.stunden ?? []
  const minuten = stunden.reduce((n, a) => n + STUNDEN_MINUTEN[a], 0)
  const [gezogen, setGezogen] = useState<number | null>(null)
  const [ueber, setUeber] = useState<number | null>(null)
  /** Leere Stunden gleich entfernen, belegte erst nach Rückfrage */
  const entfernen = (i: number): void => {
    const n = schritteInStunde(reihe, i)
    // Planungsreihe (08.10.2026): Der Verlauf der Stunde entfällt mit ihr
    const phasen = reihe.verlauf?.[String(i)]?.phasen.length ?? 0
    if (
      (n || phasen) &&
      !window.confirm(
        n
          ? `In der ${i + 1}. Stunde ${n === 1 ? 'liegt ein Schritt' : `liegen ${n} Schritte`}${phasen ? ' und ihr Verlauf' : ''}. Stunde trotzdem entfernen? Die Schritte bleiben erhalten, nur ohne Stundenangabe.`
          : `Die ${i + 1}. Stunde hat einen Verlauf (${phasen} Phasen). Stunde samt Verlauf entfernen?`
      )
    )
      return
    setze(stundeEntfernen(reihe, i))
  }
  const verschieben = (von: number, nach: number): void => setze(stundeVerschieben(reihe, von, nach))
  const kopf = (
    <Group justify="space-between">
      <Text size="sm" fw={500}>
        Stunden der Reihe
      </Text>
      <Text size="xs" c="dimmed">
        {stunden.length
          ? `${stunden.length} Termine · ${minuten} min (${Math.round(minuten / 45)} Unterrichtsstunden)`
          : 'Noch keine – Grundlage für die KI-Planung'}
      </Text>
    </Group>
  )
  const neuKnoepfe = (
    <>
      <Button size="compact-sm" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setze(stundeAnhaengen(reihe, 'einzel'))} data-stunde-neu="einzel">
        Einzelstunde
      </Button>
      <Button size="compact-sm" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setze(stundeAnhaengen(reihe, 'doppel'))} data-stunde-neu="doppel">
        Doppelstunde
      </Button>
    </>
  )
  if (!liste)
    return (
      <Stack gap={6} data-stunden>
        {kopf}
        <Group gap={6}>
          {stunden.map((a, i) => (
            <Badge
              key={i}
              variant="light"
              color={a === 'doppel' ? 'indigo' : 'cyan'}
              size="lg"
              rightSection={<CloseButton size="xs" aria-label="Stunde entfernen" onClick={() => entfernen(i)} />}
              data-stunde={a}
            >
              {i + 1}. {stundenName(a)}
            </Badge>
          ))}
          {neuKnoepfe}
        </Group>
      </Stack>
    )
  return (
    <Stack gap={6} data-stunden data-stunden-liste>
      {kopf}
      {stunden.map((a, i) => {
        const n = schritteInStunde(reihe, i)
        return (
          <Paper
            key={i}
            withBorder
            px="xs"
            py={4}
            radius="md"
            data-stunde={a}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(i))
              setGezogen(i)
            }}
            onDragEnd={() => {
              setGezogen(null)
              setUeber(null)
            }}
            onDragOver={(e) => {
              if (gezogen === null || gezogen === i) return
              e.preventDefault()
              setUeber(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (gezogen !== null) verschieben(gezogen, i)
              setGezogen(null)
              setUeber(null)
            }}
            style={{
              opacity: gezogen === i ? 0.4 : 1,
              borderTop: ueber === i ? '3px solid var(--mantine-color-blue-5)' : undefined
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <IconGripVertical size={16} color="var(--mantine-color-dimmed)" style={{ cursor: 'grab' }} aria-label="ziehen" />
                <Badge variant="light" color={a === 'doppel' ? 'indigo' : 'cyan'}>
                  {i + 1}. {stundenName(a)}
                </Badge>
                <Text size="xs" c="dimmed">
                  {STUNDEN_MINUTEN[a]} min{n ? ` · ${n} ${n === 1 ? 'Schritt' : 'Schritte'}` : ' · leer'}
                </Text>
              </Group>
              <Group gap={2} wrap="nowrap">
                <ActionIcon variant="subtle" size="lg" disabled={i === 0} onClick={() => verschieben(i, i - 1)} aria-label="Stunde nach oben" data-stunde-hoch>
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  disabled={i === stunden.length - 1}
                  onClick={() => verschieben(i, i + 1)}
                  aria-label="Stunde nach unten"
                  data-stunde-runter
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
                <CloseButton aria-label="Stunde entfernen" onClick={() => entfernen(i)} data-stunde-entfernen />
              </Group>
            </Group>
          </Paper>
        )
      })}
      <Group gap={6}>{neuKnoepfe}</Group>
    </Stack>
  )
}

/**
 * Planungsfenster: Materialien sichten, planen lassen, Vorschau, übernehmen.
 *
 * Hintergrund-Auftrag (08.10.2026, planungAuftrag.ts): „Planen" speichert die Reihe, startet die Planung in der
 * Auftragsleiste und schließt das Fenster. Der fertige Plan kommt über `ergebnis` zurück (Auftrag öffnen bzw. Hinweis
 * im Editor) – dann zeigt das Fenster gleich die Vorschau mit „Übernehmen".
 */
export function PlanenFenster({
  reihe,
  kc,
  schliessen,
  uebernehmen,
  setzeStunden,
  setzeNiveau,
  setzeReihentyp,
  speichernVorher,
  ergebnis
}: {
  reihe: Reihe
  kc: { auszug: string[]; quelle: string }
  schliessen: () => void
  uebernehmen: (plan: ReihenPlan, ersetzen: boolean) => void
  /** Stundenraster der Reihe ändern (derselbe Stand wie im Editor) */
  setzeStunden: (p: StundenPatch) => void
  /** Niveau der Reihe ändern (08.10.2026) – Vorgabe für die Planung und alle Schritte */
  setzeNiveau?: (n: ReiheNiveau) => void
  /** Reihentyp aus dem Fachmuster (08.10.2026) – undefined = die KI wählt */
  setzeReihentyp?: (t: string | undefined) => void
  /** Die Reihe muss für den Hintergrund-Auftrag gespeichert sein (liefert den gespeicherten Stand) */
  speichernVorher: () => Promise<Reihe | null>
  /** Fertiger Plan aus dem Hintergrund – Vorschau statt Formular */
  ergebnis?: PlanErgebnis
}): React.JSX.Element {
  const [material, setMaterial] = useState<MaterialKandidat[] | null>(null)
  const [wunsch, setWunsch] = useState(ergebnis?.eingaben.wunsch ?? '')
  const [startet, setStartet] = useState(false)
  const [plan, setPlan] = useState<ReihenPlan | null>(ergebnis?.plan ?? null)
  const plantSchon = usePlantGerade(reihe.id || undefined)
  // Schulbuchseiten als Grundlage (Phase 6b)
  const [buch, setBuch] = useState<{ text: string; titel: string; abschnitte: number }[]>(ergebnis?.eingaben.buch ?? [])
  const [liest, setLiest] = useState<string | null>(null)
  const [modus, setModus] = useState<'ersetzen' | 'anhaengen'>(reihe.schritte.length ? 'anhaengen' : 'ersetzen')
  // Nur Fach und Jahrgang zählen – Änderungen am Stundenraster hier im Fenster laden nicht neu
  const { fachId, grade } = reihe
  useEffect(() => {
    void materialKandidaten({ fachId, grade }).then(setMaterial, () => setMaterial([]))
  }, [fachId, grade])
  // Fachtypisches Reihenmuster (08.10.2026): Reihentypen des Fachs zur Wahl
  const muster = reihenmusterFuer(reihe.fachId)
  const ohneStunden = !(reihe.stunden?.length ?? 0)
  const ohneTitel = !reihe.titel.trim()
  /** Speichern, Auftrag starten, Fenster zu – die Lehrkraft arbeitet weiter */
  const planenImHintergrund = async (): Promise<void> => {
    setStartet(true)
    try {
      const gespeichert = await speichernVorher()
      if (!gespeichert?.id) return
      starteReihenPlanung({ reihe: gespeichert, kc, material: material ?? [], eingaben: { wunsch, buch } })
      notifySuccess('Die Reihe wird im Hintergrund geplant – Fortschritt in der Auftragsleiste. Du kannst weiterarbeiten.')
      schliessen()
    } catch (e) {
      notifyError(e, 'Keine Planung')
    } finally {
      setStartet(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Reihe mit KI planen" size="xl" data-planen-fenster>
      <Stack>
        {!plan && (
          <>
            <Text size="sm">
              Die KI plant Teile und Schritte nach Kerncurriculum, Lernzielen und Stundenraster. Passende eigene Arbeitsblätter setzt sie dort ein, wo sie
              hingehören; alles andere wird ein Platzhalter, den du einzeln erstellen lässt.
            </Text>
            {ohneStunden && (
              <Alert color="orange" variant="light">
                Bitte zuerst Einzel- und Doppelstunden anlegen (hier gleich unten) – die KI verteilt die Schritte auf genau diese Stunden.
              </Alert>
            )}
            {ohneTitel && (
              <Alert color="orange" variant="light">
                Bitte zuerst einen Titel der Reihe eintragen – die Reihe wird vor der Planung gespeichert.
              </Alert>
            )}
            {plantSchon && (
              <Alert color="blue" variant="light" data-plant-schon>
                Für diese Reihe läuft schon eine Planung – Fortschritt in der Auftragsleiste unten rechts.
              </Alert>
            )}
            {/* Stundenraster direkt im Fenster (08.10.2026): ändert dieselbe Reihe wie der Editor */}
            <Card withBorder p="sm" data-planen-stunden>
              <StundenLeiste reihe={reihe} setze={setzeStunden} liste />
            </Card>
            {/* Niveau wie beim Arbeitsblatt (08.10.2026): Anspruch, Sprache, Niveaustufen – gilt für alle Schritte */}
            {setzeNiveau && (
              <Card withBorder p="sm" data-planen-niveau>
                <NiveauWahl niveau={reihe.niveau} setze={setzeNiveau} hinweis />
              </Card>
            )}
            {/* Reihentyp (08.10.2026): die KI wählt, die Lehrkraft kann ihn festlegen */}
            {muster && setzeReihentyp && (
              <Select
                label="Reihentyp"
                description={`Fachtypische Muster für ${muster.name} – die Phasen sind Leitlinien, keine starre Reihenfolge.`}
                data={[
                  { value: '', label: 'automatisch (KI wählt)' },
                  ...muster.reihentypen.map((t) => ({ value: t.id, label: t.label }))
                ]}
                value={reihentypVon(muster, reihe.reihentyp)?.id ?? ''}
                onChange={(v) => setzeReihentyp(v || undefined)}
                allowDeselect={false}
                data-planen-reihentyp
              />
            )}
            <Text size="xs" c="dimmed">
              {material === null ? (
                <>
                  <Loader size="xs" /> Eigene Arbeitsblätter werden gesichtet …
                </>
              ) : material.length ? (
                `Geprüft werden ${material.length} eigene Arbeitsblätter (${reihe.fachLabel}, Jahrgang ${reihe.grade - 1}–${reihe.grade + 1}).`
              ) : (
                'Keine eigenen Arbeitsblätter dieses Fachs und Jahrgangs – alles wird geplant.'
              )}
            </Text>
            <DropZone
              onFiles={async (f) => {
                try {
                  const r = await schulbuchAusDateien(f, setLiest)
                  if (r)
                    setBuch((b) => [
                      ...b,
                      {
                        text: r.text,
                        titel: [r.schulbuch.titel || 'Schulbuch', r.schulbuch.seiten && `S. ${r.schulbuch.seiten}`].filter(Boolean).join(', '),
                        abschnitte: r.schulbuch.abschnitte.filter((a) => a.wahl !== 'weg').length
                      }
                    ])
                } catch (e) {
                  notifyError(e, 'Schulbuchseiten nicht übernommen')
                } finally {
                  setLiest(null)
                }
              }}
              accept={MATERIAL_ACCEPT}
              title={liest ?? 'Schulbuchseiten als Grundlage hierher ziehen (optional)'}
              hint="Fotos oder PDF – die KI erkennt VT1, M1 … und plant Schritte, die darauf verweisen"
              loading={Boolean(liest)}
              minHeight={60}
            />
            {buch.map((b, i) => (
              <Group key={i} gap="xs">
                <Badge variant="light" leftSection={<IconBook size={12} />}>
                  {b.titel}
                </Badge>
                <Text size="xs" c="dimmed">
                  {b.abschnitte} Abschnitte
                </Text>
                <CloseButton size="xs" aria-label="entfernen" onClick={() => setBuch((x) => x.filter((_, k) => k !== i))} />
              </Group>
            ))}
            <Textarea
              label="Besondere Wünsche (optional)"
              placeholder="z. B. Stationenlernen im zweiten Teil, Schwerpunkt Quellenarbeit, Abschluss mit Plakat …"
              autosize
              minRows={2}
              value={wunsch}
              onChange={(e) => setWunsch(e.currentTarget.value)}
            />
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed">
                Die Planung läuft im Hintergrund: Das Fenster schließt sich, der fertige Plan erscheint in der Auftragsleiste.
              </Text>
              <Button
                leftSection={<IconSparkles size={16} />}
                loading={startet}
                disabled={ohneStunden || ohneTitel || plantSchon || material === null}
                onClick={() => void planenImHintergrund()}
                data-planen-los
              >
                Planen
              </Button>
            </Group>
          </>
        )}
        {plan && (
          <>
            {plan.hinweis && (
              <Alert variant="light" color="grape">
                {plan.hinweis}
              </Alert>
            )}
            {/* Reihenmuster (08.10.2026): gewählter Reihentyp und Leitfrage */}
            {(plan.leitfrage || plan.reihentyp) && (
              <Stack gap={2} data-plan-muster>
                {plan.reihentyp && (
                  <Text size="sm" data-plan-reihentyp>
                    <b>Reihentyp:</b> {reihentypVon(muster, plan.reihentyp)?.label ?? plan.reihentyp}
                  </Text>
                )}
                {plan.leitfrage && (
                  <Text size="sm" data-plan-leitfrage>
                    <b>Leitfrage:</b> {plan.leitfrage}
                  </Text>
                )}
              </Stack>
            )}
            <Text size="sm" c="dimmed">
              {plan.schritte.length} Schritte in {plan.teile.length} Teilen · {plan.materialEingesetzt} eigene Materialien eingesetzt ·{' '}
              {plan.schritte.filter((x) => x.platzhalter).length} Platzhalter
            </Text>
            {/* Stunde für Stunde (08.10.2026): so sieht man gleich, ob jede Stunde etwas bekommt und die Zeit passt */}
            <PlanNachStunden plan={plan} stunden={plan.stunden ?? reihe.stunden ?? []} />
            <Group justify="space-between">
              {reihe.schritte.length > 0 ? (
                <SegmentedControl
                  value={modus}
                  onChange={(v) => setModus(v as typeof modus)}
                  data={[
                    { value: 'anhaengen', label: 'An vorhandene Schritte anhängen' },
                    { value: 'ersetzen', label: 'Vorhandene Schritte ersetzen' }
                  ]}
                />
              ) : (
                <span />
              )}
              <Group gap="xs">
                <Button variant="default" onClick={() => setPlan(null)}>
                  Neu planen
                </Button>
                <Button
                  onClick={() => {
                    uebernehmen(plan, modus === 'ersetzen')
                    // Übernommen: der bereitliegende Plan dieser Reihe ist erledigt
                    if (reihe.id) usePlaene.getState().verwerfe(reihe.id)
                    schliessen()
                  }}
                  data-plan-uebernehmen
                >
                  Übernehmen
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}

/** Vorschau des Plans je Stunde: Länge, verplante Minuten der Pflichtschritte, Teil als kleine Marke */
function PlanNachStunden({ plan, stunden }: { plan: ReihenPlan; stunden: StundenArt[] }): React.JSX.Element {
  const a = pruefeAbdeckung(plan.schritte, stunden)
  const ohne = plan.schritte.filter((x) => x.stunde === undefined || x.stunde < 0 || x.stunde >= stunden.length)
  return (
    <Stack gap="xs" data-plan-stunden>
      {plan.verteilung === 'fest' && (
        <Alert variant="light" color="orange" p="xs">
          <Text size="xs">Die KI hat nicht alle Stunden belegt – die App hat die Schritte der Reihe nach auf die Stunden verteilt. Bitte prüfen.</Text>
        </Alert>
      )}
      {stunden.map((art, i) => {
        const schritte = plan.schritte.filter((x) => x.stunde === i)
        const laenge = STUNDEN_MINUTEN[art]
        const zuViel = a.ueberlang.includes(i)
        return (
          <Card key={i} withBorder p="sm" data-plan-stunde={i}>
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Text fw={700}>
                Stunde {i + 1} · {stundenName(art)} · {laenge} min
              </Text>
              <Text size="xs" c={zuViel ? 'red' : 'dimmed'}>
                {a.summen[i]} von {laenge} min verplant
              </Text>
            </Group>
            <Stack gap={4}>
              {schritte.length ? (
                schritte.map((x) => <PlanZeile key={x.id} s={x} teil />)
              ) : (
                <Text size="xs" c="orange" data-plan-stunde-leer>
                  Noch nichts in dieser Stunde.
                </Text>
              )}
            </Stack>
          </Card>
        )
      })}
      {ohne.length > 0 && (
        <Card withBorder p="sm">
          <Text fw={700} mb={4}>
            Ohne Stunde
          </Text>
          <Stack gap={4}>
            {ohne.map((x) => (
              <PlanZeile key={x.id} s={x} teil />
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}

function PlanZeile({ s, teil }: { s: Schritt; teil?: boolean }): React.JSX.Element {
  const art = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label
  return (
    <div>
      <Group gap={6}>
        {teil ? (
          s.abschnitt ? (
            <Badge size="xs" variant="outline" color="gray" style={{ textTransform: 'none' }}>
              {s.abschnitt}
            </Badge>
          ) : null
        ) : (
          <Badge size="xs" variant="outline">
            Std. {(s.stunde ?? 0) + 1}
          </Badge>
        )}
        <Text size="sm" fw={600}>
          {s.titel}
        </Text>
        <Badge size="xs" variant="light">
          {art}
        </Badge>
        {s.minuten ? (
          <Text size="xs" c="dimmed">
            {s.minuten} min
          </Text>
        ) : null}
        {s.platzhalter ? (
          <Badge size="xs" color="orange" variant="light">
            Platzhalter
          </Badge>
        ) : (
          <Badge size="xs" color="teal" variant="light">
            vorhandenes Material
          </Badge>
        )}
        {s.rolle !== 'pflicht' && (
          <Badge size="xs" color={s.rolle === 'foerder' ? 'orange' : s.rolle === 'optional' ? 'teal' : 'yellow'} variant="light">
            {s.rolle === 'foerder' ? 'Förderung' : s.rolle === 'optional' ? 'Optional' : s.rolle === 'wahl' ? 'Wahl' : '★ Forder'}
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        {s.platzhalter?.beschreibung ?? s.begruendung}
      </Text>
    </div>
  )
}

/**
 * Knopf am Platzhalter (08.10.2026: alle Schrittarten als Auftrag im Hintergrund) mit dem Stand der KI-Erstellung:
 * Solange für den Schritt ein Auftrag in der Leiste steht, zeigt die Plakette „Wartet – Platz 2", „Entsteht: …",
 * „Fertig – ansehen" usw. (SchrittStatus.tsx) statt eines Drehkreises; dazu die Marke „KI-Entwurf".
 */
export function PlatzhalterKnopf({
  reihe,
  s,
  setze,
  speichernVorher,
  ansehen
}: {
  reihe: Reihe
  s: Schritt
  setze: (patch: Partial<Schritt>) => void
  /** Die Reihe muss für den Hintergrund-Auftrag gespeichert sein */
  speichernVorher: () => Promise<Reihe | null>
  /** „Fertig – ansehen" bei Schritten ohne Arbeitsblatt (z. B. Bearbeiten-Fenster öffnen) */
  ansehen?: (s: Schritt) => void
}): React.JSX.Element | null {
  const [startet, setStartet] = useState(false)
  const imHintergrund = useErzeugtGerade(reihe.id, s.id)
  const status = <SchrittKiStatus reihe={reihe} s={s} setze={setze} ansehen={ansehen} />
  const marke = <KiEntwurfMarke s={s} setze={setze} />
  if (!s.platzhalter || imHintergrund)
    return (
      <>
        {status}
        {marke}
      </>
    )
  // Test aus der Reihe (06.10.2026): entsteht im Test-Programm – dorthin springen
  if (s.test) {
    const ziel = s.test
    return (
      <Button
        size="compact-xs"
        variant="light"
        color="grape"
        leftSection={<IconArrowRight size={13} />}
        onClick={(e) => {
          e.stopPropagation()
          useNavigation.getState().setRueckweg({ fuer: ziel.modul, nach: 'unterrichtsreihe', name: 'Zurück zur Reihe' })
          void dokumentOeffnenWennBereit(ziel.modul, ziel.docId)
        }}
        data-zum-test
      >
        Zum Test
      </Button>
    )
  }
  const art = s.inhalt.art
  const geht = art === 'arbeitsblatt' || direktErzeugbar(art)
  return (
    <>
      {/* Nach Fehler oder Abbruch steht der Stand noch daneben */}
      {status}
      <Tooltip label={s.platzhalter.beschreibung} multiline w={320}>
        <Button
          size="compact-xs"
          variant="light"
          color="grape"
          leftSection={<IconSparkles size={13} />}
          loading={startet}
          disabled={!geht}
          onClick={async (e) => {
            e.stopPropagation()
            setStartet(true)
            try {
              const r = await speichernVorher()
              if (!r) return
              erzeugeFuerPlatzhalter(r, r.schritte.find((x) => x.id === s.id) ?? s)
            } catch (x) {
              notifyError(x)
            } finally {
              setStartet(false)
            }
          }}
          data-platzhalter-erstellen
        >
          Mit KI erstellen
        </Button>
      </Tooltip>
    </>
  )
}

/** Druckmenü für einen Schritt oder die ganze Reihe (05.10.2026): Drucken, PDF, Word – mit oder ohne Lösung */
export function DruckMenue({ schritt, reihe }: { schritt?: Schritt; reihe?: Reihe }): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const los = async (art: DruckArt, mitLoesung: boolean): Promise<void> => {
    setLaeuft(true)
    try {
      if (schritt) await schrittAusgeben(schritt, art, mitLoesung)
      else if (reihe && art !== 'word') await reiheAusgeben(reihe, art, mitLoesung)
    } catch (e) {
      notifyError(e, 'Nicht gedruckt')
    } finally {
      setLaeuft(false)
    }
  }
  const eintraege: { art: DruckArt; label: string }[] = [
    { art: 'drucken', label: 'Drucken' },
    { art: 'pdf', label: 'Als PDF speichern' },
    ...(schritt ? [{ art: 'word' as const, label: 'Als Word speichern' }] : [])
  ]
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        {schritt ? (
          <Tooltip label="Drucken / speichern">
            <ActionIcon variant="subtle" loading={laeuft} aria-label="drucken" data-schritt-drucken onClick={(e) => e.stopPropagation()}>
              <IconPrinter size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button variant="default" leftSection={<IconPrinter size={16} />} loading={laeuft} data-reihe-drucken>
            Drucken
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{schritt ? 'Fassung dieses Schritts' : 'Alle Materialien der Reihe'}</Menu.Label>
        {eintraege.map((e) => (
          <Menu.Item key={e.art} onClick={() => void los(e.art, false)} data-druck-art={e.art}>
            {e.label}
          </Menu.Item>
        ))}
        {/* Dasselbe PDF ansehen, ohne zu speichern (10.10.2026, shared/export/PdfVorschau.tsx) */}
        <Menu.Item leftSection={<IconEye size={14} />} onClick={() => void alsVorschau(() => los('pdf', false))} data-druck-art="vorschau">
          PDF-Vorschau
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Mit Lösungsteil</Menu.Label>
        {eintraege.map((e) => (
          <Menu.Item key={`l${e.art}`} onClick={() => void los(e.art, true)} data-druck-art={`${e.art}-loesung`}>
            {e.label}
          </Menu.Item>
        ))}
        <Menu.Item leftSection={<IconEye size={14} />} onClick={() => void alsVorschau(() => los('pdf', true))} data-druck-art="vorschau-loesung">
          PDF-Vorschau
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
