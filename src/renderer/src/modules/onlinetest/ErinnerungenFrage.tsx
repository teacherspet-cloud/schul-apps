import { useEffect, useState } from 'react'
import { Anchor, Button, Group, Paper, Text } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import type { ErinnerungsWahl } from '@shared/erinnerungen'
import { holen, senden } from './serverApi'
import { geraetAnmelden, pushUnterstuetzung, vorhandeneAnmeldung } from './erinnerungenGeraet'

/**
 * Einmalige, freundliche Frage auf der Schüler-Startseite (10.10.2026, Entscheidung der Lehrkraft: Erinnerungen sind
 * Vorgabe an). Der Browser zeigt Benachrichtigungen aber erst nach einer Erlaubnis, die nur nach Antippen erfragt
 * werden darf – darum diese kleine Zeile statt eines Automatismus:
 *
 *  - nur, wenn ein Kurs Erinnerungen anbietet, die Einstellungen an sind (nicht selbst ausgeschaltet), das Gerät Push
 *    kann und dieses Gerät noch nicht angemeldet ist;
 *  - „Ja, gerne" erfragt die Erlaubnis und meldet das Gerät an; „Später" blendet sie für 7 Tage aus;
 *  - abgelehnt (Browser sperrt): nie wieder fragen – der Weg zum Erlauben steht unter Einstellungen › Erinnerungen;
 *  - iPhone/iPad im Safari-Tab: die Anleitung „Zum Home-Bildschirm" genau einmal, danach nicht mehr.
 *
 * Gemerkt wird nur auf dem Gerät (localStorage, ohne Namen); ohne Speicher erscheint die Frage höchstens erneut.
 */
const SPAETER = 'sa-erinnerung-spaeter'
const IOS_GEZEIGT = 'sa-erinnerung-ios-gezeigt'
const SIEBEN_TAGE = 7 * 86_400_000

const lies = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const merke = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ohne Speicher: dann eben noch einmal */
  }
}

type Lage = 'frage' | 'ios' | 'erledigt' | 'gesperrt' | null

export function ErinnerungenFrage(): React.JSX.Element | null {
  const [lage, setLage] = useState<Lage>(null)
  const [schluessel, setSchluessel] = useState('')
  const [arbeitet, setArbeitet] = useState(false)

  useEffect(() => {
    const ich = window.__schulappsServer
    if (!ich?.angemeldet || ich.rolle !== 'schueler' || ich.vorschau || ich.quelle === 'vorschau') return
    const art = pushUnterstuetzung()
    if (art !== 'ok' && art !== 'ios-browser') return
    if (art === 'ios-browser' && lies(IOS_GEZEIGT)) return
    if (art === 'ok' && Date.now() - Number(lies(SPAETER) || 0) < SIEBEN_TAGE) return
    let ab = false
    void (async () => {
      try {
        const s = await holen<{ angeboten: boolean; vorschau?: boolean; wahl: ErinnerungsWahl; schluessel?: string }>('/s/api/erinnerungen')
        // Nicht angeboten oder selbst ausgeschaltet: nicht fragen
        if (ab || !s.angeboten || s.vorschau || !s.wahl.an) return
        if (art === 'ios-browser') {
          merke(IOS_GEZEIGT, '1')
          return setLage('ios')
        }
        const abo = await vorhandeneAnmeldung()
        if (abo && Notification.permission === 'granted') {
          const r = await senden<{ registriert: boolean }>('/s/api/erinnerungen/geraet-pruefen', { endpoint: abo.endpoint })
          if (r.registriert) return
        }
        if (ab) return
        setSchluessel(s.schluessel ?? '')
        setLage('frage')
      } catch {
        /* still: die Startseite geht vor */
      }
    })()
    return () => {
      ab = true
    }
  }, [])

  if (!lage) return null

  const spaeter = (): void => {
    merke(SPAETER, String(Date.now()))
    setLage(null)
  }
  const ja = async (): Promise<void> => {
    setArbeitet(true)
    try {
      const f = await geraetAnmelden(schluessel)
      if (!f) return setLage('erledigt')
      // Abgelehnt: nie wieder fragen (der Browser fragt ohnehin nicht mehr); nur weggeklickt: wie „Später"
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return setLage('gesperrt')
      spaeter()
    } catch {
      spaeter()
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <Paper withBorder radius="xl" px="md" py="sm" data-erinnerung-frage={lage}>
      {lage === 'frage' && (
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconBell size={20} color="var(--mantine-color-yellow-6)" style={{ flex: 'none' }} />
            <Text size="sm" fw={600}>
              Erinnerungen zum Üben einschalten?
            </Text>
          </Group>
          <Group gap="xs">
            <Button size="xs" radius="xl" color="yellow" c="dark" loading={arbeitet} onClick={() => void ja()} data-erinnerung-frage-ja>
              Ja, gerne
            </Button>
            <Button size="xs" radius="xl" variant="subtle" color="gray" disabled={arbeitet} onClick={spaeter} data-erinnerung-frage-spaeter>
              Später
            </Button>
          </Group>
        </Group>
      )}
      {lage === 'erledigt' && (
        <Group gap={8} wrap="nowrap">
          <IconBell size={20} color="var(--mantine-color-yellow-6)" style={{ flex: 'none' }} />
          <Text size="sm">
            Erinnerungen sind an – höchstens eine am Tag. Uhrzeit und Tage kannst du unter{' '}
            <Anchor href="/s/einstellungen#erinnerungen">Einstellungen</Anchor> ändern oder sie dort ausschalten.
          </Text>
        </Group>
      )}
      {lage === 'gesperrt' && (
        <Text size="sm" c="dimmed">
          Kein Problem. Falls du es dir anders überlegst: Unter <Anchor href="/s/einstellungen#erinnerungen">Einstellungen › Erinnerungen</Anchor> steht, wie du
          Benachrichtigungen erlaubst.
        </Text>
      )}
      {lage === 'ios' && (
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <IconBell size={20} color="var(--mantine-color-yellow-6)" style={{ flex: 'none' }} />
            <Text size="sm">
              Erinnerungen zum Üben gibt es auf dem iPhone/iPad über die App vom Home-Bildschirm: in Safari auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen
              und Schul-Apps dann über das neue Symbol öffnen.
            </Text>
          </Group>
          <Button size="xs" radius="xl" variant="subtle" color="gray" onClick={() => setLage(null)} data-erinnerung-frage-ok>
            Verstanden
          </Button>
        </Group>
      )}
    </Paper>
  )
}
