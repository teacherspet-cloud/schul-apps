import { Alert, Button, List, Modal, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core'
import { IconSchool } from '@tabler/icons-react'
import { strToU8, zipSync } from 'fflate'
import { useMemo, useState } from 'react'
import { notifyError, safeFileName } from '../../util'
import { speichereAusgabe } from '../ausgabe'
import type { AblageZiel } from '@shared/types'
import type { LmsBericht } from './fragen'
import { giftText, h5pInhalt, moodleXml } from './formate'

type Format = 'moodle' | 'gift' | 'h5p'

const INFO: Record<Format, string> = {
  moodle: 'Moodle: Fragensammlung › Importieren › „Moodle-XML-Format". Alle Fragearten, Lückentexte als Cloze-Frage.',
  gift: 'Moodle oder ILIAS: Import im GIFT-Format. Lückentexte mit mehreren Lücken werden zu mehreren Fragen.',
  h5p: 'H5P-Fragensatz für Plattformen mit H5P (Moodle-H5P, Lumi, ILIAS-Plugin). Die H5P-Bibliotheken bringt die Plattform mit; verlangt sie diese im Paket, bitte Moodle-XML nehmen.'
}

/** H5P-Paket als ZIP: h5p.json und content/content.json */
export function h5pPaket(bericht: LmsBericht, titel: string): { daten: Uint8Array; nichtMoeglich: string[] } {
  const { h5p, content, nichtMoeglich } = h5pInhalt(bericht.fragen, titel)
  return { daten: zipSync({ 'h5p.json': strToU8(JSON.stringify(h5p)), 'content/content.json': strToU8(JSON.stringify(content)) }), nichtMoeglich }
}

/**
 * „Lernplattform …" (Großprogramm 0.4, F5): die Aufgaben als Fragen für Moodle, ILIAS oder H5P.
 * Der Dialog sagt vor dem Speichern, was übernommen wird und was nicht – mit Grund.
 */
export default function LmsExport({ bericht, titel, ziel }: { bericht: () => LmsBericht; titel: string; ziel?: AblageZiel }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [format, setFormat] = useState<Format>('moodle')
  const b = useMemo(() => (offen ? bericht() : null), [offen, bericht])
  const h5pFehlt = useMemo(() => (b && format === 'h5p' ? h5pInhalt(b.fragen, titel).nichtMoeglich : []), [b, format, titel])
  const name = safeFileName(titel || 'Fragen')

  const speichern = (): void => {
    if (!b) return
    const datei =
      format === 'moodle'
        ? { name: `${name}.xml`, filter: [{ name: 'Moodle-XML', extensions: ['xml'] }], daten: moodleXml(b.fragen, titel) }
        : format === 'gift'
          ? { name: `${name}.gift.txt`, filter: [{ name: 'GIFT', extensions: ['txt', 'gift'] }], daten: giftText(b.fragen, titel) }
          : { name: `${name}.h5p`, filter: [{ name: 'H5P', extensions: ['h5p'] }], daten: h5pPaket(b, titel).daten }
    void speichereAusgabe([datei], 'Fragen für die Lernplattform gespeichert.', ziel)
      .then((n) => n && setOffen(false))
      .catch(notifyError)
  }

  return (
    <>
      <Tooltip label="Aufgaben als Fragen für Moodle, ILIAS oder H5P">
        <Button size="xs" variant="default" leftSection={<IconSchool size={14} />} onClick={() => setOffen(true)} data-lms-export>
          Lernplattform …
        </Button>
      </Tooltip>
      <Modal opened={offen} onClose={() => setOffen(false)} title="Für die Lernplattform speichern" size="lg">
        {b && (
          <Stack gap="sm">
            <SegmentedControl
              data={[
                { value: 'moodle', label: 'Moodle-XML' },
                { value: 'gift', label: 'GIFT' },
                { value: 'h5p', label: 'H5P' }
              ]}
              value={format}
              onChange={(v) => setFormat(v as Format)}
            />
            <Text size="sm" c="dimmed">
              {INFO[format]}
            </Text>
            <Text size="sm" fw={600} data-lms-anzahl={b.fragen.length}>
              {b.fragen.length} Frage{b.fragen.length === 1 ? '' : 'n'} werden übernommen.
            </Text>
            {(b.uebersprungen.length > 0 || h5pFehlt.length > 0) && (
              <Alert color="yellow" variant="light" title="Nicht übernommen">
                <List size="sm">
                  {b.uebersprungen.map((u) => (
                    <List.Item key={u.titel}>
                      {u.titel}: {u.grund}
                    </List.Item>
                  ))}
                  {h5pFehlt.map((u) => (
                    <List.Item key={u}>{u}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            <Button onClick={speichern} disabled={!b.fragen.length} data-lms-speichern>
              Speichern
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  )
}
