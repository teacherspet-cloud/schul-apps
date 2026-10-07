import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Container,
  Grid,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { AlleOptionen, NurExperte } from '../../../shared/components/NurExperte'
import { IconChalkboard, IconFolderOpen, IconInfoCircle, IconX } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { operatorenAuswahl } from '@shared/operatoren/zugriff'
import type { CefrTable } from '@shared/types'
import Formularfuss, { ersterGrund, FormularSeite, KeinKiZugang } from '../../../shared/components/Formularfuss'
import HaeufigSelect from '../../../shared/components/HaeufigSelect'
import MaterialWahl from '../../../shared/components/MaterialWahl'
import OperatorenWahl from '../../../shared/components/OperatorenWahl'
import SchulortFelder from '../../../shared/components/SchulortFelder'
import StoffQuellen from '../../../shared/components/StoffQuellen'
import { mitLerngruppe } from '../../../shared/lerngruppe'
import { wahlEintraege } from '../../../shared/operatorenWahl'
import { useKiZugang } from '../../../shared/useKiZugang'
import { notifyError } from '../../../shared/util'
import { gradeRange } from '../../arbeitsblatt/didactics/schoolProfiles'
import { SUBJECTS, subjectById } from '../../arbeitsblatt/model/subjects'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import BilingualSchalter from '../../arbeitsblatt/steps/BilingualSchalter'
import { setzeUndPruefe, tafelbildErzeugen } from '../auftrag'
import { FORMAT_IDS, formatInfo, type FormatId } from '../formate'
import { inhaltAusBoardPlan, ladeAppMaterial, tafelbilderDesBlatts, texteAus } from '../material'
import {
  standardSprache,
  standardStil,
  STRUKTUREN,
  type Regler,
  type Sprachniveau,
  type StrukturWahl,
  type Tafelbild,
  type TafelbildMeta,
  type ZeichnungQuelle
} from '../model'
import { useTafelbild } from '../store'
import { MASSSTAB_NAMEN, type ZeitMassstab } from '../zeitleiste'
import '../tafelbild.css'
import LernzielFeld from './LernzielFeld'

const LEERE_TABELLE: CefrTable = { version: 1, states: [] }

const QUELLEN: { value: ZeichnungQuelle; label: string; beschreibung: string }[] = [
  { value: 'skizzen', label: 'Skizzen im Tafelstil', beschreibung: 'Von der App gezeichnet: Pfeile, Piktogramme, schematische Zeichnungen' },
  { value: 'piktogramme', label: 'Piktogramme (OpenMoji)', beschreibung: 'Aus dem Vorrat der App' },
  { value: 'kibilder', label: 'KI-Bilder im Tafelstil', beschreibung: 'Über den Bild-KI-Zugang – höchstens zwei' },
  { value: 'fachdiagramme', label: 'Fachdiagramme', beschreibung: 'Zeitstrahl, Koordinatensystem, Schaltplan, Kartenskizze, Formeln' }
]

const stufe = (label: string, wert: number, data: string[], onChange: (v: number) => void, attr: string, start = 1): React.JSX.Element => (
  <div>
    <Text size="sm" fw={500} mb={4}>
      {label}
    </Text>
    <SegmentedControl
      fullWidth
      size="xs"
      value={String(wert)}
      onChange={(v) => onChange(Number(v))}
      data={data.map((l, i) => ({ value: String(i + start), label: l }))}
      data-tb-regler={attr}
    />
  </div>
)

