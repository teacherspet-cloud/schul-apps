/**
 * Hinweis zum Schuljahreswechsel in „Meine Klassen" (10.10.2026, src/server/schuljahrWechsel.ts): welche Lerngruppen
 * aufgerückt sind („5b → 6b"), welche als Abschlussjahrgang beendet wurden und welche IServ-Gruppen noch auf ihre
 * Nachfolgegruppe warten – mit „Rückgängig" (14 Tage) und „Ausblenden". Lernstände bleiben in jedem Fall erhalten.
 */
import { Alert, Button, Group, List, Text } from '@mantine/core'
import { IconSchool } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'

interface Hinweis {
  schuljahr: string
  zeit: number
  bis: number
  status: 'aktiv' | 'rueckgaengig'
  rueckgaengigMoeglich: boolean
  eintraege: { alt: string; neu: string | null; fach: string; art: 'umbenannt' | 'abschluss' | 'wartet' | 'iserv' | 'unklar'; wechsler: number; wiederholer: number; rueckgaengig: boolean }[]
  uebernommen: number
}

const zeile = (e: Hinweis['eintraege'][number]): string => {
  const fach = e.fach ? ` (${e.fach})` : ''
  if (e.rueckgaengig) return `${e.alt}${fach}: zurückgenommen`
  if (e.art === 'abschluss') return `${e.alt}${fach}: Abschlussjahrgang – Kurse beendet, Daten bleiben zum Ansehen`
  if (e.art === 'wartet') return `${e.alt}${fach}: IServ-Gruppe – wartet auf die neue Gruppe in IServ`
  if (e.art === 'unklar') return `${e.alt}${fach}: IServ-Gruppe – keine eindeutige neue Gruppe gefunden, bitte von Hand anpassen`
  const extra = [e.wechsler ? `${e.wechsler} in eine andere Klasse gewechselt` : '', e.wiederholer ? `${e.wiederholer} im alten Jahrgang` : ''].filter(Boolean).join(', ')
  return `${e.alt} → ${e.neu}${fach}${e.art === 'iserv' ? ' (nach IServ)' : ''}${extra ? ` – ${extra}` : ''}`
}

export function SchuljahrHinweis({ geaendert }: { geaendert: () => void }): React.JSX.Element | null {
  const [h, setH] = useState<Hinweis | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    void holen<{ wechsel: Hinweis | null }>('/server/schuljahr').then(
      (d) => setH(d.wechsel),
      () => setH(null)
    )
  }, [])
  if (!h || !h.eintraege.length) return null
  const rueckgaengig = async (): Promise<void> => {
    if (!window.confirm('Den Schuljahreswechsel für die eigenen Lerngruppen zurücknehmen? Namen, IServ-Verknüpfung und Kurse stehen danach wieder wie vorher.')) return
    setLaeuft(true)
    try {
      const r = await senden<{ wechsel: Hinweis | null }>('/server/schuljahr/rueckgaengig', {})
      setH(r.wechsel)
      notifySuccess('Schuljahreswechsel zurückgenommen.')
      geaendert()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const ausblenden = async (): Promise<void> => {
    await senden('/server/schuljahr/ausblenden', {}).catch(() => undefined)
    setH(null)
  }
  const bis = new Date(h.bis).toLocaleDateString('de-DE')
  return (
    <Alert icon={<IconSchool size={18} />} color={h.status === 'aktiv' ? 'teal' : 'gray'} title={`Neues Schuljahr ${h.schuljahr}`} mb="md" data-schuljahr-hinweis={h.status}>
      <Text size="sm" mb={6}>
        {h.status === 'aktiv'
          ? 'Die Klassen sind ins neue Schuljahr übernommen. Lernstände, Kurse, Vokabelweg und Abzeichen der Lernenden bleiben erhalten.'
          : 'Der Schuljahreswechsel ist zurückgenommen.'}
      </Text>
      <List size="sm" spacing={2} mb={6} data-schuljahr-liste>
        {h.eintraege.map((e, i) => (
          <List.Item key={i} data-schuljahr-eintrag={e.art}>
            {zeile(e)}
          </List.Item>
        ))}
      </List>
      {h.uebernommen > 0 && (
        <Text size="xs" c="dimmed" mb={6}>
          Lernstand von Lernenden, die die Klasse gewechselt haben, in {h.uebernommen} Kurs{h.uebernommen === 1 ? '' : 'e'} der neuen Klasse übernommen.
        </Text>
      )}
      <Group gap="xs">
        {h.rueckgaengigMoeglich && (
          <Button size="xs" variant="light" color="orange" loading={laeuft} onClick={() => void rueckgaengig()} data-schuljahr-rueckgaengig>
            Rückgängig (bis {bis})
          </Button>
        )}
        <Button size="xs" variant="subtle" color="gray" onClick={() => void ausblenden()} data-schuljahr-ausblenden>
          Ausblenden
        </Button>
      </Group>
    </Alert>
  )
}
