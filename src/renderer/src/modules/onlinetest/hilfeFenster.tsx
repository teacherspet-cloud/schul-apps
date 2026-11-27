/**
 * Hilfekarten digital (06.10.2026, Wunsch der Lehrkraft): nicht mehr am Ende des Materials, sondern über ein
 * Hilfesymbol rechts neben der Aufgabe. Die Karten öffnen sich schrittweise: zuerst nur die erste, mit „Nächste Hilfe"
 * die zweite usw. Jede neu geöffnete Karte wird gemeldet (`gezeigt`), damit die Lehrkraft in der Auswertung sieht, wie
 * viele Hilfen genutzt wurden.
 *
 * Seit 27.11.2026 immer als verschiebbares Fenster in der Seite (Schwebefenster): Das frühere eigene Browserfenster
 * öffnete auf dem iPad einen neuen Tab und beendete dabei das Vollbild (Befund der Lehrkraft).
 */
import { sicheresHtml } from '../../shared/sicheresHtml'
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { IconBulb, IconChevronRight } from '@tabler/icons-react'
import { useState } from 'react'
import { Schwebefenster } from '../../shared/Schwebefenster'

export interface Hilfekarten {
  nr: number
  titel: string
  /** HTML je Karte (aus dem Blatt, ohne Skripte) */
  karten: string[]
}

/** Hilfekarten als verschiebbares Fenster; `offen`: wie viele Karten schon geöffnet waren (mindestens 1 wird gezeigt) */
export function HilfeFenster({
  h,
  offen,
  gezeigt,
  schliessen,
  start
}: {
  h: Hilfekarten
  offen: number
  gezeigt: (karten: number) => void
  schliessen: () => void
  start?: { x: number; y: number }
}): React.JSX.Element {
  const [zahl, setZahl] = useState(() => {
    const z = Math.max(1, Math.min(h.karten.length, offen))
    if (z > offen) queueMicrotask(() => gezeigt(z))
    return z
  })
  return (
    <Schwebefenster
      titel={`Hilfe zu Aufgabe ${h.nr}`}
      schliessen={schliessen}
      merken="hilfe"
      start={start}
      breite={360}
      farbe="var(--mantine-color-yellow-6)"
      kennung={{ 'data-hilfe-fenster': String(h.nr) }}
    >
      <Stack gap="sm">
        {h.titel && (
          <Text size="sm" c="dimmed">
            {h.titel}
          </Text>
        )}
        {h.karten.slice(0, zahl).map((k, i) => (
          <Paper key={i} withBorder p="sm" radius="md" style={{ borderColor: 'var(--mantine-color-yellow-5)', borderWidth: 2 }} data-karte={i + 1}>
            <Badge color="yellow" variant="light" mb={6} leftSection={<IconBulb size={12} />}>
              Hilfe {i + 1} von {h.karten.length}
            </Badge>
            {/* Feste Tag-Liste, keine fremden Bilder oder Links (22.10.2026, KI-Sicherheitsprüfung) */}
            <div dangerouslySetInnerHTML={{ __html: sicheresHtml(k) }} />
          </Paper>
        ))}
        <Group justify="flex-end">
          <Button
            color="yellow"
            size="xs"
            rightSection={<IconChevronRight size={16} />}
            disabled={zahl >= h.karten.length}
            onClick={() => {
              const n = zahl + 1
              setZahl(n)
              gezeigt(n)
            }}
            data-hilfe-weiter
          >
            {zahl < h.karten.length ? `Nächste Hilfe (${zahl + 1} von ${h.karten.length})` : 'Alle Hilfen geöffnet'}
          </Button>
        </Group>
      </Stack>
    </Schwebefenster>
  )
}

/** Hilfekarten je Aufgabe aus dem Blatt (Bausteine mit `data-hilfe-fuer`, render/baustein/blockview.tsx) */
export function hilfekartenAus(doc: Document): Map<number, Hilfekarten> {
  const aus = new Map<number, Hilfekarten>()
  for (const b of Array.from(doc.querySelectorAll<HTMLElement>('.ws-scaffold-hilfekarten[data-hilfe-fuer]'))) {
    const nr = Number(b.dataset.hilfeFuer)
    if (!nr) continue
    const titel = b.querySelector('.ws-scaffold-title')?.textContent?.trim() ?? ''
    const karten = Array.from(b.querySelectorAll<HTMLElement>('.ws-helpcard')).map((k) => {
      const kopie = k.cloneNode(true) as HTMLElement
      kopie.querySelector('.ws-helpcard-num')?.remove()
      return kopie.innerHTML.trim()
    })
    const da = aus.get(nr)
    if (da) da.karten.push(...karten)
    else aus.set(nr, { nr, titel, karten })
  }
  for (const [nr, h] of aus) if (!h.karten.length) aus.delete(nr)
  return aus
}
