import { Alert, Button, Checkbox, Group, Modal, ScrollArea, Stack, Text, Textarea, Title } from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { ausgleichHinweise } from '../laenderRegeln'
import { GRUPPEN, hatAusgleich, massnahme, MASSNAHMEN, ohneDiagnosen } from '../nachteilsausgleich'
import type { Abgabe, Nachteilsausgleich, RueckmeldungMeta } from '../model/types'

/**
 * Nachteilsausgleich je Abgabe (29.09.2026): Vorschläge aus der Länderrecherche, gegliedert in
 * Notenschutz, Bedingungen, DaZ, Gestaltung des Bogens und zieldifferente Förderung, dazu eine
 * eigene Angabe. Diagnosewörter in der eigenen Angabe werden angezeigt und vor der Anfrage
 * ersetzt. Auf Wunsch merkt sich die App den Ausgleich unter dem Namen – nur auf diesem Rechner.
 */
export default function AusgleichFenster({
  abgabe,
  meta,
  offen,
  schliessen,
  speichern
}: {
  abgabe: Abgabe | null
  meta: RueckmeldungMeta
  offen: boolean
  schliessen: () => void
  speichern: (a: Nachteilsausgleich | undefined, merken: boolean) => void
}): React.JSX.Element {
  const [massnahmen, setMassnahmen] = useState<string[]>([])
  const [eigene, setEigene] = useState('')
  const [merken, setMerken] = useState(true)
  useEffect(() => {
    if (!offen) return
    setMassnahmen(abgabe?.ausgleich?.massnahmen ?? [])
    setEigene(abgabe?.ausgleich?.eigene ?? '')
    setMerken(Boolean(abgabe?.name.trim()))
  }, [offen, abgabe])

  const umschalten = (id: string): void => setMassnahmen((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const entfernt = ohneDiagnosen(eigene).entfernt
  const notenschutz = massnahmen.some((id) => massnahme(id)?.gruppe === 'notenschutz')
  const hinweise = ausgleichHinweise(meta, notenschutz)
  const neu: Nachteilsausgleich = { massnahmen, ...(eigene.trim() ? { eigene: eigene.trim() } : {}) }
  const name = abgabe?.name.trim()

  return (
    <Modal
      opened={offen}
      onClose={schliessen}
      size="xl"
      title={<Title order={4}>Nachteilsausgleich für {name || abgabe?.kuerzel}</Title>}
      scrollAreaComponent={ScrollArea.Autosize}
      data-rm-ausgleich
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Über Nachteilsausgleich und Notenschutz entscheidet die Schule (meist die Klassenkonferenz). Die Rückmeldung setzt nur um, was hier gewählt ist. An die KI
          gehen allein die Maßnahmen – nie eine Diagnose; auf dem Bogen der Lernenden steht nichts davon.
        </Text>
        {hinweise.map((h, i) => (
          <Alert
            key={i}
            variant="light"
            color={h.warnung ? 'orange' : 'blue'}
            icon={h.warnung ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />}
            p="xs"
          >
            <Text size="xs">{h.text}</Text>
            {h.quelle && (
              <Text size="xs" c="dimmed" mt={2}>
                Fundstelle: {h.quelle}
              </Text>
            )}
          </Alert>
        ))}
        {GRUPPEN.map((g) => (
          <Stack key={g.id} gap={6}>
            <div>
              <Text fw={600} size="sm">
                {g.titel}
              </Text>
              <Text size="xs" c="dimmed">
                {g.hinweis}
              </Text>
            </div>
            {MASSNAHMEN.filter((m) => m.gruppe === g.id).map((m) => (
              <Checkbox
                key={m.id}
                checked={massnahmen.includes(m.id)}
                onChange={() => umschalten(m.id)}
                label={m.label}
                description={[m.typisch, m.vorbehalt].filter(Boolean).join(' · ') || undefined}
                data-massnahme={m.id}
              />
            ))}
          </Stack>
        ))}
        <Textarea
          label="Eigene Angabe (optional)"
          description="Weitere Maßnahmen, individuelle Lernziele bei zieldifferenter Förderung oder nicht erbringbare Aufgabenteile – ohne Diagnose."
          autosize
          minRows={2}
          value={eigene}
          onChange={(e) => setEigene(e.currentTarget.value)}
          data-rm-ausgleich-eigene
        />
        {entfernt.length > 0 && (
          <Alert color="orange" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
            <Text size="xs">
              Gesundheitsangaben gehen nicht an die KI – vor der Anfrage ersetzt: {[...new Set(entfernt)].join(', ')}. Besser die Maßnahme beschreiben als die Ursache.
            </Text>
          </Alert>
        )}
        <Checkbox
          checked={merken && Boolean(name)}
          disabled={!name}
          onChange={(e) => setMerken(e.currentTarget.checked)}
          label={name ? `Für „${name}" auf diesem Rechner merken und bei der nächsten Rückmeldung vorschlagen` : 'Merken ist erst mit eingetragenem Namen möglich'}
        />
        <Group justify="space-between">
          <Button variant="subtle" color="red" disabled={!hatAusgleich(abgabe?.ausgleich)} onClick={() => speichern(undefined, merken && Boolean(name))}>
            Nachteilsausgleich entfernen
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button onClick={() => speichern(hatAusgleich(neu) ? neu : undefined, merken && Boolean(name))} data-rm-ausgleich-ok>
              Übernehmen
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
