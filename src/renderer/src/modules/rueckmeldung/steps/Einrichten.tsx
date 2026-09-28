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
import { IconFileText, IconKeyboard, IconMessageCheck, IconPhoto, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import DropZone from '../../../shared/components/DropZone'
import Formularfuss from '../../../shared/components/Formularfuss'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import { extractContent, MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { newId } from '../../vokabeltest/model/random'
import { notifyError } from '../../../shared/util'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import { rueckmeldungenErzeugen } from '../auftrag'
import { ART_TITEL, ladeGrundlage, materialListe, type MaterialEintrag } from '../generation'
import { naechstesKuerzel, type Abgabe } from '../model/types'
import { useRueckmeldung } from '../store'

/**
 * Schritt 1 der Rückmeldung (Großprogramm 0.4, F3): Lerngruppe, Grundlage (gespeichertes
 * Material oder eigene Aufgabe), Schwerpunkt und die Abgaben der Lernenden.
 */
export default function Einrichten(): React.JSX.Element | null {
  const { dok: r, update, docId } = useRueckmeldung()
  const [material, setMaterial] = useState<MaterialEintrag[]>([])
  const [lese, setLese] = useState<string | null>(null)
  const [quelle, setQuelle] = useState<'material' | 'frei'>(r?.grundlage.art === 'frei' ? 'frei' : 'material')
  useEffect(() => {
    void materialListe().then(setMaterial)
  }, [])
  if (!r) return null

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
        }
      })
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const offen = r.abgaben.filter((a) => !a.bogen && (a.text.trim() || a.bilder.length)).length
  const grund = !r.grundlage.aufgaben.trim() ? 'Grundlage fehlt' : !r.abgaben.length ? 'Noch keine Abgabe' : !offen ? 'Alle Abgaben haben einen Bogen' : ''

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea style={{ flex: 1 }}>
        <Container size="xl" py="lg">
          <Title order={2}>Rückmeldung ohne Note</Title>
          <Text c="dimmed" mb="md">
            Zu jeder Abgabe ein Bogen: was schon gelingt, die nächsten Schritte, Kriterien mit Einschätzung in Worten. Namen bleiben auf diesem Rechner – die KI
            sieht nur Kürzel (S1, S2 …).
          </Text>
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
                    <Select
                      label="Material"
                      placeholder={
                        material.length ? 'Arbeitsblatt, Klassenarbeit, Lernzielkontrolle oder Grammatiktest wählen' : 'Noch kein Material gespeichert'
                      }
                      searchable
                      data={Object.entries(ART_TITEL)
                        .map(([art, titel]) => ({
                          group: titel,
                          items: material
                            .filter((m) => m.art === art)
                            .map((m) => ({ value: `${m.art}|${m.id}`, label: `${m.name}${m.fach ? ` (${m.fach})` : ''}` }))
                        }))
                        .filter((g) => g.items.length)}
                      value={r.grundlage.docId ? `${r.grundlage.art}|${r.grundlage.docId}` : null}
                      onChange={(v) => void waehleMaterial(v)}
                      data-rm-material
                    />
                  ) : (
                    <TextInput
                      label="Titel der Aufgabe"
                      placeholder="z. B. Leserbrief zum Handyverbot"
                      value={r.grundlage.titel}
                      onChange={(e) => {
                        const x = e.currentTarget.value
                        update((d) => (d.grundlage.titel = x), 'rm-titel')
                      }}
                    />
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
                    onChange={(v) => v && update((d) => ((d.meta.subjectId = v), (d.meta.subjectLabel = subjectById(v).label)))}
                    allowDeselect={false}
                    searchable
                  />
                  <Select
                    label="Jahrgang"
                    data={Array.from({ length: 13 }, (_, i) => ({ value: String(i + 1), label: `Klasse ${i + 1}` }))}
                    value={String(r.meta.grade)}
                    onChange={(v) => v && update((d) => (d.meta.grade = Number(v)))}
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
              </Card>
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
      <Formularfuss grund={grund}>
        <Button leftSection={<IconMessageCheck size={16} />} disabled={Boolean(grund)} onClick={() => rueckmeldungenErzeugen(r, docId)} data-rm-schreiben>
          {offen > 1 ? `${offen} Rückmeldungen schreiben` : 'Rückmeldung schreiben'}
        </Button>
      </Formularfuss>
    </Stack>
  )
}
