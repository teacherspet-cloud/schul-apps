/**
 * Regeln und Aufgaben einer Grammatik bearbeiten (Sprachenlernen, 08.10.2026, Wunsch der Lehrkraft: Details „in einem
 * eigenständigen Pop-up-Fenster betrachten und bearbeiten"). Gilt für Entwürfe (vor dem Freigeben) und freigegebene
 * Grammatik. Jede Aufgabe steht als Zeile mit Vorschau; „Bearbeiten" klappt die Felder ihrer Art auf. Bestimmen und
 * Tabellen (Latein, Verbformen) sind zu verschachtelt für ein Formular – dort nur ansehen, verschieben, löschen.
 * Kennungen bleiben erhalten (paketBereinigt), damit der Lernstand der Kinder an der richtigen Aufgabe hängt.
 */
import { ActionIcon, Badge, Button, Card, Group, Select, SegmentedControl, SimpleGrid, Stack, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconPencil, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { ART_NAME, type GrammatikAufgabe, type GrammatikPaket, type GrammatikRegel } from '@shared/grammatiktrainer'
import { lateinVorschau } from '../LateinAufgaben'

/** „a | b | c" ↔ Liste */
const alsText = (l: string[] | undefined, trenner = ' | '): string => (l ?? []).join(trenner)
const alsListe = (s: string, trenner: RegExp = /\s*\|\s*/): string[] =>
  s
    .split(trenner)
    .map((x) => x.trim())
    .filter(Boolean)
const zeilen = (s: string): string[] =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

/** Eine Zeile Vorschau: Aufgabe → Lösung */
export function aufgabeVorschau(a: GrammatikAufgabe): { aufgabe: string; loesung: string } {
  const latein = lateinVorschau(a)
  if (latein) return latein
  return {
    aufgabe: `${a.art === 'satzbau' ? (a.teile ?? []).join(' / ') : a.satz}${a.vorgabe ? ` ${a.vorgabe}` : ''}`,
    loesung: `${a.loesungen.join(' | ')}${a.art === 'fehler' && a.fehlerWort ? ` (statt „${a.fehlerWort}")` : ''}`
  }
}

const EINFACH = new Set(['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau', 'mehrfach', 'uebersetzen'])

function AufgabeFelder({ a, regeln, aendern }: { a: GrammatikAufgabe; regeln: GrammatikRegel[]; aendern: (a: GrammatikAufgabe) => void }): React.JSX.Element {
  const setze = (teil: Partial<GrammatikAufgabe>): void => aendern({ ...a, ...teil })
  return (
    <Stack gap="xs" mt="xs" data-aufgabe-felder={a.id}>
      <Group grow align="flex-start">
        <TextInput label="Arbeitsanweisung" value={a.anweisung} onChange={(e) => setze({ anweisung: e.currentTarget.value })} />
        {regeln.length > 1 && (
          <Select
            label="Regel"
            data={regeln.map((r) => ({ value: r.id, label: r.titel }))}
            value={a.regelId}
            onChange={(v) => v && setze({ regelId: v })}
            allowDeselect={false}
          />
        )}
      </Group>
      {a.art === 'satzbau' ? (
        <TextInput
          label="Satzteile in richtiger Reihenfolge (mit / getrennt)"
          value={alsText(a.teile, ' / ')}
          onChange={(e) => {
            const teile = alsListe(e.currentTarget.value, /\s*\/\s*/)
            setze({ teile, loesungen: [teile.join(' ')] })
          }}
        />
      ) : a.art !== 'mehrfach' ? (
        <Textarea
          label={a.art === 'luecke' || a.art === 'auswahl' ? 'Satz (Lücke als ___)' : a.art === 'fehler' ? 'Satz mit genau einem Fehler' : 'Satz'}
          autosize
          minRows={1}
          value={a.satz}
          onChange={(e) => setze({ satz: e.currentTarget.value })}
          data-feld-satz
        />
      ) : (
        <TextInput label="Frage" value={a.satz} onChange={(e) => setze({ satz: e.currentTarget.value })} />
      )}
      {(a.art === 'luecke' || a.art === 'umformen') && (
        <TextInput
          label="Vorgabe (z. B. „(to go)“ oder „Verneine den Satz.“)"
          value={a.vorgabe ?? ''}
          onChange={(e) => setze({ vorgabe: e.currentTarget.value || undefined })}
        />
      )}
      {(a.art === 'auswahl' || a.art === 'mehrfach') && (
        <TextInput
          label="Auswahlmöglichkeiten (mit | getrennt)"
          value={alsText(a.optionen)}
          onChange={(e) => setze({ optionen: alsListe(e.currentTarget.value) })}
        />
      )}
      {a.art === 'fehler' && (
        <TextInput label="Falsches Wort (wie im Satz)" value={a.fehlerWort ?? ''} onChange={(e) => setze({ fehlerWort: e.currentTarget.value })} />
      )}
      {a.art !== 'satzbau' && (
        <TextInput
          label={a.art === 'mehrfach' ? 'Richtige Möglichkeiten (mit | getrennt)' : 'Richtige Lösung(en) (mit | getrennt)'}
          value={alsText(a.loesungen)}
          onChange={(e) => setze({ loesungen: alsListe(e.currentTarget.value) })}
          data-feld-loesung
        />
      )}
      <Group grow align="flex-start">
        <TextInput label="Tipp vor der Antwort (optional)" value={a.tipp ?? ''} onChange={(e) => setze({ tipp: e.currentTarget.value || undefined })} />
        <TextInput
          label="Erklärung nach der Antwort (optional)"
          value={a.erklaerung ?? ''}
          onChange={(e) => setze({ erklaerung: e.currentTarget.value || undefined })}
        />
      </Group>
      {a.stufe && (
        <SegmentedControl
          size="xs"
          value={String(a.stufe)}
          onChange={(v) => setze({ stufe: Number(v) as 1 | 2 | 3 })}
          data={[
            { value: '1', label: 'Stufe 1: erkennen' },
            { value: '2', label: 'Stufe 2: gelenkt bilden' },
            { value: '3', label: 'Stufe 3: selbst bilden' }
          ]}
        />
      )}
    </Stack>
  )
}

function RegelFelder({ r, aendern, loeschen }: { r: GrammatikRegel; aendern: (r: GrammatikRegel) => void; loeschen?: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  return (
    <Card withBorder padding="sm" radius="md" data-regel-karte={r.id}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text fw={700} size="sm">
            {r.titel}
          </Text>
          {!offen && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {r.erklaerung}
            </Text>
          )}
        </div>
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Regelkarte bearbeiten">
            <ActionIcon variant={offen ? 'light' : 'subtle'} onClick={() => setOffen(!offen)} aria-label="Regelkarte bearbeiten" data-regel-bearbeiten={r.id}>
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          {loeschen && (
            <Tooltip label="Regelkarte löschen (ihre Aufgaben kommen zur ersten Regel)">
              <ActionIcon variant="subtle" color="red" onClick={loeschen} aria-label="Regelkarte löschen">
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      {offen && (
        <Stack gap="xs" mt="xs">
          <TextInput label="Titel" value={r.titel} onChange={(e) => aendern({ ...r, titel: e.currentTarget.value })} />
          <Textarea label="Erklärung" autosize minRows={2} value={r.erklaerung} onChange={(e) => aendern({ ...r, erklaerung: e.currentTarget.value })} />
          <Textarea
            label="Beispiele (eines je Zeile)"
            autosize
            minRows={2}
            value={r.beispiele.join('\n')}
            onChange={(e) => aendern({ ...r, beispiele: zeilen(e.currentTarget.value) })}
          />
          {(r.stolperfallen?.length ?? 0) > 0 && (
            <Textarea
              label="Typische Stolperfallen (eine je Zeile)"
              autosize
              minRows={2}
              value={(r.stolperfallen ?? []).join('\n')}
              onChange={(e) => aendern({ ...r, stolperfallen: zeilen(e.currentTarget.value) })}
            />
          )}
        </Stack>
      )}
    </Card>
  )
}

export function AufgabenEditor({ paket, aendern }: { paket: GrammatikPaket; aendern: (p: GrammatikPaket) => void }): React.JSX.Element {
  const [offen, setOffen] = useState<string | null>(null)
  const aufgaben = paket.aufgaben
  const setzeAufgaben = (l: GrammatikAufgabe[]): void => aendern({ ...paket, aufgaben: l })
  const schieben = (i: number, d: -1 | 1): void => {
    const l = [...aufgaben]
    const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    setzeAufgaben(l)
  }
  const regelName = new Map(paket.regeln.map((r) => [r.id, r.titel]))
  return (
    <Stack data-aufgaben-editor>
      <Title order={5}>Regelkarten ({paket.regeln.length})</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {paket.regeln.map((r, i) => (
          <RegelFelder
            key={r.id}
            r={r}
            aendern={(neu) => aendern({ ...paket, regeln: paket.regeln.map((x, j) => (j === i ? neu : x)) })}
            loeschen={
              paket.regeln.length > 1
                ? () =>
                    aendern({
                      ...paket,
                      regeln: paket.regeln.filter((_, j) => j !== i),
                      aufgaben: aufgaben.map((a) => (a.regelId === r.id ? { ...a, regelId: paket.regeln.find((x) => x.id !== r.id)!.id } : a))
                    })
                : undefined
            }
          />
        ))}
      </SimpleGrid>
      <Title order={5}>Aufgaben ({aufgaben.length})</Title>
      <Stack gap={6}>
        {aufgaben.map((a, i) => {
          const v = aufgabeVorschau(a)
          return (
            <Card key={a.id} withBorder padding="xs" radius="md" data-entwurf-aufgabe data-aufgabe={a.id}>
              <Group wrap="nowrap" align="flex-start" gap="xs">
                <Stack gap={2} style={{ flex: 'none' }}>
                  <Badge size="sm" variant="light">
                    {ART_NAME[a.art]}
                  </Badge>
                  {a.stufe && (
                    <Badge size="xs" variant="outline" color="gray">
                      Stufe {a.stufe}
                    </Badge>
                  )}
                </Stack>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm">{v.aufgabe}</Text>
                  <Text size="xs" c="teal">
                    → {v.loesung}
                  </Text>
                  {paket.regeln.length > 1 && (
                    <Text size="xs" c="dimmed">
                      {regelName.get(a.regelId)}
                    </Text>
                  )}
                </div>
                <Group gap={0} wrap="nowrap" style={{ flex: 'none' }}>
                  <ActionIcon variant="subtle" color="gray" onClick={() => schieben(i, -1)} disabled={i === 0} aria-label="nach oben">
                    <IconArrowUp size={14} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" onClick={() => schieben(i, 1)} disabled={i === aufgaben.length - 1} aria-label="nach unten">
                    <IconArrowDown size={14} />
                  </ActionIcon>
                  {EINFACH.has(a.art) && (
                    <Tooltip label="Bearbeiten">
                      <ActionIcon
                        variant={offen === a.id ? 'light' : 'subtle'}
                        onClick={() => setOffen(offen === a.id ? null : a.id)}
                        aria-label="Aufgabe bearbeiten"
                        data-aufgabe-bearbeiten={a.id}
                      >
                        <IconPencil size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Streichen">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => setzeAufgaben(aufgaben.filter((x) => x.id !== a.id))}
                      aria-label="Aufgabe streichen"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
              {offen === a.id && <AufgabeFelder a={a} regeln={paket.regeln} aendern={(neu) => setzeAufgaben(aufgaben.map((x) => (x.id === a.id ? neu : x)))} />}
            </Card>
          )
        })}
      </Stack>
      {aufgaben.some((a) => !EINFACH.has(a.art)) && (
        <Text size="xs" c="dimmed">
          Bestimmen- und Tabellenaufgaben lassen sich hier verschieben und streichen, aber nicht im Einzelnen ändern.
        </Text>
      )}
      <Button variant="subtle" size="xs" w="fit-content" onClick={() => setOffen(null)} display={offen ? undefined : 'none'}>
        Alle zuklappen
      </Button>
    </Stack>
  )
}
