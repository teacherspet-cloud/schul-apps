/**
 * Suche in „Meine Klassen" (10.10.2026, Entscheidung der Lehrkraft): findet Klassen/Kurse UND Lernende – in der Übersicht
 * wie in einer Klasse. Treffer als Liste unter dem Feld (auch am Handy), am PC mit ↑/↓/Enter/Esc.
 *  - In einer Klasse: zuerst „In dieser Klasse (7b)", dann „Andere Klassen", dann „Klassen".
 *  - Lernende: „Mia K. · 7b · Englisch, Französisch"; gesucht über Vor- und Nachnamen bzw. Stichwörter zum
 *    Handlungsbedarf („nicht geübt", „wackelig" …). Regeln: shared/klassenSuche.ts; Daten: GET /server/klassen/suche.
 *  - Klick auf eine Person öffnet ihre Details (in mehreren Kursen der Lehrkraft erst eine kleine Kurswahl).
 */
import { Badge, Combobox, Group, Text, TextInput, useCombobox } from '@mantine/core'
import { IconSearch, IconUser, IconUsers, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { klasseTrifft, PROBLEM_TEXT, suchForm, SUCHE_MIN, type SuchPerson } from '@shared/klassenSuche'
import { holen } from '../onlinetest/serverApi'

export type SuchTreffer = Omit<SuchPerson, 'suchName'> & { grund: 'name' | 'stichwort' }

export interface SuchKlasse {
  schluessel: string
  name: string
  faecher: { id: string; fach: string }[]
}

const klassenName = (n: string): string => (/^\d/.test(n) ? `Klasse ${n}` : n)

export function KlassenSuche({
  klassen,
  aktuell,
  klasseWaehlen,
  personWaehlen
}: {
  klassen: SuchKlasse[]
  /** Klasse, in der man gerade steht (dann deren Lernende zuerst) */
  aktuell?: SuchKlasse | null
  klasseWaehlen: (k: SuchKlasse) => void
  personWaehlen: (p: SuchTreffer) => void
}): React.JSX.Element {
  const [eingabe, setEingabe] = useState('')
  const [treffer, setTreffer] = useState<{ q: string; lernende: SuchTreffer[] } | null>(null)
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })
  const q = eingabe.trim()
  // Lernende vom Server (kurz verzögert); Klassen aus der geladenen Übersicht
  useEffect(() => {
    if (q.length < SUCHE_MIN) return
    let aus = false
    const t = window.setTimeout(() => {
      void holen<{ lernende: SuchTreffer[] }>(`/server/klassen/suche?q=${encodeURIComponent(q)}&klasse=${encodeURIComponent(aktuell?.name ?? '')}`)
        .then((r) => !aus && setTreffer({ q, lernende: r.lernende }))
        .catch(() => !aus && setTreffer({ q, lernende: [] }))
    }, 180)
    return () => {
      aus = true
      window.clearTimeout(t)
    }
  }, [q, aktuell?.name])
  const klassenTreffer = useMemo(
    () => (q.length < 1 ? [] : klassen.filter((k) => klasseTrifft({ name: k.name, faecher: k.faecher.map((f) => f.fach) }, q))).slice(0, 8),
    [klassen, q]
  )
  const lernende = q.length >= SUCHE_MIN && treffer?.q === q ? treffer.lernende : []
  const laedt = q.length >= SUCHE_MIN && treffer?.q !== q
  const hier = (p: SuchTreffer): boolean => Boolean(aktuell) && p.gruppen.some((g) => suchForm(g.name) === suchForm(aktuell!.name))
  const hierListe = aktuell ? lernende.filter(hier) : []
  const andere = aktuell ? lernende.filter((p) => !hier(p)) : lernende
  const person = (p: SuchTreffer): React.JSX.Element => (
    <Combobox.Option value={`l:${p.id}`} key={`l:${p.id}`} data-such-person={p.name}>
      <Group gap={8} wrap="nowrap">
        <IconUser size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {p.name}
            <Text span size="xs" c="dimmed" fw={400}>
              {' '}
              · {p.klasse}
              {p.faecher.length ? ` · ${p.faecher.join(', ')}` : ''}
            </Text>
          </Text>
          {p.grund === 'stichwort' && p.probleme.length > 0 && (
            <Group gap={4} mt={2}>
              {p.probleme.map((a) => (
                <Badge key={a} size="xs" variant="light" color={a === 'inaktiv' ? 'gray' : a === 'schwach' ? 'red' : 'orange'} tt="none">
                  {PROBLEM_TEXT[a]}
                </Badge>
              ))}
            </Group>
          )}
        </div>
      </Group>
    </Combobox.Option>
  )
  const leer = !klassenTreffer.length && !lernende.length
  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-end"
      width={360}
      onOptionSubmit={(wert) => {
        combobox.closeDropdown()
        if (wert.startsWith('k:')) {
          const k = klassen.find((x) => x.schluessel === wert.slice(2))
          if (k) (setEingabe(''), klasseWaehlen(k))
          return
        }
        const p = lernende.find((x) => x.id === wert.slice(2))
        if (p) (setEingabe(''), personWaehlen(p))
      }}
    >
      <Combobox.Target>
        <TextInput
          size="sm"
          radius="md"
          w={240}
          maw="100%"
          leftSection={<IconSearch size={14} />}
          rightSection={eingabe ? <IconX size={14} style={{ cursor: 'pointer' }} onClick={() => setEingabe('')} aria-label="Suche leeren" /> : null}
          placeholder="Klasse, Name, „nicht geübt“ …"
          value={eingabe}
          onChange={(e) => {
            setEingabe(e.currentTarget.value)
            combobox.openDropdown()
            combobox.updateSelectedOptionIndex()
          }}
          onFocus={() => q && combobox.openDropdown()}
          onClick={() => q && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (combobox.closeDropdown(), e.currentTarget.blur())
          }}
          aria-label="Klassen und Lernende suchen"
          data-app-suche="klassen"
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={!q} data-klassen-suche-treffer>
        <Combobox.Options mah={420} style={{ overflowY: 'auto' }}>
          {hierListe.length > 0 && (
            <Combobox.Group label={`In dieser Klasse (${aktuell!.name})`} data-such-gruppe="hier">
              {hierListe.map(person)}
            </Combobox.Group>
          )}
          {andere.length > 0 && (
            <Combobox.Group label={aktuell ? 'Andere Klassen' : 'Lernende'} data-such-gruppe="andere">
              {andere.map(person)}
            </Combobox.Group>
          )}
          {klassenTreffer.length > 0 && (
            <Combobox.Group label="Klassen" data-such-gruppe="klassen">
              {klassenTreffer.map((k) => (
                <Combobox.Option value={`k:${k.schluessel}`} key={`k:${k.schluessel}`} data-such-klasse={k.name}>
                  <Group gap={8} wrap="nowrap">
                    <IconUsers size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                    <Text size="sm" fw={600} truncate>
                      {klassenName(k.name)}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {k.faecher.length ? ` · ${k.faecher.map((f) => f.fach).join(', ')}` : ''}
                      </Text>
                    </Text>
                  </Group>
                </Combobox.Option>
              ))}
            </Combobox.Group>
          )}
          {leer && <Combobox.Empty>{laedt ? 'Sucht …' : q.length < SUCHE_MIN ? 'Weiter tippen …' : 'Nichts gefunden.'}</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
