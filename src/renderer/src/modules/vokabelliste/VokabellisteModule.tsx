import { AppKopf } from '../../shared/components/AppKopf'
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Container,
  Group,
  Menu,
  MultiSelect,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from '@mantine/core'
import { FachPunkt } from '../../shared/components/FachFarbe'
import { IconBook2, IconBooks, IconChevronRight, IconPencil, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { CefrTable, SavedVocabList, TextbookMeta } from '@shared/types'
import { notifyError } from '../../shared/util'
import { schoolTypesForState } from '../arbeitsblatt/didactics/schoolProfiles'
import { STATES } from '../arbeitsblatt/didactics/states'
import SchulAngabe from '../../shared/components/SchulAngabe'
import { newId } from '../vokabeltest/model/random'
import { LANGUAGES } from '../vokabeltest/model/types'
import BookEditor from './steps/BookEditor'
import ListEditor from './steps/ListEditor'
import NewListWizard from './steps/NewListWizard'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { useDokumentOeffner } from '../../shared/navigation'
import { EintragMenue, EintragRueckfragen, Oeffnen, useBibliothek } from '../../shared/components/Bibliothek'
import { passtZurSuche } from '../../shared/bibliothek'
import { testAusListe } from '../vokabeltest/library'
import { ZUSATZ } from '../vokabeltest/steps/VokabelTabelle'
import { vokabellistenApi } from './listenApi'
import {
  FILTER_FELDER,
  filterOptionen,
  filtere,
  gruppiereReihen,
  nachKlasse,
  REIHEN_SORTIERUNGEN,
  reiheTitel,
  sinnvolleSortierungen,
  wirksamerFilter,
  wirksameSortierung,
  type FilterFeld,
  type FilterWahl,
  type ReihenSortierung
} from '@shared/lehrwerkReihe'

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

/** Zuletzt gewählte Lerngruppe merken, damit die Auswahl beim nächsten Mal steht. */
const CHOICE_KEY = 'vokabellisten-auswahl'
const readChoice = (): { stateId: string; schoolTypeId: string; language: string } => {
  try {
    const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null')
    if (saved?.stateId && saved?.schoolTypeId && saved?.language) return saved
  } catch {
    // ohne gespeicherte Auswahl gelten die Vorgaben
  }
  return { stateId: 'NI', schoolTypeId: 'gymnasium', language: 'en' }
}

/**
 * Programm „Vokabellisten": Schulbuch-Vokabeln und eigene Listen anlegen und pflegen.
 *
 * Zuerst stehen Bundesland, Schulform und Fach – erst danach erscheinen die passenden
 * Lehrwerke und Listen. Die Listen stehen anschließend im Vokabeltest und bei den
 * Klassenarbeiten zur Auswahl. Zusatzwortschatz (im Buch grau) wird dort übernommen, aber
 * zunächst nicht abgefragt.
 */
export default function VokabellisteModule({ active = true }: { active?: boolean }): React.JSX.Element {
  const [choice, setChoice] = useState(readChoice)
  const [table, setTable] = useState<CefrTable>({ version: 1, states: [] })
  const [books, setBooks] = useState<TextbookMeta[]>([])
  const [openList, setOpenList] = useState<SavedVocabList | null>(null)
  const [openBook, setOpenBook] = useState<string | null>(null)
  const [wizard, setWizard] = useState(false)
  // Aufgeklappte Reihen (Paket 15): anfangs alle zu; bleibt beim Wechsel in den Buch-Editor und zurück erhalten
  const [offeneReihen, setOffeneReihen] = useState<string[]>([])

  // „Zuletzt bearbeitet" auf der Startseite (und später „Öffnen" nach einem Auftrag) öffnet hierüber
  useDokumentOeffner('vokabelliste', async (id) => {
    const alle = await window.api.library.list()
    const liste = alle.find((l) => l.id === id)
    if (!liste) throw new Error('Die Liste gibt es nicht mehr.')
    setOpenBook(null)
    setWizard(false)
    setOpenList(liste)
  })

  useEffect(() => {
    window.api.cefr.get().then(setTable).catch(notifyError)
  }, [])
  /*
   * Lehrwerke bei jedem Wechsel hierher neu holen: Das Programm bleibt im Hintergrund geladen, und
   * ein im Vokabeltest importiertes Lehrwerk fehlte sonst bis zum Neustart (gefunden mit der
   * Wache schulbuchreihen.mjs, Paket 15).
   */
  useEffect(() => {
    if (active) window.api.textbooks.list().then(setBooks).catch(notifyError)
  }, [active])

  useEffect(() => {
    try {
      localStorage.setItem(CHOICE_KEY, JSON.stringify(choice))
    } catch {
      // ohne lokalen Speicher bleibt die Auswahl nur für diese Sitzung
    }
  }, [choice])

  // Hooks vor den frühen Rücksprüngen (Buch- und Listen-Editor)
  const reihen = useReihenFilter(
    books.filter((b) => b.language === choice.language),
    choice.language
  )

  if (openBook) {
    return (
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <BookEditor
            bookId={openBook}
            aktiv={active}
            onBack={() => {
              setOpenBook(null)
              window.api.textbooks.list().then(setBooks).catch(notifyError)
            }}
          />
        </Container>
      </ScrollArea>
    )
  }

  if (openList) {
    return (
      <ScrollArea h="100%">
        <Container size="lg" py="lg">
          <ListEditor
            list={openList}
            onSaved={(_alle, saved) => {
              // Nur die offene Liste nachführen: Die letzte Sicherung kann eintreffen, nachdem
              // schon zurück zur Übersicht gewechselt wurde – dann bleibt die Übersicht stehen
              setOpenList((offen) => (offen?.id === saved.id ? saved : offen))
            }}
            onBack={() => setOpenList(null)}
            onTest={(l) => void testAusListe(l.id)}
            aktiv={active}
          />
        </Container>
      </ScrollArea>
    )
  }

  const schoolTypes = schoolTypesForState(table, choice.stateId)
  const schoolTypeId = schoolTypes.some((t) => t.value === choice.schoolTypeId) ? choice.schoolTypeId : (schoolTypes[0]?.value ?? '')
  // Passende Lehrwerke: Sprache des Faches; Land und Schulform, soweit das Buch sie nennt
  const matching = books.filter(
    (b) => b.language === choice.language && (!b.stateId || b.stateId === choice.stateId) && (!b.schoolTypeId || b.schoolTypeId === schoolTypeId)
  )
  const others = books.filter((b) => b.language === choice.language && !matching.includes(b))
  const languageLabel = LANGUAGES.find((l) => l.value === choice.language)?.label ?? choice.language

  return (
    <ScrollArea h="100%">
      <Container size="lg" py="lg">
        {/* Gemeinsamer Kopf (Phase 6a) */}
        <AppKopf
          beschreibung="Schulbuch-Vokabeln bearbeiten und eigene Listen anlegen. Sie stehen anschließend im Vokabeltest und bei den Klassenarbeiten zur Auswahl."
          neu={{ label: 'Neue Liste', onClick: () => setWizard(true), kennung: 'vokabelliste' }}
        />

        <Card withBorder mb="md">
          <Text size="sm" fw={500} mb={6}>
            Für welche Lerngruppe?
          </Text>
          {/* Bundesland und Schulform stehen eingeklappt, solange sie den Einstellungen entsprechen */}
          <SchulAngabe
            stateId={choice.stateId}
            stateName={STATES.find((s) => s.id === choice.stateId)?.name ?? choice.stateId}
            schoolTypeId={schoolTypeId}
            schoolTypeName={schoolTypes.find((t) => t.value === schoolTypeId)?.label ?? ''}
          >
            <Group grow>
              <HaeufigSelect
                art="bundesland"
                label="Bundesland"
                data={STATES.map((s) => ({ value: s.id, label: s.name }))}
                value={choice.stateId}
                onChange={(v) => v && setChoice((c) => ({ ...c, stateId: v }))}
                allowDeselect={false}
                searchable
              />
              <HaeufigSelect
                art="schulform"
                label="Schulform"
                data={schoolTypes}
                value={schoolTypeId}
                onChange={(v) => v && setChoice((c) => ({ ...c, schoolTypeId: v }))}
                allowDeselect={false}
              />
            </Group>
          </SchulAngabe>
          <Group grow>
            <HaeufigSelect
              art="fach"
              label="Fach"
              data={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
              value={choice.language}
              onChange={(v) => v && setChoice((c) => ({ ...c, language: v }))}
              allowDeselect={false}
              // Farbpunkt des Fachs (Paket 10a)
              leftSection={<FachPunkt fach={choice.language} />}
            />
            {/* Filterzeile (Paket 15): nach dem Fach Verlag – Reihe – Landesausgabe – Ausgabe, nur wenn sie etwas unterscheiden */}
            {reihenFilterFelder({ reihen })}
          </Group>
        </Card>

        <Schulbuecher
          buecher={[...matching, ...others]}
          andere={others}
          languageLabel={languageLabel}
          reihen={reihen}
          offen={offeneReihen}
          onOffen={setOffeneReihen}
          onBearbeiten={setOpenBook}
        />

        <EigeneListen sprache={choice.language} languageLabel={languageLabel} onBearbeiten={setOpenList} />

        <NewListWizard
          opened={wizard}
          defaults={{ stateId: choice.stateId, schoolTypeId, language: choice.language }}
          onClose={() => setWizard(false)}
          onCreated={async (created) => {
            setWizard(false)
            const list = { ...created, id: created.id || newId() }
            /*
             * Gleich speichern. Bis 25.09.2026 stand die eingelesene Liste nur im Editor – wer von
             * dort ohne „Speichern" zurückging, hatte die ganze Texterkennung umsonst bezahlt.
             */
            try {
              await window.api.library.save(list)
            } catch (e) {
              notifyError(e, 'Die Liste konnte nicht gespeichert werden')
            }
            // Direkt weiter in den Editor: Dort lässt sich jede Zeile prüfen und ergänzen
            setOpenList(list)
            setChoice((c) => ({ ...c, language: list.language ?? c.language }))
          }}
        />
      </Container>
    </ScrollArea>
  )
}

/**
 * „Eigene Listen" der Übersicht – mit dem Verhalten der gemeinsamen Bibliothek (Suche,
 * Umbenennen, Kopie anlegen, Löschen mit Inline-Rückfrage) und dem Knopf „Test aus dieser
 * Liste" (Paket 7). Vorher Löschen über eine eigene Rückfrage und kein Duplizieren.
 *
 * Wird beim Zurückkommen aus dem Editor neu aufgebaut – die Liste ist dann aktuell.
 */
function EigeneListen({
  sprache,
  languageLabel,
  onBearbeiten
}: {
  sprache: string
  languageLabel: string
  onBearbeiten: (l: SavedVocabList) => void
}): React.JSX.Element {
  const bib = useBibliothek<SavedVocabList>(vokabellistenApi, { offeneId: () => null })
  const eigene = (bib.eintraege ?? []).filter((l) => !l.language || l.language === sprache)
  const treffer = eigene.filter((l) => passtZurSuche([l.name, l.source, l.grade ? `Klasse ${l.grade}` : ''], bib.suche))
  return (
    <>
      <Group justify="space-between" mb="xs" align="flex-end">
        <Title order={4}>Eigene Listen</Title>
        {eigene.length > 3 && (
          <TextInput
            size="xs"
            leftSection={<IconSearch size={14} />}
            placeholder="Suchen (Name, Klasse)"
            aria-label="Eigene Listen durchsuchen"
            value={bib.suche}
            onChange={(e) => bib.setSuche(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && bib.setSuche('')}
            w={240}
          />
        )}
      </Group>
      {bib.eintraege && eigene.length === 0 ? (
        <Alert color="gray">Noch keine eigene Vokabelliste für {languageLabel}. „Neue Liste“ legt die erste an.</Alert>
      ) : (
        <Stack gap="xs">
          {treffer.map((l) => {
            const grau = l.entries.filter((e) => e.grey).length
            return (
              <Card
                key={l.id}
                withBorder
                padding="sm"
                data-liste={l.name}
                style={bib.neuId === l.id ? { borderColor: 'var(--mantine-color-teal-5)' } : undefined}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Oeffnen name={l.name} onOeffnen={() => onBearbeiten(l)}>
                    <Group gap="xs">
                      <Text fw={600} truncate>
                        {l.name}
                      </Text>
                      <Badge variant="light">
                        {l.entries.length} {l.entries.length === 1 ? 'Vokabel' : 'Vokabeln'}
                      </Badge>
                      {grau > 0 && (
                        <Badge variant="light" color="gray" tt="none" title={ZUSATZ}>
                          {grau} grau
                        </Badge>
                      )}
                      {l.grade ? <Badge variant="outline">Klasse {l.grade}</Badge> : null}
                      {bib.neuId === l.id && (
                        <Badge size="sm" variant="light" color="teal">
                          neu
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {dateFormat.format(new Date(l.updatedAt))}
                      {l.source ? ` · ${l.source}` : ''}
                    </Text>
                  </Oeffnen>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconSparkles size={14} />}
                      disabled={!l.entries.length}
                      onClick={() => void testAusListe(l.id)}
                    >
                      Test aus dieser Liste
                    </Button>
                    <Button size="xs" onClick={() => onBearbeiten(l)}>
                      Bearbeiten
                    </Button>
                    <EintragMenue
                      bib={bib}
                      eintrag={l}
                      vorne={
                        <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => onBearbeiten(l)}>
                          Vokabeln bearbeiten
                        </Menu.Item>
                      }
                    />
                  </Group>
                </Group>
                <EintragRueckfragen bib={bib} eintrag={l} />
              </Card>
            )
          })}
          {bib.eintraege && eigene.length > 0 && treffer.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="md">
              Nichts gefunden. Anderen Suchbegriff versuchen.
            </Text>
          )}
        </Stack>
      )}
    </>
  )
}

const FILTER_KEY = 'vokabellisten-reihenfilter'
const SORT_KEY = 'vokabellisten-reihensortierung'

function lies<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function merke(key: string, wert: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(wert))
  } catch {
    // ohne lokalen Speicher gilt die Wahl nur für diese Sitzung
  }
}

