/**
 * Kopf der Reihe eingeklappt (08.10.2026, Plan „Übersicht" B1): nach der Planung eine Zeile „Titel · Fach · Jg. 7 ·
 * Oberthema · 6 Lernziele · 8 Stunden ✎" statt 600–900 px Formular vor dem ersten Schritt. Klick klappt auf; der
 * Zustand ist je Reihe gemerkt (localStorage – fehlt er, ist eine Reihe mit Schritten eingeklappt, eine leere offen).
 * Der Hinweis der KI-Planung (`Reihe.planHinweis`) steht hinter dem Infosymbol.
 */
import { ActionIcon, Group, Paper, Popover, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconInfoCircle, IconPencil } from '@tabler/icons-react'
import type { Reihe } from '@shared/reihe'

const KOPF_SCHLUESSEL = 'schulapps.reihe.kopf.'
const ANSICHT_SCHLUESSEL = 'schulapps.reihe.ansicht'

/** Gemerkter Zustand des Kopfs dieser Reihe (null = nichts gemerkt) */
export function kopfGemerkt(id: string): boolean | null {
  if (!id) return null
  try {
    const w = localStorage.getItem(KOPF_SCHLUESSEL + id)
    return w === 'offen' ? true : w === 'zu' ? false : null
  } catch {
    return null
  }
}

export function merkeKopf(id: string, offen: boolean): void {
  if (!id) return
  try {
    localStorage.setItem(KOPF_SCHLUESSEL + id, offen ? 'offen' : 'zu')
  } catch {
    /* ohne Speicher eben nicht gemerkt */
  }
}

/** Gemerkte Ansicht des Expertenmodus („Stunden | Teile") */
export function ansichtGemerkt(): 'stunden' | 'teile' | null {
  try {
    const w = localStorage.getItem(ANSICHT_SCHLUESSEL)
    return w === 'stunden' || w === 'teile' ? w : null
  } catch {
    return null
  }
}

export function merkeAnsicht(a: 'stunden' | 'teile'): void {
  try {
    localStorage.setItem(ANSICHT_SCHLUESSEL, a)
  } catch {
    /* nicht gemerkt */
  }
}

const mehrzahl = (n: number, eins: string, viele: string): string => `${n} ${n === 1 ? eins : viele}`

/** Kurzfassung des Kopfs als Text (auch für Tests) */
export function kopfText(r: Pick<Reihe, 'titel' | 'fachLabel' | 'grade' | 'oberthema' | 'lernziele' | 'stunden'>): string[] {
  return [
    r.fachLabel,
    `Jg. ${r.grade}`,
    r.oberthema.trim(),
    mehrzahl(r.lernziele.length, 'Lernziel', 'Lernziele'),
    r.stunden?.length ? mehrzahl(r.stunden.length, 'Stunde', 'Stunden') : ''
  ].filter(Boolean)
}

export function KopfZeile({
  reihe,
  aufklappen,
  plakette
}: {
  reihe: Reihe
  aufklappen: () => void
  /** Plakette der Reihenart (08.10.2026, ReiheArt.tsx) – Klick wechselt die Art */
  plakette?: React.ReactNode
}): React.JSX.Element {
  return (
    <Paper withBorder radius="md" px="sm" py={6} data-reihe-kopf-zeile>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        {plakette}
        <Tooltip label="Aufklappen: Titel, Oberthema, Lernziele, Stunden bearbeiten" openDelay={400}>
          <UnstyledButton onClick={aufklappen} style={{ minWidth: 0, flex: 1 }} aria-label="Kopf der Reihe aufklappen" data-reihe-kopf-auf>
            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text fw={700} truncate style={{ flexShrink: 0, maxWidth: '40%' }}>
                {reihe.titel || '(ohne Titel)'}
              </Text>
              <Text size="sm" c="dimmed" truncate>
                {kopfText(reihe).join(' · ')}
              </Text>
              <IconPencil size={15} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
            </Group>
          </UnstyledButton>
        </Tooltip>
        {reihe.planHinweis?.trim() && <PlanHinweis text={reihe.planHinweis} />}
      </Group>
    </Paper>
  )
}

/** Infosymbol mit dem Hinweis der KI-Planung */
export function PlanHinweis({ text }: { text: string }): React.JSX.Element {
  return (
    <Popover position="bottom-end" withinPortal shadow="md" width={380}>
      <Popover.Target>
        <Tooltip label="Hinweis der KI-Planung">
          <ActionIcon variant="subtle" color="grape" aria-label="Hinweis der KI-Planung" data-plan-hinweis>
            <IconInfoCircle size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" fw={600} mb={4}>
          Hinweis der KI-Planung
        </Text>
        <Text size="sm" data-plan-hinweis-text>
          {text}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}