/** Schritt 1: Lerngruppe, Thema, Material, Formate, Struktur, Regler, Varianten */
export default function Einrichten(): React.JSX.Element | null {
  const { dok: t, update, docId, setDok, setStep } = useTafelbild()
  const kiDa = useKiZugang()
  const [materialWahl, setMaterialWahl] = useState(false)
  const [blattTafeln, setBlattTafeln] = useState<{ name: string; ws: Worksheet } | null>(null)
  const m = t?.meta
  const auswahl = useMemo(
    () => (m ? operatorenAuswahl({ stateId: m.stateId, fach: m.subjectId, stufe: m.grade >= 11 ? 'sek2' : 'sek1', schulform: m.schoolTypeId }) : null),
    [m?.stateId, m?.subjectId, m?.grade, m?.schoolTypeId]
  )
  const eintraege = useMemo(
    () =>
      auswahl
        ? wahlEintraege(
            auswahl.operatoren.map((o) => ({ name: o.operator, synonyme: o.formen, definition: o.definition, afb: o.afb })),
            auswahl.sprache
          )
        : [],
    [auswahl]
  )
  if (!t || !m) return null

  const patch = (next: Partial<TafelbildMeta>, gruppe?: string): void =>
    update((d) => Object.assign(d.meta, next), gruppe ?? `tb-meta:${Object.keys(next).join(',')}`)
  const regler = (next: Partial<Regler>): void => update((d) => Object.assign(d.meta.regler, next))
  const range = gradeRange(LEERE_TABELLE, m.stateId, m.schoolTypeId)
  const jahrgaenge = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
  if (!jahrgaenge.includes(m.grade)) jahrgaenge.push(m.grade)
  // Textschwierigkeit und Stil folgen Jahrgang und Schulform, solange sie nicht von Hand gewählt sind
  const lerngruppeGeaendert = (d: Tafelbild): void => {
    if (!d.meta.regler.spracheGewaehlt) d.meta.regler.sprache = standardSprache(d.meta.grade, d.meta.schoolTypeName)
    if (!d.meta.regler.stilGewaehlt) d.meta.regler.stil = standardStil(d.meta.grade)
  }

  const foto = m.modus === 'foto'
  const hatFoto = m.stoffQuellen.some((q) => q.aktiv && q.bilder.length)
  const grund = ersterGrund(
    [!m.formate.length, 'Mindestens ein Format wählen'],
    [foto && !hatFoto, 'Foto des Tafelbilds fehlt'],
    [!foto && !m.thema.trim() && !m.stoffQuellen.some((q) => q.aktiv) && !m.appMaterial.some((a) => a.aktiv), 'Thema oder Material fehlt'],
    [!kiDa, <KeinKiZugang key="ki" />]
  )

  const appMaterialWaehlen = async (moduleId: string, id: string): Promise<void> => {
    setMaterialWahl(false)
    try {
      const { name, payload } = await ladeAppMaterial(moduleId, id)
      const text = texteAus(payload)
      update((d) => {
        d.meta.appMaterial = [...d.meta.appMaterial.filter((a) => !(a.moduleId === moduleId && a.id === id)), { moduleId, id, name, text, aktiv: true }]
        if (!d.meta.thema.trim())
          d.meta.thema = String(
            (payload as { meta?: { topic?: string; thema?: string } })?.meta?.topic ?? (payload as { meta?: { thema?: string } })?.meta?.thema ?? ''
          )
      })
      if (moduleId === 'arbeitsblatt' && tafelbilderDesBlatts(payload as Worksheet).length) setBlattTafeln({ name, ws: payload as Worksheet })
    } catch (e) {
      notifyError(e, 'Das Material konnte nicht geladen werden')
    }
  }

  // Tafelbild des Arbeitsblatts ohne KI übernehmen
  const blattTafelUebernehmen = async (): Promise<void> => {
    if (!blattTafeln) return
    try {
      const inhalt = inhaltAusBoardPlan(tafelbilderDesBlatts(blattTafeln.ws)[0])
      const e = await setzeUndPruefe(inhalt, m, null)
      setDok({ ...t, inhalt: e.inhalt, tafeln: e.tafeln, pruefung: e.pruefung })
      setBlattTafeln(null)
      setStep(1)
    } catch (err) {
      notifyError(err)
    }
  }

  const fuss = (
    <Formularfuss grund={grund}>
      <Button size="md" leftSection={<IconChalkboard size={18} />} disabled={Boolean(grund)} onClick={() => tafelbildErzeugen(t, docId)} data-tb-erstellen>
        {foto ? 'Tafelfoto übernehmen' : t.tafeln.length ? 'Tafelbild neu erstellen' : 'Tafelbild erstellen'}
      </Button>
    </Formularfuss>
  )

  return (
    <FormularSeite fuss={fuss}>
      <ScrollArea h="100%">
        <Container size="xl" py="md">
          <Title order={2}>Tafelbilder</Title>
          <Text c="dimmed" mb="md">
            Übersichtliche Tafelbilder zu jedem Thema – für Klapptafel, Whiteboard, Flipchart und Heft, mit Lückenfassung, schrittweisem Aufbau und Merksatz.
            Die Gestaltung folgt den Regeln aus Seminar- und Fachdidaktik: Leitfrage als Überschrift, Reduktion, Farben mit fester Bedeutung, lesbare Schrift.
          </Text>
          <Grid>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="sm">
                    Lerngruppe
                  </Title>
                  <Stack gap="sm">
                    <SchulortFelder
                      table={LEERE_TABELLE}
                      stateId={m.stateId}
                      schoolTypeId={m.schoolTypeId}
                      schoolTypeName={m.schoolTypeName}
                      searchable
                      onChange={(p) =>
                        update((d) => {
                          Object.assign(d.meta, mitLerngruppe(LEERE_TABELLE, d.meta, p))
                          lerngruppeGeaendert(d)
                        })
                      }
                    />
                    <Group grow align="flex-start">
                      <HaeufigSelect
                        art="fach"
                        label="Fach"
                        data={SUBJECTS.map((s) => ({ value: s.id, label: s.label }))}
                        value={m.subjectId}
                        onChange={(v) => v && patch({ subjectId: v, subjectLabel: subjectById(v).label, operatoren: [] })}
                        allowDeselect={false}
                        searchable
                      />
                      <Select
                        label="Jahrgang"
                        data={jahrgaenge.sort((a, b) => a - b).map((g) => ({ value: String(g), label: `Klasse ${g}` }))}
                        value={String(m.grade)}
                        onChange={(v) =>
                          v &&
                          update((d) => {
                            d.meta.grade = Number(v)
                            lerngruppeGeaendert(d)
                          })
                        }
                        allowDeselect={false}
                      />
                    </Group>
                    <BilingualSchalter
                      meta={m}
                      onChange={(bilingual) =>
                        update((d) => {
                          if (bilingual) d.meta.bilingual = bilingual
                          else delete d.meta.bilingual
                        })
                      }
                    />
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={4} mb="sm">
                    Thema und Ziel
                  </Title>
                  <Stack gap="sm">
                    <SegmentedControl
                      value={m.modus}
                      onChange={(v) => patch({ modus: v as TafelbildMeta['modus'] })}
                      data={[
                        { value: 'neu', label: 'Neues Tafelbild' },
                        { value: 'foto', label: 'Foto eines Tafelbilds übernehmen' }
                      ]}
                      data-tb-modus
                    />
                    {foto && (
                      <Alert color="blue" icon={<IconInfoCircle size={16} />} p="xs">
                        Ein Foto des echten (auch handgeschriebenen) Tafelbilds hierunter hineinziehen: Die KI überträgt Texte, Kästen, Pfeile und Farben in ein
                        sauberes, bearbeitbares Tafelbild.
                      </Alert>
                    )}
                    <TextInput
                      label="Thema"
                      placeholder="z. B. Ursachen des Scheiterns der Weimarer Republik"
                      value={m.thema}
                      onChange={(e) => patch({ thema: e.currentTarget.value }, 'tb-thema')}
                      data-tb-thema
                    />
                    <LernzielFeld meta={m} kiDa={kiDa} onChange={(lernziel) => patch({ lernziel }, 'tb-lernziel')} />
                    <Textarea
                      label="Weitere Wünsche (optional)"
                      placeholder="z. B. mit Bezug auf die Karikatur der letzten Stunde"
                      autosize
                      minRows={1}
                      value={m.wuensche}
                      onChange={(e) => patch({ wuensche: e.currentTarget.value }, 'tb-wuensche')}
                    />
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={4} mb="sm">
                    Material {foto ? '(Foto des Tafelbilds)' : '(optional)'}
                  </Title>
                  <Stack gap="sm">
                    <StoffQuellen
                      quellen={m.stoffQuellen}
                      onHinzu={(neu) => update((d) => void (d.meta.stoffQuellen = [...d.meta.stoffQuellen, ...neu]))}
                      onAktiv={(id, aktiv) =>
                        update((d) => {
                          const q = d.meta.stoffQuellen.find((x) => x.id === id)
                          if (q) q.aktiv = aktiv
                        })
                      }
                      onEntfernen={(id) => update((d) => void (d.meta.stoffQuellen = d.meta.stoffQuellen.filter((x) => x.id !== id)))}
                      title={foto ? 'Foto des Tafelbilds hierher ziehen' : 'Texte, Arbeitsblätter, Fotos oder PDFs hierher ziehen'}
                      hint="Foto, PDF, Word, Text – auch handschriftlich"
                      erklaerung="Die KI wertet das Material aus und fasst das Wesentliche im Tafelbild zusammen – Fachbegriffe, Beispiele und Reihenfolge werden übernommen."
                    />
                    <Group gap="xs">
                      <Button variant="default" size="xs" leftSection={<IconFolderOpen size={14} />} onClick={() => setMaterialWahl(true)} data-tb-appmaterial>
                        Material aus der App als Grundlage …
                      </Button>
                    </Group>
                    {m.appMaterial.map((a) => (
                      <Group key={`${a.moduleId}:${a.id}`} gap="xs" wrap="nowrap">
                        <Checkbox
                          size="xs"
                          checked={a.aktiv}
                          aria-label={`${a.name} verwenden`}
                          onChange={(e) => {
                            const aktiv = e.currentTarget.checked
                            update((d) => {
                              const x = d.meta.appMaterial.find((y) => y.id === a.id && y.moduleId === a.moduleId)
                              if (x) x.aktiv = aktiv
                            })
                          }}
                        />
                        <Badge size="xs" variant="light">
                          {a.moduleId}
                        </Badge>
                        <Text size="xs" style={{ flex: 1 }} truncate>
                          {a.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {Math.round(a.text.length / 100) / 10}k Zeichen
                        </Text>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          aria-label={`${a.name} entfernen`}
                          onClick={() =>
                            update((d) => void (d.meta.appMaterial = d.meta.appMaterial.filter((y) => !(y.id === a.id && y.moduleId === a.moduleId))))
                          }
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      </Group>
                    ))}
                    {blattTafeln && (
                      <Alert color="teal" p="xs" title="Das Arbeitsblatt hat schon ein Tafelbild">
                        <Group gap="xs">
                          <Text size="xs">„{blattTafeln.name}" enthält ein Tafelbild. Es lässt sich ohne KI direkt übernehmen und hier weiterbearbeiten.</Text>
                          <Button size="xs" variant="light" onClick={() => void blattTafelUebernehmen()} data-tb-blatttafel>
                            Ohne KI übernehmen
                          </Button>
                        </Group>
                      </Alert>
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 5 }}>
              <Stack>
                <Card withBorder>
                  <Title order={4} mb="xs">
                    Formate
                  </Title>
                  <Text size="xs" c="dimmed" mb="xs">
                    Jedes gewählte Format bekommt ein eigenes, passend gesetztes Tafelbild.
                  </Text>
                  <Chip.Group multiple value={m.formate} onChange={(v) => patch({ formate: FORMAT_IDS.filter((f) => v.includes(f)) as FormatId[] })}>
                    <Stack gap={6}>
                      {FORMAT_IDS.map((f) => (
                        <Tooltip key={f} label={formatInfo(f).beschreibung} multiline w={300} position="left">
                          <Chip value={f} data-tb-format={f}>
                            {formatInfo(f).label}
                          </Chip>
                        </Tooltip>
                      ))}
                    </Stack>
                  </Chip.Group>
                </Card>

                <NurExperte>
                  <Card withBorder>
                    <Title order={4} mb="xs">
                      Struktur
                    </Title>
                    <Select
                      data={STRUKTUREN.map((s) => ({ value: s.value, label: s.label }))}
                      value={m.struktur}
                      onChange={(v) => v && patch({ struktur: v as StrukturWahl })}
                      allowDeselect={false}
                      description={STRUKTUREN.find((s) => s.value === m.struktur)?.beschreibung}
                      data-tb-struktur
                    />
                    {(m.struktur === 'zeitleiste' || m.struktur === 'auto') && (
                      <div style={{ marginTop: 8 }}>
                        <Text size="sm" fw={500} mb={4}>
                          Abstände auf einer Zeitleiste
                        </Text>
                        <SegmentedControl
                          fullWidth
                          size="xs"
                          value={m.zeitachse ?? 'auto'}
                          onChange={(v) => patch({ zeitachse: v as ZeitMassstab })}
                          data={(Object.keys(MASSSTAB_NAMEN) as ZeitMassstab[]).map((z) => ({ value: z, label: MASSSTAB_NAMEN[z] }))}
                          data-tb-zeitachse
                        />
                        <Text size="xs" c="dimmed" mt={2}>
                          {m.zeitachse === 'massstab'
                            ? 'Marken im wahren Zeitabstand.'
                            : m.zeitachse === 'gleich'
                            ? 'Marken im gleichen Abstand – gut bei sehr ungleichen Zeiträumen.'
                            : 'Maßstabsgerecht, wenn die Jahreszahlen dabei lesbar bleiben; sonst gleiche Abstände.'}
                        </Text>
                      </div>
                    )}
                  </Card>
                </NurExperte>

                <NurExperte>
                  <Card withBorder>
                    <Title order={4} mb="xs">
                      Umfang und Sprache
                    </Title>
                    <Stack gap="sm">
                      {stufe('Detailgrad', m.regler.detail, ['knapp', 'mittel', 'ausführlich'], (v) => regler({ detail: v as 1 | 2 | 3 }), 'detail')}
                      {stufe(
                        'Zeichnungen und Symbole',
                        m.regler.zeichnungen,
                        ['keine', 'einige', 'viele'],
                        (v) => regler({ zeichnungen: v as 0 | 1 | 2 }),
                        'zeichnungen',
                        0
                      )}
                      {stufe('Textmenge', m.regler.textmenge, ['knapp', 'mittel', 'viel'], (v) => regler({ textmenge: v as 1 | 2 | 3 }), 'textmenge')}
                      <div>
                        <Text size="sm" fw={500} mb={4}>
                          Textschwierigkeit
                        </Text>
                        <SegmentedControl
                          fullWidth
                          size="xs"
                          value={m.regler.sprache}
                          onChange={(v) => regler({ sprache: v as Sprachniveau, spracheGewaehlt: true })}
                          data={[
                            { value: 'einfach', label: 'Einfache Sprache' },
                            { value: 'standard', label: 'Standard' },
                            { value: 'fach', label: 'Fachsprache' }
                          ]}
                        />
                        <Text size="xs" c="dimmed" mt={2}>
                          {m.regler.spracheGewaehlt ? 'Von Hand gewählt' : `Voreingestellt nach Klasse ${m.grade} und Schulform`}
                        </Text>
                      </div>
                      <SegmentedControl
                        fullWidth
                        size="xs"
                        value={m.regler.stil}
                        onChange={(v) => regler({ stil: v as Regler['stil'], stilGewaehlt: true })}
                        data={[
                          { value: 'stichpunkte', label: 'Stichpunkte' },
                          { value: 'ausformuliert', label: 'Ausformuliert' }
                        ]}
                        data-tb-stil
                      />
                    </Stack>
                  </Card>
                </NurExperte>

                <NurExperte>
                  <Card withBorder>
                    <Title order={4} mb="xs">
                      Zeichnungen aus
                    </Title>
                    <Stack gap={6}>
                      {QUELLEN.map((q) => (
                        <Checkbox
                          key={q.value}
                          label={q.label}
                          description={q.beschreibung}
                          checked={m.quellen.includes(q.value)}
                          disabled={m.regler.zeichnungen === 0}
                          onChange={(e) => {
                            const an = e.currentTarget.checked
                            update((d) => void (d.meta.quellen = an ? [...d.meta.quellen, q.value] : d.meta.quellen.filter((x) => x !== q.value)))
                          }}
                        />
                      ))}
                    </Stack>
                  </Card>
                </NurExperte>

                <NurExperte>
                  <Card withBorder>
                    <Title order={4} mb="xs">
                      Varianten
                    </Title>
                    <Stack gap={6}>
                      {(
                        [
                          ['luecke', 'Lückentafelbild', 'Fachbegriffe als gleich lange Lücken, mit Wortspeicher'],
                          ['schritte', 'Schrittweiser Aufbau', 'Reihenfolge der Elemente = Präsentationsschritte, mit Planungshilfe'],
                          ['niveaus', 'Differenziert ★ / ★★ / ★★★', 'Kern für alle, Aspekte und Vertiefung zuschaltbar'],
                          ['merksatz', 'Merksatz- / Sicherungskasten', 'Ein einprägsamer Merksatz (höchstens 25 Wörter)']
                        ] as const
                      ).map(([k, label, text]) => (
                        <Switch
                          key={k}
                          label={label}
                          description={text}
                          checked={m.varianten[k]}
                          onChange={(e) => {
                            const an = e.currentTarget.checked
                            update((d) => void (d.meta.varianten[k] = an))
                          }}
                          data-tb-variante={k}
                        />
                      ))}
                    </Stack>
                  </Card>
                </NurExperte>

                <NurExperte>
                  <Card withBorder>
                    <Title order={4} mb="xs">
                      Operatoren für Impuls und Hausaufgabe
                    </Title>
                    {eintraege.length ? (
                      <OperatorenWahl
                        eintraege={eintraege}
                        gewaehlt={m.operatoren}
                        onChange={(operatoren) => patch({ operatoren })}
                        quelle={auswahl?.quelle}
                        stand={auswahl?.stand}
                      />
                    ) : (
                      <Text size="xs" c="dimmed">
                        Für dieses Fach und Land liegt keine Operatorenliste vor – die KI formuliert Arbeitsaufträge mit gängigen Operatoren.
                      </Text>
                    )}
                  </Card>
                </NurExperte>
                <AlleOptionen />
              </Stack>
            </Grid.Col>
          </Grid>
        </Container>
      </ScrollArea>
      <MaterialWahl
        offen={materialWahl}
        schliessen={() => setMaterialWahl(false)}
        programme={['arbeitsblatt', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'vokabeltest', 'tafelbild']}
        onWahl={(mod, id) => void appMaterialWaehlen(mod, id)}
      />
    </FormularSeite>
  )
}
