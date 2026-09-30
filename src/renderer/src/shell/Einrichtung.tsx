import { Button, Group, Modal, Stack, Stepper, Text, Title } from '@mantine/core'
import { IconFolder, IconHeadphones, IconPalette, IconPhoto, IconSchool, IconSparkles } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useAppSettings } from '../shared/settingsStore'
import { imNetz } from '../shared/netzZugang'
import { aufIos } from '../shared/plattform'
import { AiCard, AppearanceCard, HoertextCard, ImageAiCard, SchoolCard } from './SettingsPage'
import AblageCard from './AblageCard'
import SicherungEinlesen from './SicherungEinlesen'

/**
 * Der Einrichtungsassistent nach dem ersten Start oder nach dem Zurücksetzen.
 *
 * Wunsch der Lehrkraft (25.09.2026): „Füge einen Einrichtungsassistenten hinzu, der nach dem
 * erstmaligen Start oder Zurücksetzen der App dem Nutzer hilft, alles wichtige einzurichten,
 * damit man in den Einzelapps beginnen kann."
 *
 * Drei Entscheidungen aus der Rücksprache:
 *
 * - Drei Schritte: Schule und Lerngruppe (mit Logo), KI-Zugang, Aussehen der Oberfläche.
 *   Seit 30.09.2026 fünf: dazu Bilder-KI und Hörtexte („Der Einrichtungsassistent umfasst außerdem
 *   noch nicht Bilder-KI und Hörtext-KI."). In der iPad-App bieten die KI-Schritte zusätzlich
 *   „Abo über den PC" an (mobil/pcKi.ts) und als eigenen Schritt die Ablage der erstellten
 *   Dateien unter Schulmaterial (AblageCard).
 * - JEDER Schritt ist überspringbar. Wer den Schlüssel gerade nicht zur Hand hat, soll nicht
 *   festsitzen – die Programme sagen später ohnehin, was fehlt.
 * - Eine Sicherung lässt sich hier direkt einlesen – nach dem Zurücksetzen der naheliegende Weg
 *   zurück (zunächst „später“, nachgeholt am 25.09.2026).
 * - Er erscheint, „wenn nichts eingerichtet ist": also wenn weder ein Schulname noch ein
 *   KI-Zugang vorliegt. Damit kommt er nach dem ersten Start und nach dem Zurücksetzen von
 *   selbst, ohne dass eine zusätzliche Markierung gepflegt werden muss, die irgendwann nicht
 *   mehr zum tatsächlichen Zustand passt.
 *
 * Die Schritte benutzen DIESELBEN Karten wie die Einstellungsseite. Ein zweiter, schlankerer
 * Nachbau würde über kurz oder lang von ihr abweichen – und dann richtet der Assistent etwas
 * anderes ein, als die Einstellungen zeigen.
 */
