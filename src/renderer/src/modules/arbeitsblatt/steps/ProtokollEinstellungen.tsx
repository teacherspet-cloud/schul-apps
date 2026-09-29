import { ActionIcon, Anchor, Button, Checkbox, Group, MultiSelect, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import {
  ALLE_ABSCHNITTE,
  abschnittErzeugen,
  abschnittTitel,
  ARTEN,
  checklisteFuer,
  GESTIS_URL,
  GHS,
  leitfrageFuer,
  rasterFuer,
  satzanfaengeFuer,
  SCHUTZMASSNAHMEN,
  STILE,
  STUFEN
} from '../didactics/protokoll'
import type { AbschnittId, GhsId, ProtokollArt, ProtokollStil, ProtokollStufe } from '../model/protokoll'
import type { ProtocolBlock, WsBlock } from '../model/types'

/**
 * Einstellungen des Bausteins „Versuchsprotokoll" (29.09.2026): Art, Struktur, Zeitform,
 * Abschnitte, Zeilen, Chemikalien mit GHS, Schutzmaßnahmen, Checkliste und Raster.
 */
export default function ProtokollEinstellungen({
  block,
  update
}: {
  block: ProtocolBlock
  update: (fn: (d: WsBlock) => void, gruppe?: string) => void
}): React.JSX.Element {
  const setze = (fn: (d: ProtocolBlock) => void, gruppe?: string): void => update((d) => d.type === 'protocol' && fn(d), gruppe)
  const mitHilfen = block.stufe === 'forscher' || block.stufe === 'vorstrukturiert' || block.stufe === 'luecken' || block.stufe === 'planen'
  const ids = block.abschnitte.map((a) => a.id)
  const chemikalien = block.chemikalien ?? []

  return (
    <Stack gap="xs" data-protokoll-einstellungen>
      <Select
        size="xs"
        label="Art"
        data={ARTEN.map((a) => ({ value: a.id, label: a.label }))}
        value={block.art}
        onChange={(v) =>
          v &&
          setze((d) => {
            d.art = v as ProtokollArt
            d.abschnitte.forEach((a) => (a.titel = abschnittTitel(a.id, d.art)))
          })
        }
        allowDeselect={false}
      />
      <Select
        size="xs"
        label="Struktur"
        data={STUFEN.map((s) => ({ value: s.id, label: s.label }))}
        value={block.stufe}
        onChange={(v) =>
          v &&
          setze((d) => {
            d.stufe = v as ProtokollStufe
            const hilfen = d.stufe !== 'offen'
            // Leitfragen und Satzanfänge folgen der Struktur; vorgegebene Inhalte bleiben stehen
            d.abschnitte.forEach((a) => {
              const lf = leitfrageFuer(a.id, d.art)
              if (hilfen && lf) a.leitfrage = lf
              else delete a.leitfrage
              const sa = satzanfaengeFuer(a.id, d.stil)
              if (hilfen && sa.length && !a.vorgabe) a.satzanfaenge = sa
              else delete a.satzanfaenge
            })
          })
        }
        description={STUFEN.find((s) => s.id === block.stufe)?.beschreibung}
        allowDeselect={false}
      />
      <Select
        size="xs"
        label="Zeitform"
        data={STILE.map((s) => ({ value: s.id, label: s.label }))}
        value={block.stil}
        description={STILE.find((s) => s.id === block.stil)?.beispiel}
        onChange={(v) =>
          v &&
          setze((d) => {
            d.stil = v as ProtokollStil
            d.abschnitte.forEach((a) => {
              const sa = satzanfaengeFuer(a.id, d.stil)
              if (a.satzanfaenge && sa.length) a.satzanfaenge = sa
            })
          })
        }
        allowDeselect={false}
      />
      <MultiSelect
        size="xs"
        label="Abschnitte"
        data={ALLE_ABSCHNITTE.map((id) => ({ value: id, label: abschnittTitel(id, block.art) }))}
        value={ids}
        onChange={(neu) =>
          setze((d) => {
            const behalten = d.abschnitte.filter((a) => neu.includes(a.id))
            const dazu = (neu as AbschnittId[]).filter((id) => !ids.includes(id)).map((id) => abschnittErzeugen(id, d.art, d.stil, mitHilfen))
            // In der Reihenfolge des Katalogs (Frage vor Vermutung vor Material …)
            d.abschnitte = [...behalten, ...dazu].sort((x, y) => ALLE_ABSCHNITTE.indexOf(x.id) - ALLE_ABSCHNITTE.indexOf(y.id))
            if (d.checkliste) d.checkliste = checklisteFuer(d.abschnitte.map((a) => a.id), d.art)
            if (d.raster) d.raster = rasterFuer(d.abschnitte.map((a) => a.id))
          })
        }
      />
      {block.abschnitte
        .filter((a) => a.form === 'linien' || a.form === 'skizze' || a.form === 'diagramm' || a.form === 'tabelle')
        .map((a) => {
          const i = block.abschnitte.indexOf(a)
          return (
            <Group key={`${a.id}-${i}`} gap={6} wrap="nowrap">
              <Text size="xs" style={{ flex: 1 }}>
                {a.titel}
              </Text>
              <NumberInput
                size="xs"
                w={96}
                min={0}
                max={a.form === 'linien' ? 20 : a.form === 'tabelle' ? 20 : 200}
                step={a.form === 'linien' || a.form === 'tabelle' ? 1 : 5}
                suffix={a.form === 'linien' ? ' Zeilen' : a.form === 'tabelle' ? ' Zeilen' : ' mm'}
                value={a.form === 'linien' ? (a.zeilen ?? 0) : a.form === 'tabelle' ? (a.tabellenZeilen ?? 6) : (a.hoeheMm ?? 60)}
                onChange={(v) =>
                  setze((d) => {
                    const x = d.abschnitte[i]
                    const n = Number(v) || 0
                    if (x.form === 'linien') x.zeilen = n
                    else if (x.form === 'tabelle') x.tabellenZeilen = Math.max(1, n)
                    else x.hoeheMm = Math.max(20, n)
                  }, `protokoll-${a.id}-${i}`)
                }
                aria-label={`Umfang ${a.titel}`}
              />
            </Group>
          )
        })}
      {(ids.includes('chemikalien') || ids.includes('sicherheit')) && (
        <Stack gap={4}>
          <Text size="xs" fw={600}>
            Chemikalien und Gefahren
          </Text>
          {chemikalien.map((c, k) => (
            <Stack key={k} gap={2}>
              <Group gap={4} wrap="nowrap">
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  value={c.name}
                  placeholder="Stoff"
                  onChange={(e) => {
                    const v = e.currentTarget.value
                    setze((d) => (d.chemikalien![k].name = v), `chem-n-${k}`)
                  }}
                  aria-label="Stoff"
                />
                <TextInput
                  size="xs"
                  w={70}
                  value={c.menge ?? ''}
                  placeholder="Menge"
                  onChange={(e) => {
                    const v = e.currentTarget.value
                    setze((d) => (d.chemikalien![k].menge = v), `chem-m-${k}`)
                  }}
                  aria-label="Menge"
                />
                <ActionIcon size="sm" variant="subtle" color="red" aria-label="Stoff entfernen" onClick={() => setze((d) => d.chemikalien!.splice(k, 1))}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
              <MultiSelect
                size="xs"
                placeholder="GHS-Piktogramme"
                data={GHS.map((g) => ({ value: g.id, label: `${g.id} ${g.bedeutung}` }))}
                value={c.ghs}
                onChange={(v) => setze((d) => (d.chemikalien![k].ghs = v as GhsId[]))}
                aria-label="GHS-Piktogramme"
              />
              <TextInput
                size="xs"
                value={[c.hSaetze, c.pSaetze].filter(Boolean).join(' | ')}
                placeholder="H-Sätze | P-Sätze"
                onChange={(e) => {
                  const [h, p] = e.currentTarget.value.split('|').map((x) => x.trim())
                  setze((d) => {
                    d.chemikalien![k].hSaetze = h || undefined
                    d.chemikalien![k].pSaetze = p || undefined
                  }, `chem-hp-${k}`)
                }}
                aria-label="H- und P-Sätze"
              />
            </Stack>
          ))}
          <Button
            size="compact-xs"
            variant="subtle"
            w="fit-content"
            leftSection={<IconPlus size={12} />}
            onClick={() => setze((d) => (d.chemikalien = [...(d.chemikalien ?? []), { name: '', ghs: [] }]))}
          >
            Stoff hinzufügen
          </Button>
          <MultiSelect
            size="xs"
            label="Schutzmaßnahmen (angekreuzt)"
            data={SCHUTZMASSNAHMEN.map((s) => ({ value: s.id, label: s.label }))}
            value={block.schutz ?? []}
            onChange={(v) => setze((d) => (d.schutz = v))}
          />
          {block.sicherheitZuPruefen && (
            <Group gap={6}>
              <Anchor size="xs" href={GESTIS_URL} target="_blank">
                GESTIS-Stoffdatenbank
              </Anchor>
              <Button size="compact-xs" variant="light" color="teal" onClick={() => setze((d) => delete d.sicherheitZuPruefen)} data-sicherheit-geprueft>
                Angaben geprüft
              </Button>
            </Group>
          )}
        </Stack>
      )}
      <Checkbox
        size="xs"
        label="Checkliste „Ist mein Protokoll vollständig?“"
        checked={Boolean(block.checkliste?.length)}
        onChange={(e) => {
          const an = e.currentTarget.checked
          setze((d) => {
            if (an) d.checkliste = checklisteFuer(d.abschnitte.map((a) => a.id), d.art)
            else delete d.checkliste
          })
        }}
      />
      <Checkbox
        size="xs"
        label="Bewertungsraster im Lösungsteil"
        checked={Boolean(block.raster?.length)}
        onChange={(e) => {
          const an = e.currentTarget.checked
          setze((d) => {
            if (an) d.raster = rasterFuer(d.abschnitte.map((a) => a.id))
            else delete d.raster
          })
        }}
      />
    </Stack>
  )
}
