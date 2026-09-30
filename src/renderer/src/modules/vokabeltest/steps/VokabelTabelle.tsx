import { ActionIcon, Badge, Box, Button, Checkbox, Group, Menu, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { IconDots, IconPlus, IconTrash } from '@tabler/icons-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { newId } from '../model/random'
import SonderzeichenLeiste from '../../../shared/components/SonderzeichenLeiste'
import { sprachAttribute } from '../../../shared/sprachSchrift'

/**
 * EINE Vokabeltabelle für Vokabeltest (Schritt 1 und Prüffenster), eigene Listen und
 * Schulbuch-Abschnitte.
 *
 * Anlass (Paket 7): Es gab drei Tabellen mit verschiedenem Verhalten – im Vokabeltest legte
 * Enter/Tab in der letzten Zelle eine Zeile an, in den Listen erschien von selbst eine leere
 * Zeile; Löschknöpfe hatten mal einen Namen, mal nicht; „grau" und „Kasten" waren zwei
 * Häkchenspalten, die man leicht mit „abfragen" verwechselte. Jetzt überall gleich:
 *
 * - Enter springt in die nächste Zeile; in der letzten Zeile legen Enter und Tab (im letzten
 *   Feld) eine neue an.
 * - „abfragen" ist die einzige Häkchenspalte (nur im Vokabeltest).
 * - Zusatzwortschatz (im Buch grau) und Kasten-Wörter sind als Kennzeichen in der Zeile
 *   sichtbar (grauer Text, kleines Schild) und über das ⋯-Menü der Zeile umzuschalten.
 * - Jeder Knopf und jedes Feld hat einen Namen für Bildschirmleser.
 */

/** Was eine Zeile mindestens hat – Vokabeltest-Einträge und Listen-/Schulbuchzeilen passen beide */
export interface TabellenZeile {
  id: string
  term: string
  translation: string
  pos?: string
  note?: string
  /** Beispielsatz aus dem Schulbuch und seine Übersetzung (nur in Schulbuch-Abschnitten) */
  example?: string
  exampleTranslation?: string
  /** Zusatzwortschatz – im Buch grau gedruckt */
  grey?: boolean
  inBox?: boolean
  /** Wird im Test abgefragt (fehlt = ja) – nur mit `abfragen` */
  include?: boolean
}

type Feld = 'term' | 'translation' | 'pos' | 'example' | 'note'

export const ZUSATZ = 'Zusatzwortschatz (im Buch grau)'

export const leereZeile = <T extends TabellenZeile>(): T => ({ id: newId(), term: '', translation: '' }) as T

/**
 * Sprache der Tabelle (30.09.2026): Schrift, Schreibrichtung und Sonderzeichen der Wortspalte,
 * Beispiel im Platzhalter und die Überschrift der dritten Spalte – in Latein/Griechisch steht dort
 * die Nennform, in Chinesisch/Japanisch die Lesung (so drucken es die Lehrwerke).
 */
const BEISPIEL: Record<string, string> = {
  en: 'z. B. to explore',
  fr: 'z. B. découvrir',
  es: 'z. B. descubrir',
  it: 'z. B. scoprire',
  nl: 'z. B. ontdekken',
  ru: 'z. B. открывать',
  pl: 'z. B. odkrywać',
  cs: 'z. B. objevovat',
  pt: 'z. B. descobrir',
  tr: 'z. B. keşfetmek',
  zh: 'z. B. 发现',
  ja: 'z. B. 発見する',
  ar: 'z. B. اِكتَشَفَ',
  da: 'z. B. at opdage',
  el: 'z. B. ανακαλύπτω',
  la: 'z. B. invenire',
  grc: 'z. B. ὁ λόγος'
}
const DRITTE_SPALTE: Record<string, string> = {
  la: 'Nennform / Wortart',
  grc: 'Nennform / Wortart',
  zh: 'Pinyin / Wortart',
  ja: 'Lesung / Wortart'
}

export default function VokabelTabelle<T extends TabellenZeile>({
  zeilen,
  onChange,
  abfragen = false,
  mitBeispiel = false,
  mitVerlauf = false,
  bereinige,
  sprache
}: {
  zeilen: T[]
  /** Neue Zeilen; `gruppe` fasst fortlaufendes Tippen im selben Feld zu EINEM Verlaufsschritt */
  onChange: (zeilen: T[], gruppe?: string) => void
  /** Spalte „abfragen" (Vokabeltest) */
  abfragen?: boolean
  /** Spalte „Beispielsatz" mit Übersetzung (Schulbuch-Abschnitte) */
  mitBeispiel?: boolean
  /** Holt Strg+Z eine gelöschte Zeile zurück? (Nur dann sagt es der Tooltip) */
  mitVerlauf?: boolean
  /** Zusätzliche Änderungen zu einer Änderung, z. B. veraltete Bild-Analyse verwerfen */
  bereinige?: (zeile: T, patch: Partial<T>) => Partial<T>
  /** Sprachcode der Wörter (Schrift, Sonderzeichen, Spaltennamen) – fehlt = ohne Besonderheiten */
  sprache?: string
}): React.JSX.Element {
  // Stabile Rückrufe: Sonst zeichnet die Tabelle (oft weit über hundert Zeilen) bei jedem
  // Tastendruck ALLE Zeilen neu, und das Tippen wird spürbar zäh.
  const aktuell = useRef({ zeilen, onChange, bereinige })
  aktuell.current = { zeilen, onChange, bereinige }
  const [fokus, setFokus] = useState<{ id: string; feld: Feld } | null>(null)
  const tabelle = useRef<HTMLTableElement>(null)

  useEffect(() => {
    if (!fokus) return
    tabelle.current?.querySelector<HTMLInputElement>(`[data-zeile="${fokus.id}"][data-feld="${fokus.feld}"]`)?.focus()
    setFokus(null)
  }, [fokus, zeilen])

  const aendern = useCallback((id: string, teil: Partial<TabellenZeile>, gruppe?: string): void => {
    const { zeilen: z, onChange: fertig, bereinige: b } = aktuell.current
    const patch = teil as Partial<T>
    fertig(
      z.map((x) => (x.id === id ? { ...x, ...patch, ...(b ? b(x, patch) : {}) } : x)),
      gruppe
    )
  }, [])

  const neueZeile = useCallback((nach?: string): void => {
    const { zeilen: z, onChange: fertig } = aktuell.current
    const neu = leereZeile<T>()
    const i = nach ? z.findIndex((x) => x.id === nach) : -1
    fertig(i < 0 ? [...z, neu] : [...z.slice(0, i + 1), neu, ...z.slice(i + 1)])
    setFokus({ id: neu.id, feld: 'term' })
  }, [])

  const loeschen = useCallback((id: string): void => {
    const { zeilen: z, onChange: fertig } = aktuell.current
    fertig(z.filter((x) => x.id !== id))
  }, [])

  /** Enter: nächste Zeile (gleiches Feld); in der letzten Zeile eine neue anlegen */
  const weiter = useCallback(
    (id: string, feld: Feld): void => {
      const z = aktuell.current.zeilen
      const i = z.findIndex((x) => x.id === id)
      if (i === z.length - 1) neueZeile()
      else if (i >= 0) setFokus({ id: z[i + 1].id, feld })
    },
    [neueZeile]
  )

  const gefuellt = zeilen.filter((v) => v.term.trim())
  const abgefragt = gefuellt.filter((v) => v.include !== false).length

  return (
    <>
      <SonderzeichenLeiste sprache={sprache} />
      <Box style={{ overflowX: 'auto' }}>
        <Table verticalSpacing={4} striped highlightOnHover ref={tabelle} className="vokabel-tabelle">
          <Table.Thead>
            <Table.Tr>
              {abfragen && (
                <Table.Th w={44}>
                  <Tooltip label="Alle abfragen / keine abfragen">
                    <Checkbox
                      aria-label="Alle Vokabeln abfragen"
                      checked={gefuellt.length > 0 && abgefragt === gefuellt.length}
                      indeterminate={abgefragt > 0 && abgefragt < gefuellt.length}
                      onChange={(e) => {
                        const an = e.currentTarget.checked
                        onChange(zeilen.map((v) => ({ ...v, include: an })))
                      }}
                    />
                  </Tooltip>
                </Table.Th>
              )}
              <Table.Th w={36}>#</Table.Th>
              <Table.Th>Wort / Ausdruck</Table.Th>
              <Table.Th>Deutsch</Table.Th>
              <Table.Th w={sprache && DRITTE_SPALTE[sprache] ? 160 : 110}>{(sprache && DRITTE_SPALTE[sprache]) || 'Wortart'}</Table.Th>
              {mitBeispiel && (
                <Table.Th>
                  <Tooltip label="Beispielsatz aus dem Schulbuch, darunter seine Übersetzung" withArrow>
                    <span>Beispielsatz</span>
                  </Tooltip>
                </Table.Th>
              )}
              <Table.Th>{mitBeispiel ? 'Hinweis' : 'Beispiel / Hinweis'}</Table.Th>
              <Table.Th w={72} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zeilen.map((z, i) => (
              <Zeile
                key={z.id}
                zeile={z}
                nr={i + 1}
                letzte={i === zeilen.length - 1}
                abfragen={abfragen}
                mitBeispiel={mitBeispiel}
                mitVerlauf={mitVerlauf}
                aendern={aendern}
                loeschen={loeschen}
                weiter={weiter}
                neueZeile={neueZeile}
                sprache={sprache}
              />
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Button variant="subtle" leftSection={<IconPlus size={16} />} mt="xs" onClick={() => neueZeile()}>
        Zeile hinzufügen
      </Button>
    </>
  )
}

interface ZeilenProps {
  zeile: TabellenZeile
  nr: number
  letzte: boolean
  abfragen: boolean
  mitBeispiel: boolean
  mitVerlauf: boolean
  aendern: (id: string, patch: Partial<TabellenZeile>, gruppe?: string) => void
  loeschen: (id: string) => void
  weiter: (id: string, feld: Feld) => void
  neueZeile: (nach?: string) => void
  sprache?: string
}

const Zeile = memo(function Zeile({
  zeile: v,
  nr,
  letzte,
  abfragen,
  mitBeispiel,
  mitVerlauf,
  aendern,
  loeschen,
  weiter,
  neueZeile,
  sprache
}: ZeilenProps): React.JSX.Element {
  const name = v.term.trim() || `Zeile ${nr}`
  const abgefragt = v.include !== false
  // Wort, Beispiel und Nennform/Lesung in der Schrift der Sprache; Deutsch und Hinweis bleiben, wie sie sind
  const zielsprachig = (f: Feld): boolean => f === 'term' || f === 'example' || f === 'pos'
  const feld = (f: Feld, label: string, placeholder?: string, letztesFeld = false): React.JSX.Element => {
    const attr = zielsprachig(f) ? sprachAttribute(sprache) : {}
    return (
    <TextInput
      variant="unstyled"
      aria-label={`${label} in Zeile ${nr}`}
      placeholder={placeholder}
      value={(v[f] as string | undefined) ?? ''}
      data-zeile={v.id}
      data-feld={f}
      lang={attr.lang}
      dir={attr.dir}
      styles={{
        input: {
          ...(f === 'term' && v.grey ? { color: 'var(--mantine-color-dimmed)' } : {}),
          ...(attr.style ?? {})
        }
      }}
      onChange={(e) => aendern(v.id, { [f]: e.currentTarget.value }, `zeile:${v.id}:${f}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          weiter(v.id, f)
        } else if (e.key === 'Tab' && !e.shiftKey && letzte && letztesFeld) {
          e.preventDefault()
          neueZeile()
        }
      }}
    />
    )
  }
  return (
    <Table.Tr data-zusatz={v.grey ? '' : undefined} style={abfragen && !abgefragt ? { opacity: 0.6 } : undefined}>
      {abfragen && (
        <Table.Td>
          <Checkbox aria-label={`„${name}“ abfragen`} checked={abgefragt} onChange={(e) => aendern(v.id, { include: e.currentTarget.checked })} />
        </Table.Td>
      )}
      <Table.Td>
        <Text size="xs" c="dimmed">
          {nr}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>{feld('term', 'Wort', BEISPIEL[sprache ?? 'en'] ?? BEISPIEL.en)}</div>
          {v.grey && (
            <Tooltip label={`${ZUSATZ} – muss nicht unbedingt gelernt werden`}>
              <Badge size="xs" variant="light" color="gray" tt="none" style={{ flexShrink: 0 }} data-testid="zusatz-kennzeichen">
                grau
              </Badge>
            </Tooltip>
          )}
          {v.inBox && (
            <Tooltip label="Stand im Buch in einem Kasten">
              <Badge size="xs" variant="outline" color="gray" tt="none" style={{ flexShrink: 0 }}>
                Kasten
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Table.Td>
      <Table.Td>{feld('translation', 'Deutsch', 'erkunden')}</Table.Td>
      <Table.Td>{feld('pos', 'Wortart')}</Table.Td>
      {mitBeispiel && (
        <Table.Td>
          {feld('example', 'Beispielsatz')}
          <TextInput
            variant="unstyled"
            size="xs"
            styles={{ input: { color: 'var(--mantine-color-dimmed)' } }}
            placeholder="Übersetzung des Beispielsatzes"
            aria-label={`Übersetzung des Beispielsatzes in Zeile ${nr}`}
            value={v.exampleTranslation ?? ''}
            onChange={(e) => aendern(v.id, { exampleTranslation: e.currentTarget.value }, `zeile:${v.id}:exampleTranslation`)}
          />
        </Table.Td>
      )}
      <Table.Td>{feld('note', mitBeispiel ? 'Hinweis' : 'Beispiel oder Hinweis', undefined, true)}</Table.Td>
      <Table.Td>
        <Group gap={2} wrap="nowrap" justify="flex-end">
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`Weitere Aktionen für „${name}“`}>
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => aendern(v.id, { grey: !v.grey })}>
                {v.grey ? `Nicht mehr als ${ZUSATZ} kennzeichnen` : `Als ${ZUSATZ} kennzeichnen`}
              </Menu.Item>
              <Menu.Item onClick={() => aendern(v.id, { inBox: !v.inBox })}>
                {v.inBox ? 'Nicht mehr als Kasten-Wort kennzeichnen' : 'Als Kasten-Wort kennzeichnen'}
              </Menu.Item>
              <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => neueZeile(v.id)}>
                Zeile darunter einfügen
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Tooltip label={mitVerlauf ? 'Zeile löschen (Strg+Z holt sie zurück)' : 'Zeile löschen'}>
            <ActionIcon variant="subtle" color="gray" aria-label={`Zeile ${nr} löschen („${name}“)`} onClick={() => loeschen(v.id)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  )
})