const ZAHLWORT: Record<number, string> = { 3: 'Drei', 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben' }

export default function Einrichtung(): React.JSX.Element | null {
  const settings = useAppSettings((s) => s.settings)
  const update = useAppSettings((s) => s.update)
  const [offen, setOffen] = useState(false)
  const [schritt, setSchritt] = useState(0)
  const [geprueft, setGeprueft] = useState(false)

  useEffect(() => {
    /*
     * Im Netzbetrieb nicht: Der Assistent richtet Dinge auf dem RECHNER ein (Anmeldung beim
     * KI-Anbieter, Logo-Datei). Vom Tablet aus liefe er ins Leere. In der iPad-App dagegen
     * schon – sie ist ein eigenes Programm mit eigenen Einstellungen (imNetz() ist dort false).
     */
    if (imNetz() || geprueft) return
    let abgebrochen = false
    void (async () => {
      const ki = await window.api.ai.status().catch(() => null)
      if (abgebrochen) return
      const ohneSchule = !settings.schoolName?.trim()
      const ohneKi = !ki?.hasTextKey
      setOffen(ohneSchule && ohneKi)
      setGeprueft(true)
    })()
    return () => {
      abgebrochen = true
    }
  }, [settings.schoolName, geprueft])

  if (!offen) return null
  const ios = aufIos()

  const schritte = [
    {
      label: 'Schule',
      beschreibung: 'Wo wird unterrichtet?',
      icon: <IconSchool size={18} />,
      hinweis:
        'Bundesland und Schulform bestimmen, welche Jahrgänge zur Auswahl stehen, welche Niveaus erwartet werden und wie der Lehrplan im jeweiligen Land heißt. Ohne diese Angaben arbeitet die App mit Voreinstellungen, die nicht zur eigenen Schule passen müssen. Die unterrichteten Fächer stehen später in jeder Fachauswahl oben; Programme, die zu keinem davon passen, werden ausgeblendet.',
      inhalt: <SchoolCard settings={settings} update={update} />
    },
    {
      label: 'KI-Zugang',
      beschreibung: 'Womit soll erzeugt werden?',
      icon: <IconSparkles size={18} />,
      hinweis: ios
        ? 'Ohne Zugang erzeugt die App kein Material – das ist der Schritt, an dem es sonst hängenbleibt. Entweder ein eigener API-Schlüssel (liegt verschlüsselt im Schlüsselbund dieses Geräts) oder das Abo über den PC: Dann erzeugt Schul-Apps am PC mit dem dort eingerichteten Zugang.'
        : 'Ohne Zugang erzeugt die App kein Material – das ist der Schritt, an dem es sonst hängenbleibt. Der Schlüssel wird verschlüsselt auf diesem Rechner abgelegt und verlässt ihn nicht.',
      inhalt: <AiCard settings={settings} update={update} />
    },
    {
      label: 'Bilder-KI',
      beschreibung: 'Bilder und Piktogramme',
      icon: <IconPhoto size={18} />,
      hinweis:
        'Optional: Die KI zeichnet auf Wunsch Bilder für Arbeitsblätter und gestaltet Piktogramme neu. Ohne Bild-KI bleiben die Bildsuche im Netz und die mitgelieferten Symbole.',
      inhalt: <ImageAiCard settings={settings} update={update} />
    },
    {
      label: 'Hörtexte',
      beschreibung: 'Hörtexte vertonen',
      icon: <IconHeadphones size={18} />,
      hinweis:
        'Optional: Für Hörverstehen spricht eine Stimme das Skript ein. Ohne Stimme bleibt das Skript als Lesetext für die Lehrkraft erhalten.',
      inhalt: <HoertextCard settings={settings} update={update} />
    },
    // Nur iPad: wohin erstellte Dateien kommen
    ...(ios
      ? [
          {
            label: 'Ablage',
            beschreibung: 'Wohin erstellte Dateien kommen',
            icon: <IconFolder size={18} />,
            hinweis:
              'Eingeschaltet liegt jedes erstellte Material geordnet nach Fach und Themenbereich in der Dateien-App – auch ohne Netz jederzeit wieder da.',
            inhalt: <AblageCard settings={settings} update={update} />
          }
        ]
      : []),
    {
      label: 'Aussehen',
      beschreibung: 'Farben der Oberfläche',
      icon: <IconPalette size={18} />,
      /*
       * Bis 25.09.2026 stand hier „Logo und Design" und „Betrifft nur das Aussehen der
       * Blätter" – beides falsch: Die Karte stellt Modus und Thema der OBERFLÄCHE ein, Blätter
       * und Tests bleiben unberührt, und das Logo gehört zu Schritt 1.
       */
      hinweis:
        'Betrifft nur die Oberfläche des Programms – Blätter und Tests sehen unverändert aus. Das Schullogo steht in Schritt 1. Lässt sich jederzeit in den Einstellungen ändern.',
      inhalt: <AppearanceCard settings={settings} update={update} />
    }
  ]

  const letzter = schritt >= schritte.length - 1
  const aktuell = schritte[schritt]

  return (
    <Modal opened onClose={() => setOffen(false)} title="Willkommen bei Schul-Apps" size="xl" closeOnClickOutside={false}>
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {ZAHLWORT[schritte.length] ?? schritte.length} kurze Schritte, danach geht es los. Jeder lässt sich überspringen und später in den Einstellungen
            nachholen.
          </Text>
          {/* Nach einem Zurücksetzen der naheliegende Weg zurück (Wunsch vom 25.09.2026) */}
          <SicherungEinlesen variant="subtle" />
        </Group>

        <Stepper active={schritt} onStepClick={setSchritt} size="sm">
          {schritte.map((s) => (
            <Stepper.Step key={s.label} label={s.label} description={s.beschreibung} icon={s.icon} />
          ))}
        </Stepper>

        <div>
          <Title order={5} mb={4}>
            {aktuell.beschreibung}
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            {aktuell.hinweis}
          </Text>
          {aktuell.inhalt}
        </div>

        <Group justify="space-between">
          <Button variant="subtle" onClick={() => setOffen(false)}>
            Später einrichten
          </Button>
          <Group>
            {schritt > 0 && (
              <Button variant="default" onClick={() => setSchritt((n) => n - 1)}>
                Zurück
              </Button>
            )}
            <Button variant="light" onClick={() => (letzter ? setOffen(false) : setSchritt((n) => n + 1))}>
              Überspringen
            </Button>
            <Button onClick={() => (letzter ? setOffen(false) : setSchritt((n) => n + 1))}>{letzter ? 'Fertig' : 'Weiter'}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
