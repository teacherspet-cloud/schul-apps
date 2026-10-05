/**
 * Pop-up „Schulbuchseiten erkannt" (05.10.2026, schulbuch.ts): je Abschnitt verweisen, Text übernehmen
 * oder weglassen. Aufrufbar aus jedem Ablauf (`frageSchulbuch`), eingehängt einmal in App.tsx.
 */
import { extractContent, type ExtractedContent } from '../files/extractContent'
import { pruefeHochladen } from '../datenschutz'
import { Alert, Badge, Button, Group, Modal, ScrollArea, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconBook } from '@tabler/icons-react'
import { useState } from 'react'
import { create } from 'zustand'
import { erkenneSchulbuch, GESAMTVERTRAG_HINWEIS, schulbuchText, type AbschnittWahl, type Schulbuch } from './schulbuch'

interface Frage {
  sb: Schulbuch
  antwort: (sb: Schulbuch | null) => void
}
const useFrage = create<{ offen: Frage | null }>(() => ({ offen: null }))

/** Pop-up zeigen; Ergebnis mit den Wahlen je Abschnitt – null: nicht als Schulbuch behandeln */
export const frageSchulbuch = (sb: Schulbuch): Promise<Schulbuch | null> => new Promise((antwort) => useFrage.setState({ offen: { sb, antwort } }))

const WAHLEN: { value: AbschnittWahl; label: string }[] = [
  { value: 'verweis', label: 'Verweisen' },
  { value: 'text', label: 'Text übernehmen' },
  { value: 'weg', label: 'Weglassen' }
]

export function SchulbuchDialog(): React.JSX.Element | null {
  const offen = useFrage((s) => s.offen)
  return offen ? <Inhalt key={offen.sb.abschnitte.map((a) => a.kennung).join('|')} frage={offen} /> : null
}

