import { Anchor, Badge, Button, Group, Modal, Radio, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { Quellentreffer } from '@shared/types'
import type { GepruefterTreffer } from '../generation/originalmaterial'

/**
 * Die Lehrkraft wählt die Originalquelle aus – in der Sekundarstufe II.
 *
 * Entscheidung der Lehrkraft (24.09.2026): „Automatisch, nur in Sek II Trefferliste." In
 * Klasse 5–10 läuft die Suche durch; ab Jahrgang 11 legt die App die Treffer vor.
 *
 * Der Grund ist nicht Misstrauen gegenüber der Suche, sondern die Sache: In der Oberstufe ist
 * die Quelle selbst Gegenstand des Unterrichts. Welcher Text genommen wird, entscheidet über
 * das, was sich daran überhaupt zeigen lässt – das ist eine fachliche Entscheidung und keine
 * Beschaffungsfrage.
 *
 * Deshalb steht hier auch der FUNDORT als anklickbare Adresse: Wer eine Quelle für eine
 * Klausur auswählt, will vorher hineinsehen.
 */
export interface QuellenAuswahlProps {
  /** bereits geladene, gemessene und nach Eignung sortierte Treffer */
  treffer: GepruefterTreffer[] | null
  thema: string
  onWaehlen: (url: string | null) => void
}

const HERKUNFT: Record<Quellentreffer['herkunft'], string> = {
  wikisource: 'Wikisource',
  gutenberg: 'Projekt Gutenberg',
  netz: 'Internet'
}

export default function QuellenAuswahl({ treffer, thema, onWaehlen }: QuellenAuswahlProps): React.JSX.Element {
  const [gewaehlt, setGewaehlt] = useState<string>('')
  // Der bestbewertete Treffer steht oben und ist vorausgewählt
  useEffect(() => setGewaehlt(treffer?.[0]?.treffer.url ?? ''), [treffer])

  return (
    <Modal opened={Boolean(treffer)} onClose={() => onWaehlen(null)} title="Originalquelle auswählen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Gefunden zu „{thema}", geladen und geprüft. Unbrauchbare Funde (Register, Scans, Navigationsseiten) sind schon aussortiert; die Reihenfolge richtet
          sich nach Umfang und sprachlicher Passung. In der Oberstufe entscheidet die Lehrkraft, welche Quelle genommen wird – sie bestimmt, was sich an der
          Aufgabe zeigen lässt.
        </Text>
        <ScrollArea.Autosize mah={420}>
          <Radio.Group value={gewaehlt} onChange={setGewaehlt}>
            <Stack gap="xs">
              {(treffer ?? []).map(({ treffer: t, befund }) => (
                <Radio
                  key={t.url}
                  value={t.url}
                  label={
                    <div>
                      <Group gap={6} wrap="nowrap">
                        <Text fw={600} size="sm">
                          {t.titel}
                        </Text>
                        <Badge size="xs" variant="light">
                          {HERKUNFT[t.herkunft]}
                        </Badge>
                      </Group>
                      {t.urheber && (
                        <Text size="xs" c="dimmed">
                          {t.urheber}
                          {t.jahr ? ` · ${t.jahr}` : ''}
                        </Text>
                      )}
                      {/* Gemessen am geladenen Volltext – nicht aus der Seitengröße geschätzt */}
                      <Text size="xs" c="dimmed">
                        {befund}
                      </Text>
                      {t.auszug && (
                        <Text size="xs" lineClamp={2}>
                          {t.auszug}
                        </Text>
                      )}
                      {/* Wer eine Quelle für eine Klausur wählt, will vorher hineinsehen */}
                      <Anchor href={t.url} target="_blank" rel="noreferrer" size="xs" onClick={(e) => e.stopPropagation()}>
                        Quelle ansehen
                      </Anchor>
                    </div>
                  }
                />
              ))}
            </Stack>
          </Radio.Group>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed">
          Der gewählte Text wird geladen, auf den gewünschten Umfang gekürzt (Auslassungen mit […]) und mit Quellenangabe eingesetzt. Was gekürzt wurde, steht
          im Lehrkraft-Hinweis.
        </Text>
        <Group justify="space-between">
          {/*
            „Keine davon" ist kein Abbruch der Erzeugung, sondern eine Aussage über die
            Treffer. Was daraus folgt, hängt von der Art des Materials ab: Ein Arbeitsblatt
            entsteht mit gekennzeichnetem Autorentext, eine Klausur gar nicht.
          */}
          <Button variant="subtle" color="gray" onClick={() => onWaehlen(null)}>
            Keine davon
          </Button>
          <Button disabled={!gewaehlt} onClick={() => onWaehlen(gewaehlt)}>
            Diese Quelle verwenden
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
