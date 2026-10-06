/**
 * Laufende Unterrichtsreihen (03.10.2026, Wunsch der Lehrkraft): „eine gut gestaltete Übersicht über
 * aktive Unterrichtsreihen seiner Lerngruppen für seine eigenen Fächer". Je Fach die offenen
 * Zuweisungen mit Fortschritt der Lerngruppe, Verteilung, Handlungsbedarf und Haltepunkten; oben
 * der gemeinsame Korrektur-Eingang. Ein Klick öffnet die Übersicht in der App „Unterrichtsreihe".
 */
import { ListenSuche } from '../../shared/components/AppSuche'
import { AppKopf } from '../../shared/components/AppKopf'
import { Badge, Button, Card, Center, Container, Group, Loader, Progress, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconFlag, IconRoute } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen } from '../onlinetest/serverApi'
import { openModule } from '../../shared/navigation'
import { fachFarbe as fachFarbeRoh } from '../../shared/fachfarben'
import { useAppSettings } from '../../shared/settingsStore'
import { Eingang, useReihenZiel } from './UnterrichtsreiheModule'

const fachFarbe = (f: string): string => fachFarbeRoh(f) ?? '#4c6ef5'

export interface LaufendeReihe {
  zid: string
  reiheId: string
  titel: string
  fach: string
  thema: string
  gruppe: string
  erstellt: string
  schritte: number
  lernende: number
  schnitt: number
  fertig: number
  begonnen: number
  verteilung: number[]
  bedarf: number
  bedarfArten: string[]
  halte: string[]
}

export const oeffneReihe = (zid: string): void => {
  useReihenZiel.getState().setze(zid)
  openModule('unterrichtsreihe')
}

export function useLaufendeReihen(active = true): { reihen: LaufendeReihe[] | null; laden: () => void } {
  const [reihen, setReihen] = useState<LaufendeReihe[] | null>(null)
  const laden = useCallback(
    () =>
      void holen<{ reihen: LaufendeReihe[] }>('/server/reihen/laufend').then(
        (d) => setReihen(d.reihen),
        () => setReihen([])
      ),
    []
  )
  useEffect(() => {
    if (!active) return
    laden()
    const t = setInterval(laden, 60_000)
    return () => clearInterval(t)
  }, [active, laden])
  return { reihen, laden }
}

const BEDARF_TEXT: Record<string, string> = {
  bewerten: 'Abgaben bestätigen',
  frage: 'Fragen beantworten',
  hilferuf: 'Hilferufe',
  hilfe: 'braucht Hilfe',
  praesenz: 'im Unterricht abhaken',
  halt: 'Haltepunkt',
  abweichung: 'Selbsteinschätzung weicht ab'
}

/** Eine Reihe als Karte – auch auf der Startseite */
export function ReiheKarte({ r }: { r: LaufendeReihe }): React.JSX.Element {
  const farbe = fachFarbe(r.fach)
  return (
    <Card withBorder padding="md" radius="md" style={{ borderTop: `4px solid ${farbe}` }} data-laufende-reihe={r.zid}>
      <Group justify="space-between" align="start" wrap="nowrap" mb={4}>
        <div style={{ minWidth: 0 }}>
          <Text fw={700} lineClamp={2}>
            {r.titel}
          </Text>
          <Text size="xs" c="dimmed">
            {r.gruppe} · {r.fach}
            {r.thema ? ` · ${r.thema}` : ''}
          </Text>
        </div>
        {r.bedarf > 0 && (
          <Tooltip label={r.bedarfArten.map((a) => BEDARF_TEXT[a] ?? a).join(' · ')}>
            <Badge color="red" leftSection={<IconAlertCircle size={12} />}>
              {r.bedarf}
            </Badge>
          </Tooltip>
        )}
      </Group>
      <Group justify="space-between" mb={4}>
        <Text size="sm">{Math.round(r.schnitt * 100)} % im Schnitt</Text>
        <Text size="xs" c="dimmed">
          {r.begonnen}/{r.lernende} begonnen · {r.fertig} fertig
        </Text>
      </Group>
      <Progress value={r.schnitt * 100} color={farbe} size="lg" radius="xl" mb={8} />
      {/* Verteilung: wie viele Lernende in welchem Viertel des Weges sind */}
      <Group gap={4} align="end" h={34} mb={6} wrap="nowrap" aria-label="Verteilung der Lernenden auf dem Weg">
        {r.verteilung.map((n, k) => (
          <Tooltip key={k} label={`${n} Lernende bei ${k * 25}–${k * 25 + 25} %`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'end', height: '100%' }}>
              <div
                style={{
                  height: `${r.lernende ? Math.max(4, (n / r.lernende) * 100) : 4}%`,
                  background: farbe,
                  opacity: 0.35 + k * 0.2,
                  borderRadius: 3
                }}
              />
            </div>
          </Tooltip>
        ))}
      </Group>
      {r.halte.length > 0 && (
        <Text size="xs" c="dimmed" mb={6}>
          <IconFlag size={12} /> Haltepunkt{r.halte.length > 1 ? 'e' : ''}: {r.halte.slice(0, 2).join(', ')}
        </Text>
      )}
      <Button size="xs" variant="light" rightSection={<IconArrowRight size={14} />} onClick={() => oeffneReihe(r.zid)} data-reihe-oeffnen-uebersicht>
        Übersicht öffnen
      </Button>
    </Card>
  )
}

export default function LaufendeReihenModule({ active }: { active: boolean }): React.JSX.Element {
  const { reihen } = useLaufendeReihen(active)
  // Rohwert wählen und erst danach ergänzen – ein neues [] im Wähler ließe React endlos neu zeichnen
  const eigeneRoh = useAppSettings((s) => s.settings.eigeneFaecher)
  const eigene = eigeneRoh ?? []
  const [suche, setSuche] = useState('')
  if (!reihen)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  const q = suche.trim().toLowerCase()
  const gefunden = reihen.filter((r) => !q || `${r.titel} ${r.thema} ${r.gruppe} ${r.fach}`.toLowerCase().includes(q))
  const faecher = [...new Set(gefunden.map((r) => r.fach || 'Ohne Fach'))].sort(
    (a, b) =>
      Number(eigene.some((e) => e.toLowerCase() === b.toLowerCase())) - Number(eigene.some((e) => e.toLowerCase() === a.toLowerCase())) ||
      a.localeCompare(b, 'de')
  )
  return (
    <Container size="xl" py="lg" data-laufende-reihen>
      {/* Gemeinsamer Kopf (Phase 6a) */}
      <AppKopf
        beschreibung={
          reihen.length
            ? `${reihen.length} Reihe${reihen.length > 1 ? 'n' : ''} in Arbeit – Fortschritt und Handlungsbedarf je Lerngruppe.`
            : 'Gerade läuft keine Reihe.'
        }
        neu={{ label: 'Reihen planen', onClick: () => openModule('unterrichtsreihe'), kennung: 'laufendereihen', icon: <IconRoute size={16} /> }}
        suche={<ListenSuche wert={suche} setzen={setSuche} platzhalter="Reihe, Thema, Lerngruppe …" />}
      />
      <Stack gap="lg">
        <Eingang oeffnen={oeffneReihe} />
        {faecher.map((f) => (
          <div key={f}>
            <Text fw={700} mb={6} style={{ color: fachFarbe(f) }}>
              {f}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {gefunden
                .filter((r) => (r.fach || 'Ohne Fach') === f)
                .map((r) => (
                  <ReiheKarte key={r.zid} r={r} />
                ))}
            </SimpleGrid>
          </div>
        ))}
      </Stack>
    </Container>
  )
}
