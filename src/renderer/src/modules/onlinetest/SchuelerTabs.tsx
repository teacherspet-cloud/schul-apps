/**
 * Untere Leiste im Schülerbereich auf dem Telefon (07.10.2026, abgestimmt mit der Lehrkraft nach Recherche:
 * Duolingo/Anton – große Symbol-Ziele unten im Daumenbereich): Start · Lernen · Aufgaben · Erfolge · Ich.
 *
 *  - „Aufgaben" öffnet ein Blatt von unten mit Tests, Arbeitsblättern, Aufgaben mit Feedback und Unterrichtsreihen,
 *    jeweils mit der Zahl der offenen; die Zahl aller offenen steht am Ziel.
 *  - „Ich" öffnet Einstellungen, Hell/Dunkel und Abmelden (vorher kleine Knöpfe oben rechts).
 *  - Im laufenden Onlinetest, beim Üben im Vokabel- und Grammatiktrainer und für Gäste gibt es die Leiste nicht
 *    (SchuelerBereich.tsx) – dort zählt der Fokus.
 * Die Ziele sind die vorhandenen Seiten (/s/…); nichts fällt weg.
 */
import { RekordKnopf } from './Rekorde'
import { Badge, Button, Drawer, Group, Indicator, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconBook2, IconChecklist, IconHome, IconLogout, IconSettings, IconTrophy, IconUser } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen } from './serverApi'
import { ModusKnopf } from './SchuelerEinstellungen'

/** Telefonbreite (wie shared/touch/touchModus.ts TELEFON) */
export const useSchuelerTelefon = (): boolean => useMediaQuery('(max-width: 700px)') ?? false

interface Offen {
  tests: number
  blaetter: number
  aufgaben: number
  reihen: number
}

/** Offene Arbeit je Bereich – dieselben Regeln wie die Startseite */
function useOffen(): Offen | null {
  const [offen, setOffen] = useState<Offen | null>(null)
  useEffect(() => {
    let weg = false
    const leer = <T,>(p: Promise<T>, f: T): Promise<T> => p.catch(() => f)
    void Promise.all([
      leer(holen<{ tests: { abgegeben?: boolean }[] }>('/s/api/tests'), { tests: [] }),
      leer(holen<{ blaetter: { offen?: boolean; genutzt: number; runden: number }[] }>('/s/api/blaetter'), { blaetter: [] }),
      leer(holen<{ aufgaben: { offen?: boolean; genutzt: number; runden: number }[] }>('/s/api/aufgaben'), { aufgaben: [] }),
      leer(holen<{ reihen: { fertig?: boolean }[] }>('/s/api/reihen'), { reihen: [] })
    ]).then(([t, b, a, r]) => {
      if (weg) return
      setOffen({
        tests: (t.tests ?? []).filter((x) => !x.abgegeben).length,
        blaetter: (b.blaetter ?? []).filter((x) => x.offen && x.genutzt < x.runden).length,
        aufgaben: (a.aufgaben ?? []).filter((x) => x.offen !== false && x.genutzt < x.runden).length,
        reihen: (r.reihen ?? []).filter((x) => !x.fertig).length
      })
    })
    return () => {
      weg = true
    }
  }, [])
  return offen
}

export default function SchuelerTabs({ abmelden }: { abmelden: () => void }): React.JSX.Element {
  const pfad = window.location.pathname
  const offen = useOffen()
  const [blatt, setBlatt] = useState<'aufgaben' | 'ich' | null>(null)
  const summe = offen ? offen.tests + offen.blaetter + offen.aufgaben + offen.reihen : 0
  const aktiv = (re: RegExp): boolean => re.test(pfad)
  const ziel = (name: string, symbol: React.ReactNode, an: boolean, wohin: string | (() => void), extra?: React.ReactNode): React.JSX.Element =>
    typeof wohin === 'string' ? (
      <a className="mobil-tab" href={wohin} data-aktiv={an} aria-label={name} data-schueler-tab={name}>
        {symbol}
        <span className="mobil-tab-name">{name}</span>
      </a>
    ) : (
      <button type="button" className="mobil-tab" data-aktiv={an} onClick={wohin} aria-label={name} data-schueler-tab={name}>
        {extra ?? symbol}
        <span className="mobil-tab-name">{name}</span>
      </button>
    )
  const eintrag = (name: string, href: string, zahl?: number): React.JSX.Element => (
    <Button key={href} component="a" href={href} variant="default" size="md" justify="space-between" rightSection={zahl ? <Badge>{zahl}</Badge> : undefined}>
      {name}
    </Button>
  )
  return (
    <>
      <nav className="mobil-tabs schueler-tabs" aria-label="Navigation" data-schueler-tabs>
        {ziel('Start', <IconHome size={24} />, pfad === '/s/' || pfad === '/s', '/s/')}
        {ziel('Lernen', <IconBook2 size={24} />, aktiv(/^\/s\/lernen/), '/s/lernen')}
        {ziel(
          'Aufgaben',
          <IconChecklist size={24} />,
          aktiv(/^\/s\/(tests|aufgaben|blaetter|reihen)/),
          () => setBlatt('aufgaben'),
          <Indicator disabled={!summe} label={summe} size={16} color="red" position="top-end">
            <IconChecklist size={24} />
          </Indicator>
        )}
        {ziel('Erfolge', <IconTrophy size={24} />, aktiv(/^\/s\/ergebnisse/), '/s/ergebnisse')}
        {ziel('Ich', <IconUser size={24} />, aktiv(/^\/s\/einstellungen/), () => setBlatt('ich'))}
      </nav>
      <Drawer
        opened={blatt === 'aufgaben'}
        onClose={() => setBlatt(null)}
        position="bottom"
        size="auto"
        title="Aufgaben"
        zIndex={300}
        styles={{ content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } }}
        data-schueler-blatt-aufgaben
      >
        <Stack gap="xs">
          {eintrag('Tests', '/s/tests', offen?.tests)}
          {eintrag('Arbeitsblätter', '/s/blaetter', offen?.blaetter)}
          {eintrag('Aufgaben mit Feedback', '/s/aufgaben', offen?.aufgaben)}
          {eintrag('Unterrichtsreihen', '/s/reihen', offen?.reihen)}
        </Stack>
      </Drawer>
      <Drawer
        opened={blatt === 'ich'}
        onClose={() => setBlatt(null)}
        position="bottom"
        size="auto"
        title="Ich"
        zIndex={300}
        styles={{ content: { borderRadius: '16px 16px 0 0', maxHeight: '85dvh' } }}
        data-schueler-blatt-ich
      >
        <Stack gap="xs">
          <RekordKnopf gross />
          <Button component="a" href="/s/einstellungen" variant="default" size="md" leftSection={<IconSettings size={18} />}>
            Einstellungen
          </Button>
          <Group gap="xs" wrap="nowrap">
            <ModusKnopf />
            <Text size="sm">Hell / Dunkel</Text>
          </Group>
          <Button variant="default" color="red" size="md" leftSection={<IconLogout size={18} />} onClick={abmelden} data-schueler-abmelden>
            Abmelden
          </Button>
        </Stack>
      </Drawer>
    </>
  )
}
