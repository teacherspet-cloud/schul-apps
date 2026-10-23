import { Alert, Button, Group, Loader, Modal, Stack, Text, Tooltip } from '@mantine/core'
import { IconFileMinus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TestDocument } from '../model/types'
import { mindestSchriftTest, pageLimitOf, useTestLayout, type TestLayouts } from './useTestLayout'

/**
 * „Auf weniger Seiten" im Vokabeltest (23.10.2026, Wunsch der Lehrkraft). Der Vokabeltest kann schon bei einer
 * Seitenvorgabe Abstände und Schrift verkleinern (useTestLayout); hier wird unsichtbar gemessen, ob „höchstens eine
 * Seite weniger" gelingt. Erst „Übernehmen" setzt die Vorgabe – sie gilt für alle Fassungen gleich, Schreibzeilen
 * bleiben, die Schrift sinkt nicht unter 10 pt (Klasse 5/6: 12 pt).
 */
function Probe({ doc, fertig }: { doc: TestDocument; fertig: (l: TestLayouts) => void }): React.JSX.Element {
  const { layouts, measure } = useTestLayout(doc)
  useEffect(() => {
    if (!layouts) return
    const t = setTimeout(() => fertig(layouts), 600)
    return () => clearTimeout(t)
  }, [layouts, fertig])
  return <>{measure}</>
}

const pt = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

export function WenigerSeitenTest({
  doc,
  layouts,
  uebernehmen
}: {
  doc: TestDocument
  layouts: TestLayouts | null
  uebernehmen: (seiten: number) => void
}): React.JSX.Element | null {
  const [probe, setProbe] = useState<TestDocument | null>(null)
  const [ergebnis, setErgebnis] = useState<TestLayouts | null>(null)
  const [offen, setOffen] = useState(false)
  const seiten = layouts?.pageCount ?? 0
  if (seiten < 2) return null
  const ziel = seiten - 1

  const starten = (): void => {
    setErgebnis(null)
    setOffen(true)
    setProbe({ ...doc, settings: { ...doc.settings, pageLimit: { mode: 'max', pages: ziel } } })
  }
  const schrift = ergebnis ? Math.min(...[...ergebnis.student.values()].map((l) => l.fontSize)) : doc.fontSize
  const passt = Boolean(ergebnis?.fits && ergebnis.pageCount <= ziel)

  return (
    <>
      <Tooltip label="Abstände und Schrift so anpassen, dass der Test eine Seite weniger braucht – mit Rückfrage" multiline w={280}>
        <Button size="xs" variant="default" leftSection={<IconFileMinus size={14} />} onClick={starten} data-weniger-seiten>
          Auf weniger Seiten
        </Button>
      </Tooltip>
      {probe && !ergebnis && (
        <Probe
          doc={probe}
          fertig={(l) => {
            setErgebnis(l)
            setProbe(null)
          }}
        />
      )}
      <Modal
        opened={offen}
        onClose={() => {
          setOffen(false)
          setProbe(null)
        }}
        title="Auf weniger Seiten bringen"
        centered
      >
        {!ergebnis ? (
          <Group gap="sm" data-weniger-seiten-laeuft>
            <Loader size="sm" />
            <Text size="sm">Abstände und Schrift werden ausprobiert …</Text>
          </Group>
        ) : passt ? (
          <Stack gap="sm" data-weniger-seiten-vorschlag>
            <Text size="sm">
              Der Test passt auf <b>{ergebnis.pageCount}</b> statt {seiten} Seiten{doc.variants.length > 1 ? ' – alle Fassungen gleich' : ''}: engere Abstände
              {schrift < doc.fontSize ? `, Schrift ${pt(doc.fontSize)} → ${pt(schrift)} pt` : ''}. Die Vorgabe „höchstens {ziel}{' '}
              {ziel === 1 ? 'Seite' : 'Seiten'}" bleibt beim Test, auch wenn er sich noch ändert.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setOffen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  uebernehmen(ziel)
                  setOffen(false)
                }}
                data-weniger-seiten-uebernehmen
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="sm" data-weniger-seiten-nicht>
            <Alert color="yellow" variant="light">
              Auch mit engeren Abständen und {pt(mindestSchriftTest(doc))} pt Schrift bleibt es bei {seiten} Seiten
              {pageLimitOf(doc).mode !== 'auto' ? ' (die bisherige Seitenvorgabe bleibt)' : ''}. Weniger Aufgaben oder Wörter im Schritt „Einstellungen" sparen
              Platz.
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setOffen(false)}>
                Schließen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
