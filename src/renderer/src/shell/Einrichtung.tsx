import { Button, Group, Modal, Stack, Stepper, Text, Title } from '@mantine/core'
import { aufServer, serverIch } from '../shared/plattform'
import { IconFolder, IconHeadphones, IconPalette, IconPhoto, IconSchool, IconSparkles } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useAppSettings } from '../shared/settingsStore'
import { imNetz } from '../shared/netzZugang'
import { iservHier } from '../shared/iservAbgleich'
import { aufIos } from '../shared/plattform'
import { AiCard, AppearanceCard, HoertextCard, ImageAiCard, SchoolCard } from './SettingsPage'
import AblageCard from './AblageCard'
import IservCard from './IservCard'
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
  // IServ-Schritt vorn: beim Öffnen festgelegt – er bleibt stehen, auch wenn IServ währenddessen verbunden wird
  const iservAmAnfang = useRef<boolean | null>(null)

  useEffect(() => {
    /*
     * Im Netzbetrieb nicht: Der Assistent richtet Dinge auf dem RECHNER ein (Anmeldung beim
     * KI-Anbieter, Logo-Datei). Vom Tablet aus liefe er ins Leere. In der iPad-App dagegen
     * schon – sie ist ein eigenes Programm mit eigenen Einstellungen (imNetz() ist dort false).
     */
    /*
     * Server (02.10.2026): beim ERSTEN Anmelden jeder Lehrkraft – der Server merkt sich, dass sie
     * eingerichtet ist (POST /server/eingerichtet), unabhängig davon, was schon eingetragen ist.
     */
    if (aufServer()) {
      if (!geprueft) {
        setOffen(!serverIch()?.eingerichtet)
        setGeprueft(true)
      }
      return
    }
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

  // Neue Nutzer beginnen im Standardmodus (07.10.2026); wer schon gewählt hat, behält seine Wahl
  useEffect(() => {
    if (offen && !settings.oberflaeche) void update({ oberflaeche: 'standard' })
  }, [offen])

  if (!offen) return null

  /** Schließen – auf dem Server zugleich „eingerichtet" merken (der Assistent kommt nicht wieder) */
  function schliessen(): void {
    setOffen(false)
    if (!aufServer()) return
    void fetch('/server/eingerichtet', { method: 'POST', headers: { 'x-schulapps-token': 'server' } })
      .then(() => {
        if (window.__schulappsServer) window.__schulappsServer.eingerichtet = true
      })
      .catch(() => undefined)
  }
  const ios = aufIos()

  /*
   * IServ zuerst (02.10.2026, Wunsch der Lehrkraft): Ist noch keine Anmeldung bei IServ erfolgt,
   * fragt der Assistent als Erstes danach – und übernimmt daraus die Fächer (Gruppenordner, siehe
   * IservCard › faecherAusIservUebernehmen). Gilt für die Exe ohne Server, die iPad-App und die Exe
   * „Schul-Apps Online"; im reinen Browser auf dem Server geht es nicht (Passwort nie an den Server).
   */
  if (iservAmAnfang.current === null) iservAmAnfang.current = iservHier() && !settings.iserv?.basis
  const iservZuerst = iservAmAnfang.current
  const iservSchritt = {
    label: 'IServ',
    beschreibung: 'Mit IServ anmelden',
    icon: <IconFolder size={18} />,
    hinweis:
      'Mit dem IServ-Zugang der Schule übernimmt die App die eigenen Fächer aus den Gruppen (der Ordner „Englisch“ unter „Gruppen“ heißt: Englisch), speichert Material direkt in die Ordner auf IServ und öffnet Dateien von dort. Das Passwort liegt verschlüsselt nur auf diesem Gerät – Schul-Apps-Server und KI sehen es nie.',
    inhalt: <IservCard settings={settings} update={update} />
  }

  const schritte = [
    ...(iservZuerst ? [iservSchritt] : []),
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
      hinweis: 'Optional: Für Hörverstehen spricht eine Stimme das Skript ein. Ohne Stimme bleibt das Skript als Lesetext für die Lehrkraft erhalten.',
      inhalt: <HoertextCard settings={settings} update={update} />
    },
    // Nur iPad: wohin erstellte Dateien kommen (IServ steht als eigener Schritt vorn)
    ...(ios
      ? [
          {
            label: 'Ablage',
            beschreibung: 'Wohin erstellte Dateien kommen',
            icon: <IconFolder size={18} />,
            hinweis:
              'Eingeschaltet liegt jedes erstellte Material geordnet nach Fach und Themenbereich in der Dateien-App – auch ohne Netz jederzeit wieder da. Mit IServ geht Material auf Wunsch direkt in die Ordner auf IServ.',
            inhalt: <AblageCard settings={settings} update={update} />
          }
        ]
      : []),
    {
      label: 'Aussehen',
      beschreibung: 'Bedienung und Farben',
      icon: <IconPalette size={18} />,
      /*
       * Bis 25.09.2026 stand hier „Logo und Design" und „Betrifft nur das Aussehen der
       * Blätter" – beides falsch: Die Karte stellt Modus und Thema der OBERFLÄCHE ein, Blätter
       * und Tests bleiben unberührt, und das Logo gehört zu Schritt 1.
       */
      hinweis:
        'Betrifft nur die Oberfläche des Programms – Blätter und Tests sehen unverändert aus. Zum Start gilt der Standardmodus mit dem Wichtigsten; der Expertenmodus zeigt alle Feineinstellungen. Das Schullogo steht in Schritt 1. Lässt sich jederzeit in den Einstellungen ändern.',
      inhalt: <AppearanceCard settings={settings} update={update} />
    }
  ]

  const letzter = schritt >= schritte.length - 1
  const aktuell = schritte[schritt]

  return (
    <Modal opened onClose={schliessen} title="Willkommen bei Schul-Apps" size="xl" closeOnClickOutside={false}>
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
          <Button variant="subtle" onClick={schliessen}>
            Später einrichten
          </Button>
          <Group>
            {schritt > 0 && (
              <Button variant="default" onClick={() => setSchritt((n) => n - 1)}>
                Zurück
              </Button>
            )}
            <Button variant="light" onClick={() => (letzter ? schliessen() : setSchritt((n) => n + 1))}>
              Überspringen
            </Button>
            <Button onClick={() => (letzter ? schliessen() : setSchritt((n) => n + 1))}>{letzter ? 'Fertig' : 'Weiter'}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
