/**
 * Reiter „KI-Zugänge" der Verwaltung (09.10.2026, Auftrag des Admins) – vorher `Schluessel` in
 * VerwaltungModule.tsx.
 *
 *  - Je Anbieter eine aufklappbare Karte (zu Beginn zugeklappt); der Kopf zeigt den Stand:
 *    „eingerichtet · für alle · Modell X · 3 Lehrkräfte".
 *  - Neu: OpenAI-kompatible Anbieter (Mistral, Azure, IONOS, STACKIT, Gemini, OpenRouter, eigener
 *    Endpunkt) mit Adresse, Azure-Version und Vorgabemodell; Verbindungstest NUR auf Knopfdruck.
 *  - Darunter die KI-Nutzung der Lehrkräfte über die Schlüssel der Schule (KiNutzung.tsx).
 *
 * Abos (ChatGPT, Claude) sind bewusst NICHT teilbar (Nutzungsbedingungen).
 */
import { Alert, Badge, Button, Card, Collapse, Group, Loader, PasswordInput, Stack, Switch, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconKey, IconMapPin, IconPlugConnected } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { istKompatibel, kompatibelVorgabe, type KompatibelEinstellung } from '@shared/kiAnbieter'
import { AI_PROVIDERS } from '@shared/types'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import KiNutzung, { type KiNutzungDaten } from './KiNutzung'

export interface SchluesselEintrag {
  name: string
  hinterlegt: string
  fuerAlle: boolean
}

interface KiZugaengeDaten {
  endpunkte: Record<string, KompatibelEinstellung>
  nutzung: KiNutzungDaten
}

const DIENSTE: Record<string, string> = {
  elevenlabs: 'ElevenLabs (Hörtexte)',
  pixabay: 'Pixabay (Bilder)'
}

export const anbieterName = (id: string): string => AI_PROVIDERS.find((p) => p.id === id)?.label ?? DIENSTE[id] ?? id

/** Kopfzeile einer Anbieterkarte: „eingerichtet · für alle · Modell X · 3 Lehrkräfte" */
export function standZeile(s: SchluesselEintrag, endpunkt: KompatibelEinstellung | undefined, lehrkraefte: number | undefined): string {
  if (!s.hinterlegt) return 'nicht eingerichtet'
  const teile = ['eingerichtet', s.fuerAlle ? 'für alle' : 'nicht freigegeben']
  const modell = endpunkt?.modell?.trim() || (istKompatibel(s.name) ? kompatibelVorgabe(s.name)?.modelle[0] : '')
  if (modell) teile.push(`Modell ${modell}`)
  if (lehrkraefte !== undefined) teile.push(`${lehrkraefte} ${lehrkraefte === 1 ? 'Lehrkraft' : 'Lehrkräfte'}`)
  return teile.join(' · ')
}

