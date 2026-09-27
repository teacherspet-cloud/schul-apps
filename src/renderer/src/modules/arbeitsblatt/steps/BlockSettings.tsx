import { Button, Group, NumberInput, Popover, Select, Slider, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { hatMasse } from '../render/tabelleMasse'
import { useArbeitsblatt } from '../store'
import { IconAdjustments } from '@tabler/icons-react'
import { shuffle, createRng, randomSeed } from '../../vokabeltest/model/random'
import { emptyAnswer } from '../model/factory'
import { defaultAxes, GRID_KINDS, gridDefaults } from '../model/grid'
import { DIAGRAM_KINDS, TIMELINE_UNITS, defaultDiagram } from '../model/diagram'
import type { Answer, AnswerKind, DiagramKind, DiagramSpec, GridAxes, GridBlock, GridKind, ImageBlock, ImageLabel, TimelineUnit, WsBlock } from '../model/types'
import { IMAGE_FUNCTIONS, imageFunction, imageFunctionInfo, type ImageFunction } from '../didactics/imageDesign'
import { newId } from '../../vokabeltest/model/random'

const lines = (v: string): string[] =>
  v
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

const ANSWER_OPTIONS: { value: AnswerKind; label: string }[] = [
  { value: 'lines', label: 'Schreiblinien' },
  { value: 'grid', label: 'Rechenkästchen' },
  { value: 'diagram', label: 'Diagramm / Zeitleiste (Zeichenfläche mit Achsen)' },
  { value: 'space', label: 'Freie Fläche' },
  { value: 'none', label: 'Kein Antwortbereich' },
  { value: 'gapText', label: 'Lückentext' },
  { value: 'matching', label: 'Zuordnen' },
  { value: 'multipleChoice', label: 'Ankreuzen' },
  { value: 'trueFalse', label: 'Richtig / falsch' },
  { value: 'ordering', label: 'Ordnen' },
  { value: 'tableFill', label: 'Tabelle ausfüllen' },
  { value: 'labels', label: 'Beschriften (nummeriert)' }
]

/** Einstellungen eines Gitternetzes: Art, Höhe und – beim Koordinatensystem – die Achsen. */
function GridSettings({ block, update }: { block: GridBlock; update: (fn: (d: WsBlock) => void) => void }): React.JSX.Element {
  const axis = (key: keyof GridAxes, label: string, step = 1): React.JSX.Element => (
    <NumberInput
      size="xs"
      label={label}
      step={step}
      value={block.axes[key] as number}
      onChange={(v) => update((d) => d.type === 'grid' && ((d.axes[key] as number) = Number(v) || 0))}
    />
  )
  return (
    <>
      <Group grow>
        <Select
          size="xs"
          label="Art"
          data={GRID_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          value={block.kind}
          onChange={(v) =>
            v &&
            update((d) => {
              if (d.type !== 'grid') return
              const kind = v as GridKind
              const preset = gridDefaults(kind)
              d.kind = kind
              d.cellMm = preset.cellMm
              d.heightMm = preset.heightMm
              d.axes = defaultAxes(kind)
            })
          }
          allowDeselect={false}
        />
        <NumberInput
          size="xs"
          label="Höhe (mm)"
          min={20}
          max={220}
          step={5}
          value={block.heightMm}
          onChange={(v) => update((d) => d.type === 'grid' && (d.heightMm = Number(v) || 60))}
        />
      </Group>
      {(block.kind === 'karo' || block.kind === 'mm') && (
        <NumberInput
          size="xs"
          label="Kästchenweite (mm)"
          min={1}
          max={10}
          value={block.cellMm}
          onChange={(v) => update((d) => d.type === 'grid' && (d.cellMm = Number(v) || 5))}
        />
      )}
      {block.kind === 'koordinaten' && (
        <>
          <Group grow>
            <TextInput
              size="xs"
              label="x-Achse"
              defaultValue={block.axes.xLabel}
              onBlur={(e) => update((d) => d.type === 'grid' && (d.axes.xLabel = e.currentTarget.value))}
            />
            <TextInput
              size="xs"
              label="y-Achse"
              defaultValue={block.axes.yLabel}
              onBlur={(e) => update((d) => d.type === 'grid' && (d.axes.yLabel = e.currentTarget.value))}
            />
          </Group>
          <Group grow>
            {axis('xMin', 'x von')}
            {axis('xMax', 'x bis')}
            {axis('xStep', 'je Kästchen')}
          </Group>
          <Group grow>
            {axis('yMin', 'y von')}
            {axis('yMax', 'y bis')}
            {axis('yStep', 'je Kästchen')}
          </Group>
          <Switch
            size="xs"
            label="Zahlen an den Achsen"
            checked={block.axes.showNumbers}
            onChange={(e) => update((d) => d.type === 'grid' && (d.axes.showNumbers = e.currentTarget.checked))}
          />
        </>
      )}
      {block.kind === 'klima' && (
        <Group grow>
          {axis('yMin', 'Temperatur von (°C)', 5)}
          {axis('yMax', 'bis (°C)', 5)}
          {axis('yStep', 'je Kästchen', 5)}
        </Group>
      )}
      <TextInput
        size="xs"
        label="Hinweis unter dem Gitternetz"
        defaultValue={block.caption}
        onBlur={(e) => update((d) => d.type === 'grid' && (d.caption = e.currentTarget.value))}
      />
    </>
  )
}

/**
 * Beschriftungen, die direkt an Bildteilen sitzen.
 *
 * Die Lage wird nicht hier eingetippt, sondern durch Ziehen des Punktes im Bild gesetzt – das
 * ist genauer und schneller. Hier stehen Text, Seite und die Frage, ob die Lernenden selbst
 * beschriften sollen.
 */
function ImageLabelSettings({ block, update }: { block: ImageBlock; update: (fn: (d: WsBlock) => void) => void }): React.JSX.Element {
  const labels = block.labels ?? []
  const change = (id: string, fn: (l: ImageLabel) => void): void =>
    update((d) => {
      if (d.type !== 'image') return
      const label = d.labels?.find((l) => l.id === id)
      if (label) fn(label)
    })

  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="xs" fw={500}>
          Beschriftungen im Bild
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() =>
            update((d) => {
              if (d.type !== 'image') return
              // Neue Beschriftung in die Mitte; von dort zieht die Lehrkraft sie an ihren Platz
              d.labels = [...(d.labels ?? []), { id: newId(), text: '', x: 50, y: 50 }]
            })
          }
        >
          Hinzufügen
        </Button>
      </Group>
      {!labels.length && (
        <Text size="xs" c="dimmed">
          Beschriftung am Element statt einer nummerierten Liste darunter – das ist die verständlichste Form. Den Punkt im Bild danach an die richtige Stelle
          ziehen.
        </Text>
      )}
      {labels.map((label) => (
        <Group key={label.id} gap={4} wrap="nowrap" align="center">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            placeholder="Beschriftung"
            defaultValue={label.text}
            onBlur={(e) => change(label.id, (l) => (l.text = e.currentTarget.value))}
          />
          <Select
            size="xs"
            w={78}
            data={[
              { value: 'left', label: 'links' },
              { value: 'right', label: 'rechts' }
            ]}
            value={label.side ?? (label.x < 50 ? 'left' : 'right')}
            onChange={(v) => v && change(label.id, (l) => (l.side = v as 'left' | 'right'))}
            allowDeselect={false}
          />
          <Switch
            size="xs"
            title="Die Lernenden tragen die Beschriftung selbst ein"
            checked={Boolean(label.blank)}
            onChange={(e) => change(label.id, (l) => (l.blank = e.currentTarget.checked))}
          />
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            onClick={() => update((d) => d.type === 'image' && (d.labels = (d.labels ?? []).filter((l) => l.id !== label.id)))}
          >
            ✕
          </Button>
        </Group>
      ))}
      {labels.length > 0 && (
        <Text size="xs" c="dimmed">
          Der Schalter macht aus der Beschriftung eine Aufgabe: leere Linie auf dem Schülerblatt, Text im Lösungsteil.
        </Text>
      )}
    </Stack>
  )
}

