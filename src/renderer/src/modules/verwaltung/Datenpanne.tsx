/**
 * Verwaltung › Schule › Datenpanne melden (22.10.2026, Prüfung des Schulträgers, Punkt 12 – Art. 33/34 DSGVO;
 * Regeln: shared/datenpanne.ts, Speicher: server/datenpanne.ts, verschlüsselt, nur Admins).
 *  - Formular: was ist passiert, wann entdeckt, betroffene Daten und Personen (Anzahl), Maßnahmen, Risiko
 *  - 72-Stunden-Frist ab der Entdeckung als Countdown, Checkliste zum Abhaken
 *  - vorbefüllter Text für das Online-Formular der LfD Niedersachsen (kopieren/drucken – gesendet wird nichts)
 *  - Liste vergangener Vorfälle (Dokumentationspflicht Art. 33 Abs. 5)
 */
import { Alert, Anchor, Badge, Button, Checkbox, Group, Loader, NumberInput, Paper, SegmentedControl, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconCopy, IconPrinter } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import {
  CHECKLISTE,
  fristStand,
  LFD_ADRESSE,
  lfdMeldetext,
  noetigePunkte,
  offenePunkte,
  PRUEF_JAHRE,
  pruefFaellig,
  RISIKO_TEXT,
  type CheckPunkt,
  type Datenpanne as Panne,
  type PannenRisiko
} from '@shared/datenpanne'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'

/** Wert für <input type="datetime-local"> in Ortszeit */
const alsEingabe = (ms: number): string => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}
const datumZeit = (ms: number): string =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const LEER = { was: '', wannPassiert: '', entdeckt: '', datenarten: '', personen: 0, datensaetze: 0, massnahmen: '', risiko: 'risiko' as PannenRisiko }

function drucken(text: string): void {
  const f = document.createElement('iframe')
  f.style.position = 'fixed'
  f.style.width = '0'
  f.style.height = '0'
  f.style.border = '0'
  document.body.appendChild(f)
  const doc = f.contentDocument
  if (!doc) return
  const pre = doc.createElement('pre')
  pre.textContent = text
  pre.style.cssText = 'white-space: pre-wrap; font: 11pt/1.45 system-ui, sans-serif;'
  doc.body.appendChild(pre)
  f.contentWindow?.print()
  window.setTimeout(() => f.remove(), 1000)
}

