import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Button,
  Card,
  ColorSwatch,
  Group,
  MantineProvider,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  useComputedColorScheme
} from '@mantine/core'
import { IconArrowLeft, IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { create } from 'zustand'
import { holen, senden } from './serverApi'
import { PasswortAendern } from '../../shared/PasswortAendern'

/**
 * Einstellungen der Lernenden (03.10.2026): Darstellung (Modus, Schriftgröße, Farbe, ruhige
 * Darstellung) und Passwort. Die Darstellung hängt am Konto (Server) und folgt so auf jedes
 * Gerät; im Browser liegt eine Kopie, damit die Seite sofort richtig aussieht.
 */
export interface Darstellung {
  modus: 'hell' | 'dunkel' | 'auto'
  schrift: 'normal' | 'gross' | 'sehrgross'
  farbe: 'blue' | 'teal' | 'grape' | 'orange' | 'pink' | 'green'
  ruhig: boolean
  /** Lernbereiche (Vokabeltraining): Farbe des Fachs wie im Kopfband der Arbeitsblätter, oder die eigene Farbe */
  design: 'fach' | 'eigen'
  /** Dunkel als Vorgabe übernommen (05.10.2026) – fehlt sie, wird „automatisch" einmalig zu „dunkel" */
  dunkelVorgabe?: boolean
}

/** Dunkel als Vorgabe (05.10.2026): ältere gespeicherte Darstellung mit „automatisch" einmalig auf „dunkel" */
const mitDunkelVorgabe = (d: Darstellung): Darstellung => (d.dunkelVorgabe ? d : { ...d, modus: d.modus === 'auto' ? 'dunkel' : d.modus, dunkelVorgabe: true })

const VORGABE: Darstellung = { modus: 'dunkel', schrift: 'normal', farbe: 'blue', ruhig: false, design: 'fach', dunkelVorgabe: true }
const SPEICHER = 'schulapps-darstellung'

const ausSpeicher = (): Darstellung => {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Partial<Darstellung>
    return mitDunkelVorgabe({ ...VORGABE, dunkelVorgabe: false, ...roh, ...(Object.keys(roh).length ? {} : { dunkelVorgabe: true }) })
  } catch {
    return VORGABE
  }
}

export const useDarstellung = create<{ d: Darstellung; setze: (d: Darstellung) => void }>((set) => ({
  d: ausSpeicher(),
  setze: (d) => {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(d))
    } catch {
      /* privates Fenster: dann nur für diese Sitzung */
    }
    set({ d })
  }
}))

const mitKonto = (): boolean => {
  const ich = window.__schulappsServer
  return Boolean(ich?.angemeldet && ich.quelle !== 'gast')
}

const dunkelImSystem = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true

