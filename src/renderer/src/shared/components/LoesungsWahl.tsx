import { Button, Group, Modal, Radio, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import { notifyError } from '../util'
import { loesungsTexte, loesungsVorgabe, merkeLoesungsWahl, type AusgabeModus, type LoesungsModus } from '../loesungen'

export { loesungsTexte, loesungsVorgabe, merkeLoesungsWahl }
export type { AusgabeModus, LoesungsModus }

/** Die drei Möglichkeiten als Auswahl – Regeln und Beschriftung in shared/loesungen.ts */
export function LoesungsWahl({
  value,
  onChange,
  modus,
  erwartungshorizont = false
}: {
  value: LoesungsModus
  onChange: (wahl: LoesungsModus) => void
  modus: AusgabeModus | null
  erwartungshorizont?: boolean
}): React.JSX.Element {
  const texte = loesungsTexte(modus, erwartungshorizont)
  return (
    <Radio.Group label={erwartungshorizont ? 'Erwartungshorizont' : 'Lösungen'} value={value} onChange={(v) => onChange(v as LoesungsModus)}>
      <Stack gap={6} mt={4}>
        <Radio value="none" label={texte.none} />
        <Radio value="append" label={texte.append} />
        <Radio
          value="separate"
          label={texte.separate}
          description={
            modus === 'print' ? 'Eigener Druckauftrag nach dem Blatt – mit eigener Zahl an Exemplaren.' : 'Zwei Dateien: Dafür wird einmal ein Ordner gewählt.'
          }
        />
      </Stack>
    </Radio.Group>
  )
}

/**
 * Ausgabe-Dialog für Lernzielkontrolle, Grammatiktest und Klassenarbeit: Lösungswahl plus,
 * was das Programm sonst noch fragen muss (`children`, z. B. welche Fassungen).
 */
export function AusgabeDialog({
  modus,
  onClose,
  modul,
  hatLoesungen,
  erwartungshorizont = false,
  onAusgabe,
  children
}: {
  modus: AusgabeModus | null
  onClose: () => void
  /** Kennung des Programms – unter ihr wird die letzte Wahl gemerkt */
  modul: string
  hatLoesungen: boolean
  erwartungshorizont?: boolean
  onAusgabe: (modus: AusgabeModus, loesung: LoesungsModus) => Promise<void>
  children?: React.ReactNode
}): React.JSX.Element {
  const [loesung, setLoesung] = useState<LoesungsModus>(() => loesungsVorgabe(modul, hatLoesungen))
  const [laeuft, setLaeuft] = useState(false)
  // Bei jedem Öffnen die gemerkte Wahl – sie kann sich im anderen Ausgabeweg geändert haben
  useEffect(() => {
    if (modus) setLoesung(loesungsVorgabe(modul, hatLoesungen))
  }, [modus]) // eslint-disable-line react-hooks/exhaustive-deps

  const titel = modus === 'docx' ? 'Als Word-Dokument speichern' : modus === 'pdf' ? 'Als PDF speichern' : 'Drucken'
  return (
    <Modal opened={modus !== null} onClose={onClose} title={titel}>
      <Stack>
        {children}
        <LoesungsWahl value={loesung} onChange={setLoesung} modus={modus} erwartungshorizont={erwartungshorizont} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            loading={laeuft}
            onClick={async () => {
              if (!modus) return
              merkeLoesungsWahl(modul, loesung)
              setLaeuft(true)
              try {
                await onAusgabe(modus, loesung)
                onClose()
              } catch (e) {
                notifyError(e, 'Die Ausgabe ist fehlgeschlagen')
              } finally {
                setLaeuft(false)
              }
            }}
          >
            {modus === 'print' ? 'Weiter zur Druckvorschau' : 'Speichern …'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