export function Datenpanne(): React.JSX.Element {
  const [liste, setListe] = useState<Panne[] | null>(null)
  const [neu, setNeu] = useState(false)
  const [form, setForm] = useState({ ...LEER, entdeckt: alsEingabe(Date.now()) })
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState<string | null>(null)
  const [, setTakt] = useState(0)

  const laden = useCallback(() => {
    void holen<{ pannen: Panne[] }>('/server/datenpannen')
      .then((d) => setListe(d.pannen ?? []))
      .catch((e: unknown) => {
        setListe([])
        notifyError(e)
      })
  }, [])
  useEffect(laden, [laden])
  // Countdown: jede halbe Minute neu zeichnen
  useEffect(() => {
    const t = window.setInterval(() => setTakt((x) => x + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const anlegen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const r = await senden<{ panne: Panne }>('/server/datenpannen/neu', { ...form, entdeckt: new Date(form.entdeckt).getTime() })
      setListe([r.panne, ...(liste ?? [])])
      setOffen(r.panne.id)
      setNeu(false)
      setForm({ ...LEER, entdeckt: alsEingabe(Date.now()) })
      notifySuccess('Vorfall dokumentiert.')
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }

  const aendern = async (id: string, teil: Record<string, unknown>): Promise<void> => {
    try {
      const r = await senden<{ panne: Panne }>('/server/datenpannen/aendern', { id, ...teil })
      setListe((l) => (l ?? []).map((p) => (p.id === id ? r.panne : p)))
    } catch (e) {
      notifyError(e)
    }
  }

  const laufend = (liste ?? []).filter((p) => !p.abgeschlossen)
  // Prüffrist (23.10.2026): seit mehr als drei Jahren abgeschlossen
  const zuPruefen = (liste ?? []).filter((p) => pruefFaellig(p))
  const loeschen = async (id: string): Promise<void> => {
    if (!window.confirm('Diesen dokumentierten Vorfall endgültig löschen?')) return
    try {
      await senden('/server/datenpannen/loeschen', { id })
      setListe((l) => (l ?? []).filter((p) => p.id !== id))
      notifySuccess('Vorfall gelöscht.')
    } catch (e) {
      notifyError(e)
    }
  }
  const dringend = laufend.some((p) => offenePunkte(p).includes('lfd') && !fristStand(p.entdeckt).abgelaufen)
  return (
    <KlappKarte
      id="verwaltung-datenpanne"
      dauerhaft
      titel="Datenpanne melden"
      status={liste === null ? 'Art. 33/34 DSGVO' : laufend.length ? `${laufend.length} offen` : liste.length ? `${liste.length} dokumentiert` : 'kein Vorfall'}
      ton={laufend.length ? 'warnung' : 'neutral'}
      rahmen={{ 'data-datenpanne': true }}
    >
      {liste === null ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Eine Verletzung des Schutzes personenbezogener Daten (z. B. verlorener Stick mit Noten, falsch versandte Liste, unbefugter Zugriff) ist binnen
            72 Stunden nach Bekanntwerden an die Landesbeauftragte für den Datenschutz Niedersachsen zu melden, außer sie führt voraussichtlich zu keinem
            Risiko. Dokumentiert wird jeder Vorfall (Art. 33 Abs. 5 DSGVO). Die Angaben liegen verschlüsselt auf dem Server; sichtbar nur für die
            Verwaltung.
          </Text>
          {zuPruefen.length > 0 && (
            <Alert color="orange" data-datenpanne-prueffrist={zuPruefen.length}>
              {zuPruefen.length === 1 ? 'Ein Vorfall ist' : `${zuPruefen.length} Vorfälle sind`} seit mehr als {PRUEF_JAHRE} Jahren abgeschlossen. Bitte prüfen, ob
              die Dokumentation noch gebraucht wird (z. B. laufendes Verfahren, Nachfrage der LfD) – sonst löschen. Automatisch gelöscht wird nichts.
            </Alert>
          )}
          {dringend && (
            <Alert color="red" icon={<IconAlertTriangle />} data-datenpanne-dringend>
              Mindestens ein Vorfall ist noch nicht an die LfD gemeldet – Frist beachten.
            </Alert>
          )}
          {!neu ? (
            <Button w="fit-content" color="red" variant="light" leftSection={<IconAlertTriangle size={16} />} onClick={() => setNeu(true)} data-datenpanne-neu>
              Neuen Vorfall erfassen
            </Button>
          ) : (
            <Paper withBorder p="sm" radius="md" data-datenpanne-formular>
              <Stack gap="xs">
                <Textarea
                  label="Was ist passiert?"
                  description="Art des Vorfalls, Ursache, Umstände – nur so viele Personenangaben wie nötig (keine Namen Betroffener, wenn es ohne geht)"
                  autosize
                  minRows={3}
                  required
                  value={form.was}
                  onChange={(e) => setForm({ ...form, was: e.currentTarget.value })}
                />
                <Group grow align="flex-start">
                  <TextInput
                    type="datetime-local"
                    label="Entdeckt am"
                    description="Ab hier laufen die 72 Stunden"
                    required
                    value={form.entdeckt}
                    onChange={(e) => setForm({ ...form, entdeckt: e.currentTarget.value })}
                  />
                  <TextInput
                    label="Passiert am (falls bekannt)"
                    description="z. B. „etwa 14.10., nachmittags“"
                    value={form.wannPassiert}
                    onChange={(e) => setForm({ ...form, wannPassiert: e.currentTarget.value })}
                  />
                </Group>
                <TextInput
                  label="Betroffene Daten"
                  description="z. B. Namen, Noten, Förderbedarf, Zugangsdaten"
                  value={form.datenarten}
                  onChange={(e) => setForm({ ...form, datenarten: e.currentTarget.value })}
                />
                <Group grow>
                  <NumberInput label="Betroffene Personen (ungefähr)" min={0} value={form.personen} onChange={(v) => setForm({ ...form, personen: Number(v) || 0 })} />
                  <NumberInput label="Betroffene Datensätze (ungefähr)" min={0} value={form.datensaetze} onChange={(v) => setForm({ ...form, datensaetze: Number(v) || 0 })} />
                </Group>
                <Textarea
                  label="Ergriffene und geplante Maßnahmen"
                  autosize
                  minRows={2}
                  value={form.massnahmen}
                  onChange={(e) => setForm({ ...form, massnahmen: e.currentTarget.value })}
                />
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Einschätzung des Risikos
                  </Text>
                  <SegmentedControl
                    value={form.risiko}
                    onChange={(v) => setForm({ ...form, risiko: v as PannenRisiko })}
                    data={[
                      { value: 'kein', label: 'Kein Risiko' },
                      { value: 'risiko', label: 'Risiko' },
                      { value: 'hoch', label: 'Hohes Risiko' }
                    ]}
                  />
                  <Text size="xs" c="dimmed">
                    {RISIKO_TEXT[form.risiko]}. Im Zweifel melden.
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Button loading={laeuft} disabled={form.was.trim().length < 5 || !form.entdeckt} onClick={() => void anlegen()} data-datenpanne-anlegen>
                    Vorfall speichern
                  </Button>
                  <Button variant="subtle" onClick={() => setNeu(false)}>
                    Abbrechen
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}
          {liste.length > 0 && (
            <Text size="sm" fw={600} mt="xs">
              Dokumentierte Vorfälle
            </Text>
          )}
          {liste.map((p) => (
            <PanneKarte
              key={p.id}
              p={p}
              offen={offen === p.id}
              umschalten={() => setOffen(offen === p.id ? null : p.id)}
              aendern={(t) => aendern(p.id, t)}
              loeschen={() => void loeschen(p.id)}
            />
          ))}
        </Stack>
      )}
    </KlappKarte>
  )
}

function PanneKarte({
  p,
  offen,
  umschalten,
  aendern,
  loeschen
}: {
  p: Panne
  offen: boolean
  umschalten: () => void
  aendern: (t: Record<string, unknown>) => Promise<void>
  loeschen: () => void
}): React.JSX.Element {
  const f = fristStand(p.entdeckt)
  const fehlt = offenePunkte(p)
  const noetig = noetigePunkte(p.risiko)
  const lfdFehlt = fehlt.includes('lfd')
  const [massnahmen, setMassnahmen] = useState(p.massnahmen)
  useEffect(() => setMassnahmen(p.massnahmen), [p.massnahmen])
  const text = lfdMeldetext(p)
  const kopieren = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      notifySuccess('Meldetext kopiert.')
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Paper withBorder p="sm" radius="md" data-datenpanne-eintrag={p.id}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Text fw={600} lineClamp={offen ? undefined : 1}>
              {p.was}
            </Text>
            <Text size="xs" c="dimmed">
              Entdeckt {datumZeit(p.entdeckt)} · {p.personen} Personen · {p.datensaetze} Datensätze{p.von ? ` · erfasst von ${p.von}` : ''}
            </Text>
          </div>
          <Group gap={6} wrap="nowrap">
            {p.abgeschlossen && pruefFaellig(p) ? (
              <Badge color="orange" variant="light" data-datenpanne-pruefen>
                Prüffrist erreicht
              </Badge>
            ) : p.abgeschlossen ? (
              <Badge color="gray" variant="light">
                abgeschlossen
              </Badge>
            ) : lfdFehlt ? (
              <Badge color={f.abgelaufen || f.dringend ? 'red' : 'orange'} variant={f.abgelaufen ? 'filled' : 'light'} data-datenpanne-frist={f.abgelaufen ? 'abgelaufen' : 'laeuft'}>
                Meldung LfD: {f.text}
              </Badge>
            ) : (
              <Badge color="teal" variant="light">
                {p.risiko === 'kein' ? 'ohne Meldung' : 'gemeldet'}
              </Badge>
            )}
            <Button size="compact-xs" variant="subtle" onClick={umschalten} aria-expanded={offen}>
              {offen ? 'Zuklappen' : 'Details'}
            </Button>
          </Group>
        </Group>
        {offen && (
          <>
            <Text size="sm">Frist bis {datumZeit(f.bis)} ({f.text}).</Text>
            <Text size="sm">Betroffene Daten: {p.datenarten || '–'}</Text>
            <Text size="sm">Risiko: {RISIKO_TEXT[p.risiko]}</Text>
            <Stack gap={4} data-datenpanne-checkliste>
              <Text size="sm" fw={600}>
                Checkliste
              </Text>
              {CHECKLISTE.map((c) => (
                <Checkbox
                  key={c.id}
                  label={
                    c.id === 'lfd' ? (
                      <>
                        {c.text} –{' '}
                        <Anchor href={LFD_ADRESSE} target="_blank" rel="noreferrer">
                          lfd.niedersachsen.de
                        </Anchor>
                      </>
                    ) : (
                      c.text
                    )
                  }
                  description={
                    p.erledigt[c.id as CheckPunkt]
                      ? `erledigt ${datumZeit(p.erledigt[c.id as CheckPunkt]!)}`
                      : noetig.includes(c.id as CheckPunkt)
                        ? undefined
                        : 'bei dieser Risikoeinschätzung nicht erforderlich'
                  }
                  checked={Boolean(p.erledigt[c.id as CheckPunkt])}
                  onChange={(e) => void aendern({ erledigt: { [c.id]: e.currentTarget.checked ? Date.now() : 0 } })}
                  data-datenpanne-punkt={c.id}
                />
              ))}
            </Stack>
            <Textarea label="Maßnahmen" autosize minRows={2} value={massnahmen} onChange={(e) => setMassnahmen(e.currentTarget.value)} />
            {massnahmen !== p.massnahmen && (
              <Button size="xs" w="fit-content" onClick={() => void aendern({ massnahmen })}>
                Maßnahmen speichern
              </Button>
            )}
            <Text size="sm" fw={600}>
              Text für die Meldung an die LfD
            </Text>
            <Textarea value={text} readOnly autosize minRows={6} maxRows={16} styles={{ input: { fontSize: 12 } }} data-datenpanne-meldetext />
            <Group gap="xs">
              <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={() => void kopieren()}>
                Text kopieren
              </Button>
              <Button size="xs" variant="light" leftSection={<IconPrinter size={14} />} onClick={() => drucken(text)}>
                Drucken
              </Button>
              <Button size="xs" variant="subtle" component="a" href={LFD_ADRESSE} target="_blank" rel="noreferrer">
                Zur LfD Niedersachsen
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => void aendern({ abgeschlossen: !p.abgeschlossen })} data-datenpanne-abschliessen>
                {p.abgeschlossen ? 'Wieder öffnen' : 'Vorfall abschließen'}
              </Button>
              {pruefFaellig(p) && (
                <Button size="xs" variant="subtle" color="red" onClick={loeschen} data-datenpanne-loeschen>
                  Nach Prüfung löschen
                </Button>
              )}
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  )
}
