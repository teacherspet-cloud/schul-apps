import { Button, Card, Checkbox, Container, Group, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'
import Formularfuss from '../../../shared/components/Formularfuss'
import KalenderHinweis from '../../../shared/components/KalenderHinweis'
import { briefSchreiben } from '../auftrag'
import { ANLAESSE, TOENE, type Elternbrief } from '../model'
import { useElternbrief } from '../store'

/**
 * Schritt 1 des Elternbriefs (Großprogramm 0.4, F7): Anlass, Ton, Stichpunkte, Rücklauf.
 * Keine Namen von Kindern – der Brief nennt Platzhalter, die beim Verteilen ausgefüllt werden.
 */
export default function Inhalt(): React.JSX.Element | null {
  const { dok: b, update, docId } = useElternbrief()
  if (!b) return null
  const m = b.meta
  const setze = (fn: (d: Elternbrief) => void, gruppe?: string): void => update(fn, gruppe)
  const grund = !m.stichpunkte.trim() ? 'Stichpunkte fehlen' : ''
  // Kein Hindernis, aber ein Hinweis: Ohne Frist setzt die KI sonst einen Platzhalter
  const ohneFrist = m.ruecklauf && !m.rueckgabeBis
  return (
    <Stack h="100%" gap={0}>
      <ScrollArea style={{ flex: 1 }}>
        <Container size="lg" py="lg">
          <Title order={2}>Elternbrief</Title>
          <Text c="dimmed" mb="md">
            Aus Anlass und Stichpunkten entsteht ein verständlicher Brief – auf Wunsch mit Rücklaufzettel und übersetzt in die Familiensprachen. Keine Namen von
            Kindern eintragen: Der Brief setzt Platzhalter wie [Name des Kindes].
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder>
              <Stack gap="sm">
                <Select label="Anlass" data={ANLAESSE} value={m.anlass} onChange={(v) => v && setze((d) => (d.meta.anlass = v))} allowDeselect={false} />
                <Select label="Ton" data={TOENE} value={m.ton} onChange={(v) => v && setze((d) => (d.meta.ton = v))} allowDeselect={false} />
                <Textarea
                  label="Stichpunkte"
                  description="Was? Wann? Wo? Was ist zu tun oder mitzubringen? Bis wann? Kosten?"
                  placeholder={
                    'z. B.\nWandertag am 12.10., Treffpunkt 8:00 Schulhof\nZiel: Wildpark\nKosten 5 €, bis 5.10. mitgeben\nfestes Schuhwerk, Proviant'
                  }
                  autosize
                  minRows={6}
                  value={m.stichpunkte}
                  onChange={(e) => {
                    const x = e.currentTarget.value
                    setze((d) => (d.meta.stichpunkte = x), 'eb-stichpunkte')
                  }}
                  data-eb-stichpunkte
                />
                <Group grow align="flex-start">
                  <TextInput
                    label="Termin (Datum)"
                    description="Tag des Anlasses – steht so im Brief"
                    type="date"
                    value={m.termin?.datum ?? ''}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((d) => (d.meta.termin = { ...d.meta.termin, datum: x }), 'eb-termin')
                    }}
                    data-eb-termin
                  />
                  <TextInput
                    label="Uhrzeit"
                    description="Beginn bzw. Treffpunkt"
                    type="time"
                    value={m.termin?.uhrzeit ?? ''}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((d) => (d.meta.termin = { ...d.meta.termin, uhrzeit: x }), 'eb-uhrzeit')
                    }}
                    data-eb-uhrzeit
                  />
                </Group>
                {/* Schulkalender (10.10.2026): Warnung, wenn der Termin in den Ferien oder auf einem Feiertag liegt – hindert nichts */}
                <KalenderHinweis wert={m.termin?.datum} />
                <Switch
                  label="Mit Rücklaufzettel zum Abschneiden"
                  checked={m.ruecklauf}
                  onChange={(e) => {
                    const x = e.currentTarget.checked
                    setze((d) => (d.meta.ruecklauf = x))
                  }}
                />
                {/* IServ-Rückmeldung (23.10.2026, Wunsch der Lehrkraft): unabhängig vom Zettel; der Brief nennt, was in IServ zu tun ist */}
                <Switch
                  label="IServ-Rückmeldung"
                  description="Der Brief geht über die Elternbriefe in IServ; der Text sagt den Eltern, was sie dort anklicken."
                  checked={Boolean(m.iserv)}
                  onChange={(e) => {
                    const x = e.currentTarget.checked
                    setze((d) => {
                      if (x) d.meta.iserv = d.meta.iserv ?? { art: 'zustimmung' }
                      else delete d.meta.iserv
                    })
                  }}
                  data-eb-iserv
                />
                {m.iserv && (
                  <Stack gap={6} pl="xl">
                    <SegmentedControl
                      size="xs"
                      value={m.iserv.art}
                      data={[
                        { value: 'gelesen', label: 'Als gelesen markieren' },
                        { value: 'zustimmung', label: 'Zustimmen / Ablehnen' }
                      ]}
                      onChange={(v) => setze((d) => d.meta.iserv && (d.meta.iserv.art = v as 'gelesen' | 'zustimmung'))}
                      data-eb-iserv-art
                    />
                    <Checkbox
                      size="xs"
                      label="Freitextantwort"
                      checked={Boolean(m.iserv.freitext)}
                      onChange={(e) => {
                        const x = e.currentTarget.checked
                        setze((d) => d.meta.iserv && (d.meta.iserv.freitext = x))
                      }}
                      data-eb-iserv-freitext
                    />
                  </Stack>
                )}
                {(m.ruecklauf || m.iserv) && (
                  <TextInput
                    label={m.ruecklauf ? 'Rückgabe des Rücklaufzettels bis' : 'Rückmeldung über IServ bis'}
                    type="date"
                    value={m.rueckgabeBis ?? ''}
                    error={ohneFrist ? 'Ohne Frist steht im Brief nur ein Platzhalter.' : undefined}
                    onChange={(e) => {
                      const x = e.currentTarget.value
                      setze((d) => (d.meta.rueckgabeBis = x), 'eb-frist')
                    }}
                    data-eb-frist
                  />
                )}
                {(m.ruecklauf || m.iserv) && <KalenderHinweis wert={m.rueckgabeBis} />}
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap="sm">
                <TextInput
                  label="Klasse"
                  placeholder="z. B. 7b"
                  value={m.klasse}
                  onChange={(e) => {
                    const x = e.currentTarget.value
                    setze((d) => (d.meta.klasse = x), 'eb-klasse')
                  }}
                />
                <TextInput
                  label="Unterschrift"
                  // 12.10.2026: Amtsbezeichnungen („StR'") fallen unter dem Gruß weg, das Bild der Unterschrift steht darüber
                  description="Vorgabe aus Einstellungen › Schule. Amtsbezeichnungen (z. B. StR') stehen nur im Briefkopf, nicht unter dem Gruß; eine hinterlegte Unterschrift erscheint über dem Namen."
                  placeholder="Name der Lehrkraft"
                  value={m.absender}
                  onChange={(e) => {
                    const x = e.currentTarget.value
                    setze((d) => (d.meta.absender = x), 'eb-absender')
                  }}
                />
                <TextInput
                  label="Datum des Briefes"
                  type="date"
                  value={m.datum}
                  onChange={(e) => {
                    const x = e.currentTarget.value
                    setze((d) => (d.meta.datum = x), 'eb-datum')
                  }}
                />
                <TextInput
                  label="Titel in der Bibliothek (optional)"
                  value={m.title}
                  onChange={(e) => {
                    const x = e.currentTarget.value
                    setze((d) => (d.meta.title = x), 'eb-titel')
                  }}
                />
                <Text size="xs" c="dimmed">
                  Schulname und Logo stehen im Briefkopf – aus den Einstellungen (Schule).
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>
        </Container>
      </ScrollArea>
      <Formularfuss grund={grund}>
        <Group gap="xs">
          <Button leftSection={<IconMail size={16} />} disabled={Boolean(grund)} onClick={() => briefSchreiben(b, docId)} data-eb-schreiben>
            {b.text ? 'Brief neu schreiben' : 'Brief schreiben'}
          </Button>
        </Group>
      </Formularfuss>
    </Stack>
  )
}