/** Filter und Sortierung der Schulbücher (Paket 15) – gemerkt; Regeln in src/shared/lehrwerkReihe.ts */
interface ReihenFilter {
  optionen: Record<FilterFeld, string[]>
  wahl: FilterWahl
  setzeFilter: (feld: FilterFeld, werte: string[]) => void
  sortierungen: ReihenSortierung[]
  sortierung: ReihenSortierung
  setSortierung: (s: ReihenSortierung) => void
  /** Die Bücher, die zur (wirksamen) Wahl passen */
  gezeigt: TextbookMeta[]
}

function useReihenFilter(buecher: TextbookMeta[], sprache: string): ReihenFilter {
  const [filterJeFach, setFilterJeFach] = useState<Record<string, Partial<FilterWahl>>>(() => lies(FILTER_KEY, {}))
  const [sortWahl, setSortWahl] = useState<ReihenSortierung>(() => lies(SORT_KEY, 'reihe'))
  const optionen = filterOptionen(buecher)
  // Ausgeblendete Filter und verschwundene Werte gelten als „alle" – nichts filtert still weiter
  const wahl = wirksamerFilter(filterJeFach[sprache], optionen)
  const sortierungen = sinnvolleSortierungen(buecher)
  return {
    optionen,
    wahl,
    setzeFilter: (feld, werte) => {
      const neu = { ...filterJeFach, [sprache]: { ...wahl, [feld]: werte } }
      setFilterJeFach(neu)
      merke(FILTER_KEY, neu)
    },
    sortierungen,
    sortierung: wirksameSortierung(sortWahl, sortierungen),
    setSortierung: (v) => {
      setSortWahl(v)
      merke(SORT_KEY, v)
    },
    gezeigt: filtere(buecher, wahl)
  }
}

