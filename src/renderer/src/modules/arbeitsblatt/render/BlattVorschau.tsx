import { Card, Stack, Text, Title } from '@mantine/core'
import { useMemo } from 'react'
import FitToWidth from '../../../shared/render/FitToWidth'
import type { Zwischenstand } from '../../../shared/zwischenstand'
import { useAppSettings } from '../../../shared/settingsStore'
import { BLOCK_LABELS } from '../model/factory'
import type { OriginalMaterialAblage, Outline, Worksheet, WsBlock } from '../model/types'
import { contextFor, pageInfoFor, SheetPages, useSheetLayouts } from './SheetPages'
import type { PlacedItem } from './paginate'

/**
 * Live-Vorschau eines entstehenden Blattes (02.10.2026, shared/zwischenstand.ts).
 *
 * Gemeinsam für Arbeitsblatt, Klassenarbeit, Lernzielkontrolle und Grammatiktest – alle setzen
 * ihr Material über `SheetPages`. NUR ZUM ANSEHEN (abgestimmt): kein Bausteinrahmen, kein
 * Bearbeiten; geändert wird erst, wenn der Auftrag abgelegt hat.
 *
 * Neue und geänderte Bausteine des letzten Standes tragen `ws-live-neu` (kurzes Aufleuchten,
 * ws.css). Der Schlüssel enthält die Nummer des Standes – so leuchtet ein Baustein bei jeder
 * weiteren Änderung erneut auf. Die Ansicht rollt nicht von selbst mit.
 */
export function BlattVorschau({ ws, markiert, nr }: { ws: Worksheet; markiert: string[]; nr: number }): React.JSX.Element {
  const logo = useAppSettings((s) => s.logoDataUrl)
  const settings = useAppSettings((s) => s.settings)
  const { layouts, measure } = useSheetLayouts(ws, logo, settings.schoolName)
  const neu = useMemo(() => new Set(markiert), [markiert])
  const wrapBlock = (block: WsBlock, _placed: PlacedItem, content: React.ReactNode): React.ReactNode => (
    <div key={neu.has(block.id) ? `neu-${nr}` : 'alt'} className={neu.has(block.id) ? 'ws-live-neu' : undefined} data-live-baustein={block.id}>
      {content}
    </div>
  )
  return (
    <div data-live-vorschau>
      {ws.sheets.map((sheet) => (
        <div key={sheet.id}>
          {ws.sheets.length > 1 && (
            <Text size="sm" fw={600} c="dimmed" mb={4} mt="sm">
              {sheet.label}
            </Text>
          )}
          <FitToWidth className="ws-editor-pages ws-live-pages">
            <SheetPages
              ws={ws}
              sheet={sheet}
              plans={layouts.get(`${sheet.id}:print`) ?? []}
              info={pageInfoFor(ws, sheet, logo, settings.schoolName, false, settings.citationStyle)}
              context={contextFor(ws, sheet, 'print')}
              wrapBlock={wrapBlock}
            />
          </FitToWidth>
        </div>
      ))}
      {measure}
    </div>
  )
}

/**
 * Zwischenstand eines Programms als Blatt. `alsBlatt` setzt den Stand um (Arbeit → Blatt …);
 * gemerkt je Stand – ein bei jedem Zeichnen neu gebautes Blatt ließe die Seitenaufteilung endlos
 * neu messen. Wirft die Umsetzung (unfertiger Stand), bleibt die Vorschau einfach leer.
 */
export function ZwischenstandsBlatt<T>({ z, alsBlatt }: { z: Zwischenstand; alsBlatt: (stand: T) => Worksheet | null }): React.JSX.Element | null {
  const ws = useMemo(() => {
    try {
      return alsBlatt(z.stand as T)
    } catch {
      return null
    }
    // alsBlatt ist je Programm fest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z.stand])
  if (!ws || !ws.sheets.some((s) => s.blocks.length)) return null
  return <BlattVorschau ws={ws} markiert={z.markiert} nr={z.nr} />
}

/** Gliederung planen: der gefundene Ausgangstext, solange die Gliederung entsteht (Live-Vorschau) */
export function MaterialVorschau({ material }: { material: OriginalMaterialAblage }): React.JSX.Element {
  return (
    <Card withBorder maw={820} mx="auto" padding="lg" className="ws-live-neu" data-live-material>
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Gefundenes Material – die Gliederung wird gerade daraus geplant
        </Text>
        <Title order={4}>{material.titel}</Title>
        {material.text
          .split(/\n\s*\n/)
          .filter((a) => a.trim())
          .map((absatz, i) => (
            <Text key={i} size="sm">
              {absatz}
            </Text>
          ))}
        <Text size="xs" c="dimmed">
          {material.quellenangabe}
        </Text>
      </Stack>
    </Card>
  )
}

/**
 * Ausformulieren, bevor die erste Antwort da ist (02.10.2026): das Gerüst aus der Gliederung.
 * Die erste Anfrage schreibt das ganze Blatt und dauert mit echter KI oft über eine Minute –
 * bis dahin sah die Lehrkraft nur die Statuskarte und hielt die Vorschau für kaputt.
 */
export function GeruestVorschau({ outline }: { outline: Outline }): React.JSX.Element {
  return (
    <Card withBorder maw={820} mx="auto" padding="lg" data-live-geruest>
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Geplanter Aufbau – die Bausteine werden gerade ausformuliert und erscheinen hier, sobald die KI sie liefert
        </Text>
        <Title order={4}>{outline.title}</Title>
        {outline.items.map((item, i) => (
          <Card key={item.id || i} withBorder padding="xs" style={{ borderStyle: 'dashed' }} className="ws-live-geruest-punkt">
            <Text size="sm">
              <Text span fw={600}>
                {BLOCK_LABELS[item.type] ?? item.type}
              </Text>
              {item.purpose ? ` – ${item.purpose}` : ''}
            </Text>
          </Card>
        ))}
      </Stack>
    </Card>
  )
}
