/**
 * Knopf „Onlinetest" im Vokabeltest (02.10.2026, Wunsch der Lehrkraft) – nur mit dem
 * Schul-Apps-Server. Macht aus dem fertigen Test einen Onlinetest: Lerngruppe, Zeitlimit,
 * Verteilung der Fassungen; danach Code, Link und QR-Code für die Lernenden.
 */
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconDeviceLaptop } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TestDocument } from '../vokabeltest/model/types'
import { aufServer } from '../../shared/plattform'
import { openModule } from '../../shared/navigation'
import { notifyError } from '../../shared/util'
import { holen, senden } from './serverApi'
import { PRUEF_HINWEIS, Zugang } from './OnlinetestModule'

export default function OnlinetestKnopf({ doc }: { doc: TestDocument }): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  if (!aufServer()) return null
  return (
    <>
      <Button variant="light" leftSection={<IconDeviceLaptop size={16} />} onClick={() => setOffen(true)} data-onlinetest-knopf>
        Onlinetest
      </Button>
      {offen && <Erstellen doc={doc} schliessen={() => setOffen(false)} />}
    </>
  )
}

function Erstellen({ doc, schliessen }: { doc: TestDocument; schliessen: () => void }): React.JSX.Element {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [titel, setTitel] = useState(doc.header.title || 'Vokabeltest')
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [zeit, setZeit] = useState<number>(20)
  const [zuteilung, setZuteilung] = useState<string>('abwechselnd')
  const [laeuft, setLaeuft] = useState(false)
  const [fertig, setFertig] = useState<{ code: string; link: string } | null>(null)
  useEffect(() => {
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen')
      .then((d) => setGruppen(d.gruppen))
      .catch(() => setGruppen([]))
  }, [])
  const erstellen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ code: string; link: string }>('/server/onlinetest/erstellen', {
        titel,
        test: doc,
        lerngruppeId: gruppe ?? '',
        zeitMin: zeit,
        zuteilung: zuteilung === 'abwechselnd' || zuteilung === 'zufall' ? zuteilung : Number(zuteilung)
      })
      setFertig(r)
    } catch (e) {
      notifyError(e, 'Onlinetest nicht erstellt')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Als Onlinetest durchführen" size="lg">
      {fertig ? (
        <Stack>
          <Text>Der Test ist freigegeben. Die Lernenden scannen den QR-Code oder öffnen den Link und melden sich mit IServ an.</Text>
          <Zugang code={fertig.code} link={fertig.link} />
          <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
            {PRUEF_HINWEIS}
          </Alert>
          <Group justify="flex-end">
            <Button
              onClick={() => {
                schliessen()
                openModule('onlinetest')
              }}
            >
              Zum Live-Stand
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <TextInput label="Titel" value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
          <Select
            label="Lerngruppe"
            description="Nur Mitglieder dieser Lerngruppe können teilnehmen; die Ergebnisse stehen in ihrer Historie. Ohne Lerngruppe: jeder mit Code."
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            clearable
            placeholder={gruppen.length ? 'wählen …' : 'noch keine – in der App „Onlinetest“ anlegen'}
          />
          <NumberInput label="Zeitlimit (Minuten)" min={1} max={240} value={zeit} onChange={(v) => setZeit(Number(v) || 20)} />
          {doc.variants.length > 1 && (
            <Select
              label="Fassungen verteilen"
              data={[
                { value: 'abwechselnd', label: 'abwechselnd (A, B, A, B … nach Reihenfolge des Startens)' },
                { value: 'zufall', label: 'zufällig' },
                ...doc.variants.map((v, i) => ({ value: String(i), label: `alle Fassung ${v.label}` }))
              ]}
              value={zuteilung}
              onChange={(v) => v && setZuteilung(v)}
              allowDeselect={false}
            />
          )}
          <Alert variant="light">
            Wer während des Tests die Seite verlässt (anderer Tab, andere App), gibt automatisch ab. Einfache Antworten wertet der Server sofort aus, offene prüft auf Wunsch
            die KI – halbe Punkte gibt es nicht.
          </Alert>
          <Group justify="flex-end">
            <Button loading={laeuft} onClick={() => void erstellen()}>
              Onlinetest erstellen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
