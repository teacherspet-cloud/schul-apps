/**
 * Willkommens-Assistent der Lernenden (09.10.2026, Entscheidung der Lehrkraft): kurz, jederzeit überspringbar.
 *
 *  1. Farbe (die zehn Farben als Kacheln) und Hell/Dunkel/Wie das Gerät
 *  2. Stimme der Aussprache (weiblich/männlich, mit Probe) und „Vollbild beim Lernen"
 *  3. Kurze Tour: Regal, Register im Ordner, Einladungscode, Einstellungen – vier kleine Karten
 *
 * Jede Wahl wirkt sofort (Vorschau ist die Seite selbst) und wird gespeichert wie in den Einstellungen. „Überspringen",
 * Esc und „Fertig" merken am Konto, dass er gesehen wurde (willkommenErledigt). Wann er von selbst erscheint: willkommenLogik.ts.
 * Barrierearm: Mantine-Modal mit Fokusfalle, Esc = Überspringen; auf dem Telefon bildschirmfüllend; ohne Übergang bei
 * „Bewegung reduzieren" bzw. ruhiger Darstellung.
 */
import { useEffect, useState } from 'react'
import { Button, Group, Modal, SegmentedControl, SimpleGrid, Stack, Switch, Text, Title } from '@mantine/core'
import { useMediaQuery, useReducedMotion } from '@mantine/hooks'
import { IconDeviceDesktop, IconMoon, IconSun, IconVolume } from '@tabler/icons-react'
import { SCHUELER_FARBEN } from '@shared/schuelerFarben'
import { senden } from './serverApi'
import { fuerServer, sprachausgabeDa, tempoFaktor, useDarstellung, type Darstellung } from './schuelerDarstellung'
import { EINST_CSS, FarbKachel } from './SchuelerEinstellungen'
import { useSchuelerTelefon } from './SchuelerTabs'
import { automatisierung, lageVon, stimmeNachLage, useWillkommen, willkommenZeigen } from './willkommenLogik'

const SCHRITTE = ['Deine Farben', 'Hören und Lernen', 'So findest du dich zurecht'] as const

const CSS = `
.wk-karte { border: 1px solid var(--mantine-color-default-border); border-radius: 14px; padding: 12px; background: var(--mantine-color-body);
  display: flex; gap: 12px; align-items: center; }
.wk-bild { flex: none; width: 76px; height: 56px; color: var(--mantine-primary-color-filled); }
.wk-punkte { display: flex; gap: 6px; }
.wk-punkt { width: 8px; height: 8px; border-radius: 50%; background: var(--mantine-color-default-border); }
.wk-punkt[data-an] { background: var(--mantine-primary-color-filled); width: 22px; border-radius: 4px; }
`

/** Kleine Zeichnungen für die Tour (in der gewählten Farbe) */
const BILDER: Record<string, React.JSX.Element> = {
  regal: (
    <svg viewBox="0 0 76 56" className="wk-bild" aria-hidden>
      <rect x="2" y="50" width="72" height="4" rx="1" fill="currentColor" opacity=".5" />
      <rect x="8" y="10" width="12" height="40" rx="2" fill="currentColor" />
      <rect x="22" y="14" width="12" height="36" rx="2" fill="currentColor" opacity=".7" />
      <rect x="36" y="8" width="12" height="42" rx="2" fill="currentColor" opacity=".85" />
      <rect x="50" y="16" width="12" height="34" rx="2" fill="currentColor" opacity=".55" />
      <circle cx="14" cy="40" r="2.5" fill="#fff" />
      <circle cx="28" cy="40" r="2.5" fill="#fff" />
      <circle cx="42" cy="40" r="2.5" fill="#fff" />
    </svg>
  ),
  register: (
    <svg viewBox="0 0 76 56" className="wk-bild" aria-hidden>
      <rect x="4" y="6" width="56" height="46" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="60" y="8" width="12" height="10" rx="2" fill="currentColor" />
      <rect x="60" y="21" width="12" height="10" rx="2" fill="currentColor" opacity=".7" />
      <rect x="60" y="34" width="12" height="10" rx="2" fill="currentColor" opacity=".45" />
      <rect x="12" y="16" width="36" height="4" rx="2" fill="currentColor" opacity=".6" />
      <rect x="12" y="26" width="28" height="4" rx="2" fill="currentColor" opacity=".4" />
      <rect x="12" y="36" width="32" height="4" rx="2" fill="currentColor" opacity=".4" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 76 56" className="wk-bild" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={3 + i * 12} y="18" width="10" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      ))}
      <text x="8" y="30" fontSize="9" fontWeight="700" fill="currentColor">4</text>
      <text x="20" y="30" fontSize="9" fontWeight="700" fill="currentColor">7</text>
      <text x="32" y="30" fontSize="9" fontWeight="700" fill="currentColor">1</text>
      <circle cx="22" cy="46" r="5" fill="currentColor" opacity=".7" />
      <circle cx="54" cy="46" r="5" fill="currentColor" opacity=".45" />
    </svg>
  ),
  einstellungen: (
    <svg viewBox="0 0 76 56" className="wk-bild" aria-hidden>
      <g transform="translate(38 28)" fill="currentColor">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((w) => (
          <rect key={w} x="-4" y="-22" width="8" height="10" rx="2" transform={`rotate(${w})`} />
        ))}
        <circle r="15" />
        <circle r="6" fill="var(--mantine-color-body)" />
      </g>
    </svg>
  )
}

