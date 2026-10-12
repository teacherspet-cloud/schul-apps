/**
 * Kopf der Startseite (12.10.2026, abgestimmt mit der Lehrkraft: „Begrüßung + Tagesleiste"): große Tagesbegrüßung
 * (unpersönlich), Wochentag und Datum im sanften Farbverlauf der Akzentfarbe, rechts das Programmbild „startseite";
 * darunter – am Server – kleine Kacheln „Heute": nächster Termin, offene Freigaben/Rückmeldungen, Kurse mit
 * Problemwörtern, laufende Onlinetests. Ein Klick öffnet den passenden Kasten weiter unten und springt dorthin.
 */
import { Box, Group, Image, Paper, SimpleGrid, Text, Title, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconCalendarEvent, IconPlayerPlay, IconSend } from '@tabler/icons-react'
import { useEffect } from 'react'
import { demnaechst, tagKurz } from '@shared/startseiteKurse'
import { aufServer } from '../shared/plattform'
import { startKarten } from '../shared/programmSichtbarkeit'
import { useKopfDaten } from './kopfDaten'
import { useSichtbareProgramme } from './programme'
import { startKastenId } from './StartAnzahl'

const bilder = import.meta.glob('../assets/programme/startseite.webp', { eager: true, import: 'default' }) as Record<string, string>
const BILD = Object.values(bilder)[0]

/** „Guten Morgen" bis 11 Uhr, „Guten Tag" bis 17 Uhr, sonst „Guten Abend" */
export function begruessung(d = new Date()): string {
  const h = d.getHours()
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : 'Guten Abend'
}

/** Kasten weiter unten öffnen (falls zu) und hinscrollen */
function zumKasten(karte: string): void {
  const el = document.querySelector<HTMLElement>(`[data-klappkarte="${startKastenId(karte)}"]`)
  if (!el) return
  if (el.getAttribute('data-offen') !== 'true') el.querySelector<HTMLElement>('[data-klappkopf]')?.click()
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

interface Kachel {
  id: string
  karte: string
  icon: React.ReactNode
  farbe: string
  wert: string
  text: string
}

function HeuteKachel({ k }: { k: Kachel }): React.JSX.Element {
  return (
    <UnstyledButton onClick={() => zumKasten(k.karte)} data-start-heute={k.id} style={{ display: 'block' }}>
      <Paper
        radius="md"
        p="sm"
        withBorder
        style={{ background: 'var(--mantine-color-body)', height: '100%', transition: 'transform 120ms ease, box-shadow 120ms ease' }}
        className="start-heute-kachel"
      >
        <Group gap="sm" wrap="nowrap" align="center">
          <Box
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              background: `var(--mantine-color-${k.farbe}-light)`,
              color: `var(--mantine-color-${k.farbe}-light-color)`
            }}
          >
            {k.icon}
          </Box>
          <div style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" lh={1.2} truncate>
              {k.wert}
            </Text>
            <Text size="xs" c="dimmed" lh={1.25} truncate>
              {k.text}
            </Text>
          </div>
        </Group>
      </Paper>
    </UnstyledButton>
  )
}

export default function StartBegruessung({ zusaetze }: { zusaetze?: React.ReactNode }): React.JSX.Element {
  const server = aufServer()
  const { reihen, blaetter, tests, rueck, start } = useKopfDaten()
  const ids = useSichtbareProgramme().map((m) => m.id)
  const karten = startKarten(ids)
  useEffect(() => {
    if (server) void useKopfDaten.getState().laden()
  }, [server])
  const jetzt = Date.now()
  const heute = new Date()
  const datum = heute.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  const kacheln: Kachel[] = []
  if (server) {
    const kurse = karten.termine === 'voll' ? (start?.kurse ?? []) : []
    if (karten.termine) {
      const bald = demnaechst(kurse, reihen ?? [], jetzt, karten.tests ? (tests ?? []) : [])
      const erster = bald[0]
      kacheln.push({
        id: 'termin',
        karte: 'termine',
        icon: <IconCalendarEvent size={18} />,
        farbe: 'blue',
        wert: erster ? `${erster.tag ? tagKurz(erster.tag) : 'offen'}: ${erster.text}` : 'Nichts geplant',
        text: bald.length > 1 ? `und ${bald.length - 1} weitere Termine` : 'Nächster Termin'
      })
    }
    if (karten.freigaben) {
      const n =
        (ids.includes('freigaben') ? (blaetter ?? []).filter((b) => b.status === 'offen').length : 0) +
        (ids.includes('rueckmeldung') ? (rueck ?? []).filter((r) => r.status === 'offen' && !r.art).length : 0)
      kacheln.push({ id: 'freigaben', karte: 'freigaben', icon: <IconSend size={18} />, farbe: 'teal', wert: String(n), text: n === 1 ? 'offene Freigabe' : 'offene Freigaben' })
    }
    if (karten.termine === 'voll') {
      const n = kurse.filter((k) => k.abzeichen.art === 'problem').length
      kacheln.push({
        id: 'problem',
        karte: 'termine',
        icon: <IconAlertTriangle size={18} />,
        farbe: n ? 'orange' : 'gray',
        wert: String(n),
        text: n === 1 ? 'Kurs mit Problemwörtern' : 'Kurse mit Problemwörtern'
      })
    }
    if (karten.tests) {
      const laufend = (tests ?? []).filter((t) => t.status === 'offen').length
      const pruefen = (tests ?? []).filter((t) => t.status === 'beendet' && (t.offen > 0 || t.zuEntscheiden > 0)).length
      kacheln.push({
        id: 'tests',
        karte: 'tests',
        icon: <IconPlayerPlay size={18} />,
        farbe: laufend ? 'green' : 'gray',
        wert: String(laufend),
        text: `${laufend === 1 ? 'Onlinetest läuft' : 'Onlinetests laufen'}${pruefen ? ` · ${pruefen} zu prüfen` : ''}`
      })
    }
  }

  return (
    <Paper
      radius="lg"
      p={{ base: 'md', sm: 'xl' }}
      mb="lg"
      withBorder
      data-start-begruessung
      style={{
        background: 'linear-gradient(135deg, var(--mantine-primary-color-light) 0%, var(--mantine-color-body) 78%)',
        overflow: 'hidden'
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Title order={1} fz={{ base: 26, sm: 34 }} lh={1.15} data-start-gruss>
            {begruessung(heute)}
          </Title>
          <Text size="md" c="dimmed" mt={4}>
            {datum} · Was heute ansteht
          </Text>
          {zusaetze && (
            <Group gap="xs" mt="sm">
              {zusaetze}
            </Group>
          )}
        </div>
        {BILD && <Image src={BILD} alt="" w={{ base: 64, sm: 104 }} h={{ base: 64, sm: 104 }} fit="contain" style={{ flexShrink: 0 }} />}
      </Group>
      {kacheln.length > 0 && (
        <SimpleGrid cols={{ base: 1, xs: 2, md: Math.min(4, kacheln.length) }} spacing="sm" mt="lg" data-start-heute-leiste>
          {kacheln.map((k) => (
            <HeuteKachel key={k.id} k={k} />
          ))}
        </SimpleGrid>
      )}
    </Paper>
  )
}
