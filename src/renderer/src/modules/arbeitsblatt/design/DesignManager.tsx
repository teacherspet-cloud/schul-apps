import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Card,
  ColorInput,
  Divider,
  Group,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from '@mantine/core'
import { IconCopy, IconDownload, IconPlus, IconStar, IconTrash, IconUpload } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { DESIGN_FONTS, DesignTemplate, FooterSlot, normalizeDesign, presetDesigns } from '@shared/design'
import { useAppSettings } from '../../../shared/settingsStore'
import { notifyError, notifySuccess } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'
import { defaultMeta } from '../model/defaults'
import type { Worksheet } from '../model/types'
import { SheetPages, contextFor, pageInfoFor } from '../render/SheetPages'
import '../render/ws.css'

const FOOTER_SLOTS: { value: FooterSlot; label: string }[] = [
  { value: 'none', label: '–' },
  { value: 'schoolName', label: 'Schulname' },
  { value: 'subject', label: 'Fach' },
  { value: 'topic', label: 'Thema' },
  { value: 'date', label: 'Datum' },
  { value: 'pageNumber', label: 'Seitenzahl' },
  { value: 'custom', label: 'Eigener Text' }
]

/** Beispielblatt für die Live-Vorschau. */
function sampleWorksheet(design: DesignTemplate): Worksheet {
  const meta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectLabel: 'Biologie',
    topic: 'Fotosynthese',
    title: 'Wie Pflanzen Energie gewinnen',
    grade: 7,
    sheetNumber: '3'
  }
  return {
    version: 1,
    meta,
    design,
    outline: null,
    sources: [],
    createdAt: '',
    sheets: [
      {
        id: 'sample',
        label: 'Beispiel',
        blocks: [
          { id: 'g', type: 'learningGoals', title: 'Das lernst du', goals: ['Ich kann die Fotosynthese in einer Wortgleichung beschreiben.'] },
          {
            id: 'i',
            type: 'infoBox',
            variant: 'merke',
            title: 'Merke',
            body: 'Pflanzen stellen mit Licht **Traubenzucker** her: $\\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}$'
          },
          {
            id: 't',
            type: 'task',
            instruction: '**Beschreibe** mit eigenen Worten, was eine Pflanze für die Fotosynthese braucht.',
            operator: 'beschreiben',
            afb: 'I',
            afbReason: '',
            socialForm: 'EA',
            answer: {
              kind: 'lines',
              count: 3,
              heightMm: 40,
              gapText: '',
              left: [],
              right: [],
              pairs: [],
              options: [],
              correct: [],
              statements: [],
              items: [],
              displayOrder: [],
              headers: [],
              rows: [],
              solutionRows: [],
              labels: []
            },
            parts: [],
            solution: '',
            points: 0,
            minutes: 5
          }
        ]
      }
    ]
  }
}

