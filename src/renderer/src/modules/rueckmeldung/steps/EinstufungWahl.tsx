import { Badge, Button, Group, Select } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { einstufungVon, skalenWerte, wertText } from '../art'
import type { Einstufungswert, Rueckmeldung } from '../model/types'

/** Auswahl einer Einstufung mit Vorschlag der KI und Bestätigung */
export default function EinstufungWahl({
  r,
  w,
  setze,
  klein = false
}: {
  r: Rueckmeldung
  w: Einstufungswert | null | undefined
  setze: (neu: Einstufungswert) => void
  klein?: boolean
}): React.JSX.Element {
  const art = einstufungVon(r.meta)
  const werte = skalenWerte(art)
  return (
    <Group gap={6} wrap="nowrap">
      <Select
        size="xs"
        w={klein ? 90 : 150}
        data={werte.map((v) => ({ value: v, label: klein ? v : wertText(art, v) }))}
        value={w?.wert || null}
        placeholder="–"
        onChange={(v) => v && setze({ anteil: w?.anteil ?? 0, ...(w?.begruendung ? { begruendung: w.begruendung } : {}), wert: v, bestaetigt: true })}
        allowDeselect={false}
        aria-label="Einstufung"
        comboboxProps={{ withinPortal: true }}
      />
      {w?.wert &&
        (w.bestaetigt ? (
          <Badge size="xs" color="teal" variant="light" leftSection={<IconCheck size={10} />}>
            bestätigt
          </Badge>
        ) : (
          <Button size="compact-xs" variant="light" color="orange" onClick={() => setze({ ...w, bestaetigt: true })} data-rm-bestaetigen>
            Vorschlag bestätigen
          </Button>
        ))}
    </Group>
  )
}