/** Hängt im Schülerbereich; zeigt sich von selbst einmal je Konto oder über den Link in den Einstellungen */
export default function Willkommen({ pfad }: { pfad: string }): React.JSX.Element | null {
  const { geladen, erledigt, offen } = useWillkommen()
  const { d, setze } = useDarstellung()
  const [schritt, setSchritt] = useState(0)
  const [zu, setZu] = useState(false)
  const telefon = useSchuelerTelefon()
  const klein = useMediaQuery('(max-width: 36em)') ?? false
  const wenigBewegung = useReducedMotion() || d.ruhig
  const ich = window.__schulappsServer
  const vonSelbst = !zu && willkommenZeigen({ ich, geladen, erledigt, pfad, ...automatisierung() })
  const sichtbar = offen || vonSelbst
  // Beim Öffnen immer mit Schritt 1 beginnen
  useEffect(() => {
    if (sichtbar) setSchritt(0)
  }, [sichtbar])
  if (!sichtbar) return null

  const speichern = (neu: Darstellung): void => {
    setze(neu)
    if (ich?.angemeldet) void senden('/s/api/darstellung', fuerServer(neu)).catch(() => undefined)
  }
  const aendern = (teil: Partial<Darstellung>): void => speichern({ ...useDarstellung.getState().d, ...teil })
  // Überspringen, Esc und Fertig: am Konto merken (die Vorschau der Lehrkraft merkt es auch – dort erscheint er ohnehin nicht von selbst)
  const schliessen = (): void => {
    if (sprachausgabeDa()) window.speechSynthesis.cancel()
    setZu(true)
    useWillkommen.setState({ offen: false, erledigt: true })
    speichern({ ...useDarstellung.getState().d, willkommenErledigt: true })
  }
  const letzter = schritt === SCHRITTE.length - 1
  const gast = !ich?.angemeldet || ich.quelle === 'gast'

  const probe = (lage: 'w' | 'm'): void => {
    if (!sprachausgabeDa()) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(lage === 'w' ? 'Hello! This is how words sound.' : 'Hi there! This is how words sound.')
    const v = stimmeNachLage(window.speechSynthesis.getVoices(), lage)
    if (v) {
      u.voice = v
      u.lang = v.lang
    } else u.lang = 'en-GB'
    // Ohne erkennbar passende Stimme wenigstens hörbar höher bzw. tiefer
    if (!v || lageVon(v.name) !== lage) u.pitch = lage === 'w' ? 1.25 : 0.8
    u.rate = 0.9 * tempoFaktor()
    window.speechSynthesis.speak(u)
  }

  return (
    <Modal
      opened
      onClose={schliessen}
      title={
        <Title order={3} component="h2">
          Willkommen!
        </Title>
      }
      size="lg"
      radius="lg"
      centered
      fullScreen={klein}
      closeOnClickOutside={false}
      closeButtonProps={{ 'aria-label': 'Überspringen' }}
      transitionProps={wenigBewegung ? { duration: 0 } : { transition: 'pop', duration: 180 }}
      data-willkommen
    >
      <style>{EINST_CSS + CSS}</style>
      <Stack gap="md" data-willkommen-inhalt>
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700} size="lg" data-willkommen-schritt={schritt + 1}>
            {SCHRITTE[schritt]}
          </Text>
          <div className="wk-punkte" role="img" aria-label={`Schritt ${schritt + 1} von ${SCHRITTE.length}`}>
            {SCHRITTE.map((s, i) => (
              <span key={s} className="wk-punkt" data-an={i === schritt || undefined} />
            ))}
          </div>
        </Group>

        {schritt === 0 && (
          <Stack gap="sm">
            <Text size="sm">Such dir eine Farbe aus. Du siehst sofort, wie es aussieht.</Text>
            <SimpleGrid cols={{ base: 2, xs: 5 }} spacing="xs" role="radiogroup" aria-label="Farbe">
              {SCHUELER_FARBEN.map((f) => (
                <FarbKachel key={f.wert} wert={f.wert} name={f.name} an={d.farbe === f.wert} waehlen={() => aendern({ farbe: f.wert })} />
              ))}
            </SimpleGrid>
            <SegmentedControl
              fullWidth
              value={d.modus}
              onChange={(v) => aendern({ modus: v as Darstellung['modus'] })}
              data={[
                { value: 'hell', label: <Wahl icon={<IconSun size={16} />} text="Hell" /> },
                { value: 'dunkel', label: <Wahl icon={<IconMoon size={16} />} text="Dunkel" /> },
                { value: 'auto', label: <Wahl icon={<IconDeviceDesktop size={16} />} text="Wie das Gerät" /> }
              ]}
              aria-label="Hell oder dunkel"
              data-willkommen-modus
            />
          </Stack>
        )}

        {schritt === 1 && (
          <Stack gap="md">
            <div>
              <Text fw={600} mb={4}>
                Stimme bei den Vokabeln
              </Text>
              <Text size="sm" c="dimmed" mb={6}>
                Welche Stimme spricht dir die Wörter vor?
              </Text>
              <Group gap="xs" wrap="nowrap" align="stretch">
                <SegmentedControl
                  style={{ flex: 1 }}
                  value={d.aussprache ?? 'm'}
                  onChange={(v) => aendern({ aussprache: v === 'w' ? 'w' : 'm' })}
                  data={[
                    { value: 'w', label: 'Weiblich' },
                    { value: 'm', label: 'Männlich' }
                  ]}
                  aria-label="Stimme der Aussprache"
                  data-willkommen-stimme
                />
                {sprachausgabeDa() && (
                  <Button variant="light" leftSection={<IconVolume size={16} />} onClick={() => probe(d.aussprache ?? 'm')} data-willkommen-probe>
                    Probe
                  </Button>
                )}
              </Group>
            </div>
            <Switch
              checked={d.vollbild !== false}
              onChange={(e) => aendern({ vollbild: e.currentTarget.checked })}
              label="Vollbild beim Lernen"
              description="Beim Üben und Spielen füllt die Aufgabe den ganzen Bildschirm – so lenkt nichts ab."
              data-willkommen-vollbild
            />
          </Stack>
        )}

        {schritt === 2 && (
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Karte bild="regal" titel="Dein Regal" text="Für jedes Fach gibt es einen Ordner. Tippe ihn an, um ihn aufzuschlagen." />
            <Karte bild="register" titel="Register im Ordner" text="Oben im Ordner: Vokabeln, Grammatik, Meine Bücher und mehr." />
            <Karte bild="code" titel="Zusammen spielen" text="Bei den Spielen steht oben das Feld „Einladungscode“. Gib dort den Code deiner Freunde ein." />
            <Karte
              bild="einstellungen"
              titel="Einstellungen"
              text={telefon && !gast ? 'Unten unter „Ich“ findest du die Einstellungen.' : 'Oben rechts beim Zahnrad findest du die Einstellungen.'}
            />
          </SimpleGrid>
        )}

        <Text size="xs" c="dimmed">
          Du kannst alles später in den Einstellungen ändern.
        </Text>
        <Group justify="space-between" wrap="nowrap">
          <Button variant="subtle" color="gray" onClick={schliessen} data-willkommen-ueberspringen>
            Überspringen
          </Button>
          <Group gap="xs" wrap="nowrap">
            {schritt > 0 && (
              <Button variant="default" onClick={() => setSchritt(schritt - 1)} data-willkommen-zurueck>
                Zurück
              </Button>
            )}
            <Button onClick={() => (letzter ? schliessen() : setSchritt(schritt + 1))} data-willkommen-weiter={letzter ? 'fertig' : 'weiter'}>
              {letzter ? 'Fertig' : 'Weiter'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

function Karte({ bild, titel, text }: { bild: keyof typeof BILDER; titel: string; text: string }): React.JSX.Element {
  return (
    <div className="wk-karte" data-willkommen-karte={bild}>
      {BILDER[bild]}
      <div style={{ minWidth: 0 }}>
        <Text fw={700} size="sm">
          {titel}
        </Text>
        <Text size="sm" c="dimmed">
          {text}
        </Text>
      </div>
    </div>
  )
}

function Wahl({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <Group gap={6} justify="center" wrap="nowrap">
      {icon}
      <span>{text}</span>
    </Group>
  )
}
