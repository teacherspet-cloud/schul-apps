/**
 * Vorschau für Lehrkräfte (24.10.2026, Wunsch der Lehrkraft): das Fenster geteilt – links die Sicht von Partner A,
 * rechts B, bei drei Partnern gedrittelt. Läuft rein im Browser mit den Funktionen aus shared/partnerarbeit/ablauf.ts
 * (Probegruppe A/B/C): Freischalten in einer Hälfte erscheint in der anderen, „Runde beenden"/„Weiter" funktionieren.
 * Genutzt in der App „Sprechprüfungen" (je Karte) und beim Vorbereiten in „Meine Klassen" (Zufallskarte der Auswahl).
 */
import { Badge, Group, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import type { SprechKarte } from '@shared/sprechen/karten'
import { zielNiveau, type Niveau, type SprechSprache } from '@shared/sprechen/niveaus'
import { gruppeStarten, probeGruppe, schrittAktion, sichtSchritt, type Karten } from '@shared/partnerarbeit/ablauf'
import { einstellungenBereinigt, type PaGruppe, type PaTeil } from '@shared/partnerarbeit/typen'
import { SchrittAnsicht } from './SchrittAnsicht'

const SYMBOLE = ['1F98A', '1F422', '1F427']
const bildUrl = (datei: string): string => `/server/sprech-bank/bild/${datei}`

/** Deterministische Zufallsfolge für die Vorschau (gleiche Karte → gleiche Rollen) */
const fest = (saat: number): (() => number) => {
  let n = saat || 1
  return () => ((n = (n * 9301 + 49297) % 233280), n / 233280)
}

export function PartnerVorschau({
  karten,
  sprache,
  jahrgang,
  teile,
  groesse: groesse0 = 2,
  uhr = false,
  niveau
}: {
  karten: SprechKarte[]
  sprache: SprechSprache
  jahrgang: number | null
  /** Reihenfolge der Teile (Standard: alle, für die es Karten gibt) */
  teile?: PaTeil[]
  groesse?: 2 | 3
  uhr?: boolean
  niveau?: Niveau
}): React.JSX.Element {
  const [groesse, setGroesse] = useState<2 | 3>(groesse0)
  const [saat, setSaat] = useState(1)
  const nivo = niveau ?? zielNiveau(sprache, jahrgang)
  const map: Karten = useMemo(() => new Map(karten.map((k) => [k.id, k])), [karten])
  const e = useMemo(
    () => einstellungenBereinigt({ teile: teile ?? ['interview', 'monolog', 'dialog'], uhr, gruppengroesse: groesse, ende: Date.now() + 3_600_000 }),
    [teile, uhr, groesse]
  )
  const [gruppe, setGruppe] = useState<PaGruppe>(() => gruppeStarten(probeGruppe(groesse), e, map, Date.now(), fest(saat)))
  // Neu aufsetzen, wenn Größe, Karten oder Saat wechseln
  const schluessel = `${groesse}|${saat}|${karten.map((k) => k.id).join(',')}|${(teile ?? []).join(',')}`
  const [alt, setAlt] = useState(schluessel)
  if (alt !== schluessel) {
    setAlt(schluessel)
    setGruppe(gruppeStarten(probeGruppe(groesse), e, map, Date.now(), fest(saat)))
  }
  const aktion = (wer: string) => (a: string, w?: unknown) => {
    if (a === 'rueckmeldung') {
      // In der Vorschau direkt weiter (Rückmeldungen gibt es nur live)
      const g = structuredClone(gruppe)
      schrittAktion(g, wer, 'weiter', {}, e, map, Date.now(), fest(saat + g.runde))
      setGruppe(g)
      return
    }
    const g = structuredClone(gruppe)
    const f = schrittAktion(g, wer, a, w, e, map, Date.now(), fest(saat + g.runde * 7 + (g.schritt?.unterrunde ?? 0)))
    if (!f) setGruppe(g)
  }
  const umfeld = { sprache, niveau: nivo, uhr, jetzt: Date.now() }
  const mitglieder = gruppe.mitglieder.map((id, i) => ({ symbol: SYMBOLE[i], ich: false, online: true, rolle: gruppe.schritt?.rollen[id] }))
  return (
    <Stack gap="sm" data-pa-vorschau={groesse}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            So sehen es die Lernenden – jede Spalte ein Gerät.
          </Text>
          <Badge variant="light" tt="none">
            Runde {gruppe.runde}
          </Badge>
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={String(groesse)}
            onChange={(v) => setGroesse(v === '3' ? 3 : 2)}
            data={[
              { value: '2', label: 'Zu zweit' },
              { value: '3', label: 'Zu dritt' }
            ]}
            data-pa-vorschau-groesse
          />
          <Text
            size="xs"
            c="dimmed"
            component="button"
            onClick={() => setSaat((x) => x + 1)}
            style={{ background: 'none', border: 0, cursor: 'pointer' }}
            data-pa-vorschau-neu
          >
            Andere Karte
          </Text>
        </Group>
      </Group>
      {!gruppe.schritt ? (
        <Text c="dimmed" data-pa-vorschau-leer>
          Für diese Auswahl gibt es keine passende Karte (Bildkarten brauchen ein Bild).
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, md: groesse }} spacing="md">
          {gruppe.mitglieder.map((id, i) => {
            const s = sichtSchritt(gruppe, id, map, umfeld, [])
            const dran = gruppe.schritt?.dran
            return (
              <Stack
                key={id}
                gap={4}
                style={{ borderLeft: `4px solid var(--mantine-color-${['violet', 'teal', 'orange'][i]}-5)`, paddingLeft: 10 }}
                data-pa-vorschau-spalte={['A', 'B', 'C'][i]}
              >
                <Text size="xs" fw={700} c="dimmed">
                  Gerät {['A', 'B', 'C'][i]}
                </Text>
                {s ? (
                  <SchrittAnsicht
                    s={s}
                    sprache={sprache}
                    jetzt={Date.now()}
                    aktion={aktion(id)}
                    bildUrl={bildUrl}
                    mitglieder={mitglieder.map((m, j) => ({ ...m, ich: j === i }))}
                    dranSymbol={dran && s.rolle === 'A' ? SYMBOLE[gruppe.mitglieder.indexOf(dran)] : undefined}
                    lehrkraft
                  />
                ) : null}
              </Stack>
            )
          })}
        </SimpleGrid>
      )}
    </Stack>
  )
}
