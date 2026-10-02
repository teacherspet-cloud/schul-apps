/**
 * „Lernende reichen selbst ein" (02.10.2026, nur mit dem Schul-Apps-Server; Server:
 * src/server/schuelerfeedback.ts).
 *
 * Die Lehrkraft gibt diese Rückmeldung (Aufgabe, Erwartung, Formen) für eine Lerngruppe frei.
 * Die Lernenden schreiben im Schülerbereich, fordern Feedback an, überarbeiten und fordern
 * erneut an (so oft, wie die Lehrkraft erlaubt). Mit „Abgaben holen" landen die jeweils neuesten
 * Fassungen samt Bogen hier als Abgaben – zum Durchsehen, Bearbeiten und Ausgeben wie immer.
 *
 * Etappe 4 (02.10.2026): an die ganze Lerngruppe ODER an einzelne Lernende; auf Wunsch Gäste per
 * QR-Code und Namen (solange IServ nicht eingerichtet ist). KI: Zugang der Lehrkraft, auch Abo.
 */
import { Alert, Badge, Button, Card, Checkbox, Group, Modal, MultiSelect, NumberInput, Select, Stack, Text, Title } from '@mantine/core'
import { IconDownload, IconQrcode, IconSend } from '@tabler/icons-react'
import { Zugang } from '../../onlinetest/OnlinetestModule'
import { useCallback, useEffect, useState } from 'react'
import type { Abgabe, Bogen, Rueckmeldung } from '../model/types'
import { aufServer } from '../../../shared/plattform'
import { holen, senden } from '../../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../../shared/util'
import { newId } from '../../vokabeltest/model/random'

interface FreigabeListe {
  id: string
  titel: string
  status: string
  runden: number
  lerngruppe: string
  abgaben: number
  /** Zahl ausgewählter Lernender (0 = ganze Lerngruppe) */
  schueler?: number
  code?: string
  link?: string
}

