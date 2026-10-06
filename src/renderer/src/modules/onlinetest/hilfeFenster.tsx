/**
 * Hilfekarten digital (06.10.2026, Wunsch der Lehrkraft): nicht mehr am Ende des Materials, sondern über ein
 * Hilfesymbol rechts neben der Aufgabe – in einem kleinen, von der App/dem Browser unabhängigen Fenster. Die Karten
 * öffnen sich schrittweise: zuerst nur die erste, mit „Nächste Hilfe" die zweite usw. Jede neu geöffnete Karte wird
 * gemeldet (`gezeigt`), damit die Lehrkraft in der Auswertung sieht, wie viele Hilfen genutzt wurden.
 *
 * Wo kein eigenes Fenster möglich ist (iPad-App, Pop-up-Sperre), erscheint dieselbe Ansicht als Pop-up in der Seite.
 */
import { Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core'
import { IconBulb, IconChevronRight } from '@tabler/icons-react'
import { useState } from 'react'
import { aufIos } from '../../shared/plattform'

export interface Hilfekarten {
  nr: number
  titel: string
  /** HTML je Karte (aus dem Blatt, ohne Skripte) */
  karten: string[]
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const STIL = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:#fffdf5;color:#1d2a33;padding:16px}
@media (prefers-color-scheme:dark){body{background:#1b1f24;color:#e6edf1}.karte{background:#262c33!important;border-color:#5c4a12!important}}
h1{font-size:1.05rem;margin:0 0 4px}
.unter{font-size:.85rem;opacity:.75;margin:0 0 12px}
.karte{background:#fff;border:2px solid #f2c94c;border-radius:12px;padding:12px 14px;margin:0 0 10px}
.karte b.kopf{display:block;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:#b8860b;margin-bottom:4px}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:10px 14px;background:#f2c94c;color:#3a2c00;cursor:pointer;width:100%}
button[disabled]{opacity:.45;cursor:default}
`

/**
 * Eigenes kleines Fenster; Rückgabe false, wenn keins möglich ist (dann Pop-up in der Seite).
 * `offen`: wie viele Karten schon geöffnet waren (mindestens 1 wird gezeigt).
 */
export function oeffneHilfeFenster(h: Hilfekarten, offen: number, gezeigt: (karten: number) => void): boolean {
  if (aufIos() || typeof window.open !== 'function') return false
  const w = window.open('', `schulapps-hilfe-${h.nr}`, 'popup,width=440,height=560,resizable=yes,scrollbars=yes')
  if (!w || w.closed) return false
  try {
    const d = w.document
    d.open()
    d.write(
      `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hilfe zu Aufgabe ${h.nr}</title><style>${STIL}</style></head><body><h1>Hilfe zu Aufgabe ${h.nr}</h1><p class="unter">${esc(h.titel)}</p><div id="karten"></div><button id="weiter" type="button"></button></body></html>`
    )
    d.close()
    let zahl = Math.max(1, Math.min(h.karten.length, offen))
    const zeichne = (): void => {
      const ziel = d.getElementById('karten')
      if (!ziel) return
      // Karten aus dem eigenen Blatt; Skripte und Ereignis-Attribute werden vorsichtshalber entfernt
      ziel.innerHTML = h.karten
        .slice(0, zahl)
        .map(
          (k, i) =>
            `<div class="karte" data-karte="${i + 1}"><b class="kopf">Hilfe ${i + 1} von ${h.karten.length}</b>${k.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '')}</div>`
        )
        .join('')
      const knopf = d.getElementById('weiter') as HTMLButtonElement | null
      if (knopf) {
        knopf.textContent = zahl < h.karten.length ? `Nächste Hilfe (${zahl + 1} von ${h.karten.length})` : 'Alle Hilfen geöffnet'
        knopf.disabled = zahl >= h.karten.length
      }
      ziel.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    d.getElementById('weiter')?.addEventListener('click', () => {
      if (zahl >= h.karten.length) return
      zahl++
      zeichne()
      gezeigt(zahl)
    })
    zeichne()
    if (zahl > offen) gezeigt(zahl)
    w.focus()
    return true
  } catch {
    w.close()
    return false
  }
}

/** Dieselbe Ansicht als Pop-up in der Seite (Rückfall) */
export function HilfeModal({
  h,
  offen,
  gezeigt,
  schliessen
}: {
  h: Hilfekarten
  offen: number
  gezeigt: (karten: number) => void
  schliessen: () => void
}): React.JSX.Element {
  const [zahl, setZahl] = useState(() => {
    const z = Math.max(1, Math.min(h.karten.length, offen))
    if (z > offen) queueMicrotask(() => gezeigt(z))
    return z
  })
  return (
    <Modal opened onClose={schliessen} title={`Hilfe zu Aufgabe ${h.nr}`} size="md" data-hilfe-modal>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {h.titel}
        </Text>
        {h.karten.slice(0, zahl).map((k, i) => (
          <Paper key={i} withBorder p="sm" radius="md" style={{ borderColor: 'var(--mantine-color-yellow-5)', borderWidth: 2 }} data-karte={i + 1}>
            <Badge color="yellow" variant="light" mb={6} leftSection={<IconBulb size={12} />}>
              Hilfe {i + 1} von {h.karten.length}
            </Badge>
            <div dangerouslySetInnerHTML={{ __html: k.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '') }} />
          </Paper>
        ))}
        <Group justify="flex-end">
          <Button
            color="yellow"
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
    </Modal>
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
