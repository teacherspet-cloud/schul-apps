import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Chip, Group, List, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { IconBell, IconInfoCircle, IconSend } from '@tabler/icons-react'
import { STANDARD_WAHL, TEXT_MAX, type Ausloeser, type ErinnerungsWahl } from '@shared/erinnerungen'
import { holen, senden } from './serverApi'
import { geraetAbmelden, geraetAnmelden, pushUnterstuetzung, vorhandeneAnmeldung, type PushUnterstuetzung } from './erinnerungenGeraet'

/**
 * Einstellungen › Erinnerungen (10.10.2026, Entscheidungen der Lehrkraft): Lernende schalten Erinnerungen zum Üben
 * selbst ein – nur, wenn die Lehrkraft sie in einem ihrer Kurse anbietet. Die Erlaubnis des Browsers wird erst nach dem
 * Antippen erfragt. Auf iPhone/iPad erklärt ein Hinweis den Weg über „Zum Home-Bildschirm".
 */
interface Stand {
  angeboten: boolean
  vorschau?: boolean
  wahl: ErinnerungsWahl
  geraete: number
  schluessel?: string
}

const ZEITEN = Array.from({ length: 26 }, (_, i) => 7 * 60 + i * 30).map((m) => {
  const z = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { value: z, label: `${z} Uhr` }
})
const TAGE = [
  { value: '1', label: 'Mo' },
  { value: '2', label: 'Di' },
  { value: '3', label: 'Mi' },
  { value: '4', label: 'Do' },
  { value: '5', label: 'Fr' },
  { value: '6', label: 'Sa' },
  { value: '7', label: 'So' }
]
const AUSLOESER: { id: Ausloeser; titel: string; text: string }[] = [
  { id: 'tagesziel', titel: 'Tagesrunde', text: 'wenn deine Runde für heute noch offen ist' },
  { id: 'serie', titel: 'Serie', text: 'wenn du schon ein paar Tage in Folge geübt hast und heute noch nicht' },
  { id: 'neu', titel: 'Neues', text: 'neue Vokabeln oder Grammatik, ein Test oder das Kursende kommt bald' },
  { id: 'woche', titel: 'Wochenrückblick', text: 'sonntags um 17 Uhr: was du diese Woche geschafft hast' }
]

/** Hinweis, wenn dieses Gerät keine Erinnerungen bekommen kann */
function GeraetHinweis({ art }: { art: PushUnterstuetzung }): React.JSX.Element | null {
  if (art === 'ok') return null
  if (art === 'ios-browser')
    return (
      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} title="Auf iPhone und iPad: erst zum Home-Bildschirm" data-erinnerung-ios>
        <List size="sm" type="ordered" spacing={4}>
          <List.Item>Unten in Safari auf „Teilen“ tippen (Quadrat mit Pfeil nach oben).</List.Item>
          <List.Item>„Zum Home-Bildschirm“ wählen und „Hinzufügen“ tippen.</List.Item>
          <List.Item>Schul-Apps über das neue Symbol auf dem Home-Bildschirm öffnen und hier die Erinnerungen einschalten.</List.Item>
        </List>
        <Text size="xs" c="dimmed" mt={6}>
          Das geht ab iOS 16.4. Auf Schul-iPads kann die Schule Benachrichtigungen gesperrt haben – dann klappt es nur auf einem eigenen Gerät.
        </Text>
      </Alert>
    )
  const text: Record<Exclude<PushUnterstuetzung, 'ok' | 'ios-browser'>, string> = {
    'ios-alt': 'Für Erinnerungen braucht dein iPhone oder iPad mindestens iOS 16.4. Nach einem Update geht es über die App auf dem Home-Bildschirm.',
    unsicher: 'Erinnerungen gehen nur über eine sichere Verbindung (https). Öffne die Seite bitte über die normale Adresse.',
    keine: 'Dieser Browser kann keine Benachrichtigungen empfangen. Mit Chrome, Edge, Firefox oder Safari (ab iOS 16.4 als App vom Home-Bildschirm) klappt es.',
    gesperrt:
      'Benachrichtigungen sind für diese Seite gesperrt. Erlaube sie in den Einstellungen des Browsers (Schloss-Symbol neben der Adresse) bzw. des Geräts. Auf Schul-Geräten kann das von der Schule gesperrt sein.'
  }
  return (
    <Alert color="orange" variant="light" icon={<IconInfoCircle size={18} />} data-erinnerung-hinweis={art}>
      {text[art]}
    </Alert>
  )
}