/** Rahmen des Schülerbereichs: Mantine mit der gewählten Darstellung */
export function SchuelerRahmen({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const [systemDunkel, setSystemDunkel] = useState(dunkelImSystem)
  useEffect(() => {
    if (mitKonto())
      void holen<{ darstellung: Darstellung | null }>('/s/api/darstellung').then(
        (r) => r.darstellung && setze(mitDunkelVorgabe({ ...VORGABE, dunkelVorgabe: false, ...r.darstellung })),
        () => undefined
      )
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const neu = (): void => setSystemDunkel(dunkelImSystem())
    mq?.addEventListener('change', neu)
    return () => mq?.removeEventListener('change', neu)
  }, [setze])
  // Der frühe Hintergrund aus /server/ich.js hat seinen Dienst getan – ab jetzt bestimmt die Darstellung
  useEffect(() => document.getElementById('sa-frueh')?.remove(), [])
  useEffect(() => {
    document.documentElement.style.fontSize = d.schrift === 'gross' ? '112.5%' : d.schrift === 'sehrgross' ? '125%' : ''
    document.documentElement.classList.toggle('sa-ruhig', d.ruhig)
  }, [d.schrift, d.ruhig])
  const schema = d.modus === 'auto' ? (systemDunkel ? 'dark' : 'light') : d.modus === 'dunkel' ? 'dark' : 'light'
  return (
    <MantineProvider theme={{ primaryColor: d.farbe, autoContrast: true }} forceColorScheme={schema}>
      {children}
    </MantineProvider>
  )
}

const FARBEN: { wert: Darstellung['farbe']; name: string }[] = [
  { wert: 'blue', name: 'Blau' },
  { wert: 'teal', name: 'Türkis' },
  { wert: 'green', name: 'Grün' },
  { wert: 'grape', name: 'Lila' },
  { wert: 'pink', name: 'Pink' },
  { wert: 'orange', name: 'Orange' }
]

/**
 * Schneller Wechsel Hell/Dunkel in der Kopfzeile (03.10.2026, Wunsch der Lehrkraft: „auch Schüler in den
 * Darkmode wechseln können") – für Lernende mit Konto und für Gäste.
 */
export function ModusKnopf(): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const dunkel = useComputedColorScheme('light') === 'dark'
  const umschalten = (): void => {
    const neu: Darstellung = { ...d, modus: dunkel ? 'hell' : 'dunkel' }
    setze(neu)
    if (mitKonto()) void senden('/s/api/darstellung', neu).catch(() => undefined)
  }
  return (
    <Tooltip label={dunkel ? 'Hell' : 'Dunkel'}>
      <ActionIcon variant="subtle" size="lg" onClick={umschalten} aria-label={dunkel ? 'Helle Darstellung' : 'Dunkle Darstellung'} data-modus-knopf>
        {dunkel ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}

/** /s/einstellungen */
export function SchuelerEinstellungen(): React.JSX.Element {
  const { d, setze } = useDarstellung()
  const [gespeichert, setGespeichert] = useState(false)
  const aendern = (teil: Partial<Darstellung>): void => {
    const neu = { ...d, ...teil }
    setze(neu)
    setGespeichert(false)
    // Gäste (per QR-Code): nur auf diesem Gerät, kein Konto zum Speichern
    if (!mitKonto()) return
    void senden('/s/api/darstellung', neu).then(
      () => setGespeichert(true),
      () => undefined
    )
  }
  return (
    <Stack gap="lg" data-schueler-einstellungen>
      <Button variant="subtle" component="a" href="/s/" w="fit-content" leftSection={<IconArrowLeft size={16} />} px={4}>
        Startseite
      </Button>
      <Title order={2}>Einstellungen</Title>
      <Card withBorder padding="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>Darstellung</Title>
          {gespeichert && (
            <Text size="xs" c="dimmed">
              <IconCheck size={12} /> gespeichert – gilt auf allen deinen Geräten
            </Text>
          )}
        </Group>
        <Stack gap="md">
          <div>
            <Text size="sm" fw={500} mb={4}>
              Modus
            </Text>
            <SegmentedControl
              fullWidth
              value={d.modus}
              onChange={(v) => aendern({ modus: v as Darstellung['modus'] })}
              data={[
                { value: 'hell', label: <Modus icon={<IconSun size={16} />} text="Hell" /> },
                { value: 'dunkel', label: <Modus icon={<IconMoon size={16} />} text="Dunkel" /> },
                { value: 'auto', label: <Modus icon={<IconDeviceDesktop size={16} />} text="Wie das Gerät" /> }
              ]}
              data-modus
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Schriftgröße
            </Text>
            <SegmentedControl
              fullWidth
              value={d.schrift}
              onChange={(v) => aendern({ schrift: v as Darstellung['schrift'] })}
              data={[
                { value: 'normal', label: 'Normal' },
                { value: 'gross', label: 'Groß' },
                { value: 'sehrgross', label: 'Sehr groß' }
              ]}
              data-schrift
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Farben im Vokabeltraining
            </Text>
            <SegmentedControl
              fullWidth
              value={d.design}
              onChange={(v) => aendern({ design: v as Darstellung['design'] })}
              data={[
                { value: 'fach', label: 'Farbe des Fachs' },
                { value: 'eigen', label: 'Meine Farbe' }
              ]}
              data-design
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={6}>
              Farbe
            </Text>
            <Group gap="sm">
              {FARBEN.map((f) => (
                <ColorSwatch
                  key={f.wert}
                  component="button"
                  type="button"
                  color={`var(--mantine-color-${f.wert}-6)`}
                  size={36}
                  onClick={() => aendern({ farbe: f.wert })}
                  aria-label={f.name}
                  title={f.name}
                  style={{ cursor: 'pointer', outline: d.farbe === f.wert ? '3px solid var(--mantine-color-text)' : undefined, outlineOffset: 2 }}
                  data-farbe={f.wert}
                >
                  {d.farbe === f.wert && <IconCheck size={18} color="white" />}
                </ColorSwatch>
              ))}
            </Group>
          </div>
          <Switch
            checked={d.ruhig}
            onChange={(e) => aendern({ ruhig: e.currentTarget.checked })}
            label="Ruhige Darstellung"
            description="Ohne Animationen – zum Beispiel ohne aufschwingende Türen und umblätternde Seiten."
          />
        </Stack>
      </Card>
      {mitKonto() && (
        <Card withBorder padding="lg" radius="md">
          <Title order={4} mb="md">
            Passwort
          </Title>
          <PasswortAendern />
        </Card>
      )}
    </Stack>
  )
}

function Modus({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <Group gap={6} justify="center" wrap="nowrap">
      {icon}
      <span>{text}</span>
    </Group>
  )
}
