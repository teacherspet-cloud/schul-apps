/**
 * Knopf „Onlinetest" im Vokabeltest (02.10.2026, Wunsch der Lehrkraft) – nur mit dem
 * Schul-Apps-Server. Macht aus dem fertigen Test einen Onlinetest: Name, Lerngruppe, Zeitlimit,
 * Verteilung der Fassungen, Figur; danach Code, Link und QR-Code für die Lernenden. Gestartet
 * wird in der App „Onlinetest" – für alle gemeinsam.
 */
import { Alert, Button, Checkbox, Group, Image, Modal, NumberInput, Select, Stack, Text, TextInput, Radio } from '@mantine/core'
import { IconAlertTriangle, IconDeviceLaptop } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { TestDocument } from '../vokabeltest/model/types'
import { aufServer } from '../../shared/plattform'
import { openModule } from '../../shared/navigation'
import { notifyError } from '../../shared/util'
import { maskottchenBild, useMaskottchen } from '../../shared/maskottchenStore'
import { vokabeltestFigur } from '../vokabeltest/render/maskottchen'
import { holen, senden } from './serverApi'
import { PRUEF_HINWEIS, Zugang } from './OnlinetestModule'

/** Thema des Tests (Unit, Themenbereich, Thema) – macht gleichnamige Tests unterscheidbar */
export function testThema(doc: Pick<TestDocument, 'header' | 'settings'>): string {
  const teile = [doc.header.ueberthemaAus ? '' : doc.header.ueberthema || doc.header.themenbereich || '', doc.settings.topic || '', doc.header.subtitle || '']
    .map((t) => t.trim())
    .filter(Boolean)
  return [...new Set(teile)].join(' – ')
}

/** Namensvorschlag statt „Vocabulary Test": Thema und Klasse */
export function testNameVorschlag(doc: Pick<TestDocument, 'header' | 'settings'>): string {
  const thema = testThema(doc)
  const titel = (doc.header.title || 'Vokabeltest').trim()
  if (!thema) return titel
  return /^(vocabulary test|vokabeltest|test|vocab test)$/i.test(titel) ? `Vokabeltest ${thema}` : `${titel} – ${thema}`
}

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
  const [titel, setTitel] = useState(() => testNameVorschlag(doc))
  const figurWahl = vokabeltestFigur(doc)
  const maskottchenGeladen = useMaskottchen((s) => s.geladen)
  useEffect(() => {
    if (!maskottchenGeladen) void useMaskottchen.getState().lade()
  }, [maskottchenGeladen])
  const winkend = maskottchenBild(figurWahl?.maskottchenId ?? doc.header.illustrationen?.maskottchenId, 'winkend')
  const jubelnd = maskottchenBild(figurWahl?.maskottchenId ?? doc.header.illustrationen?.maskottchenId, 'jubelnd')
  const [mitFigur, setMitFigur] = useState(Boolean(figurWahl))
  const [handschrift, setHandschrift] = useState(true)
  // Etappe 3 (02.10.2026): nur mit Schülerkonto oder auch Gäste mit Namen
  const [gaeste, setGaeste] = useState(true)
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
        thema: testThema(doc),
        test: doc,
        lerngruppeId: gruppe ?? '',
        ...(mitFigur && winkend ? { figur: { winkend, ...(jubelnd ? { jubelnd } : {}) } } : {}),
        handschrift,
        gaeste,
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
          <Text>
            Der Test ist angelegt. Die Lernenden scannen den QR-Code oder öffnen den Link und landen im Wartebildschirm. Gestartet wird für alle gemeinsam in der App „Onlinetest“.
          </Text>
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
              Zum Start und Live-Stand
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <TextInput label="Name des Tests" description="So steht er in der Liste der Onlinetests und bei den Lernenden." value={titel} onChange={(e) => setTitel(e.currentTarget.value)} />
          <Select
            label="Lerngruppe"
            description="Nur Mitglieder dieser Lerngruppe können teilnehmen; die Ergebnisse stehen in ihrer Historie. Ohne Lerngruppe: jeder mit Code."
            data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
            value={gruppe}
            onChange={setGruppe}
            clearable
            placeholder={gruppen.length ? 'wählen …' : 'noch keine – in der App „Onlinetest“ anlegen'}
          />
          <Radio.Group
            label="Wer darf teilnehmen?"
            value={gaeste ? 'gaeste' : 'konto'}
            onChange={(v) => setGaeste(v === 'gaeste')}
            description="Nur mit Konto: Die Ergebnisse stehen bei den Lernenden unter „Meine Ergebnisse“. Gäste geben per QR-Code nur ihren Namen ein (Vorname + Anfangsbuchstabe)."
          >
            <Group mt={6}>
              <Radio value="konto" label="nur mit Schülerkonto" data-nur-konto />
              <Radio value="gaeste" label="auch Gäste mit Namen" />
            </Group>
          </Radio.Group>
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
          {winkend && (
            <Group gap="sm" wrap="nowrap">
              <Checkbox label="Figur zeigen (Wartebildschirm, Kopf, Ergebnis)" checked={mitFigur} onChange={(e) => setMitFigur(e.currentTarget.checked)} data-figur-wahl />
              {mitFigur && <Image src={winkend} h={48} w="auto" fit="contain" alt="" />}
            </Group>
          )}
          <Checkbox
            label="Handschrift erlauben (Stift oder Finger, mit Erkennung)"
            description="Die Erkennung läuft über den eigenen KI-Zugang (API-Schlüssel oder Abo). Die Schrift bleibt gespeichert und ist in der Durchsicht zu sehen."
            checked={handschrift}
            onChange={(e) => setHandschrift(e.currentTarget.checked)}
            data-handschrift-wahl
          />
          <Alert variant="light">
            Wer während des Tests die Seite verlässt (anderer Tab, andere App), gibt automatisch ab. Nach jeder Abgabe wertet die KI aus (eigener KI-Zugang, ohne Namen);
            kleine Fehler und abweichende, sinnvolle Antworten entscheidet die Lehrkraft – halbe Punkte gibt es nicht.
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