function AnbieterKarte({
  s,
  endpunkt,
  lehrkraefte,
  speichern,
  endpunktSpeichern
}: {
  s: SchluesselEintrag
  endpunkt?: KompatibelEinstellung
  lehrkraefte?: number
  speichern: (name: string, patch: object, danach?: () => void) => void
  endpunktSpeichern: (name: string, e: KompatibelEinstellung) => void
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [wert, setWert] = useState('')
  const [adresse, setAdresse] = useState(endpunkt?.basisUrl ?? '')
  const [version, setVersion] = useState(endpunkt?.apiVersion ?? '')
  const [modell, setModell] = useState(endpunkt?.modell ?? '')
  const [testet, setTestet] = useState(false)
  useEffect(() => {
    setAdresse(endpunkt?.basisUrl ?? '')
    setVersion(endpunkt?.apiVersion ?? '')
    setModell(endpunkt?.modell ?? '')
  }, [endpunkt])
  const vorgabe = istKompatibel(s.name) ? kompatibelVorgabe(s.name) : undefined
  const ki = AI_PROVIDERS.some((p) => p.id === s.name)
  const geaendert = (endpunkt?.basisUrl ?? '') !== adresse.trim() || (endpunkt?.apiVersion ?? '') !== version.trim() || (endpunkt?.modell ?? '') !== modell.trim()
  const testen = async (): Promise<void> => {
    setTestet(true)
    try {
      const r = await senden<{ ok: boolean; fehler?: string; modell?: string; sekunden?: number }>('/server/verwaltung/ki-test', { name: s.name })
      if (r.ok) notifySuccess(`Verbindung steht (${r.modell}, ${String(r.sekunden).replace('.', ',')} s).`)
      else notifyError(r.fehler ?? 'Unbekannter Fehler', 'Keine Verbindung')
    } catch (e) {
      notifyError(e)
    } finally {
      setTestet(false)
    }
  }
  const stand = standZeile(s, endpunkt, ki ? (lehrkraefte ?? 0) : undefined)
  return (
    <Card withBorder padding="sm" data-anbieter={s.name}>
      <UnstyledButton onClick={() => setOffen((o) => !o)} aria-expanded={offen} w="100%">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {offen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            <Text fw={700}>{anbieterName(s.name)}</Text>
            {vorgabe?.empfohlen && (
              <Badge size="xs" color="teal" variant="light">
                EU/DE
              </Badge>
            )}
          </Group>
          <Group gap={6} wrap="nowrap">
            <Badge color={s.hinterlegt ? (s.fuerAlle ? 'green' : 'yellow') : 'gray'} variant="light" size="sm">
              {s.hinterlegt ? (s.fuerAlle ? 'aktiv' : 'gesperrt') : 'leer'}
            </Badge>
            <Text size="xs" c="dimmed" visibleFrom="sm">
              {stand}
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
      <Collapse expanded={offen}>
        <Stack gap="sm" mt="sm">
          <Text size="xs" c="dimmed" hiddenFrom="sm">
            {stand}
          </Text>
          {vorgabe && (
            <Alert variant="light" color={vorgabe.empfohlen ? 'teal' : 'yellow'} icon={<IconMapPin size={16} />} p="xs">
              <Text size="sm">{vorgabe.datenort}.</Text>
            </Alert>
          )}
          <Group align="end">
            <PasswordInput
              style={{ flex: 1 }}
              leftSection={<IconKey size={14} />}
              label={s.hinterlegt ? `Schlüssel hinterlegt (${s.hinterlegt})` : 'Schlüssel'}
              placeholder={s.hinterlegt ? 'neuen Schlüssel eintragen' : vorgabe?.keyPlaceholder || 'Schlüssel eintragen'}
              value={wert}
              onChange={(e) => setWert(e.currentTarget.value)}
            />
            <Button disabled={!wert.trim()} onClick={() => speichern(s.name, { wert }, () => setWert(''))}>
              Speichern
            </Button>
          </Group>
          {vorgabe && (
            <>
              <TextInput
                label="Adresse (Basis-URL)"
                description={vorgabe.basisUrl ? `Leer lassen für ${vorgabe.basisUrl}` : 'Pflichtfeld, nur https.'}
                placeholder={vorgabe.basisUrl || vorgabe.basisUrlBeispiel}
                value={adresse}
                onChange={(e) => setAdresse(e.currentTarget.value)}
              />
              {vorgabe.azure && (
                <TextInput
                  label="API-Version (nur ältere Ressourcen)"
                  description="Leer lassen für die v1-Schnittstelle."
                  value={version}
                  onChange={(e) => setVersion(e.currentTarget.value)}
                />
              )}
              <TextInput
                label={vorgabe.azure ? 'Bereitstellung (Deployment) für alle' : 'Vorgabemodell für alle'}
                description="Gilt für Lehrkräfte, die kein eigenes Modell gewählt haben."
                placeholder={vorgabe.modelle[0] ?? 'Modell-ID'}
                value={modell}
                onChange={(e) => setModell(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button variant="light" disabled={!geaendert} onClick={() => endpunktSpeichern(s.name, { basisUrl: adresse, apiVersion: version, modell })}>
                  Adresse und Modell speichern
                </Button>
              </Group>
            </>
          )}
          <Group justify="space-between">
            <Switch
              label="Für alle Lehrkräfte freigeben"
              checked={s.fuerAlle}
              disabled={!s.hinterlegt}
              onChange={(e) => speichern(s.name, { fuerAlle: e.currentTarget.checked })}
            />
            <Group gap="xs">
              {ki && s.hinterlegt && (
                <Button size="xs" variant="default" leftSection={<IconPlugConnected size={14} />} loading={testet} onClick={() => void testen()}>
                  Verbindung testen
                </Button>
              )}
              {s.hinterlegt && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => window.confirm('Schlüssel entfernen?') && speichern(s.name, { wert: '', fuerAlle: false })}
                >
                  Entfernen
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      </Collapse>
    </Card>
  )
}

export function KiZugaenge({ schluessel, neu }: { schluessel: SchluesselEintrag[]; neu: () => void }): React.JSX.Element {
  const [daten, setDaten] = useState<KiZugaengeDaten | null>(null)
  const laden = useCallback(() => {
    void holen<KiZugaengeDaten>('/server/verwaltung/ki-zugaenge')
      .then(setDaten)
      .catch((e: unknown) => notifyError(e))
  }, [])
  useEffect(() => laden(), [laden, schluessel])
  const speichern = (name: string, patch: object, danach?: () => void): void =>
    void senden('/server/verwaltung/schluessel', { name, ...patch }).then(
      () => {
        notifySuccess('Gespeichert.')
        danach?.()
        neu()
      },
      (e: unknown) => notifyError(e)
    )
  const endpunktSpeichern = (name: string, e: KompatibelEinstellung): void =>
    void senden('/server/verwaltung/ki-endpunkt', { name, ...e }).then(
      () => {
        notifySuccess('Gespeichert.')
        laden()
      },
      (err: unknown) => notifyError(err)
    )
  const ki = schluessel.filter((s) => AI_PROVIDERS.some((p) => p.id === s.name))
  const kern = ki.filter((s) => !istKompatibel(s.name))
  const weitere = ki.filter((s) => istKompatibel(s.name))
  const dienste = schluessel.filter((s) => !AI_PROVIDERS.some((p) => p.id === s.name))
  const karte = (s: SchluesselEintrag): React.JSX.Element => (
    <AnbieterKarte
      key={s.name}
      s={s}
      endpunkt={daten?.endpunkte[s.name]}
      lehrkraefte={daten?.nutzung.jeAnbieter[s.name]?.lehrkraefte}
      speichern={speichern}
      endpunktSpeichern={endpunktSpeichern}
    />
  )
  return (
    <Stack>
      <Alert variant="light">
        Freigegebene API-Schlüssel nutzen alle Lehrkräfte, die keinen eigenen hinterlegt haben – die Kosten trägt das Konto des Schlüssels. Schlüssel liegen
        verschlüsselt auf dem Server und werden nie wieder angezeigt. Klarnamen werden vor jeder KI-Anfrage ersetzt, gleich welcher Anbieter. ChatGPT-/Claude-Abos
        sind nicht teilbar (Nutzungsbedingungen): Jede Lehrkraft meldet ihr eigenes in den Einstellungen an. Hinweise zu Datenort und Eignung der Anbieter:
        Recherche vom 09.10.2026 (Mistral, Azure mit EU-Datenzone, IONOS und STACKIT sind für Schulen am besten geeignet).
      </Alert>
      <Title order={5}>KI für Texte</Title>
      <Stack gap="xs">{kern.map(karte)}</Stack>
      <Title order={5}>Weitere Anbieter (OpenAI-kompatibel)</Title>
      <Stack gap="xs">{weitere.map(karte)}</Stack>
      <Title order={5}>Weitere Dienste</Title>
      <Stack gap="xs">{dienste.map(karte)}</Stack>
      <Title order={4} mt="md">
        KI-Nutzung der Lehrkräfte
      </Title>
      {daten ? <KiNutzung daten={daten.nutzung} anbieterName={anbieterName} /> : <Loader size="sm" />}
    </Stack>
  )
}
