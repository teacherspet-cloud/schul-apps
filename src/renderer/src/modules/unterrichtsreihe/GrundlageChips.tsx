/**
 * Zeile „Grundlage:" (08.10.2026, Plan „Was benutzt die KI?" C2/C3): Chips mit dem, was die KI für diesen Schritt
 * bekommt – vor dem Erstellen und am fertigen Schritt. Antippen zeigt den Auszug; vor dem Erstellen lässt sich ein Chip
 * abwählen (`Schritt.grundlageAus`). Muster: Grundlagezeile im Test-Fenster (TestHierKnopf.tsx), Chips wie
 * VorwissenChips.tsx. Im Expertenmodus zusätzlich „Eingabe ansehen": genau der Text, der an die KI geht.
 */
import { Button, Code, Group, Modal, Popover, ScrollArea, Stack, Switch, Text } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'
import { useState } from 'react'
import { blattZweckFuer, type Reihe, type Schritt } from '@shared/reihe'
import { useAlleOptionen } from '../../shared/components/NurExperte'
import { grundlageChips, grundlageUmschalten, kcAuszugFuer, type GrundlageChip } from './grundlage'
import type { KcAuszug } from './Lernziele'
import { blattMeta } from './platzhalterAuftrag'
import { schrittAnfrage } from './reihePlanungKi'

export function GrundlageZeile({
  reihe,
  schritt,
  setze,
  kc = kcAuszugFuer(reihe)
}: {
  reihe: Reihe
  schritt: Schritt
  /** Vor dem Erstellen: Chips abwählbar (ohne = nur ansehen) */
  setze?: (patch: Partial<Schritt>) => void
  kc?: KcAuszug | null
}): React.JSX.Element {
  const chips = grundlageChips(reihe, schritt, kc)
  const voll = useAlleOptionen()
  const [vorschau, setVorschau] = useState(false)
  const eingabe = voll ? eingabeText(reihe, schritt) : null
  return (
    <Group gap={4} wrap="wrap" data-grundlage onClick={(e) => e.stopPropagation()}>
      <Text size="xs" c="dimmed" fw={500}>
        Grundlage:
      </Text>
      {chips.map((c) => (
        <GrundlageChipKnopf key={c.id} c={c} umschalten={setze && c.abwaehlbar ? () => setze({ grundlageAus: grundlageUmschalten(schritt, c.id) }) : undefined} />
      ))}
      {eingabe && (
        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconEye size={12} />} onClick={() => setVorschau(true)} data-grundlage-vorschau>
          Eingabe ansehen
        </Button>
      )}
      {vorschau && eingabe && (
        <Modal opened onClose={() => setVorschau(false)} title={`Eingabe an die KI – ${schritt.titel || 'Schritt'}`} size="xl">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              So geht der Schritt mit dem jetzigen Stand an die KI. Abgewählte Chips fehlen; Änderungen an der Reihe wirken sofort.
            </Text>
            <ScrollArea.Autosize mah="65vh">
              <Code block style={{ whiteSpace: 'pre-wrap' }} data-grundlage-eingabe>
                {eingabe}
              </Code>
            </ScrollArea.Autosize>
          </Stack>
        </Modal>
      )}
    </Group>
  )
}

function GrundlageChipKnopf({ c, umschalten }: { c: GrundlageChip; umschalten?: () => void }): React.JSX.Element {
  return (
    <Popover position="bottom-start" withinPortal shadow="md" width={380}>
      <Popover.Target>
        <Button
          size="compact-xs"
          radius="xl"
          variant={c.aus ? 'default' : 'light'}
          color={c.aus ? 'gray' : 'teal'}
          styles={{ label: { textDecoration: c.aus ? 'line-through' : undefined } }}
          aria-label={`${c.label}${c.aus ? ' (abgewählt)' : ''} – Auszug ansehen`}
          data-grundlage-chip={c.id}
          data-aus={c.aus || undefined}
        >
          {c.label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            {c.titel}
          </Text>
          <ScrollArea.Autosize mah={260}>
            <Stack gap={2}>
              {c.zeilen.map((z, i) => (
                <Text key={i} size="xs">
                  {z}
                </Text>
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {umschalten && (
            <Switch size="xs" label="An die KI geben" checked={!c.aus} onChange={umschalten} data-grundlage-schalter={c.id} />
          )}
          {!umschalten && c.aus && (
            <Text size="xs" c="dimmed">
              Beim Erstellen abgewählt.
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Der Text, der an die KI geht – Arbeitsblatt: die Vorgaben des Blatts; andere Arten: die ganze Anfrage */
function eingabeText(r: Reihe, s: Schritt): string | null {
  // Auch Schritte, die in einer digitalen Reihe als Arbeitsblatt entstehen (08.10.2026, Plan G.2)
  if (s.inhalt.art === 'arbeitsblatt' || blattZweckFuer(r, s)) {
    const m = blattMeta(r, s)
    const d = m.differentiation
    return [
      `Arbeitsblatt: ${m.title}`,
      `Thema: ${m.topic}`,
      `Lerngruppe: Klasse ${m.grade}, ${m.subjectLabel}, ${m.schoolTypeName || m.schoolTypeId} (${m.stateId})`,
      `Bearbeitungszeit: ${m.minutes} min · Seiten: ${m.pages}`,
      `Differenzierung: ${d.levels > 1 ? `${d.levels} Niveaustufen` : d.schwierigkeit ? `Anspruch ${d.schwierigkeit.anspruch}` : 'ein Niveau, jahrgangsgemäß'}`,
      '',
      'Lernziele und Vorgaben (Richtung der Lehrkraft):',
      m.learningGoals || '—',
      '',
      m.priorKnowledge ? `Vorwissen: ${m.priorKnowledge}` : '',
      s.platzhalter?.buch ? `\nSchulbuch (als Textquelle):\n${s.platzhalter.buch}` : ''
    ]
      .filter((z, i, a) => z !== '' || a[i - 1] !== '')
      .join('\n')
  }
  const a = schrittAnfrage(r, s)
  return a ? `${a.system}\n\n${a.user}` : null
}
