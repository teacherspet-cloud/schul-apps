import { ActionIcon, Box, Button, Divider, Group, Popover, ScrollArea, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { useNotausgang } from './NurExperte'
import { IconAdjustmentsHorizontal, IconArrowLeft, IconDeviceFloppy, IconFileTypeDocx, IconFileTypePdf, IconPrinter } from '@tabler/icons-react'
import { useState } from 'react'
import UndoRedoButtons from './UndoRedoButtons'

/**
 * Die Werkzeugleiste über dem Blatt – EINE Leiste für alle Programme (27.09.2026).
 *
 * Vorbild ist das Arbeitsblatt (Wunsch der Lehrkraft): Zurück, Rückgängig/Wiederholen,
 * Fassungen, Ansichten, Blattoptionen, [Besonderes], Name in der App, „gesichert HH:MM",
 * Als Datei speichern, Word, PDF, Drucken. Vorher hatte jedes Programm seine eigene Leiste:
 * die Klassenarbeit einen Seitentitel mit großen Knöpfen und die Ausgabe unter den Karten, die
 * Lernzielkontrolle und der Grammatiktest nur einen Pfeil und drei helle Knöpfe, ohne Namen,
 * ohne Sicherungsanzeige, ohne Blattoptionen. Die Plätze sind hier fest; jedes Programm
 * füllt sie mit seinen Inhalten und lässt weg, was es nicht hat.
 */
export interface Umschalter {
  value: string
  onChange: (value: string) => void
  data: { value: string; label: string }[]
  ariaLabel?: string
}

export default function EditorLeiste({
  zurueck,
  undo,
  fassungen,
  ansichten,
  optionen,
  optionenTestId = 'blattoptionen',
  extras,
  info,
  name,
  gesichertAm,
  dateiSpeichern,
  ausgabe,
  rechts
}: {
  /** Zurück zum vorigen Schritt – beschriftet mit dessen Namen („Gliederung", „Rahmen", „Einstellungen") */
  zurueck: { label: string; onClick: () => void }
  undo?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }
  /** Niveaus, Gruppen, Fassungen A/B – nur, wenn es mehrere gibt */
  fassungen?: Umschalter | null
  /** Schülerblatt, Lösungen bzw. Erwartungshorizont, Tafelbild, Hörtexte */
  ansichten: Umschalter
  /** Inhalt des Fensters „Blattoptionen"; fehlt = kein Knopf */
  optionen?: React.ReactNode
  optionenTestId?: string
  /** Programmspezifische Knöpfe hinter den Blattoptionen (z. B. „Neu erzeugen", „Transkript") */
  extras?: React.ReactNode
  /** Kennzahlen rechts vor dem Namen (z. B. „21 Punkte · Niveau A2") */
  info?: React.ReactNode
  /** Name des Eintrags in der Bibliothek – nicht die Überschrift auf dem Blatt */
  name?: { value: string; placeholder: string; onChange: (value: string) => void }
  /** Zeitpunkt der letzten Sicherung; null = noch nicht gesichert („wird gesichert …") */
  gesichertAm?: string | number | null
  /** „Als Datei speichern …" – eine weitergebbare Datei des Programms */
  dateiSpeichern?: { tooltip: string; onClick: () => void }
  ausgabe: { onWord: () => void; onPdf: () => void; onDrucken: () => void }
  /** Ganz rechts, z. B. das Hinweis-Symbol des Blattes */
  rechts?: React.ReactNode
}): React.JSX.Element {
  const [optionenOffen, setOptionenOffen] = useState(false)
  // Standardmodus (07.10.2026): Notausgang „Alle Werkzeuge" – nur in Editoren mit OptionenBereich (bisher das Arbeitsblatt)
  const notausgang = useNotausgang()
  return (
    <Group px="md" py={8} gap="xs" className="app-toolbar editor-leiste" data-testid="editor-leiste">
      <Button size="xs" variant="default" leftSection={<IconArrowLeft size={14} />} onClick={zurueck.onClick}>
        {zurueck.label}
      </Button>
      {undo && <UndoRedoButtons canUndo={undo.canUndo} canRedo={undo.canRedo} onUndo={undo.onUndo} onRedo={undo.onRedo} />}
      <Divider orientation="vertical" />
      {fassungen && fassungen.data.length > 1 && (
        <SegmentedControl size="xs" aria-label={fassungen.ariaLabel ?? 'Fassung'} value={fassungen.value} onChange={fassungen.onChange} data={fassungen.data} />
      )}
      <SegmentedControl size="xs" aria-label={ansichten.ariaLabel ?? 'Ansicht'} value={ansichten.value} onChange={ansichten.onChange} data={ansichten.data} />
      {/* Blattoptionen unter den Dialogen (Modal 200): Was von hier einen Dialog öffnet (KI-Test-Wörter, Leveln), darf nicht verdeckt werden */}
      {optionen && (
        <Popover
          opened={optionenOffen}
          onChange={setOptionenOffen}
          width={360}
          position="bottom-start"
          shadow="md"
          withArrow
          trapFocus={false}
          keepMounted
          zIndex={190}
        >
          <Popover.Target>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconAdjustmentsHorizontal size={14} />}
              onClick={() => setOptionenOffen((o) => !o)}
              data-testid={optionenTestId}
            >
              Blattoptionen
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <ScrollArea.Autosize mah="70vh">
              <Stack gap="sm" className="blattoptionen">
                {optionen}
              </Stack>
            </ScrollArea.Autosize>
          </Popover.Dropdown>
        </Popover>
      )}
      {extras}
      {notausgang && (
        <Tooltip label="Leveln, Bewertungsraster, Baustein-Einstellungen, Stundenverlauf und weitere Blattoptionen – nur für dieses Blatt">
          <Button
            size="xs"
            variant={notausgang.offen ? 'light' : 'subtle'}
            onClick={() => notausgang.setOffen(!notausgang.offen)}
            aria-pressed={notausgang.offen}
            data-alle-werkzeuge
          >
            {notausgang.offen ? 'Weniger Werkzeuge' : 'Alle Werkzeuge'}
          </Button>
        </Tooltip>
      )}
      <Box style={{ flex: 1 }} />
      {info && (
        <Text size="xs" c="dimmed">
          {info}
        </Text>
      )}
      {name && (
        <TextInput
          size="xs"
          w={220}
          aria-label="Name in der App"
          placeholder={name.placeholder}
          value={name.value}
          onChange={(e) => name.onChange(e.currentTarget.value)}
        />
      )}
      {gesichertAm !== undefined && (
        <Text size="xs" c="dimmed" w={104} data-testid="gesichert">
          {gesichertAm ? `gesichert ${new Date(gesichertAm).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'wird gesichert …'}
        </Text>
      )}
      {dateiSpeichern && (
        <Tooltip label={dateiSpeichern.tooltip}>
          <ActionIcon size="md" variant="default" aria-label="Als Datei speichern" onClick={dateiSpeichern.onClick}>
            <IconDeviceFloppy size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      <Button size="xs" leftSection={<IconFileTypeDocx size={14} />} onClick={ausgabe.onWord}>
        Word
      </Button>
      <Button size="xs" leftSection={<IconFileTypePdf size={14} />} onClick={ausgabe.onPdf}>
        PDF
      </Button>
      <Button size="xs" variant="light" leftSection={<IconPrinter size={14} />} onClick={ausgabe.onDrucken}>
        Drucken
      </Button>
      {rechts}
    </Group>
  )
}
