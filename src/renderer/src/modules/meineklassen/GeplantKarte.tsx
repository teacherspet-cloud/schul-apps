/**
 * „Geplant" in „Meine Klassen" (09.10.2026, abgestimmt mit der Lehrkraft): je Lerngruppe eine Zeitleiste der geplanten
 * Freischaltungen – Datum, was, Art (Symbol). Je Eintrag: verschieben (Datum und Uhrzeit), jetzt freischalten, absagen
 * (geplante Freigabe löschen; Vokabelabschnitte werden wie „Abschnitt entfernen" sanft herausgenommen – ein Lernstand
 * bliebe erhalten). Server: src/server/planen.ts. Ohne Geplantes erscheint nichts.
 */
import KalenderHinweis from '../../shared/components/KalenderHinweis'
import { ActionIcon, Button, Card, Group, Menu, Modal, Stack, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core'
import { IconAbc, IconBook2, IconCalendarTime, IconChalkboard, IconClock, IconDots, IconFileText, IconPencil, IconRoute } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { kurzDatum, PLAN_NAME, type PlanTyp } from '@shared/freigabePlan'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { ausFeldern, datumFeld, PLAN_GEAENDERT, planGeaendert, zeitFeld } from '../../shared/components/FreigabePlanen'

interface Geplant {
  typ: PlanTyp
  id: string
  teil?: number
  titel: string
  fach: string
  ab: number
  bis: number | null
}

const SYMBOL: Record<PlanTyp, React.ReactNode> = {
  vok: <IconAbc size={14} />,
  gram: <IconBook2 size={14} />,
  blatt: <IconFileText size={14} />,
  tafel: <IconChalkboard size={14} />,
  feedback: <IconPencil size={14} />,
  reihe: <IconRoute size={14} />
}

export default function GeplantKarte({ gruppeId, neuLaden }: { gruppeId: string; neuLaden?: () => void }): React.JSX.Element | null {
  const [liste, setListe] = useState<Geplant[] | null>(null)
  const [verschieben, setVerschieben] = useState<Geplant | null>(null)
  const [absagen, setAbsagen] = useState<Geplant | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const laden = useCallback(() => {
    void holen<{ eintraege: Geplant[] }>(`/server/planen?gruppe=${encodeURIComponent(gruppeId)}`).then(
      (d) => setListe(d.eintraege),
      () => setListe([])
    )
  }, [gruppeId])
  useEffect(laden, [laden])
  useEffect(() => {
    window.addEventListener(PLAN_GEAENDERT, laden)
    return () => window.removeEventListener(PLAN_GEAENDERT, laden)
  }, [laden])
  if (!liste?.length) return null

  const aktion = async (pfad: string, e: Geplant, mehr: Record<string, unknown> = {}, meldung = ''): Promise<boolean> => {
    setLaeuft(true)
    try {
      await senden(pfad, { typ: e.typ, id: e.id, ...(e.teil !== undefined ? { teil: e.teil, titel: e.titel } : {}), ...mehr })
      if (meldung) notifySuccess(meldung)
      planGeaendert()
      neuLaden?.()
      return true
    } catch (er) {
      notifyError(er)
      return false
    } finally {
      setLaeuft(false)
    }
  }
  const absagenLos = async (e: Geplant): Promise<void> => {
    // Vokabelabschnitt: sanft herausnehmen wie „Abschnitt entfernen" in Sprachenlernen
    const ok =
      e.typ === 'vok'
        ? await (async () => {
            setLaeuft(true)
            try {
              await senden(`/server/vokabeln/${e.id}/abschnitt-entfernen`, { index: e.teil, titel: e.titel })
              planGeaendert()
              neuLaden?.()
              return true
            } catch (er) {
              notifyError(er)
              return false
            } finally {
              setLaeuft(false)
            }
          })()
        : await aktion('/server/planen/absagen', e)
    if (ok) {
      notifySuccess(`„${e.titel}“ abgesagt.`)
      setAbsagen(null)
    }
  }

  return (
    <Card withBorder radius="md" padding="md" data-geplant-karte>
      <Group gap={6} mb="xs">
        <IconCalendarTime size={18} color="var(--mantine-color-blue-6)" />
        <Text fw={700}>Geplant</Text>
        <Text size="sm" c="dimmed">
          ({liste.length})
        </Text>
      </Group>
      <Stack gap={0} style={{ borderLeft: '2px solid var(--mantine-color-gray-3)', marginLeft: 8, paddingLeft: 12 }}>
        {liste.map((e) => (
          <Group key={`${e.typ}:${e.id}:${e.teil ?? ''}`} gap="xs" wrap="nowrap" py={4} data-geplant={e.typ} data-geplant-titel={e.titel}>
            <Text size="sm" fw={600} w={128} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              {kurzDatum(e.ab)}, {zeitFeld(new Date(e.ab))}
            </Text>
            <Tooltip label={PLAN_NAME[e.typ]}>
              <ThemeIcon size="sm" variant="light" color="blue" aria-label={PLAN_NAME[e.typ]}>
                {SYMBOL[e.typ]}
              </ThemeIcon>
            </Tooltip>
            <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
              {e.titel}
              {e.bis ? (
                <Text span size="xs" c="dimmed">
                  {' '}
                  · bis {kurzDatum(e.bis)}
                </Text>
              ) : null}
            </Text>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={`${e.titel}: Aktionen`} data-geplant-aktionen>
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconClock size={14} />} onClick={() => setVerschieben(e)} data-geplant-verschieben>
                  Verschieben …
                </Menu.Item>
                <Menu.Item onClick={() => void aktion('/server/planen/jetzt', e, {}, `„${e.titel}“ ist jetzt freigeschaltet.`)} data-geplant-jetzt>
                  Jetzt freischalten
                </Menu.Item>
                <Menu.Item color="red" onClick={() => setAbsagen(e)} data-geplant-absagen>
                  Absagen …
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        ))}
      </Stack>
      {verschieben && (
        <Verschieben
          e={verschieben}
          laeuft={laeuft}
          schliessen={() => setVerschieben(null)}
          los={async (ab) => {
            if (await aktion('/server/planen/verschieben', verschieben, { ab }, `„${verschieben.titel}“ verschoben auf ${kurzDatum(ab)}.`)) setVerschieben(null)
          }}
        />
      )}
      <Modal opened={Boolean(absagen)} onClose={() => setAbsagen(null)} title="Geplante Freischaltung absagen?">
        {absagen && (
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              {absagen.titel}
            </Text>
            <Text size="sm">
              {absagen.typ === 'vok'
                ? 'Der Abschnitt wird aus dem Kurs genommen (wie „Abschnitt entfernen“) – er lässt sich später wieder hinzufügen.'
                : 'Die geplante Freigabe wird gelöscht. Das Original in der Bibliothek bleibt.'}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAbsagen(null)}>
                Abbrechen
              </Button>
              <Button color="red" loading={laeuft} onClick={() => void absagenLos(absagen)} data-geplant-absagen-bestaetigen>
                Absagen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  )
}

function Verschieben({ e, laeuft, schliessen, los }: { e: Geplant; laeuft: boolean; schliessen: () => void; los: (ab: number) => Promise<void> }): React.JSX.Element {
  const [datum, setDatum] = useState(datumFeld(new Date(e.ab)))
  const [zeit, setZeit] = useState(zeitFeld(new Date(e.ab)))
  const ab = ausFeldern(datum, zeit)
  return (
    <Modal opened onClose={schliessen} title={`Verschieben: ${e.titel}`}>
      <Stack gap="sm">
        <Group align="flex-end" gap="xs">
          <TextInput type="date" label="Freischalten ab" value={datum} onChange={(x) => setDatum(x.currentTarget.value)} data-verschieben-datum />
          <TextInput type="time" label="Uhrzeit" value={zeit} onChange={(x) => setZeit(x.currentTarget.value)} w={120} data-verschieben-zeit />
        </Group>
        <KalenderHinweis wert={datum} verschieben={setDatum} />
        {e.typ === 'vok' && (
          <Text size="xs" c="dimmed">
            Hängt der Testtermin an diesem Abschnitt, rückt er mit.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button loading={laeuft} disabled={!ab || ab <= Date.now()} onClick={() => ab && void los(ab)} data-verschieben-los>
            Verschieben
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
