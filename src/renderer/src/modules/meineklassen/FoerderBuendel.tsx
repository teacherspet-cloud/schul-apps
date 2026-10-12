/**
 * Bündel „Für dich" in „Meine Klassen" (12.10.2026, Förder- und Fordermaterial): Die App bereitet je Kind Vokabeln,
 * Grammatik und Hinweise aus dem Feedback als VORSCHLAG vor; die Lehrkraft gibt jedes Bündel einzeln frei (kein
 * Sammelklick) oder verwirft es. Lernende sehen es erst danach, in ihrem Fachordner unter „Für dich" – befristet
 * (shared/fuerDich.ts). Je Bündel lässt sich der Förderplan-Baustein kopieren.
 */
import { Badge, Button, Card, Collapse, Group, Stack, Text } from '@mantine/core'
import { IconCheck, IconChevronDown, IconChevronRight, IconCopy, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { foerderplanText, type BuendelInhalt } from '@shared/fuerDich'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'

interface Eintrag {
  id: string
  schueler: string
  name: string
  status: 'vorschlag' | 'frei'
  erstellt: number
  ablauf: number
  inhalt: BuendelInhalt | null
}

const tag = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

export function FoerderBuendel({ gruppeId, klasse, fach }: { gruppeId: string; klasse: string; fach: string }): React.JSX.Element | null {
  const [liste, setListe] = useState<Eintrag[]>([])
  const [offen, setOffen] = useState(false)
  const [auf, setAuf] = useState<string | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ buendel: Eintrag[] }>(`/server/foerdern/buendel?gruppe=${encodeURIComponent(gruppeId)}`).then(
        (d) => setListe(d.buendel),
        () => setListe([])
      ),
    [gruppeId]
  )
  useEffect(laden, [laden])
  // Nach dem Erstellen im Dialog (FoerderDialog) neu laden
  useEffect(() => {
    window.addEventListener('meineklassen-fertig', laden)
    window.addEventListener('foerder-buendel', laden)
    return () => {
      window.removeEventListener('meineklassen-fertig', laden)
      window.removeEventListener('foerder-buendel', laden)
    }
  }, [laden])
  if (!liste.length) return null
  const vorschlaege = liste.filter((b) => b.status === 'vorschlag').length
  const aktion = async (id: string, was: 'freigeben' | 'verwerfen'): Promise<void> => {
    try {
      await senden(`/server/foerdern/buendel/${was}`, { id })
      notifySuccess(was === 'freigeben' ? 'Freigegeben – das Kind findet das Bündel im Fachordner unter „Für dich“.' : 'Bündel verworfen.')
      laden()
    } catch (e) {
      notifyError(e)
    }
  }
  const baustein = (b: Eintrag): string =>
    foerderplanText({
      name: b.name,
      klasse,
      fach,
      datum: new Date(b.erstellt),
      kind: {
        id: b.schueler,
        name: b.name,
        benutzer: '',
        wackelig: b.inhalt?.woerter ?? [],
        grammatik: (b.inhalt?.grammatik ?? []).map((g) => ({ titel: g.titel, ampel: 'schwaeche' as const, quote: 0 })),
        blaetter: b.inhalt?.hinweise.length ? { gruen: 0, gelb: 0, rot: 0, schwierig: [], schritte: b.inhalt.hinweise } : null
      },
      art: 'foerder',
      ziel: b.inhalt?.ziel ?? '',
      massnahmen: ['Übungsbündel „Für dich" (Vokabeln, Grammatik, Hinweise aus dem Feedback)']
    })
  return (
    <Card withBorder radius="md" padding="sm" mb="sm" data-foerder-buendel-liste>
      <Group justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setOffen((o) => !o)}>
        <Group gap={6}>
          {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <Text fw={700} size="sm">
            Bündel „Für dich"
          </Text>
          {vorschlaege > 0 && (
            <Badge color="orange" variant="light" data-buendel-vorschlaege={vorschlaege}>
              {vorschlaege} {vorschlaege === 1 ? 'Vorschlag' : 'Vorschläge'} zu prüfen
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          je Kind einzeln freigeben
        </Text>
      </Group>
      <Collapse expanded={offen}>
        <Stack gap={6} mt="xs">
          {liste.map((b) => (
            <Card key={b.id} withBorder padding={8} radius="sm" data-buendel={b.status}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap={6} style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => setAuf((x) => (x === b.id ? null : b.id))}>
                  {auf === b.id ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  <Text size="sm" fw={600}>
                    {b.name}
                  </Text>
                  <Badge size="xs" color={b.status === 'frei' ? 'teal' : 'orange'} variant="light">
                    {b.status === 'frei' ? `freigegeben bis ${tag(b.ablauf)}` : 'Vorschlag'}
                  </Badge>
                  <Text size="xs" c="dimmed" truncate>
                    {b.inhalt ? `${b.inhalt.woerter.length} Wörter · ${b.inhalt.grammatik.length} Grammatik · ${b.inhalt.hinweise.length} Hinweise` : ''}
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconCopy size={12} />}
                    onClick={() => void navigator.clipboard?.writeText(baustein(b)).then(() => notifySuccess('Förderplan-Baustein kopiert.'))}
                    data-buendel-foerderplan
                  >
                    Förderplan
                  </Button>
                  {b.status === 'vorschlag' && (
                    <Button size="compact-xs" leftSection={<IconCheck size={12} />} onClick={() => void aktion(b.id, 'freigeben')} data-buendel-freigeben>
                      Freigeben
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={12} />}
                    onClick={() => void aktion(b.id, 'verwerfen')}
                    data-buendel-verwerfen
                  >
                    {b.status === 'frei' ? 'Zurücknehmen' : 'Verwerfen'}
                  </Button>
                </Group>
              </Group>
              <Collapse expanded={auf === b.id}>
                {b.inhalt && (
                  <Stack gap={2} mt={6} pl="lg">
                    <Text size="xs">
                      <b>Dein Ziel:</b> {b.inhalt.ziel}
                    </Text>
                    {b.inhalt.woerter.length > 0 && (
                      <Text size="xs">
                        <b>Wörter:</b> {b.inhalt.woerter.map((w) => `${w.term} – ${w.translation}`).join(' · ')}
                      </Text>
                    )}
                    {b.inhalt.grammatik.length > 0 && (
                      <Text size="xs">
                        <b>Grammatik:</b> {b.inhalt.grammatik.map((g) => g.titel).join(' · ')}
                      </Text>
                    )}
                    {b.inhalt.hinweise.length > 0 && (
                      <Text size="xs">
                        <b>Hinweise:</b> {b.inhalt.hinweise.join(' · ')}
                      </Text>
                    )}
                  </Stack>
                )}
              </Collapse>
            </Card>
          ))}
        </Stack>
      </Collapse>
    </Card>
  )
}
