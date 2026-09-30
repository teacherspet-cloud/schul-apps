import { ActionIcon, Button, Divider, Group, NumberInput, ScrollArea, SegmentedControl, Select, Slider, Stack, Switch, TagsInput, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconCopy, IconSearch, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import KiWunschKnoepfe from '../../../shared/components/KiWunschKnoepfe'
import type { WunschArt } from '../../../shared/kiWunsch'
import { notifyError } from '../../../shared/util'
import { FARB_NAMEN, FARBEN, farbwert, formatInfo, type Farbe, type FormatId } from '../formate'
import { ELEMENT_NAMEN, elementText, neueId, type Diagramm, type Niveau, type Rahmen, type TafelbildMeta, type TbElement, type TbInhalt } from '../model'
import { SKIZZEN, SKIZZEN_NAMEN, SYMBOL_NAMEN, SYMBOLE } from '../symbole'

interface Props {
  e: TbElement
  format: FormatId
  meta: TafelbildMeta
  inhalt: TbInhalt | null
  aendern: (fn: (e: TbElement) => void, gruppe?: string) => void
  loeschen: () => void
  duplizieren: () => void
  ebene: (richtung: 'vorn' | 'hinten') => void
  ki: (art: WunschArt, wunsch: string) => void
  kiBusy: boolean
}

/** Farbwahl mit den Farben des Mediums (Kreide bzw. Marker) und ihrer Bedeutung laut Legende */
export function FarbWahl({ wert, format, legende, onChange }: { wert: Farbe; format: FormatId; legende: TbInhalt['farbLegende']; onChange: (f: Farbe) => void }): React.JSX.Element {
  const medium = formatInfo(format).medium
  return (
    <Group gap={6}>
      {FARBEN.map((f) => {
        const bedeutung = legende.find((l) => l.farbe === f)?.bedeutung
        const name = FARB_NAMEN[medium][f]
        return (
          <Tooltip key={f} label={bedeutung ? `${name}: ${bedeutung}` : name}>
            <button
              type="button"
              className="tb-farbe"
              aria-label={name}
              data-aktiv={wert === f}
              data-tb-farbe={f}
              style={{ background: f === 'gelb' && medium !== 'kreide' ? '#fff27a' : farbwert(medium === 'kreide' ? 'kreide' : 'marker', f), borderColor: medium === 'kreide' ? '#23402f' : undefined }}
              onClick={() => onChange(f)}
            />
          </Tooltip>
        )
      })}
    </Group>
  )
}

function DiagrammFelder({ d, setze }: { d: Diagramm; setze: (fn: (d: Diagramm) => void) => void }): React.JSX.Element {
  if (d.art === 'tabelle') {
    const spalten = d.spalten ?? []
    const zeilen = d.zeilen ?? []
    return (
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          Tabelle – Kopfzeile und Zeilen
        </Text>
        {[spalten, ...zeilen].map((z, zi) => (
          <Group key={zi} gap={4} wrap="nowrap">
            {z.map((c, ci) => (
              <TextInput
                key={ci}
                size="xs"
                style={{ flex: 1 }}
                value={c}
                aria-label={`Zeile ${zi} Spalte ${ci + 1}`}
                onChange={(ev) => {
                  const v = ev.currentTarget.value
                  setze((x) => {
                    if (zi === 0) x.spalten = (x.spalten ?? []).map((s, i) => (i === ci ? v : s))
                    else x.zeilen = (x.zeilen ?? []).map((r, i) => (i === zi - 1 ? r.map((s, j) => (j === ci ? v : s)) : r))
                  })
                }}
              />
            ))}
          </Group>
        ))}
        <Group gap={4}>
          <Button size="compact-xs" variant="default" onClick={() => setze((x) => (x.zeilen = [...(x.zeilen ?? []), Array(Math.max(1, spalten.length)).fill('')]))}>
            Zeile dazu
          </Button>
          <Button size="compact-xs" variant="default" onClick={() => setze((x) => ((x.spalten = [...(x.spalten ?? []), '']), (x.zeilen = (x.zeilen ?? []).map((r) => [...r, '']))))}>
            Spalte dazu
          </Button>
        </Group>
      </Stack>
    )
  }
  if (d.art === 'koordinatensystem') {
    const b = d.bereich ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
    return (
      <Stack gap={4}>
        <TagsInput
          size="xs"
          label="Funktionen (Terme in x)"
          placeholder="z. B. 0.5x^2 - 1"
          value={d.funktionen ?? []}
          onChange={(v) => setze((x) => (x.funktionen = v.slice(0, 4)))}
        />
        <Group gap={4} grow>
          {(['xMin', 'xMax', 'yMin', 'yMax'] as const).map((k) => (
            <NumberInput key={k} size="xs" label={k} value={b[k]} onChange={(v) => setze((x) => (x.bereich = { ...b, [k]: Number(v) || 0 }))} />
          ))}
        </Group>
      </Stack>
    )
  }
  if (d.art === 'schaltplan') return <Text size="xs">Schaltplan – Änderungen über den Zauberstab.</Text>
  // Zeitstrahl, Kreislauf, Kartenskizze: Einträge
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        {d.art === 'zeitstrahl' ? 'Marken (Jahr, Beschriftung)' : d.art === 'kreislauf' ? 'Stationen' : 'Orte'}
      </Text>
      {d.eintraege.map((t, i) => (
        <Group key={i} gap={4} wrap="nowrap">
          {d.art === 'zeitstrahl' && (
            <TextInput size="xs" w={70} value={t.wert ?? ''} aria-label="Jahr" onChange={(ev) => setze((x) => (x.eintraege[i].wert = ev.currentTarget.value))} />
          )}
          <TextInput size="xs" style={{ flex: 1 }} value={t.label} aria-label="Beschriftung" onChange={(ev) => setze((x) => (x.eintraege[i].label = ev.currentTarget.value))} />
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Entfernen" onClick={() => setze((x) => x.eintraege.splice(i, 1))}>
            <IconTrash size={13} />
          </ActionIcon>
        </Group>
      ))}
      <Button size="compact-xs" variant="default" onClick={() => setze((x) => x.eintraege.push({ label: '', wert: '', x: 0.5, y: 0.5 }))}>
        Eintrag dazu
      </Button>
    </Stack>
  )
}

