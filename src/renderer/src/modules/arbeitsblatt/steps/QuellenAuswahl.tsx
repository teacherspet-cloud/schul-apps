import { Anchor, Badge, Button, Group, Modal, Radio, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { Quellentreffer } from '@shared/types'
import { ausgeblendetImThema, type AblehnungsUmfang } from '@shared/quellenAblehnung'
import type { GepruefterTreffer } from '../generation/originalmaterial'
import { notifyError } from '../../../shared/util'

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
 *
 * AUSSORTIEREN BLEIBT GESPEICHERT (01.10.2026). Gemeldet von der Lehrkraft: „Die Musikforschung"
 * und „Friedrich Gundolf" kamen zu „German Macbeth Adaptations" immer wieder, obwohl sie schon
 * aussortiert waren – „Keine davon" galt nur für den einen Lauf. Jetzt landet jede Ablehnung
 * in einer gemeinsamen Liste aller Programme:
 * - „Für dieses Thema ausblenden" je Fund,
 * - „Nie wieder vorschlagen" je Fund (für jedes Thema),
 * - „Keine davon": alle gezeigten Funde für dieses Thema.
 */
export interface QuellenAuswahlProps {
  /** bereits geladene, gemessene und nach Eignung sortierte Treffer */
  treffer: GepruefterTreffer[] | null
  thema: string
  /** Programm, aus dem gewählt wird – steht nur zur Anzeige in der Ablehnungsliste */
  programm?: string
  onWaehlen: (url: string | null) => void
}

const HERKUNFT: Record<Quellentreffer['herkunft'], string> = {
  wikisource: 'Wikisource',
  gutenberg: 'Projekt Gutenberg',
  netz: 'Internet'
}

export default function QuellenAuswahl({ treffer, thema, programm, onWaehlen }: QuellenAuswahlProps): React.JSX.Element {
  const [gewaehlt, setGewaehlt] = useState<string>('')
  const [weg, setWeg] = useState<string[]>([])
  const [ausgeblendet, setAusgeblendet] = useState(0)
  const sichtbar = (treffer ?? []).filter((t) => !weg.includes(t.treffer.url))

  // Der bestbewertete Treffer steht oben und ist vorausgewählt
  useEffect(() => {
    setWeg([])
    setGewaehlt(treffer?.[0]?.treffer.url ?? '')
  }, [treffer])

  // Wie viele Funde zu diesem Thema schon ausgeblendet sind – damit sich das rückgängig machen lässt
  useEffect(() => {
    if (!treffer || !thema.trim()) return
    let aktiv = true
    window.api.sources
      .ablehnungen()
      .then((d) => aktiv && setAusgeblendet(ausgeblendetImThema(d, thema)))
      .catch(() => undefined)
    return () => {
      aktiv = false
    }
  }, [treffer, thema])

  const ablehnen = async (liste: GepruefterTreffer[], umfang: AblehnungsUmfang): Promise<boolean> => {
    if (!liste.length) return true
    try {
      const d = await window.api.sources.ablehnen(
        liste.map(({ treffer: t }) => ({ url: t.url, titel: t.titel, umfang, art: 'text' as const, themaText: thema, thema, programm }))
      )
      setAusgeblendet(ausgeblendetImThema(d, thema))
      return true
    } catch (e) {
      notifyError(e, 'Die Ablehnung konnte nicht gespeichert werden')
      return false
    }
  }

  const ausblenden = async (g: GepruefterTreffer, umfang: AblehnungsUmfang): Promise<void> => {
    if (!(await ablehnen([g], umfang))) return
    const rest = sichtbar.filter((t) => t.treffer.url !== g.treffer.url)
    setWeg((w) => [...w, g.treffer.url])
    if (gewaehlt === g.treffer.url) setGewaehlt(rest[0]?.treffer.url ?? '')
  }

  const keineDavon = async (): Promise<void> => {
    await ablehnen(sichtbar, 'thema')
    onWaehlen(null)
  }

  const aufheben = async (): Promise<void> => {
    try {
      const d = await window.api.sources.ablehnungAufheben({ thema })
      setAusgeblendet(ausgeblendetImThema(d, thema))
    } catch (e) {
      notifyError(e, 'Die Ausblendungen konnten nicht aufgehoben werden')
    }
  }

  const knopf = (g: GepruefterTreffer, umfang: AblehnungsUmfang, text: string, hinweis: string): React.JSX.Element => (
    <Anchor
      component="button"
      type="button"
      size="xs"
      c={umfang === 'global' ? 'red' : 'dimmed'}
      title={hinweis}
      data-ablehnen={umfang}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void ausblenden(g, umfang)
      }}
    >
      {text}
    </Anchor>
  )

  return (
    <Modal opened={Boolean(treffer)} onClose={() => onWaehlen(null)} title="Originalquelle auswählen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Gefunden zu „{thema}", geladen und geprüft. Unbrauchbare Funde (Register, Werklisten, Scans, Navigationsseiten, fremdsprachige oder themenfremde
          Texte) sind schon aussortiert; jeder verbliebene Fund wurde auf Thema, Fach, Sprache und Jahrgang geprüft. In der Oberstufe entscheidet die Lehrkraft,
          welche Quelle genommen wird – sie bestimmt, was sich an der Aufgabe zeigen lässt.
        </Text>
        <ScrollArea.Autosize mah={420}>
          <Radio.Group value={gewaehlt} onChange={setGewaehlt}>
            <Stack gap="xs">
              {sichtbar.map((g) => {
                const { treffer: t, befund, begruendung } = g
                return (
                  <Radio
                    key={t.url}
                    value={t.url}
                    data-quelle={t.titel}
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
                        {/* Warum der Fund passt (Textart, Passung, Begründung) – kurz, damit die Lehrkraft widersprechen kann */}
                        {begruendung && (
                          <Text size="xs" data-begruendung>
                            {begruendung}
                          </Text>
                        )}
                        {t.auszug && (
                          <Text size="xs" lineClamp={2}>
                            {t.auszug}
                          </Text>
                        )}
                        <Group gap="xs" mt={2}>
                          {/* Wer eine Quelle für eine Klausur wählt, will vorher hineinsehen */}
                          <Anchor href={t.url} target="_blank" rel="noreferrer" size="xs" onClick={(e) => e.stopPropagation()}>
                            Quelle ansehen
                          </Anchor>
                          {knopf(g, 'thema', 'Für dieses Thema ausblenden', 'Diesen Fund zu diesem Thema nicht mehr vorschlagen – in allen Programmen')}
                          {knopf(g, 'global', 'Nie wieder vorschlagen', 'Diesen Fund zu keinem Thema mehr vorschlagen – in allen Programmen')}
                        </Group>
                      </div>
                    }
                  />
                )
              })}
              {!sichtbar.length && (
                <Text size="sm" c="dimmed">
                  Alle Funde sind ausgeblendet.
                </Text>
              )}
            </Stack>
          </Radio.Group>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed">
          Der gewählte Text wird geladen, auf den gewünschten Umfang gekürzt (Auslassungen mit […]) und mit Quellenangabe eingesetzt. Was gekürzt wurde, steht
          im Lehrkraft-Hinweis. Ausgeblendete Funde bleiben in allen Programmen ausgeblendet, auch nach einem Neustart.
        </Text>
        {ausgeblendet > 0 && (
          <Group gap="xs">
            <Text size="xs" c="dimmed" data-ausgeblendet={ausgeblendet}>
              Zu diesem Thema {ausgeblendet === 1 ? 'ist ein Fund' : `sind ${ausgeblendet} Funde`} ausgeblendet.
            </Text>
            <Anchor component="button" type="button" size="xs" onClick={() => void aufheben()}>
              Ausblendungen aufheben (gilt ab der nächsten Suche)
            </Anchor>
          </Group>
        )}
        <Group justify="space-between">
          {/*
            „Keine davon" ist kein Abbruch der Erzeugung, sondern eine Aussage über die
            Treffer. Was daraus folgt, hängt von der Art des Materials ab: Ein Arbeitsblatt
            entsteht mit gekennzeichnetem Autorentext, eine Klausur gar nicht. Die gezeigten
            Funde werden für dieses Thema ausgeblendet – sonst kämen sie beim nächsten Versuch wieder.
          */}
          <Button variant="subtle" color="gray" onClick={() => void keineDavon()} title="Alle gezeigten Funde für dieses Thema ausblenden">
            Keine davon
          </Button>
          <Button disabled={!gewaehlt || !sichtbar.some((t) => t.treffer.url === gewaehlt)} onClick={() => onWaehlen(gewaehlt)}>
            Diese Quelle verwenden
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
