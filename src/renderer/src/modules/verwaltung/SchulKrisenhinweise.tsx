import { Button, Group, Loader, MultiSelect, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'

interface Lehrkraft {
  id: string
  name: string
  benutzer: string
}

interface Einstellung {
  vertrauen: string[]
  kette: string
}

const KETTE_MAX = 1500

/**
 * Verwaltung › Schule › Krisenhinweise (23.10.2026, Prüfung des Schulträgers, Meldeweg nach § 4 KKG – server/krise.ts):
 * Der Admin wählt eine oder mehrere Vertrauenspersonen (Beratungslehrkraft, Schulsozialarbeit – Konten mit Rolle
 * Lehrkraft), die jeden vertraulichen Hinweis der Schule zusätzlich bekommen (Name, Ort, Zeit – nie Wortlaut), und
 * hinterlegt die Meldekette der Schule als freien Text; er steht in jeder Hinweiskarte. Schulweit, bewusst einfach.
 */
export function SchulKrisenhinweise(): React.JSX.Element {
  const [daten, setDaten] = useState<(Einstellung & { lehrkraefte: Lehrkraft[] }) | null>(null)
  const [kette, setKette] = useState('')
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    void holen<Partial<Einstellung> & { lehrkraefte?: Lehrkraft[] }>('/server/krisen/einstellung')
      .then((d) => {
        setDaten({ vertrauen: d.vertrauen ?? [], kette: d.kette ?? '', lehrkraefte: d.lehrkraefte ?? [] })
        setKette(d.kette ?? '')
      })
      .catch((e: unknown) => {
        setDaten({ vertrauen: [], kette: '', lehrkraefte: [] })
        notifyError(e)
      })
  }, [])

  const auswahl = useMemo(
    () => (daten?.lehrkraefte ?? []).map((l) => ({ value: l.id, label: l.name || l.benutzer })).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [daten?.lehrkraefte]
  )

  const speichern = async (teil: Partial<Einstellung>, meldung?: string): Promise<void> => {
    if (!daten) return
    setSpeichert(true)
    try {
      const r = await senden<Einstellung>('/server/krisen/einstellung', teil)
      setDaten({ ...daten, vertrauen: r.vertrauen, kette: r.kette })
      setKette(r.kette)
      if (meldung) notifySuccess(meldung)
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  const zahl = daten?.vertrauen.length ?? 0
  return (
    <KlappKarte
      id="verwaltung-krisenhinweise"
      dauerhaft
      titel="Krisenhinweise"
      status={daten === null ? 'Meldeweg nach § 4 KKG' : zahl ? `${zahl} ${zahl === 1 ? 'Vertrauensperson' : 'Vertrauenspersonen'}` : 'keine Vertrauensperson gewählt'}
      ton={daten !== null && !zahl ? 'warnung' : 'neutral'}
      rahmen={{ 'data-schul-krisenhinweise': true }}
    >
      {daten === null ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Äußert ein Kind etwas zu Not oder Selbstgefährdung, bekommt die zuständige Lehrkraft einen vertraulichen Hinweis (Name, Ort, Zeit – nie der
            Wortlaut). Die hier gewählten Vertrauenspersonen bekommen jeden Hinweis der Schule zusätzlich. Benachrichtigungen enthalten keine Namen;
            nach 24 Stunden ohne „Gesehen“ folgt eine Erinnerung. Hinweise werden nach 30 Tagen gelöscht.
          </Text>
          <MultiSelect
            label="Vertrauenspersonen (z. B. Beratungslehrkraft, Schulsozialarbeit)"
            data={auswahl}
            value={daten.vertrauen}
            placeholder={daten.vertrauen.length ? '' : 'Lehrkraft wählen …'}
            searchable
            clearable
            disabled={speichert}
            onChange={(ids) => void speichern({ vertrauen: ids })}
            data-krisen-vertrauen
          />
          <Textarea
            label="Meldekette der Schule"
            description="Erscheint in jeder Hinweiskarte vor den allgemeinen Hinweisen."
            placeholder={'Beratungslehrkraft Frau X, Raum Y, Sprechzeit …\nSchulsozialarbeit Herr Z, Tel. …\nSchulleitung …\nNotfall: 112'}
            autosize
            minRows={4}
            maxRows={10}
            maxLength={KETTE_MAX}
            value={kette}
            onChange={(e) => setKette(e.currentTarget.value)}
            data-krisen-kette-eingabe
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {kette.length}/{KETTE_MAX}
            </Text>
            <Button size="xs" disabled={speichert || kette === daten.kette} onClick={() => void speichern({ kette }, 'Meldekette gespeichert')} data-krisen-kette-speichern>
              Speichern
            </Button>
          </Group>
        </Stack>
      )}
    </KlappKarte>
  )
}
