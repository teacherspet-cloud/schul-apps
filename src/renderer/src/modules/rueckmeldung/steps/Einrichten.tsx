import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { ANREDE_OPTIONEN, type Anrede } from '../render/texte'
import {
  IconArrowBackUp,
  IconFileText,
  IconFolderOpen,
  IconHeartHandshake,
  IconKeyboard,
  IconLanguage,
  IconMessageCheck,
  IconPhoto,
  IconScissors,
  IconTrash
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { FAMILIENSPRACHEN } from '../../../shared/familiensprachen'
import { ladeGedaechtnis, speichereGedaechtnis } from '../ablagen'
import { einstufungVon, hatForm } from '../art'
import { ausgleichKurz, gemerkterAusgleich, hatAusgleich, merkeAusgleich, type AusgleichGedaechtnis } from '../nachteilsausgleich'
import ArtKarte from './ArtKarte'
import AusgleichFenster from './AusgleichFenster'
import TabelleKarte from './TabelleKarte'
import TeileKarte from './TeileKarte'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import DropZone from '../../../shared/components/DropZone'
import Formularfuss from '../../../shared/components/Formularfuss'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { newId } from '../../vokabeltest/model/random'
import { notifyError } from '../../../shared/util'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import { abgabenTrennen, aufgabeAusDateien, erwartungAusDateien, rueckmeldungenErzeugen } from '../auftrag'
import { kiTrennungNoetig, trenneNachAufgabe, trennHinweis, trennungAnwenden, trennungZurueck } from '../abgabeTrennen'
import { deutschMoeglich, pruefeZielsprache, zielsprachHinweis } from '../sprachErkennung'
import { ART_TITEL, ladeGrundlage, type MaterialEintrag } from '../generation'
import MaterialWahl from '../../../shared/components/MaterialWahl'
import { naechstesKuerzel, type Abgabe, type Nachteilsausgleich } from '../model/types'
import { useRueckmeldung } from '../store'

/**
 * Schritt 1 der Rückmeldung (Großprogramm 0.4, F3): Lerngruppe, Grundlage (gespeichertes
 * Material oder eigene Aufgabe), Schwerpunkt und die Abgaben der Lernenden.
 */
export default function Einrichten(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const [lese, setLese] = useState<string | null>(null)
  const [leseAufgabe, setLeseAufgabe] = useState<string | null>(null)
  const [leseErwartung, setLeseErwartung] = useState<string | null>(null)
  const [wahlOffen, setWahlOffen] = useState(false)
  const [quelle, setQuelle] = useState<'material' | 'frei'>(r?.grundlage.art === 'frei' ? 'frei' : 'material')
  // Nachteilsausgleich (29.09.2026): Fenster je Abgabe und die lokal gemerkten Ausgleiche
  // Die Kennung bleibt beim Schließen stehen – sonst verlöre das Fenster während der Ausblendung seinen Inhalt
  const [ausgleichFuer, setAusgleichFuer] = useState<string | null>(null)
  const [ausgleichOffen, setAusgleichOffen] = useState(false)
  const [gedaechtnis, setGedaechtnis] = useState<AusgleichGedaechtnis | null>(null)
  useEffect(() => {
    void ladeGedaechtnis().then(setGedaechtnis)
  }, [])
  if (!r) return null

  const ausgleichSpeichern = (id: string, a: Nachteilsausgleich | undefined, merken: boolean): void => {
    const abgabe = r.abgaben.find((x) => x.id === id)
    update((d) => {
      const x = d.abgaben.find((y) => y.id === id)
      if (!x) return
      if (a) x.ausgleich = a
      else delete x.ausgleich
    })
    if (merken && abgabe?.name.trim()) {
      const neu = merkeAusgleich(gedaechtnis, abgabe.name, a ?? null)
      setGedaechtnis(neu)
      void speichereGedaechtnis(neu).catch(notifyError)
    }
    setAusgleichOffen(false)
  }

  const waehleMaterial = async (wert: string | null): Promise<void> => {
    if (!wert) return
    const [art, id] = wert.split('|') as [MaterialEintrag['art'], string]
    try {
      const { grundlage, fach } = await ladeGrundlage(art, id)
      update((d) => {
        d.grundlage = grundlage
        if (fach.id) {
          d.meta.subjectId = fach.id
          d.meta.subjectLabel = fach.label || subjectById(fach.id).label
          d.meta.grade = fach.grade || d.meta.grade
        }
      })
    } catch (e) {
      notifyError(e, 'Das Material konnte nicht geladen werden')
    }
  }

  /** Aufgabenblatt bzw. Lösung lesen, Datenschutz prüfen, dann den Auftrag starten */
  const materialLesen = async (files: File[], ziel: 'aufgabe' | 'erwartung'): Promise<void> => {
    const melde = ziel === 'aufgabe' ? setLeseAufgabe : setLeseErwartung
    try {
      const gelesen: HochladeInhalt[] = []
      for (const f of files) {
        melde(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (m) => melde(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 6 })
        gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
      }
      melde(null)
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const aktuell = useRueckmeldung.getState().dok
      if (!aktuell) return
      if (ziel === 'aufgabe') aufgabeAusDateien(aktuell, docId, geprueft)
      else erwartungAusDateien(aktuell, docId, geprueft)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      melde(null)
    }
  }

  /**
   * Schülertext vom Aufgabentext trennen (29.09.2026, Fehlerbericht der Lehrkraft): erst Abgleich mit
   * der Aufgabe, dann – bei Verdacht auf weitere Aufgabenteile oder ohne Aufgabe – die KI. Beim
   * Knopf („erneut") fragt die App die KI auch dann, wenn der Abgleich nichts gefunden hat.
   */
  const abtrennen = (ids: string[], erneut = false): void => {
    const kiIds: string[] = []
    update((d) => {
      d.abgaben.forEach((x, j) => {
        if (!ids.includes(x.id) || !x.text.trim()) return
        const e = trenneNachAufgabe(x.text, d.grundlage.aufgaben)
        d.abgaben[j] = trennungAnwenden(x, e, 'abgleich')
        if (kiTrennungNoetig(e, d.grundlage.aufgaben) || (erneut && !e.zeilen)) kiIds.push(x.id)
      })
    })
    const aktuell = useRueckmeldung.getState().dok
    if (aktuell && kiIds.length) abgabenTrennen(aktuell, docId, kiIds)
  }

  const dateienLesen = async (files: File[]): Promise<void> => {
    try {
      const gelesen: HochladeInhalt[] = []
      for (const f of files) {
        setLese(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (m) => setLese(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: 4 })
        gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
      }
      setLese(null)
      // Datenschutz: Hinweis und Namen ersetzen, bevor etwas zur KI geht
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const neueIds: string[] = []
      update((d) => {
        for (const g of geprueft) {
          const neu: Abgabe = {
            id: newId(),
            kuerzel: naechstesKuerzel(d.abgaben),
            name: '',
            dateiname: g.fileName,
            // Gescannte PDFs ohne Textebene: Die Seiten werden übertragen
            text: g.text.trim(),
            bilder: g.text.trim() ? [] : (g.pageImages ?? []),
            ...(g.pseudonyme?.length ? { pseudonyme: g.pseudonyme } : {})
          }
          d.abgaben.push(neu)
          if (neu.text) neueIds.push(neu.id)
        }
      })
      // Aufgabenblatt und Material aus Word/PDF-Abgaben abtrennen – rückgängig machbar
      if (neueIds.length) abtrennen(neueIds)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const offen = r.abgaben.filter((a) => !a.bogen && (a.text.trim() || a.bilder.length)).length
  const mitText = r.abgaben.filter((a) => a.text.trim() && !a.bilder.length)
  // Deutsch statt Zielsprache (29.09.2026): Warnung schon an der Abgabe
  const deutschErlaubt = deutschMoeglich(r.grundlage)
  const sprachWarnung = (a: Abgabe): string | null => zielsprachHinweis(pruefeZielsprache(a.text, r.meta.subjectId), r.meta.subjectLabel, deutschErlaubt, false)
  const grund = !r.grundlage.aufgaben.trim()
    ? 'Grundlage fehlt'
    : !r.abgaben.length
      ? 'Noch keine Abgabe'
      : hatForm(r.meta, 'tabelle') && !r.tabelle?.kriterien.length
        ? 'Bewertungstabelle fehlt'
        : !offen
          ? 'Alle Abgaben haben einen Bogen'
          : ''

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea style={{ flex: 1 }}>
        <Container size="xl" py="lg">
          <Title order={2} mb="md">
            {einstufungVon(r.meta) === 'keine' ? 'Rückmeldung ohne Note' : 'Rückmeldung mit Einstufung'}
          </Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack>
              <Card withBorder>
                <Title order={4} mb="sm">
                  Grundlage
                </Title>
                <Stack gap="sm">
                  <SegmentedControl
                    data={[
                      { value: 'material', label: 'Aus gespeichertem Material' },
                      { value: 'frei', label: 'Eigene Aufgabe' }
                    ]}
                    value={quelle}
                    onChange={(v) => {
                      setQuelle(v as 'material' | 'frei')
                      if (v === 'frei')
                        update(
                          (d) =>
                            (d.grundlage = {
                              art: 'frei',
                              titel: d.grundlage.art === 'frei' ? d.grundlage.titel : '',
                              aufgaben: d.grundlage.art === 'frei' ? d.grundlage.aufgaben : ''
                            })
                        )
                    }}
                  />
                  {quelle === 'material' ? (
                    <div>
                      <Text size="sm" fw={500} mb={4}>
                        Material
                      </Text>
                      <Button
                        variant="default"
                        fullWidth
                        justify="space-between"
                        rightSection={<IconFolderOpen size={16} />}
                        onClick={() => setWahlOffen(true)}
                        data-rm-material
                      >
                        {r.grundlage.docId && r.grundlage.art !== 'frei'
                          ? `${r.grundlage.titel} · ${ART_TITEL[r.grundlage.art]}`
                          : 'Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Grammatiktest oder Vokabeltest wählen …'}
                      </Button>
                      <MaterialWahl
                        offen={wahlOffen}
                        schliessen={() => setWahlOffen(false)}
                        programme={Object.keys(ART_TITEL)}
                        gewaehlt={r.grundlage.docId ? `${r.grundlage.art}:${r.grundlage.docId}` : null}
                        onWahl={(programm, id) => void waehleMaterial(`${programm}|${id}`)}
                      />
                    </div>
                  ) : (
                    <>
                      <TextInput
                        label="Titel der Aufgabe"
                        placeholder="z. B. Leserbrief zum Handyverbot"
                        value={r.grundlage.titel}
                        onChange={(e) => {
                          const x = e.currentTarget.value
                          update((d) => (d.grundlage.titel = x), 'rm-titel')
                        }}
                      />
                      <DropZone
                        onFiles={(f) => void materialLesen(f, 'aufgabe')}
                        accept={MATERIAL_ACCEPT}
                        title={leseAufgabe ?? 'Aufgabenblatt hierher ziehen'}
                        hint="Foto, Scan, PDF, Word oder Text – die KI übernimmt Aufgabe und nötiges Material, den Erwartungshorizont und erkennt Fach und Jahrgang."
                        loading={Boolean(leseAufgabe)}
                        minHeight={70}
                      />
                    </>
                  )}
                  <Textarea
                    label={quelle === 'material' ? 'Aufgaben (aus dem Material, anpassbar)' : 'Aufgabenstellung'}
                    autosize
                    minRows={3}
                    maxRows={10}
                    value={r.grundlage.aufgaben}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      update((d) => (d.grundlage.aufgaben = x), 'rm-aufgaben')
                    }}
                    data-rm-aufgaben
                  />
                  {quelle === 'frei' && (
                    <DropZone
                      onFiles={(f) => void materialLesen(f, 'erwartung')}
                      accept={MATERIAL_ACCEPT}
                      title={leseErwartung ?? 'Lösung oder Erwartungshorizont hierher ziehen (optional)'}
                      hint="Wird übertragen und ersetzt den Text darunter"
                      loading={Boolean(leseErwartung)}
                      minHeight={50}
                    />
                  )}
                  <Textarea
                    label="Erwartungshorizont (optional)"
                    autosize
                    minRows={2}
                    maxRows={8}
                    value={r.grundlage.erwartung ?? ''}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      update((d) => (d.grundlage.erwartung = x), 'rm-erwartung')
                    }}
                  />
                  <Textarea
                    label="Schwerpunkt der Rückmeldung (optional)"
                    placeholder="z. B. Aufbau der Argumentation, Zeitformen, Belege aus dem Text"
                    autosize
                    minRows={1}
                    value={r.meta.schwerpunkt}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      update((d) => (d.meta.schwerpunkt = x), 'rm-schwerpunkt')
                    }}
                  />
                </Stack>
              </Card>
              <Card withBorder>
                <Title order={4} mb="sm">
                  Lerngruppe
                </Title>
                <Group grow align="flex-start">
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
                    data={Array.from({ length: 13 }, (_, i) => ({ value: String(i + 1), label: `Klasse ${i + 1}` }))}
                    value={String(r.meta.grade)}
                    onChange={(v) => v && update((d) => ((d.meta.grade = Number(v)), delete d.meta.erkannt))}
                    allowDeselect={false}
                  />
                  <Select
                    label="Anrede"
                    data={ANREDE_OPTIONEN}
                    value={r.meta.anrede}
                    onChange={(v) => v && update((d) => (d.meta.anrede = v as Anrede))}
                    allowDeselect={false}
                  />
                </Group>
                {r.meta.erkannt && (
                  <Text size="xs" c="teal" mt={6} data-rm-erkannt>
                    {r.meta.erkannt}
                  </Text>
                )}
              </Card>
              <ArtKarte />
              {hatForm(r.meta, 'tabelle') && <TabelleKarte />}
              <TeileKarte r={r} docId={docId} update={update} />
            </Stack>
            <Card withBorder>
              <Title order={4} mb="sm">
                Abgaben
              </Title>
              <Stack gap="sm">
                <DropZone
                  onFiles={(f) => void dateienLesen(f)}
                  accept={MATERIAL_ACCEPT}
                  title={lese ?? 'Abgaben hierher ziehen'}
                  hint="Foto, Scan, PDF, Word oder Textdatei – je Datei eine Schülerin oder ein Schüler. Namen auf Fotos vorher schwärzen."
                  loading={Boolean(lese)}
                  minHeight={90}
                />
                <Group justify="flex-end">
                  {mitText.length > 1 && (
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconScissors size={14} />}
                      onClick={() => abtrennen(mitText.map((a) => a.id))}
                      data-rm-trennen-alle
                    >
                      Aufgabentext aus allen Abgaben abtrennen
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconKeyboard size={14} />}
                    onClick={() =>
                      update((d) => d.abgaben.push({ id: newId(), kuerzel: naechstesKuerzel(d.abgaben), name: '', dateiname: 'getippt', text: '', bilder: [] }))
                    }
                    data-rm-eintippen
                  >
                    Abgabe eintippen
                  </Button>
                </Group>
                {r.abgaben.map((a, i) => (
                  <Card key={a.id} withBorder padding="xs">
                    <Group gap="xs" wrap="nowrap" align="flex-start">
                      <Badge variant="filled" mt={6}>
                        {a.kuerzel}
                      </Badge>
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Group gap="xs" wrap="nowrap">
                          <TextInput
                            size="xs"
                            style={{ flex: 1 }}
                            placeholder="Name (bleibt auf diesem Rechner)"
                            value={a.name}
                            onChange={(e) => {
                              const x = e.currentTarget.value
                              update((d) => (d.abgaben[i].name = x), `rm-name-${a.id}`)
                            }}
                            aria-label={`Name zu ${a.kuerzel}`}
                          />
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {a.bilder.length ? <IconPhoto size={12} /> : <IconFileText size={12} />} {a.dateiname}
                            {a.bogen ? ' · Bogen fertig' : ''}
                          </Text>
                          <Tooltip label={hatAusgleich(a.ausgleich) ? 'Nachteilsausgleich ändern' : 'Nachteilsausgleich'}>
                            <ActionIcon
                              size="sm"
                              variant={hatAusgleich(a.ausgleich) ? 'light' : 'subtle'}
                              color={hatAusgleich(a.ausgleich) ? 'grape' : 'gray'}
                              aria-label={`Nachteilsausgleich für ${a.kuerzel}`}
                              onClick={() => {
                                setAusgleichFuer(a.id)
                                setAusgleichOffen(true)
                              }}
                              data-rm-ausgleich-knopf
                            >
                              <IconHeartHandshake size={14} />
                            </ActionIcon>
                          </Tooltip>
                          {hatAusgleich(a.ausgleich) && (
                            <Badge size="xs" color="grape" variant="light">
                              {ausgleichKurz(a.ausgleich)}
                            </Badge>
                          )}
                          {a.text.trim() && !a.bilder.length && (
                            <Tooltip label="Aufgabenstellung, Material und Kopfzeilen aus dem Text abtrennen">
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                aria-label={`Aufgabentext aus ${a.kuerzel} abtrennen`}
                                onClick={() => abtrennen([a.id], true)}
                                data-rm-trennen
                              >
                                <IconScissors size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          <Tooltip label="Abgabe entfernen">
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              aria-label="Abgabe entfernen"
                              onClick={() => update((d) => d.abgaben.splice(i, 1))}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                        {!hatAusgleich(a.ausgleich) && gemerkterAusgleich(gedaechtnis, a.name) && (
                          <Group gap={6}>
                            <Text size="xs" c="grape">
                              Für „{a.name.trim()}" ist ein Nachteilsausgleich gemerkt.
                            </Text>
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="grape"
                              onClick={() =>
                                update((d) => {
                                  const g = gemerkterAusgleich(gedaechtnis, a.name)
                                  if (g) d.abgaben[i].ausgleich = g
                                })
                              }
                              data-rm-ausgleich-uebernehmen
                            >
                              Übernehmen
                            </Button>
                          </Group>
                        )}
                        {r.meta.elternfassung && (
                          <Select
                            size="xs"
                            placeholder="Familiensprache für die Elternfassung (optional)"
                            data={FAMILIENSPRACHEN.map((f) => ({ value: f.code, label: `${f.name} – ${f.eigen}` }))}
                            value={a.familiensprache ?? null}
                            onChange={(v) =>
                              update((d) => {
                                if (v) d.abgaben[i].familiensprache = v
                                else delete d.abgaben[i].familiensprache
                              })
                            }
                            clearable
                            searchable
                            aria-label={`Familiensprache zu ${a.kuerzel}`}
                          />
                        )}
                        {!a.bilder.length && (
                          <Textarea
                            size="xs"
                            autosize
                            minRows={2}
                            maxRows={6}
                            placeholder="Text der Abgabe"
                            value={a.text}
                            onChange={(e) => {
                              const x = e.currentTarget.value
                              update((d) => (d.abgaben[i].text = x), `rm-text-${a.id}`)
                            }}
                            aria-label={`Text von ${a.kuerzel}`}
                          />
                        )}
                        {trennHinweis(a) && (
                          <Group gap={6} data-rm-getrennt>
                            <Text size="xs" c="teal">
                              {trennHinweis(a)}
                            </Text>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="teal"
                              leftSection={<IconArrowBackUp size={12} />}
                              onClick={() => update((d) => (d.abgaben[i] = trennungZurueck(d.abgaben[i])))}
                              data-rm-trennen-zurueck
                            >
                              Rückgängig
                            </Button>
                          </Group>
                        )}
                        {a.text.trim() && sprachWarnung(a) && (
                          <Group gap={6} wrap="nowrap" data-rm-sprachwarnung>
                            <IconLanguage size={14} color="var(--mantine-color-orange-6)" />
                            <Text size="xs" c="orange">
                              {sprachWarnung(a)}
                            </Text>
                          </Group>
                        )}
                        {a.bilder.length > 0 && (
                          <Text size="xs" c="dimmed">
                            {a.bilder.length} Seite{a.bilder.length > 1 ? 'n' : ''} – der Text wird beim Schreiben der Rückmeldung übertragen.
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Card>
          </SimpleGrid>
        </Container>
      </ScrollArea>
      <AusgleichFenster
        abgabe={r.abgaben.find((a) => a.id === ausgleichFuer) ?? null}
        meta={r.meta}
        offen={ausgleichOffen && Boolean(ausgleichFuer)}
        schliessen={() => setAusgleichOffen(false)}
        speichern={(a, merken) => ausgleichFuer && ausgleichSpeichern(ausgleichFuer, a, merken)}
      />
      <Formularfuss grund={grund}>
        <Button leftSection={<IconMessageCheck size={16} />} disabled={Boolean(grund)} onClick={() => rueckmeldungenErzeugen(r, docId)} data-rm-schreiben>
          {offen > 1 ? `${offen} Rückmeldungen schreiben` : 'Rückmeldung schreiben'}
        </Button>
      </Formularfuss>
    </Stack>
  )
}
