import { Anchor, Badge, Button, Checkbox, Group, Loader, Stack, Table, Text, Textarea, TextInput } from '@mantine/core'
import { IconExternalLink } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { AUFSICHT_NIEDERSACHSEN, HOSTING_VORGABE, LEERE_ANGABEN, type DatenschutzAngaben } from '@shared/datenschutzInfo'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'

/**
 * Verwaltung › Schule › „Datenschutz und Impressum" (22.10.2026, Prüfung des Schulträgers, Punkt 6): Angaben für die
 * öffentlichen Seiten /datenschutz, /datenschutz/eltern und /impressum (src/server/datenschutzSeiten.ts). Leere Felder
 * erscheinen dort als rot markierte Platzhalter; gelbe Kästen „Von der Schule zu prüfen" verschwinden erst mit dem Haken
 * „geprüft". Die Empfängerliste kommt aus den freigegebenen Schlüsseln (Reiter „KI-Zugänge") – hier nur zur Ansicht.
 */
interface Empfaenger {
  id: string
  name: string
  zweck: string
  ort: string
  drittland: boolean | null
}

interface Antwort {
  angaben: DatenschutzAngaben
  schule: { name: string; strasse: string; plz: string; ort: string } | null
  empfaenger: Empfaenger[]
  iserv: boolean
}

const PFLICHT: (keyof DatenschutzAngaben)[] = ['verantwortlich', 'datenschutzbeauftragte', 'betreiber']