function Inhalt({ frage }: { frage: Frage }): React.JSX.Element {
  const [sb, setSb] = useState<Schulbuch>(frage.sb)
  const fertig = (x: Schulbuch | null): void => {
    useFrage.setState({ offen: null })
    frage.antwort(x)
  }
  const setzeWahl = (i: number, wahl: AbschnittWahl): void => setSb((x) => ({ ...x, abschnitte: x.abschnitte.map((a, k) => (k === i ? { ...a, wahl } : a)) }))
  const alle = (wahl: AbschnittWahl): void => setSb((x) => ({ ...x, abschnitte: x.abschnitte.map((a) => (/aufgabe/i.test(a.art) ? a : { ...a, wahl })) }))
  const mitText = sb.abschnitte.some((a) => a.wahl === 'text')
  return (
    <Modal opened onClose={() => fertig(null)} title="Schulbuchseiten erkannt" size="xl" zIndex={3900} data-schulbuch-dialog>
      <Stack gap="sm">
        <Text size="sm">
          Die Seiten kommen nicht als Bild aufs Blatt. Je Abschnitt: <b>verweisen</b> („Lies VT1 auf S. 39 …“ – die Lernenden lesen im eigenen Buch),{' '}
          <b>Text übernehmen</b> (als Material mit Quellenangabe) oder <b>weglassen</b>.
        </Text>
        <Group grow>
          <TextInput label="Buch" value={sb.titel} onChange={(e) => setSb({ ...sb, titel: e.currentTarget.value })} placeholder="z. B. Geschichte und Geschehen 2" data-schulbuch-titel />
          <TextInput label="Verlag" value={sb.verlag} onChange={(e) => setSb({ ...sb, verlag: e.currentTarget.value })} />
          <TextInput label="Seiten" value={sb.seiten} onChange={(e) => setSb({ ...sb, seiten: e.currentTarget.value })} w={120} />
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Alle:
          </Text>
          <Button size="compact-xs" variant="default" onClick={() => alle('verweis')}>
            verweisen
          </Button>
          <Button size="compact-xs" variant="default" onClick={() => alle('text')}>
            übernehmen
          </Button>
        </Group>
        <ScrollArea.Autosize mah="50vh">
          <Stack gap={6}>
            {sb.abschnitte.map((a, i) => (
              <Group key={i} justify="space-between" wrap="nowrap" data-schulbuch-abschnitt={a.kennung} style={{ opacity: a.wahl === 'weg' ? 0.55 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Group gap={6}>
                    <Badge variant="light">{a.kennung}</Badge>
                    <Text size="sm" fw={600}>
                      {a.titel || a.art}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {a.art}
                      {a.seite ? ` · S. ${a.seite}` : ''}
                    </Text>
                  </Group>
                  <Tooltip label={a.text.slice(0, 600)} multiline w={420} openDelay={400}>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {a.text}
                    </Text>
                  </Tooltip>
                </div>
                <SegmentedControl size="xs" data={WAHLEN} value={a.wahl} onChange={(v) => setzeWahl(i, v as AbschnittWahl)} />
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
        {mitText && (
          <Alert variant="light" color="yellow" icon={<IconBook size={16} />} p="xs">
            <Text size="xs">{GESAMTVERTRAG_HINWEIS}</Text>
          </Alert>
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={() => fertig(null)} data-schulbuch-kein>
            Kein Schulbuch – wie bisher verwenden
          </Button>
          <Button onClick={() => fertig(sb)} disabled={!sb.abschnitte.some((a) => a.wahl !== 'weg')} data-schulbuch-ok>
            Übernehmen
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/**
 * Hochgeladene Seiten prüfen: Sind es Schulbuchseiten, fragt das Pop-up je Abschnitt nach – Ergebnis ist der
 * Text für die KI (verweisen/übernehmen) samt Buch. null: kein Schulbuch, abgelehnt oder keine KI erreichbar –
 * dann bleibt alles wie bisher. Kostet eine KI-Anfrage je Upload mit Seitenbildern.
 */
export async function schulbuchAusSeiten(bilder: string[], fach = '', melde?: (t: string) => void): Promise<{ text: string; schulbuch: Schulbuch } | null> {
  if (!bilder.some((b) => b.startsWith('data:image/'))) return null
  melde?.('Prüfe, ob es Schulbuchseiten sind …')
  const sb = await erkenneSchulbuch(bilder, (req) => window.api.ai.structured(req)).catch(() => null)
  if (!sb) return null
  const gewaehlt = await frageSchulbuch(sb)
  return gewaehlt ? { text: schulbuchText(gewaehlt, fach), schulbuch: gewaehlt } : null
}

/**
 * Schulbuchseiten aus Dateien (Reihen-Planung, Zwischenaufgabe): lesen → Namensprüfung (Datenschutz, vor jeder
 * KI) → erkennen → Pop-up. Mehrere Dateien werden als EIN Schulbuchausschnitt gelesen. null: nichts erkannt.
 */
export async function schulbuchAusDateien(dateien: File[], melde?: (t: string) => void): Promise<{ text: string; schulbuch: Schulbuch } | null> {
  const gelesen: ExtractedContent[] = []
  for (const f of dateien) {
    melde?.(`${f.name} wird gelesen …`)
    gelesen.push(await extractContent(f, (m) => melde?.(`${f.name}: ${m}`), { maxRenderedPages: 6 }))
  }
  const geprueft = await pruefeHochladen(gelesen)
  if (!geprueft) return null
  const bilder = geprueft.flatMap((g) => g.pageImages).slice(0, 6)
  if (!bilder.length) throw new Error('Keine Seitenbilder gefunden – bitte Fotos oder ein PDF der Schulbuchseiten wählen.')
  melde?.('Prüfe, ob es Schulbuchseiten sind …')
  const sb = await erkenneSchulbuch(bilder, (req) => window.api.ai.structured(req))
  if (!sb) throw new Error('Auf den Seiten wurde kein Schulbuch erkannt.')
  // Abgelehnt im Pop-up: kein Fehler, einfach nichts übernehmen
  const gewaehlt = await frageSchulbuch(sb)
  return gewaehlt ? { text: schulbuchText(gewaehlt), schulbuch: gewaehlt } : null
}
