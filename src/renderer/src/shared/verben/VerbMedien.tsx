/**
 * Bild und Aussprache in den Listen unregelmäßiger Verben (07.10.2026, Wunsch der Lehrkraft): je Verb ein Bild, die
 * Aussprache aller Formen (infinitive, simple past, past participle) und des Hinweises bzw. Beispiels – weiblich
 * und männlich wie bei den Vokabeln.
 *
 * Abgelegt in der Medienbank unter der Grundform („go"): Damit übernimmt jeder Band, was es zu dem Verb schon gibt
 * (Green Line 2 von Green Line 3 und umgekehrt), und auch ein Bild aus den Vokabellisten gilt mit. Die Formen und der
 * Hinweis liegen als „Sätze" im Eintrag der Grundform (shared/medien/medienAuftrag.ts, Arten „formen"/„hinweis").
 */
import { ActionIcon, Alert, Badge, Button, Group, Text, Tooltip } from '@mantine/core'
import { IconMessage2, IconPhotoSearch, IconSparkles, IconVolume } from '@tabler/icons-react'
import { useState } from 'react'
import { saetzeVon, satzSchluessel, sprachKurz, STIMMLAGE_NAME, type MedienSicht, type Stimmlage } from '@shared/medienbank'
import { istLeerform, VERB_SPALTEN, type VerbEintrag, type VerbSprache } from '@shared/verben'
import { sprechText } from '@shared/sprechtext'
import { notifyError } from '../util'
import { useLaufendeSchluessel } from '../auftraege'
import { tonErzeugen, type Vokabel } from '../medien/medienbank'
import { lagenVon, medienGeaendert, medienSchluessel, offeneVokabeln, starteMedienAuftrag, type MedienArt, type MedienZiel } from '../medien/medienAuftrag'
import { spiele, useStandardstimmen } from '../medien/MedienUi'

/** Schlüssel in der Medienbank und gesprochener Text – gemeinsam mit den Lernenden (shared/verbTraining.ts, 07.10.2026) */
export { medienSchluesselVerb as verbSchluessel, sprechtext } from '@shared/verbTraining'
import { formGesprochen, formSchluessel, medienSchluesselVerb as verbSchluessel } from '@shared/verbTraining'

/**
 * Die Formen einer Zeile (ohne die deutsche Bedeutung und ohne „—"): `text` = Schlüssel der Aufnahme (wie bisher),
 * `gesprochen` = was die Stimme sagt (09.10.2026: Varianten mit Pause statt „slash", „read" der Vergangenheit /rɛd/)
 */
export function sprechFormen(e: VerbEintrag, sprache: VerbSprache): { label: string; text: string; gesprochen: string }[] {
  return VERB_SPALTEN[sprache]
    .filter((s) => !s.deutsch && !istLeerform(e.formen[s.id]))
    .map((s) => ({ label: s.label, text: formSchluessel(e.formen[s.id], sprache, s.id), gesprochen: formGesprochen(e.formen[s.id], sprache, s.id) }))
    .filter((f) => f.text && f.gesprochen)
}

/** Eine Zeile als „Vokabel" für Medienbank und Aufträge */
export function alsVokabel(e: VerbEintrag, sprache: VerbSprache): Vokabel {
  const de = VERB_SPALTEN[sprache].find((s) => s.deutsch)
  return {
    term: verbSchluessel(e, sprache),
    translation: (de && e.formen[de.id]) || '',
    formen: sprechFormen(e, sprache).map((f) => f.text),
    formenGesprochen: Object.fromEntries(sprechFormen(e, sprache).map((f) => [f.text, f.gesprochen])),
    ...(e.hinweis?.trim() ? { hinweis: e.hinweis.trim() } : {})
  }
}

/** Ein Abspiel- bzw. Erzeugen-Knopf für einen Text */
function TextTon({
  sprache,
  wort,
  text,
  gesprochen,
  label,
  sicht,
  lage,
  stimme,
  admin,
  icon
}: {
  sprache: string
  wort: string
  text: string
  /** Was die Stimme sagt (09.10.2026) – fehlt = der Text */
  gesprochen?: string
  label: string
  sicht?: MedienSicht
  lage: Stimmlage
  stimme?: string
  admin: boolean
  icon: React.ReactNode
}): React.JSX.Element | null {
  const [laeuft, setLaeuft] = useState(false)
  const ton = saetzeVon(sicht, lage)?.[satzSchluessel(text)]
  if (ton)
    return (
      <Tooltip label={`${label}: „${text}" (${STIMMLAGE_NAME[lage]})`}>
        <ActionIcon
          size="sm"
          variant="light"
          onClick={() => spiele(ton)}
          aria-label={`${label} „${text}" anhören (${STIMMLAGE_NAME[lage]})`}
          data-verb-ton={lage}
        >
          {icon}
        </ActionIcon>
      </Tooltip>
    )
  if (!admin || !stimme) return null
  return (
    <Tooltip label={`${label}: Aussprache erzeugen (${STIMMLAGE_NAME[lage]})`}>
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        loading={laeuft}
        aria-label={`${label} „${text}" – Aussprache erzeugen (${STIMMLAGE_NAME[lage]})`}
        data-verb-ton-erzeugen={lage}
        onClick={() => {
          setLaeuft(true)
          void tonErzeugen(sprachKurz(sprache), wort, 'satz', text, stimme, lage, gesprochen)
            .then(() => medienGeaendert(sprache))
            .catch((e: unknown) => notifyError(e, 'Keine Aussprache'))
            .finally(() => setLaeuft(false))
        }}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  )
}