/**
 * Einstellungen der Zeichenfläche (Diagramm-Antwortform, 26.09.2026).
 *
 * Textfelder schreiben beim Verlassen (onBlur), Zahlen sofort – wie bei den Gitternetzen.
 * Listen (Kategorien, Stufen, Stränge, Ereignisse, Abschnitte) stehen zeilenweise in einem
 * Textfeld; Ereignisse als „Datum | Text | Strang | Stufe", Abschnitte als
 * „von | bis | Einheit | Schritt".
 */
function DiagramSettings({ answer, onChange }: { answer: Answer; onChange: (fn: (a: Answer) => void) => void }): React.JSX.Element {
  const d = answer.diagram ?? defaultDiagram('koordinaten')
  const set = (fn: (spec: DiagramSpec) => void): void =>
    onChange((a) => {
      if (!a.diagram) a.diagram = defaultDiagram('koordinaten')
      fn(a.diagram)
    })
  const zahl = (label: string, wert: number, schreiben: (v: number) => void, step = 1): React.JSX.Element => (
    <NumberInput size="xs" label={label} value={wert} step={step} onChange={(v) => set(() => schreiben(Number(v) || 0))} />
  )
  const t = d.timeline
  const kartesisch = d.kind === 'koordinaten' || d.kind === 'mm' || d.kind === 'spannung' || d.kind === 'schraegbild'
  return (
    <Stack gap={6}>
      <Select
        size="xs"
        label="Art der Zeichenfläche"
        description={DIAGRAM_KINDS.find((k) => k.value === d.kind)?.hint}
        data={DIAGRAM_KINDS.map((k) => ({ value: k.value, label: k.label }))}
        value={d.kind}
        onChange={(v) =>
          v &&
          set((spec) => {
            const frisch = defaultDiagram(v as DiagramKind)
            spec.kind = frisch.kind
            spec.heightMm = frisch.heightMm
            if (v !== 'koordinaten' && v !== 'mm') spec.axes = frisch.axes
            if (!spec.xCategories.length) spec.xCategories = frisch.xCategories
            if (!spec.yLevels.length) spec.yLevels = frisch.yLevels
          })
        }
        allowDeselect={false}
      />
      {zahl('Höhe (mm)', d.heightMm, (v) => set((spec) => (spec.heightMm = Math.max(30, Math.min(200, v)))), 5)}
      {kartesisch && (
        <>
          <Group grow gap={6}>
            <TextInput
              size="xs"
              label={d.kind === 'schraegbild' ? 'Achse rechts (x₂)' : 'x-Achse'}
              defaultValue={d.axes.xLabel}
              onBlur={(e) => set((spec) => (spec.axes.xLabel = e.currentTarget.value))}
            />
            <TextInput
              size="xs"
              label={d.kind === 'schraegbild' ? 'Achse oben (x₃)' : 'y-Achse'}
              defaultValue={d.axes.yLabel}
              onBlur={(e) => set((spec) => (spec.axes.yLabel = e.currentTarget.value))}
            />
          </Group>
          {d.kind !== 'spannung' && (
            <>
              <Group grow gap={6}>
                {zahl('x von', d.axes.xMin, (v) => set((spec) => (spec.axes.xMin = v)))}
                {zahl('x bis', d.axes.xMax, (v) => set((spec) => (spec.axes.xMax = v)))}
                {zahl('x je Kästchen', d.axes.xStep, (v) => set((spec) => (spec.axes.xStep = v)))}
              </Group>
              <Group grow gap={6}>
                {zahl('y von', d.axes.yMin, (v) => set((spec) => (spec.axes.yMin = v)))}
                {zahl('y bis', d.axes.yMax, (v) => set((spec) => (spec.axes.yMax = v)))}
                {zahl('y je Kästchen', d.axes.yStep, (v) => set((spec) => (spec.axes.yStep = v)))}
              </Group>
              <Switch
                size="xs"
                label="Zahlen an den Achsen"
                checked={d.axes.showNumbers}
                onChange={(e) => set((spec) => (spec.axes.showNumbers = e.currentTarget.checked))}
              />
            </>
          )}
          {d.kind === 'schraegbild' && (
            <Group grow gap={6}>
              <TextInput
                size="xs"
                label="Achse nach vorn (x₁)"
                defaultValue={d.z.label}
                onBlur={(e) => set((spec) => (spec.z.label = e.currentTarget.value))}
              />
              {zahl('bis', d.z.max, (v) => set((spec) => (spec.z.max = v)))}
              {zahl('je Einheit', d.z.step, (v) => set((spec) => (spec.z.step = v)))}
            </Group>
          )}
          {d.kind === 'spannung' && (
            <>
              <Textarea
                size="xs"
                label="Schritte auf der x-Achse (eine je Zeile)"
                autosize
                minRows={2}
                defaultValue={d.xCategories.join('\n')}
                onBlur={(e) => set((spec) => (spec.xCategories = lines(e.currentTarget.value)))}
              />
              <Textarea
                size="xs"
                label="Stufen der y-Achse von unten nach oben (eine je Zeile)"
                autosize
                minRows={2}
                defaultValue={d.yLevels.join('\n')}
                onBlur={(e) => set((spec) => (spec.yLevels = lines(e.currentTarget.value)))}
              />
            </>
          )}
        </>
      )}
      {d.kind === 'klima' && (
        <Group grow gap={6}>
          {zahl('Temperatur von', d.axes.yMin, (v) => set((spec) => (spec.axes.yMin = v)), 10)}
          {zahl('bis', d.axes.yMax, (v) => set((spec) => (spec.axes.yMax = v)), 10)}
          {zahl('Schritt', d.axes.yStep, (v) => set((spec) => (spec.axes.yStep = v)), 5)}
        </Group>
      )}
      {d.kind === 'zeitleiste' && (
        <>
          <Group grow gap={6}>
            <Select
              size="xs"
              label="Einheit"
              data={TIMELINE_UNITS}
              value={t.unit}
              onChange={(v) => v && set((spec) => (spec.timeline.unit = v as TimelineUnit))}
              allowDeselect={false}
            />
            <TextInput
              size="xs"
              label="Von"
              placeholder="1914-07-28"
              defaultValue={t.from}
              onBlur={(e) => set((spec) => (spec.timeline.from = e.currentTarget.value.trim()))}
            />
            <TextInput
              size="xs"
              label="Bis"
              placeholder="1914-08-04"
              defaultValue={t.to}
              onBlur={(e) => set((spec) => (spec.timeline.to = e.currentTarget.value.trim()))}
            />
            {zahl('Marke alle', t.step, (v) => set((spec) => (spec.timeline.step = Math.max(1, v))))}
          </Group>
          <Text size="xs" c="dimmed">
            Datum als Jahr („1914", „-500" = v. Chr.), Monat („1914-07") oder Tag („1914-07-28").
          </Text>
          <TextInput
            size="xs"
            label="y-Achse (optional), z. B. Eskalation"
            defaultValue={t.yLabel}
            onBlur={(e) => set((spec) => (spec.timeline.yLabel = e.currentTarget.value.trim()))}
          />
          <Textarea
            size="xs"
            label="Stufen der y-Achse von unten nach oben (eine je Zeile)"
            autosize
            minRows={1}
            defaultValue={t.yLevels.join('\n')}
            onBlur={(e) => set((spec) => (spec.timeline.yLevels = lines(e.currentTarget.value)))}
          />
          <Textarea
            size="xs"
            label="Stränge (eine je Zeile, z. B. zwei Länder)"
            autosize
            minRows={1}
            defaultValue={t.strands.join('\n')}
            onBlur={(e) => set((spec) => (spec.timeline.strands = lines(e.currentTarget.value)))}
          />
          <Textarea
            size="xs"
            label="Vorgegebene Ereignisse: Datum | Text | Strang | Stufe (eine je Zeile)"
            description="Leer lassen, wenn die Lernenden selbst eintragen"
            autosize
            minRows={1}
            defaultValue={t.events.map((e) => [e.date, e.text, e.strand ?? '', e.level ?? ''].join(' | ').replace(/( \| )+$/, '')).join('\n')}
            onBlur={(e) =>
              set((spec) => {
                spec.timeline.events = lines(e.currentTarget.value).map((z) => {
                  const [date, text, strand, level] = z.split('|').map((x) => x.trim())
                  return {
                    date: date ?? '',
                    text: text ?? '',
                    ...(strand ? { strand: Number(strand) || 0 } : {}),
                    ...(level ? { level: Number(level) || 0 } : {})
                  }
                })
              })
            }
          />
          <Textarea
            size="xs"
            label="Abschnitte mit eigener Skala: von | bis | Einheit (day/month/year) | Schritt"
            description="Für lange Zeiträume; leer = eine durchgehende Skala"
            autosize
            minRows={1}
            defaultValue={t.sections.map((s) => [s.from, s.to, s.unit, s.step].join(' | ')).join('\n')}
            onBlur={(e) =>
              set((spec) => {
                spec.timeline.sections = lines(e.currentTarget.value).map((z) => {
                  const [from, to, unit, step] = z.split('|').map((x) => x.trim())
                  return { from: from ?? '', to: to ?? '', unit: (unit === 'day' || unit === 'month' ? unit : 'year') as TimelineUnit, step: Number(step) || 1 }
                })
              })
            }
          />
        </>
      )}
    </Stack>
  )
}

