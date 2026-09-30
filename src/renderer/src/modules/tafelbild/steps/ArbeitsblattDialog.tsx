import { Button, Checkbox, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { IconFileText } from '@tabler/icons-react'
import { useState } from 'react'
import MaterialWahl from '../../../shared/components/MaterialWahl'
import { notifyError, notifySuccess } from '../../../shared/util'
import { legeArbeitsblattAb } from '../../arbeitsblatt/library'
import type { Worksheet } from '../../arbeitsblatt/model/types'
import { pngDataUrl } from '../ausgabe'
import { formatInfo, type FormatId } from '../formate'
import { boardPlanAus, insArbeitsblatt } from '../material'
import type { Tafelbild } from '../model'

/**
 * Tafelbild ins Arbeitsblatt übernehmen (30.09.2026): als Tafelbild-Baustein der Lehrkraft (dort
 * im Reiter „Tafelbild" bearbeitbar, im Querformat gedruckt) und auf Wunsch zusätzlich als Bild
 * auf dem Blatt – etwa die Lückenfassung zum Ausfüllen.
 */
export default function ArbeitsblattDialog({ t, offen, schliessen }: { t: Tafelbild; offen: boolean; schliessen: () => void }): React.JSX.Element {
  const [wahl, setWahl] = useState(false)
  const [blatt, setBlatt] = useState<{ id: string; name: string } | null>(null)
  const [format, setFormat] = useState<FormatId>(t.tafeln[0]?.format ?? 'klapptafel')
  const [alsBild, setAlsBild] = useState(true)
  const [luecke, setLuecke] = useState(t.meta.varianten.luecke)
  const [laeuft, setLaeuft] = useState(false)

  const uebernehmen = async (): Promise<void> => {
    const tafel = t.tafeln.find((x) => x.format === format)
    if (!blatt || !tafel || !t.inhalt) return
    setLaeuft(true)
    try {
      const gespeichert = await window.api.sheets.get(blatt.id)
      const plan = boardPlanAus(t.inhalt, tafel)
      const bild = alsBild ? { dataUrl: await pngDataUrl(tafel, luecke ? { luecke: true, wortspeicher: true } : {}, 1600), titel: t.inhalt.titel, luecke } : undefined
      await legeArbeitsblattAb(blatt.id, gespeichert.payload as Worksheet, (ws) => insArbeitsblatt(ws, plan, bild))
      notifySuccess(`Tafelbild in „${blatt.name}" übernommen.`)
      schliessen()
    } catch (e) {
      notifyError(e, 'Das Tafelbild konnte nicht übernommen werden')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Modal opened={offen} onClose={schliessen} title="Ins Arbeitsblatt übernehmen" size="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Button variant="default" leftSection={<IconFileText size={16} />} onClick={() => setWahl(true)} data-tb-blatt-waehlen>
            {blatt ? blatt.name : 'Arbeitsblatt wählen …'}
          </Button>
        </Group>
        <Select
          label="Format"
          data={t.tafeln.map((x) => ({ value: x.format, label: formatInfo(x.format).label }))}
          value={format}
          onChange={(v) => v && setFormat(v as FormatId)}
          allowDeselect={false}
        />
        <Text size="xs" c="dimmed">
          Das Tafelbild wird als Tafelbild der Lehrkraft eingetragen (ein vorhandenes im selben Format wird ersetzt).
        </Text>
        <Checkbox label="Zusätzlich als Bild auf dem ersten Blatt" checked={alsBild} onChange={(e) => setAlsBild(e.currentTarget.checked)} />
        {alsBild && <Checkbox ml="lg" label="Als Lückenfassung mit Wortspeicher" checked={luecke} onChange={(e) => setLuecke(e.currentTarget.checked)} />}
        <Group justify="flex-end">
          <Button onClick={() => void uebernehmen()} disabled={!blatt} loading={laeuft} data-tb-blatt-uebernehmen>
            Übernehmen
          </Button>
        </Group>
      </Stack>
      <MaterialWahl
        offen={wahl}
        schliessen={() => setWahl(false)}
        programme={['arbeitsblatt']}
        gewaehlt={blatt ? `arbeitsblatt:${blatt.id}` : null}
        onWahl={(_m, id) => {
          setWahl(false)
          window.api.sheets
            .get(id)
            .then((w) => setBlatt({ id, name: w.name }))
            .catch(notifyError)
        }}
      />
    </Modal>
  )
}