/** Zelle „Aussprache": je Fassung eine Zeile mit einem Knopf je Form */
export function FormenTonZelle({
  sprache,
  zeile,
  verbSprache,
  sicht,
  admin
}: {
  sprache: string
  zeile: VerbEintrag
  verbSprache: VerbSprache
  sicht?: MedienSicht
  admin: boolean
}): React.JSX.Element {
  const stimmen = useStandardstimmen(sprache)
  const lagen = lagenVon(stimmen ?? undefined)
  const wort = verbSchluessel(zeile, verbSprache)
  const formen = sprechFormen(zeile, verbSprache)
  if (!wort || !formen.length)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    )
  return (
    <Group gap={6} wrap="nowrap" data-verb-formen-ton>
      {(lagen.length ? lagen : (['w', 'm'] as Stimmlage[])).map((l) => (
        <Group key={l} gap={1} wrap="nowrap" data-lage={l}>
          {formen.map((f) => (
            <TextTon
              key={f.label}
              sprache={sprache}
              wort={wort}
              text={f.text}
              gesprochen={f.gesprochen}
              label={f.label}
              sicht={sicht}
              lage={l}
              stimme={stimmen?.[l]}
              admin={admin}
              icon={<IconVolume size={13} />}
            />
          ))}
          <Text size="10px" c="dimmed" fw={600}>
            {l}
          </Text>
        </Group>
      ))}
    </Group>
  )
}

/** Zelle „Aussprache Hinweis" */
export function HinweisTonZelle({
  sprache,
  zeile,
  verbSprache,
  sicht,
  admin
}: {
  sprache: string
  zeile: VerbEintrag
  verbSprache: VerbSprache
  sicht?: MedienSicht
  admin: boolean
}): React.JSX.Element | null {
  const stimmen = useStandardstimmen(sprache)
  const lagen = lagenVon(stimmen ?? undefined)
  const wort = verbSchluessel(zeile, verbSprache)
  const text = zeile.hinweis?.trim()
  if (!wort || !text) return null
  return (
    <Group gap={4} wrap="nowrap" data-verb-hinweis-ton>
      {(lagen.length ? lagen : (['w', 'm'] as Stimmlage[])).map((l) => (
        <Group key={l} gap={1} wrap="nowrap" data-lage={l}>
          <TextTon
            sprache={sprache}
            wort={wort}
            text={text}
            gesprochen={sprechText(text, sprachKurz(sprache))}
            label="Hinweis"
            sicht={sicht}
            lage={l}
            stimme={stimmen?.[l]}
            admin={admin}
            icon={<IconMessage2 size={13} />}
          />
          <Text size="10px" c="dimmed" fw={600}>
            {l}
          </Text>
        </Group>
      ))}
    </Group>
  )
}

/** Leiste für Admins: Bilder und Aussprache für alle Verben der Liste – als Aufträge im Hintergrund */
export function VerbMedienLeiste({
  sprache,
  vokabeln,
  daten,
  ziel,
  bildKi
}: {
  sprache: string
  vokabeln: Vokabel[]
  daten: Record<string, MedienSicht>
  ziel: MedienZiel
  bildKi: boolean
}): React.JSX.Element {
  const stimmen = useStandardstimmen(sprache)
  const lagen = lagenVon(stimmen ?? undefined)
  const laufend = useLaufendeSchluessel(ziel.docId)
  const stufe = ziel.stufe ?? 's2'
  const offen = (art: MedienArt): Vokabel[] => offeneVokabeln(art, vokabeln, daten, lagen.length ? lagen : ['w'], stufe, sprachKurz(sprache))
  const ohneStimme = stimmen !== null && !lagen.length
  const knopf = (art: MedienArt, label: string, icon: React.ReactNode, braucheStimme = false): React.JSX.Element => {
    const liste = offen(art)
    const laeuft = laufend.has(medienSchluessel(art))
    return (
      <Button
        size="xs"
        leftSection={icon}
        loading={laeuft}
        disabled={laeuft || !liste.length || (braucheStimme && ohneStimme)}
        onClick={() => void starteMedienAuftrag({ art, sprache: sprachKurz(sprache), vokabeln: liste, ziel })}
        data-verb-medien={art}
      >
        {label} ({liste.length})
      </Button>
    )
  }
  return (
    <Alert color="violet" variant="light" p="xs" data-verb-medien-leiste>
      <Group gap="xs" wrap="wrap">
        <Badge color="violet" variant="filled">
          Admin
        </Badge>
        <Text size="sm">Medien für {vokabeln.length} Verben:</Text>
        {knopf('bilder', 'Bilder suchen', <IconPhotoSearch size={14} />)}
        {bildKi && knopf('bildKi', 'Bilder von KI generieren lassen', <IconSparkles size={14} />)}
        {knopf('formen', 'Aussprache der Formen', <IconVolume size={14} />, true)}
        {knopf('hinweis', 'Aussprache der Hinweise', <IconMessage2 size={14} />, true)}
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        Gilt für alle Bände: Was es zu einem Verb schon gibt (auch aus einem anderen Band oder den Vokabellisten), wird übernommen – erzeugt wird nur, was
        fehlt.{ohneStimme ? ' Für die Aussprache fehlt eine Standardstimme (Einstellungen › Bilder und Hörtexte).' : ''}
      </Text>
    </Alert>
  )
}
