/**
 * Schritt 2 der Rückmeldung: Abgaben (23.10.2026, Neugestaltung nach Multiple Choice mit der
 * Lehrkraft). Oben zwei Kacheln für die beiden Wege – hochladen bzw. eintippen oder die
 * Lernenden reichen online ein (nur mit dem Schul-Apps-Server) –, darunter EINE Liste aller
 * Abgaben. Jede Abgabe ist eine Zeile; ihr Text klappt erst beim Antippen auf (eingetippte
 * Abgaben stehen offen, dort wird ja geschrieben).
 */
import { ActionIcon, Badge, Button, Card, Collapse, Container, Group, Image, Modal, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core'
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowMerge,
  IconArrowRight,
  IconRotate,
  IconRotateClockwise,
  IconChevronDown,
  IconChevronRight,
  IconDeviceMobile,
  IconFileText,
  IconHeartHandshake,
  IconKeyboard,
  IconLanguage,
  IconMessageCheck,
  IconPhoto,
  IconScissors,
  IconTrash,
  IconUpload
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { AlleOptionen } from '../../../shared/components/NurExperte'
import DropZone from '../../../shared/components/DropZone'
import Formularfuss from '../../../shared/components/Formularfuss'
import { FAMILIENSPRACHEN } from '../../../shared/familiensprachen'
import { MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { aufServer } from '../../../shared/plattform'
import { notifyError } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { abgabenAnlegen, abgabenLesen, aufgabentextAbtrennen, mitVorherigerZusammenlegen, nurBilder, seiteDrehen, seitenTrennen } from '../abgabeAnlegen'
import type { HochladeInhalt } from '../../../shared/datenschutz'
import { klartext, ohneKiTest, trennHinweis, trennungZurueck } from '../abgabeTrennen'
import { ladeGedaechtnis, speichereGedaechtnis } from '../ablagen'
import { hatForm } from '../art'
import { rueckmeldungenErzeugen } from '../auftrag'
import { antwortSpracheVon } from '../generation'
import { naechstesKuerzel, hatInhalt, type Abgabe, type Nachteilsausgleich } from '../model/types'
import { ausgleichKurz, gemerkterAusgleich, hatAusgleich, merkeAusgleich, type AusgleichGedaechtnis } from '../nachteilsausgleich'
import { deutschMoeglich, pruefeZielsprache, zielsprachHinweis } from '../sprachErkennung'
import { useRueckmeldung } from '../store'
import AusgleichFenster from './AusgleichFenster'
import LernendeKarte from './LernendeKarte'
import { Kachel } from './MaterialSchritt'
import './einrichten.css'

/** Je Dokument frisch – sonst blieben „Eigene Aufgabe" bzw. aufgeklappte Abgaben nach „Neue Rückmeldung" stehen */
export default function AbgabenSchritt(): React.JSX.Element {
  const docId = useRueckmeldung((s) => s.docId)
  return <AbgabenSchrittInhalt key={docId} />
}

function AbgabenSchrittInhalt(): React.JSX.Element | null {
  const { dok: r, update, docId, setStep } = useRueckmeldung()
  const server = aufServer()
  // Online stand vorn, wenn schon Abgaben von dort kamen
  const [weg, setWeg] = useState<'hochladen' | 'online'>(() =>
    server && r?.abgaben.some((a) => a.dateiname.startsWith('online:')) ? 'online' : 'hochladen'
  )
  const [lese, setLese] = useState<string | null>(null)
  // Aufgeklappte Abgaben; ohne Eintrag gilt: eingetippte offen, übrige zu
  const [auf, setAuf] = useState<Record<string, boolean>>({})
  // Nachteilsausgleich (29.09.2026): Fenster je Abgabe und die lokal gemerkten Ausgleiche
  // Die Kennung bleibt beim Schließen stehen – sonst verlöre das Fenster während der Ausblendung seinen Inhalt
  const [ausgleichFuer, setAusgleichFuer] = useState<string | null>(null)
  const [ausgleichOffen, setAusgleichOffen] = useState(false)
  const [gedaechtnis, setGedaechtnis] = useState<AusgleichGedaechtnis | null>(null)
  useEffect(() => {
    void ladeGedaechtnis().then(setGedaechtnis)
  }, [])
  // Ältere Abgaben aus Word stehen noch als HTML da (vor 29.09.2026): einmal in Text umwandeln, ohne KI-Test
  const mitHtml = r?.abgaben.some((a) => klartext(a.text) !== a.text) ?? false
  useEffect(() => {
    if (!mitHtml) return
    update((d) => {
      for (const a of d.abgaben) {
        const t = ohneKiTest(klartext(a.text)).text
        if (t !== a.text) a.text = t
      }
    })
  }, [mitHtml, update])
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

  /** Schülertext vom Aufgabentext trennen – Abgleich, bei Verdacht die KI (abgabeAnlegen.ts) */
  const abtrennen = (ids: string[], erneut = false): void => void aufgabentextAbtrennen(update, docId, ids, erneut)

  // Mehrere Bilder auf einmal (25.10.2026, Wunsch der Lehrkraft): einzelne Abgaben oder die Seiten EINER Arbeit?
  const [bilderFrage, setBilderFrage] = useState<HochladeInhalt[] | null>(null)
  const anlegen = (geprueft: HochladeInhalt[], zusammen: boolean): void => {
    const { mitText } = abgabenAnlegen(update, geprueft, {}, zusammen)
    // Aufgabenblatt und Material aus Word/PDF-Abgaben abtrennen – rückgängig machbar
    if (mitText.length) abtrennen(mitText)
  }
  /** Abgaben lesen, Datenschutz prüfen, anlegen – derselbe Weg wie „Weitere Abgabe" in „Bögen & Export" (abgabeAnlegen.ts) */
  const dateienLesen = async (files: File[]): Promise<void> => {
    try {
      const geprueft = await abgabenLesen(files, setLese)
      if (!geprueft) return
      if (geprueft.filter(nurBilder).length >= 2) setBilderFrage(geprueft)
      else anlegen(geprueft, false)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }
  const drehen = (id: string, seite: number, grad: 90 | -90): void => void seiteDrehen(update, id, seite, grad).catch((e: unknown) => notifyError(e, 'Das Bild konnte nicht gedreht werden'))

  const offen = r.abgaben.filter((a) => !a.bogen && (a.text.trim() || a.bilder.length)).length
  const mitText = r.abgaben.filter((a) => a.text.trim() && !a.bilder.length)
  // Deutsch statt Zielsprache (29.09.2026): Warnung schon an der Abgabe
  const deutschErlaubt = deutschMoeglich(r.grundlage, antwortSpracheVon(r))
  const sprachWarnung = (a: Abgabe): string | null => zielsprachHinweis(pruefeZielsprache(a.text, r.meta.subjectId), r.meta.subjectLabel, deutschErlaubt, false)
  const istAuf = (a: Abgabe): boolean => auf[a.id] ?? a.dateiname === 'getippt'
  const fertig = hatInhalt(r) && !offen
  const grund = !r.grundlage.aufgaben.trim()
    ? 'Aufgabe fehlt (Schritt 1)'
    : !r.abgaben.length
      ? 'Noch keine Abgabe'
      : hatForm(r.meta, 'tabelle') && !r.tabelle?.kriterien.length
        ? 'Bewertungstabelle fehlt (Schritt 1)'
        : !offen && !fertig
          ? 'Keine Abgabe mit Text'
          : ''

  const eintippen = (): void => {
    const id = newId()
    update((d) => d.abgaben.push({ id, kuerzel: naechstesKuerzel(d.abgaben), name: '', dateiname: 'getippt', text: '', bilder: [] }))
  }

  return (
    <Stack h="100%" gap={0}>
      <ScrollArea style={{ flex: 1 }}>
        <Container size="md" py="lg">
          <Stack gap="md">
            {server && (
              <>
                <Title order={3}>Wie kommen die Arbeiten in die App?</Title>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                  <Kachel
                    icon={<IconUpload size={22} />}
                    titel="Hochladen / eintippen"
                    text="Fotos, Scans, PDF oder Word – mehrere Fotos wahlweise als eine Arbeit"
                    aktiv={weg === 'hochladen'}
                    onClick={() => setWeg('hochladen')}
                    data-rm-weg="hochladen"
                  />
                  <Kachel
                    icon={<IconDeviceMobile size={22} />}
                    titel="Lernende reichen online ein"
                    text="Im Schülerbereich schreiben, sofort Feedback, überarbeiten"
                    aktiv={weg === 'online'}
                    onClick={() => setWeg('online')}
                    data-rm-weg="online"
                  />
                </SimpleGrid>
              </>
            )}
            {weg === 'online' && server ? (
              <Card withBorder>
                {/* Server (02.10.2026): Lernende reichen selbst ein und bekommen Feedback */}
                <LernendeKarte r={r} docId={docId} update={(fn) => update(fn)} />
              </Card>
            ) : (
              <Stack gap="xs">
                <DropZone
                  onFiles={(f) => void dateienLesen(f)}
                  accept={MATERIAL_ACCEPT}
                  title={lese ?? 'Abgaben hierher ziehen'}
                  hint="Foto, Scan, PDF, Word oder Textdatei. Bei mehreren Fotos fragt die App, ob sie einzelne Arbeiten oder die Seiten einer Arbeit sind. Namen auf Fotos vorher schwärzen."
                  loading={Boolean(lese)}
                  minHeight={90}
                />
                <Group justify="flex-end">
                  <Button size="xs" variant="subtle" leftSection={<IconKeyboard size={14} />} onClick={eintippen} data-rm-eintippen>
                    Abgabe eintippen
                  </Button>
                </Group>
              </Stack>
            )}
            {!r.abgaben.length && r.grundlage.aufgaben.trim() && (
              <Text size="sm" c="dimmed" data-rm-spaeter-hinweis>
                Die Rückmeldung ist gespeichert und steht in „Meine Rückmeldungen“. Abgaben lassen sich jederzeit hier oder unter „Bögen & Export“ › „Weitere
                Abgabe“ ergänzen.
              </Text>
            )}
            {r.abgaben.length > 0 && (
              <div>
                <Group justify="space-between" mb={6}>
                  <Text fw={600}>Abgaben ({r.abgaben.length})</Text>
                  {mitText.length > 1 && (
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconScissors size={14} />}
                      onClick={() => abtrennen(mitText.map((a) => a.id))}
                      data-rm-trennen-alle
                    >
                      Aufgabentext aus allen abtrennen
                    </Button>
                  )}
                </Group>
                <Stack gap={6}>
                  {r.abgaben.map((a, i) => (
                    <Card key={a.id} withBorder padding="xs" data-rm-abgabe={a.kuerzel}>
                      <Group gap="xs" wrap="nowrap" align="center">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => setAuf((x) => ({ ...x, [a.id]: !istAuf(a) }))}
                          aria-label={istAuf(a) ? `Abgabe ${a.kuerzel} zuklappen` : `Abgabe ${a.kuerzel} aufklappen`}
                          aria-expanded={istAuf(a)}
                          data-rm-abgabe-auf
                        >
                          {istAuf(a) ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                        </ActionIcon>
                        <Badge variant="filled">{a.kuerzel}</Badge>
                        <TextInput
                          size="xs"
                          style={{ flex: 1, minWidth: 80 }}
                          placeholder="Name (bleibt auf diesem Gerät)"
                          value={a.name}
                          onChange={(e) => {
                            const x = e.currentTarget.value
                            update((d) => (d.abgaben[i].name = x), `rm-name-${a.id}`)
                          }}
                          aria-label={`Name zu ${a.kuerzel}`}
                        />
                        <Text size="xs" c="dimmed" className="rm-abgabe-datei" visibleFrom="xs">
                          {a.bilder.length ? <IconPhoto size={12} /> : <IconFileText size={12} />}{' '}
                          {a.bilder.length ? `${a.bilder.length} Seite${a.bilder.length > 1 ? 'n' : ''}` : a.dateiname === 'getippt' ? 'eingetippt' : a.dateiname}
                        </Text>
                        {a.bogen && (
                          <Badge size="xs" color="teal" variant="light">
                            Bogen fertig
                          </Badge>
                        )}
                        {hatAusgleich(a.ausgleich) && (
                          <Badge size="xs" color="grape" variant="light">
                            {ausgleichKurz(a.ausgleich)}
                          </Badge>
                        )}
                        <Tooltip label={hatAusgleich(a.ausgleich) ? 'Nachteilsausgleich ändern' : 'Nachteilsausgleich'}>
                          <ActionIcon
                            variant={hatAusgleich(a.ausgleich) ? 'light' : 'subtle'}
                            color={hatAusgleich(a.ausgleich) ? 'grape' : 'gray'}
                            aria-label={`Nachteilsausgleich für ${a.kuerzel}`}
                            onClick={() => {
                              setAusgleichFuer(a.id)
                              setAusgleichOffen(true)
                            }}
                            data-rm-ausgleich-knopf
                          >
                            <IconHeartHandshake size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {a.text.trim() && !a.bilder.length && (
                          <Tooltip label="Aufgabenstellung, Material und Kopfzeilen aus dem Text abtrennen">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              aria-label={`Aufgabentext aus ${a.kuerzel} abtrennen`}
                              onClick={() => abtrennen([a.id], true)}
                              data-rm-trennen
                            >
                              <IconScissors size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {/* Seiten einer Arbeit versehentlich getrennt: an die vorherige Abgabe anhängen (25.10.2026) */}
                        {i > 0 && a.bilder.length > 0 && !a.text.trim() && r.abgaben[i - 1].bilder.length > 0 && !r.abgaben[i - 1].text.trim() && (
                          <Tooltip label={`Als weitere Seite zu ${r.abgaben[i - 1].kuerzel} anhängen`}>
                            <ActionIcon variant="subtle" color="gray" aria-label={`${a.kuerzel} an ${r.abgaben[i - 1].kuerzel} anhängen`} onClick={() => mitVorherigerZusammenlegen(update, a.id)} data-rm-zusammenlegen>
                              <IconArrowMerge size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Tooltip label="Abgabe entfernen">
                          <ActionIcon variant="subtle" color="red" aria-label="Abgabe entfernen" onClick={() => update((d) => d.abgaben.splice(i, 1))}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                      {/* Hinweise stehen auch zugeklappt – sie verlangen eine Entscheidung */}
                      {!hatAusgleich(a.ausgleich) && gemerkterAusgleich(gedaechtnis, a.name) && (
                        <Group gap={6} mt={6}>
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
                      {a.text.trim() && sprachWarnung(a) && (
                        <Group gap={6} wrap="nowrap" mt={6} data-rm-sprachwarnung>
                          <IconLanguage size={14} color="var(--mantine-color-orange-6)" />
                          <Text size="xs" c="orange">
                            {sprachWarnung(a)}
                          </Text>
                        </Group>
                      )}
                      {trennHinweis(a) && (
                        <Group gap={6} mt={6} data-rm-getrennt>
                          <Text size="xs" c={a.trennung?.keineAntwort ? 'orange' : 'teal'} data-rm-keine-antwort={a.trennung?.keineAntwort ?? undefined}>
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
                      <Collapse expanded={istAuf(a)}>
                        <Stack gap={6} mt={6}>
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
                          {a.bilder.length > 0 ? (
                            <Stack gap={6} data-rm-seiten>
                              <Text size="xs" c="dimmed">
                                {a.bilder.length} Seite{a.bilder.length > 1 ? 'n' : ''} – der Text wird beim Schreiben der Rückmeldung übertragen. Liegt ein Foto quer, hier drehen.
                              </Text>
                              {/* Seitenbilder mit Drehen (25.10.2026): „oben" muss oben sein, sonst liest die KI schlechter */}
                              <Group gap="sm" wrap="wrap" align="flex-start">
                                {a.bilder.map((b, n) => (
                                  <Stack key={n} gap={2} align="center" data-rm-seite={n + 1}>
                                    <Image src={b} w={96} h={128} fit="contain" radius="sm" alt={`Seite ${n + 1}`} style={{ background: 'var(--mantine-color-default-hover)' }} />
                                    <Group gap={2}>
                                      <Tooltip label="Nach links drehen">
                                        <ActionIcon size="sm" variant="subtle" aria-label={`Seite ${n + 1} nach links drehen`} onClick={() => drehen(a.id, n, -90)} data-rm-seite-drehen="links">
                                          <IconRotate size={14} />
                                        </ActionIcon>
                                      </Tooltip>
                                      <Text size="xs" c="dimmed">
                                        {n + 1}
                                      </Text>
                                      <Tooltip label="Nach rechts drehen">
                                        <ActionIcon size="sm" variant="subtle" aria-label={`Seite ${n + 1} nach rechts drehen`} onClick={() => drehen(a.id, n, 90)} data-rm-seite-drehen="rechts">
                                          <IconRotateClockwise size={14} />
                                        </ActionIcon>
                                      </Tooltip>
                                    </Group>
                                  </Stack>
                                ))}
                              </Group>
                              {a.bilder.length > 1 && !a.text.trim() && (
                                <Button size="compact-xs" variant="subtle" leftSection={<IconScissors size={12} />} onClick={() => seitenTrennen(update, a.id)} w="fit-content" data-rm-seiten-trennen>
                                  Seiten als einzelne Abgaben
                                </Button>
                              )}
                            </Stack>
                          ) : (
                            <Textarea
                              size="xs"
                              autosize
                              minRows={2}
                              maxRows={10}
                              placeholder="Text der Abgabe"
                              value={a.text}
                              onChange={(e) => {
                                const x = e.currentTarget.value
                                update((d) => (d.abgaben[i].text = x), `rm-text-${a.id}`)
                              }}
                              aria-label={`Text von ${a.kuerzel}`}
                            />
                          )}
                        </Stack>
                      </Collapse>
                    </Card>
                  ))}
                </Stack>
              </div>
            )}
            <AlleOptionen />
          </Stack>
        </Container>
      </ScrollArea>
      {/* Mehrere Bilder auf einmal: einzelne Abgaben oder eine Arbeit mit mehreren Seiten? */}
      <Modal opened={Boolean(bilderFrage)} onClose={() => setBilderFrage(null)} title="Mehrere Bilder hochgeladen" size="md" centered data-rm-bilder-frage>
        {bilderFrage && (
          <Stack gap="sm">
            <Text size="sm">
              {bilderFrage.filter(nurBilder).length} Bilder. Sind das einzelne Arbeiten oder die Seiten einer Arbeit?
            </Text>
            <Group gap="sm" grow>
              <Button
                variant="light"
                leftSection={<IconPhoto size={16} />}
                onClick={() => (anlegen(bilderFrage, false), setBilderFrage(null))}
                data-rm-bilder-einzeln
              >
                Einzelne Abgaben
                <Text span size="xs" c="dimmed" ml={6}>
                  je Bild eine Person
                </Text>
              </Button>
              <Button leftSection={<IconFileText size={16} />} onClick={() => (anlegen(bilderFrage, true), setBilderFrage(null))} data-rm-bilder-eine>
                Eine Abgabe
                <Text span size="xs" c="dimmed" ml={6}>
                  {bilderFrage.filter(nurBilder).length} Seiten einer Person
                </Text>
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Später lässt sich beides ändern: Seiten einzeln machen oder eine Abgabe an die vorherige anhängen. Quer liegende Fotos lassen sich an der Abgabe drehen.
            </Text>
          </Stack>
        )}
      </Modal>
      <AusgleichFenster
        abgabe={r.abgaben.find((a) => a.id === ausgleichFuer) ?? null}
        meta={r.meta}
        offen={ausgleichOffen && Boolean(ausgleichFuer)}
        schliessen={() => setAusgleichOffen(false)}
        speichern={(a, merken) => ausgleichFuer && ausgleichSpeichern(ausgleichFuer, a, merken)}
      />
      <Formularfuss
        grund={grund}
        links={
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => setStep(0)} data-rm-zurueck>
            Material
          </Button>
        }
      >
        {!r.abgaben.length && r.grundlage.aufgaben.trim() && (
          // Ohne Abgabe weiter (23.10.2026): die Rückmeldung ist gespeichert, Abgaben kommen später
          <Button variant="default" rightSection={<IconArrowRight size={16} />} onClick={() => setStep(2)} data-rm-ohne-abgaben>
            Abgaben später
          </Button>
        )}
        {fertig ? (
          <Button rightSection={<IconArrowRight size={16} />} onClick={() => setStep(2)} data-rm-zu-boegen>
            Zu den Bögen
          </Button>
        ) : (
          <Button leftSection={<IconMessageCheck size={16} />} disabled={Boolean(grund)} onClick={() => rueckmeldungenErzeugen(r, docId)} data-rm-schreiben>
            {offen > 1 ? `${offen} Rückmeldungen schreiben` : 'Rückmeldung schreiben'}
          </Button>
        )}
      </Formularfuss>
    </Stack>
  )
}
