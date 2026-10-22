/**
 * Transkript für Lernende an der Hörtext-Freigabe (23.10.2026, Barrierefreiheit/Nachteilsausgleich, Entscheidung der
 * Lehrkraft): je Freigabe aus (Vorgabe), für alle oder nur für ausgewählte Lernende. Der Server entscheidet auf der
 * Abspielseite /h/<kennung> aus der Sitzung, ob der Knopf „Transkript anzeigen" erscheint (src/server/hoertexte.ts).
 * Beim Speichern geht das Skript des Hörtexts mit – so passt das Transkript auch zu eingelesenen Hördateien.
 */
import { Badge, Button, Group, MultiSelect, SegmentedControl, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { holen, senden } from '../../onlinetest/serverApi'
import { useAlleLernenden } from '../../lernen/LernendeWahl'
import { notifyError, notifySuccess } from '../../../shared/util'

type Wer = 'aus' | 'alle' | 'einzelne'
interface Einstellung {
  wer: Wer
  schueler: string[]
  hatText: boolean
}

/** Kennung einer Server-Hörtext-Adresse (…/h/<kennung>) oder null */
export const hoertextKennung = (url: string | undefined): string | null => /\/h\/([A-Za-z0-9_-]{16,40})$/.exec(url ?? '')?.[1] ?? null

/** Kurzfassung der Einstellung für die Lehrkraft */
export function transkriptStand(e: Pick<Einstellung, 'wer' | 'schueler'>): string {
  if (e.wer === 'alle') return 'Transkript: für alle Lernenden'
  if (e.wer === 'einzelne') return `Transkript: nur für ${e.schueler.length} ausgewählte Lernende`
  return 'Transkript: aus'
}

export function TranskriptFreigabe({ url, skript }: { url: string; skript: string }): React.JSX.Element | null {
  const kennung = hoertextKennung(url)
  const [gespeichert, setGespeichert] = useState<Einstellung | null>(null)
  const [wer, setWer] = useState<Wer>('aus')
  const [schueler, setSchueler] = useState<string[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [fehlt, setFehlt] = useState(false)
  const lernende = useAlleLernenden()

  useEffect(() => {
    if (!kennung) return
    void holen<Einstellung>(`/server/hoertext/transkript?kennung=${encodeURIComponent(kennung)}`).then(
      (e) => {
        setGespeichert(e)
        setWer(e.wer)
        setSchueler(e.schueler)
        setFehlt(false)
      },
      () => setFehlt(true)
    )
  }, [kennung])

  if (!kennung || fehlt) return null
  const geaendert = !gespeichert || gespeichert.wer !== wer || (wer === 'einzelne' && [...gespeichert.schueler].sort().join('|') !== [...schueler].sort().join('|'))
  const speichern = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const e = await senden<Einstellung>('/server/hoertext/transkript', { kennung, wer, schueler: wer === 'einzelne' ? schueler : [], text: skript })
      setGespeichert(e)
      setWer(e.wer)
      setSchueler(e.schueler)
      notifySuccess(transkriptStand(e))
    } catch (e) {
      notifyError(e, 'Die Einstellung zum Transkript konnte nicht gespeichert werden')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Stack gap={6} data-transkript-freigabe>
      <Group gap="xs">
        <Text size="sm" fw={500} id={`transkript-wahl-${kennung}`}>
          Transkript für Lernende
        </Text>
        {gespeichert && (
          <Badge size="sm" variant="light" color={gespeichert.wer === 'aus' ? 'gray' : 'teal'} data-transkript-stand={gespeichert.wer}>
            {transkriptStand(gespeichert)}
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        Auf der Abspielseite (QR-Code) erscheint dann der Knopf „Transkript anzeigen". Ohne Anmeldung und für Gastkonten nur bei „für alle"; „nur für
        ausgewählte" gilt für angemeldete Schülerkonten (z. B. Nachteilsausgleich).
      </Text>
      <SegmentedControl
        aria-labelledby={`transkript-wahl-${kennung}`}
        value={wer}
        onChange={(v) => setWer(v as Wer)}
        data={[
          { value: 'aus', label: 'aus' },
          { value: 'alle', label: 'für alle' },
          { value: 'einzelne', label: 'nur für ausgewählte' }
        ]}
        w="fit-content"
      />
      {wer === 'einzelne' && (
        <MultiSelect
          label="Ausgewählte Lernende"
          data={lernende.daten}
          value={schueler}
          onChange={setSchueler}
          searchable
          clearable
          nothingFoundMessage="Kein Schülerkonto mit diesem Namen"
          placeholder={lernende.geladen && !lernende.anzahl ? 'Noch keine Schülerkonten angelegt' : 'Namen suchen …'}
          data-transkript-lernende
        />
      )}
      {gespeichert && !gespeichert.hatText && !skript.trim() && wer !== 'aus' && (
        <Text size="xs" c="orange">
          Noch kein Skript vorhanden – ohne Text erscheint kein Transkript.
        </Text>
      )}
      <Button
        size="compact-sm"
        variant="light"
        w="fit-content"
        onClick={() => void speichern()}
        loading={laeuft}
        // Bei „für alle“/„ausgewählte“ auch ohne Änderung: übernimmt ein geändertes Skript
        disabled={(!geaendert && wer === 'aus') || (wer === 'einzelne' && !schueler.length)}
        data-transkript-speichern
      >
        Einstellung speichern
      </Button>
    </Stack>
  )
}