export function DatenschutzAngabenKarte(): React.JSX.Element {
  const [d, setD] = useState<Antwort | null>(null)
  const [f, setF] = useState<DatenschutzAngaben>(LEERE_ANGABEN)
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    void holen<Antwort>('/server/datenschutz')
      .then((a) => {
        setD(a)
        setF(a.angaben)
      })
      .catch((e: unknown) => notifyError(e))
  }, [])

  const setze = <K extends keyof DatenschutzAngaben>(k: K, v: DatenschutzAngaben[K]): void => setF((x) => ({ ...x, [k]: v }))
  const speichern = async (): Promise<void> => {
    setSpeichert(true)
    try {
      const r = await senden<{ angaben: DatenschutzAngaben }>('/server/datenschutz', f)
      setF(r.angaben)
      notifySuccess('Angaben für Datenschutz und Impressum gespeichert.')
    } catch (e) {
      notifyError(e)
    } finally {
      setSpeichert(false)
    }
  }

  const fehlend = PFLICHT.filter((k) => !String(f[k] ?? '').trim()).length + (f.schuleName.trim() || d?.schule?.name ? 0 : 1)
  const schulRueckfall = d?.schule ? [d.schule.strasse, [d.schule.plz, d.schule.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''

  return (
    <KlappKarte
      id="verwaltung-datenschutz"
      dauerhaft
      titel="Datenschutz und Impressum"
      status={!d ? 'Angaben für Datenschutzerklärung und Impressum' : fehlend ? `${fehlend} Pflichtangaben fehlen` : f.geprueft ? 'vollständig, geprüft' : 'vollständig, Prüfung offen'}
      ton={!d ? 'neutral' : fehlend || !f.geprueft ? 'warnung' : 'ok'}
      rahmen={{ 'data-datenschutz-angaben': true }}
    >
      {!d ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm">
          {/* Anmeldeseite (25.10.2026): Verweise auf Datenschutz und Impressum erst, wenn alles vollständig ist */}
          <Text size="xs" c="dimmed">
            Die Verweise auf Datenschutz, Elternfassung und Impressum erscheinen auf der Anmeldeseite erst, wenn alle Pflichtangaben eingetragen sind (hier sowie Anschrift,
            Telefon und E-Mail der Schule in der Schul-Einrichtung) und die Angaben als geprüft markiert wurden. Die Seiten selbst sind über ihre Adresse immer erreichbar.
          </Text>
          <Text size="sm" c="dimmed">
            Diese Angaben erscheinen auf den öffentlichen Seiten (ohne Anmeldung), die auf der Anmeldeseite und in den Einstellungen verlinkt sind. Leere
            Felder stehen dort als markierte Platzhalter.
          </Text>
          <Group gap="md">
            <Anchor href="/datenschutz" target="_blank" rel="noopener" size="sm">
              Datenschutzerklärung <IconExternalLink size={12} />
            </Anchor>
            <Anchor href="/datenschutz/eltern" target="_blank" rel="noopener" size="sm">
              Fassung für Eltern <IconExternalLink size={12} />
            </Anchor>
            <Anchor href="/impressum" target="_blank" rel="noopener" size="sm">
              Impressum <IconExternalLink size={12} />
            </Anchor>
          </Group>
          <TextInput
            label="Schule (Name)"
            placeholder={d.schule?.name || 'Name der Schule'}
            description={d.schule?.name ? 'Leer lassen, um den Namen aus „Schule einrichten“ zu übernehmen.' : undefined}
            value={f.schuleName}
            onChange={(e) => setze('schuleName', e.currentTarget.value)}
            data-feld="schuleName"
          />
          <Textarea
            label="Anschrift der Schule"
            placeholder={schulRueckfall || 'Straße, PLZ Ort'}
            description={schulRueckfall ? 'Leer lassen, um die Anschrift aus „Schule einrichten“ zu übernehmen.' : undefined}
            autosize
            minRows={2}
            value={f.schuleAnschrift}
            onChange={(e) => setze('schuleAnschrift', e.currentTarget.value)}
            data-feld="schuleAnschrift"
          />
          <TextInput
            label="Verantwortlich (Schulleitung)"
            placeholder="z. B. Vorname Nachname, Schulleiterin"
            withAsterisk
            value={f.verantwortlich}
            onChange={(e) => setze('verantwortlich', e.currentTarget.value)}
            data-feld="verantwortlich"
          />
          <Textarea
            label="Kontakt der/des Datenschutzbeauftragten"
            placeholder="Name, Anschrift oder Funktionspostfach, E-Mail"
            withAsterisk
            autosize
            minRows={2}
            value={f.datenschutzbeauftragte}
            onChange={(e) => setze('datenschutzbeauftragte', e.currentTarget.value)}
            data-feld="datenschutzbeauftragte"
          />
          <Textarea
            label="Betreiber / technische Ansprechperson"
            placeholder="Name, Kontakt"
            withAsterisk
            autosize
            minRows={2}
            value={f.betreiber}
            onChange={(e) => setze('betreiber', e.currentTarget.value)}
            data-feld="betreiber"
          />
          <TextInput
            label="Hosting"
            description={`Vorgabe: ${HOSTING_VORGABE}`}
            value={f.hosting}
            onChange={(e) => setze('hosting', e.currentTarget.value)}
            data-feld="hosting"
          />
          <Textarea
            label="Aufsichtsbehörde"
            description="Vorgabe für Niedersachsen; leer = Vorgabe."
            autosize
            minRows={2}
            value={f.aufsicht}
            placeholder={AUFSICHT_NIEDERSACHSEN}
            onChange={(e) => setze('aufsicht', e.currentTarget.value)}
            data-feld="aufsicht"
          />
          <Textarea
            label="Weitere Hinweise (optional)"
            description="Erscheint als eigener Abschnitt in Datenschutzerklärung und Impressum, z. B. Schulträger oder Konferenzbeschluss."
            autosize
            minRows={2}
            value={f.freitext}
            onChange={(e) => setze('freitext', e.currentTarget.value)}
            data-feld="freitext"
          />
          <div>
            <Text size="sm" fw={600} mb={4}>
              Empfänger laut Einrichtung (freigegebene Zugänge der Schule)
            </Text>
            {d.empfaenger.length ? (
              <Table fz="sm" verticalSpacing={4} data-empfaenger-vorschau>
                <Table.Tbody>
                  {d.empfaenger.map((e) => (
                    <Table.Tr key={e.id}>
                      <Table.Td>{e.name}</Table.Td>
                      <Table.Td c="dimmed">{e.ort}</Table.Td>
                      <Table.Td>
                        {e.drittland === true ? (
                          <Badge size="xs" color="orange" variant="light">
                            Drittland
                          </Badge>
                        ) : e.drittland === null ? (
                          <Badge size="xs" color="gray" variant="light">
                            je nach Einrichtung
                          </Badge>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed">
                Kein KI-, Sprach- oder Bilddienst für alle freigegeben.
              </Text>
            )}
            <Text size="xs" c="dimmed" mt={4}>
              Dazu immer: Hosting, {d.iserv ? 'IServ (Anmeldung), ' : ''}OpenAI für das Sprechtraining, Push-Dienste der Browser (nur nach Einschalten).
            </Text>
          </div>
          <Checkbox
            checked={f.geprueft}
            onChange={(e) => setze('geprueft', e.currentTarget.checked)}
            label="Die gelb markierten Stellen („Von der Schule zu prüfen“) sind geprüft – Hinweise auf den Seiten ausblenden"
            data-feld="geprueft"
          />
          <Group justify="flex-end">
            <Button loading={speichert} onClick={() => void speichern()} data-datenschutz-speichern>
              Speichern
            </Button>
          </Group>
        </Stack>
      )}
    </KlappKarte>
  )
}
