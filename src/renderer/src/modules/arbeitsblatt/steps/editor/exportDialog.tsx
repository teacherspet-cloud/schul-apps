import { Button, Checkbox, Group, Modal, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import { LoesungsWahl, merkeLoesungsWahl, type LoesungsModus } from '../../../../shared/components/LoesungsWahl'
import { notifyError } from '../../../../shared/util'
import { tafelbildHinweis } from '../../export/tafelbildZiel'
import '../../render/ws.css'
import '../../../vokabeltest/steps/editor.css'

export function ExportModal({
  mode,
  onClose,
  run,
  sheets,
  defaultKey,
  hasBoard,
  boardFirst
}: {
  mode: null | 'docx' | 'pdf' | 'print'
  onClose: () => void
  run: (sheetIds: string[], key: LoesungsModus, includeBoard: boolean, fillable: boolean) => Promise<void>
  sheets: { id: string; label: string }[]
  /** Vorwahl: zuletzt in diesem Programm gewählt bzw. „als eigene Datei" (LoesungsWahl.tsx) */
  defaultKey: LoesungsModus
  hasBoard: boolean
  /** Aus dem Reiter „Tafelbild“ geöffnet: nur das Tafelbild vorauswählen */
  boardFirst: boolean
}): React.JSX.Element {
  const [sheetIds, setSheetIds] = useState(sheets.map((s) => s.id))
  const [key, setKey] = useState<LoesungsModus>(defaultKey)
  const [board, setBoard] = useState(false)
  /** PDF mit Formularfeldern statt reinem Abbild */
  const [fillable, setFillable] = useState(false)
  const [running, setRunning] = useState(false)
  useEffect(() => setSheetIds(sheets.map((s) => s.id)), [sheets.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === null) return
    setBoard(hasBoard && boardFirst)
    setKey(defaultKey)
    setSheetIds(boardFirst && hasBoard ? [] : sheets.map((s) => s.id))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal opened={mode !== null} onClose={onClose} title={mode === 'docx' ? 'Als Word-Dokument speichern' : mode === 'pdf' ? 'Als PDF speichern' : 'Drucken'}>
      <Stack>
        {sheets.length > 1 && (
          <Checkbox.Group label="Niveaustufen" value={sheetIds} onChange={setSheetIds}>
            <Group mt={4}>
              {sheets.map((s) => (
                <Checkbox key={s.id} value={s.id} label={s.label} />
              ))}
            </Group>
          </Checkbox.Group>
        )}
        {sheets.length === 1 && hasBoard && (
          <Checkbox label="Arbeitsblatt" checked={sheetIds.length > 0} onChange={(e) => setSheetIds(e.currentTarget.checked ? sheets.map((s) => s.id) : [])} />
        )}
        {hasBoard && (
          <Checkbox
            label="Tafelbild (Seite für die Lehrkraft)"
            /*
             * Wohin das Tafelbild wandert, hängt von der Lösungswahl ab. Das gehört in den
             * Dialog: Sonst sucht die Lehrkraft es später in der Datei, die sie austeilt.
             */
            description={tafelbildHinweis({
              blaetter: sheetIds.length,
              loesungen: key,
              ausgabe: mode ?? 'pdf'
            })}
            checked={board}
            onChange={(e) => setBoard(e.currentTarget.checked)}
          />
        )}
        {/*
         * Ausfüllbares PDF: Auf den Schreiblinien lässt sich tippen, Kästchen lassen sich
         * ankreuzen. Nur beim PDF sinnvoll – gedruckt wird ohnehin mit dem Stift ausgefüllt,
         * und Word ist von Haus aus beschreibbar.
         */}
        {mode === 'pdf' && (
          <Checkbox
            label="Zum Ausfüllen am Gerät"
            description="Schreiblinien werden zu Textfeldern, Kästchen zum Ankreuzen. Das Blatt lässt sich dann digital bearbeiten und zurückschicken."
            checked={fillable}
            onChange={(e) => {
              const an = e.currentTarget.checked
              setFillable(an)
            }}
          />
        )}
        {sheetIds.length > 0 && (
          /*
           * Dieselbe Wahl wie in allen Programmen. „separate" ist beim Drucken jetzt gültig
           * („Lösungen separat drucken"): Vorher war es bei eingeschalteten Lösungen vorgewählt,
           * beim Drucken aber gar nicht angeboten – nichts war gewählt, und es kamen keine Lösungen.
           */
          <LoesungsWahl value={key} onChange={setKey} modus={mode} />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            loading={running}
            disabled={!sheetIds.length && !board}
            onClick={async () => {
              setRunning(true)
              try {
                if (sheetIds.length) merkeLoesungsWahl('arbeitsblatt', key)
                await run(sheetIds, sheetIds.length ? key : 'none', board, fillable)
                onClose()
              } catch (e) {
                notifyError(e, 'Export fehlgeschlagen')
              } finally {
                setRunning(false)
              }
            }}
          >
            {mode === 'print' ? 'Weiter zur Druckvorschau' : 'Speichern …'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