/** OpenMoji suchen und als Bild ins Element */
function PiktogrammSuche({ onBild }: { onBild: (dataUrl: string) => void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const [treffer, setTreffer] = useState<{ hexcode: string; annotation: string }[]>([])
  const suche = (): void => {
    if (!q.trim()) return
    window.api.images
      .searchOpenMoji(q.trim())
      .then((t) => setTreffer(t.slice(0, 12)))
      .catch(notifyError)
  }
  return (
    <Stack gap={4}>
      <Group gap={4} wrap="nowrap">
        <TextInput size="xs" style={{ flex: 1 }} placeholder="Piktogramm suchen (OpenMoji)" value={q} onChange={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && suche()} />
        <ActionIcon size="md" variant="default" aria-label="Suchen" onClick={suche}>
          <IconSearch size={14} />
        </ActionIcon>
      </Group>
      {treffer.length > 0 && (
        <Group gap={4}>
          {treffer.map((t) => (
            <Tooltip key={t.hexcode} label={t.annotation}>
              <Button
                size="compact-sm"
                variant="default"
                onClick={() =>
                  window.api.images
                    .openMojiSvg(t.hexcode)
                    .then((svg) => onBild(`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`))
                    .catch(notifyError)
                }
              >
                {String.fromCodePoint(...t.hexcode.split('-').map((h) => parseInt(h, 16)))}
              </Button>
            </Tooltip>
          ))}
        </Group>
      )}
    </Stack>
  )
}

/** Eigenschaften des gewählten Elements */
export default function Eigenschaften({ e, format, meta, inhalt, aendern, loeschen, duplizieren, ebene, ki, kiBusy }: Props): React.JSX.Element {
  const f = formatInfo(format)
  const gruppe = (feld: string): string => `tb-feld-${e.id}-${feld}`
  const mitTitel = e.typ === 'kasten' || e.typ === 'merksatz' || (e.typ === 'text' && e.titel !== undefined)
  const mitText = e.typ !== 'diagramm' && e.typ !== 'formel'
  const schriftStufen = { min: f.schrift.notfall, max: f.schrift.titel * 1.3 }
  return (
    <ScrollArea h="100%">
      <Stack gap="sm" p="sm" data-tb-eigenschaften={e.id}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Text fw={600}>{ELEMENT_NAMEN[e.typ]}</Text>
            <Text size="xs" c="dimmed">
              Schritt {e.schritt} · {f.kurz}
            </Text>
          </div>
          <KiWunschKnoepfe
            blockId={`tb-${e.id}`}
            busy={kiBusy}
            name={e.titel || ELEMENT_NAMEN[e.typ]}
            kontext={() => ({
              typ: 'tafelelement',
              typLabel: `Tafelbild-${ELEMENT_NAMEN[e.typ]}`,
              material: 'Tafelbild',
              fachId: meta.subjectId,
              fachLabel: meta.subjectLabel,
              klasse: meta.grade,
              schulform: meta.schoolTypeName,
              thema: meta.thema,
              lernziel: meta.lernziel,
              inhalt: elementText(e)
            })}
            onAusfuehren={ki}
          />
        </Group>
        {mitTitel && (
          <TextInput size="xs" label="Überschrift" value={e.titel ?? ''} onChange={(ev) => aendern((x) => (x.titel = ev.currentTarget.value), gruppe('titel'))} data-tb-titel />
        )}
        {mitText && (
          <Textarea
            size="xs"
            label={e.typ === 'pfeil' || e.typ === 'verbinder' ? 'Beschriftung' : e.typ === 'symbol' || e.typ === 'skizze' || e.typ === 'bild' ? 'Beschriftung darunter' : 'Text'}
            description={e.typ === 'kasten' ? 'Stichpunkte je Zeile mit „• " beginnen' : undefined}
            autosize
            minRows={e.typ === 'kasten' || e.typ === 'merksatz' ? 3 : 1}
            value={e.text}
            onChange={(ev) => aendern((x) => (x.text = ev.currentTarget.value), gruppe('text'))}
            data-tb-text
          />
        )}
        {e.typ === 'formel' && (
          <TextInput size="xs" label="Formel (LaTeX)" value={e.tex ?? ''} onChange={(ev) => aendern((x) => (x.tex = ev.currentTarget.value), gruppe('tex'))} data-tb-tex />
        )}
        {e.typ === 'diagramm' && e.diagramm && <DiagrammFelder d={e.diagramm} setze={(fn) => aendern((x) => x.diagramm && fn(x.diagramm), gruppe('diagramm'))} />}
        {(e.typ === 'symbol' || e.typ === 'kasten') && (
          <Stack gap={4}>
            <Select
              size="xs"
              label={e.typ === 'kasten' ? 'Symbol im Kasten' : 'Symbol'}
              clearable={e.typ === 'kasten'}
              searchable
              data={SYMBOL_NAMEN.map((n) => ({ value: n, label: SYMBOLE[n].label }))}
              value={e.bild ? null : (e.symbol ?? null)}
              onChange={(v) =>
                aendern((x) => {
                  x.symbol = v ?? undefined
                  x.bild = undefined
                })
              }
            />
            <PiktogrammSuche onBild={(b) => aendern((x) => ((x.bild = b), (x.bildQuelle = 'openmoji')))} />
          </Stack>
        )}
        {e.typ === 'skizze' && (
          <Select
            size="xs"
            label="Vorlage"
            clearable
            data={SKIZZEN_NAMEN.map((n) => ({ value: n, label: SKIZZEN[n].label }))}
            value={e.vorlage || null}
            onChange={(v) => aendern((x) => (x.vorlage = v ?? ''))}
          />
        )}
        <div>
          <Text size="xs" fw={500} mb={4}>
            Farbe
          </Text>
          <FarbWahl wert={e.farbe} format={format} legende={inhalt?.farbLegende ?? []} onChange={(c) => aendern((x) => (x.farbe = c))} />
        </div>
        {(e.typ === 'kasten' || e.typ === 'merksatz' || e.typ === 'text') && (
          <SegmentedControl
            size="xs"
            fullWidth
            value={e.rahmen ?? (e.typ === 'merksatz' ? 'doppelt' : e.typ === 'kasten' ? 'linie' : 'keiner')}
            onChange={(v) => aendern((x) => (x.rahmen = v as Rahmen))}
            data={[
              { value: 'keiner', label: 'ohne' },
              { value: 'linie', label: 'Linie' },
              { value: 'doppelt', label: 'doppelt' },
              { value: 'gestrichelt', label: '- - -' },
              { value: 'wolke', label: 'rund' }
            ]}
          />
        )}
        {(e.typ === 'pfeil' || e.typ === 'verbinder') && (
          <SegmentedControl
            size="xs"
            fullWidth
            value={e.pfeilArt ?? 'pfeil'}
            onChange={(v) => aendern((x) => (x.pfeilArt = v as TbElement['pfeilArt']))}
            data={[
              { value: 'pfeil', label: '→ Folge' },
              { value: 'doppelpfeil', label: '↔ Wechsel' },
              { value: 'linie', label: '— gehört zu' }
            ]}
          />
        )}
        {e.typ !== 'bild' && e.typ !== 'symbol' && (
          <div>
            <Text size="xs" fw={500}>
              Schriftgröße
            </Text>
            <Slider
              size="sm"
              min={schriftStufen.min}
              max={schriftStufen.max}
              step={0.001}
              value={e.schrift ?? f.schrift.text}
              label={(v) => (v < f.schrift.min ? 'kleiner als empfohlen' : `${Math.round((v / f.schrift.min) * 100)} %`)}
              onChange={(v) => aendern((x) => (x.schrift = v), gruppe('schrift'))}
              marks={[{ value: f.schrift.min, label: 'Minimum' }]}
              mb="md"
            />
          </div>
        )}
        <Divider label="Varianten" labelPosition="left" />
        <Group grow align="flex-end">
          <NumberInput size="xs" label="Aufbauschritt" min={1} max={12} value={e.schritt} onChange={(v) => aendern((x) => (x.schritt = Math.max(1, Number(v) || 1)))} data-tb-schritt />
          <div>
            <Text size="xs" fw={500} mb={2}>
              Niveau
            </Text>
            <SegmentedControl
              size="xs"
              value={String(e.niveau ?? 1)}
              onChange={(v) => aendern((x) => (x.niveau = Number(v) as Niveau))}
              data={[
                { value: '1', label: '★' },
                { value: '2', label: '★★' },
                { value: '3', label: '★★★' }
              ]}
            />
          </div>
        </Group>
        {(e.typ === 'kasten' || e.typ === 'merksatz' || e.typ === 'text' || e.typ === 'diagramm') && (
          <>
            <TagsInput
              size="xs"
              label="Lückenwörter"
              description="In der Lückenfassung leer (gleich lange Lücken)"
              value={e.lueckenWoerter ?? []}
              onChange={(v) => aendern((x) => (x.lueckenWoerter = v))}
              data-tb-luecken
            />
            {e.typ !== 'diagramm' && <Switch size="xs" label="Ganzes Element als Schreibzeilen" checked={Boolean(e.luecke)} onChange={(ev) => aendern((x) => (x.luecke = ev.currentTarget.checked))} />}
          </>
        )}
        <Group gap={4}>
          <Tooltip label="Nach vorn">
            <ActionIcon variant="default" aria-label="Nach vorn" onClick={() => ebene('vorn')}>
              <IconArrowUp size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Nach hinten">
            <ActionIcon variant="default" aria-label="Nach hinten" onClick={() => ebene('hinten')}>
              <IconArrowDown size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Duplizieren">
            <ActionIcon variant="default" aria-label="Duplizieren" onClick={duplizieren}>
              <IconCopy size={15} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={loeschen} ml="auto" data-tb-loeschen>
            Löschen
          </Button>
        </Group>
      </Stack>
    </ScrollArea>
  )
}

/** Kopie eines Elements, leicht versetzt */
export const kopie = (e: TbElement): TbElement => ({ ...structuredClone(e), id: neueId(e.typ[0]), x: Math.min(1 - e.w, e.x + 0.02), y: Math.min(1 - e.h, e.y + 0.03) })