function AnswerSettings({ answer, onChange }: { answer: Answer; onChange: (fn: (a: Answer) => void) => void }): React.JSX.Element {
  return (
    <Stack gap={6}>
      <Select
        size="xs"
        label="Antwortform"
        data={ANSWER_OPTIONS}
        value={answer.kind}
        onChange={(v) =>
          v &&
          onChange((a) => {
            const fresh = emptyAnswer(v as AnswerKind)
            Object.assign(a, {
              ...fresh,
              gapText: a.gapText,
              options: a.options,
              statements: a.statements,
              items: a.items,
              left: a.left,
              right: a.right,
              headers: a.headers,
              rows: a.rows,
              labels: a.labels
            })
            a.kind = v as AnswerKind
          })
        }
        allowDeselect={false}
      />
      {(answer.kind === 'lines' || answer.kind === 'grid' || answer.kind === 'labels') && (
        <NumberInput
          size="xs"
          label={answer.kind === 'grid' ? 'Kästchenzeilen' : 'Anzahl'}
          min={1}
          max={30}
          value={answer.count}
          onChange={(v) => onChange((a) => (a.count = Number(v) || 1))}
        />
      )}
      {answer.kind === 'diagram' && <DiagramSettings answer={answer} onChange={onChange} />}
      {answer.kind === 'space' && (
        <NumberInput
          size="xs"
          label="Höhe (mm)"
          min={10}
          max={200}
          step={5}
          value={answer.heightMm}
          onChange={(v) => onChange((a) => (a.heightMm = Number(v) || 30))}
        />
      )}
      {answer.kind === 'multipleChoice' && (
        <Textarea
          size="xs"
          label="Antwortmöglichkeiten (eine pro Zeile)"
          description="Richtige Antworten in der Lösungsansicht anklicken"
          autosize
          minRows={3}
          defaultValue={answer.options.join('\n')}
          onBlur={(e) =>
            onChange((a) => {
              a.options = lines(e.currentTarget.value)
              a.correct = a.correct.filter((c) => c < a.options.length)
            })
          }
        />
      )}
      {answer.kind === 'trueFalse' && (
        <Textarea
          size="xs"
          label="Aussagen (eine pro Zeile)"
          description="Richtig/falsch in der Lösungsansicht anklicken"
          autosize
          minRows={3}
          defaultValue={answer.statements.map((s) => s.text).join('\n')}
          onBlur={(e) => onChange((a) => (a.statements = lines(e.currentTarget.value).map((t, i) => ({ text: t, isTrue: a.statements[i]?.isTrue ?? true }))))}
        />
      )}
      {answer.kind === 'matching' && (
        <>
          <Textarea
            size="xs"
            label="Links (eine pro Zeile)"
            autosize
            minRows={2}
            defaultValue={answer.left.join('\n')}
            onBlur={(e) =>
              onChange((a) => {
                a.left = lines(e.currentTarget.value)
                a.pairs = a.left.map((_, i) => a.pairs[i] ?? -1)
              })
            }
          />
          <Textarea
            size="xs"
            label="Rechts (eine pro Zeile, gern mit Ablenkern)"
            description="Zuordnung in der Lösungsansicht per Klick auf das Kästchen"
            autosize
            minRows={2}
            defaultValue={answer.right.join('\n')}
            onBlur={(e) => onChange((a) => (a.right = lines(e.currentTarget.value)))}
          />
        </>
      )}
      {answer.kind === 'ordering' && (
        <>
          <Textarea
            size="xs"
            label="Elemente in richtiger Reihenfolge"
            autosize
            minRows={3}
            defaultValue={answer.items.join('\n')}
            onBlur={(e) =>
              onChange((a) => {
                a.items = lines(e.currentTarget.value)
                a.displayOrder = shuffle(
                  a.items.map((_, i) => i),
                  createRng(randomSeed())
                )
              })
            }
          />
          <Button
            size="compact-xs"
            variant="light"
            onClick={() =>
              onChange(
                (a) =>
                  (a.displayOrder = shuffle(
                    a.items.map((_, i) => i),
                    createRng(randomSeed())
                  ))
              )
            }
          >
            Neu mischen
          </Button>
        </>
      )}
      {answer.kind === 'tableFill' && (
        <>
          <TextInput
            size="xs"
            label="Spaltenköpfe (mit ; trennen)"
            defaultValue={answer.headers.join('; ')}
            onBlur={(e) => onChange((a) => (a.headers = e.currentTarget.value.split(';').map((x) => x.trim())))}
          />
          <Textarea
            size="xs"
            label="Zeilen (Zellen mit ; trennen, leere Zelle = ausfüllen)"
            autosize
            minRows={3}
            defaultValue={answer.rows.map((r) => r.join('; ')).join('\n')}
            onBlur={(e) =>
              onChange(
                (a) =>
                  (a.rows = e.currentTarget.value
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((l) => l.split(';').map((x) => x.trim())))
              )
            }
          />
        </>
      )}
    </Stack>
  )
}

