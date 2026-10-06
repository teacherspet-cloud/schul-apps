import { Alert, Badge, Checkbox, Group, ScrollArea, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import {
  abweichungsHinweis,
  GRAMMAR_TOPICS,
  grammarFormatLabel,
  grammarQueryForMeta,
  grammarTopicsForMeta,
  teilformenFuer,
  LANGUAGE_SEQUENCES,
  learningYear,
  sequenceOf,
  needsSequence,
  topicStart,
  ueberNiveau
} from '../didactics/grammar'
import type { GrammarTopic } from '../didactics/grammar'
import type { WorksheetMeta } from '../model/types'

const sequenceLabel = (seq: string): string => LANGUAGE_SEQUENCES.find((s) => s.value === seq)?.label ?? 'Fremdsprache'

/**
 * Auswahl der Grammatikthemen – das Gegenstück zum Vokabel-Picker.
 *
 * Gezeigt wird, was für Fach, Fremdsprachenfolge und Lernjahr üblich ist, mit einem Jahr
 * Spielraum nach oben und unten. Die Lehrkraft kann das Fenster jederzeit aufmachen und die
 * gesamte Liste des Fachs sehen: Die Zuordnung ist eine Orientierung, kein Lehrplanzitat.
 *
 * Zu jedem Thema stehen die typischen Fehlerquellen und die Übungsformate, die dazu passen –
 * beides fließt in den Auftrag an die KI ein, statt dass sie es selbst erfinden muss.
 */
export default function GrammarPicker({ meta, onChange }: { meta: WorksheetMeta; onChange: (patch: Partial<WorksheetMeta>) => void }): React.JSX.Element {
  const [all, setAll] = useState(false)
  const [search, setSearch] = useState('')
  const chosen = meta.grammarTopics ?? []
  const sequence = sequenceOf(meta)
  const daz = meta.subjectId === 'daz'

  const fitting = grammarTopicsForMeta(meta)
  const fittingIds = new Set(fitting.map((t) => t.id))
  const pool = all ? GRAMMAR_TOPICS.filter((t) => t.subject === meta.subjectId) : fitting
  const needle = search.trim().toLowerCase()
  const visible = needle ? pool.filter((t) => `${t.label} ${t.term} ${t.area}`.toLowerCase().includes(needle)) : pool

  // Nach Bereich gruppieren, innerhalb des Bereichs nach Stufe
  const groups = new Map<string, GrammarTopic[]>()
  for (const t of visible) groups.set(t.area, [...(groups.get(t.area) ?? []), t])
  for (const list of groups.values()) list.sort((a, b) => a.from - b.from || a.label.localeCompare(b.label))

  const toggle = (id: string): void =>
    onChange({
      grammarTopics: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id],
      // Teilformen eines abgewählten Themas fallen mit weg
      ...(chosen.includes(id) ? { grammarTeilformen: teilWahl.filter((x) => !x.startsWith(`${id}/`)) } : {})
    })
  // Teilformen (Recherche 06.10.2026): keine gewählt = alle, die zur Lerngruppe passen
  const teilWahl = meta.grammarTeilformen ?? []
  const query = grammarQueryForMeta(meta)
  const teilUmschalten = (key: string): void => onChange({ grammarTeilformen: teilWahl.includes(key) ? teilWahl.filter((x) => x !== key) : [...teilWahl, key] })

  const picked = chosen.map((id) => GRAMMAR_TOPICS.find((t) => t.id === id)).filter((t): t is GrammarTopic => Boolean(t))
  const year = learningYear(meta.grade, sequence, meta.stateId)
  const scaleWord = daz ? 'Erwerbsstufe' : meta.subjectId === 'deutsch' ? 'Jahrgang' : 'Lernjahr'
  // Das gewählte GER-Niveau begrenzt die Auswahl nach oben (Fremdsprachen; grammarTopicsFor)
  const niveau = needsSequence(meta.subjectId) && meta.cefrLevel ? meta.cefrLevel : undefined

  return (
    <Stack gap="xs">
      {needsSequence(meta.subjectId) && (
        <Alert color="gray" p="xs">
          <Text size="xs">
            {sequenceLabel(sequence)} in Klasse {meta.grade} = <b>{year}. Lernjahr</b>. Danach richtet sich die Auswahl – der Jahrgang allein genügt nicht:
            Dieselbe Klasse {meta.grade} steht je nach Folge im ersten oder im dritten Lernjahr. Die Fremdsprachenfolge lässt sich oben unter „Fremdsprache"
            ändern.
          </Text>
          {meta.grade >= 10 && (
            <Switch
              mt={6}
              size="xs"
              label="Spät beginnende Fremdsprache (Beginn in der Oberstufe)"
              description="Eigene, stark verdichtete Progression – vor allem in Spanisch."
              checked={Boolean(meta.lateStartLanguage)}
              onChange={(e) => onChange({ lateStartLanguage: e.currentTarget.checked })}
            />
          )}
        </Alert>
      )}

      {daz && (
        <Select
          label="Erreichte Erwerbsstufe"
          description="Themen mehr als eine Stufe darüber werden ausgeblendet: Solche Strukturen lassen sich noch nicht verarbeiten, egal wie gut das Blatt ist."
          data={[
            { value: '', label: 'nicht bekannt – alle Themen zeigen' },
            { value: '0', label: 'Stufe 0: feste Wendungen' },
            { value: '1', label: 'Stufe 1: einfacher Satz, Verbzweitstellung' },
            { value: '2', label: 'Stufe 2: Klammerstruktur' },
            { value: '3', label: 'Stufe 3: Inversion, besetztes Vorfeld' },
            { value: '4', label: 'Stufe 4: Nebensatz mit Verbendstellung' },
            { value: '5', label: 'Stufe 5: eingeschobene Nebensätze' },
            { value: '6', label: 'Stufe 6: Bildungssprache' }
          ]}
          value={meta.acquisitionStage === undefined ? '' : String(meta.acquisitionStage)}
          onChange={(v) => onChange({ acquisitionStage: v ? Number(v) : undefined })}
          allowDeselect={false}
        />
      )}

      <Group justify="space-between" align="flex-end">
        <TextInput
          style={{ flex: 1 }}
          label="Grammatikthema"
          description={`Gezeigt wird, was im ${scaleWord} ${daz ? '' : String(meta.subjectId === 'deutsch' ? meta.grade : year) + ' '}üblich ist${niveau ? ` und zum Niveau ${niveau} passt` : ''}. Die Zuordnung ist eine Orientierung, kein Lehrplanzitat.`}
          placeholder="suchen …"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Switch label="Alle Themen des Fachs" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} mb={6} />
      </Group>

      {picked.length > 1 && (
        <Alert color="orange" p="xs">
          <Text size="xs">
            Ein Blatt trägt in der Regel genau ein Grammatikthema: Alles darauf dient dann derselben Form. Mehrere sind für ein Wiederholungsblatt sinnvoll –
            sonst zerfällt das Blatt.
          </Text>
        </Alert>
      )}

      <ScrollArea.Autosize mah={280} type="auto">
        <Stack gap={2}>
          {[...groups.entries()].map(([area, list]) => (
            <div key={area}>
              <Text size="xs" fw={600} c="dimmed" mt={6} mb={2}>
                {area}
              </Text>
              {list.map((t) => (
                <Checkbox
                  key={t.id}
                  size="xs"
                  mb={3}
                  checked={chosen.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  label={
                    <Group gap={6} wrap="wrap">
                      <Text size="xs" span>
                        {t.label}
                      </Text>
                      {t.term && t.term !== t.label && (
                        <Text size="xs" span c="dimmed" fs="italic">
                          {t.term}
                        </Text>
                      )}
                      <Badge
                        size="xs"
                        variant="light"
                        color={ueberNiveau(t, niveau) ? 'orange' : 'gray'}
                        data-ueber-niveau={ueberNiveau(t, niveau) || undefined}
                      >
                        {t.level}
                      </Badge>
                      {all && !fittingIds.has(t.id) && (
                        <Badge size="xs" variant="light" color="blue">
                          {scaleWord} {t.stage}
                        </Badge>
                      )}
                      {t.receptive && (
                        <Badge size="xs" variant="light" color="teal" title="Zunächst nur erkennen, nicht selbst bilden">
                          nur erkennen
                        </Badge>
                      )}
                      {t.contested && (
                        <Badge size="xs" variant="light" color="orange" title={`Die Quellen nennen ${scaleWord} ${t.from} bis ${t.to}.`}>
                          Quellen uneins
                        </Badge>
                      )}
                      {abweichungsHinweis(t, query) && (
                        <Badge size="xs" variant="light" color="grape" title={abweichungsHinweis(t, query)} data-land-abweichung>
                          {meta.stateId}
                        </Badge>
                      )}
                      {(t.teilformen?.length ?? 0) > 0 && (
                        <Text size="xs" span c="dimmed">
                          · {t.teilformen!.length} Teilformen
                        </Text>
                      )}
                    </Group>
                  }
                />
              ))}
            </div>
          ))}
          {!visible.length && (
            <Text size="xs" c="dimmed" py="sm">
              Kein Thema gefunden. Mit dem Schalter „Alle Themen des Fachs" erscheint die gesamte Liste.
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>

      {picked.map((t) => (
        <Alert key={t.id} color="gray" p="xs" title={t.label}>
          <Stack gap={2}>
            {t.description && <Text size="xs">{t.description}</Text>}
            {t.examples && t.examples.length > 0 && (
              <Text size="xs">
                <b>Beispiele:</b> {t.examples.join(' · ')}
              </Text>
            )}
            {t.errors && (
              <Text size="xs">
                <b>Typische Fehler:</b> {t.errors}
              </Text>
            )}
            {t.formats.length > 0 && (
              <Text size="xs">
                <b>Passende Übungsformate:</b> {t.formats.map(grammarFormatLabel).join(' · ')}
              </Text>
            )}
            {t.source && (
              <Text size="xs" c="dimmed">
                Einordnung: {t.source}
              </Text>
            )}
            {t.contested && (
              <Text size="xs" c="orange">
                Die ausgewerteten Lehrpläne und Lehrwerke setzen dieses Thema zwischen {scaleWord} {topicStart(t, sequence)} und {t.to} an – bitte prüfen, ob es
                zur Lerngruppe passt.
              </Text>
            )}
            {ueberNiveau(t, niveau) && (
              <Text size="xs" c="orange">
                Eingeführt auf {t.level} – deutlich über dem gewählten Niveau {niveau}. Bitte prüfen, ob es zur Lerngruppe passt.
              </Text>
            )}
            {t.receptive && (
              <Text size="xs" c="teal">
                Auf dieser Stufe zunächst nur erkennen, nicht selbst bilden – das Blatt sollte keine Produktionsaufgabe dazu enthalten.
              </Text>
            )}
            {(t.erkennen || t.bilden || t.sicher) && (
              <Text size="xs">
                <b>GER:</b>{' '}
                {[t.erkennen && `erkennen ${t.erkennen}`, t.bilden && `bilden ${t.bilden}`, t.sicher && `sicher ${t.sicher}`].filter(Boolean).join(' · ')}
              </Text>
            )}
            {abweichungsHinweis(t, query) && (
              <Text size="xs" c="grape">
                Abweichung im Lehrplan: {abweichungsHinweis(t, query)}
              </Text>
            )}
            <TeilformenWahl t={t} query={query} gewaehlt={teilWahl} umschalten={teilUmschalten} />
          </Stack>
        </Alert>
      ))}
    </Stack>
  )
}

const STATUS_FARBE = { bilden: 'blue', erkennen: 'teal', spaeter: 'gray' } as const
const STATUS_NAME = { bilden: 'bilden', erkennen: 'nur erkennen', spaeter: 'später' } as const

/**
 * Teilformen eines gewählten Themas (Recherche 06.10.2026, abgestimmt: „Thema mit Teilformen", aufklappbar). Ohne
 * Auswahl gehen alle passenden an die KI; mit Auswahl nur diese. Jede mit Status für die Lerngruppe und GER.
 */
function TeilformenWahl({
  t,
  query,
  gewaehlt,
  umschalten
}: {
  t: GrammarTopic
  query: ReturnType<typeof grammarQueryForMeta>
  gewaehlt: string[]
  umschalten: (key: string) => void
}): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const liste = teilformenFuer(t, query)
  if (!liste.length) return null
  const eigene = gewaehlt.filter((g) => g.startsWith(`${t.id}/`)).length
  return (
    <div data-teilformen={t.id}>
      <Text size="xs" c="blue" style={{ cursor: 'pointer' }} onClick={() => setOffen((o) => !o)} data-teilformen-auf>
        {offen ? '▾' : '▸'} Teilformen ({eigene ? `${eigene} gewählt` : `alle ${liste.filter((x) => x.status !== 'spaeter').length} passenden`})
      </Text>
      {offen && (
        <Stack gap={2} mt={4}>
          {liste.map(({ teil, status, hinweis }) => {
            const key = `${t.id}/${teil.id}`
            return (
              <Checkbox
                key={key}
                size="xs"
                checked={gewaehlt.includes(key)}
                onChange={() => umschalten(key)}
                data-teilform={teil.id}
                label={
                  <Group gap={6} wrap="wrap">
                    <Text size="xs" span c={status === 'spaeter' ? 'dimmed' : undefined}>
                      {teil.label}
                    </Text>
                    {teil.term && (
                      <Text size="xs" span c="dimmed" fs="italic">
                        {teil.term}
                      </Text>
                    )}
                    <Badge size="xs" variant="light" color={STATUS_FARBE[status]} title={hinweis}>
                      {STATUS_NAME[status]}
                    </Badge>
                    {(teil.erkennen || teil.bilden) && (
                      <Text size="10px" span c="dimmed">
                        {[teil.erkennen && `erk. ${teil.erkennen}`, teil.bilden && `bild. ${teil.bilden}`, teil.sicher && `sicher ${teil.sicher}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    )}
                    {teil.beispiele?.[0] && (
                      <Text size="10px" span c="dimmed">
                        „{teil.beispiele[0]}“
                      </Text>
                    )}
                  </Group>
                }
              />
            )
          })}
        </Stack>
      )}
    </div>
  )
}