/**
 * Die Filter der Filterzeile (nach dem Fach): Verlag – Reihe – Landesausgabe – Ausgabe, jeweils
 * Mehrfachauswahl. Nur die, die unter den Büchern des Fachs etwas unterscheiden.
 */
function reihenFilterFelder({ reihen }: { reihen: ReihenFilter }): React.JSX.Element[] {
  return FILTER_FELDER.filter(({ feld }) => reihen.optionen[feld].length > 0).map(({ feld, label }) => (
    <MultiSelect
      key={feld}
      label={label}
      placeholder={reihen.wahl[feld].length ? '' : 'alle'}
      data={reihen.optionen[feld]}
      value={reihen.wahl[feld]}
      onChange={(v) => reihen.setzeFilter(feld, v)}
      clearable
      data-reihen-filter={feld}
    />
  ))
}

/**
 * „Schulbücher" der Übersicht, nach Reihen geordnet (Paket 15, Wunsch der Lehrkraft vom 26.09.2026).
 *
 * Vorher stand jeder Band als eigene Zeile da; mit mehreren Reihen, Verlagen und Ausgaben wird
 * das unübersichtlich. Jetzt: je Reihe + Landesausgabe + Ausgabe + Verlag eine aufklappbare Karte
 * („Green Line · Niedersachsen · Ausgabe ab 2021 · Klett – 7 Bände"), ANFANGS ZUGEKLAPPT;
 * aufgeklappt die Bände wie bisher. Die Sortierung „Klassenstufe" zeigt eine flache Liste über
 * alle Reihen, jeder Band mit seiner Reihe als Kennzeichen.
 *
 * Filter (Verlag, Reihe, Landesausgabe, Ausgabe – nach dem Fach in der Karte darüber) erscheinen
 * nur, wenn sie unter den Büchern des Fachs etwas unterscheiden; ebenso bietet die Sortierung nur,
 * was etwas bewirkt. Die Wahl wird gemerkt (Filter je Fach) – eine gemerkte Wahl, deren Filter
 * gerade ausgeblendet ist, gilt als „alle" (Regeln in src/shared/lehrwerkReihe.ts).
 */