export default function DesignManager(): React.JSX.Element {
  const [designs, setDesigns] = useState<DesignTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const logo = useAppSettings((s) => s.logoDataUrl)
  const schoolName = useAppSettings((s) => s.settings.schoolName)

  useEffect(() => {
    window.api.designs
      .list()
      .then((ds) => {
        setDesigns(ds)
        setSelectedId(ds.find((d) => d.isDefault)?.id ?? ds[0]?.id ?? null)
      })
      .catch(notifyError)
  }, [])

  const design = designs.find((d) => d.id === selectedId)
  const sample = useMemo(() => (design ? sampleWorksheet(design) : null), [design])

  const save = async (next: DesignTemplate): Promise<void> => {
    setDesigns((ds) => ds.map((d) => (d.id === next.id ? next : d)))
    try {
      setDesigns(await window.api.designs.save(next))
    } catch (e) {
      notifyError(e)
    }
  }
  const patch = <K extends keyof DesignTemplate>(section: K, value: Partial<DesignTemplate[K]>): void => {
    if (!design) return
    void save({ ...design, [section]: { ...(design[section] as object), ...value } })
  }

  const createFrom = async (base: DesignTemplate, name: string): Promise<void> => {
    const copy = { ...structuredClone(base), id: newId(), name, isDefault: false }
    const list = await window.api.designs.save(copy)
    setDesigns(list)
    setSelectedId(copy.id)
  }

  return (
    <Box style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <ScrollArea w={250} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
        <Stack p="md" gap="xs">
          <Title order={5}>Designvorlagen</Title>
          {designs.map((d) => (
            <UnstyledButton
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className="theme-swatch"
              data-active={d.id === selectedId}
              p="xs"
              style={{ borderRadius: 8 }}
            >
              <Group gap={8} wrap="nowrap">
                <Box w={14} h={30} style={{ borderRadius: 3, background: d.page.accentColor }} />
                <Text size="sm" style={{ flex: 1 }}>
                  {d.name}
                </Text>
                {d.isDefault && <Badge size="xs">Standard</Badge>}
              </Group>
            </UnstyledButton>
          ))}
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => createFrom(presetDesigns()[0], 'Neue Vorlage')}>
            Neue Vorlage
          </Button>
          <Divider my={4} />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconUpload size={14} />}
            onClick={async () => {
              try {
                const file = await window.api.files.open([{ name: 'Designvorlage', extensions: ['json'] }])
                if (!file) return
                const parsed = JSON.parse(new TextDecoder().decode(file.data)) as DesignTemplate
                const imported = normalizeDesign({ ...parsed, id: newId(), name: parsed.name || 'Importierte Vorlage', isDefault: false })
                setDesigns(await window.api.designs.save(imported))
                setSelectedId(imported.id)
                notifySuccess('Vorlage importiert.')
              } catch (e) {
                notifyError(e, 'Import fehlgeschlagen')
              }
            }}
          >
            Importieren
          </Button>
        </Stack>
      </ScrollArea>

      {design && sample && (
        <>
          <ScrollArea w={380} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
            <Stack p="md" gap="sm">
              <TextInput
                label="Name"
                defaultValue={design.name}
                key={design.id}
                onBlur={(e) => save({ ...design, name: e.currentTarget.value || design.name })}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconStar size={14} />}
                  disabled={design.isDefault}
                  onClick={async () => setDesigns(await window.api.designs.setDefault(design.id))}
                >
                  Als Standard
                </Button>
                <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={() => createFrom(design, `${design.name} (Kopie)`)}>
                  Duplizieren
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDownload size={14} />}
                  onClick={() =>
                    window.api.files
                      .save(`${design.name}.json`, [{ name: 'Designvorlage', extensions: ['json'] }], JSON.stringify(design, null, 2))
                      .catch(notifyError)
                  }
                >
                  Exportieren
                </Button>
                <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => setConfirmDelete(design.id)}>
                  Löschen
                </Button>
              </Group>

              {/*
               * Rückfrage vor dem Löschen. Vorher genügte ein einziger Klick, um eine
               * Designvorlage samt aller Einstellungen unwiederbringlich zu entfernen –
               * ohne Warnung und ohne Weg zurück.
               */}
              {confirmDelete === design.id && (
                <Alert color="red" p="xs">
                  <Group justify="space-between">
                    <Text size="sm">„{design.name}" endgültig löschen?</Text>
                    <Group gap="xs">
                      <Button size="xs" variant="default" onClick={() => setConfirmDelete(null)}>
                        Abbrechen
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        autoFocus
                        onClick={async () => {
                          try {
                            const list = await window.api.designs.delete(design.id)
                            setDesigns(list)
                            setSelectedId(list[0]?.id ?? null)
                            setConfirmDelete(null)
                          } catch (e) {
                            notifyError(e)
                          }
                        }}
                      >
                        Löschen
                      </Button>
                    </Group>
                  </Group>
                </Alert>
              )}

              <Divider label="Seite" labelPosition="left" />
              <ColorInput
                label="Akzentfarbe"
                value={design.page.accentColor}
                onChangeEnd={(v) => patch('page', { accentColor: v })}
                format="hex"
                swatches={['#2b6cb0', '#0b7285', '#5f3dc4', '#c2255c', '#e8590c', '#2f9e44', '#343a40']}
              />
              <Select
                label="Schrift"
                data={DESIGN_FONTS.map((f) => ({ value: f.value, label: f.label }))}
                value={design.page.fontFamily}
                onChange={(v) => v && patch('page', { fontFamily: v })}
                allowDeselect={false}
              />
              <Switch
                label="Schriftgröße automatisch nach Jahrgang"
                description="Empfohlen: 17 pt in Kl. 1–2 bis 11 pt in der Oberstufe"
                checked={design.page.autoFontSize}
                onChange={(e) => patch('page', { autoFontSize: e.currentTarget.checked })}
              />
              <Group grow>
                {!design.page.autoFontSize && (
                  <NumberInput
                    label="Schriftgröße (pt)"
                    min={9}
                    max={20}
                    step={0.5}
                    decimalScale={1}
                    value={design.page.baseFontPt}
                    onChange={(v) => patch('page', { baseFontPt: Number(v) || 11 })}
                  />
                )}
                <NumberInput
                  label="Seitenrand (mm)"
                  description="mind. 12 mm (Druckbereich)"
                  min={12}
                  max={30}
                  value={design.page.marginMm}
                  onChange={(v) => patch('page', { marginMm: Math.max(12, Number(v) || 15) })}
                />
                <Checkbox
                  mt="lg"
                  label="Lochrand links (25 mm)"
                  checked={design.page.holePunchMargin !== false}
                  onChange={(e) => patch('page', { holePunchMargin: e.currentTarget.checked })}
                />
              </Group>

              <Divider label="Kopfbereich" labelPosition="left" />
              <Select
                label="Aufbau"
                data={[
                  { value: 'logoLeft', label: 'Logo links' },
                  { value: 'logoRight', label: 'Logo rechts' },
                  { value: 'centered', label: 'Zentriert' },
                  { value: 'colorBand', label: 'Farbband' }
                ]}
                value={design.header.layout}
                onChange={(v) => v && patch('header', { layout: v as DesignTemplate['header']['layout'] })}
                allowDeselect={false}
              />
              <Group grow>
                <Switch label="Schullogo" checked={design.header.showLogo} onChange={(e) => patch('header', { showLogo: e.currentTarget.checked })} />
                {design.header.showLogo && (
                  <NumberInput
                    size="xs"
                    label="Logohöhe (mm)"
                    min={6}
                    max={30}
                    value={design.header.logoHeightMm}
                    onChange={(v) => patch('header', { logoHeightMm: Number(v) || 14 })}
                  />
                )}
              </Group>
              {!logo && design.header.showLogo && (
                <Text size="xs" c="orange">
                  Noch kein Schullogo hinterlegt (Einstellungen → Schule).
                </Text>
              )}
              <Group grow>
                <Switch
                  label="Schulname"
                  checked={design.header.showSchoolName}
                  onChange={(e) => patch('header', { showSchoolName: e.currentTarget.checked })}
                />
                <Switch label="Fach" checked={design.header.showSubject} onChange={(e) => patch('header', { showSubject: e.currentTarget.checked })} />
              </Group>
              <Group grow>
                <Switch label="Titel" checked={design.header.showTitle} onChange={(e) => patch('header', { showTitle: e.currentTarget.checked })} />
                <Switch
                  label="AB-Nummer"
                  checked={design.header.showSheetNumber}
                  onChange={(e) => patch('header', { showSheetNumber: e.currentTarget.checked })}
                />
              </Group>
              <Text size="sm" fw={500}>
                Felder
              </Text>
              <Group>
                <Switch
                  label="Name"
                  checked={design.header.fields.name}
                  onChange={(e) => patch('header', { fields: { ...design.header.fields, name: e.currentTarget.checked } })}
                />
                <Switch
                  label="Klasse"
                  checked={design.header.fields.class}
                  onChange={(e) => patch('header', { fields: { ...design.header.fields, class: e.currentTarget.checked } })}
                />
                <Switch
                  label="Datum"
                  checked={design.header.fields.date}
                  onChange={(e) => patch('header', { fields: { ...design.header.fields, date: e.currentTarget.checked } })}
                />
              </Group>
              <TextInput
                label="Zusatztext im Kopf (optional)"
                defaultValue={design.header.customText}
                key={`ct-${design.id}`}
                onBlur={(e) => patch('header', { customText: e.currentTarget.value })}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Kopf auf Folgeseiten
                </Text>
                <SegmentedControl
                  size="xs"
                  data={[
                    { value: 'full', label: 'wie Seite 1' },
                    { value: 'compact', label: 'kompakt' },
                    { value: 'none', label: 'keiner' }
                  ]}
                  value={design.header.followingPages}
                  onChange={(v) => patch('header', { followingPages: v as 'full' })}
                />
              </div>

              <Divider label="Fußbereich" labelPosition="left" />
              <Switch label="Fußzeile anzeigen" checked={design.footer.show} onChange={(e) => patch('footer', { show: e.currentTarget.checked })} />
              {design.footer.show && (
                <>
                  <Group grow>
                    <Select
                      size="xs"
                      label="links"
                      data={FOOTER_SLOTS}
                      value={design.footer.left}
                      onChange={(v) => v && patch('footer', { left: v as FooterSlot })}
                      allowDeselect={false}
                    />
                    <Select
                      size="xs"
                      label="Mitte"
                      data={FOOTER_SLOTS}
                      value={design.footer.center}
                      onChange={(v) => v && patch('footer', { center: v as FooterSlot })}
                      allowDeselect={false}
                    />
                    <Select
                      size="xs"
                      label="rechts"
                      data={FOOTER_SLOTS}
                      value={design.footer.right}
                      onChange={(v) => v && patch('footer', { right: v as FooterSlot })}
                      allowDeselect={false}
                    />
                  </Group>
                  {[design.footer.left, design.footer.center, design.footer.right].includes('custom') && (
                    <TextInput
                      size="xs"
                      label="Eigener Text"
                      defaultValue={design.footer.customText}
                      key={`fc-${design.id}`}
                      onBlur={(e) => patch('footer', { customText: e.currentTarget.value })}
                    />
                  )}
                  <Switch
                    label="Kleines Logo in der Fußzeile"
                    checked={design.footer.showLogoSmall}
                    onChange={(e) => patch('footer', { showLogoSmall: e.currentTarget.checked })}
                  />
                </>
              )}

              <Divider label="Seitenleiste" labelPosition="left" />
              <Switch label="Farbige Seitenleiste" checked={design.sidebar.show} onChange={(e) => patch('sidebar', { show: e.currentTarget.checked })} />
              {design.sidebar.show && (
                <>
                  <Group grow>
                    <Select
                      size="xs"
                      label="Seite"
                      data={[
                        { value: 'left', label: 'links' },
                        { value: 'right', label: 'rechts' }
                      ]}
                      value={design.sidebar.side}
                      onChange={(v) => v && patch('sidebar', { side: v as 'left' })}
                      allowDeselect={false}
                    />
                    <NumberInput
                      size="xs"
                      label="Breite (mm)"
                      min={4}
                      max={25}
                      value={design.sidebar.widthMm}
                      onChange={(v) => patch('sidebar', { widthMm: Number(v) || 9 })}
                    />
                  </Group>
                  <ColorInput size="xs" label="Farbe" value={design.sidebar.color} onChangeEnd={(v) => patch('sidebar', { color: v })} format="hex" />
                  <Select
                    size="xs"
                    label="Text"
                    data={[
                      { value: 'subject', label: 'Fach' },
                      { value: 'topic', label: 'Thema' },
                      { value: 'custom', label: 'Eigener Text' },
                      { value: 'none', label: 'kein Text' }
                    ]}
                    value={design.sidebar.content}
                    onChange={(v) => v && patch('sidebar', { content: v as 'subject' })}
                    allowDeselect={false}
                  />
                  {design.sidebar.content === 'custom' && (
                    <TextInput
                      size="xs"
                      defaultValue={design.sidebar.customText}
                      key={`sb-${design.id}`}
                      onBlur={(e) => patch('sidebar', { customText: e.currentTarget.value })}
                    />
                  )}
                </>
              )}

              <Divider label="Aufgaben" labelPosition="left" />
              <Select
                label="Aufgabennummer"
                data={[
                  { value: 'circle', label: 'Kreis' },
                  { value: 'square', label: 'Quadrat' },
                  { value: 'plain', label: 'nur Zahl' }
                ]}
                value={design.tasks.numberStyle}
                onChange={(v) => v && patch('tasks', { numberStyle: v as 'circle' })}
                allowDeselect={false}
              />
              <Switch
                label="Symbole für Sozialformen"
                checked={design.tasks.showSocialFormIcons}
                onChange={(e) => patch('tasks', { showSocialFormIcons: e.currentTarget.checked })}
              />
            </Stack>
          </ScrollArea>

          <ScrollArea style={{ flex: 1 }} className="editor-canvas">
            <Stack align="center" p="lg" gap="md">
              <Text size="sm" c="dimmed">
                Vorschau: Seite 1 und Folgeseite
              </Text>
              <Card p={0} className="ws-preview" style={{ width: '105mm', height: '148.5mm', overflow: 'hidden' }}>
                <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}>
                  <SheetPages
                    ws={sample}
                    sheet={sample.sheets[0]}
                    plans={[{ items: sample.sheets[0].blocks.map((b) => ({ id: b.id })), overflow: false }]}
                    info={pageInfoFor(sample, sample.sheets[0], logo, schoolName || 'Musterschule', false)}
                    context={contextFor(sample, sample.sheets[0], 'print')}
                  />
                </div>
              </Card>
              <Card p={0} style={{ width: '105mm', height: '148.5mm', overflow: 'hidden' }}>
                {/* Zweite Seite anzeigen: um eine Seitenhöhe nach oben verschieben */}
                <div style={{ transform: 'scale(0.5) translateY(-297mm)', transformOrigin: 'top left' }}>
                  <SheetPages
                    ws={sample}
                    sheet={sample.sheets[0]}
                    plans={[
                      { items: [], overflow: false },
                      { items: sample.sheets[0].blocks.slice(1).map((b) => ({ id: b.id })), overflow: false }
                    ]}
                    info={pageInfoFor(sample, sample.sheets[0], logo, schoolName || 'Musterschule', false)}
                    context={contextFor(sample, sample.sheets[0], 'print')}
                  />
                </div>
              </Card>
            </Stack>
          </ScrollArea>
        </>
      )}
    </Box>
  )
}
