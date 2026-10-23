/**
 * Schritt 1 der Rückmeldung: Material (23.10.2026, Neugestaltung nach Multiple Choice mit der
 * Lehrkraft – vorher stand alles auf einer zweispaltigen Seite „Grundlage & Abgaben").
 *
 * - Ohne Grundlage: „Zuletzt bearbeitet" (die fünf neuesten passenden Materialien, ein Klick) und
 *   zwei Kacheln „Anderes Material suchen …" und „Eigene Aufgabe" – kein Umschalter mehr.
 * - Mit Grundlage: eine kompakte Karte (Bild, Titel, Programm · Fach · Jahrgang, „Ändern"), der
 *   Aufgabentext eingeklappt. Fach und Jahrgang kommen aus dem Material und sind dort änderbar.
 * - Darunter die Art der Rückmeldung als eine Zeile und, eingeklappt, „Feinheiten (optional)".
 */
import { Badge, Button, Card, Collapse, Container, Group, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import {
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconPencil,
  IconSearch,
  IconUpload
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { CefrTable } from '@shared/types'
import { ladeMaterialien, type Material } from '../../../shell/materialien'
import { useAppSettings, useExperte } from '../../../shared/settingsStore'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import DropZone from '../../../shared/components/DropZone'
import Formularfuss from '../../../shared/components/Formularfuss'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import MaterialWahl, { MaterialZeile, ProgrammBild } from '../../../shared/components/MaterialWahl'
import SchulortFelder from '../../../shared/components/SchulortFelder'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { mitLerngruppe } from '../../../shared/lerngruppe'
import { notifyError, notifySuccess } from '../../../shared/util'
import { gradeRange } from '../../arbeitsblatt/didactics/schoolProfiles'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import BilingualSchalter from '../../arbeitsblatt/steps/BilingualSchalter'
import { hatForm } from '../art'
import { aufgabeAusDateien, teileErkennen } from '../auftrag'
import { ART_TITEL, ladeGrundlage, type MaterialEintrag } from '../generation'
import type { Rueckmeldung } from '../model/types'
import { ANREDE_OPTIONEN, STANDARD_ANREDE, type Anrede } from '../render/texte'
import { bibliothek, useRueckmeldung } from '../store'
import { horcheAufVorbereitet, rueckmeldungIdZu } from '../vorgabe'
import type { SavedDokumentMeta } from '@shared/apiShape'
import { fremdsprachlich } from '../teilbewertung'
import AntwortSpracheZeile from './AntwortSpracheZeile'
import ArtKarte from './ArtKarte'
import BewertungKarte from './BewertungKarte'
import TeileKarte from './TeileKarte'
import './einrichten.css'

/** Schulformen und Jahrgänge kommen aus dem gemeinsamen Katalog – die GER-Tabelle braucht die Rückmeldung nicht */
const LEERE_TABELLE: CefrTable = { version: 1, states: [] }
const PROGRAMME = Object.keys(ART_TITEL)

/** Jahrgänge der Schulform; ein gespeicherter Jahrgang außerhalb bleibt wählbar (ältere Rückmeldungen) */
function jahrgangsListe(stateId: string, schoolTypeId: string, aktuell: number): { value: string; label: string }[] {
  const { min, max } = gradeRange(LEERE_TABELLE, stateId, schoolTypeId)
  const jahrgaenge = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  if (!jahrgaenge.includes(aktuell)) jahrgaenge.push(aktuell)
  return jahrgaenge.sort((a, b) => a - b).map((g) => ({ value: String(g), label: `Klasse ${g}` }))
}

type Update = (f: (d: Rueckmeldung) => void, gruppe?: string) => void

/** Je Dokument frisch – sonst blieben „Eigene Aufgabe" bzw. aufgeklappte Abgaben nach „Neue Rückmeldung" stehen */
export default function MaterialSchritt(): React.JSX.Element {
  const docId = useRueckmeldung((s) => s.docId)
  return <MaterialSchrittInhalt key={docId} />
}

function MaterialSchrittInhalt(): React.JSX.Element | null {
  const { dok: r, update, docId, setStep } = useRueckmeldung()
  // „Eigene Aufgabe" gewählt, aber noch leer – bzw. „Ändern" auf der Karte: die Auswahl steht wieder da
  const [eigeneNeu, setEigeneNeu] = useState(false)
  const [waehlen, setWaehlen] = useState(false)
  const [wahlOffen, setWahlOffen] = useState(false)
  if (!r) return null

  const mitMaterial = r.grundlage.art !== 'frei' && Boolean(r.grundlage.docId)
  const mitEigener = r.grundlage.art === 'frei' && Boolean(r.grundlage.titel.trim() || r.grundlage.aufgaben.trim())
  const zeigeAuswahl = waehlen || (!mitMaterial && !mitEigener && !eigeneNeu)

  const waehleMaterial = async (art: MaterialEintrag['art'], id: string): Promise<void> => {
    try {
      // Je Material eine Rückmeldung (08.10.2026): gibt es schon eine (z. B. „Vorbereiten" im Editor), öffnet sie sich (23.10.2026)
      const vorhanden = await rueckmeldungIdZu(art, id)
      if (vorhanden && vorhanden !== docId) {
        await bibliothek.oeffnen(vorhanden)
        return notifySuccess('Zu diesem Material gibt es schon eine Rückmeldung – sie ist jetzt geöffnet.')
      }
      const { grundlage, fach } = await ladeGrundlage(art, id)
      update((d) => {
        d.grundlage = grundlage
        if (fach.id) {
          d.meta.subjectId = fach.id
          d.meta.subjectLabel = fach.label || subjectById(fach.id).label
          d.meta.grade = fach.grade || d.meta.grade
        }
      })
      setWaehlen(false)
      setEigeneNeu(false)
      // Fremdsprachen: Teile und Antwortsprache je Teil gleich erkennen (29.09.2026) – die Klassenarbeit bringt sie schon mit
      const aktuell = useRueckmeldung.getState().dok
      if (aktuell && fremdsprachlich(aktuell.meta.subjectId) && !aktuell.grundlage.teile?.length && aktuell.grundlage.aufgaben.trim())
        teileErkennen(aktuell, docId)
    } catch (e) {
      notifyError(e, 'Das Material konnte nicht geladen werden')
    }
  }

  const eigeneWaehlen = (): void => {
    update((d) => {
      // Eine schon begonnene eigene Aufgabe bleibt erhalten
      if (d.grundlage.art !== 'frei') d.grundlage = { art: 'frei', titel: '', aufgaben: '' }
    })
    setWaehlen(false)
    setEigeneNeu(true)
  }

  const grund = !r.grundlage.aufgaben.trim()
    ? zeigeAuswahl
      ? 'Erst Material oder eigene Aufgabe wählen'
      : 'Aufgabenstellung fehlt'
    : hatForm(r.meta, 'tabelle') && !r.tabelle?.kriterien.length
      ? 'Bewertungstabelle fehlt'
      : ''

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea style={{ flex: 1 }}>
        <Container size="md" py="lg">
          <Stack gap="md">
            {zeigeAuswahl ? (
              <MaterialStart
                docId={docId}
                gewaehlt={mitMaterial ? `${r.grundlage.art}:${r.grundlage.docId}` : null}
                waehle={(art, id) => void waehleMaterial(art, id)}
                suchen={() => setWahlOffen(true)}
                eigene={eigeneWaehlen}
                abbrechen={mitMaterial || mitEigener ? () => setWaehlen(false) : undefined}
              />
            ) : (
              <GrundlageKarte r={r} update={update} docId={docId} neu={eigeneNeu} aendern={() => setWaehlen(true)} />
            )}
            <MaterialWahl
              offen={wahlOffen}
              schliessen={() => setWahlOffen(false)}
              programme={PROGRAMME}
              gewaehlt={mitMaterial ? `${r.grundlage.art}:${r.grundlage.docId}` : null}
              onWahl={(programm, id) => void waehleMaterial(programm as MaterialEintrag['art'], id)}
            />
            {!zeigeAuswahl && (
              <>
                <ArtKarte />
                {/* Musterlösung und Bewertungstabelle – immer sichtbar, auch im Standardmodus (23.10.2026) */}
                <BewertungKarte r={r} update={update} docId={docId} />
                <Feinheiten r={r} update={update} docId={docId} />
              </>
            )}
          </Stack>
        </Container>
      </ScrollArea>
      <Formularfuss grund={grund}>
        <Button rightSection={<IconArrowRight size={16} />} disabled={Boolean(grund)} onClick={() => setStep(1)} data-rm-weiter>
          Weiter: Abgaben
        </Button>
      </Formularfuss>
    </Stack>
  )
}

/** Ohne Grundlage: die neuesten Materialien zum Anklicken und die beiden anderen Wege */
function MaterialStart({
  docId,
  gewaehlt,
  waehle,
  suchen,
  eigene,
  abbrechen
}: {
  docId: string
  gewaehlt: string | null
  waehle: (art: MaterialEintrag['art'], id: string) => void
  suchen: () => void
  eigene: () => void
  abbrechen?: () => void
}): React.JSX.Element {
  const [zuletzt, setZuletzt] = useState<Material[] | null>(null)
  // Vorbereitete Rückmeldungen (23.10.2026, Bericht der Lehrkraft: „Vorbereiten" in der Klassenarbeit – hier stand nichts)
  const [vorbereitet, setVorbereitet] = useState<SavedDokumentMeta[]>([])
  useEffect(() => {
    const laden = (): void =>
      void window.api.rueckmeldungen
        .list()
        .then((l) =>
          setVorbereitet(
            l
              .filter((m) => m.id !== docId && !Number(m.fertig ?? 0))
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 5)
          )
        )
        .catch(() => setVorbereitet([]))
    laden()
    // Aus einem anderen Programm vorbereitet, während die Rückmeldung schon offen war: ohne Neuladen nachziehen
    return horcheAufVorbereitet(laden)
  }, [docId])
  useEffect(() => {
    void ladeMaterialien()
      .then((alle) =>
        setZuletzt(
          alle
            // Entwürfe haben noch keine Aufgaben – darauf gibt es nichts zurückzumelden
            .filter((m) => PROGRAMME.includes(m.moduleId) && !m.entwurf)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 5)
        )
      )
      .catch(() => setZuletzt([]))
  }, [])
  return (
    <Stack gap="md" data-rm-start>
      <Group justify="space-between" align="center">
        <Title order={3}>Woran soll Rückmeldung gegeben werden?</Title>
        {abbrechen && (
          <Button variant="subtle" size="xs" onClick={abbrechen}>
            Abbrechen
          </Button>
        )}
      </Group>
      {vorbereitet.length > 0 && (
        <div data-rm-vorbereitet>
          <Text size="sm" fw={600} mb={6}>
            Noch ohne Bögen – weiter mit
          </Text>
          <Stack gap={6}>
            {vorbereitet.map((m) => (
              <UnstyledButton
                key={m.id}
                className="home-material"
                onClick={() => void bibliothek.oeffnen(m.id).catch(notifyError)}
                data-rm-vorbereitet-eintrag={m.id}
              >
                <Group gap="sm" wrap="nowrap">
                  {typeof m.quelleArt === 'string' ? <ProgrammBild moduleId={m.quelleArt} /> : <ProgrammBild moduleId="rueckmeldung" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={600} size="sm" truncate>
                      {m.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {[
                        typeof m.quelleArt === 'string' && m.quelleArt in ART_TITEL ? ART_TITEL[m.quelleArt as keyof typeof ART_TITEL] : 'Eigene Aufgabe',
                        Number(m.abgaben ?? 0) === 1 ? '1 Abgabe' : `${Number(m.abgaben ?? 0)} Abgaben`,
                        new Date(m.updatedAt).toLocaleDateString('de-DE')
                      ].join(' · ')}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </div>
      )}
      {zuletzt === null ? (
        <Text size="sm" c="dimmed">
          Materialien werden geladen …
        </Text>
      ) : (
        zuletzt.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb={6}>
              Zuletzt bearbeitet
            </Text>
            <Stack gap={6}>
              {zuletzt.map((m) => (
                <MaterialZeile
                  key={`${m.moduleId}:${m.id}`}
                  m={m}
                  aktiv={gewaehlt === `${m.moduleId}:${m.id}`}
                  onClick={() => waehle(m.moduleId as MaterialEintrag['art'], m.id)}
                  data-rm-zuletzt={`${m.moduleId}:${m.id}`}
                />
              ))}
            </Stack>
          </div>
        )
      )}
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <Kachel
          icon={<IconSearch size={22} />}
          titel={zuletzt?.length ? 'Anderes Material suchen …' : 'Material suchen …'}
          text="Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Grammatik- oder Vokabeltest"
          onClick={suchen}
          data-rm-material
        />
        <Kachel
          icon={<IconUpload size={22} />}
          titel="Eigene Aufgabe"
          text="Aufgabenblatt als Foto, Scan oder Datei – oder selbst eintippen"
          onClick={eigene}
          data-rm-eigene
        />
      </SimpleGrid>
    </Stack>
  )
}

/** Große Wahlkachel (auch in „Abgaben": Hochladen / online einreichen) */
export function Kachel({
  icon,
  titel,
  text,
  onClick,
  aktiv,
  ...rest
}: { icon: React.ReactNode; titel: string; text: string; onClick: () => void; aktiv?: boolean } & Record<`data-${string}`, string | boolean>): React.JSX.Element {
  return (
    <UnstyledButton className="rm-wahlkachel" onClick={onClick} data-aktiv={aktiv || undefined} aria-pressed={aktiv} {...rest}>
      <Group wrap="nowrap" gap="sm" align="flex-start">
        <ThemeIcon size={40} variant="light" radius="md">
          {icon}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text fw={600}>{titel}</Text>
          <Text size="xs" c="dimmed">
            {text}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  )
}

/** Gewähltes Material bzw. eigene Aufgabe als Karte; der Aufgabentext klappt auf */
function GrundlageKarte({
  r,
  update,
  docId,
  neu,
  aendern
}: {
  r: Rueckmeldung
  update: Update
  docId: string
  /** Eigene Aufgabe eben gewählt: Ablage und Felder stehen gleich offen */
  neu: boolean
  aendern: () => void
}): React.JSX.Element {
  const eigene = r.grundlage.art === 'frei'
  const [textOffen, setTextOffen] = useState(neu)
  const [fachOffen, setFachOffen] = useState(false)
  const [leseAufgabe, setLeseAufgabe] = useState<string | null>(null)

  /** Aufgabenblatt lesen, Datenschutz prüfen, dann den Auftrag starten (KI übernimmt Aufgabe, Erwartung, Fach, Jahrgang) */
  const aufgabeLesen = async (files: File[]): Promise<void> => {
    try {
      const gelesen: HochladeInhalt[] = []
      for (const f of files) {
        setLeseAufgabe(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (m) => setLeseAufgabe(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 6 })
        gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
      }
      setLeseAufgabe(null)
      const geprueft = await pruefeHochladen(gelesen)
      const aktuell = useRueckmeldung.getState().dok
      if (geprueft && aktuell) aufgabeAusDateien(aktuell, docId, geprueft)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLeseAufgabe(null)
    }
  }

  const titel = r.grundlage.titel.trim() || (eigene ? 'Eigene Aufgabe' : 'Material')
  const programm = r.grundlage.art === 'frei' ? 'Eigene Aufgabe' : ART_TITEL[r.grundlage.art]
  return (
    <Card withBorder data-rm-grundlage>
      <Group wrap="nowrap" gap="sm" align="flex-start">
        {eigene ? (
          <ThemeIcon size={40} variant="light" color="gray">
            <IconPencil size={22} />
          </ThemeIcon>
        ) : (
          <ProgrammBild moduleId={r.grundlage.art} size={40} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fw={700} truncate data-rm-grundlage-titel>
            {titel}
          </Text>
          <UnstyledButton onClick={() => setFachOffen((o) => !o)} aria-expanded={fachOffen} className="rm-fachzeile" data-rm-fach-aendern>
            <Text size="sm" c="dimmed" span>
              {[programm, r.meta.subjectLabel, `Klasse ${r.meta.grade}`].join(' · ')}
            </Text>{' '}
            <IconPencil size={13} style={{ verticalAlign: '-2px' }} aria-label="Fach und Jahrgang ändern" />
          </UnstyledButton>
        </div>
        <Button variant="default" size="xs" onClick={aendern} data-rm-grundlage-aendern>
          Ändern
        </Button>
      </Group>
      {r.meta.erkannt && (
        <Text size="xs" c="teal" mt={6} data-rm-erkannt>
          {r.meta.erkannt}
        </Text>
      )}
      <Collapse expanded={fachOffen}>
        <Group grow align="flex-start" mt="sm">
          <HaeufigSelect
            art="fach"
            label="Fach"
            data={SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
            value={r.meta.subjectId}
            onChange={(v) => v && update((d) => ((d.meta.subjectId = v), (d.meta.subjectLabel = subjectById(v).label), delete d.meta.erkannt))}
            allowDeselect={false}
            searchable
          />
          <Select
            label="Jahrgang"
            data={jahrgangsListe(r.meta.stateId, r.meta.schoolTypeId, r.meta.grade)}
            value={String(r.meta.grade)}
            onChange={(v) => v && update((d) => ((d.meta.grade = Number(v)), delete d.meta.erkannt))}
            allowDeselect={false}
          />
        </Group>
      </Collapse>
      <UnstyledButton onClick={() => setTextOffen((o) => !o)} aria-expanded={textOffen} mt="sm" className="rm-aufklapper" data-rm-aufgabe-auf>
        <Group gap={6}>
          {textOffen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <Text size="sm" fw={600}>
            {eigene ? 'Aufgabe eintragen / anpassen' : 'Aufgabe ansehen / anpassen'}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={textOffen}>
        <Stack gap="sm" mt="xs">
          {eigene && (
            <>
              <DropZone
                onFiles={(f) => void aufgabeLesen(f)}
                sammeln
                accept={MATERIAL_ACCEPT}
                title={leseAufgabe ?? 'Aufgabenblatt hierher ziehen'}
                hint="Foto, Scan, PDF, Word oder Text – die KI übernimmt Aufgabe und nötiges Material, den Erwartungshorizont und erkennt Fach und Jahrgang."
                loading={Boolean(leseAufgabe)}
                minHeight={70}
              />
              <Text size="xs" c="dimmed">
                oder selbst eintippen:
              </Text>
              <TextInput
                label="Titel der Aufgabe"
                placeholder="z. B. Leserbrief zum Handyverbot"
                value={r.grundlage.titel}
                onChange={(e) => {
                  const x = e.currentTarget.value
                  update((d) => (d.grundlage.titel = x), 'rm-titel')
                }}
              />
            </>
          )}
          <Textarea
            label={eigene ? 'Aufgabenstellung' : 'Aufgaben (aus dem Material, anpassbar)'}
            autosize
            minRows={3}
            maxRows={12}
            value={r.grundlage.aufgaben}
            onChange={(e) => {
              const x = e.currentTarget.value
              update((d) => (d.grundlage.aufgaben = x), 'rm-aufgaben')
            }}
            data-rm-aufgaben
          />
        </Stack>
      </Collapse>
    </Card>
  )
}

/** Seltenes, eingeklappt: Schwerpunkt, Schulort, Anrede, Bilingual, Antwortsprache, Teile (Erwartung: BewertungKarte) */
function Feinheiten({ r, update, docId }: { r: Rueckmeldung; update: Update; docId: string }): React.JSX.Element {
  const [offen, setOffen] = useState(useExperte())
  const { defaults } = useAppSettings((s) => s.settings)
  const fs = fremdsprachlich(r.meta.subjectId)
  // Was vom Standard abweicht – steht im Kopf, auch zugeklappt
  const geaendert = [
    r.meta.schwerpunkt?.trim() && 'Schwerpunkt',
    (r.meta.stateId !== defaults.stateId || r.meta.schoolTypeId !== defaults.schoolTypeId) && 'Schulform',
    r.meta.anrede !== STANDARD_ANREDE && 'Anrede',
    r.meta.bilingual?.an && 'Bilingual',
    r.grundlage.antwortSprache && 'Antwortsprache',
    r.grundlage.teile?.length && `${r.grundlage.teile.length} Teile`
  ].filter((x): x is string => Boolean(x))

  return (
    <Card withBorder padding={0} data-rm-feinheiten>
      <UnstyledButton onClick={() => setOffen((o) => !o)} aria-expanded={offen} px="md" py="sm" w="100%" className="rm-aufklapper">
        <Group gap="xs" wrap="nowrap">
          {offen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          <Text fw={600}>Feinheiten (optional)</Text>
          <Text size="sm" c="dimmed" truncate>
            {geaendert.length ? `angepasst: ${geaendert.join(', ')}` : 'Schwerpunkt, Schulform, Anrede, Bilingual …'}
          </Text>
          {geaendert.length > 0 && (
            <Badge size="sm" variant="light" ml="auto">
              {geaendert.length}
            </Badge>
          )}
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap="sm" px="md" pb="md">
          <Textarea
            label="Schwerpunkt der Rückmeldung"
            placeholder="z. B. Aufbau der Argumentation, Zeitformen, Belege aus dem Text"
            autosize
            minRows={1}
            value={r.meta.schwerpunkt}
            onChange={(e) => {
              const x = e.currentTarget.value
              update((d) => (d.meta.schwerpunkt = x), 'rm-schwerpunkt')
            }}
          />
          {/* Bundesland und Schulform (30.09.2026): steuern Länderregeln, Notenpunkte und Gewichtung */}
          <SchulortFelder
            table={LEERE_TABELLE}
            stateId={r.meta.stateId}
            schoolTypeId={r.meta.schoolTypeId}
            schoolTypeName={r.meta.schoolTypeName}
            onChange={(p) =>
              update((d) => {
                Object.assign(d.meta, mitLerngruppe(LEERE_TABELLE, d.meta, p))
                delete d.meta.erkannt
              })
            }
            searchable
          />
          <Select
            label="Anrede"
            maw={360}
            data={ANREDE_OPTIONEN}
            value={r.meta.anrede}
            onChange={(v) => v && update((d) => (d.meta.anrede = v as Anrede))}
            allowDeselect={false}
          />
          {/* Bilingualer Sachfachunterricht – nur bei Sachfächern, wie im Arbeitsblatt (30.09.2026) */}
          <BilingualSchalter
            meta={r.meta}
            onChange={(bilingual) =>
              update((d) => {
                if (bilingual) d.meta.bilingual = bilingual
                else delete d.meta.bilingual
              })
            }
          />
          {fs && <AntwortSpracheZeile r={r} update={update} />}
          <TeileKarte r={r} docId={docId} update={update} />
        </Stack>
      </Collapse>
    </Card>
  )
}
