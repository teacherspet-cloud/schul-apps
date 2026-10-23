import { Alert, Button, Checkbox, Group, List, Loader, Modal, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { IconFileMinus } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { kuerzAnfrage, kuerzungAus, wendeKuerzungAn, type Kuerzung } from '../generation/kuerzen'
import type { Worksheet } from '../model/types'
import type { PagePlan } from './paginate'
import { schuelerSeiten, wenigerSeitenSuchen, type SeitenVorschlag } from './seitenAnpassen'
import { messeSeiten } from './seitenMessen'

/**
 * Knopf „Auf weniger Seiten" in der Leiste von Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und Grammatiktest
 * (23.10.2026, Wunsch der Lehrkraft: keine Folgeseite mit nur wenigen Zeilen). Die App probiert gemessen Zeilenabstand,
 * Rand, Bilder und Schrift (didactics/seitenAnpassung.ts) und zeigt, was sich ändern würde; erst „Übernehmen" ändert
 * das Dokument – als ein Rückgängig-Schritt. Reicht das nicht, kürzt auf Wunsch die KI (generation/kuerzen.ts): jede
 * Kürzung einzeln sichtbar und abwählbar, bei mehreren Fassungen in allen gleich.
 */
type Zustand =
  | { art: 'misst' }
  | { art: 'layout'; v: SeitenVorschlag }
  | { art: 'reicht-nicht'; vorher: number }
  | { art: 'ki' }
  | { art: 'kuerzung'; k: Kuerzung; vorher: number; nachher: number }
  | { art: 'fehler'; text: string }

/** Vorschau ohne Fettmarkierung (**…**) */
const kurz = (t: string, n = 140): string => {
  const s = t.replace(/\*\*/g, '')
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export function WenigerSeitenKnopf({
  ws,
  layouts,
  logo,
  schule,
  alleFassungen,
  uebernehmen,
  kuerzungUebernehmen
}: {
  ws: Worksheet
  layouts: Map<string, PagePlan[]>
  logo: string | null
  schule: string
  /** Zeigt der Editor nur eine Fassung, wird mit allen gemessen – sie ändern sich gleich (Lernzielkontrolle) */
  alleFassungen?: Worksheet
  uebernehmen: (v: SeitenVorschlag) => void
  /** Kürzung der KI ins Dokument schreiben (wendeKuerzungAn) */
  kuerzungUebernehmen: (k: Kuerzung) => void
}): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const [stand, setStand] = useState('')
  const [z, setZ] = useState<Zustand>({ art: 'misst' })
  const [ab, setAb] = useState<Set<string>>(new Set())
  const lauf = useRef(0)
  const seiten = schuelerSeiten(ws, layouts)
  if (seiten < 2) return null
  const alle = alleFassungen ?? ws

  const starten = (): void => {
    const nr = ++lauf.current
    setOffen(true)
    setZ({ art: 'misst' })
    setStand('Das Blatt wird gemessen …')
    void wenigerSeitenSuchen(alle, logo, schule, alleFassungen ? undefined : seiten, setStand, () => lauf.current !== nr).then(
      (e) => lauf.current === nr && setZ(e.nachher !== null && 'design' in e ? { art: 'layout', v: e } : { art: 'reicht-nicht', vorher: e.vorher }),
      () => lauf.current === nr && setZ({ art: 'reicht-nicht', vorher: seiten })
    )
  }
  const kiKuerzen = async (vorher: number): Promise<void> => {
    const nr = ++lauf.current
    setZ({ art: 'ki' })
    try {
      const k = kuerzungAus(alle, await window.api.ai.structured<unknown>(kuerzAnfrage(alle, vorher)))
      if (lauf.current !== nr) return
      if (!k.aenderungen.length && !k.weglassen.length) {
        setZ({ art: 'fehler', text: 'Die KI hat keine Kürzung gefunden, die die Anforderungen gleich lässt.' })
        return
      }
      setStand('Gekürzte Fassung wird gemessen …')
      const gekuerzt = wendeKuerzungAn(alle, k)
      const nachher = schuelerSeiten(gekuerzt, await messeSeiten(gekuerzt, logo, schule))
      if (lauf.current !== nr) return
      setAb(new Set())
      setZ({ art: 'kuerzung', k, vorher, nachher })
    } catch (e) {
      if (lauf.current === nr) setZ({ art: 'fehler', text: e instanceof Error ? e.message : String(e) })
    }
  }
  const schliessen = (): void => {
    lauf.current++
    setOffen(false)
  }
  const fassungen = alle.sheets.length > 1

  return (
    <>
      <Tooltip label="Schrift, Abstände und Bilder so anpassen, dass das Blatt eine Seite weniger braucht – mit Rückfrage" multiline w={280}>
        <Button size="xs" variant="default" leftSection={<IconFileMinus size={14} />} onClick={starten} data-weniger-seiten>
          Auf weniger Seiten
        </Button>
      </Tooltip>
      <Modal opened={offen} onClose={schliessen} title="Auf weniger Seiten bringen" centered size={z.art === 'kuerzung' ? 'lg' : 'md'}>
        {(z.art === 'misst' || z.art === 'ki') && (
          <Group gap="sm" wrap="nowrap" data-weniger-seiten-laeuft>
            <Loader size="sm" />
            <Text size="sm">{z.art === 'ki' ? 'Die KI kürzt …' : stand}</Text>
          </Group>
        )}
        {z.art === 'layout' && (
          <Stack gap="sm" data-weniger-seiten-vorschlag>
            <Text size="sm">
              Mit diesen Änderungen braucht das Blatt <b>{z.v.nachher}</b> statt {z.v.vorher} Seiten{fassungen ? ' – für alle Fassungen gleich' : ''}:
            </Text>
            <List size="sm">
              {z.v.aenderungen.map((a) => (
                <List.Item key={a}>{a}</List.Item>
              ))}
            </List>
            <Text size="xs" c="dimmed">
              Schreiblinien bleiben, wie sie sind. Rückgängig mit Strg+Z.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={schliessen}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  uebernehmen(z.v)
                  setOffen(false)
                }}
                data-weniger-seiten-uebernehmen
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        )}
        {z.art === 'reicht-nicht' && (
          <Stack gap="sm" data-weniger-seiten-nicht>
            <Alert color="yellow" variant="light">
              Auch mit der kleinsten erlaubten Schrift, engeren Abständen und kleineren Bildern bleibt es bei {z.vorher} Seiten. Schrift, Schreiblinien und
              Bilder werden dafür nicht unter ihre Mindestgröße gesetzt.
            </Alert>
            <Text size="sm">
              Die KI kann Aufgabenstellungen und eigene Texte knapper fassen und unbewertete Zugaben (Lernziele, Selbsteinschätzung, Hilfen) weglassen. Aufgaben
              und Punkte bleiben{fassungen ? ', und alle Fassungen ändern sich gleich' : ''}. Jede Kürzung ist vor dem Übernehmen zu sehen.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={schliessen}>
                Schließen
              </Button>
              <Button onClick={() => void kiKuerzen(z.vorher)} data-weniger-seiten-kuerzen>
                KI kürzen lassen
              </Button>
            </Group>
          </Stack>
        )}
        {z.art === 'kuerzung' && (
          <Stack gap="sm" data-weniger-seiten-kuerzung>
            <Text size="sm">
              {z.nachher < z.vorher ? (
                <>
                  Mit allen Kürzungen braucht das Blatt <b>{z.nachher}</b> statt {z.vorher} Seiten.
                </>
              ) : (
                <>Auch mit allen Kürzungen bleibt es bei {z.vorher} Seiten – übernehmen lassen sie sich trotzdem.</>
              )}{' '}
              Abgewählte Kürzungen bleiben aus.
            </Text>
            <ScrollArea.Autosize mah={420}>
              <Stack gap="xs">
                {/* Eine Zugabe in allen Fassungen: nur gemeinsam an- und abwählbar (gleiche Anforderungen) */}
                {[...new Set(z.k.weglassen.map((w) => w.gruppe))].map((g) => (
                  <Checkbox
                    key={g}
                    checked={!ab.has(g)}
                    onChange={() => setAb((s) => (s.delete(g) ? new Set(s) : new Set(s).add(g)))}
                    label={
                      <Text size="sm">
                        Weglassen:{' '}
                        {z.k.weglassen
                          .filter((w) => w.gruppe === g)
                          .map((w) => w.wo)
                          .join(' · ')}
                      </Text>
                    }
                  />
                ))}
                {z.k.aenderungen.map((a) => {
                  const key = `${a.blockId}|${a.feld}`
                  return (
                    <Checkbox
                      key={key}
                      checked={!ab.has(key)}
                      onChange={() => setAb((s) => (s.delete(key) ? new Set(s) : new Set(s).add(key)))}
                      label={
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>
                            {a.wo}
                          </Text>
                          <Text size="xs" c="dimmed" td="line-through">
                            {kurz(a.alt)}
                          </Text>
                          <Text size="xs">{kurz(a.neu, 400)}</Text>
                        </Stack>
                      }
                    />
                  )
                })}
              </Stack>
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button variant="default" onClick={schliessen}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  kuerzungUebernehmen({
                    aenderungen: z.k.aenderungen.filter((a) => !ab.has(`${a.blockId}|${a.feld}`)),
                    weglassen: z.k.weglassen.filter((w) => !ab.has(w.gruppe))
                  })
                  setOffen(false)
                }}
                data-weniger-seiten-kuerzung-uebernehmen
              >
                Übernehmen
              </Button>
            </Group>
          </Stack>
        )}
        {z.art === 'fehler' && (
          <Stack gap="sm">
            <Alert color="red" variant="light">
              {z.text}
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={schliessen}>
                Schließen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