function Schulbuecher({
  buecher,
  andere,
  languageLabel,
  reihen,
  offen,
  onOffen,
  onBearbeiten
}: {
  buecher: TextbookMeta[]
  /** Bände, die nicht zur gewählten Lerngruppe passen (Kennzeichen „andere Lerngruppe") */
  andere: TextbookMeta[]
  languageLabel: string
  reihen: ReihenFilter
  offen: string[]
  onOffen: (o: string[]) => void
  onBearbeiten: (id: string) => void
}): React.JSX.Element {
  const { sortierungen, sortierung, setSortierung, gezeigt } = reihen
  const band = (b: TextbookMeta, mitReihe: boolean): React.JSX.Element => (
    <Card key={b.id} withBorder padding="sm" data-band={b.name}>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <IconBook2 size={16} />
            <Text fw={600} truncate>
              {b.name}
            </Text>
            <Badge variant="light">{b.entryCount} Vokabeln</Badge>
            {b.grade ? <Badge variant="outline">Klasse {b.grade}</Badge> : null}
            {mitReihe && (
              <Badge variant="light" color="gray" tt="none" data-reihen-kennzeichen>
                {reiheTitel(b)}
              </Badge>
            )}
            {!b.builtIn && (
              <Badge variant="light" color="teal">
                eigene Fassung
              </Badge>
            )}
            {andere.includes(b) && (
              <Badge variant="outline" color="gray">
                andere Lerngruppe
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {b.units.length} Units{b.band ? ` · Band ${b.band}` : ''}
          </Text>
        </div>
        <Button size="xs" onClick={() => onBearbeiten(b.id)}>
          Vokabeln bearbeiten
        </Button>
      </Group>
    </Card>
  )

  return (
    <>
      <Group justify="space-between" mb="xs" align="flex-end" wrap="wrap" gap="xs">
        <Title order={4}>Schulbücher</Title>
        {sortierungen.length > 0 && (
          <Select
            size="xs"
            w={210}
            aria-label="Schulbücher sortieren"
            data={REIHEN_SORTIERUNGEN.filter((s) => sortierungen.includes(s.value))}
            value={sortierung}
            allowDeselect={false}
            onChange={(v) => v && setSortierung(v as ReihenSortierung)}
          />
        )}
      </Group>
      {buecher.length === 0 ? (
        <Alert color="gray" mb="md">
          Für {languageLabel} ist noch kein Lehrwerk hinterlegt. Über „Neue Liste" lässt sich eine Vokabelliste aus Fotos oder Dateien anlegen.
        </Alert>
      ) : gezeigt.length === 0 ? (
        <Text c="dimmed" size="sm" ta="center" py="md" mb="md">
          Kein Schulbuch passt zu diesen Filtern.
        </Text>
      ) : sortierung === 'klasse' ? (
        <Stack gap="xs" mb="md" data-reihen-flach>
          {nachKlasse(gezeigt).map((b) => band(b, true))}
        </Stack>
      ) : (
        <Stack gap="xs" mb="md">
          {gruppiereReihen(gezeigt, sortierung).map((g) => {
            const auf = offen.includes(g.schluessel)
            return (
              <Card key={g.schluessel} withBorder padding="sm" data-reihe={g.titel} data-offen={auf}>
                <UnstyledButton
                  onClick={() => onOffen(auf ? offen.filter((x) => x !== g.schluessel) : [...offen, g.schluessel])}
                  aria-expanded={auf}
                  aria-label={`${g.titel} ${auf ? 'zuklappen' : 'aufklappen'}`}
                  style={{ width: '100%' }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <IconChevronRight size={16} style={{ transform: auf ? 'rotate(90deg)' : undefined, transition: 'transform 150ms', flexShrink: 0 }} />
                    <IconBooks size={18} style={{ flexShrink: 0 }} />
                    <Text fw={600} truncate>
                      {g.titel}
                    </Text>
                    <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                      – {g.baende.length === 1 ? '1 Band' : `${g.baende.length} Bände`}
                    </Text>
                  </Group>
                </UnstyledButton>
                <Collapse expanded={auf}>
                  <Stack gap="xs" mt="sm">
                    {g.baende.map((b) => band(b, false))}
                  </Stack>
                </Collapse>
              </Card>
            )
          })}
        </Stack>
      )}
    </>
  )
}
