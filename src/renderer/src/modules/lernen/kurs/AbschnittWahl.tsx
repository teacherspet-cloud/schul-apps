/**
 * Abschnitte eines Bands für einen Kurs wählen (10.10.2026, Wunsch der Lehrkraft: „Vokabeln hinzufügen" klarer und
 * einfacher): Band-Kopf mit Cover → Units (aufklappbar, nur die vorgeschlagene offen) → Abschnitte mit Häkchen und
 * Wortzahl. Schon für den GANZEN Kurs Freigegebenes ist ausgeblendet („Bereits freigegebene zeigen (n)"); Einzel-
 * Freigaben (nur für einzelne Lernende) bleiben sichtbar, mit Hinweis. Der nächste Abschnitt nach dem letzten
 * freigegebenen steht als „Vorschlag: als Nächstes" offen im Bild. Regeln: shared/lehrwerkVorwahl.ts `bandStand`.
 */
import { Badge, Checkbox, Collapse, Group, Stack, Switch, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { abschnittSchluessel, bandStand, type VorwahlDaten } from '@shared/lehrwerkVorwahl'

/** Kennung eines Abschnitts in der Auswahl: Unit und Abschnitt (Abschnittsnamen wiederholen sich je Unit) */
export const TRENNER = '\u0001'
export const abschnittKey = (unit: string, abschnitt: string): string => `${unit}${TRENNER}${abschnitt}`

interface Band {
  id: string
  name: string
  units: { name: string; sections: { name: string; entries: { term: string; translation: string; explained?: boolean }[] }[] }[]
}

/** Wörter eines Abschnitts, wie sie freigegeben werden (ohne erklärte Einträge) */
export const woerterIn = (s: Band['units'][number]['sections'][number]): number => s.entries.filter((e) => !e.explained && e.term && e.translation).length

/** Was der Dialog zeigt: sichtbare Units/Abschnitte, Zahl der ausgeblendeten, Vorschlag (rein rechnend, für Tests) */
export function abschnittAnsicht(
  buch: Band,
  vorwahl: Pick<VorwahlDaten, 'freigegeben' | 'einzeln' | 'kursLehrwerk' | 'kursUnits'> | null,
  freiZeigen: boolean
): {
  units: { name: string; abschnitte: { name: string; woerter: number; frei: boolean; einzeln: number; vorschlag: boolean }[] }[]
  versteckt: number
  vorschlag: { unit: string; abschnitt: string } | null
} {
  const st = vorwahl ? bandStand(buch, vorwahl) : { frei: new Set<string>(), einzeln: new Map<string, number>(), naechster: null }
  let versteckt = 0
  const units = buch.units
    .map((u) => ({
      name: u.name,
      abschnitte: u.sections
        .map((s) => {
          const k = abschnittSchluessel(u.name, s.name)
          const frei = st.frei.has(k)
          if (frei) versteckt++
          return {
            name: s.name,
            woerter: woerterIn(s),
            frei,
            einzeln: st.einzeln.get(k) ?? 0,
            vorschlag: Boolean(st.naechster && st.naechster.unit === u.name && st.naechster.abschnitt === s.name)
          }
        })
        .filter((a) => freiZeigen || !a.frei)
    }))
    .filter((u) => u.abschnitte.length)
  return { units, versteckt, vorschlag: st.naechster }
}

export function AbschnittWahl({
  buch,
  vorwahl,
  abschnitte,
  setAbschnitte
}: {
  buch: Band
  vorwahl: VorwahlDaten | null
  abschnitte: string[]
  setAbschnitte: (a: string[]) => void
}): React.JSX.Element {
  const [freiZeigen, setFreiZeigen] = useState(false)
  const ansicht = useMemo(() => abschnittAnsicht(buch, vorwahl, freiZeigen), [buch, vorwahl, freiZeigen])
  // Offen: die Unit des Vorschlags, sonst die erste mit noch nicht Freigegebenem
  const startOffen = ansicht.vorschlag?.unit ?? ansicht.units[0]?.name ?? ''
  const [umgeschaltet, setUmgeschaltet] = useState<Set<string>>(new Set())
  const offen = (u: string): boolean => (u === startOffen) !== umgeschaltet.has(u)
  const vorschlagRef = useRef<HTMLDivElement>(null)
  // Zum Vorschlag springen (einmal je Band)
  useEffect(() => {
    const t = window.setTimeout(() => vorschlagRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150)
    return () => window.clearTimeout(t)
  }, [buch.id])
  const umschalten = (k: string): void => setAbschnitte(abschnitte.includes(k) ? abschnitte.filter((x) => x !== k) : [...abschnitte, k])
  return (
    <Stack gap={6} data-abschnitt-wahl={buch.name}>
      {(ansicht.versteckt > 0 || freiZeigen) && (
        <Switch
          size="xs"
          label={`Bereits freigegebene zeigen (${ansicht.versteckt})`}
          checked={freiZeigen}
          onChange={(e) => setFreiZeigen(e.currentTarget.checked)}
          data-frei-zeigen={ansicht.versteckt}
        />
      )}
      {!ansicht.units.length && (
        <Text size="sm" c="dimmed">
          Alle Abschnitte dieses Bands sind schon freigegeben.
        </Text>
      )}
      {ansicht.units.map((u) => {
        const auf = offen(u.name)
        const gewaehlt = u.abschnitte.filter((a) => abschnitte.includes(abschnittKey(u.name, a.name))).length
        const vorschlagHier = u.abschnitte.some((a) => a.vorschlag)
        return (
          <div key={u.name} data-wahl-unit={u.name} data-offen={auf || undefined} ref={vorschlagHier ? vorschlagRef : undefined}>
            <UnstyledButton
              w="100%"
              onClick={() =>
                setUmgeschaltet((s) => {
                  const n = new Set(s)
                  if (n.has(u.name)) n.delete(u.name)
                  else n.add(u.name)
                  return n
                })
              }
              aria-expanded={auf}
              data-wahl-unit-kopf
              style={{ padding: '6px 4px', borderRadius: 6 }}
            >
              <Group gap={6} wrap="nowrap">
                {auf ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="sm" fw={600} style={{ flex: 1 }} truncate>
                  {u.name}
                </Text>
                {vorschlagHier && !auf && (
                  <Badge size="xs" color="grape" variant="light" tt="none">
                    Vorschlag
                  </Badge>
                )}
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {gewaehlt ? `${gewaehlt} gewählt · ` : ''}
                  {u.abschnitte.length} {u.abschnitte.length === 1 ? 'Abschnitt' : 'Abschnitte'}
                </Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={auf}>
              <Stack gap={2} pl={24} pb={4}>
                {u.abschnitte.map((a) => {
                  const k = abschnittKey(u.name, a.name)
                  return (
                    <Group
                      key={k}
                      gap={8}
                      wrap="nowrap"
                      py={4}
                      data-wahl-abschnitt={a.name}
                      data-frei={a.frei || undefined}
                      data-vorschlag={a.vorschlag || undefined}
                      data-einzeln={a.einzeln || undefined}
                    >
                      <Checkbox
                        checked={abschnitte.includes(k)}
                        onChange={() => umschalten(k)}
                        label={
                          <Group gap={6} wrap="wrap">
                            <Text size="sm" span opacity={a.frei ? 0.6 : 1}>
                              {a.name}
                            </Text>
                            {a.vorschlag && (
                              <Badge size="xs" color="grape" tt="none">
                                Vorschlag: als Nächstes
                              </Badge>
                            )}
                            {a.frei && (
                              <Badge size="xs" color="gray" variant="light" tt="none">
                                bereits freigegeben
                              </Badge>
                            )}
                            {a.einzeln > 0 && (
                              <Badge size="xs" color="yellow" variant="light" tt="none">
                                für {a.einzeln} {a.einzeln === 1 ? 'Lernende/n' : 'Lernende'} schon freigegeben
                              </Badge>
                            )}
                          </Group>
                        }
                        aria-label={`${u.name} · ${a.name}`}
                        data-wahl-haken={a.name}
                        styles={{ body: { alignItems: 'center' } }}
                      />
                      <Text size="xs" c="dimmed" ml="auto" style={{ flexShrink: 0 }}>
                        {a.woerter} Wörter
                      </Text>
                    </Group>
                  )
                })}
              </Stack>
            </Collapse>
          </div>
        )
      })}
    </Stack>
  )
}