export default function LernendeKarte({ r, update }: { r: Rueckmeldung; update: (fn: (d: Rueckmeldung) => void) => void }): React.JSX.Element | null {
  const [gruppen, setGruppen] = useState<{ id: string; name: string }[]>([])
  const [liste, setListe] = useState<FreigabeListe[]>([])
  const [gruppe, setGruppe] = useState<string | null>(null)
  const [runden, setRunden] = useState(2)
  const [mitglieder, setMitglieder] = useState<{ benutzer: string; name: string }[]>([])
  const [einzelne, setEinzelne] = useState<string[]>([])
  const [gaeste, setGaeste] = useState(false)
  const [qr, setQr] = useState<{ titel: string; code: string; link: string } | null>(null)
  useEffect(() => {
    setEinzelne([])
    if (!gruppe) return setMitglieder([])
    void holen<{ mitglieder: { benutzer: string; name: string }[] }>(`/server/feedback/mitglieder?gruppe=${encodeURIComponent(gruppe)}`).then(
      (d) => setMitglieder(d.mitglieder),
      () => setMitglieder([])
    )
  }, [gruppe])
  const laden = useCallback(() => {
    void holen<{ freigaben: FreigabeListe[] }>('/server/feedback').then((d) => setListe(d.freigaben), () => setListe([]))
  }, [])
  useEffect(() => {
    if (!aufServer()) return
    void holen<{ gruppen: { id: string; name: string }[] }>('/server/lerngruppen').then((d) => setGruppen(d.gruppen), () => setGruppen([]))
    laden()
  }, [laden])
  if (!aufServer()) return null

  const freigeben = async (): Promise<void> => {
    try {
      const titel = r.meta.title || r.grundlage.titel
      const neu = await senden<{ id: string; code?: string; link?: string }>('/server/feedback/freigeben', {
        rueckmeldung: r,
        lerngruppeId: gruppe ?? '',
        schueler: einzelne,
        gaeste,
        runden,
        titel
      })
      notifySuccess('Freigegeben – die Lernenden finden die Aufgabe im Schülerbereich unter „Rückmeldung“.')
      if (neu.code && neu.link) setQr({ titel: titel || 'Aufgabe', code: neu.code, link: neu.link })
      laden()
    } catch (e) {
      notifyError(e)
    }
  }

  const abholen = async (id: string): Promise<void> => {
    try {
      const d = await holen<{ abgaben: { name: string; benutzer: string; fassungen: { nr: number; text: string; bogen?: Bogen }[] }[] }>(`/server/feedback/${id}`)
      let neu = 0
      update((doc) => {
        for (const a of d.abgaben) {
          const letzte = a.fassungen[a.fassungen.length - 1]
          if (!letzte) continue
          const kennung = `online:${id}:${a.benutzer}`
          const vorhanden = doc.abgaben.find((x) => x.dateiname === kennung)
          const daten: Partial<Abgabe> = { text: letzte.text, ...(letzte.bogen ? { bogen: letzte.bogen } : {}) }
          if (vorhanden) Object.assign(vorhanden, daten)
          else {
            const nr = Math.max(0, ...doc.abgaben.map((x) => Number(/^S(\d+)$/.exec(x.kuerzel)?.[1] ?? 0))) + 1
            doc.abgaben.push({ id: newId(), kuerzel: `S${nr}`, name: a.name || a.benutzer, dateiname: kennung, text: letzte.text, bilder: [], ...(letzte.bogen ? { bogen: letzte.bogen } : {}) })
            neu++
          }
        }
      })
      notifySuccess(`${d.abgaben.length} Abgabe${d.abgaben.length === 1 ? '' : 'n'} geholt (${neu} neu, jeweils die neueste Fassung).`)
    } catch (e) {
      notifyError(e)
    }
  }

  return (
    <Card withBorder data-lernende-karte>
      <Title order={4} mb="xs">
        Lernende reichen selbst ein
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Die Lernenden schreiben ihre Lösung im Schülerbereich und bekommen sofort Feedback – ohne Notenvorschlag. Danach können sie überarbeiten und erneut
        Feedback anfordern. Die Anfragen laufen über den KI-Zugang der Lehrkraft (Schlüssel oder Abo), ohne Namen.
      </Text>
      <Group align="end" mb="md">
        <Select
          label="Lerngruppe"
          data={gruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={gruppe}
          onChange={setGruppe}
          clearable
          placeholder={gruppen.length ? 'wählen …' : 'in der App „Onlinetest“ anlegen'}
          w={220}
        />
        <NumberInput label="Feedback-Runden je Person" min={1} max={10} value={runden} onChange={(v) => setRunden(Number(v) || 2)} w={180} />
        <Button
          leftSection={<IconSend size={16} />}
          disabled={(!gruppe && !gaeste) || !r.grundlage.aufgaben.trim()}
          onClick={() => void freigeben()}
          data-feedback-freigeben
        >
          Freigeben
        </Button>
      </Group>
      {gruppe && (
        <MultiSelect
          mb="sm"
          label="Nur für einzelne Lernende"
          description="Leer lassen = die ganze Lerngruppe."
          data={mitglieder.map((m) => ({ value: m.benutzer, label: m.name }))}
          value={einzelne}
          onChange={setEinzelne}
          searchable
          clearable
          placeholder={mitglieder.length ? 'alle' : 'noch niemand in der Lerngruppe'}
          data-einzelne
        />
      )}
      <Checkbox
        mb="md"
        label="Auch Gäste per QR-Code und Namen (ohne Konto)"
        description="Die Lernenden scannen den QR-Code und geben Vorname + Anfangsbuchstaben ein. Lernende mit Konto kommen über denselben Code direkt hinein."
        checked={gaeste}
        onChange={(e) => setGaeste(e.currentTarget.checked)}
        data-feedback-gaeste
      />
      {!r.grundlage.aufgaben.trim() && (
        <Alert color="orange" mb="sm">
          Zuerst die Aufgabenstellung eintragen – sie sehen die Lernenden.
        </Alert>
      )}
      <Stack gap={6}>
        {liste.map((f) => (
          <Group key={f.id} justify="space-between">
            <div>
              <Text size="sm" fw={600}>
                {f.titel}
              </Text>
              <Text size="xs" c="dimmed">
                {[f.lerngruppe && (f.schueler ? `${f.lerngruppe} (${f.schueler} ausgewählt)` : f.lerngruppe), f.code && 'Gäste per QR']
                  .filter(Boolean)
                  .join(' · ')}{' '}
                · {f.runden} Runden · {f.abgaben} Abgabe{f.abgaben === 1 ? '' : 'n'}{' '}
                {f.status !== 'offen' && (
                  <Badge size="xs" color="gray">
                    beendet
                  </Badge>
                )}
              </Text>
            </div>
            <Group gap={4}>
              {f.code && f.link && (
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconQrcode size={14} />}
                  onClick={() => setQr({ titel: f.titel, code: f.code!, link: f.link! })}
                >
                  QR-Code
                </Button>
              )}
              <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => void abholen(f.id)}>
                Abgaben holen
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => void senden(`/server/feedback/${f.id}/status`, { status: f.status === 'offen' ? 'beendet' : 'offen' }).then(laden, (e: unknown) => notifyError(e))}
              >
                {f.status === 'offen' ? 'Beenden' : 'Wieder öffnen'}
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
      {qr && (
        <Modal opened onClose={() => setQr(null)} title={qr.titel} size="lg">
          <Zugang code={qr.code} link={qr.link} />
        </Modal>
      )}
    </Card>
  )
}