export function BlockSettings({
  block,
  update,
  combined
}: {
  block: WsBlock
  /** `gruppe` fasst eine Geste (Schieberegler) zu einem Verlaufsschritt zusammen */
  update: (fn: (d: WsBlock) => void, gruppe?: string) => void
  combined: boolean
}): React.JSX.Element {
  return (
    <Popover width={320} position="left-start" shadow="md" withArrow trapFocus={false}>
      <Popover.Target>
        <Button size="compact-xs" variant="default" px={4} title="Baustein einstellen" aria-label="Baustein einstellen">
          <IconAdjustments size={14} />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" mah={520} style={{ overflowY: 'auto' }}>
          {combined && (
            <Select
              size="xs"
              label="Niveau"
              data={[
                { value: '0', label: 'für alle' },
                { value: '1', label: '★' },
                { value: '2', label: '★★' },
                { value: '3', label: '★★★' }
              ]}
              value={String(block.stars ?? 0)}
              onChange={(v) => update((d) => (d.stars = v === '0' ? undefined : (Number(v) as 1 | 2 | 3)))}
              allowDeselect={false}
            />
          )}
          {/* Nur im Lösungsteil (27.09.2026): Erwartungshorizont & Co. gehören nicht aufs Schülerblatt */}
          {['infoBox', 'text', 'table', 'scaffold', 'phrases', 'workspace'].includes(block.type) && (
            <Switch
              size="xs"
              label="Nur im Lösungsteil zeigen"
              description="Für die Lehrkraft bestimmt – fehlt auf dem Schülerblatt, steht auf den Lösungen"
              checked={Boolean(block.nurLoesung)}
              onChange={(e) => {
                const an = e.currentTarget.checked
                update((d) => (d.nurLoesung = an ? true : false))
              }}
            />
          )}
          {block.type === 'task' && (
            <>
              <Group grow>
                <Select
                  size="xs"
                  label="AFB"
                  data={['I', 'II', 'III']}
                  value={block.afb ?? null}
                  onChange={(v) => update((d) => d.type === 'task' && (d.afb = (v as 'I' | 'II' | 'III') ?? undefined))}
                />
                <Select
                  size="xs"
                  label="Sozialform"
                  data={[
                    { value: 'EA', label: 'Einzel' },
                    { value: 'PA', label: 'Partner' },
                    { value: 'GA', label: 'Gruppe' },
                    { value: 'Plenum', label: 'Plenum' }
                  ]}
                  value={block.socialForm}
                  onChange={(v) => v && update((d) => d.type === 'task' && (d.socialForm = v as 'EA'))}
                  allowDeselect={false}
                />
              </Group>
              <Group grow>
                <TextInput
                  size="xs"
                  label="Operator"
                  defaultValue={block.operator}
                  onBlur={(e) => update((d) => d.type === 'task' && (d.operator = e.currentTarget.value))}
                />
                <NumberInput
                  size="xs"
                  label="Min."
                  min={0}
                  max={120}
                  value={block.minutes}
                  onChange={(v) => update((d) => d.type === 'task' && (d.minutes = Number(v) || 0))}
                />
              </Group>
              {block.brief && (block.brief.audience || block.brief.textType || block.brief.purpose) && (
                <Switch
                  size="xs"
                  label="Adressat · Textsorte · Zweck zeigen"
                  description="Die Rahmenzeile unter der Arbeitsanweisung; im Blatt Feld für Feld bearbeitbar"
                  checked={!block.brief.frameHidden}
                  onChange={(e) => {
                    const an = e.currentTarget.checked
                    update((d) => d.type === 'task' && d.brief && (d.brief.frameHidden = an ? undefined : true))
                  }}
                />
              )}
              {block.parts.length === 0 && <AnswerSettings answer={block.answer} onChange={(fn) => update((d) => d.type === 'task' && fn(d.answer))} />}
              {block.parts.map((p, i) => (
                <Stack key={p.id} gap={4} className="picker-tile" p={6}>
                  <Group justify="space-between">
                    <Text size="xs" fw={600}>
                      Teilaufgabe {String.fromCharCode(97 + i)})
                    </Text>
                    <Button size="compact-xs" variant="subtle" color="red" onClick={() => update((d) => d.type === 'task' && d.parts.splice(i, 1))}>
                      entfernen
                    </Button>
                  </Group>
                  <AnswerSettings answer={p.answer} onChange={(fn) => update((d) => d.type === 'task' && fn(d.parts[i].answer))} />
                </Stack>
              ))}
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => update((d) => d.type === 'task' && d.parts.push({ id: newId(), instruction: '', answer: emptyAnswer('lines'), solution: '' }))}
              >
                Teilaufgabe hinzufügen
              </Button>
            </>
          )}
          {block.type === 'text' && (
            <>
              <Switch
                size="xs"
                label="Zeilennummern"
                checked={block.lineNumbers}
                onChange={(e) => update((d) => d.type === 'text' && (d.lineNumbers = e.currentTarget.checked))}
              />
              <TextInput
                size="xs"
                label="Quelle"
                defaultValue={block.source}
                onBlur={(e) => update((d) => d.type === 'text' && (d.source = e.currentTarget.value))}
              />
              <Textarea
                size="xs"
                label="Worterklärungen (Begriff: Erklärung, eine pro Zeile)"
                autosize
                minRows={2}
                defaultValue={block.glossary.map((g) => `${g.term}: ${g.explanation}`).join('\n')}
                onBlur={(e) =>
                  update(
                    (d) =>
                      d.type === 'text' &&
                      (d.glossary = lines(e.currentTarget.value).map((l) => ({
                        term: l.split(':')[0].trim(),
                        explanation: l.split(':').slice(1).join(':').trim()
                      })))
                  )
                }
              />
            </>
          )}
          {block.type === 'image' && (
            <>
              <Textarea
                size="xs"
                label="Bildbeschreibung (Alternativtext)"
                autosize
                defaultValue={block.description}
                onBlur={(e) => update((d) => d.type === 'image' && (d.description = e.currentTarget.value))}
              />
              <Select
                size="xs"
                label="Was das Bild leistet"
                description={imageFunctionInfo(imageFunction(block)).evidence}
                data={IMAGE_FUNCTIONS.map((f) => ({ value: f.value, label: `${f.label} – ${f.description}` }))}
                value={imageFunction(block)}
                onChange={(v) => v && update((d) => d.type === 'image' && (d.fn = v as ImageFunction))}
                allowDeselect={false}
              />
              <Text size="xs">Breite: {block.widthPercent} %</Text>
              <Slider
                size="xs"
                min={20}
                max={100}
                step={5}
                value={block.widthPercent}
                // Ein Zug am Regler ist EIN Schritt im Verlauf, nicht einer je Zwischenwert
                onChange={(v) => update((d) => d.type === 'image' && (d.widthPercent = v), `regler:${block.id}:breite`)}
                onChangeEnd={() => useArbeitsblatt.getState().endGroup()}
              />
              <ImageLabelSettings block={block} update={update} />
            </>
          )}
          {block.type === 'infoBox' && (
            <Select
              size="xs"
              label="Art des Kastens"
              data={[
                { value: 'merke', label: 'Merke' },
                { value: 'definition', label: 'Definition' },
                { value: 'beispiel', label: 'Beispiel' },
                { value: 'wissen', label: 'Wissen' },
                { value: 'regel', label: 'Regel' }
              ]}
              value={block.variant}
              onChange={(v) => v && update((d) => d.type === 'infoBox' && (d.variant = v as 'merke'))}
              allowDeselect={false}
            />
          )}
          {(block.type === 'scaffold' || block.type === 'learningGoals' || block.type === 'selfCheck') && (
            <Textarea
              size="xs"
              label="Einträge (einer pro Zeile)"
              autosize
              minRows={3}
              defaultValue={(block.type === 'learningGoals' ? block.goals : block.type === 'selfCheck' ? block.statements : block.items).join('\n')}
              onBlur={(e) =>
                update((d) => {
                  const v = lines(e.currentTarget.value)
                  if (d.type === 'learningGoals') d.goals = v
                  if (d.type === 'selfCheck') d.statements = v
                  if (d.type === 'scaffold') d.items = v
                })
              }
            />
          )}
          {block.type === 'scaffold' && (
            <Select
              size="xs"
              label="Art der Hilfe"
              data={[
                { value: 'tipp', label: 'Tipp' },
                { value: 'satzanfaenge', label: 'Satzanfänge' },
                { value: 'wortspeicher', label: 'Wortspeicher' },
                { value: 'hilfekarten', label: 'Gestufte Hilfekarten' }
              ]}
              value={block.variant}
              onChange={(v) => v && update((d) => d.type === 'scaffold' && (d.variant = v as 'tipp'))}
              allowDeselect={false}
            />
          )}
          {block.type === 'selfCheck' && (
            <Select
              size="xs"
              label="Format"
              data={[
                { value: 'smileys', label: 'Smileys' },
                { value: 'ampel', label: 'Ampel' },
                { value: 'kompetenzraster', label: 'Kompetenzraster' }
              ]}
              value={block.format}
              onChange={(v) => v && update((d) => d.type === 'selfCheck' && (d.format = v as 'smileys'))}
              allowDeselect={false}
            />
          )}
          {block.type === 'table' && (
            <Group grow>
              <Button size="compact-xs" variant="light" onClick={() => update((d) => d.type === 'table' && d.rows.push(d.headers.map(() => '')))}>
                + Zeile
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() =>
                  update((d) => {
                    if (d.type === 'table') {
                      d.headers.push('')
                      d.rows.forEach((r) => r.push(''))
                    }
                  })
                }
              >
                + Spalte
              </Button>
              <Button size="compact-xs" variant="light" color="red" onClick={() => update((d) => d.type === 'table' && d.rows.pop())}>
                − Zeile
              </Button>
            </Group>
          )}
          {block.type === 'table' && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Spalten- und Zeilenlinien lassen sich im Blatt ziehen; rechts der letzten Spalte ändert sich die Breite der ganzen Tabelle.
              </Text>
              {hatMasse(block) && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    update((d) => {
                      if (d.type !== 'table') return
                      delete d.colWidths
                      delete d.rowHeightsMm
                      delete d.headerHeightMm
                      delete d.widthPercent
                    })
                  }
                >
                  Maße zurücksetzen
                </Button>
              )}
            </Stack>
          )}
          {block.type === 'workspace' && (
            <Group grow>
              <Select
                size="xs"
                label="Art"
                data={[
                  { value: 'lines', label: 'Linien' },
                  { value: 'grid', label: 'Kästchen' },
                  { value: 'blank', label: 'frei' }
                ]}
                value={block.kind}
                onChange={(v) => v && update((d) => d.type === 'workspace' && (d.kind = v as 'lines'))}
                allowDeselect={false}
              />
              <NumberInput
                size="xs"
                label="Höhe (mm)"
                min={15}
                max={200}
                step={5}
                value={block.heightMm}
                onChange={(v) => update((d) => d.type === 'workspace' && (d.heightMm = Number(v) || 40))}
              />
            </Group>
          )}
          {block.type === 'grid' && <GridSettings block={block} update={update} />}
          {block.type === 'audio' && (
            <>
              <Group grow>
                <TextInput
                  size="xs"
                  label="Textsorte"
                  defaultValue={block.textType}
                  onBlur={(e) => update((d) => d.type === 'audio' && (d.textType = e.currentTarget.value))}
                />
                <NumberInput
                  size="xs"
                  label="Durchgänge"
                  min={1}
                  max={3}
                  value={block.plays}
                  onChange={(v) => update((d) => d.type === 'audio' && (d.plays = Number(v) || 2))}
                />
              </Group>
              <TextInput
                size="xs"
                label="Adresse für den QR-Code (optional)"
                placeholder="https://…"
                defaultValue={block.url ?? ''}
                onBlur={(e) => update((d) => d.type === 'audio' && (d.url = e.currentTarget.value.trim() || undefined))}
              />
              <Text size="xs" c="dimmed">
                Skript und Stimmen werden im Reiter „Hörtexte“ bearbeitet und vertont.
              </Text>
            </>
          )}
          {block.type === 'video' && (
            <>
              <TextInput
                size="xs"
                label="Titel des Videos"
                defaultValue={block.sourceTitle}
                onBlur={(e) => update((d) => d.type === 'video' && (d.sourceTitle = e.currentTarget.value))}
              />
              <TextInput
                size="xs"
                label="Adresse für den QR-Code (optional)"
                placeholder="https://…"
                defaultValue={block.url}
                onBlur={(e) => update((d) => d.type === 'video' && (d.url = e.currentTarget.value.trim()))}
              />
              <Group grow>
                <TextInput
                  size="xs"
                  label="Abschnitt"
                  placeholder="12:40–18:10"
                  defaultValue={block.section}
                  onBlur={(e) => update((d) => d.type === 'video' && (d.section = e.currentTarget.value))}
                />
                <NumberInput
                  size="xs"
                  label="Durchgänge"
                  min={1}
                  max={3}
                  value={block.plays}
                  onChange={(v) => update((d) => d.type === 'video' && (d.plays = Number(v) || 1))}
                />
              </Group>
              <Text size="xs" c="dimmed">
                Zeitmarken und Hinweise für die Lehrkraft stehen im Lösungsteil dieses Bausteins.
              </Text>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
