/**
 * Formulierungshilfen am Schreibfeld (26.11.2026, abgestimmt mit der Lehrkraft).
 *
 * Useful phrases, Wortspeicher, Satzanfänge und Tipps stehen auf dem Blatt oft eine Seite vom
 * Schreibfeld entfernt – wer nachsieht, verliert den eigenen Text aus dem Blick. Digital gibt es
 * deshalb am mehrzeiligen Schreibfeld einen Knopf (wie das ?-Symbol der Hilfekarten), der die
 * Kästen zur Aufgabe in einer schmalen Leiste RECHTS NEBEN dem Feld öffnet. Sie bleibt beim Tippen
 * offen und zeigt die Wendungen nur an (abgestimmt: kein Einfügen per Antippen – abschreiben wie
 * auf Papier). Der Kasten auf dem Blatt bleibt, wo er ist.
 *
 * Zuordnung wie beim Sperren der Hilfen (`data-hilfe-fuer`, aufgabenVerweise.ts › hilfenZuordnung):
 * ein Kasten mit Aufgabennummer gehört zu dieser Aufgabe, einer ohne gilt fürs ganze Blatt.
 */
import { ActionIcon, CloseButton, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { IconMessageDots } from '@tabler/icons-react'
import { useState } from 'react'
import { Schwebefenster } from '../../shared/Schwebefenster'

export interface Formulierungshilfe {
  /** Kennung des Bausteins (data-hilfe-block) – ein über zwei Seiten geteilter Kasten erscheint einmal */
  id: string
  titel: string
  gruppen: { label: string; eintraege: string[] }[]
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Kästen aus dem Blatt: je Aufgabennummer und solche fürs ganze Blatt (ohne Hilfekarten – die haben das ?-Symbol) */
export function formulierungshilfenAus(doc: Document): { jeAufgabe: Map<number, Formulierungshilfe[]>; allgemein: Formulierungshilfe[] } {
  const jeAufgabe = new Map<number, Formulierungshilfe[]>()
  const allgemein: Formulierungshilfe[] = []
  const nachId = new Map<string, Formulierungshilfe>()
  const els = Array.from(doc.querySelectorAll<HTMLElement>('.ws-phrases, .ws-scaffold:not(.ws-scaffold-hilfekarten)')).filter(
    (el) => !el.closest('#sa-hilfekarten')
  )
  for (const el of els) {
    const id = el.dataset.hilfeBlock ?? `k${nachId.size}`
    let gruppen: Formulierungshilfe['gruppen']
    let titel: string
    if (el.classList.contains('ws-phrases')) {
      titel = text(el.querySelector('.ws-phrases-head'))
      gruppen = Array.from(el.querySelectorAll('.ws-phrases-group')).map((g) => ({
        label: text(g.querySelector('.ws-phrases-label')),
        eintraege: Array.from(g.querySelectorAll('li'))
          .map((li) => [text(li.querySelector('.ws-phrases-text')), text(li.querySelector('.ws-phrases-de'))].filter(Boolean).join(' '))
          .filter(Boolean)
      }))
    } else {
      titel = text(el.querySelector('.ws-scaffold-title'))
      const eintraege = Array.from(el.querySelectorAll('.ws-wordbank > span, ul > li')).map(text).filter(Boolean)
      gruppen = [{ label: '', eintraege }]
    }
    gruppen = gruppen.filter((g) => g.eintraege.length)
    const da = nachId.get(id)
    if (da) {
      // Fortsetzung eines geteilten Kastens: Einträge anhängen
      for (const g of gruppen) {
        const gleich = da.gruppen.find((x) => x.label === g.label)
        if (gleich) gleich.eintraege.push(...g.eintraege)
        else da.gruppen.push(g)
      }
      continue
    }
    if (!gruppen.length) continue
    const hilfe: Formulierungshilfe = { id, titel: titel || 'Formulierungshilfen', gruppen }
    nachId.set(id, hilfe)
    const nr = Number(el.dataset.hilfeFuer)
    if (nr) jeAufgabe.set(nr, [...(jeAufgabe.get(nr) ?? []), hilfe])
    else allgemein.push(hilfe)
  }
  return { jeAufgabe, allgemein }
}

function Eintraege({ hilfen }: { hilfen: Formulierungshilfe[] }): React.JSX.Element {
  return (
    <Stack gap={10}>
      {hilfen.map((h) => (
        <Stack key={h.id} gap={6}>
          {hilfen.length > 1 && (
            <Text fw={600} size="sm" c="dimmed">
              {h.titel}
            </Text>
          )}
          {h.gruppen.map((g, i) => (
            <div key={i}>
              {g.label && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={2}>
                  {g.label}
                </Text>
              )}
              <Stack gap={3}>
                {g.eintraege.map((e, k) => (
                  <Text key={k} size="sm" style={{ lineHeight: 1.35 }}>
                    {e}
                  </Text>
                ))}
              </Stack>
            </div>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}

const titelVon = (hilfen: Formulierungshilfe[]): string => (hilfen.length === 1 ? hilfen[0].titel : 'Formulierungshilfen')

/**
 * Knopf am Schreibfeld; die Hilfen öffnen sich in einem verschiebbaren Fenster (27.11.2026), anfangs rechts neben dem
 * Knopf. Es bleibt beim Tippen und Rollen offen, bis es geschlossen wird.
 */
export function FormulierungsKnopf({
  hilfen,
  stil,
  feldId
}: {
  hilfen: Formulierungshilfe[]
  stil: React.CSSProperties
  feldId: string
}): React.JSX.Element {
  const [offen, setOffen] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <Tooltip label={offen ? 'Formulierungshilfen schließen' : 'Formulierungshilfen zeigen'}>
        <ActionIcon
          variant={offen ? 'filled' : 'light'}
          color="indigo"
          radius="xl"
          size="md"
          style={{ ...stil, zIndex: 21, boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setOffen((o) => (o ? null : { x: r.right + 8, y: r.top }))
          }}
          aria-label="Formulierungshilfen"
          aria-pressed={Boolean(offen)}
          data-phrasen-feld={feldId}
        >
          <IconMessageDots size={16} />
        </ActionIcon>
      </Tooltip>
      {offen && (
        <Schwebefenster titel={titelVon(hilfen)} schliessen={() => setOffen(null)} start={offen} merken="phrasen" breite={300} kennung={{ 'data-phrasen-leiste': feldId }}>
          <Eintraege hilfen={hilfen} />
        </Schwebefenster>
      )}
    </>
  )
}

/** Listenansicht (schmale Geräte): aufklappbar unter dem Kopf der Aufgabe */
export function FormulierungsKasten({ hilfen, schliessen }: { hilfen: Formulierungshilfe[]; schliessen: () => void }): React.JSX.Element {
  return (
    <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-indigo-light)" data-phrasen-liste>
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Text fw={700} size="sm">
            {titelVon(hilfen)}
          </Text>
          <CloseButton size="sm" onClick={schliessen} aria-label="Formulierungshilfen schließen" />
        </Group>
        <Eintraege hilfen={hilfen} />
      </Stack>
    </Paper>
  )
}
