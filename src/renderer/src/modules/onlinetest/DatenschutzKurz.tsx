import { Anchor, Button, Group, List, Modal, Stack, Text, Title } from '@mantine/core'
import { IconShieldLock } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { KURZFASSUNG_SCHUELER, kurzfassungVersion, kurzfassungZeigen } from '@shared/datenschutzInfo'
import { holen, senden } from './serverApi'

/**
 * Datenschutz kurz erklärt (22.10.2026, Prüfung des Schulträgers, Art. 13 DSGVO): Kurzfassung für Lernende, einmal beim
 * ersten Anmelden bzw. nach dem Beitritt als Gast – und wieder, wenn sich der Text ändert (Fassung aus
 * shared/datenschutzInfo.ts). „Verstanden" ist eine Kenntnisnahme, KEINE Einwilligung; gemerkt am Konto bzw. Gastkonto
 * (src/server/datenschutzSeiten.ts). Nicht im laufenden Onlinetest, nicht in der Vorschau der Lehrkraft, nicht in
 * Browsertests (außer mit localStorage 'schulapps-e2e-datenschutz' = '1').
 * Über den Link „Datenschutz kurz" unten auf jeder Seite lässt sie sich jederzeit wieder öffnen.
 */
const EREIGNIS = 'schulapps-datenschutz-kurz'

/** Kurzfassung ausdrücklich öffnen (Link unten auf der Seite) */
export const datenschutzKurzOeffnen = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(EREIGNIS))
  } catch {
    /* ohne Fenster */
  }
}

function automatisierung(): { automatisiert: boolean; e2e: boolean } {
  let e2e = false
  try {
    e2e = localStorage.getItem('schulapps-e2e-datenschutz') === '1'
  } catch {
    /* gesperrt */
  }
  return { automatisiert: typeof navigator !== 'undefined' && navigator.webdriver === true, e2e }
}

interface KurzAntwort {
  version: string
  saetze: string[]
  bestaetigt: string | null
}

export function DatenschutzKurz({ pfad }: { pfad: string }): React.JSX.Element | null {
  const ich = window.__schulappsServer
  const [stand, setStand] = useState<KurzAntwort | null | undefined>(undefined)
  const [zu, setZu] = useState(false)
  const [offen, setOffen] = useState(false)
  const angemeldet = Boolean(ich?.angemeldet)

  useEffect(() => {
    if (!angemeldet) return
    void holen<KurzAntwort>('/s/api/datenschutz/kurz').then(setStand, () => setStand(null))
  }, [angemeldet])
  useEffect(() => {
    const auf = (): void => setOffen(true)
    window.addEventListener(EREIGNIS, auf)
    return () => window.removeEventListener(EREIGNIS, auf)
  }, [])

  const aktuell = stand?.version ?? kurzfassungVersion()
  const vonSelbst =
    !zu && stand !== undefined && kurzfassungZeigen({ ich, pfad, bestaetigt: stand === null ? undefined : stand.bestaetigt, aktuell, ...automatisierung() })
  if (!offen && !vonSelbst) return null
  const saetze = stand?.saetze?.length ? stand.saetze : KURZFASSUNG_SCHUELER

  const verstanden = (): void => {
    setZu(true)
    setOffen(false)
    if (angemeldet && stand && stand.bestaetigt !== aktuell)
      void senden('/s/api/datenschutz/kurz', { version: aktuell })
        .then(() => setStand((s) => (s ? { ...s, bestaetigt: aktuell } : s)))
        .catch(() => undefined)
  }

  return (
    <Modal
      opened
      onClose={verstanden}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      radius="lg"
      size="md"
      // Über dem Willkommens-Assistenten
      zIndex={400}
      data-datenschutz-kurz
    >
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <IconShieldLock size={26} aria-hidden />
          <Title order={3}>Deine Daten bei Schul-Apps</Title>
        </Group>
        <List spacing={6} size="sm">
          {saetze.map((s, i) => (
            <List.Item key={i}>{s}</List.Item>
          ))}
        </List>
        <Text size="xs" c="dimmed">
          Das ist eine Information für dich. Du musst nichts erlauben.{' '}
          <Anchor href="/datenschutz" target="_blank" rel="noopener" size="xs">
            Datenschutzerklärung
          </Anchor>
          {' · '}
          <Anchor href="/datenschutz/eltern" target="_blank" rel="noopener" size="xs">
            Für deine Eltern
          </Anchor>
        </Text>
        <Button size="md" radius="xl" onClick={verstanden} data-datenschutz-verstanden>
          Verstanden
        </Button>
      </Stack>
    </Modal>
  )
}

/** Kleine Zeile unten im Schülerbereich: Kurzfassung, Datenschutzerklärung, Impressum */
export function DatenschutzFuss(): React.JSX.Element {
  return (
    <Group justify="center" gap="xs" mt="xl" mb="xs" data-datenschutz-fuss>
      <Anchor component="button" type="button" size="xs" c="dimmed" onClick={datenschutzKurzOeffnen}>
        Datenschutz kurz
      </Anchor>
      <Text size="xs" c="dimmed">
        ·
      </Text>
      <Anchor href="/datenschutz" target="_blank" rel="noopener" size="xs" c="dimmed">
        Datenschutzerklärung
      </Anchor>
      <Text size="xs" c="dimmed">
        ·
      </Text>
      <Anchor href="/impressum" target="_blank" rel="noopener" size="xs" c="dimmed">
        Impressum
      </Anchor>
    </Group>
  )
}
