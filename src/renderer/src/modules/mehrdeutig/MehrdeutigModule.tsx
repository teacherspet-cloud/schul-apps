/**
 * App „Mehrdeutig" (21.10.2026, Wunsch der Lehrkraft; Organisation, nur Admins): Wörter aller Bücher – mitgelieferte und
 * gemeinsame Lehrwerke, eigene Lehrwerke und Verblisten der Lehrkräfte – mit ihren Bedeutungen und Beispielbildern prüfen
 * und klären (Bilder je Bedeutung und Wortart, shared/medienBedeutung.ts; Ablage main/services/storage/medienbank.ts).
 *
 *  - Liste: Filter „Klärungsbedarf" (mehrere Bedeutungen, wartende alte Bilder, Synonym-Verdacht, vorläufige oder ungeklärte
 *    Fundstellen), „Alle Wörter", „Geprüft", „Ohne Bild"; Suche, Sprachen, A–Z, seitenweise.
 *  - Je Wort: die Fundstellen (Buch › Unit, Übersetzung, Wortart wie im Buch) mit „gehört zu …", je Bedeutung Wortart,
 *    deutsche Bedeutung, Bild der gewählten Bildstufe und „Bild passt", „Neues Bild (KI)", „Bild suchen", „Bild löschen",
 *    „ist dieselbe Bedeutung wie …"; alte Bilder mit „Gehört zu: …".
 *  - Oben „Mehrdeutige Wörter klären": die KI-Klärung (bedeutungenKlaeren.ts) für alle auf einmal.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Container,
  Group,
  Image,
  Loader,
  Menu,
  Pagination,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import { IconCheck, IconPhotoSearch, IconSearch, IconSparkles, IconTrash, IconArrowsJoin } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { BILDSTUFE_NAME, BILDSTUFEN, type Bildstufe } from '@shared/medienbank'
import { WORTART_NAME, type MehrdeutigFilter, type MehrdeutigZeile, type Wortart } from '@shared/medienBedeutung'
import { AppKopf, useProgrammFarbe } from '../../shared/components/AppKopf'
import { BildDialog, useMedienAdmin } from '../../shared/medien/MedienUi'
import { aufMedienAenderung, medienSchluessel, starteMedienAuftrag, type MedienZiel } from '../../shared/medien/medienAuftrag'
import { bedeutungenKlaerenStarten } from '../../shared/medien/bedeutungenKlaeren'
import type { Vokabel } from '../../shared/medien/medienbank'
import { useLaufendeSchluessel } from '../../shared/auftraege'
import { notifyError } from '../../shared/util'

const JE_SEITE = 30
const FILTER: { value: MehrdeutigFilter; label: string }[] = [
  { value: 'klaerung', label: 'Klärungsbedarf' },
  { value: 'alle', label: 'Alle Wörter' },
  { value: 'geprueft', label: 'Geprüft' },
  { value: 'ohneBild', label: 'Ohne Bild' }
]
const GRUND: Record<MehrdeutigZeile['gruende'][number], string> = {
  mehrere: 'mehrere Bedeutungen',
  offen: 'altes Bild wartet',
  klaeren: 'vielleicht Synonyme',
  vorlaeufig: 'vorläufig zugeordnet',
  ungeklaert: 'ungeklärte Fundstelle'
}
const SPRACHE: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', la: 'Latein', de: 'Deutsch', it: 'Italienisch' }
type Bedeutung = MehrdeutigZeile['bedeutungen'][number]

export default function MehrdeutigModule({ active = true }: { active?: boolean }): React.JSX.Element {
  const admin = useMedienAdmin()
  const farbe = useProgrammFarbe()
  const [filter, setFilter] = useState<MehrdeutigFilter>('klaerung')
  const [suche, setSuche] = useState('')
  const [sprache, setSprache] = useState('en')
  const [stufe, setStufe] = useState<Bildstufe>('s2')
  const [seite, setSeite] = useState(1)
  const [daten, setDaten] = useState<Awaited<ReturnType<typeof window.api.medien.mehrdeutigListe>> | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [dialog, setDialog] = useState<{ v: Vokabel; b: Bedeutung } | null>(null)
  const klaerenLaeuft = useLaufendeSchluessel('medien-bedeutungen').has('medien:bedeutungen')

  const laden = useCallback(() => {
    if (!admin) return
    setLaedt(true)
    void window.api.medien
      .mehrdeutigListe({ filter, suche, sprache, stufe, seite: seite - 1, jeSeite: JE_SEITE })
      .then(setDaten, (e: unknown) => notifyError(e))
      .finally(() => setLaedt(false))
  }, [admin, filter, suche, sprache, stufe, seite])
  useEffect(() => {
    if (active) laden()
  }, [active, laden])
  // Bildaufträge und Klärung im Hintergrund: danach neu laden
  useEffect(() => aufMedienAenderung(() => laden()), [laden])
  useEffect(() => setSeite(1), [filter, suche, sprache])

  const tun = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  const ziel: MedienZiel = { docId: 'mehrdeutig', titel: 'Mehrdeutig', stufe }
  const vokabelVon = (z: MehrdeutigZeile, b: Bedeutung): Vokabel => ({
    term: z.lemma,
    translation: b.deutsch,
    wortart: b.wortart,
    bedeutung: { id: b.id, deutsch: b.deutsch, wortart: b.wortart },
    andere: z.bedeutungen.filter((x) => x.id !== b.id).map((x) => ({ id: x.id, deutsch: x.deutsch, wortart: x.wortart }))
  })

  return (
    <ScrollArea h="100%">
      <Container size="xl" py="lg" data-mehrdeutig>
        <AppKopf
          suche={false}
          beschreibung="Wörter aller Bücher und Verblisten mit ihren Bedeutungen und Beispielbildern prüfen: Verb oder kein Verb, welche Übersetzung zu welcher Bedeutung gehört, welches Bild passt."
          zusaetze={
            <Tooltip
              label="Die KI prüft alle Wörter mit mehreren Bedeutungen derselben Wortart (vielleicht Synonyme) und ordnet alte Bilder zu"
              multiline
              maw={320}
            >
              <Button
                leftSection={<IconSparkles size={16} />}
                variant="light"
                loading={klaerenLaeuft}
                disabled={!admin || klaerenLaeuft}
                onClick={() => void bedeutungenKlaerenStarten()}
                data-mehrdeutig-klaeren
              >
                Mehrdeutige Wörter klären
              </Button>
            </Tooltip>
          }
        />
        {!admin ? (
          <Alert variant="light" color="gray">
            Die Bedeutungen der Beispielbilder klären nur Admins.
          </Alert>
        ) : (
          <Stack gap="sm">
            <Card withBorder radius="md" padding="sm">
              <Group gap="md" align="flex-end" wrap="wrap">
                <SegmentedControl value={filter} onChange={(v) => setFilter(v as MehrdeutigFilter)} data={FILTER} data-mehrdeutig-filter />
                <TextInput
                  leftSection={<IconSearch size={14} />}
                  placeholder="Wort oder Bedeutung suchen …"
                  value={suche}
                  onChange={(e) => setSuche(e.currentTarget.value)}
                  w={260}
                  data-mehrdeutig-suche
                />
                <Group gap={6} align="center">
                  <Text size="sm" c="dimmed">
                    Bildstufe:
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={stufe}
                    onChange={(v) => setStufe(v as Bildstufe)}
                    data={BILDSTUFEN.map((s) => ({ value: s, label: BILDSTUFE_NAME[s] }))}
                    data-mehrdeutig-stufe
                  />
                </Group>
              </Group>
              {(daten?.sprachen.length ?? 0) > 1 && (
                <Chip.Group value={sprache} onChange={(v) => typeof v === 'string' && setSprache(v)}>
                  <Group gap={6} mt="sm">
                    {daten!.sprachen.map((s) => (
                      <Chip key={s} value={s} color={farbe} variant="light" size="xs" data-mehrdeutig-sprache={s}>
                        {SPRACHE[s] ?? s}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
            </Card>
            <Group justify="space-between">
              <Text size="sm" c="dimmed" data-mehrdeutig-anzahl>
                {daten ? `${daten.gesamt} ${daten.gesamt === 1 ? 'Wort' : 'Wörter'} · ${daten.klaerung} mit Klärungsbedarf` : ''}
              </Text>
              {laedt && <Loader size="xs" />}
            </Group>
            {daten?.zeilen.length === 0 && (
              <Text c="dimmed" ta="center" py="xl">
                {filter === 'klaerung' ? 'Nichts zu klären.' : 'Keine Wörter gefunden.'}
              </Text>
            )}
            {daten?.zeilen.map((z) => (
              <WortKarte
                key={z.schluessel}
                z={z}
                stufe={stufe}
                tun={tun}
                bildSuchen={(b) => setDialog({ v: vokabelVon(z, b), b })}
                kiBild={(b) => void starteMedienAuftrag({ art: 'bildKi', sprache: z.sprache, vokabeln: [vokabelVon(z, b)], ziel, einzeln: true })}
              />
            ))}
            {daten && daten.gesamt > JE_SEITE && (
              <Group justify="center" py="md">
                <Pagination total={Math.ceil(daten.gesamt / JE_SEITE)} value={seite} onChange={setSeite} data-mehrdeutig-seiten />
              </Group>
            )}
          </Stack>
        )}
        {dialog && (
          <BildDialog
            sprache={daten?.zeilen.find((z) => z.lemma === dialog.v.term)?.sprache ?? sprache}
            v={dialog.v}
            sicht={dialog.b.bild}
            admin={admin}
            ziel={ziel}
            schliessen={() => setDialog(null)}
            geaendert={laden}
          />
        )}
      </Container>
    </ScrollArea>
  )
}

/** Ein Wort: Fundstellen, Bedeutungen mit Bild, wartende alte Bilder */
function WortKarte({
  z,
  stufe,
  tun,
  bildSuchen,
  kiBild
}: {
  z: MehrdeutigZeile
  stufe: Bildstufe
  tun: (fn: () => Promise<unknown>) => Promise<void>
  bildSuchen: (b: Bedeutung) => void
  kiBild: (b: Bedeutung) => void
}): React.JSX.Element {
  const kiLaeuft = useLaufendeSchluessel('mehrdeutig').has(medienSchluessel('bildKi', z.lemma))
  const bedeutungLabel = (b: Pick<Bedeutung, 'deutsch' | 'wortart'>): string => `${b.deutsch} (${WORTART_NAME[b.wortart]})`
  return (
    <Card withBorder radius="md" padding="md" data-mehrdeutig-wort={z.schluessel}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Text fw={800} size="lg">
              {z.lemma}
            </Text>
            <Badge variant="light" color="gray">
              {z.bedeutungen.length === 1 ? '1 Bedeutung' : `${z.bedeutungen.length} Bedeutungen`}
            </Badge>
            {z.gruende.map((g) => (
              <Badge key={g} variant="light" color="yellow" data-mehrdeutig-grund={g}>
                {GRUND[g]}
              </Badge>
            ))}
            {!z.gruende.length && (z.vonHand || (z.bedeutungen.length > 0 && z.bedeutungen.every((b) => b.geprueft))) && (
              <Badge variant="light" color="teal" leftSection={<IconCheck size={12} />}>
                geprüft
              </Badge>
            )}
          </Group>
          {/* Wort abhaken (21.10.2026, Befund der Lehrkraft): nimmt es aus dem Klärungsbedarf, auch ohne Bild */}
          <Tooltip
            label={
              z.vonHand
                ? 'Wieder als „zu klären" führen'
                : 'Alles passt so – das Wort verschwindet aus „Klärungsbedarf" (bleibt unter „Alle Wörter" und „Geprüft")'
            }
            multiline
            maw={300}
          >
            <Button
              size="xs"
              variant={z.vonHand ? 'filled' : 'light'}
              color="teal"
              leftSection={<IconCheck size={14} />}
              onClick={() => void tun(() => window.api.medien.wortGeklaert(z.schluessel, !z.vonHand))}
              data-mehrdeutig-geklaert={z.schluessel}
            >
              {z.vonHand ? 'Geklärt ✓' : 'Wort geklärt'}
            </Button>
          </Tooltip>
        </Group>

        {/* Fundstellen: wie im Buch, mit der Bedeutung, zu der die Übersetzung gehört */}
        {z.fundstellen.length > 0 && (
          <Stack gap={4} data-mehrdeutig-fundstellen>
            {z.fundstellen.slice(0, 12).map((f, i) => (
              <Group key={`${f.quelle}|${f.term}|${f.translation}|${i}`} gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed" w={190} truncate title={f.quelle}>
                  {f.quelle || '–'}
                </Text>
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                  <b>{f.term}</b> – {f.translation}
                  {f.pos ? (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {f.pos}
                    </Text>
                  ) : null}
                </Text>
                {(f.wie === 'einzig' || f.wie === 'mehrdeutig' || f.wie === 'keine') && (
                  <Badge size="xs" color="yellow" variant="light">
                    {f.wie === 'einzig' ? 'vorläufig' : 'ungeklärt'}
                  </Badge>
                )}
                <Select
                  size="xs"
                  w={230}
                  aria-label={`„${f.translation}" gehört zu`}
                  placeholder="gehört zu …"
                  value={f.bedeutung ?? null}
                  data={[
                    ...z.bedeutungen.map((b) => ({ value: b.id, label: bedeutungLabel(b) })),
                    { value: 'neu', label: `Neue Bedeutung (${WORTART_NAME[f.wortart]})` }
                  ]}
                  onChange={(v) => v && v !== f.bedeutung && void tun(() => window.api.medien.varianteVerschieben(z.schluessel, f.translation, v, f.wortart))}
                  data-mehrdeutig-gehoert={f.translation}
                />
              </Group>
            ))}
            {z.fundstellen.length > 12 && (
              <Text size="xs" c="dimmed">
                … und {z.fundstellen.length - 12} weitere Fundstellen
              </Text>
            )}
          </Stack>
        )}

        {/* Bedeutungen mit Bild der gewählten Stufe */}
        <Group gap="sm" align="stretch" wrap="wrap">
          {z.bedeutungen.map((b) => {
            const bild = b.bild?.bild
            const fremd = Boolean(bild && b.bild?.bildStufe && b.bild.bildStufe !== stufe)
            const gleiche = z.bedeutungen.filter((x) => x.id !== b.id && x.wortart === b.wortart)
            return (
              <Card key={b.id} withBorder radius="md" padding="sm" w={300} data-mehrdeutig-bedeutung={b.id}>
                <Stack gap={6}>
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    {bild?.dataUrl ? (
                      <Image src={bild.dataUrl} w={88} h={88} radius="sm" fit="cover" alt={b.deutsch} style={fremd ? { opacity: 0.45 } : undefined} />
                    ) : (
                      <div
                        style={{
                          width: 88,
                          height: 88,
                          borderRadius: 6,
                          border: '1px dashed var(--mantine-color-default-border)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Text size="xs" c="dimmed" ta="center">
                          {b.bild?.ohneBild?.includes(stufe) ? 'kein eindeutiges Motiv' : 'kein Bild'}
                        </Text>
                      </div>
                    )}
                    <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                      <SegmentedControl
                        size="xs"
                        fullWidth
                        value={b.wortart}
                        onChange={(v) => void tun(() => window.api.medien.sinnWortart(z.schluessel, b.id, v as Wortart))}
                        data={[
                          { value: 'verb', label: 'Verb' },
                          { value: 'andere', label: 'kein Verb' }
                        ]}
                        data-mehrdeutig-wortart={b.id}
                      />
                      <TextInput
                        size="xs"
                        aria-label="Deutsche Bedeutung"
                        defaultValue={b.deutsch}
                        key={`${b.id}|${b.deutsch}`}
                        onBlur={(e) => {
                          const t = e.currentTarget.value.trim()
                          if (t && t !== b.deutsch) void tun(() => window.api.medien.sinnBezeichnung(z.schluessel, b.id, t))
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        data-mehrdeutig-deutsch={b.id}
                      />
                      {fremd && b.bild?.bildStufe && (
                        <Text size="10px" c="orange.8">
                          Bild der Stufe {BILDSTUFE_NAME[b.bild.bildStufe]}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                  <Group gap={4}>
                    <Button
                      size="compact-xs"
                      variant={b.geprueft ? 'filled' : 'light'}
                      color="teal"
                      leftSection={<IconCheck size={12} />}
                      onClick={() => void tun(() => window.api.medien.sinnGeprueft(z.schluessel, b.id, !b.geprueft))}
                      data-mehrdeutig-passt={b.id}
                    >
                      {/* Auch ohne Bild abhakbar (21.10.2026): Bedeutung und Wortart stimmen */}
                      {bild ? (b.geprueft ? 'Bild passt ✓' : 'Bild passt') : b.geprueft ? 'Passt ✓' : 'Passt (ohne Bild)'}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      leftSection={<IconSparkles size={12} />}
                      loading={kiLaeuft}
                      onClick={() => kiBild(b)}
                      data-mehrdeutig-ki={b.id}
                    >
                      Neues Bild (KI)
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      leftSection={<IconPhotoSearch size={12} />}
                      onClick={() => bildSuchen(b)}
                      data-mehrdeutig-suchen={b.id}
                    >
                      Bild suchen
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={12} />}
                      disabled={!bild || fremd}
                      onClick={() =>
                        void tun(() => window.api.medien.bildLoeschen(z.sprache, z.lemma, stufe, { id: b.id, wortart: b.wortart, deutsch: b.deutsch }))
                      }
                      data-mehrdeutig-loeschen={b.id}
                    >
                      Bild löschen
                    </Button>
                    {gleiche.length > 0 && (
                      <Menu withinPortal position="bottom-start">
                        <Menu.Target>
                          <Button size="compact-xs" variant="subtle" leftSection={<IconArrowsJoin size={12} />} data-mehrdeutig-zusammen={b.id}>
                            ist dieselbe wie …
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {gleiche.map((x) => (
                            <Menu.Item key={x.id} onClick={() => void tun(() => window.api.medien.sinneZusammenfuehren(z.schluessel, [[x.id, b.id]]))}>
                              {bedeutungLabel(x)}
                            </Menu.Item>
                          ))}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Group>
                </Stack>
              </Card>
            )
          })}
          {!z.bedeutungen.length && (
            <Text size="sm" c="dimmed">
              Noch keine Bedeutung – sie entsteht beim nächsten Bildauftrag oder über „gehört zu … → Neue Bedeutung".
            </Text>
          )}
        </Group>

        {/* Alte Bilder aus der Zeit vor den Bedeutungen: zu welcher gehören sie? */}
        {z.offen.length > 0 && (
          <Stack gap={6} data-mehrdeutig-offen>
            {z.offen.map((o) => (
              <Group key={o.datei} gap="sm" wrap="nowrap">
                {o.dataUrl ? <Image src={o.dataUrl} w={64} h={64} radius="sm" fit="cover" alt="altes Bild" /> : null}
                <Text size="sm">Altes Bild ({BILDSTUFE_NAME[o.stufe]}) – gehört zu:</Text>
                <Group gap={4}>
                  {z.bedeutungen
                    .filter((b) => o.wortarten.includes(b.wortart))
                    .map((b) => (
                      <Button
                        key={b.id}
                        size="compact-xs"
                        variant="light"
                        onClick={() => void tun(() => window.api.medien.altbildZuordnen(z.schluessel, o.datei, b.id))}
                      >
                        {bedeutungLabel(b)}
                      </Button>
                    ))}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => void tun(() => window.api.medien.altbildZuordnen(z.schluessel, o.datei, null))}
                  >
                    keiner
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