export function ErinnerungenEinstellungen({ melde }: { melde: (art: 'konto' | 'fehler') => void }): React.JSX.Element {
  const [stand, setStand] = useState<Stand | null>(null)
  const [fehler, setFehler] = useState('')
  const [hier, setHier] = useState<boolean | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const [text, setText] = useState('')
  const [testInfo, setTestInfo] = useState('')
  const art = typeof window !== 'undefined' ? pushUnterstuetzung() : 'keine'

  const laden = async (): Promise<void> => {
    try {
      const s = await holen<Stand>('/s/api/erinnerungen')
      setStand(s)
      setText(s.wahl.text)
      const abo = await vorhandeneAnmeldung()
      setHier(abo ? Boolean((await senden<{ registriert: boolean }>('/s/api/erinnerungen/geraet-pruefen', { endpoint: abo.endpoint })).registriert) : false)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    void laden()
  }, [])

  if (!stand) return fehler ? <Text c="red">{fehler}</Text> : <Text c="dimmed">Lädt …</Text>
  if (stand.vorschau) return <Text c="dimmed">In der Vorschau gibt es keine Erinnerungen.</Text>
  if (!stand.angeboten)
    return (
      <Text size="sm" c="dimmed" data-erinnerung-nicht-angeboten>
        Für deine Kurse sind Erinnerungen gerade nicht eingeschaltet. Deine Lehrkraft kann sie anbieten – dann kannst du sie hier für dein Handy oder Tablet einschalten.
      </Text>
    )

  const w = stand.wahl
  const speichern = async (teil: Partial<ErinnerungsWahl>): Promise<void> => {
    const neu = { ...w, ...teil }
    setStand({ ...stand, wahl: neu })
    try {
      const r = await senden<{ wahl: ErinnerungsWahl }>('/s/api/erinnerungen/wahl', { wahl: neu })
      setStand((s) => (s ? { ...s, wahl: r.wahl } : s))
      melde('konto')
    } catch {
      melde('fehler')
    }
  }

  const einschalten = async (): Promise<void> => {
    setFehler('')
    setArbeitet(true)
    try {
      const f = await geraetAnmelden(stand.schluessel ?? '')
      if (f) return setFehler(f)
      setHier(true)
      await speichern({ an: true })
      await laden()
    } catch (e) {
      setFehler(`Das Gerät ließ sich nicht anmelden (${e instanceof Error ? e.message : String(e)}).`)
    } finally {
      setArbeitet(false)
    }
  }
  const ausschalten = async (): Promise<void> => {
    setArbeitet(true)
    try {
      await geraetAbmelden()
      setHier(false)
      await speichern({ an: false })
      await laden()
    } finally {
      setArbeitet(false)
    }
  }
  const test = async (): Promise<void> => {
    setTestInfo('')
    try {
      const r = await senden<{ gesendet: number; geraete: number }>('/s/api/erinnerungen/test')
      setTestInfo(
        r.gesendet
          ? `Gesendet – gleich sollte die Benachrichtigung erscheinen (${r.gesendet} ${r.gesendet === 1 ? 'Gerät' : 'Geräte'}).`
          : 'Kein Gerät hat die Nachricht angenommen. Schalte die Erinnerungen bitte aus und wieder ein.'
      )
    } catch (e) {
      setTestInfo(e instanceof Error ? e.message : String(e))
    }
  }
  const an = w.an

  return (
    <Stack gap="md" data-erinnerungen>
      <Text size="sm" c="dimmed">
        Eine kurze Erinnerung zum Üben auf dieses Gerät – höchstens eine am Tag, nie während der Schulzeit (Mo–Fr 7:30–14 Uhr) und nie nach 20 Uhr.
      </Text>
      <GeraetHinweis art={art} />
      <Switch
        checked={an && hier !== false}
        disabled={arbeitet || (art !== 'ok' && !an)}
        onChange={(e) => void (e.currentTarget.checked ? einschalten() : ausschalten())}
        label="Erinnerungen auf diesem Gerät"
        description={
          an && hier === false
            ? 'Auf einem anderen Gerät eingeschaltet – hier antippen, um auch dieses Gerät anzumelden.'
            : stand.geraete > 1
            ? `Angemeldet auf ${stand.geraete} Geräten.`
            : 'Dein Gerät fragt einmal, ob es Benachrichtigungen zeigen darf.'
        }
        data-erinnerung-an
      />
      {fehler && (
        <Text size="sm" c="red" data-erinnerung-fehler>
          {fehler}
        </Text>
      )}
      {an && (
        <>
          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Uhrzeit"
              data={ZEITEN}
              value={ZEITEN.some((z) => z.value === w.zeit) ? w.zeit : STANDARD_WAHL.zeit}
              onChange={(v) => v && void speichern({ zeit: v })}
              allowDeselect={false}
              w={150}
              data-erinnerung-zeit
            />
            <SegmentedControl
              value={w.sprache}
              onChange={(v) => void speichern({ sprache: v === 'en' ? 'en' : 'de' })}
              data={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' }
              ]}
              data-erinnerung-sprache
            />
          </Group>
          <Text size="xs" c="dimmed" mt={-8}>
            An Schultagen kommt eine Erinnerung vor 14 Uhr erst um 14 Uhr.
          </Text>
          <div>
            <Text size="sm" fw={600} mb={4}>
              An diesen Tagen
            </Text>
            <Chip.Group multiple value={w.tage.map(String)} onChange={(v) => void speichern({ tage: v.map(Number) })}>
              <Group gap={6} data-erinnerung-tage>
                {TAGE.map((t) => (
                  <Chip key={t.value} value={t.value} size="sm">
                    {t.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Woran erinnern?
            </Text>
            {AUSLOESER.map((a) => (
              <Checkbox
                key={a.id}
                checked={w.ausloeser[a.id]}
                onChange={(e) => void speichern({ ausloeser: { ...w.ausloeser, [a.id]: e.currentTarget.checked } })}
                label={a.titel}
                description={a.text}
                data-erinnerung-ausloeser={a.id}
              />
            ))}
          </Stack>
          <Switch
            checked={w.ferien}
            onChange={(e) => void speichern({ ferien: e.currentTarget.checked })}
            label="Ferien-Pause"
            description="Keine Erinnerungen, bis du die Pause wieder ausschaltest – oder bis zum gewählten Tag."
            data-erinnerung-ferien
          />
          {w.ferien && (
            <TextInput
              type="date"
              label="Pause bis einschließlich"
              value={w.ferienBis}
              onChange={(e) => void speichern({ ferienBis: e.currentTarget.value })}
              w={220}
              data-erinnerung-ferien-bis
            />
          )}
          <TextInput
            label="Eigener Erinnerungstext (freiwillig)"
            description="Erscheint statt der wechselnden Texte bei der Tagesrunde. Nur Text, höchstens 120 Zeichen."
            placeholder="z. B. Erst Vokabeln, dann Fußball!"
            maxLength={TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onBlur={() => text !== w.text && void speichern({ text })}
            data-erinnerung-text
          />
          <Group gap="sm" align="center">
            <Button variant="light" leftSection={<IconSend size={16} />} onClick={() => void test()} disabled={!stand.geraete} data-erinnerung-test>
              Test-Benachrichtigung senden
            </Button>
            {testInfo && (
              <Text size="sm" c="dimmed" data-erinnerung-test-info>
                {testInfo}
              </Text>
            )}
          </Group>
        </>
      )}
      {!an && art === 'ok' && (
        <Group gap={6} c="dimmed">
          <IconBell size={14} />
          <Text size="xs">Du kannst sie jederzeit wieder ausschalten.</Text>
        </Group>
      )}
    </Stack>
  )
}
