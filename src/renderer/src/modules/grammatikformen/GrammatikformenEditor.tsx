import { ActionIcon, Alert, Badge, Button, Card, Checkbox, Chip, Group, Modal, Select, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconCheck, IconDeviceFloppy, IconPencil, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { TextbookMeta } from '@shared/types'
import { fachDerSprache } from '@shared/fachobleute'
import { fachVon } from '@shared/faecher'
import { notifyError, notifySuccess } from '../../shared/util'
import DropZone from '../../shared/components/DropZone'
import { extractContent, MATERIAL_ACCEPT } from '../../shared/files/extractContent'
import { pruefeHochladen } from '../../shared/datenschutz'
import { darfLehrwerkBearbeiten } from '../../shared/fachobleute'
import {
  LEHRWERK_GRAMMATIK,
  LEHRWERK_GRAMMATIK_EINGEBAUT,
  wendeGrammatikAn,
  type LehrwerkGrammatikBand,
  type LehrwerkGrammatikEintrag,
  type LehrwerkGrammatikPunkt
} from '../../shared/lehrwerkGrammatik'
import GrammatikAuswahl, { type GrammatikWahl } from '../arbeitsblatt/steps/GrammatikAuswahl'
import {
  abschnitteDer,
  kennungGueltig,
  kennungLabel,
  ordneBand,
  pruefeVorschlaege,
  textZu,
  uebernehmbar,
  uebernimmVorschlaege,
  verschiebe,
  VORSCHLAG_SCHEMA,
  vorschlagAuftrag,
  type Vorschlag
} from './grammatikformen'

const kopie = (b: LehrwerkGrammatikBand): LehrwerkGrammatikBand => JSON.parse(JSON.stringify(b ?? {})) as LehrwerkGrammatikBand
const abschnittName = (s: string): string => s || 'Ganzes Kapitel'

/** Was der Auswahl-Dialog gerade bearbeitet: neuer Punkt in einem Abschnitt oder die Formen eines Punkts */
type Auswahl = { unit: string; abschnitt: string; index?: number; wahl: GrammatikWahl }

/**
 * Grammatik eines Lehrwerk-Bands bearbeiten (12.10.2026, App „Grammatikformen").
 *
 * Units als Chips, darunter je Abschnitt die Grammatikpunkte (Text, Katalogformen, Wiederholung) zum Umsortieren,
 * Ändern und Entfernen. „Form hinzufügen" nutzt dieselbe Themen-/Teilformen-Auswahl wie Arbeitsblatt und
 * Grammatiktraining (GrammatikAuswahl). KI-Vorschläge aus Schulbuchseiten (PDF/Bild, auch Strg+V) erscheinen als
 * Liste zum Abhaken – übernommen wird nur Angehaktes, und nur DAZU. Gespeichert wird erst mit „Speichern" (gemeinsame
 * Daten der Schule – kein stilles Sichern nebenbei).
 */
export default function GrammatikformenEditor({
  buch,
  alle,
  eintrag,
  onBack,
  onGespeichert
}: {
  buch: TextbookMeta
  alle: TextbookMeta[]
  /** Gespeicherte Bearbeitung dieses Bands (sonst gilt die eingebaute Liste bzw. noch keine) */
  eintrag?: LehrwerkGrammatikEintrag
  onBack: () => void
  onGespeichert: (liste: LehrwerkGrammatikEintrag[]) => void
}): React.JSX.Element {
  const darf = darfLehrwerkBearbeiten(buch.language)
  const fach = fachDerSprache(buch.language)
  const fachName = fachVon(fach)?.label ?? fach
  const [band, setBand] = useState<LehrwerkGrammatikBand>(() => kopie(eintrag?.kapitel ?? LEHRWERK_GRAMMATIK[buch.name] ?? {}))
  const [dirty, setDirty] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [zurueckFrage, setZurueckFrage] = useState(false)
  const [verwerfenFrage, setVerwerfenFrage] = useState(false)
  const unitNamen = useMemo(() => [...buch.units.map((u) => u.name), ...Object.keys(band).filter((k) => !buch.units.some((u) => u.name === k))], [buch, band])
  const [unit, setUnit] = useState<string>(() => unitNamen.find((u) => band[u]) ?? unitNamen[0] ?? '')
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null)
  const [liest, setLiest] = useState<string | null>(null)
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[] | null>(null)
  // Gleichnamiger Band (z. B. zwei Ausgaben „¡Apúntate! 1"): Die Grammatik gilt nach dem Namen – Hinweis statt still
  const gleichnamig = alle.filter((b) => b.id !== buch.id && b.name === buch.name)
  const eingebaut = Boolean(LEHRWERK_GRAMMATIK_EINGEBAUT[buch.name])

  const aendere = (fn: (b: LehrwerkGrammatikBand) => void): void => {
    if (!darf) return
    setBand((alt) => {
      const neu = kopie(alt)
      fn(neu)
      return neu
    })
    setDirty(true)
  }
  const punkteVon = (u: string, a: string): LehrwerkGrammatikPunkt[] => band[u]?.[a] ?? []
  const setzePunkte = (u: string, a: string, liste: LehrwerkGrammatikPunkt[]): void =>
    aendere((b) => {
      b[u] ??= {}
      if (liste.length) b[u][a] = liste
      else delete b[u][a]
      if (!Object.keys(b[u]).length) delete b[u]
    })

  const speichern = async (): Promise<void> => {
    setSpeichert(true)
    try {
      const liste = await window.api.lehrwerkGrammatik.save({ lehrwerkId: buch.id, buch: buch.name, sprache: buch.language, kapitel: ordneBand(band, buch) })
      wendeGrammatikAn(liste)
      onGespeichert(liste)
      setDirty(false)
      notifySuccess(`Grammatikformen von „${buch.name}" gespeichert.`)
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  const verwerfen = async (): Promise<void> => {
    try {
      const liste = await window.api.lehrwerkGrammatik.delete(buch.id)
      wendeGrammatikAn(liste)
      onGespeichert(liste)
      setBand(kopie(LEHRWERK_GRAMMATIK[buch.name] ?? {}))
      setDirty(false)
      notifySuccess(eingebaut ? 'Die eingebaute Grammatik gilt wieder.' : 'Die Grammatik dieses Bands wurde entfernt.')
    } catch (e) {
      notifyError(e)
    }
  }

  /** Schulbuchseiten → KI-Vorschläge (nur Vorschläge; nichts wird ohne Abhaken übernommen) */
  const seitenLesen = async (dateien: File[]): Promise<void> => {
    try {
      const gelesen = []
      for (const f of dateien) {
        setLiest(`${f.name} wird gelesen …`)
        gelesen.push(await extractContent(f, (m) => setLiest(`${f.name}: ${m}`), { maxRenderedPages: 8 }))
      }
      // Datenschutz: Namensprüfung vor jeder KI-Anfrage
      const geprueft = await pruefeHochladen(gelesen)
      if (!geprueft) return
      const bilder = geprueft
        .flatMap((g) => g.pageImages)
        .filter((b) => b.startsWith('data:image/'))
        .slice(0, 8)
      const text = geprueft
        .filter((g) => !g.pageImages.length && g.text.trim())
        .map((g) => g.text)
        .join('\n\n')
        .slice(0, 20000)
      if (!bilder.length && !text) throw new Error('Keine Seiten gefunden – bitte Fotos oder ein PDF der Schulbuchseiten wählen.')
      setLiest('Die KI ordnet die Grammatik zu …')
      const auftrag = vorschlagAuftrag(buch.name, buch, fach, fachName)
      const roh = await window.api.ai.structured<unknown>({
        system: auftrag.system,
        user: text ? `${auftrag.user}\n\nTEXT DER SEITEN:\n${text}` : auftrag.user,
        ...(bilder.length ? { images: bilder } : {}),
        schemaName: 'grammatikformen_vorschlaege',
        schema: VORSCHLAG_SCHEMA
      })
      const v = pruefeVorschlaege(roh, buch, band, fach)
      if (!v.length) throw new Error('Auf den Seiten wurde keine zuordenbare Grammatik gefunden.')
      setVorschlaege(v)
    } catch (e) {
      notifyError(e)
    } finally {
      setLiest(null)
    }
  }

  const unitAbschnitte = abschnitteDer(buch, unit, band[unit])

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Title order={3}>{buch.name}</Title>
            {eintrag ? (
              <Badge variant="light" color="violet">
                bearbeitet
              </Badge>
            ) : eingebaut ? (
              <Badge variant="light">eingebaut</Badge>
            ) : null}
          </Group>
          <Text c="dimmed" size="sm">
            {darf
              ? 'Grammatik je Unit und Abschnitt – Änderungen gelten nach „Speichern" für alle Lehrkräfte der Schule.'
              : 'Nur ansehen – bearbeiten dürfen Admins und die Fachobleute dieses Fachs.'}
          </Text>
        </div>
        <Group wrap="nowrap">
          <Button variant="default" onClick={() => (dirty ? setZurueckFrage(true) : onBack())}>
            Zurück zur Übersicht
          </Button>
          {darf && eintrag && (
            <Button variant="subtle" color="red" onClick={() => setVerwerfenFrage(true)} data-grammatikformen-verwerfen>
              Änderungen verwerfen
            </Button>
          )}
          {darf && (
            <Button
              variant={dirty ? 'filled' : 'light'}
              leftSection={dirty ? <IconDeviceFloppy size={16} /> : <IconCheck size={16} />}
              disabled={!dirty}
              loading={speichert}
              onClick={() => void speichern()}
              data-grammatikformen-speichern
            >
              {dirty ? 'Speichern' : 'Gespeichert'}
            </Button>
          )}
        </Group>
      </Group>

      {zurueckFrage && (
        <Alert color="orange" p="xs">
          <Group justify="space-between">
            <Text size="sm">Ungespeicherte Änderungen verwerfen und zurück zur Übersicht?</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setZurueckFrage(false)}>
                Abbrechen
              </Button>
              <Button size="xs" color="orange" onClick={onBack}>
                Ohne Speichern zurück
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {verwerfenFrage && (
        <Alert color="red" p="xs">
          <Group justify="space-between">
            <Text size="sm">
              {eingebaut
                ? 'Alle Bearbeitungen dieses Bands verwerfen – für alle Lehrkräfte? Danach gilt wieder die eingebaute Grammatik.'
                : 'Die Grammatik dieses Bands entfernen – für alle Lehrkräfte?'}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setVerwerfenFrage(false)}>
                Abbrechen
              </Button>
              <Button
                size="xs"
                color="red"
                autoFocus
                onClick={() => {
                  setVerwerfenFrage(false)
                  void verwerfen()
                }}
              >
                Verwerfen
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {gleichnamig.length > 0 && (
        <Alert color="yellow" p="xs">
          <Text size="xs">
            Es gibt einen gleichnamigen Band ({gleichnamig.map((b) => [b.ausgabe, b.edition].filter(Boolean).join(', ') || b.id).join('; ')}). Die Grammatik
            gilt nach dem Namen „{buch.name}" – für beide.
          </Text>
        </Alert>
      )}

      {darf && (
        <Card withBorder>
          <Group gap="xs" mb={6}>
            <IconSparkles size={16} />
            <Text size="sm" fw={500}>
              Vorschläge aus Schulbuchseiten
            </Text>
          </Group>
          <DropZone
            onFiles={(f) => void seitenLesen(f)}
            accept={MATERIAL_ACCEPT}
            multiple
            title={liest ?? 'Inhaltsverzeichnis oder Grammatikseiten hierher ziehen'}
            hint="PDF oder Fotos (PNG, JPG) – die KI schlägt je Abschnitt Grammatikformen mit Fundstelle vor; übernommen wird nur, was du abhakst."
            loading={Boolean(liest)}
            minHeight={70}
          />
        </Card>
      )}

      {vorschlaege && (
        <VorschlagListe
          vorschlaege={vorschlaege}
          buch={buch}
          onChange={setVorschlaege}
          onVerwerfen={() => setVorschlaege(null)}
          onUebernehmen={() => {
            const r = uebernimmVorschlaege(band, vorschlaege, buch)
            if (!r.zahl) return notifyError('Nichts Neues zum Übernehmen angehakt.')
            setBand(r.band)
            setDirty(true)
            setVorschlaege(null)
            notifySuccess(`${r.zahl} ${r.zahl === 1 ? 'Grammatikpunkt' : 'Grammatikpunkte'} übernommen – jetzt prüfen und speichern.`)
          }}
        />
      )}

      <Card withBorder>
        <Text size="sm" fw={500} mb={4}>
          Unit
        </Text>
        <Chip.Group value={unit} onChange={(v) => typeof v === 'string' && setUnit(v)}>
          <Group gap={6}>
            {unitNamen.map((u) => {
              const n = Object.values(band[u] ?? {}).reduce((m, l) => m + l.length, 0)
              return (
                <Chip key={u} value={u} size="xs" data-grammatikformen-unit={u}>
                  {u}
                  {n ? ` (${n})` : ''}
                </Chip>
              )
            })}
          </Group>
        </Chip.Group>
      </Card>

      <Stack gap="sm">
        {unitAbschnitte.map((a) => {
          const punkte = punkteVon(unit, a)
          if (!punkte.length && !darf) return null
          return (
            <Card key={a || '(ganz)'} withBorder padding="sm" data-grammatikformen-abschnitt={a || 'ganz'}>
              <Group justify="space-between" mb={punkte.length ? 'xs' : 0}>
                <Text fw={600} size="sm" c={punkte.length ? undefined : 'dimmed'}>
                  {abschnittName(a)}
                  {!punkte.length ? ' – keine Grammatik' : ''}
                </Text>
                {darf && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => setAuswahl({ unit, abschnitt: a, wahl: { themen: [], teilformen: [] } })}
                  >
                    Form hinzufügen
                  </Button>
                )}
              </Group>
              <Stack gap={6}>
                {punkte.map((p, i) => (
                  <Group key={i} gap="xs" wrap="nowrap" align="flex-start" data-grammatikformen-punkt>
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      {darf ? (
                        <TextInput
                          size="xs"
                          value={p.text}
                          aria-label="Bezeichnung"
                          onChange={(e) => {
                            const t = e.currentTarget.value
                            setzePunkte(
                              unit,
                              a,
                              punkte.map((x, j) => (j === i ? { ...x, text: t } : x))
                            )
                          }}
                        />
                      ) : (
                        <Text size="sm">{p.text}</Text>
                      )}
                      <Group gap={4}>
                        {p.t.map((k) => (
                          <Tooltip key={k} label={k}>
                            <Badge size="sm" variant="light" color={kennungGueltig(k, fach) ? 'blue' : 'red'} tt="none">
                              {kennungLabel(k)}
                            </Badge>
                          </Tooltip>
                        ))}
                        {!p.t.length && (
                          <Text size="xs" c="dimmed">
                            ohne Katalogform (nur genannt)
                          </Text>
                        )}
                      </Group>
                    </Stack>
                    {darf && (
                      <Group gap={2} wrap="nowrap">
                        <Checkbox
                          size="xs"
                          label="Wdh."
                          title="Wiederholung eines früher eingeführten Themas"
                          checked={Boolean(p.w)}
                          onChange={(e) => {
                            const w = e.currentTarget.checked
                            setzePunkte(
                              unit,
                              a,
                              punkte.map((x, j) => (j === i ? (w ? { ...x, w: true as const } : { text: x.text, t: x.t }) : x))
                            )
                          }}
                          mr={4}
                        />
                        <ActionIcon
                          variant="subtle"
                          aria-label="Formen ändern"
                          onClick={() =>
                            setAuswahl({
                              unit,
                              abschnitt: a,
                              index: i,
                              wahl: { themen: p.t.filter((k) => !k.includes('/')), teilformen: p.t.filter((k) => k.includes('/')) }
                            })
                          }
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" aria-label="Nach oben" disabled={i === 0} onClick={() => setzePunkte(unit, a, verschiebe(punkte, i, -1))}>
                          <IconArrowUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Nach unten"
                          disabled={i === punkte.length - 1}
                          onClick={() => setzePunkte(unit, a, verschiebe(punkte, i, 1))}
                        >
                          <IconArrowDown size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Entfernen"
                          onClick={() =>
                            setzePunkte(
                              unit,
                              a,
                              punkte.filter((_, j) => j !== i)
                            )
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                ))}
              </Stack>
            </Card>
          )
        })}
      </Stack>

      <Modal
        opened={Boolean(auswahl)}
        onClose={() => setAuswahl(null)}
        size="xl"
        title={auswahl ? `${auswahl.index === undefined ? 'Form hinzufügen' : 'Formen ändern'} – ${auswahl.unit}, ${abschnittName(auswahl.abschnitt)}` : ''}
      >
        {auswahl && (
          <Stack>
            <GrammatikAuswahl
              query={{ subjectId: fach, grade: buch.grade ?? 13, stateId: buch.stateId, schoolTypeId: buch.schoolTypeId }}
              wahl={auswahl.wahl}
              onChange={(w) => setAuswahl({ ...auswahl, wahl: w })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAuswahl(null)}>
                Abbrechen
              </Button>
              <Button
                disabled={!auswahl.wahl.themen.length && !auswahl.wahl.teilformen.length}
                onClick={() => {
                  // Teilformen ersetzen ihr Thema (genauer); Themen ohne gewählte Teilform bleiben als Thema
                  const t = [...auswahl.wahl.themen.filter((id) => !auswahl.wahl.teilformen.some((k) => k.startsWith(`${id}/`))), ...auswahl.wahl.teilformen]
                  const liste = punkteVon(auswahl.unit, auswahl.abschnitt)
                  setzePunkte(
                    auswahl.unit,
                    auswahl.abschnitt,
                    auswahl.index === undefined ? [...liste, { text: textZu(t), t }] : liste.map((x, j) => (j === auswahl.index ? { ...x, t } : x))
                  )
                  setAuswahl(null)
                }}
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}

/** KI-Vorschläge zum Abhaken, Ändern (Unit, Abschnitt, Bezeichnung) oder Verwerfen */
function VorschlagListe({
  vorschlaege,
  buch,
  onChange,
  onUebernehmen,
  onVerwerfen
}: {
  vorschlaege: Vorschlag[]
  buch: TextbookMeta
  onChange: (v: Vorschlag[]) => void
  onUebernehmen: () => void
  onVerwerfen: () => void
}): React.JSX.Element {
  const setze = (nr: number, patch: Partial<Vorschlag>): void => onChange(vorschlaege.map((v) => (v.nr === nr ? { ...v, ...patch } : v)))
  const zahl = vorschlaege.filter((v) => v.gewaehlt && uebernehmbar(v, buch)).length
  return (
    <Card withBorder data-grammatikformen-vorschlaege>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Vorschläge der KI – bitte prüfen</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={onVerwerfen}>
            Alle verwerfen
          </Button>
          <Button size="xs" disabled={!zahl} onClick={onUebernehmen} data-grammatikformen-uebernehmen>
            {zahl} übernehmen
          </Button>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Angehakte Vorschläge kommen zu den vorhandenen dazu – nichts wird ersetzt. Danach noch „Speichern“.
      </Text>
      <Table striped fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>Unit</Table.Th>
            <Table.Th>Abschnitt</Table.Th>
            <Table.Th>Grammatik</Table.Th>
            <Table.Th>Fundstelle</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {vorschlaege.map((v) => {
            const unitDa = buch.units.find((u) => u.name === v.unit)
            const ok = uebernehmbar(v, buch)
            return (
              <Table.Tr key={v.nr} data-vorschlag-status={v.status}>
                <Table.Td>
                  <Checkbox
                    size="xs"
                    checked={v.gewaehlt && ok}
                    disabled={!ok}
                    aria-label="Übernehmen"
                    onChange={(e) => setze(v.nr, { gewaehlt: e.currentTarget.checked })}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    w={130}
                    data={buch.units.map((u) => u.name)}
                    value={unitDa ? v.unit : null}
                    placeholder={v.unit || 'Unit wählen'}
                    error={!unitDa}
                    onChange={(u) => u && setze(v.nr, { unit: u, abschnitt: '' })}
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    w={140}
                    data={[{ value: '(ganz)', label: 'Ganzes Kapitel' }, ...(unitDa?.sections.map((s) => ({ value: s.name, label: s.name })) ?? [])]}
                    value={unitDa && (v.abschnitt === '' || unitDa.sections.some((s) => s.name === v.abschnitt)) ? v.abschnitt || '(ganz)' : null}
                    placeholder={v.abschnitt || 'Abschnitt'}
                    onChange={(a) => a && setze(v.nr, { abschnitt: a === '(ganz)' ? '' : a })}
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput size="xs" value={v.text} onChange={(e) => setze(v.nr, { text: e.currentTarget.value })} aria-label="Bezeichnung" />
                  <Group gap={4} mt={4}>
                    {v.t.map((k) => (
                      <Badge key={k} size="xs" variant="light" tt="none" title={k}>
                        {kennungLabel(k)}
                      </Badge>
                    ))}
                    {v.status === 'vorhanden' && (
                      <Badge size="xs" color="gray">
                        schon vorhanden
                      </Badge>
                    )}
                    {!v.t.length && (
                      <Badge size="xs" color="orange" tt="none">
                        keine Katalogform erkannt
                      </Badge>
                    )}
                    {v.verworfen.length > 0 && (
                      <Text size="xs" c="dimmed">
                        unbekannt: {v.verworfen.join(', ')}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{v.fundstelle}</Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Card>
  )
}
